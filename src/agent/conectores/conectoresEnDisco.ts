/**
 * Los dos ficheros de los conectores, en la casa del usuario y SOLO ahí.
 *
 * Dos y no uno porque contestan cosas distintas con permisos distintos: `conectores.json`
 * es configuración (qué está añadido y qué definió el usuario) y `conectores-oauth.json` son
 * secretos (cliente registrado, tokens, verificador PKCE y la clave de un `api-key`), 0600.
 * Solo global: una definición en el proyecto podría llevar un token a donde el proyecto
 * dijera, la misma razón que los proveedores personalizados.
 *
 * **El fichero de secretos conserva su nombre aunque ya no sean solo de OAuth.** Renombrarlo
 * es una migración con usuarios dentro —y sin premio: no hay segundo sitio donde mirar—, así
 * que lo que cambia es el TIPO (`SecretosDeConector`) y lo que dice esta cabecera. El nombre
 * del fichero ya contesta la pregunta que hay que contestarle a quien lo abra: son los
 * secretos de los conectores.
 *
 * El contrato es el de `authEnDisco.ts`: **una escritura nunca destruye lo que había**. Un
 * JSON ilegible o de una versión que no conocemos se deja tal cual y la escritura LANZA — y
 * lo que no se entiende de un fichero que SÍ se lee (una definición a medio escribir) se
 * conserva al escribir: lo que se filtra es la LECTURA, no la fusión, que es el mismo
 * reparto que ya hacían `leerAnadidos` e `idsCrudos`.
 */
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import type { OAuthClientInformationMixed, OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";
import { conectorDelCatalogo, definicionDelCable, esConectorPropio } from "../../core/conectores.js";
import type { DefinicionDeConector } from "../../core/conectores.js";

export class ErrorDeFicheroDeConectores extends Error {}

export function rutaDeAnadidos(casa: string): string { return join(casa, ".xonecode", "conectores.json"); }
export function rutaDeOAuth(casa: string): string { return join(casa, ".xonecode", "conectores-oauth.json"); }

/**
 * Lo que se guarda de UN conector. `redirectUri` ata el cliente registrado a su puerto, y
 * `clave` es la de un conector `api-key`: van juntas porque son la misma pregunta —«con qué se
 * autentica este conector»— y porque el ciclo de vida es el mismo (nace al conectar, muere al
 * desconectar y al quitar).
 */
export interface SecretosDeConector {
  clientInformation?: OAuthClientInformationMixed;
  redirectUri?: string;
  tokens?: OAuthTokens;
  codeVerifier?: string;
  clave?: string;
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

/**
 * Las definiciones del fichero, SIN filtrar: lo que se usa para FUSIONAR. Una entrada que no
 * se entiende se conserva al escribir —quitarla sería destruir lo que había, y el aviso de
 * `desconocidos` es justo lo que evita que desaparezca en silencio—; quien la criba es la
 * lectura, que es donde se decide qué se puede enseñar.
 */
function definicionesCrudas(base: Record<string, unknown>): Record<string, DefinicionDeConector> {
  const bruto = base.definiciones;
  if (typeof bruto !== "object" || bruto === null || Array.isArray(bruto)) return {};
  return bruto as Record<string, DefinicionDeConector>;
}

/**
 * Las definiciones que SÍ se entienden. Dos cosas se comprueban y ninguna es de forma: que la
 * clave sea un id nuestro (`custom:<slug>`) —un fichero editado a mano puede tener cualquier
 * cosa ahí, y de ahí sale una clave de directorio— y que la fila pase el MISMO parser que lee
 * lo que llega por el cable, porque una definición a medias no se carga a medias.
 *
 * Una entrada que no pasa NO se borra: su id, si está en `anadidos`, sale como `desconocido` y
 * la ventana lo dice, que es la única forma de que alguien pueda arreglarlo.
 */
function definicionesValidas(base: Record<string, unknown>): Record<string, DefinicionDeConector> {
  const salida: Record<string, DefinicionDeConector> = {};
  for (const [id, valor] of Object.entries(definicionesCrudas(base))) {
    if (!esConectorPropio(id)) continue;
    const def = definicionDelCable(valor);
    if (def !== undefined) salida[id] = def;
  }
  return salida;
}

/** Todo lo que dice `conectores.json`, de UNA lectura. */
export interface ConectoresEnDisco {
  /** Los añadidos que esta consola sabe resolver: del catálogo o con definición. */
  anadidos: string[];
  /** Los que no: una entrada muerta, y la ventana lo dice en vez de callarla. */
  desconocidos: string[];
  definiciones: Record<string, DefinicionDeConector>;
  ilegible?: true;
}

/**
 * El fichero entero en una lectura, y por eso es UNO y no `leerAnadidos` + `leerDefiniciones`:
 * quien resuelve un id necesita las dos cosas a la vez, y dos lecturas del mismo fichero pueden
 * discrepar a mitad de camino — un `anadido` que la segunda ya no sabe resolver. Con una sola,
 * `anadidos` y `definiciones` son coherentes por construcción, que es lo que deja afirmar que
 * todo id de `anadidos` tiene fila.
 *
 * **Un id está VIVO si lo conoce el catálogo o si tiene definición.** Las dos familias, una
 * sola pregunta: de aquí para abajo nada distingue un conector de código de uno escrito a mano,
 * que es lo que hace que un servidor propio se comporte como Jira.
 */
export function leerConectores(casa: string): ConectoresEnDisco {
  const lectura = leerJson(rutaDeAnadidos(casa));
  if (lectura.tipo === "ilegible") return { anadidos: [], desconocidos: [], definiciones: {}, ilegible: true };
  if (lectura.tipo !== "ok") return { anadidos: [], desconocidos: [], definiciones: {} };
  const definiciones = definicionesValidas(lectura.valor);
  const definidos = new Set(Object.keys(definiciones));
  const ids = Array.isArray(lectura.valor.anadidos) ? lectura.valor.anadidos.filter((x): x is string => typeof x === "string") : [];
  const vivo = (id: string): boolean => conectorDelCatalogo(id) !== undefined || definidos.has(id);
  return { definiciones, anadidos: ids.filter(vivo), desconocidos: ids.filter((id) => !vivo(id)) };
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

export function guardarDefinicion(casa: string, id: string, def: DefinicionDeConector): void {
  const ruta = rutaDeAnadidos(casa);
  const base = paraEscribir(ruta);
  escribirAtomico(ruta, { ...base, version: 1, definiciones: { ...definicionesCrudas(base), [id]: def } });
}

export function olvidarDefinicion(casa: string, id: string): void {
  const ruta = rutaDeAnadidos(casa);
  const base = paraEscribir(ruta);
  const todas = definicionesCrudas(base);
  if (!(id in todas)) return;
  const { [id]: _fuera, ...resto } = todas;
  escribirAtomico(ruta, { ...base, version: 1, definiciones: resto });
}

function porConector(base: Record<string, unknown>): Record<string, SecretosDeConector> {
  const bruto = base.porConector;
  if (typeof bruto !== "object" || bruto === null || Array.isArray(bruto)) return {};
  return bruto as Record<string, SecretosDeConector>;
}

export function leerOAuth(casa: string, id: string): SecretosDeConector {
  const lectura = leerJson(rutaDeOAuth(casa));
  if (lectura.tipo !== "ok") return {};
  const datos = porConector(lectura.valor)[id];
  return typeof datos === "object" && datos !== null ? datos : {};
}

export function guardarOAuth(casa: string, id: string, datos: SecretosDeConector): void {
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
