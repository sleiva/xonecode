/**
 * El título que se le pone a una conversación o a una tarea: su primera frase, entera.
 *
 * Vivía en `web/servidor/sesiones.ts` y se movió aquí cuando las TAREAS necesitaron el mismo
 * título: `core/` no puede importar de `web/`, y una segunda copia habría divergido — con el
 * síntoma de que la misma frase diera dos títulos distintos según quién la mirara.
 */

/** Cuántos caracteres de la primera prosa del usuario se guardan como título. */
const LARGO_TITULO = 80;

/** Hasta dónde llega un título AUTOMÁTICO antes de cortarse en una palabra entera. */
const LARGO_TITULO_AUTOMATICO = 60;

/**
 * El título automático de una sesión o de una tarea, a partir de su primera petición.
 *
 * Era `texto.slice(0, 80)` a secas, y medido en pantalla daba «Escribe literalmente esta
 * frase, sin cambiar nada: «en XOne se usa $http para pe» — media frase con una comilla sin
 * cerrar. Sin llamar a ningún modelo (un título no vale una petición), lo que sí se puede
 * hacer es quedarse con la PRIMERA frase o línea, quitar la comilla de apertura si la
 * petición empieza citando, y cortar en una palabra entera con puntos suspensivos. Sigue
 * siendo lo que el usuario escribió, no un resumen: renombrar sigue estando en el «…».
 */
/**
 * Un ENCABEZADO de sección al empezar la petición —«Resumen», «## Contexto», «Descripción:»—: no es el título. Medido en
 * Maset: una petición pegada de un ticket empezaba por «Resumen» y dos tareas se llamaban así. Una o dos palabras sin
 * frase detrás (con `#` o `:` delante o detrás) se saltan, si queda otra línea con texto.
 */
const ENCABEZADO = /^#{0,6}\s*[\p{L}]+(\s+[\p{L}]+)?\s*:?$/u;

export function tituloDesde(texto: string): string {
  const lineas = texto.trim().split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== "");
  const primeraLinea = lineas.find((l) => !ENCABEZADO.test(l)) ?? lineas[0] ?? "";
  const primera = primeraLinea
    .replace(/^#{1,6}\s*/u, "")
    .split(/(?<=[.!?:;])\s/)[0]!
    .replace(/[.!?:;]+$/u, "")
    .replace(/^[«"“'‘¿¡\s]+/u, "")
    .trim();
  if (primera.length <= LARGO_TITULO_AUTOMATICO) return primera.slice(0, LARGO_TITULO);
  const corte = primera.slice(0, LARGO_TITULO_AUTOMATICO);
  const enPalabra = corte.lastIndexOf(" ");
  return `${(enPalabra > 20 ? corte.slice(0, enPalabra) : corte).replace(/[\s,;:]+$/u, "")}…`;
}
