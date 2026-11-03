/**
 * `siguiente_tarea`, la tool del desarrollador CONTINUO (`core/siguienteTarea.ts`): cierra la tarea en la que está y le
 * devuelve la ficha de la siguiente como RESULTADO, para que siga en la misma conversación. Lo que decide qué tarea toca
 * y qué ficha lleva es código (`siguienteTareaPendiente`, `decidirEncargo`); lo que pasa al cambiar de tarea —sus topes por
 * tarea vuelven a cero— lo hace quien la monta (`alPasar`).
 *
 * Un rechazo se DEVUELVE como texto, nunca se lanza: una excepción se llevaría el turno.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { decidirEncargo } from "../../../core/encargoDeTarea.js";
import { CARPETA_DE_PLANES } from "../../../core/planes.js";
import { leerTareasDelPlan } from "../../../core/tareasDelPlan.js";
import {
  DESCRIPCION_DE_SIGUIENTE_TAREA,
  NOMBRE_SIGUIENTE_TAREA,
  siguienteTareaPendiente,
  textoDeSiguienteTarea,
  textoSinMasTareas,
} from "../../../core/siguienteTarea.js";

export interface EstadoDelContinuo {
  plan: string;
  tarea: string;
  cerradas: string[];
}

export function crearSiguienteTarea(opciones: {
  raiz: string;
  /** El nombre del especialista que la tiene (para componer la ficha como en su primer encargo). */
  nombre: string;
  /** El hilo VIVO de ese especialista y su estado, si está trabajando un plan. */
  estado: () => { hilo: string; estado: EstadoDelContinuo } | undefined;
  /** Al pasar a `nueva`: actualizar el estado y poner a cero lo que se cuenta por tarea. */
  alPasar: (hilo: string, nueva: EstadoDelContinuo) => void;
}) {
  const leerTasks = (plan: string): string | undefined => {
    try {
      return readFileSync(join(opciones.raiz, CARPETA_DE_PLANES, plan, "TASKS.md"), "utf8");
    } catch {
      return undefined;
    }
  };
  return tool(
    async ({ resumen }: { resumen: string }) => {
      const vivo = opciones.estado();
      if (vivo === undefined) return "No estás trabajando una tarea de un plan en este encargo: no hay siguiente. Termina con tu informe.";
      const { hilo, estado } = vivo;
      const texto = leerTasks(estado.plan);
      if (texto === undefined) return `No se pudo leer /planes/${estado.plan}/TASKS.md: termina con tu informe.`;
      const cerradas = [...estado.cerradas, estado.tarea];
      const siguiente = siguienteTareaPendiente(leerTareasDelPlan(texto).tareas, estado.tarea, new Set(cerradas));
      if (siguiente === undefined) {
        opciones.alPasar(hilo, { ...estado, cerradas });
        return textoSinMasTareas(estado.plan, cerradas);
      }
      // La ficha de la siguiente, compuesta EXACTAMENTE como la del primer encargo (`decidirEncargo`).
      const decision = decidirEncargo(opciones.nombre, `TAREA: ${siguiente.numero}\n\nPlan: /planes/${estado.plan}/ · ${resumen.slice(0, 300)}`, leerTasks);
      if (decision.tipo !== "tarea") return textoSinMasTareas(estado.plan, cerradas);
      opciones.alPasar(hilo, { plan: estado.plan, tarea: siguiente.numero, cerradas });
      return textoDeSiguienteTarea(estado.tarea, decision.encargo);
    },
    {
      name: NOMBRE_SIGUIENTE_TAREA,
      description: DESCRIPCION_DE_SIGUIENTE_TAREA,
      schema: z.object({ resumen: z.string().describe("Una línea: qué quedó hecho y probado de la tarea que cierras, o por qué no avanza.") }),
    }
  );
}
