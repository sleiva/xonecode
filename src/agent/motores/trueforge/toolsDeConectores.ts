/**
 * Las tools de los CONECTORES MCP del proyecto (Stitch…) dentro de TrueForge.
 *
 * No se habla con el servidor MCP desde aquí: todo pasa por el `ConectoresPort`, que en la web es
 * el MISMO `ServicioDeConectores` de Ajustes —con su credencial, sus guardas y su tope—. Esta
 * pieza solo traduce: el esquema de cada tool entra LIMPIO para cualquier proveedor
 * (`esquemaParaElModelo`: sin `x-…` ni `$ref`) y la llamada es `llamar` con el tope largo
 * (`TOPE_DE_LLAMADA_MS`).
 *
 * **Dos fuentes y no una**: las de LECTURA (`readOnlyHint: true`) y el resto. La librería decide
 * la aprobación por conjunto, y su etiqueta `@write` exige `readOnlyHint === false` — una tool
 * SIN anotación (las de DeepWiki no traen ninguna) no pediría aprobación. Aquí lo que no se
 * declara de lectura ESCRIBE.
 *
 * **Se pregunta a la red una vez por sesión, y tarde**: al primer `listTools` de cualquiera de las
 * dos fuentes, no al abrir la sesión. Un conector que no contesta (sin clave, sin red) se queda sin
 * tools y la sesión abre igual. **Límite declarado**: un conector marcado con la sesión abierta no
 * llega hasta la siguiente, el mismo trato que una skill nueva.
 */
import { toolResultResponse } from "./trueforge.js";
import { desalojarSiGrande, type EscritorDeDesalojo } from "./recortes.js";
import {
  esquemaParaElModelo, nombreDeToolDeConector, resultadoRecortado, TOPE_DE_LLAMADA_MS, type ConectorParaElAgente, type ToolConEsquema,
} from "../../../core/conectores.js";
import type { ConectoresPort } from "../../../core/ports.js";
import type { LineaDeDiff } from "../../../core/diff.js";

/** Una tool de un conector, ya con el nombre con que la ve el agente. */
export interface ToolMontada {
  nombre: string;
  conector: { id: string; nombre: string };
  tool: ToolConEsquema;
  /** Los campos que el catálogo le quita a su resultado (`camposFueraDelResultado`). */
  recortar?: readonly string[];
}

export type ClaseDeTool = "lectura" | "escritura";

/** Cuánto se espera antes de repetir una tool de LECTURA que falló (Stitch devolvió una vez «The service is currently unavailable»). */
export const PAUSA_ANTES_DE_REPETIR_MS = 2000;

/** Un fallo que repetir no arregla: falta la credencial, o el conector ya no está. */
function esFalloDeConfiguracion(mensaje: string): boolean {
  return /falta autorizar|no está conectado|autorización en curso/.test(mensaje);
}

export interface ConectoresDeSesion {
  /** Hay algún conector que montar (sin preguntar a la red). */
  readonly hay: boolean;
  /** El `ToolSource` de TrueForge con las tools de esa clase. */
  fuente(clase: ClaseDeTool, backend: EscritorDeDesalojo): Record<string, unknown>;
  /** La tool REMOTA que escribe con ese nombre, si lo es. Para la tarjeta de aprobación. */
  remotaDe(nombre: string): ToolMontada | undefined;
}

