/**
 * La subida: del plan a las llamadas MCP, y de ahí a la ref y al registro.
 *
 * **Una sola rama**: se sube a la MISMA rama de la que se bajó el proyecto (`config.rama`).
 * Hubo una rama de trabajo (`xonecode/<origen>`) para no escribir en la rama que el cliente
 * tuviera abierta en Studio, y el precio era que lo subido vivía en un sitio que nadie mira
 * mientras la rama del proyecto se quedaba quieta. Se sigue creando la rama si no existe
 * —un proyecto cuyo `config.rama` nombra una rama que aún no está en el servidor—, pero con
 * su propio nombre.
 *
 * Tres propiedades que no son negociables:
 * - La ref se mueve SOLO por lo que se autorizó Y se subió COMPROBADO: con todo bien, a HEAD;
 *   con una selección o con fallos, con `marcarSubidoParcial` y solo por `ok`. Lo que falló
 *   —también lo que llegó distinto a Studio o no se pudo releer— no avanza, y el siguiente
 *   `/sync` lo vuelve a intentar. Reintentar es seguro únicamente si escribir dos veces la
 *   misma ruta en CloudStudio no tiene efecto observable la segunda vez; esta función no lo
 *   garantiza, lo asume del servidor.
 * - Nada se da por subido sin COMPROBARLO: hay ficheros que se cortan al subirlos y la causa
 *   no se ha encontrado. Cada texto se RELEE y se compara exacto (`core/verificacionDeSubida.ts`);
 *   un binario NO se verifica: Studio no deja releerlo (`studio_get_file` solo sirve texto), y
 *   el modo troceado con hash del servidor está pendiente del lado de CloudStudio.
 *   Y antes de tocar un fichero se mira que Studio esté de verdad en la rama del proyecto: si
 *   dice otra, no se sube nada; si no se puede leer, se sube con un AVISO (`avisoDeRama`).
 * - La rama activa del servidor se restaura al terminar (incluso si falló al posicionar
 *   la rama, antes de tocar un solo fichero): `switch` le mueve el suelo a quien tenga
 *   Studio abierto en el navegador. Salvo que no se haya podido LEER cuál era —medido:
 *   `studio_get_context` revienta en el servidor para algunos proyectos—, y entonces no
 *   se restaura y se dice: es una cortesía, no una condición de corrección, y tumbar la
 *   subida entera por ella sería pagar el precio más caro por el detalle más barato.
 */
