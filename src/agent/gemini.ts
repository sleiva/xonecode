import { ChatGoogleGenerativeAI } from "@langchain/google-genai";

function esRegistro(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

/**
 * Gemini recibe los esquemas de function calling como un subconjunto de OpenAPI:
 * `type` es escalar y la nulabilidad se expresa con `nullable`. Zod genera la
 * unión JSON Schema `type: [T, "null"]` para los argumentos optional+nullable
 * de las herramientas de filesystem de Deep Agents.
 */
function normalizarEsquemaGemini(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(normalizarEsquemaGemini);
  if (!esRegistro(valor)) return valor;

  const salida: Record<string, unknown> = {};
  for (const [clave, hijo] of Object.entries(valor)) {
    salida[clave] = normalizarEsquemaGemini(hijo);
  }

  if (!Array.isArray(salida.type)) return salida;
  const tipos = salida.type.filter((tipo): tipo is string => typeof tipo === "string");
  const sinNull = tipos.filter((tipo) => tipo !== "null");
  if (!tipos.includes("null") || sinNull.length !== 1) return salida;

  salida.type = sinNull[0];
  salida.nullable = true;
  return salida;
}

type LigaduraConConfig = { config: { tools?: unknown } };

/** Cliente de Gemini que adapta los esquemas de tools al formato de su API. */
export class ChatGoogleGenerativeAICompatible extends ChatGoogleGenerativeAI {
  override bindTools(...args: Parameters<ChatGoogleGenerativeAI["bindTools"]>) {
    const ligado = super.bindTools(...args);
    const config = ligado as unknown as LigaduraConConfig;
    if (config.config.tools !== undefined) {
      config.config.tools = normalizarEsquemaGemini(config.config.tools);
    }
    return ligado;
  }
}
