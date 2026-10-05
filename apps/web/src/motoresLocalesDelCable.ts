import type { EstadoDeMotorLocal, LoginDeMotorLocal, MotorLocal, PruebaDeMotorLocal } from "./tipos.js";

/**
 * La lista blanca de `{clase:"motoresLocales"}`, campo a campo, como todo lo del store. Un motor
 * que no se entiende se DESCARTA entero (una fila a medias pintaría «no consta» donde había un
 * dato), y un campo opcional mal formado se cae solo, sin llevarse la fila.
 */
const MOTORES: readonly MotorLocal[] = ["claude-code", "codex", "opencode"];
const INSTALADO = ["ok", "no-encontrado", "fallo"] as const;
const CAMINOS = ["unico", "sin-ejecucion", "con-ejecucion"] as const;
const FASES = ["esperando", "hecho", "fallo", "cancelado"] as const;

function de<T extends string>(lista: readonly T[], valor: unknown): T | undefined {
  return lista.find((x) => x === valor);
}

function leerPrueba(crudo: unknown): PruebaDeMotorLocal | undefined {
  if (typeof crudo !== "object" || crudo === null) return undefined;
  const p = crudo as Record<string, unknown>;
  const camino = de(CAMINOS, p["camino"]);
  if (camino === undefined || typeof p["ok"] !== "boolean" || typeof p["detalle"] !== "string") return undefined;
  if (typeof p["ms"] !== "number" || typeof p["medido"] !== "string") return undefined;
  return { camino, ok: p["ok"], detalle: p["detalle"], ms: p["ms"], medido: p["medido"] };
}

function leerLogin(crudo: unknown): LoginDeMotorLocal | undefined {
  if (typeof crudo !== "object" || crudo === null) return undefined;
  const l = crudo as Record<string, unknown>;
  const fase = de(FASES, l["fase"]);
  if (fase === undefined || typeof l["desde"] !== "string") return undefined;
  return {
    fase,
    desde: l["desde"],
    ...(l["pideCodigo"] === true ? { pideCodigo: true as const } : {}),
    ...(typeof l["detalle"] === "string" ? { detalle: l["detalle"] } : {}),
  };
}

export function leerMotorLocal(crudo: unknown): EstadoDeMotorLocal | undefined {
  if (typeof crudo !== "object" || crudo === null) return undefined;
  const m = crudo as Record<string, unknown>;
  const motor = de(MOTORES, m["motor"]);
  const instalado = de(INSTALADO, m["instalado"]);
  if (motor === undefined || instalado === undefined || typeof m["medido"] !== "string") return undefined;
  const pruebas = Array.isArray(m["pruebas"])
    ? (m["pruebas"] as unknown[]).map(leerPrueba).filter((p): p is PruebaDeMotorLocal => p !== undefined)
    : undefined;
  const login = leerLogin(m["login"]);
  return {
    motor,
    instalado,
    medido: m["medido"],
    ...(typeof m["version"] === "string" ? { version: m["version"] } : {}),
    ...(typeof m["detalle"] === "string" ? { detalle: m["detalle"] } : {}),
    ...(typeof m["conSesion"] === "boolean" ? { conSesion: m["conSesion"] } : {}),
    ...(typeof m["sesion"] === "string" ? { sesion: m["sesion"] } : {}),
    ...(m["conClave"] === true ? { conClave: true as const } : {}),
    ...(pruebas === undefined ? {} : { pruebas }),
    ...(m["probando"] === true ? { probando: true as const } : {}),
    ...(login === undefined ? {} : { login }),
    ...(m["admiteLogin"] === true ? { admiteLogin: true as const } : {}),
    ...(m["admiteConsola"] === true ? { admiteConsola: true as const } : {}),
    ...(m["admiteModelo"] === true ? { admiteModelo: true as const } : {}),
    ...(typeof m["modelo"] === "string" && m["modelo"] !== "" ? { modelo: m["modelo"] } : {}),
  };
}

export function leerMotoresLocales(crudo: unknown): EstadoDeMotorLocal[] | undefined {
  if (!Array.isArray(crudo)) return undefined;
  return crudo.map(leerMotorLocal).filter((m): m is EstadoDeMotorLocal => m !== undefined);
}
