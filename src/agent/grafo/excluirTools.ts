/**
 * Quita del PROMPT las tools que un agente no puede usar.
 *
 * ## Por qué, medido el 17-09-2026
 *
 * El inspector (`agent/turno/inspectorDePrompt.ts`) enseñó que en un turno de la pregunta más
 * barata que tenemos, los esquemas de las tools eran **12.350 de los 14.135 caracteres** de la
 * primera llamada — el 87 % — y que se reenvían ENTEROS en cada una: ~12.400 de los 15.466
 * tokens del turno. La pregunta ocupaba cuarenta caracteres.
 *
 * Y dentro de eso, el orquestador —que es de SOLO LECTURA por `permisosDe`— cargaba los
 * esquemas de `write_file`, `edit_file` y `delete`: 3.743 caracteres, unos 940 tokens POR
 * LLAMADA, por tres tools que tiene prohibido usar. `permissions` acota el PERMISO; el esquema
 * viaja igual.
 *
 * ## Qué es y qué NO es
 *
 * **No es una frontera de seguridad**, y eso no es una opinión nuestra: deepagents tiene el
 * mismo middleware (`createToolExclusionMiddleware`, que no exporta) y su propia documentación
 * lo dice con esas palabras — «exclusions calibrate the agent per model; they are not a security
 * boundary». La frontera sigue siendo `permisosDe`, intacta, y esto es coste.
 *
 * Por eso hace las DOS cosas: quita la tool de la petición (que es lo que ahorra) **y** rechaza
 * su llamada si aun así llegara. Solo lo primero sería fiar la barrera a que el modelo no
 * invente un nombre que no ha visto, y en este repo eso no es una barrera.
 */

import { ToolMessage } from "@langchain/core/messages";
import { createMiddleware } from "langchain";
import { toolsDe, type QuienDecidePermisos } from "./perfiles.js";

function nombreDeTool(t: unknown): string | undefined {
  const n = (t as { name?: unknown } | null)?.name;
  return typeof n === "string" ? n : undefined;
}

export function excluirTools(nombres: readonly string[]): ReturnType<typeof createMiddleware> {
  const fuera = new Set(nombres);
  return createMiddleware({
    name: "ExcluirToolsMiddleware",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    wrapModelCall: (request: any, handler: any) => {
      const tools = request?.tools;
      if (!Array.isArray(tools)) return handler(request);
      const quedan = tools.filter((t: unknown) => {
        const n = nombreDeTool(t);
        // Una tool sin nombre legible no se descarta: no se puede afirmar que sea una de las
        // excluidas, y quitar de más deja al agente sin capacidades en silencio.
        return n === undefined || !fuera.has(n);
      });
      return quedan.length === tools.length ? handler(request) : handler({ ...request, tools: quedan });
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    wrapToolCall: (request: any, handler: any) => {
      const nombre = request?.toolCall?.name;
      if (typeof nombre !== "string" || !fuera.has(nombre)) return handler(request);
      return new ToolMessage({
        content: `Error: ${nombre} no está disponible para este agente.`,
        tool_call_id: request?.toolCall?.id ?? "",
      });
    },
  });
}

/**
 * Todas las tools de fichero que monta `createFilesystemMiddleware`.
 *
 * `delete` no está en `TOOLS_LECTURA` ni en `TOOLS_ESCRITURA` porque ningún perfil nuestro la
 * concede: la monta la librería y nadie la usa, así que su esquema viaja en cada llamada de
 * cada agente sin comprar nada.
 */
const TOOLS_DE_FICHERO = ["ls", "read_file", "glob", "grep", "write_file", "edit_file", "delete"] as const;

/**
 * Las que este perfil NO puede usar, DERIVADAS de lo que ya decide `toolsDe`.
 *
 * Escritas a mano serían una segunda lista que hay que acordarse de actualizar, y el día que un
 * perfil gane una capacidad se quedaría sin ella en silencio — el patrón de fallo de este repo.
 * Así, conceder una tool en `perfiles.ts` la saca de aquí sola.
 */
export function toolsQueNoUsa(perfil: QuienDecidePermisos): string[] {
  const puede = new Set(toolsDe(perfil));
  return TOOLS_DE_FICHERO.filter((t) => !puede.has(t));
}
