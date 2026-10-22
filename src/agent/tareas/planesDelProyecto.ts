import { lstatSync, readdirSync, readFileSync } from "node:fs";
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

/** El plan de una tarea: su carpeta virtual, la ruta de su `TASKS.md` en disco y lo que dice ahora. */
export interface PlanDeLaTarea {
  carpeta: string;
  tasks: string;
  texto: string;
}

/**
 * **Qué plan es el de una tarea de fondo**, para que al cerrarla el harness lo actualice (petición suya, 21-10-2026).
 * Primero, el que CITA su encargo (`/planes/<nombre>/`) si es uno solo; si no cita ninguno, el que la propia tarea
 * escribió mientras trabajaba —un `TASKS.md` tocado desde que empezó, el más reciente—, que es lo que pasó en las seis de
 * Maset: cada una escribió el suyo con el analista. Solo un `TASKS.md` de verdad (`lstat`); lo que no se lee no es plan.
 */
export function planDeLaTarea(raiz: string, encargo: string, desdeMs: number | undefined): PlanDeLaTarea | undefined {
  const base = join(raiz, CARPETA_DE_PLANES);
  const leer = (nombre: string): PlanDeLaTarea | undefined => {
    const tasks = join(base, nombre, "TASKS.md");
    try {
      if (!lstatSync(tasks).isFile()) return undefined;
      return { carpeta: `${RUTA_PLANES}${nombre}/`, tasks, texto: readFileSync(tasks, "utf8") };
    } catch {
      return undefined;
    }
  };
  const citados = [...new Set([...encargo.matchAll(/\/planes\/([a-z0-9][a-z0-9_-]*)\//gi)].map((m) => m[1]!))];
  if (citados.length === 1) return leer(citados[0]!);
  if (citados.length > 1 || desdeMs === undefined) return undefined;
  let mejor: { nombre: string; ms: number } | undefined;
  try {
    for (const nombre of readdirSync(base)) {
      try {
        const ms = lstatSync(join(base, nombre, "TASKS.md")).mtimeMs;
        if (ms >= desdeMs && (mejor === undefined || ms > mejor.ms)) mejor = { nombre, ms };
      } catch {
        // Una carpeta sin TASKS.md no es el plan de nadie.
      }
    }
  } catch {
    return undefined;
  }
  return mejor === undefined ? undefined : leer(mejor.nombre);
}
