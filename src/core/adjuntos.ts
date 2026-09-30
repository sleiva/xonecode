/**
 * Los ADJUNTOS: los documentos que una persona aporta, no que produce el agente. Dos FUENTES,
 * al crear una TAREA (los de siempre) o, desde IXCODE-7, en el CHAT de una sesión — con dónde
 * caen en disco distinto para cada una (ver más abajo), pero una sola regla de LECTURA.
 *
 * Una captura de la pantalla que hay que replicar, un `.md` con el detalle del encargo, un
 * CSV con los datos de prueba. **No son ficheros del proyecto y no son artefactos**: no los
 * produce el agente, los aporta quien pide el trabajo, y el agente solo los LEE. De ahí las
 * dos reglas de este módulo:
 *
 * - **Los de una TAREA viven FUERA del proyecto** (`~/.xonecode/tareas/<id>/adjuntos/`, ver
 *   `agent/tareas/tareasEnDisco.ts`), y eso trae gratis lo que importaba: no entran en git y no
 *   suben a CloudStudio, sin depender de ninguna exclusión. Una tarea puede crearse para un
 *   proyecto que nadie ha abierto nunca, así que guardarlos en su `.xonecode/` sería
 *   estrenárselo por la puerta de atrás. Los de una SESIÓN son distintos (abajo): una sesión
 *   ya tiene proyecto abierto, así que no hace falta esa cautela.
 * - **El agente los ve en `/adjuntos/`, de SOLO lectura** — la misma pieza que `/skills/` y
 *   `/artefactos/` (`agent/grafo/proyecto.ts#backendConAdjuntos`), y de solo lectura por lo mismo
 *   que las skills: son material de entrada, no ficheros que reescribir. Lo deniega
 *   `permisosDe` y no un prompt.
 *
 * Este módulo es `core/`: datos puros, una lista blanca de forma y el texto con que se le
 * cuentan al agente. Quién los guarda y quién los monta es de `agent/`.
 *
 * **IXCODE-7 añade una SEGUNDA fuente**: los adjuntos que una persona anexa en el CHAT de una
 * sesión, no al crear una tarea. Viven DENTRO del proyecto (`.xonecode/sesiones/<id>/adjuntos/`,
 * `carpetaDeAdjuntosDeSesion`), hermana de `artefactos/` y con el mismo `segmentoSeguro` porque
 * el id llega del cliente. Se enseñan por la MISMA `/adjuntos/`, pero el inventario que se le
 * cuenta al agente cambia («de este MENSAJE» y no «de esta TAREA») y añade cómo meterlo en el
 * proyecto: quien escribe tiene `incorporar_adjunto`, que pasa por la aprobación. `conAdjuntos`
 * distingue los dos con un tercer parámetro (`de`), omisión `"tarea"` para no tocar el único
 * llamador que ya existía (`web/servidor/corredorDeTareas.ts`).
 */
import { join } from "node:path";
import { segmentoSeguro } from "./settings.js";

/**
 * El mime de un adjunto, por su EXTENSIÓN.
 *
 * Es literalmente la MISMA tabla que la de los artefactos y se reexporta en vez de
 * copiarse: dos tablas de extensiones son dos tablas que divergen, y el criterio ya está
 * argumentado ahí (por extensión y no olfateando los bytes, porque un PNG lleva ceros en su
 * cabecera; y lo que no está en la tabla es `undefined`, que es «no lo sé» y no «es
 * binario»).
 */
export { mimeDeArtefacto as mimeDeAdjunto } from "./artefactos.js";

/**
 * Dónde caen en DISCO los adjuntos que una persona anexa en el CHAT de una sesión (IXCODE-7):
 * `.xonecode/sesiones/<id>/adjuntos/`, HERMANA de `artefactos/`. A diferencia de los de una tarea
 * (`~/.xonecode/tareas/<id>/adjuntos/`), una sesión ya tiene carpeta en el proyecto, y `.xonecode`
 * no entra en git ni sube a CloudStudio. `segmentoSeguro`: el id llega del cliente.
 */
