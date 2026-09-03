/**
 * La subida: del plan a las llamadas MCP, y de ahí a la ref y al registro.
 *
 * Dos propiedades que no son negociables:
 * - La ref se mueve SOLO si todo terminó. Con fallos parciales se queda donde estaba, así
 *   que el siguiente `/sync` vuelve a calcular el plan ENTERO contra esa misma ref sin
 *   mover —no solo lo que falló— y lo reenvía completo, incluidas las operaciones que la
 *   vez anterior SÍ funcionaron. Eso NO es «idempotente por construcción»: es seguro
 *   únicamente si escribir/borrar dos veces la misma ruta en CloudStudio no tiene efecto
 *   observable la segunda vez. Esta función no lo garantiza ni lo comprueba, solo lo
 *   asume del servidor.
 * - La rama activa del servidor se restaura al terminar (incluso si falló al posicionar
 *   la rama de trabajo, antes de tocar un solo fichero): `switch` le mueve el suelo a
 *   quien tenga Studio abierto en el navegador.
 */
import { appendFileSync, mkdirSync, readFileSync, statSync, existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type { CloudStudioPort } from "../core/ports.js";
import type { PoliticaDeAprobacion } from "../core/cloudstudio.js";
import { planDeSubida } from "../core/planDeSubida.js";
import { NOMBRE_CARPETA } from "./configEnDisco.js";
import { cambiosPendientes, marcarSubido } from "./gitSync.js";
import { rutaSyncJson } from "./descarga.js";

export interface OpcionesDeSubida {
  puerto: CloudStudioPort;
  raiz: string;
  ramaOrigen: string;
  ramaTrabajo: string;
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

export interface InformeDeSubida {
  ok: string[];
  fallos: Array<{ ruta: string; motivo: string }>;
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

function descargadosDe(raiz: string): Set<string> {
  const ruta = rutaSyncJson(raiz);
  if (!existsSync(ruta)) return new Set();
  try {
    const estado = JSON.parse(readFileSync(ruta, "utf8")) as { descargados?: string[] };
    return new Set(estado.descargados ?? []);
  } catch {
    // Sin manifiesto legible no se puede afirmar qué se bajó, y sin eso el candado no
    // existe: mejor un conjunto vacío (que prohíbe TODO borrado) que uno inventado.
    return new Set();
  }
}

export async function subir(opciones: OpcionesDeSubida): Promise<InformeDeSubida> {
  const { puerto, raiz, ramaOrigen, ramaTrabajo, proyecto, politicaDeAprobacion, informar = () => {} } = opciones;

  const cambios = await cambiosPendientes(raiz, ramaOrigen);
  const tamanos = new Map<string, number>();
  for (const cambio of cambios) {
    const ruta = join(raiz, cambio.ruta);
    if (existsSync(ruta)) tamanos.set(cambio.ruta, statSync(ruta).size);
  }

  const plan = planDeSubida({
    cambios,
    descargados: descargadosDe(raiz),
    tamanos,
    fuentesXne: fuentesXne(raiz),
  });

  const informe: InformeDeSubida = { ok: [], fallos: [] };

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
      rama: ramaTrabajo,
      ok: informe.ok,
      fallos: informe.fallos,
      ...(error === undefined ? {} : { error }),
    });
    const log = rutaSyncLog(raiz);
    mkdirSync(dirname(log), { recursive: true });
    appendFileSync(log, `${linea}\n`);
  };

  if (plan.length === 0) {
    informar("no hay nada que subir\n");
    registrar();
    return informe;
  }

  // La política decide ANTES de tocar el puerto: ni `abrir` ni `contexto` ni una sola
  // escritura corren sin su autorización. Que no autorice deja el disco, el puerto y la
  // ref exactamente como estaban — sea cual sea la política que haya detrás.
  if (!(await politicaDeAprobacion(plan))) {
    informar("subida cancelada: no se ha aplicado nada\n");
    registrar();
    return informe;
  }

  await puerto.abrir(proyecto.nombre);
  const antes = await puerto.contexto();
  try {
    try {
      if (!(await puerto.ramas()).includes(ramaTrabajo)) {
        // Perezosa: crear la rama en el alta le ensucia el Studio a quien no sube nada.
        await puerto.crearRama(ramaTrabajo, ramaOrigen);
      }
      await puerto.cambiarRama(ramaTrabajo);

      for (const operacion of plan) {
        try {
          if (operacion.tipo === "borrado") await puerto.borrarTexto(operacion.ruta);
          else if (operacion.tipo === "texto") {
            await puerto.escribirTexto(operacion.ruta, readFileSync(join(raiz, operacion.ruta), "utf8"));
          } else {
            await puerto.subirBinario(operacion.ruta, readFileSync(join(raiz, operacion.ruta)));
          }
          informe.ok.push(operacion.ruta);
        } catch (error) {
          informe.fallos.push({ ruta: operacion.ruta, motivo: (error as Error).message });
        }
      }
    } finally {
      // La rama que estaba de VERDAD, no la que suponíamos: por eso se lee `contexto`
      // antes. Este `finally` corre TAMBIÉN si `crearRama`/`cambiarRama` revientan antes
      // de llegar al plan — es precisamente el camino para el que existe: un fallo
      // posicionando la rama no puede dejar el suelo movido bajo quien tenga Studio
      // abierto en el navegador.
      await puerto.cambiarRama(antes.rama);
    }
  } catch (error) {
    // No se pudo ni intentar el plan (crear/cambiar de rama falló): se registra el
    // intento —es la clase de fallo, de red o servidor, para la que existe el log— y
    // se relanza, porque a diferencia de un fichero suelto que falla, aquí no hay
    // informe de fallos por ruta que devolver: la sesión de subida ni llegó a empezar.
    registrar((error as Error).message);
    throw error;
  }

  if (informe.fallos.length === 0) {
    await marcarSubido(raiz, ramaOrigen, `sync: ${informe.ok.length} ficheros a ${ramaTrabajo}`);
  } else {
    // La ref no se mueve: el siguiente `/sync` recalcula el plan entero desde ahí y lo
    // reenvía completo, incluido lo que sí subió esta vez (ver la nota de cabecera).
    informar(`${informe.fallos.length} ficheros no subieron; la ref no se mueve y el próximo /sync reintenta\n`);
  }

  registrar();
  return informe;
}
