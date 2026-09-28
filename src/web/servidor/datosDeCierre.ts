/**
 * Reúne lo que el harness sabe de una sesión para el comentario de cierre de su tarea vinculada
 * (Task 9, IXCODE-11): ficheros y commits de `sesionGit.ts`, el último veredicto del verificador
 * y la última respuesta del asistente, leídos de `reabrirSesion`. El FORMATO es puro y vive en
 * `core/gestorDeTareas.ts#comentarioDeCierre`; aquí solo se compone desde disco.
 *
 * **El `plan` se deja SIN componer**: hoy no hay una forma simple de saber a qué
 * `.xonecode/planes/<slug>/` sigue esta sesión —`EntradaIndice.ticket` liga con Jira, no con un
 * plan— así que inventar ese enlace aquí sería una relación que el resto del código no sostiene.
 * Queda pendiente para quien conecte esta pieza con la pestaña Planes.
 */
import type { Acto } from "../../core/actos.js";
import type { DatosDeCierre } from "../../core/gestorDeTareas.js";
import { cambiosDeSesion, commitsDeSesion } from "../../agent/sesiones/sesionGit.js";
import { reabrirSesion } from "./sesiones.js";

/** Compone `DatosDeCierre` desde el disco real del proyecto: git para lo que cambió, el
 *  `.jsonl` de la sesión para el veredicto y la última respuesta. */
export async function datosDeCierre(raiz: string, id: string): Promise<DatosDeCierre> {
  const [{ ficheros }, commits] = await Promise.all([cambiosDeSesion(raiz, id), commitsDeSesion(raiz, id)]);
  const { actos } = reabrirSesion(raiz, id);
  const veredicto = ultimoVeredicto(actos);
  const resumen = ultimaRespuesta(actos);
  return {
    ficheros: ficheros.map((f) => ({ ruta: f.ruta, clase: f.clase })),
    commits,
    ...(veredicto === undefined ? {} : { veredicto }),
    ...(resumen === undefined ? {} : { resumen }),
  };
}

/** El último acto `verificacion` del transcript, o `undefined` si el verificador no corrió
 *  nunca en esta sesión — «no corrió» y no «verde» sin dato. */
function ultimoVeredicto(actos: readonly Acto[]): DatosDeCierre["veredicto"] {
  for (let i = actos.length - 1; i >= 0; i--) {
    const acto = actos[i]!;
    if (acto.tipo === "verificacion") return { verde: acto.verde, errores: acto.errores, avisos: acto.avisos };
  }
  return undefined;
}

/** La última respuesta del asistente, tal cual quedó en el transcript. */
function ultimaRespuesta(actos: readonly Acto[]): string | undefined {
  for (let i = actos.length - 1; i >= 0; i--) {
    const acto = actos[i]!;
    if (acto.tipo === "asistente") return acto.texto;
  }
  return undefined;
}