import { appendFileSync, mkdirSync, readFileSync, statSync, existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type { CloudStudioPort } from "../../core/ports.js";
import type { EstadoDeSync, OperacionOmitida, PoliticaDeAprobacion } from "../../core/cloudstudio.js";
import { planAutorizado } from "../../core/cloudstudio.js";
import { planDeSubida } from "../../core/planDeSubida.js";
import { diferenciaDeTexto, motivoSinComprobar } from "../../core/verificacionDeSubida.js";
import { NOMBRE_CARPETA } from "../config/configEnDisco.js";
import { cambiosPendientes, marcarSubido, marcarSubidoParcial } from "../sesiones/gitSync.js";
import { rutaSyncJson } from "./descarga.js";
import { ramaActiva } from "./ramaActiva.js";
import { validarTrasDescarga, type FicheroIlegible } from "./validarTrasDescarga.js";

export interface OpcionesDeSubida {
  puerto: CloudStudioPort;
  raiz: string;
  /**
   * La rama del proyecto: de la que se bajó y a la que se sube. El nombre sigue diciendo
   * «origen» porque es el origen de la descarga, y es el término que usan `descargar` y
   * `planDeSubida` para la misma rama — renombrarlo en un solo sitio dejaría dos nombres
   * para una cosa.
   */
  ramaOrigen: string;
  proyecto: { id: string; nombre: string };
  /**
   * El hueco de política (`core/cloudstudio.ts#PoliticaDeAprobacion`), OBLIGATORIO —
   * fail-closed por TIPO, no por convención: no hay forma de llamar a `subir()` sin decir
   * quién autoriza, en vez de confiar en que cada llamador se acuerde. Se invoca con el
   * plan YA CONSTRUIDO (`planDeSubida`), ANTES de tocar el puerto: quien autorice ve
   * exactamente lo que se va a escribir, ni más ni menos. Cualquier resultado que no sea
   * autorización deja todo como estaba: nada se escribe, la ref no se mueve.
   */
  politicaDeAprobacion: PoliticaDeAprobacion;
  informar?: (texto: string) => void;
}

/** El aviso cuando la rama activa de Studio no se pudo leer justo antes de subir. */
export const AVISO_RAMA_SIN_CONFIRMAR = "no se pudo confirmar la rama activa de Studio antes de subir";

export interface FalloDeSubida {
  ruta: string;
  motivo: string;
  /** Solo cuando el texto llegó DISTINTO: los dos hashes, para mirarlo después en `sync.log`. */
  sha256Local?: string;
  sha256Studio?: string;
}

export interface InformeDeSubida {
  /** Lo subido Y comprobado. */
  ok: string[];
  fallos: FalloDeSubida[];
  /**
   * Presente = la rama activa de Studio NO se pudo leer tras posicionarla (la tool se cae para
   * algunos proyectos), y se subió igual. No es un fallo: es lo que no se pudo confirmar, y se
   * dice para que no pase en silencio.
   */
  avisoDeRama?: string;
  /**
   * Lo que NO se puede sincronizar, con el porqué (`core/planDeSubida.ts`). No son
   * fallos: no bloquean la ref. Son el camino de escape para que una operación imposible
   * —el borrado de un binario, un fichero de más de 5 MB— no atasque la subida entera.
   */
  omitidas: OperacionOmitida[];
  /**
   * Los ficheros que NEGARON la subida entera por no poderse leer (`validarTrasDescarga`).
   * Presente = no se ha escrito nada en Studio ni se ha pedido autorización.
   */
  ilegibles?: FicheroIlegible[];
}

/**
 * El motivo de un fallo, apto para el diálogo y `sync.log`. Un error de Node (`readFileSync`
 * de un fichero que desapareció o no se deja leer) lleva la ruta ABSOLUTA en el mensaje, y una
 * ruta de la máquina no viaja: de él solo su `code`. Un error del servidor sí se dice entero.
 */
function motivoDeFallo(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code === "string") return `no se pudo leer el fichero en local (${code})`;
  return error instanceof Error ? error.message : String(error);
}

export function rutaSyncLog(raiz: string): string {
  return join(raiz, NOMBRE_CARPETA, "cloudstudio", "sync.log");
}

/** Los `.xne` presentes en local: con ellos se reconocen las vistas aplanadas. */
function fuentesXne(raiz: string): Set<string> {
  const salida = new Set<string>();
  const recorrer = (dir: string, prefijo: string): void => {
    for (const entrada of readdirSync(dir, { withFileTypes: true })) {
      if (entrada.name === ".git" || entrada.name === NOMBRE_CARPETA) continue;
      const relativa = prefijo === "" ? entrada.name : `${prefijo}/${entrada.name}`;
      if (entrada.isDirectory()) recorrer(join(dir, entrada.name), relativa);
      else if (entrada.name.endsWith(".xne")) salida.add(relativa);
    }
  };
  recorrer(raiz, "");
  return salida;
}

/**
 * Lo que la descarga trajo DE VERDAD, según `sync.json` — **y solo si ese `sync.json` es
 * de ESTE proyecto y de ESTA rama**.
 *
 * `descargados` es la única pata del candado de borrado que puede MENTIR: el manifiesto y
 * el diff se calculan en el momento, pero esto es un fichero en disco que sobrevive a
 * cambios de configuración. Un `/connect-studio` a otro proyecto, o un cambio de rama
 * origen, deja el `sync.json` de la descarga ANTERIOR ahí quieto; sus rutas afirmarían
 * «esto lo bajamos» sobre un proyecto en el que nunca entramos, y con eso el candado
 * autorizaría borrados en el Studio del cliente equivocado.
 *
 * `EstadoDeSync` ya guarda proyecto y rama: se comparan, y si no casan se cae a conjunto
 * vacío —que prohíbe TODO borrado— en vez de a uno inventado. Fail-closed, como el resto.
 *
 * De ahí salen también los `ilegibles` de la bajada, con la MISMA comprobación de identidad: son
 * solo RUTAS que mirar, porque lo que decide es el disco de ahora (ver `subir`).
 */
