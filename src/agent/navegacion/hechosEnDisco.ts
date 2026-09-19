import { hechosDeIndice, type HechosDelProyecto } from "../../core/hechosDelProyecto.js";
import type { CargarIndice } from "./indiceEnDisco.js";

/**
 * Los hechos del proyecto, leyendo el disco, **y tolerando que no se puedan leer**.
 *
 * Vive aquí y no dentro del turno por el patrón de fallo que este repo lleva contado nueve
 * veces: una composición de producción escondida en un cierre que todos los tests doblan es una
 * regla escrita, no probada. Aquí la costura está fuera y tiene su test.
 *
 * **Un fallo NO tumba el turno, y eso es la decisión.** Construir el índice toca disco y entra
 * en la librería del linter: una carpeta que no es un proyecto XOne, un `.xne` ilegible o un
 * fallo de la librería devuelven `undefined`, y entonces el turno sale exactamente como salía
 * antes de que esto existiera. Adelantar hechos es una OPTIMIZACIÓN —abarata enterarse—, no una
 * capacidad, así que no puede ser lo que impida trabajar. Es el mismo trato que el verificador
 * le da a que falte el binario: se sigue, y lo que falta se nota en el precio, no en un error.
 *
 * Se llama POR TURNO y no al abrir la sesión, a propósito: ver `core/hechosDelProyecto.ts`.
 */
export async function hechosDelProyectoDe(
  cargarIndice: CargarIndice,
  ficheros: ReadonlySet<string>,
): Promise<HechosDelProyecto | undefined> {
  try {
    return hechosDeIndice(await cargarIndice(ficheros));
  } catch {
    return undefined;
  }
}
