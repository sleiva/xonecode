import type { PlanDelCable, TareaDelPlanDelCable } from "./tipos.js";

/**
 * Los planes tal como llegan por el cable, VALIDADOS campo a campo: lo que el store guarda es
 * esto. Un plan o una tarea mal formados se descartan solos; lo que no es una lista devuelve
 * `undefined`, que NO es «no hay planes» —eso es la lista vacía—.
 */
export function leerPlanesDelCable(valor: unknown): PlanDelCable[] | undefined {
  if (!Array.isArray(valor)) return undefined;
  return valor.flatMap((p): PlanDelCable[] => {
    if (typeof p !== "object" || p === null) return [];
    const x = p as Record<string, unknown>;
    if (typeof x.nombre !== "string" || typeof x.modificado !== "number") return [];
    const ficheros = Array.isArray(x.ficheros) ? x.ficheros.filter((f): f is string => typeof f === "string") : [];
    const tareas = leerTareas(x.tareas);
    const plan = x.plan as { texto?: unknown; recortado?: unknown } | undefined;
    return [
      {
        nombre: x.nombre,
        ficheros,
        ...(tareas === undefined ? {} : { tareas }),
        ...(plan !== undefined && plan !== null && typeof plan.texto === "string"
          ? { plan: { texto: plan.texto, recortado: plan.recortado === true } }
          : {}),
        modificado: x.modificado,
      },
    ];
  });
}

function leerTareas(valor: unknown): PlanDelCable["tareas"] {
  if (typeof valor !== "object" || valor === null) return undefined;
  const v = valor as { titulo?: unknown; tareas?: unknown };
  if (!Array.isArray(v.tareas)) return undefined;
  const tareas = v.tareas.flatMap((t): TareaDelPlanDelCable[] => {
    if (typeof t !== "object" || t === null) return [];
    const x = t as Record<string, unknown>;
    const c = x.criterios as { hechos?: unknown; total?: unknown } | undefined;
    if (typeof x.numero !== "string" || typeof x.titulo !== "string" || typeof x.cuerpo !== "string") return [];
    if (c === undefined || c === null || typeof c.hechos !== "number" || typeof c.total !== "number") return [];
    return [
      {
        numero: x.numero,
        titulo: x.titulo,
        ...(typeof x.estado === "string" ? { estado: x.estado } : {}),
        bloqueadaPor: Array.isArray(x.bloqueadaPor) ? x.bloqueadaPor.filter((n): n is string => typeof n === "string") : [],
        ...(typeof x.bloqueadaPorTexto === "string" ? { bloqueadaPorTexto: x.bloqueadaPorTexto } : {}),
        criterios: { hechos: c.hechos, total: c.total },
        cuerpo: x.cuerpo,
      },
    ];
  });
  return { ...(typeof v.titulo === "string" ? { titulo: v.titulo } : {}), tareas };
}
