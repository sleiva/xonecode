import { ChatGoogleGenerativeAI } from "@langchain/google-genai";

function esRegistro(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

/**
 * La API de function calling de Gemini acepta solo una parte de OpenAPI. Zod
 * traduce `.positive()`, `.max()` o `.regex()` a restricciones que son válidas
 * en JSON Schema, pero que Gemini rechaza (por ejemplo `exclusiveMinimum`).
 *
 * La validación real no se pierde: Zod sigue comprobando los argumentos cuando
 * la tool se ejecuta. Aquí solo se rebaja la declaración enviada al modelo.
 */
const RESTRICCIONES_NO_COMPATIBLES = new Set([
  "default",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "minimum",
  "maximum",
  "multipleOf",
  "minLength",
  "maxLength",
  "pattern",
  "minItems",
  "maxItems",
  "minProperties",
  "maxProperties",
  "additionalProperties",
]);

/**
 * Gemini recibe los esquemas de function calling como un subconjunto de OpenAPI:
 * `type` es escalar y la nulabilidad se expresa con `nullable`. Zod genera la
 * unión JSON Schema `type: [T, "null"]` para los argumentos optional+nullable
 * de las herramientas de filesystem de Deep Agents.
 */
function normalizarEsquemaGemini(valor: unknown, esEsquema = false): unknown {
  if (Array.isArray(valor)) return valor.map((hijo) => normalizarEsquemaGemini(hijo, esEsquema));
  if (!esRegistro(valor)) return valor;

  const salida: Record<string, unknown> = {};
  for (const [clave, hijo] of Object.entries(valor)) {
    // No se puede hacer este filtro en todos los objetos: `pattern` también es
    // un nombre perfectamente válido de ARGUMENTO dentro de `properties`.
    if (esEsquema && RESTRICCIONES_NO_COMPATIBLES.has(clave)) continue;
    if (clave === "properties" || clave === "$defs" || clave === "defs") {
      salida[clave] = esRegistro(hijo)
        ? Object.fromEntries(Object.entries(hijo).map(([nombre, schema]) => [nombre, normalizarEsquemaGemini(schema, true)]))
        : hijo;
      continue;
    }
    if (clave === "items" || clave === "anyOf" || clave === "any_of") {
      salida[clave] = normalizarEsquemaGemini(hijo, true);
      continue;
    }
    // `parameters` vive en la declaración de function calling y es la raíz de
    // un schema; fuera de ahí seguimos recorriendo la configuración sin filtrar.
    salida[clave] = normalizarEsquemaGemini(hijo, clave === "parameters" || clave === "response");
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