export function crearConectoresDeSesion(
  puerto: ConectoresPort,
  conectores: readonly ConectorParaElAgente[],
  esperar: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))
): ConectoresDeSesion {
  const montadas = new Map<string, ToolMontada>();
  let carga: Promise<void> | undefined;
  const cargar = (): Promise<void> =>
    (carga ??= Promise.all(
      conectores.map(async (c) => {
        const tools = await puerto.tools(c.id).catch(() => [] as ToolConEsquema[]);
        for (const tool of tools) {
          if (c.fueraDelAgente.includes(tool.nombre)) continue;
          const nombre = nombreDeToolDeConector(c.id, tool.nombre);
          if (nombre === undefined || montadas.has(nombre)) continue;
          const recortar = c.camposFueraDelResultado[tool.nombre];
          montadas.set(nombre, { nombre, conector: { id: c.id, nombre: c.nombre }, tool, ...(recortar === undefined ? {} : { recortar }) });
        }
      })
    ).then(() => {}));
  const claseDe = (m: ToolMontada): ClaseDeTool => (m.tool.soloLectura === true ? "lectura" : "escritura");

  return {
    hay: conectores.length > 0,
    fuente(clase, backend) {
      const id = `xone-conectores-${clase}`;
      return {
        name: id,
        id,
        listTools: async () => {
          await cargar();
          return {
            result: {
              tools: [...montadas.values()]
                .filter((m) => claseDe(m) === clase)
                .map((m) => ({
                  name: m.nombre,
                  description: descripcionDe(m, clase),
                  inputSchema: esquemaParaElModelo(m.tool.esquema) as { type: "object" },
                  preload: true,
                })),
            },
            wasInitialized: undefined,
          };
        },
        callTool: async (params: { name: string; arguments?: Record<string, unknown> }) => {
          await cargar();
          const m = montadas.get(params.name);
          if (m === undefined || claseDe(m) !== clase) return toolResultResponse({ text: `tool desconocida: ${params.name}`, isError: true });
          const args = params.arguments ?? {};
          const llamar = () => puerto.llamar(m.conector.id, m.tool.nombre, args, { topeMs: TOPE_DE_LLAMADA_MS });
          try {
            let texto: string;
            try {
              texto = await llamar();
            } catch (e) {
              // Solo se REPITE lo que lee: una generación repetida gasta otra y puede duplicar lo
              // creado (`idempotentHint: false`). La que escribe devuelve su fallo y decide el modelo.
              const mensaje = e instanceof Error ? e.message : String(e);
              if (clase !== "lectura" || esFalloDeConfiguracion(mensaje)) throw e;
              await esperar(PAUSA_ANTES_DE_REPETIR_MS);
              texto = await llamar();
            }
            return toolResultResponse({ text: await desalojarSiGrande(resultadoRecortado(texto, m.recortar ?? []), backend), isError: false });
          } catch (e) {
            // Un fallo se DEVUELVE, nunca se lanza: una excepción se lleva el turno y el agente no reintenta.
            return toolResultResponse({ text: `${m.conector.nombre}: ${e instanceof Error ? e.message : String(e)}`, isError: true });
          }
        },
        toolCallInfo: async (params: { name: string }) => ({
          type: "mcp" as const,
          mcp_server_id: id,
          mcp_server_name: id,
          original_tool_name: params.name,
        }),
      };
    },
    remotaDe(nombre) {
      const m = montadas.get(nombre);
      return m !== undefined && claseDe(m) === "escritura" ? m : undefined;
    },
  };
}

/** La descripción que ve el modelo: de qué conector es y, si escribe, que pasa por una persona. */
function descripcionDe(m: ToolMontada, clase: ClaseDeTool): string {
  const base = `[${m.conector.nombre}] ${m.tool.descripcion ?? m.tool.nombre}`;
  return clase === "lectura"
    ? base
    : `${base}\n\nESCRIBE en la cuenta de ${m.conector.nombre} del usuario: cada llamada espera a que una persona la apruebe.`;
}

/**
 * La tarjeta de aprobación de una tool remota: qué conector, qué tool y sus argumentos ENTEROS —
 * es el único sitio donde los argumentos de una tool se enseñan (`core/events.ts`), y aquí se
 * DECIDE sobre ellos—. Van como líneas añadidas del diff, que es lo que la tarjeta ya pinta.
 */
export function tarjetaDeRemota(m: ToolMontada, args: Record<string, unknown>): { descripcion: string; lineas: LineaDeDiff[] } {
  return {
    descripcion: `quiere usar ${m.conector.nombre}: ${m.tool.nombre} (escribe en tu cuenta de ${m.conector.nombre})`,
    lineas: JSON.stringify(args, null, 2).split("\n").map((texto) => ({ tipo: "anadido" as const, texto })),
  };
}
