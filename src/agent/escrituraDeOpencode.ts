/**
 * Qué puede escribir un agente externo con motor **opencode**, y quién lo autoriza.
 *
 * El tercer motor, y el que menos código propio necesita: su petición de permiso trae TODO en
 * un solo mensaje. Medido contra el binario real (opencode 1.18.27, 11-09-2026):
 *
 *     session/request_permission {
 *       toolCall: { toolCallId, title, kind: "edit", status, locations: [{path}],
 *                   rawInput: {filepath, diff}, content: [{type:"diff", path, oldText, newText}] },
 *       options: [ {optionId:"once"}, {optionId:"always"}, {optionId:"reject"} ] }
 *
 * De ahí salen las dos cosas que hacen falta y nada más: la RUTA (absoluta, como en los otros
 * dos motores) y el ANTES y el DESPUÉS. **`oldText`/`newText` entran directos en
 * `core/diff.ts#diffDeLineas`**, que es la misma función que compone el diff de una aprobación
 * del grafo — así que aquí no hay ni registro de items (como en Codex, cuya petición solo trae
 * un `itemId`) ni parser de hunks. Es la forma más sencilla de las tres.
 *
 * Las guardas de ruta y la política NO se reescriben: son `escrituraExterna.ts`, compartidas.
 * Y se reaplican aunque la configuración de opencode ya deniegue por su cuenta: esa capa es
 * NUESTRA configuración, pero quien la aplica es él. La guarda de xonecode es código.
 */

import { diffDeLineas } from "../core/diff.js";
import type { PoliticaDeEscrituraExterna } from "../core/ports.js";
import {
  decisionDeEscrituraExterna,
  type EscrituraPropuesta,
  type VeredictoDeEscrituras,
  veredictoDeEscriturasExternas,
} from "./escrituraExterna.js";

/** El `toolCall` de una petición de permiso de ACP. Se tipa flojo: viene de fuera. */
export interface ToolCallDeOpencode {
  kind?: unknown;
  locations?: unknown;
  content?: unknown;
}

/**
 * Las escrituras que propone un `toolCall`, o el motivo por el que no se puede decidir.
 *
 * **Solo `kind: "edit"`.** Lo que no sea una edición no tiene diff que componer, y decidir
 * sobre una escritura sin poder enseñarla es justo lo que este camino existe para impedir —
 * el mismo argumento por el que en Codex un `item/commandExecution/requestApproval` se deniega
 * siempre. La configuración ya le quita `bash`, `webfetch` y `websearch`; esto es la segunda
 * llave, por si esa capa fallara.
 *
 * Del `content` se leen los trozos `diff`, que es donde vienen el antes y el después. Si no
 * hay ninguno se cae a `locations`, **y entonces se pregunta igual con el diff vacío**: decidir
 * sin diff es peor que decidir con diff, pero escribir sin decisión es lo que esto evita.
 */
export function propuestasDeToolCall(toolCall: ToolCallDeOpencode | undefined): { propuestas: EscrituraPropuesta[] } | { motivo: string } {
  const kind = toolCall?.kind;
  if (kind !== "edit") {
    return {
      motivo: `xonecode solo autoriza ediciones de fichero a un agente externo, y esto no lo es: ${String(kind)}`,
    };
  }
  const propuestas: EscrituraPropuesta[] = [];
  if (Array.isArray(toolCall?.content)) {
    for (const trozo of toolCall.content as Array<Record<string, unknown>>) {
      if (trozo?.["type"] !== "diff") continue;
      const antes = typeof trozo["oldText"] === "string" ? trozo["oldText"] : "";
      const despues = typeof trozo["newText"] === "string" ? trozo["newText"] : "";
      propuestas.push({ ruta: trozo["path"], lineas: diffDeLineas(antes, despues) });
    }
  }
  if (propuestas.length === 0 && Array.isArray(toolCall?.locations)) {
    for (const sitio of toolCall.locations as Array<Record<string, unknown>>) {
      propuestas.push({ ruta: sitio?.["path"], lineas: [] });
    }
  }
  if (propuestas.length === 0) {
    return { motivo: "no dijiste qué ficheros cambiabas, y sin eso no hay nada que autorizar" };
  }
  return { propuestas };
}

/** El veredicto de ruta de un `toolCall`, para poder probar la traducción aparte. */
export function veredictoDeToolCall(opciones: {
  cwd: string;
  agente: string;
  toolCall: ToolCallDeOpencode | undefined;
  ficheros: ReadonlySet<string>;
  real?: (ruta: string) => string;
}): VeredictoDeEscrituras {
  const traducidas = propuestasDeToolCall(opciones.toolCall);
  if ("motivo" in traducidas) return { admitidas: false, motivo: traducidas.motivo };
  return veredictoDeEscriturasExternas({ ...opciones, propuestas: traducidas.propuestas });
}

/** La decisión entera: traducir, y de ahí en adelante el camino compartido con Codex. */
export async function decisionDeEscrituraDeOpencode(opciones: {
  cwd: string;
  agente: string;
  toolCall: ToolCallDeOpencode | undefined;
  ficheros: ReadonlySet<string>;
  real?: (ruta: string) => string;
  aprobar?: PoliticaDeEscrituraExterna;
}): Promise<{ concedida: boolean; motivo?: string }> {
  const traducidas = propuestasDeToolCall(opciones.toolCall);
  // La traducción falla ANTES de la política: preguntar por algo que se va a denegar igual
  // sería sacar un modal cuyo único final posible es un rechazo.
  if ("motivo" in traducidas) return { concedida: false, motivo: traducidas.motivo };
  return decisionDeEscrituraExterna({ ...opciones, propuestas: traducidas.propuestas });
}
