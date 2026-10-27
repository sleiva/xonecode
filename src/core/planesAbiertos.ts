/**
 * Por dónde va cada plan, pegado al turno: el arranque barato de un «continúa».
 *
 * **Existe por una medida** (soportes de Busme, ver `docs/DECISIONES.md`): en cada «continúa» el orquestador releía el
 * `TASKS.md` entero —de 3 a 4 veces por sesión, 12–15 K caracteres cada vez— solo para saber qué faltaba, y cada
 * lectura se quedaba en la ventana para el resto del turno. Lo que necesita para decidir son unas pocas líneas: qué
 * tareas siguen abiertas, por dónde van y dónde está su ficha.
 *
 * Es el patrón de `conHechosDelProyecto`: se calcula al MANDAR el turno, no al abrir la sesión, porque los
 * especialistas marcan casillas y estados dentro del turno y una foto de la sesión envejecería. El `TASKS.md` sigue
 * siendo la autoridad; esto dice DÓNDE mirar (`offset`/`limit` de la ficha), no sustituye a la ficha.
 *
 * Puro y en `core/`: quién lee el disco es de `agent/` (`planesEnDisco.ts`).
 */
import { RUTA_PLANES } from "./planes.js";
import type { ProgresoDeTarea, TareasDelPlan } from "./tareasDelPlan.js";

/** Lo que hace falta de un plan para resumirlo: su nombre y sus tareas leídas. */
export interface PlanParaResumir {
  nombre: string;
  tareas?: TareasDelPlan;
}

/** Cuántos planes con tareas abiertas se cuentan; el resto se CUENTA, no se calla. Vienen de lo más reciente a lo más viejo. */
export const TOPE_DE_PLANES = 4;
/** Cuántas tareas abiertas por plan; las demás se cuentan. */
export const TOPE_DE_TAREAS = 15;

const PALABRA: Record<ProgresoDeTarea, string> = {
  pendiente: "pendiente",
  "en-curso": "en curso",
  implementada: "implementada, sin comprobar del todo",
  finalizada: "finalizada",
};

/**
 * La petición con los planes abiertos detrás. Sin ningún plan con tareas abiertas devuelve la petición TAL CUAL: un
 * bloque que dice «no hay nada» se lee como «el plan está terminado» cuando puede que no se haya podido leer.
 */
export function conPlanesAbiertos(peticion: string, planes: readonly PlanParaResumir[]): string {
  const abiertos = planes.filter((p) => p.tareas !== undefined && p.tareas.tareas.some((t) => t.progreso !== "finalizada"));
  if (abiertos.length === 0) return peticion;
  const visibles = abiertos.slice(0, TOPE_DE_PLANES);
  const lineas = [
    peticion,
    "",
    "PLANES ABIERTOS, leídos al empezar este turno (el TASKS.md de cada uno manda; esto dice por dónde va y dónde mirar):",
  ];
  for (const plan of visibles) {
    const tareas = plan.tareas!.tareas;
    const abiertas = tareas.filter((t) => t.progreso !== "finalizada");
    const ruta = `${RUTA_PLANES}${plan.nombre}/TASKS.md`;
    const titulo = plan.tareas!.titulo === undefined ? "" : ` «${plan.tareas!.titulo}»`;
    lineas.push(`- ${ruta}${titulo}: ${tareas.length - abiertas.length} de ${tareas.length} tareas finalizadas. Abiertas:`);
    for (const t of abiertas.slice(0, TOPE_DE_TAREAS)) {
      const criterios = t.criterios.total > 0 ? `, ${t.criterios.hechos}/${t.criterios.total} criterios` : "";
      const bloqueo = t.bloqueadaPor.length > 0 ? `, bloqueada por ${t.bloqueadaPor.join(", ")}` : "";
      lineas.push(`  - ${t.numero} ${t.titulo} — ${PALABRA[t.progreso]}${criterios}${bloqueo} (ficha: offset=${t.linea - 1} limit=${t.lineas})`);
    }
    if (abiertas.length > TOPE_DE_TAREAS) lineas.push(`  (y ${abiertas.length - TOPE_DE_TAREAS} abiertas más: están en el TASKS.md)`);
  }
  if (abiertos.length > TOPE_DE_PLANES) lineas.push(`(y ${abiertos.length - TOPE_DE_PLANES} planes abiertos más en ${RUTA_PLANES})`);
  lineas.push(
    "Para seguir NO releas el TASKS.md entero: lee con read_file solo la ficha de la tarea que vas a encargar (su offset",
    "y limit) y dale al especialista el plan, la tarea y ese offset y limit. El PLAN.md, solo si la ficha no basta.",
  );
  return lineas.join("\n");
}
