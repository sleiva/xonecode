/**
 * El asistente de cuenta: proveedor y modelo, la primera vez.
 *
 * No hace falta una marca de «primer arranque»: la resolución de modelos ya guarda de
 * dónde salió cada valor. Si `trabajo` resuelve por `omisión`, nadie ha elegido nunca.
 * Un flag aparte sería una segunda fuente de verdad sobre algo que el sistema ya sabe.
 *
 * **Es un LAZO, no una escalera.** Elegir proveedor era irreversible: quien se equivocaba
 * solo podía cancelar el asistente entero y quedarse con el modelo por omisión sin
 * saberlo. Ahora hay dos vueltas atrás y las dos son explícitas:
 * - una opción «volver» al final de la lista de modelos (`ID_VOLVER`), y
 * - el catálogo que FALLA, que devuelve al paso de proveedor con el motivo delante en vez
 *   de dar el paso por bueno.
 *
 * **Listar el catálogo ES la validación de la conexión.** Es una llamada real al proveedor
 * con la credencial recién escrita: si no autoriza, no contesta o no ofrece ningún modelo
 * de conversación, la cuenta NO está resuelta. Antes esos tres casos escribían una línea y
 * seguían adelante con el modelo de omisión — un fallo mudo con forma de aviso. Y como la
 * clave se vuelve a pedir cuando el catálogo de ese proveedor ya falló una vez en esta
 * llamada, una clave mal tecleada se corrige sin salir del asistente: `hayCredencial`
 * diría que sí (está en disco desde el intento anterior) y no volvería a preguntarla.
 *
 * **Quién puede cancelar lo decide quien llama** (`exigirEleccion`). En el terminal
 * cancelar sigue significando cancelar: se sigue con el modelo por omisión, que es una
 * consola perfectamente usable (Ollama local). En la consola web el paso de cuenta es una
 * PUERTA —no se entra al dashboard sin cuenta—, así que cancelar vuelve a preguntar con el
 * motivo delante. El único final de ese lazo es que se elija algo o que el humano se vaya,
 * y eso se mira por `consola.eof?.()`: solo se insiste mientras conste que hay alguien al
 * otro lado. Una consola que no implemente `eof` no puede afirmarlo, así que no se insiste
 * — un lazo que no sabe si queda alguien es un lazo que no termina.
 *
 * Ese lazo apoya en una condición que las dos pieles con selector cumplen y que conviene
 * decir en voz alta: **`seleccionar` espera a un humano o vence por plazo**; no resuelve al
 * instante mientras `eof()` diga que hay alguien (`consolaWeb.ts#esperarAUnHumano`, y el
 * modal de la TUI). Una implementación que devolviera `undefined` de inmediato CON alguien
 * conectado convertiría este lazo en una rueda: no se acota con un contador a propósito,
 * porque un tope sería una puerta que se abre sola a la vuelta N — justo lo que este paso
 * existe para impedir.
 */
import { motivoDeClaveInaceptable } from "../core/config.js";
import { PROVEEDORES, PAPELES, SIN_CREDENCIAL, type Proveedor, type Eleccion } from "../core/modelos.js";
import type { Consola } from "./consola.js";

