/**
 * Los ADJUNTOS de una tarea: los documentos que una persona anexa al crearla.
 *
 * Una captura de la pantalla que hay que replicar, un `.md` con el detalle del encargo, un
 * CSV con los datos de prueba. **No son ficheros del proyecto y no son artefactos**: no los
 * produce el agente, los aporta quien pide el trabajo, y el agente solo los LEE. De ahí las
 * dos reglas de este módulo:
 *
 * - **Viven FUERA del proyecto** (`~/.xonecode/tareas/<id>/adjuntos/`, ver
 *   `agent/tareasEnDisco.ts`), y eso trae gratis lo que importaba: no entran en git y no
 *   suben a CloudStudio, sin depender de ninguna exclusión. Una tarea puede crearse para un
 *   proyecto que nadie ha abierto nunca, así que guardarlos en su `.xonecode/` sería
 *   estrenárselo por la puerta de atrás.
 * - **El agente los ve en `/adjuntos/`, de SOLO lectura** — la misma pieza que `/skills/` y
 *   `/artefactos/` (`agent/proyecto.ts#backendConAdjuntos`), y de solo lectura por lo mismo
 *   que las skills: son material de entrada, no ficheros que reescribir. Lo deniega
 *   `permisosDe` y no un prompt.
 *
 * Este módulo es `core/`: datos puros, una lista blanca de forma y el texto con que se le
 * cuentan al agente. Quién los guarda y quién los monta es de `agent/`.
 */

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

/** El prefijo virtual. Con barra final: `CompositeBackend` la exige para no reconstruir
 *  `//nombre` fuera de la raíz montada — la misma trampa medida con `/skills/`. */
export const RUTA_ADJUNTOS = "/adjuntos/";

/**
 * ¿Vale este nombre para un adjunto?
 *
 * **Lista BLANCA de forma, no un `startsWith` ni una lista de trampas**, y de ella depende
 * que un `POST /adjunto?nombre=…` no escriba fuera de la carpeta de la tarea: el nombre
 * llega del cliente y se concatena a una ruta de disco. Cada nombre tiene que ser un
 * segmento de texto llano (letras y cifras ASCII, punto, guion y guion bajo), lo que deja
 * fuera `..`, `.`, el hueco vacío de un `//`, la barra y la barra invertida de Windows, el
 * NUL, los espacios y cualquier `%2e%2e` que llegue sin decodificar.
 *
 * Es la misma regla —y el mismo patrón— que `esRutaDeArtefacto` (`core/artefactos.ts`), y
 * vive aquí para que la usen los tres sitios que la necesitan sin copiarla: la ruta de
 * subida, el guardado en disco y el listado.
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
 */
export function conAdjuntos(peticion: string, adjuntos: readonly AdjuntoNombrable[]): string {
  if (adjuntos.length === 0) return peticion;
  const hayImagen = adjuntos.some((a) => a.mime?.startsWith("image/") === true);
  return [
    peticion,
    "",
    `ADJUNTOS DE ESTA TAREA (${adjuntos.length}). Los ha anexado la persona que la creó y están`,
    `montados en «${RUTA_ADJUNTOS}», de SOLO lectura: se leen con las tools de fichero y no se`,
    "pueden escribir ni borrar. No son ficheros del proyecto.",
    ...adjuntos.map((a) => `- ${RUTA_ADJUNTOS}${a.nombre} (${peso(a.bytes)}${a.mime === undefined ? "" : `, ${a.mime}`})`),
    ...(hayImagen
      ? [
          "AVISO sobre las imágenes: las LEES como fichero, pero no las ves — no hay visión en",
          "este harness todavía. No digas que has mirado una captura ni describas lo que aparece",
          "en ella: si el encargo depende de verla, dilo y pide que se describa por escrito.",
        ]
      : []),
  ].join("\n");
}
