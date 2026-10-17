// src/agent/cloudstudio/crearRama.ts
/**
 * Crear una rama en Studio a partir de otra.
 *
 * `CloudStudioPort` no lo tiene a propósito: la consola sube a la MISMA rama de la que bajó, y
 * nada de lo que hay hoy crea ramas. Quien trabaja de servidor (xonecode-copilot) sí lo
 * necesita: hace la tarea en una rama de destino que puede no existir todavía. Va aparte y no
 * en el puerto para que el puerto —y sus dobles— no cambien.
 *
 * Se reabre el proyecto al final por lo mismo que `cambiarRama`: una operación de ramas puede
 * cerrar el proyecto en el servidor, y la siguiente llamada fallaría con «No project is open».
 */
import type { CloudStudioPort } from "../../core/ports.js";
import type { InvocarMcp } from "./cloudstudioMcp.js";

/** Devuelve `true` si la creó y `false` si ya existía. */
export async function crearRama(
  invocar: InvocarMcp,
  puerto: Pick<CloudStudioPort, "abrir" | "ramas">,
  proyecto: string,
  nueva: string,
  desde: string
): Promise<boolean> {
  await puerto.abrir(proyecto);
  const antes = await puerto.ramas();
  if (antes.includes(nueva)) return false;
  if (!antes.includes(desde)) throw new Error(`la rama origen «${desde}» no existe`);
  await invocar("studio_manage_branches", { operation: "create", branchName: nueva, targetBranch: desde });
  await puerto.abrir(proyecto);
  if (!(await puerto.ramas()).includes(nueva)) {
    throw new Error(`Studio no creó la rama «${nueva}» (desde «${desde}»)`);
  }
  return true;
}
