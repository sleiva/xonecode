/**
 * La carta de presentación del proyecto, pegada al turno.
 *
 * **Existe por una medida, y la medida es de hoy** (19-09-2026): en seis turnos reales sobre un
 * proyecto de verdad, cada especialista repetía las MISMAS búsquedas —`grep` ×42 en un solo
 * turno, con `xnTituloHeaderC` ×7 y `xnHeader` ×3— y el orquestador se llevaba entre el 38 % y
 * el 50 % del gasto averiguando. No por delegar mal: porque **nadie hace el descubrimiento una
 * sola vez**. El prompt del orquestador ya PIDE lo contrario («No pidas al siguiente
 * especialista redescubrir esos hechos») y no basta — una instrucción no es una garantía.
 *
 * Así que los hechos baratos se ponen delante en vez de pedirse: el inventario cuesta cientos
 * de tokens donde abrir los `.xne` cuesta decenas de miles (`xone_navegacion`).
 *
 * **Es el patrón de `conAdjuntos` y de `inventarioDelProyecto`**: montar no basta, hay que
 * DECIR lo que hay. Aquí ni siquiera hay nada montado — el índice existe detrás de una tool
 * que el agente tiene que acordarse de llamar, y un turno que no la llama trabaja a ciegas.
 *
 * **Y se calcula al MANDAR el turno, no al abrir la sesión.** Eso no es un detalle de
 * cableado: `xone_navegacion` no cachea a propósito porque «un índice viejo que dice que un
 * campo existe cuando el agente acaba de borrarlo es peor que no tener índice». Congelar esta
 * foto en el prompt de sistema reintroduciría justo eso. Rehacerla por turno cuesta decenas de
 * milisegundos y no puede quedarse vieja dentro del turno que la usa.
 *
 * Puro y en `core/`: quién lee el disco es de `agent/`.
 */

/**
 * Los hechos que se cuentan. Deliberadamente POCOS y todos baratos de obtener.
 *
 * Lo que NO entra, y es una decisión: los CAMPOS de cada colección. Son el grueso del índice,
 * envejecen dentro del turno —el agente los crea y los borra— y la pregunta «qué campos tiene
 * X» ya la contesta `xone_navegacion campos` cuando de verdad hace falta. Poner aquí una lista
 * de campos sería pagar el peaje en cada turno para acertar en pocos.
 */
import type { IndiceDeNavegacion } from "./navegacion.js";

export interface HechosDelProyecto {
  /** Las colecciones de entrada. Vacío significa NO CONSTA, no «no hay». */
  entrada: readonly string[];
  /** Las colecciones de login, si el proyecto tiene. */
  login: readonly string[];
  /** Las hojas de estilo declaradas. */
  estilos: readonly string[];
  /** Los nombres de todas las colecciones, en el orden en que los da el índice. */
  colecciones: readonly string[];
}

/**
 * Del índice a los hechos. PURA: el índice entra ya construido.
 *
 * Separada de quien lo construye por el motivo de siempre —poder probar la traducción sin
 * disco— y porque el índice es la AUTORIDAD: aquí solo se elige qué poquito de él se adelanta.
 * Lo que se elige son las cuatro cosas que un turno cualquiera pregunta primero, y ninguna
 * lleva rutas: solo NOMBRES, así que esto no puede filtrar una ruta de la máquina por el cable.
 */
export function hechosDeIndice(indice: IndiceDeNavegacion): HechosDelProyecto {
  const app = indice.app();
  return {
    entrada: app.entrada,
    login: app.login,
    estilos: app.estilos,
    colecciones: indice.inventario().map((d) => d.nombre),
  };
}

/**
 * Cuántos nombres de colección caben antes de contar el resto.
 *
 * Un proyecto real medido tiene 98 colecciones y eso son unos cientos de tokens: barato al
 * lado de los 18.000 que cuesta enterarse leyendo. El tope existe para que un proyecto mucho
 * mayor no se coma la ventana, y **lo que no cabe se CUENTA** en vez de recortarse en
 * silencio: una lista truncada sin decirlo se lee como la lista entera, y entonces el agente
 * concluye que una colección no existe.
 */
export const TOPE_DE_COLECCIONES = 150;

/** ¿Hay algo que contar? Sin esto no se pinta el bloque: un control sin dato detrás. */
function hayAlgo(h: HechosDelProyecto): boolean {
  return (
    h.colecciones.length > 0 || h.entrada.length > 0 || h.login.length > 0 || h.estilos.length > 0
  );
}

/** Una lista, o la marca de que no consta. Vacío NO es «no hay»: es que no se pudo leer. */
function lista(valores: readonly string[]): string {
  return valores.length === 0 ? "no consta" : valores.join(", ");
}

/**
 * La petición del turno con los hechos del proyecto detrás.
 *
 * Sin hechos —no hay índice, o el proyecto no se pudo leer— devuelve la petición TAL CUAL.
 * Nombrar un inventario que no se tiene sería la mentira con forma de dato de siempre.
 */
export function conHechosDelProyecto(
  peticion: string,
  hechos: HechosDelProyecto | undefined,
): string {
  if (hechos === undefined || !hayAlgo(hechos)) return peticion;
  const visibles = hechos.colecciones.slice(0, TOPE_DE_COLECCIONES);
  const ocultas = hechos.colecciones.length - visibles.length;
  return [
    peticion,
    "",
    `ESTE PROYECTO, medido ahora mismo (${hechos.colecciones.length} colecciones). No vuelvas a`,
    "averiguar lo que ya está aquí, y pásalo en el `HANDOFF DE ANÁLISIS` cuando delegues:",
    `- Entrada: ${lista(hechos.entrada)}`,
    `- Login: ${lista(hechos.login)}`,
    `- Estilos: ${lista(hechos.estilos)}`,
    `- Colecciones: ${visibles.join(", ")}`,
    ...(ocultas > 0 ? [`  (y ${ocultas} más que no caben aquí: pídelas con \`xone_navegacion\`)`] : []),
    "Esto es una FOTO del arranque del turno y solo dice QUÉ hay, no cómo es cada cosa. Para los",
    "campos de una colección, dónde se declara algo o quién la referencia, usa `xone_navegacion`:",
    "es la autoridad y está al día, esta lista no lo estará si el turno crea o borra algo.",
  ].join("\n");
}