export interface ContextoDelAsistente {
  /**
   * El `origen` con el que resolvió el papel `trabajo` (`Eleccion["origen"]` de
   * `core/modelos.ts`, no una cadena suelta): así un origen mal escrito en el sitio que
   * llama a `asistenteDeModelo` es un error de compilación y no un asistente que nunca
   * se ofrece — el bug mudo que este repo evita en todas partes.
   */
  origenDeTrabajo: Eleccion["origen"];
  /** Proveedores que ya tienen credencial guardada. */
  hayCredencial?: (proveedor: Proveedor) => boolean;
  /**
   * Devuelve la ruta donde quedó, igual que `agent/authEnDisco.ts#guardarCredencial`:
   * si cancelar más adelante (en el paso de MODELO) deja la clave ya escrita, el aviso
   * de cancelación tiene que poder decir, justo antes, QUÉ se guardó y DÓNDE — como ya
   * hace `/provider` (`consola.ts`, «credencial de … guardada en …») — para que ese
   * «cancelado» no dé a entender, en silencio, que no pasó nada.
   */
  guardarCredencial?: (proveedor: Proveedor, clave: string) => { ruta: string };
  /**
   * Pone la clave en el proceso SIN escribirla en disco
   * (`agent/configEnDisco.ts#aplicarCredencialAlProceso`).
   *
   * Es lo que permite PROBARLA antes de guardarla: el catálogo la lee de `process.env`, así
   * que sin esta costura el único orden posible era escribir y después preguntar — y una
   * clave mal tecleada quedaba en `auth.json` para siempre, con el asistente confesando
   * dónde la había dejado. Ausente = no se puede probar antes, y entonces se conserva el
   * orden viejo (escribir y luego listar), que es peor pero no miente: lo dice.
   */
  aplicarCredencial?: (proveedor: Proveedor, clave: string) => void;
  /**
   * `true` = cancelar no sale: se vuelve a preguntar mientras haya alguien conectado. Lo
   * pide la consola web, donde este paso es una puerta y no una comodidad. Omitido
   * (terminal) se conserva el trato de siempre: cancelar cancela.
   */
  exigirEleccion?: boolean;
  /** Un motivo para el PRIMER selector, de quien ya sabe por qué se está preguntando otra
   *  vez (una reconexión a mitad del alta, por ejemplo). */
  aviso?: string;
}

/**
 * Qué pasó, para que quien llama no tenga que adivinarlo mirando el disco.
 *
 * `sin-preguntar` no es un fallo: es que no había nada que preguntar (ya hay elección, o
 * la piel no tiene selector). Quien usa esto como puerta —`web/servidor/arranque.ts`—
 * necesita distinguirlo de `cancelado`, o dejaría fuera para siempre a quien no puede
 * contestar.
 */
export type ResultadoDelAsistente = "elegido" | "cancelado" | "sin-preguntar";

/**
 * La opción «volver» de la lista de modelos. El id lleva una flecha a propósito: tiene que
 * ser imposible de confundir con el id de un modelo del catálogo, que es lo único que
 * comparte lista con ella. Va la ÚLTIMA de la lista, detrás de los modelos de verdad.
 */
export const ID_VOLVER = "←proveedor";

/** Lo que se dice al insistir: por qué se vuelve a preguntar lo mismo. */
const AVISO_HACE_FALTA =
  "hace falta un proveedor con conexión y un modelo elegido para seguir; sin eso no se puede continuar.";

/**
 * Los proveedores sin credencial (hoy, Ollama local) primero: es la omisión del repo
 * («Ollama por omisión, y a propósito», `core/modelos.ts`) y la ruta sin fricción para
 * quien arranca sin ninguna clave a mano. `filter` en vez de un `sort` con aritmética
 * porque es más fácil de leer y el resultado es el mismo.
 */
function proveedoresParaElAsistente(): Proveedor[] {
  return [
    ...PROVEEDORES.filter((p) => SIN_CREDENCIAL.has(p)),
    ...PROVEEDORES.filter((p) => !SIN_CREDENCIAL.has(p)),
  ];
}

