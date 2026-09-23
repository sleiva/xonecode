/**
 * Las tools PROPIAS de xonecode —las que no son de fichero— en TrueForge.
 *
 * En deepagents son tools de LangChain (`tool()` de `@langchain/core`): `xone_navegacion`,
 * `regex_search`, `copiar_artefacto`, la crítica visual y traer de la máquina. No se reescriben
 * para este motor: un segundo sitio donde decidir qué contesta `xone_navegacion` sería un segundo
 * sitio donde las dos respuestas pueden divergir. Se ADAPTAN: el esquema sale del de la tool y la
 * llamada es su `invoke`, así que lo que hace cada una —sus guardas incluidas, que ya re-aplican
 * `puedeLeerRuta` a mano porque tampoco en deepagents pasan por el middleware de permisos— es el
 * mismo código en los dos motores.
 */
import { toolResultResponse } from "@truefoundry/trueforge-core/core";
import { toJsonSchema } from "@langchain/core/utils/json_schema";
import { desalojarSiGrande, type EscritorDeDesalojo } from "./recortes.js";

/** Lo que se usa de una tool de LangChain: su nombre, su descripción, su esquema y llamarla. */
export interface ToolDeLangchain {
  name: string;
  description: string;
  schema: unknown;
  invoke(entrada: unknown): Promise<unknown>;
}

/** El texto de lo que devuelve una tool de LangChain: una cadena, o un `ToolMessage`. */
function textoDeResultado(r: unknown): string {
  if (typeof r === "string") return r;
  const contenido = (r as { content?: unknown } | null)?.content;
  if (typeof contenido === "string") return contenido;
  return JSON.stringify(r ?? "");
}

/** Un `ToolSource` de TrueForge con estas tools, llamadas tal cual. */
export function fuenteDeLangchain(tools: readonly ToolDeLangchain[], backend: EscritorDeDesalojo) {
  const porNombre = new Map(tools.map((t) => [t.name, t]));
  return {
    name: "xone-propias",
    id: "xone-propias",
    listTools: async () => ({
      result: {
        tools: tools.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: toJsonSchema(t.schema as never) as { type: "object" },
          preload: true,
        })),
      },
      wasInitialized: undefined,
    }),
    callTool: async (params: { name: string; arguments?: Record<string, unknown> }) => {
      const t = porNombre.get(params.name);
      if (t === undefined) return toolResultResponse({ text: `tool desconocida: ${params.name}`, isError: true });
      try {
        // Las propias SÍ se desalojan cuando son grandes: no son de fichero, y en deepagents el
        // `FilesystemMiddleware` solo exime a esas (`recortes.ts`).
        const texto = await desalojarSiGrande(textoDeResultado(await t.invoke(params.arguments ?? {})), backend);
        return toolResultResponse({ text: texto, isError: false });
      } catch (e) {
        // Una tool que LANZA —un argumento que no pasa su esquema, por ejemplo— no tumba el turno:
        // se le devuelve al modelo, que puede corregirse, como las guardas.
        return toolResultResponse({ text: e instanceof Error ? e.message : String(e), isError: true });
      }
    },
    toolCallInfo: async (params: { name: string }) => ({
      type: "mcp" as const,
      mcp_server_id: "xone-propias",
      mcp_server_name: "xone-propias",
      original_tool_name: params.name,
    }),
  };
}
