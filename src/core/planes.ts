/**
 * Dónde viven los PLANES, y por qué no es ninguno de los dos sitios obvios.
 *
 * Un plan lo escribe quien analiza y lo consume quien desarrolla, que marca ahí mismo lo que
 * va haciendo. O sea que no es un entregable que se enseña una vez: es **estado de trabajo
 * compartido**. Eso descarta los dos sitios que se prueban primero:
 *
 * - **La raíz del proyecto NO**: es la app del cliente. Lo que se escribe ahí pasa por
 *   aprobación, entra en el commit de cada turno y **sube a CloudStudio**. Un plan de
 *   desarrollo no es parte de la aplicación que el cliente instala. (Y «pongo un `.gitignore`»
 *   tampoco resuelve: un `.gitignore` es un fichero DEL PROYECTO y subiría él mismo — la misma
 *   razón por la que la basura del SO va a `info/exclude` y nunca al `.gitignore`.)
 * - **`/artefactos/` tampoco**, aunque ahí se probó primero y funciona: un artefacto es algo
 *   que se ENSEÑA —se anuncia con su evento, se abre en un iframe— y es PLANO, así que dos
 *   planes a la vez se pisan el nombre.
 *
 * Queda `.xonecode/planes/`, que es donde escribe el propio harness: está fuera del índice de
 * git (`sacarXonecodeDelIndice`), fuera del diff del turno y fuera de la subida, y vive en el
 * repo LOCAL, así que un plan sobrevive a la sesión que lo escribió — se planifica un día y se
 * implementa otro.
 *
 * El agente lo ve por la ruta VIRTUAL `/planes/`, nunca por `.xonecode`, que le está denegado
 * entero. Es el mismo truco que `/MEMORIA_PROYECTO.md`.
 */
import { motivoDeNombreInaceptable } from "./agentes.js";

/** La ruta virtual. La barra final es obligatoria: `CompositeBackend` la retira al delegar. */
export const RUTA_PLANES = "/planes/";

/** Dónde caen de verdad, relativo a la raíz del proyecto. */
export const CARPETA_DE_PLANES = ".xonecode/planes";

/**
 * **Un plan es una CARPETA, no un fichero**, porque dentro de una sesión puede haber varios y
 * porque un plan son tres cosas que se acompañan (`PLAN.md`, `TASKS.md`, `CONTEXT.md`) más sus
 * ADRs. Con ficheros sueltos, dos planes a la vez se pisan.
 */
export const FICHEROS_DE_UN_PLAN = ["PLAN.md", "TASKS.md", "CONTEXT.md"] as const;

/**
 * Por qué un nombre de plan no vale, o `undefined` si vale.
 *
 * **La MISMA regla que la de un subagente o una skill**, y a propósito: el nombre se convierte
 * en un segmento de ruta, y tres reglas distintas para lo mismo son tres sitios donde discrepar
 * sobre qué es un nombre seguro.
 */
export function motivoDePlanInaceptable(nombre: string): string | undefined {
  return motivoDeNombreInaceptable(nombre);
}

/**
 * ¿Es una ruta de plan bien formada? Lista BLANCA de forma, no un `startsWith`.
 *
 * Tiene que ser `/planes/<slug>/<algo>`: con el slug validado y sin salirse por un `..`, un
 * `\` ni una barra de más. Es la misma clase de criba que `esRutaDeArtefacto`, y existe por lo
 * mismo: lo que el modelo escribe es texto, y de ahí sale una ruta del disco.
 */
export function esRutaDePlan(ruta: string | undefined): boolean {
  if (ruta === undefined || !ruta.startsWith(RUTA_PLANES)) return false;
  const resto = ruta.slice(RUTA_PLANES.length);
  const partes = resto.split("/");
  if (partes.length < 2) return false;
  const [plan, ...dentro] = partes;
  if (plan === undefined || motivoDePlanInaceptable(plan) !== undefined) return false;
  // Ningún segmento vacío, ni `.`/`..`, ni nada con separadores raros o el byte nulo.
  return dentro.every((s) => s !== "" && s !== "." && s !== ".." && !/[\\\0]/.test(s));
}

/** La carpeta de un plan, tal como la ve el agente. */
export function rutaDelPlan(nombre: string): string {
  return `${RUTA_PLANES}${nombre}/`;
}
