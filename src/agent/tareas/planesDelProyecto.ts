import { lstatSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { CARPETA_DE_PLANES, RUTA_PLANES } from "../../core/planes.js";

/**
 * **Qué planes hay en el proyecto, para el juez**: carpeta, ficheros y cuánto hace que se tocaron. Nunca su contenido.
 *
 * Los planes viven en `.xonecode/planes/`, fuera de git, así que nunca salen en «lo que cambió según git», que es el
 * único hecho sobre el disco que tenía el juez. Medido en Maset (liquidaciones, 21-10-2026): «el diff no incluye ningún
 * plan en /planes/liquidaciones-lista/» con PLAN.md, DISENO.md y TASKS.md escritos por la tarea.
 *
 * Solo carpetas y ficheros de VERDAD (`lstat`): un enlace no cuenta, la misma regla que al publicar un plan. Lo que no se
 * puede leer no es un plan: `[]`, y entonces el juez lee «no hay ningún plan», que es lo que se puede afirmar.
 */
export interface PlanEnDisco {
  /** La ruta virtual de la carpeta, `/planes/<nombre>/`: la que nombran el encargo y los agentes. */
  carpeta: string;
  ficheros: string[];
  /** Hace cuántos minutos se tocó su fichero más reciente. */
  minutos: number;
}

export function planesDelProyecto(raiz: string, ahora: number = Date.now()): PlanEnDisco[] {
  const base = join(raiz, CARPETA_DE_PLANES);
  let nombres: string[];
  try {
    nombres = readdirSync(base);
  } catch {
    return [];
  }
  const planes: PlanEnDisco[] = [];
  for (const nombre of nombres) {
    try {
      if (!lstatSync(join(base, nombre)).isDirectory()) continue;
      const ficheros = readdirSync(join(base, nombre))
        .map((f) => ({ f, s: lstatSync(join(base, nombre, f)) }))
        .filter(({ s }) => s.isFile());
      if (ficheros.length === 0) continue;
      const ultimo = Math.max(...ficheros.map(({ s }) => s.mtimeMs));
      planes.push({
        carpeta: `${RUTA_PLANES}${nombre}/`,
        ficheros: ficheros.map(({ f }) => f).sort(),
        minutos: Math.max(0, Math.round((ahora - ultimo) / 60_000)),
      });
    } catch {
      // Una carpeta que se borra mientras se mira no es un plan.
    }
  }
  return planes.sort((a, b) => a.minutos - b.minutos);
}
