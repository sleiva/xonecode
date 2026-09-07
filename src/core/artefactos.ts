/**
 * Los ARTEFACTOS de una sesión: lo que el agente produce y **no es del proyecto**.
 *
 * Un diagrama de `archify`, un panel de `artifacts-builder`, la captura que el `probador`
 * traerá del móvil el día que hable con él. Son salidas de la conversación, no código de la
 * app: nacen de una pregunta, se miran una vez y no tienen por qué sobrevivir al proyecto.
 *
 * **Hasta ahora acababan DENTRO de la app XOne, y eso era un fallo de verdad.** Las dos
 * skills visuales reparten su entrega entre dos tools —`renderizar_diagrama` y
 * `publish_artifact`— y en xonecode no existe ninguna de las dos (cero apariciones en
 * `src/`), así que el `mockup` caía siempre en el camino de reserva, que dice literalmente
 * «con `write_file`, entrega el HTML autocontenido» en `/artifacts/<nombre>.html`. O sea: la
 * raíz del proyecto. Pasaba por la aprobación humana, entraba en git y, en un proyecto
 * cloud, **subía a CloudStudio**. Un diagrama dentro de la app del cliente.
 *
 * La carpeta virtual `/artefactos/` lo corta de raíz, y es la misma pieza que ya monta
 * `/skills/`: otra raíz colgada del `CompositeBackend` (`agent/proyecto.ts`). Cuatro cosas
 * salen de ahí sin escribir una línea de más, porque cuelga de `.xonecode/`: no entra en el
 * árbol del proyecto, no sube a CloudStudio, no aparece en Revisión y no engorda
 * `.git/objects` (`sacarXonecodeDelIndice`).
 *
 * Este módulo es `core/`: datos puros, una barrera y la regla de dónde va la carpeta. Quién
 * la monta en el backend es de `agent/`.
 */
import { join } from "node:path";
import { segmentoSeguro } from "./settings.js";

/**
 * Dónde caen en DISCO los artefactos de una sesión: `.xonecode/sesiones/<id>/artefactos/`.
 *
 * Vive en `core/` y no en `web/servidor/sesiones.ts` porque lo necesitan los dos lados —el
 * que borra la sesión y el que monta el backend—, y `cli/` no puede importar de `web/`. Es
 * lo que ya son las rutas de `core/settings.ts`: una regla de dónde va cada cosa.
 *
 * Pasa por `segmentoSeguro` por lo mismo que el `.jsonl`: el id llega del cliente por HTTP,
 * y sin esa guarda un `"../../.env"` compondría una ruta fuera de `sesiones/`.
 *
 * Convive con `<id>.jsonl` sin chocar —uno es fichero con extensión, otra es carpeta—, así
 * que no hay nada que mover. Meter el transcript dentro (`<id>/sesion.jsonl`) es una mudanza
 * aparte, con su respaldo de lectura para las sesiones que ya existen.
 */
export function carpetaDeArtefactosDeSesion(raiz: string, id: string): string {
  return join(raiz, ".xonecode", "sesiones", segmentoSeguro(id, "id de sesión"), "artefactos");
}

/** El prefijo virtual. Con barra final: `CompositeBackend` la exige para no reconstruir
 *  `//nombre` fuera de la raíz montada — la misma trampa medida con `/skills/`. */
export const RUTA_ARTEFACTOS = "/artefactos/";

/**
 * ¿Es esta ruta la de un artefacto, sin lugar a dudas?
 *
 * Se usa para DOS cosas y una de ellas es una decisión de seguridad: una escritura aquí no
 * pide aprobación humana (ver `agent/turnoReal.ts`), así que esto no puede ser un
 * `startsWith` a secas. Un `/artefactos/../app.xml` que colara por aquí sería una escritura
 * al proyecto aprobada sola.
 *
 * Por eso es una lista blanca de forma y no una lista negra de trampas: cada segmento tiene
 * que ser texto llano (letras, cifras, punto, guion y guion bajo), lo que deja fuera `..`,
 * `.`, los segmentos vacíos de un `//`, la barra invertida de Windows, el NUL y cualquier
 * `%2e%2e` sin decodificar. Lo que no case se trata como una ruta normal, o sea que pasa por
 * la aprobación de siempre — el lado conservador.
 *
 * Medido contra deepagents: un `write` de `/artefactos/../pwn.html` NO llega al proyecto (el
 * `virtualMode` de la raíz montada lo sujeta), pero devuelve OK sin escribir en ninguna
 * parte. Que la barrera esté aquí no depende de eso: depende de que el día que alguien
 * cambie el montaje, el permiso siga siendo del segmento y no del prefijo.
 */
const SEGMENTO = /^[A-Za-z0-9._-]+$/;

export function esRutaDeArtefacto(ruta: string | undefined): boolean {
  if (ruta === undefined || !ruta.startsWith(RUTA_ARTEFACTOS)) return false;
  const segmentos = ruta.slice(RUTA_ARTEFACTOS.length).split("/");
  if (segmentos.length === 0) return false;
  return segmentos.every((s) => SEGMENTO.test(s) && s !== "." && s !== "..");
}