function detalleDe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function asistenteDeModelo(
  consola: Consola,
  contexto: ContextoDelAsistente
): Promise<ResultadoDelAsistente> {
  // Ya hay una elección (proyecto, global, bandera o entorno): no se pregunta.
  if (contexto.origenDeTrabajo !== "omision") return "sin-preguntar";
  // Sin TTY no se pregunta NADA: las tuberías y `xonecode run` deben seguir dando una
  // salida byte-idéntica.
  if (!consola.interactivo || consola.seleccionar === undefined) return "sin-preguntar";
  const seleccionar = consola.seleccionar;

  /**
   * Solo se insiste mientras CONSTE que hay alguien: `eof()` ausente no vale como «hay
   * humano», porque entonces el lazo no tendría final. La consola web sí lo implementa
   * (`consolaWeb.ts`: `eof = !transporte.conectado()`), que es donde se pide insistir.
   */
  const insistir = (): boolean => contexto.exigirEleccion === true && consola.eof?.() === false;

  /** Los proveedores cuyo catálogo ya falló en ESTA llamada: a esos se les vuelve a pedir
   *  la clave aunque `hayCredencial` diga que la hay (la hay, si llegó a escribirse). */
  const fallaron = new Set<Proveedor>();
  let aviso = contexto.aviso;

  /**
   * Escribe la credencial y lo DICE. Devuelve `undefined` si no se pudo escribir, con el
   * motivo ya puesto en `aviso` — el caso real es `AuthRotoEnDisco`: un `auth.json` con el
   * JSON estropeado no se sobrescribe. Antes esa excepción subía hasta quien conduce el
   * paso, que en la web deja el paso a medias y ANUNCIA el alta igual.
   */
  const escribirCredencial = (proveedor: Proveedor, clave: string): { ruta: string } | undefined => {
    try {
      const guardada = contexto.guardarCredencial?.(proveedor, clave);
      if (guardada !== undefined) {
        // Se dice en el momento: si el usuario cancela en el paso de MODELO que viene
        // después, el «asistente cancelado» no puede ser la única frase que vea —
        // dejaría creer que no se tocó nada, y la credencial ya está en disco.
        consola.escribir(`credencial de ${proveedor} guardada en ${guardada.ruta}\n`);
      }
      return guardada ?? { ruta: "" };
    } catch (error) {
      aviso = `no se pudo guardar la credencial de ${proveedor}: ${detalleDe(error)}`;
      consola.escribir(`${aviso}\n`);
      return undefined;
    }
  };

  /** Cancelar: o se sale diciéndolo, o se vuelve a preguntar con el motivo delante. */
  const cancelar = (): ResultadoDelAsistente | undefined => {
    if (insistir()) {
      aviso = AVISO_HACE_FALTA;
      return undefined;
    }
    consola.escribir("asistente cancelado; se usa el modelo por omisión\n");
    return "cancelado";
  };

  for (;;) {
    const enCurso = aviso;
    aviso = undefined;
    /**
     * La clave recién tecleada que todavía NO está en disco: se escribe al final de ESTA
     * vuelta, y solo si el catálogo del proveedor contesta. Vive dentro del lazo a
     * propósito y no fuera: siendo del lazo, una vuelta que se va por un `continue` se la
     * dejaba puesta, y la vuelta siguiente —otro proveedor— la escribía como suya.
     * Medido: con `auth.json` roto, la clave tecleada para openai se intentaba guardar
     * después bajo ollama, que ni pide credencial.
     */
    let clavePorEscribir: string | undefined;
    const proveedor = (await seleccionar({
      titulo: "Proveedor de modelos",
      opciones: proveedoresParaElAsistente().map((p) => ({
        id: p,
        etiqueta: p,
        detalle: SIN_CREDENCIAL.has(p) ? "local, no necesita clave" : "necesita una clave de API",
      })),
      // El motivo viaja EN el selector y no solo por `escribir`: la consola web no pinta
      // el transcript durante el alta (`apps/web/src/App.tsx`, rama `enAlta`), así que un
      // aviso que solo fuera un acto de sistema sería un fallo mudo justo en el paso que
      // se está repitiendo. Las pieles de terminal lo ignoran: ahí el `escribir` ya está
      // a la vista, encima del selector.
      ...(enCurso === undefined ? {} : { aviso: enCurso }),
    })) as Proveedor | undefined;

    if (proveedor === undefined || !PROVEEDORES.includes(proveedor)) {
      const salida = cancelar();
      if (salida !== undefined) return salida;
      continue;
    }

    if (
      !SIN_CREDENCIAL.has(proveedor) &&
      (fallaron.has(proveedor) || contexto.hayCredencial?.(proveedor) === false)
    ) {
      // El enunciado dice CÓMO se sale, y solo donde eso es verdad: con `exigirEleccion`
      // dejarlo en blanco devuelve al paso de proveedor (es la única vuelta atrás que
      // tiene un campo de secreto, y sin decirlo no se descubre); sin él, en blanco
      // cancela el asistente entero, que es lo que este enunciado dice desde siempre.
      const clave = await consola.leerSecreto(
        insistir()
          ? `clave de ${proveedor} (en blanco para elegir otro proveedor): `
          : `clave de ${proveedor}: `
      );
      if (clave.trim() === "") {
        // Una clave vacía es la forma de cancelar que tiene un campo de secreto: se trata
        // igual que cancelar el selector, ni mejor ni peor.
        const salida = cancelar();
        if (salida !== undefined) return salida;
        continue;
      }
      // La criba de balde, antes de gastar una llamada: lo que el propio campo ya dice
      // (una línea `NOMBRE=valor` pegada entera, comillas, espacios) no hace falta
      // preguntárselo al proveedor. Ver `core/config.ts#motivoDeClaveInaceptable`.
      const malaClave = motivoDeClaveInaceptable(clave);
      if (malaClave !== undefined) {
        aviso = `esa clave de ${proveedor} no vale: ${malaClave}`;
        consola.escribir(`${aviso}\n`);
        continue;
      }
      // Se APLICA al proceso y no se escribe: guardarla es lo último, y solo si el
      // proveedor contesta. Sin `aplicarCredencial` no hay forma de probarla antes, así
      // que ahí se conserva el orden viejo — escribir primero — y se dice dónde quedó.
      clavePorEscribir = clave.trim();
      if (contexto.aplicarCredencial !== undefined) {
        contexto.aplicarCredencial(proveedor, clavePorEscribir);
      } else if (escribirCredencial(proveedor, clavePorEscribir) === undefined) {
        continue;
      } else {
        clavePorEscribir = undefined;
      }
    }

    // La conexión de verdad: una llamada al catálogo del proveedor con la credencial
    // puesta. Lo que falle aquí NO deja seguir — vuelve al paso de proveedor.
    let modelos;
    try {
      modelos = await consola.catalogoModelos.listar(proveedor);
    } catch (error) {
      aviso = `no se pudo conectar con ${proveedor}: ${detalleDe(error)}`;
      consola.escribir(`${aviso}\n`);
      fallaron.add(proveedor);
      // La clave tecleada se queda EN EL AIRE y no llega al disco: `clavePorEscribir`
      // muere con esta vuelta. Sigue aplicada al proceso —no estorba, y la vuelta
      // siguiente la sustituye porque `fallaron` obliga a volver a pedirla.
      continue;
    }
    if (modelos.length === 0) {
      aviso = `${proveedor} no ofrece ningún modelo de conversación; elige otro proveedor.`;
      consola.escribir(`${aviso}\n`);
      fallaron.add(proveedor);
      continue;
    }
    fallaron.delete(proveedor);

    // El proveedor ha contestado: AHORA se escribe la clave, y no antes. Una clave que no
    // sirve no llega nunca al disco — no hay nada que confesar porque no se guardó nada.
    if (clavePorEscribir !== undefined && escribirCredencial(proveedor, clavePorEscribir) === undefined) {
      continue;
    }

    const elegido = await seleccionar({
      titulo: `Modelos de ${proveedor}`,
      opciones: [
        ...modelos.map((m) => ({ id: m.id, etiqueta: m.nombre ?? m.id, detalle: m.id })),
        { id: ID_VOLVER, etiqueta: "← Elegir otro proveedor", detalle: "vuelve al paso anterior" },
      ],
    });
    // Volver NO es cancelar: no se dice nada y no se toca nada, solo se repite el paso.
    if (elegido === ID_VOLVER) continue;
    if (elegido === undefined) {
      const salida = cancelar();
      if (salida !== undefined) return salida;
      continue;
    }

    // Un modelo para los tres papeles, como `/modelo`. Afinar por papel es opt-in con
    // `/modelos`: preguntar tres veces antes de que nadie sepa qué es «afilado» es peaje.
    const id = `${proveedor}/${elegido}`;
    for (const papel of PAPELES) consola.guardarModeloGlobal(papel, id);
    consola.escribir(`→ ${id} guardado para los tres papeles\n`);
    return "elegido";
  }
}
