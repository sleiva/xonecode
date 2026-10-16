import type { DiagnosticoDeNode, LineaDeDiagnostico } from "./tipos.js";

/**
 * El diagnóstico de Node que llega por el cable, copiado campo a campo (la lista blanca del store): un campo que el servidor
 * añada mañana no entra sin que nadie lo decida, y lo que no tiene la forma esperada no se pinta. `undefined` = no vale.
 */
export function leerDiagnosticoDeNode(valor: unknown): DiagnosticoDeNode | undefined {
  if (typeof valor !== "object" || valor === null) return undefined;
  const v = valor as Record<string, unknown>;
  const servidor = v["servidor"] as Record<string, unknown> | undefined;
  if (typeof v["cuando"] !== "string" || typeof servidor !== "object" || servidor === null) return undefined;
  if (typeof servidor["version"] !== "string" || typeof servidor["plataforma"] !== "string" || typeof servidor["arquitectura"] !== "string") {
    return undefined;
  }
  const nodeEnPath = linea(v["nodeEnPath"]);
  const scripts = linea(v["scripts"]);
  const simulador = linea(v["simulador"]);
  const claudeCode = linea(v["claudeCode"]);
  const cuantos = (v["scripts"] as Record<string, unknown> | undefined)?.["cuantos"];
  if (nodeEnPath === undefined || scripts === undefined || simulador === undefined || claudeCode === undefined) return undefined;
  if (typeof cuantos !== "number" || !Number.isInteger(cuantos) || cuantos < 0) return undefined;
  return {
    cuando: v["cuando"],
    servidor: { version: servidor["version"], plataforma: servidor["plataforma"], arquitectura: servidor["arquitectura"] },
    nodeEnPath,
    scripts: { ...scripts, cuantos },
    simulador,
    claudeCode,
  };
}

function linea(valor: unknown): LineaDeDiagnostico | undefined {
  if (typeof valor !== "object" || valor === null) return undefined;
  const v = valor as Record<string, unknown>;
  if (typeof v["ok"] !== "boolean") return undefined;
  return {
    ok: v["ok"],
    ...(typeof v["valor"] === "string" ? { valor: v["valor"] } : {}),
    ...(typeof v["motivo"] === "string" ? { motivo: v["motivo"] } : {}),
  };
}