/**
 * ¿Es esta ruta un artefacto escrito en el SITIO EQUIVOCADO? Y si lo es, dónde iba.
 *
 * **Esto existe porque el prompt se agotó.** La carpeta buena la nombran los cuatro sitios
 * que el modelo puede leer —las instrucciones del `mockup`, la skill `artifacts-builder`,
 * `archify` y la descripción de `write_file`—, y aun así, medido el 2026-09-07 en dos
 * delegaciones CONSECUTIVAS del mismo proyecto: la primera escribió
 * `/artifacts/login_flow.html` y la segunda, un minuto después, `/artefactos/diagrama.html`.
 * No falta ninguna instrucción: es deriva del modelo. Y el fallo no es cosmético — ahí el
 * diagrama pasa por la aprobación humana, entra en git y **sube a CloudStudio, dentro de la
 * app del cliente**.
 *
 * Es la misma clase de regla que las vistas aplanadas: se aplica en el BACKEND
 * (`agent/proyecto.ts#sinArtefactosEnElProyecto`) y no en un prompt, porque un permiso solo
 * protege a quien lo choca. Aquí vive solo la regla, que es datos puros.
 *
 * **Se mira el PRIMER segmento y nada más**, y eso acota el falso positivo a propósito: un
 * `/src/artifacts.js` o un `/scripts/artifacts/util.js` del proyecto pasan sin enterarse.
 * Lo que se deniega es la carpeta de la raíz que XOne no tiene y que ninguna convención de
 * la plataforma usa. El precio, dicho: un proyecto que de verdad tuviera un `artifacts/` en
 * su raíz no podría escribir ahí con el agente. Se acepta, porque el otro lado del error es
 * un diagrama subido a la app del cliente sin que nadie se entere.
 *
 * Sin distinguir mayúsculas, que es la lección de APFS: `/Artifacts/` abre el mismo sitio.
 */
const CARPETAS_EQUIVOCADAS = new Set(["artifacts", "artifact"]);
/** El fichero suelto que nombra el contrato de `publish_artifact` (`path="/artifact.html"`). */
const FICHERO_EQUIVOCADO = "artifact.html";

export function artefactoFueraDeSitio(ruta: string): string | undefined {
  const segmentos = ruta.split(/[\\/]+/).filter((s) => s.length > 0);
  if (segmentos.length === 0) return undefined;
  const primero = segmentos[0]!.toLowerCase();
  const esCarpeta = CARPETAS_EQUIVOCADAS.has(primero) && segmentos.length > 1;
  const esFichero = primero === FICHERO_EQUIVOCADO && segmentos.length === 1;
  if (!esCarpeta && !esFichero) return undefined;
  // La carpeta de la sesión es PLANA hacia fuera: de `/artifacts/sub/x.html` se propone
  // `x.html`, no `sub/x.html`. Un artefacto es una salida, no un árbol.
  return `${RUTA_ARTEFACTOS}${segmentos[segmentos.length - 1]!}`;
}

/** El nombre que se le enseña a una persona: el último segmento y nada más. */
export function nombreDeArtefacto(ruta: string): string {
  return ruta.slice(ruta.lastIndexOf("/") + 1);
}

/**
 * De qué es este artefacto, por su EXTENSIÓN.
 *
 * Tabla cerrada y por extensión, igual que el visor de Ficheros: olfatear los bytes no vale
 * —un PNG lleva ceros en su cabecera y caería por el camino del texto— y aquí además el
 * fichero lo acaba de escribir el agente, así que su nombre es lo que él eligió decir que
 * es. Lo que no esté en la tabla no se afirma: `undefined` es «no lo sé», que es distinto de
 * «es binario».
 */
const MIMES: Record<string, string> = {
  html: "text/html",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  md: "text/markdown",
  txt: "text/plain",
  json: "application/json",
  csv: "text/csv",
};

export function mimeDeArtefacto(nombre: string): string | undefined {
  const punto = nombre.lastIndexOf(".");
  if (punto <= 0) return undefined;
  return MIMES[nombre.slice(punto + 1).toLowerCase()];
}

/**
 * Lo que se sabe de un artefacto recién escrito.
 *
 * No lleva el CONTENIDO, y esa ausencia es la de siempre: por aquí pasa lo que acaba en el
 * transcript y en el cable, y un panel de `artifacts-builder` son cientos de kilobytes de
 * HTML. Lleva lo que deja decir «hay un diagrama de 42 KB y se llama así» y lo que deja ir a
 * buscarlo: la ruta virtual, con la que se lee después.
 */
export interface Artefacto {
  /** La ruta virtual, tal como la escribió el agente (`/artefactos/flujo.html`). */
  ruta: string;
  /** El último segmento, para enseñarlo. */
  nombre: string;
  /** Por extensión, o ausente si no se sabe. Nunca se adivina. */
  mime?: string;
  /** Tamaño en bytes de lo que se escribió. */
  bytes: number;
}
