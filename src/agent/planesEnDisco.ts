/**
 * Los planes del proyecto, leídos de `.xonecode/planes/` para la pestaña Planes.
 *
 * Solo LEE: escribir un plan es del agente (por `/planes/`, sin aprobación, ver `core/planes.ts`)
 * y publicarlo es de `/plan publicar`. Las barreras son las de `publicarPlan.ts`, por lo mismo:
 *
 * - **El nombre de la carpeta es un SLUG válido** (`motivoDePlanInaceptable`) o no se lista: de
 *   ahí sale lo que se enseña y el nombre con el que se publica.
 * - **No se sigue un enlace** (`lstat`), ni en la carpeta ni en sus ficheros: lo que se enseña es
 *   lo que el plan tiene dentro, no lo que apunta a otro sitio del disco.
 * - **Se acota lo que se lee**: un `PLAN.md` enorme no puede convertirse en un mensaje sin fondo.
 *
 * Nada de esto lleva una ruta de la máquina: el cable recibe nombres y texto del plan.
 */
import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CARPETA_DE_PLANES, FICHEROS_DE_UN_PLAN, motivoDePlanInaceptable } from "../core/planes.js";
import { leerTareasDelPlan, type TareasDelPlan } from "../core/tareasDelPlan.js";

/** Cuánto se lee de un fichero de plan. Uno real ronda los 10-15 KB. */
export const TOPE_DE_FICHERO_DE_PLAN = 128 * 1024;

export interface PlanEnDisco {
  nombre: string;
  /** Cuáles de `PLAN.md`, `TASKS.md` y `CONTEXT.md` tiene: un plan puede ir a medias. */
  ficheros: string[];
  /** Las tareas de su `TASKS.md`, si lo tiene. */
  tareas?: TareasDelPlan;
  /** El texto de su `PLAN.md`, si lo tiene, acotado. */
  plan?: { texto: string; recortado: boolean };
  /** Cuándo se tocó por última vez algo suyo, en milisegundos: para ordenar, lo reciente arriba. */
  modificado: number;
}

/** Un fichero normal del plan (nunca un enlace), leído con tope; `undefined` si no está. */
function leerAcotado(ruta: string): { texto: string; recortado: boolean; mtime: number } | undefined {
  try {
    const info = lstatSync(ruta);
    if (!info.isFile()) return undefined;
    const bytes = readFileSync(ruta);
    const recortado = bytes.length > TOPE_DE_FICHERO_DE_PLAN;
    return { texto: bytes.subarray(0, TOPE_DE_FICHERO_DE_PLAN).toString("utf8"), recortado, mtime: info.mtimeMs };
  } catch {
    return undefined;
  }
}

export function planesDelProyecto(raiz: string): PlanEnDisco[] {
  const carpeta = join(raiz, CARPETA_DE_PLANES);
  if (!existsSync(carpeta)) return [];
  const salida: PlanEnDisco[] = [];
  for (const entrada of readdirSync(carpeta, { withFileTypes: true })) {
    if (!entrada.isDirectory() || entrada.isSymbolicLink()) continue;
    if (motivoDePlanInaceptable(entrada.name) !== undefined) continue;
    const dir = join(carpeta, entrada.name);
    if (!lstatSync(dir).isDirectory()) continue;
    const leidos = new Map(
      FICHEROS_DE_UN_PLAN.flatMap((f) => {
        const leido = leerAcotado(join(dir, f));
        return leido === undefined ? [] : [[f, leido] as const];
      })
    );
    const tasks = leidos.get("TASKS.md");
    const plan = leidos.get("PLAN.md");
    salida.push({
      nombre: entrada.name,
      ficheros: [...leidos.keys()],
      ...(tasks === undefined ? {} : { tareas: leerTareasDelPlan(tasks.texto) }),
      ...(plan === undefined ? {} : { plan: { texto: plan.texto, recortado: plan.recortado } }),
      modificado: Math.max(lstatSync(dir).mtimeMs, ...[...leidos.values()].map((l) => l.mtime)),
    });
  }
  return salida.sort((a, b) => b.modificado - a.modificado);
}
