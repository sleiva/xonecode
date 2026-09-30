/**
 * Lo que ESCRIBIÓ un hijo, contado por el harness y entregado a quien lo llamó.
 *
 * Existe por una pasada real (calc10): el orquestador releyó `MenuPrincipal.xne` seis veces y la maqueta cinco tras
 * las vueltas de sus especialistas, porque lo único que le volvía era el texto del hijo y no se fiaba de él. Ninguno
 * de los harnesses revisados (opencode, qwen-code, aider, deepseek-harness, TrueForge) le pasa al padre qué cambió el
 * hijo; aquí el harness ya lo sabe —cada `write_file`/`edit_file` que salió bien pasa por la sesión—, así que se le
 * DICE: qué ficheros, cuántas ediciones y cuántas líneas entran y salen. Nunca el contenido.
 *
 * Llega como UN mensaje de usuario antes de la siguiente llamada del padre (`capacidadDeInformesDeHijos`), el mismo
 * camino que los avisos de vueltas: la respuesta del hijo ya la entregó la librería y no se reescribe.
 */
import type { Capacidad } from "./capacidades.js";

export interface CambioDeFichero {
  ediciones: number;
  /** Lo creó `write_file` en este encargo. */
  nuevo: boolean;
  mas: number;
  menos: number;
}

const lineas = (t: unknown): number => (typeof t === "string" && t !== "" ? t.replace(/\n$/, "").split("\n").length : 0);

/** Lo que suma UNA escritura que salió bien, por sus argumentos (los de la tool, que nunca salen de aquí). */
export function anotarEscritura(
  cambios: Map<string, CambioDeFichero>,
  nombre: string,
  args: Record<string, unknown>
): void {
  const ruta = typeof args["file_path"] === "string" ? args["file_path"] : undefined;
  if (ruta === undefined || (nombre !== "write_file" && nombre !== "edit_file")) return;
  const previo = cambios.get(ruta) ?? { ediciones: 0, nuevo: false, mas: 0, menos: 0 };
  if (nombre === "write_file") {
    cambios.set(ruta, { ediciones: previo.ediciones + 1, nuevo: previo.ediciones === 0 ? true : previo.nuevo, mas: previo.mas + lineas(args["content"]), menos: previo.menos });
  } else {
    cambios.set(ruta, { ...previo, ediciones: previo.ediciones + 1, mas: previo.mas + lineas(args["new_string"]), menos: previo.menos + lineas(args["old_string"]) });
  }
}

/** ¿Salió bien? El texto de éxito es el de `toolsDeFichero.ts#ejecutar`; un rechazo o un error no cuenta. */
export function escrituraConExito(contenido: unknown): boolean {
  return typeof contenido === "string" && contenido.startsWith("Successfully");
}

/**
 * El informe para el padre. `escribe` dice si el hijo podía escribir el proyecto: a uno que no podía no se le
 * atribuye nada, y a uno que podía y no escribió se le dice —un «ya está hecho» sin ninguna escritura es justo lo
 * que el padre tiene que saber—.
 */
export function textoDelInforme(quien: string, cambios: ReadonlyMap<string, CambioDeFichero>, escribe: boolean, medida?: string): string | undefined {
  const lineaDeMedida = medida === undefined ? [] : [`Última medida de su pantalla contra la maqueta, hecha por el harness: ${medida}.`];
  if (cambios.size === 0) {
    return escribe ? [`[harness] ${quien} ha terminado su encargo SIN escribir ningún fichero.`, ...lineaDeMedida].join("\n") : undefined;
  }
  const filas = [...cambios.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([ruta, c]) =>
      c.nuevo
        ? `- ${ruta}: nuevo${c.ediciones > 1 ? ` y ${c.ediciones - 1} edición(es) después` : ""}, +${c.mas} −${c.menos} líneas`
        : `- ${ruta}: ${c.ediciones} edición(es), +${c.mas} −${c.menos} líneas`
    );
  return [
    `[harness] Lo que ESCRIBIÓ ${quien} en su encargo, contado por el harness (no por su informe):`,
    ...filas,
    ...lineaDeMedida,
    "Para saber QUÉ ficheros cambió no hace falta releerlos; léelos solo si necesitas su contenido.",
  ].join("\n");
}

/**
 * Entrega, antes de la siguiente llamada del hilo, los informes que le esperan (`pendientes` los CONSUME: cada uno
 * sale una vez). Va en el raíz y en quien puede llamar a otros. No añade tools.
 */
export function capacidadDeInformesDeHijos(pendientes: (hilo: string) => string[]): Capacidad {
  return {
    nombre: "informes-de-hijos",
    tools: [],
    capability: {
      preLLMProcessors: [
        {
          async *processPreLLM(execution: { threadId: string }) {
            const textos = pendientes(execution.threadId);
            if (textos.length === 0) return;
            yield { type: "internal.agent.context.append", context: [{ role: "user", content: textos.join("\n\n") }], output: [] };
          },
        },
      ],
    },
  };
}