function bajadaDe(
  raiz: string,
  proyecto: { id: string; nombre: string },
  rama: string,
  informar: (texto: string) => void
): { descargados: Set<string>; ilegibles: string[] } {
  const nada = { descargados: new Set<string>(), ilegibles: [] };
  const ruta = rutaSyncJson(raiz);
  if (!existsSync(ruta)) return nada;
  try {
    const estado = JSON.parse(readFileSync(ruta, "utf8")) as Partial<EstadoDeSync>;
    if (estado.proyecto?.id !== proyecto.id || estado.rama !== rama) {
      informar(
        "el sync.json en disco no es de este proyecto/rama: no se borrará nada en Studio " +
          "hasta que vuelvas a bajar con /sync bajar\n"
      );
      return nada;
    }
    return {
      descargados: new Set(estado.descargados ?? []),
      ilegibles: (estado.ilegibles ?? []).map((f) => f.ruta).filter((r) => typeof r === "string"),
    };
  } catch {
    // Sin manifiesto legible no se puede afirmar qué se bajó, y sin eso el candado no
    // existe: mejor un conjunto vacío (que prohíbe TODO borrado) que uno inventado.
    return nada;
  }
}

export async function subir(opciones: OpcionesDeSubida): Promise<InformeDeSubida> {
  const { puerto, raiz, ramaOrigen, proyecto, politicaDeAprobacion, informar = () => {} } = opciones;

  const cambios = await cambiosPendientes(raiz, ramaOrigen);
  const tamanos = new Map<string, number>();
  for (const cambio of cambios) {
    const ruta = join(raiz, cambio.ruta);
    if (existsSync(ruta)) tamanos.set(cambio.ruta, statSync(ruta).size);
  }

  const bajada = bajadaDe(raiz, proyecto, ramaOrigen, informar);
  const { operaciones: plan, omitidas } = planDeSubida({
    cambios,
    descargados: bajada.descargados,
    tamanos,
    fuentesXne: fuentesXne(raiz),
  });

  const informe: InformeDeSubida = { ok: [], fallos: [], omitidas };

  // El log es «una línea por OPERACIÓN de sync» (criterio de aceptación), no una línea
  // por fichero movido: un `/sync` sin nada pendiente también es una operación y queda
  // registrado, o el JSONL mentiría por omisión sobre cuántas veces se sincronizó.
  // `error` es el fallo ESTRUCTURAL (posicionar la rama, abrir el proyecto) que impide
  // intentar el plan siquiera — el otro camino, un fichero suelto que falla, ya vive en
  // `fallos` y no necesita este campo.
  const registrar = (error?: string): void => {
    const linea = JSON.stringify({
      fecha: new Date().toISOString(),
      dir: "subida",
      proyecto: proyecto.nombre,
      rama: ramaOrigen,
      ok: informe.ok,
      fallos: informe.fallos,
      ...(informe.avisoDeRama === undefined ? {} : { avisoDeRama: informe.avisoDeRama }),
      // Lo IMPOSIBLE queda por escrito igual que lo fallido: el usuario tiene que poder
      // volver mañana y saber qué se quedó sin subir y por qué, no solo verlo pasar.
      omitidas: informe.omitidas,
      ...(error === undefined ? {} : { error }),
    });
    const log = rutaSyncLog(raiz);
    mkdirSync(dirname(log), { recursive: true });
    appendFileSync(log, `${linea}\n`);
  };

  // Las omisiones se dicen SIEMPRE, y antes de pedir autorización: quien autoriza tiene
  // que ver también lo que NO se va a hacer. Y se dicen aunque el plan quede vacío, que
  // es justo el caso en que callarlas haría creer que no había nada pendiente.
  for (const omitida of omitidas) informar(`no se sube «${omitida.ruta}»: ${omitida.motivo}\n`);

  if (plan.length === 0) {
    if (omitidas.length === 0) informar("no hay nada que subir\n");
    // La ref NO se mueve aquí: no se ha escrito nada en CloudStudio, y una ref que dice
    // «esto ya está arriba» sin haber subido nada es exactamente la clase de mentira que
    // se corrige en otra parte de esta misma ola. Lo omitido se vuelve a declarar en cada
    // `/sync` mientras siga en el diff, que es la verdad: sigue sin sincronizar. Cuando
    // haya OTRAS operaciones, la ref avanzará con ellas y arrastrará también lo omitido
    // —por eso queda además escrito en `sync.log`, que sí sobrevive al turno—.
    registrar();
    return informe;
  }

  // Una copia que no se puede leer NO se sube (IXCODE-16): subir un `app.xml` guardado como
  // cadena JSON lo deja roto TAMBIÉN en Studio, para todo el que lo baje. Se revalida en el
  // DISCO de ahora —lo que se va a escribir más lo que la bajada dejó marcado—, no se cree el
  // `sync.json`: una copia reparada a mano sube sin tener que volver a bajarla. Y antes de la
  // política: no se pide autorizar algo que de todos modos se va a negar.
  const aMirar = [...new Set([...plan.filter((o) => o.tipo === "texto").map((o) => o.ruta), ...bajada.ilegibles])]
    .filter((r) => existsSync(join(raiz, r)));
  const ilegibles = validarTrasDescarga(raiz, aMirar);
  if (ilegibles.length > 0) {
    informar(
      `subida negada: ${ilegibles.length} ficheros no se pueden leer y romperían el proyecto en Studio. ` +
        "Repáralos (o vuelve a bajar con /sync bajar) y sube de nuevo:\n" +
        ilegibles.map((f) => `  ${f.ruta}: ${f.motivo}\n`).join("")
    );
    informe.ilegibles = ilegibles;
    registrar(`subida negada: ${ilegibles.length} ficheros ilegibles`);
    return informe;
  }

  // La política decide ANTES de tocar el puerto: ni `abrir` ni `contexto` ni una sola
  // escritura corren sin su autorización. Que no autorice deja el disco, el puerto y la
  // ref exactamente como estaban — sea cual sea la política que haya detrás.
  //
  // Lo que se ejecuta lo dice `planAutorizado`, nunca la veracidad de la respuesta: una
  // selección vacía es un objeto —«verdadero»— y aun así no autoriza nada.
  const autorizado = planAutorizado(plan, await politicaDeAprobacion(plan));
  if (autorizado.length === 0) {
    informar("subida cancelada: no se ha aplicado nada\n");
    registrar();
    return informe;
  }
  const parcial = autorizado.length < plan.length;

  await puerto.abrir(proyecto.nombre);
  // `undefined` = no se pudo leer (`ramaActiva.ts`). Aquí el posicionamiento ya era
  // incondicional, así que lo único que depende de esta lectura es la restauración del
  // `finally`; su fallo no tiene por qué impedir subir, y quedarse mudo sí sería mentir.
  const antes = await ramaActiva(puerto, ramaOrigen, informar);
  try {
    try {
      // Posicionarse en la rama del PROYECTO. Aquí hubo un `crearRama` perezoso para la
      // rama de trabajo —que no existía hasta la primera subida—, y sin rama de trabajo no
      // tiene qué crear: `config.rama` salió de la lista de ramas del servidor en el alta,
      // así que existir existe. Si alguien la borró en Studio desde entonces, el `switch`
      // falla, queda en `sync.log` y se relanza: inventarse una rama desde sí misma no
      // arreglaría nada y firmaría un linaje falso.
      await puerto.cambiarRama(ramaOrigen);

      // Y COMPROBAR que el `switch` surtió efecto antes de tocar un solo fichero: un `switch`
      // que contesta bien no prueba en qué rama acaba escribiendo `studio_edit_file`. Si Studio
      // dice OTRA rama, no se sube nada (error estructural, el camino de hoy: `sync.log` y el
      // `finally` restaura). Si no se puede leer —la tool se cae en algunos proyectos, y una
      // rama vacía es «el servidor no la dijo», no «está en la rama ''»—, se sube con AVISO:
      // tumbar toda subida de esos proyectos por una lectura rota sería peor que decirlo.
      let activa: string | undefined;
      try {
        activa = (await puerto.contexto()).rama;
      } catch {
        activa = undefined;
      }
      if (activa === undefined || activa === "") {
        informe.avisoDeRama = AVISO_RAMA_SIN_CONFIRMAR;
        informar(`aviso: ${AVISO_RAMA_SIN_CONFIRMAR}\n`);
      } else if (activa !== ramaOrigen) {
        throw new Error(`Studio está en la rama «${activa}» y el proyecto es de la rama «${ramaOrigen}»: no se ha subido nada`);
      }

      for (const operacion of autorizado) {
        try {
          if (operacion.tipo === "borrado") await puerto.borrarTexto(operacion.ruta);
          else if (operacion.tipo === "texto") {
            const contenido = readFileSync(join(raiz, operacion.ruta), "utf8");
            await puerto.escribirTexto(operacion.ruta, contenido);
            // Releer lo escrito: es la única prueba de que llegó entero. Una relectura que
            // falla NO es un «ok»: el fichero puede estar cortado y no lo sabríamos.
            let enStudio: string;
            try {
              enStudio = await puerto.leerTexto(operacion.ruta);
            } catch (error) {
              throw new Error(motivoSinComprobar((error as Error).message));
            }
            const diferencia = diferenciaDeTexto(contenido, enStudio);
            if (diferencia !== undefined) {
              informe.fallos.push({ ruta: operacion.ruta, ...diferencia });
              informar(`${operacion.ruta}: ${diferencia.motivo}\n`);
              continue;
            }
          } else {
            // Sin verificación: Studio no deja releer un binario (ver la cabecera).
            await puerto.subirBinario(operacion.ruta, readFileSync(join(raiz, operacion.ruta)));
          }
          informe.ok.push(operacion.ruta);
        } catch (error) {
          const motivo = motivoDeFallo(error);
          informe.fallos.push({ ruta: operacion.ruta, motivo });
          // Dicho, no solo contado: el diálogo de la subida enseña las últimas líneas del
          // recorrido, y «fallaron 1» sin el porqué no deja ver un corte.
          informar(`${operacion.ruta}: ${motivo}\n`);
        }
      }
    } finally {
      // La rama que estaba de VERDAD, no la que suponíamos: por eso se lee `contexto`
      // antes. Este `finally` corre TAMBIÉN si `cambiarRama` revienta antes
      // de llegar al plan — es precisamente el camino para el que existe: un fallo
      // posicionando la rama no puede dejar el suelo movido bajo quien tenga Studio
      // abierto en el navegador. Y sin `antes` no hay a dónde volver: adivinar una rama
      // movería ese suelo con más seguridad de la que hay.
      // Una rama VACÍA es «el servidor no la dijo», no una rama a la que volver.
      if (antes !== undefined && antes !== "") await puerto.cambiarRama(antes);
    }
  } catch (error) {
    // No se pudo ni intentar el plan (crear/cambiar de rama falló): se registra el
    // intento —es la clase de fallo, de red o servidor, para la que existe el log— y
    // se relanza, porque a diferencia de un fichero suelto que falla, aquí no hay
    // informe de fallos por ruta que devolver: la sesión de subida ni llegó a empezar.
    registrar((error as Error).message);
    throw error;
  }

  // Si mover la ref revienta, la operación sigue constando en `sync.log`: lo subido YA está en
  // Studio, y perder su rastro sería peor que el error.
  try {
    if (informe.fallos.length === 0 && !parcial) {
      await marcarSubido(raiz, ramaOrigen, `sync: ${informe.ok.length} ficheros a ${ramaOrigen}`);
    } else if (informe.fallos.length === 0 || informe.ok.length > 0) {
      // Solo lo ELEGIDO y COMPROBADO avanza: la ref no puede ir a HEAD, o afirmaría que está arriba lo que
      // la persona dejó sin marcar. Lo omitido tampoco avanza: se sigue declarando.
      await marcarSubidoParcial(
        raiz,
        ramaOrigen,
        informe.ok,
        `sync: ${informe.ok.length} de ${plan.length} ficheros a ${ramaOrigen}`
      );
      // Lo que FALLÓ no avanza: el próximo `/sync` lo vuelve a calcular y a intentar.
      const resto = plan.length - informe.ok.length;
      if (informe.fallos.length > 0) {
        informar(`${informe.fallos.length} ficheros no subieron bien; siguen pendientes y el próximo /sync los reintenta\n`);
      } else {
        informar(
          `subidos ${informe.ok.length} de ${plan.length}; ${resto === 1 ? "el otro sigue" : `los otros ${resto} siguen`} pendiente${resto === 1 ? "" : "s"}\n`
        );
      }
    } else {
      // Nada subió bien: la ref no se mueve y el siguiente `/sync` lo reintenta todo.
      informar(`${informe.fallos.length} ficheros no subieron; la ref no se mueve y el próximo /sync reintenta\n`);
    }
  } catch (error) {
    registrar(`subido, pero no se pudo mover la ref: ${motivoDeFallo(error)}`);
    throw error;
  }

  registrar();
  return informe;
}
