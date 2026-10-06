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
import { NOMBRE_INCORPORAR_ADJUNTO } from "../../../core/adjuntos.js";
import { NOMBRE_TRAER_FUENTE } from "../../../core/fuentes.js";

/**
 * Las tools PROPIAS que escriben un BINARIO en el proyecto, con el principio de su texto de éxito. Sin contarlas, el
 * informe decía «SIN escribir ningún fichero» de un diseñador que había traído siete fuentes, y el orquestador fue a
 * comprobarlo al disco y mandó al de pruebas a mirar si estaban sanas (pasada real con la maqueta de la calculadora).
 */
export const ESCRITURAS_BINARIAS: Readonly<Record<string, string>> = {
  [NOMBRE_TRAER_FUENTE]: "Escrito ",
  [NOMBRE_INCORPORAR_ADJUNTO]: "Incorporado ",
};

export interface CambioDeFichero {
  ediciones: number;
  /** Lo creó `write_file` en este encargo. */
  nuevo: boolean;
  mas: number;
  menos: number;
  /** Lo escribió una tool de BINARIOS (`ESCRITURAS_BINARIAS`): no hay líneas que contar. */
  binario?: boolean;
}

const lineas = (t: unknown): number => (typeof t === "string" && t !== "" ? t.replace(/\n$/, "").split("\n").length : 0);

/** ¿Es `nombre` una tool de binarios? Por clave PROPIA: `in` daría por buena `constructor`. */
export function esEscrituraBinaria(nombre: string): boolean {
  return Object.hasOwn(ESCRITURAS_BINARIAS, nombre);
}

/** Lo que suma UNA escritura que salió bien, por sus argumentos (los de la tool, que nunca salen de aquí). */
export function anotarEscritura(
  cambios: Map<string, CambioDeFichero>,
  nombre: string,
  args: Record<string, unknown>
): void {
  const ruta = typeof args["file_path"] === "string" ? args["file_path"] : undefined;
  if (ruta === undefined) return;
  if (esEscrituraBinaria(nombre)) {
    // El destino se normaliza como lo escribe la tool (`/fonts/…`): el modelo puede pasarlo sin la barra.
    const virtual = ruta.startsWith("/") ? ruta : `/${ruta}`;
    const antes = cambios.get(virtual) ?? { ediciones: 0, nuevo: false, mas: 0, menos: 0 };
    cambios.set(virtual, { ...antes, ediciones: antes.ediciones + 1, binario: true });
    return;
  }
  const previo = cambios.get(ruta) ?? { ediciones: 0, nuevo: false, mas: 0, menos: 0 };
  if (nombre !== "write_file" && nombre !== "edit_file") return;
  if (nombre === "write_file") {
    cambios.set(ruta, { ediciones: previo.ediciones + 1, nuevo: previo.ediciones === 0 ? true : previo.nuevo, mas: previo.mas + lineas(args["content"]), menos: previo.menos });
  } else {
    cambios.set(ruta, { ...previo, ediciones: previo.ediciones + 1, mas: previo.mas + lineas(args["new_string"]), menos: previo.menos + lineas(args["old_string"]) });
  }
}

/**
 * ¿Salió bien? El texto de éxito es el de `toolsDeFichero.ts#ejecutar`, o el de la tool de binarios
 * (`ESCRITURAS_BINARIAS`); un rechazo o un error no cuenta.
 */
export function escrituraConExito(contenido: unknown, nombre?: string): boolean {
  if (typeof contenido !== "string") return false;
  const binaria = nombre !== undefined && esEscrituraBinaria(nombre) ? ESCRITURAS_BINARIAS[nombre] : undefined;
  return contenido.startsWith(binaria ?? "Successfully");
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
      c.binario === true
        ? `- ${ruta}: fichero binario${c.ediciones > 1 ? `, escrito ${c.ediciones} veces` : ""}`
        : c.nuevo
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