export function carpetaDeAdjuntosDeSesion(raiz: string, id: string): string {
  return join(raiz, ".xonecode", "sesiones", segmentoSeguro(id, "id de sesión"), "adjuntos");
}

/** El prefijo virtual. Con barra final: `CompositeBackend` la exige para no reconstruir
 *  `//nombre` fuera de la raíz montada — la misma trampa medida con `/skills/`. */
export const RUTA_ADJUNTOS = "/adjuntos/";

/**
 * El nombre de la tool que mete un adjunto en el PROYECTO (`agent/grafo/incorporarAdjunto.ts`).
 *
 * Vive aquí, en un módulo neutral, y no junto a la tool: la aprobación va por NOMBRE de tool en
 * los dos motores, así que lo necesitan `perfiles.ts` (el HITL), `interrupts.ts` (la tarjeta) y
 * las capacidades de TrueForge — y la tool importa `perfiles.ts` para reaplicar sus permisos.
 * Declarada al lado de la tool, esas importaciones cerrarían un ciclo de VALOR
 * (`src/ciclos.test.ts`). Y un literal repetido en cuatro sitios es cuatro sitios donde divergir.
 */
export const NOMBRE_INCORPORAR_ADJUNTO = "incorporar_adjunto";

/**
 * ¿Vale este nombre para un adjunto?
 *
 * **Lista BLANCA de forma, no un `startsWith` ni una lista de trampas**, y de ella depende
 * que un `POST /adjunto?nombre=…` no escriba fuera de la carpeta que le toque —de una tarea
 * o de una sesión—: el nombre llega del cliente y se concatena a una ruta de disco. Cada
 * nombre tiene que ser un segmento de texto llano (letras y cifras ASCII, punto, guion y
 * guion bajo), lo que deja fuera `..`, `.`, el hueco vacío de un `//`, la barra y la barra
 * invertida de Windows, el NUL, los espacios y cualquier `%2e%2e` que llegue sin decodificar.
 *
 * Es la misma regla —y el mismo patrón— que `esRutaDeArtefacto` (`core/artefactos.ts`), y
 * vive aquí para que la usen sin copiarla todos los sitios que la necesitan: la ruta de
 * subida, el guardado en disco, el listado y —desde IXCODE-7— el filtro del nombre que llega
 * por el CABLE (`web/servidor/consolaWeb.ts`) y la tool `incorporar_adjunto`.
 */
const SEGMENTO = /^[A-Za-z0-9._-]+$/;

export function nombreDeAdjuntoAceptable(nombre: string): boolean {
  return SEGMENTO.test(nombre) && nombre !== "." && nombre !== "..";
}

/** Lo que se sabe de un adjunto para poder nombrarlo. La forma de `AdjuntoDeTarea`
 *  (`core/tareas.ts`) reducida a lo que este texto usa. */
export interface AdjuntoNombrable {
  nombre: string;
  bytes: number;
  mime?: string;
}

/** Un tamaño para leer. KB de 1000, como el resto de la interfaz. */
const peso = (bytes: number): string =>
  bytes < 1000 ? `${bytes} B` : bytes < 1_000_000 ? `${Math.round(bytes / 1000)} KB` : `${(bytes / 1_000_000).toFixed(1)} MB`;

