/**
 * Los dos ficheros de los conectores, en la casa del usuario y SOLO ahí.
 *
 * Dos y no uno porque contestan cosas distintas con permisos distintos: `conectores.json`
 * es configuración (qué está añadido) y `conectores-oauth.json` son secretos (cliente
 * registrado, tokens, verificador PKCE), 0600. Solo global: una definición en el proyecto
 * podría llevar un token a donde el proyecto dijera, la misma razón que los proveedores
 * personalizados.
 *
 * El contrato es el de `authEnDisco.ts`: **una escritura nunca destruye lo que había**. Un
 * JSON ilegible o de una versión que no conocemos se deja tal cual y la escritura LANZA.
 */
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import type { OAuthClientInformationMixed, OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";
import { conectorDelCatalogo } from "../../core/conectores.js";

export class ErrorDeFicheroDeConectores extends Error {}

export function rutaDeAnadidos(casa: string): string { return join(casa, ".xonecode", "conectores.json"); }
export function rutaDeOAuth(casa: string): string { return join(casa, ".xonecode", "conectores-oauth.json"); }

/** Lo que se guarda de UN conector. `redirectUri` ata el cliente registrado a su puerto. */
export interface OAuthDeConector {
  clientInformation?: OAuthClientInformationMixed;
  redirectUri?: string;
  tokens?: OAuthTokens;
  codeVerifier?: string;
}

type Lectura<T> = { tipo: "ausente" } | { tipo: "ok"; valor: T } | { tipo: "ilegible" };

function leerJson(ruta: string): Lectura<Record<string, unknown>> {
  if (!existsSync(ruta)) return { tipo: "ausente" };
  try {
    const bruto: unknown = JSON.parse(readFileSync(ruta, "utf8"));
    if (typeof bruto !== "object" || bruto === null || Array.isArray(bruto)) return { tipo: "ilegible" };
    const objeto = bruto as Record<string, unknown>;
    return objeto.version === 1 ? { tipo: "ok", valor: objeto } : { tipo: "ilegible" };
  } catch {
    return { tipo: "ilegible" };
  }
}

function escribirAtomico(ruta: string, contenido: unknown): void {
  mkdirSync(dirname(ruta), { recursive: true, mode: 0o700 });
  const temporal = `${ruta}.${randomUUID()}.tmp`;
  let fd: number | undefined;
  try {
    fd = openSync(temporal, "wx", 0o600);
    writeFileSync(fd, JSON.stringify(contenido, null, 2) + "\n", "utf8");
    closeSync(fd);
    fd = undefined;
    renameSync(temporal, ruta);
  } catch (error) {
    if (fd !== undefined) closeSync(fd);
    try { unlinkSync(temporal); } catch { /* no llegó a crearse */ }
    throw error;
  }
}

function paraEscribir(ruta: string): Record<string, unknown> {
  const lectura = leerJson(ruta);
  if (lectura.tipo === "ilegible") {
    // No se nombra el contenido: puede llevar un token.
    throw new ErrorDeFicheroDeConectores(`${ruta} no se entiende y no se sobrescribe: revísalo o bórralo a mano`);
  }
  return lectura.tipo === "ok" ? lectura.valor : { version: 1 };
}

export function leerAnadidos(casa: string): { anadidos: string[]; desconocidos: string[]; ilegible?: true } {
  const lectura = leerJson(rutaDeAnadidos(casa));
  if (lectura.tipo === "ilegible") return { anadidos: [], desconocidos: [], ilegible: true };
  if (lectura.tipo !== "ok" || !Array.isArray(lectura.valor.anadidos)) return { anadidos: [], desconocidos: [] };
  const ids = lectura.valor.anadidos.filter((x): x is string => typeof x === "string");
  return {
    anadidos: ids.filter((id) => conectorDelCatalogo(id) !== undefined),
    desconocidos: ids.filter((id) => conectorDelCatalogo(id) === undefined),
  };
}

function idsCrudos(base: Record<string, unknown>): string[] {
  return Array.isArray(base.anadidos) ? base.anadidos.filter((x): x is string => typeof x === "string") : [];
}

export function anadirConector(casa: string, id: string): void {
  const ruta = rutaDeAnadidos(casa);
  const base = paraEscribir(ruta);
  const ids = idsCrudos(base);
  if (ids.includes(id)) return;
  escribirAtomico(ruta, { ...base, version: 1, anadidos: [...ids, id] });
}

export function quitarConector(casa: string, id: string): void {
  const ruta = rutaDeAnadidos(casa);
  const base = paraEscribir(ruta);
  const ids = idsCrudos(base);
  if (!ids.includes(id)) return;
  escribirAtomico(ruta, { ...base, version: 1, anadidos: ids.filter((x) => x !== id) });
}

function porConector(base: Record<string, unknown>): Record<string, OAuthDeConector> {
  const bruto = base.porConector;
  if (typeof bruto !== "object" || bruto === null || Array.isArray(bruto)) return {};
  return bruto as Record<string, OAuthDeConector>;
}

export function leerOAuth(casa: string, id: string): OAuthDeConector {
  const lectura = leerJson(rutaDeOAuth(casa));
  if (lectura.tipo !== "ok") return {};
  const datos = porConector(lectura.valor)[id];
  return typeof datos === "object" && datos !== null ? datos : {};
}

export function guardarOAuth(casa: string, id: string, datos: OAuthDeConector): void {
  const ruta = rutaDeOAuth(casa);
  const base = paraEscribir(ruta);
  escribirAtomico(ruta, { ...base, version: 1, porConector: { ...porConector(base), [id]: datos } });
}

export function olvidarOAuth(casa: string, id: string): void {
  const ruta = rutaDeOAuth(casa);
  const base = paraEscribir(ruta);
  const todos = porConector(base);
  if (!(id in todos)) return;
  const { [id]: _fuera, ...resto } = todos;
  escribirAtomico(ruta, { ...base, version: 1, porConector: resto });
}