/**
 * La petición del turno con el inventario de los adjuntos detrás.
 *
 * **Existe porque montar la carpeta no basta.** El agente no explora `/adjuntos/` por su
 * cuenta: es una raíz virtual que ninguna instrucción suya nombra, así que un encargo que no
 * la mencione deja los ficheros ahí sin que nadie los abra. Y no se puede confiar en que lo
 * diga el ENCARGO: el encargo lo redacta el aumentador —que puede haber fallado, y entonces
 * es el texto crudo de la persona— o lo edita quien crea la tarea, y las dos cosas pueden
 * borrar la única mención. Así que se añade al MANDAR el turno, que es el único momento en
 * que se sabe lo que hay en disco. Es el mismo reparto que `peticionDeFeedback`
 * (`web/servidor/corredorDeTareas.ts`): el texto de la persona, y detrás lo que el código
 * sabe.
 *
 * **Sin adjuntos no toca nada.** Nombrar una carpeta que no se ha montado sería mandarle al
 * agente a un sitio que no existe — el «control sin dato detrás» de siempre, aquí en forma
 * de prompt.
 *
 * **Y dice la limitación de las imágenes** (§2 del diseño: que el agente VEA una imagen es
 * multimodal y es otra tanda). Solo si hay alguna: el aviso pegado a un `.md` sería ruido.
 * Prometerle que «mira» la captura y que la lea como bytes es la peor clase de mentira aquí,
 * porque quien se la cree es el modelo y contestará que la ha mirado.
 *
 * **`de` distingue de DÓNDE viene el adjunto** (IXCODE-7), porque el resto de la frase cambia
 * con el origen: uno de TAREA lo anexó quien la creó, antes de que el agente exista; uno de
 * MENSAJE lo anexa la persona EN el chat, a mitad de conversación, y además dice cómo llevarlo
 * al proyecto (`incorporar_adjunto`, que pasa por la aprobación) — sin esa línea, el orquestador
 * no tiene forma de saber que delegar «pon este icono en el menú» necesita nombrar el adjunto Y
 * el destino. Y dice a QUIÉN: la tool solo la montan los especialistas de motor propio (un hijo
 * externo corre en otro proceso, sin tools nuestras ni `/adjuntos/`), así que «quien escribe la
 * tiene» era falso para un `developer-xone` de Claude Code. Omisión `"tarea"`: el llamador de
 * las tareas (`corredorDeTareas.ts`, con dos argumentos) no cambia de texto; el del chat
 * (`vestibulo.ts`) pasa `"mensaje"`.
 */
export function conAdjuntos(peticion: string, adjuntos: readonly AdjuntoNombrable[], de: "tarea" | "mensaje" = "tarea"): string {
  if (adjuntos.length === 0) return peticion;
  const hayImagen = adjuntos.some((a) => a.mime?.startsWith("image/") === true);
  const cabecera =
    de === "mensaje"
      ? [
          `ADJUNTOS DE ESTE MENSAJE (${adjuntos.length}). Los ha anexado la persona en el chat y están`,
          `montados en «${RUTA_ADJUNTOS}», de SOLO lectura: se leen con las tools de fichero y no se`,
          "pueden escribir ni borrar. No son ficheros del proyecto. Para meter uno en el proyecto (un",
          `icono en \`icons/\`, por ejemplo), los especialistas de motor PROPIO que escriben en el proyecto`,
          `tienen \`${NOMBRE_INCORPORAR_ADJUNTO}\`, que pasa por la aprobación: al delegar, di qué adjunto`,
          "y dónde va. Un especialista de motor EXTERNO (Claude Code, Codex, OpenCode) no la tiene ni ve",
          `«${RUTA_ADJUNTOS}»: no le delegues incorporar un adjunto.`,
        ]
      : [
          `ADJUNTOS DE ESTA TAREA (${adjuntos.length}). Los ha anexado la persona que la creó y están`,
          `montados en «${RUTA_ADJUNTOS}», de SOLO lectura: se leen con las tools de fichero y no se`,
          "pueden escribir ni borrar. No son ficheros del proyecto.",
        ];
  return [
    peticion,
    "",
    ...cabecera,
    ...adjuntos.map((a) => `- ${RUTA_ADJUNTOS}${a.nombre} (${peso(a.bytes)}${a.mime === undefined ? "" : `, ${a.mime}`})`),
    ...(hayImagen
      ? [
          "IMÁGENES: para saber qué hay en una, pásala por `describe_image` con su ruta (`read_file` no",
          "las abre). No describas una imagen que no hayas pasado por ella.",
        ]
      : []),
  ].join("\n");
}
