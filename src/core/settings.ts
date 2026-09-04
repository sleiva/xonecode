/**
 * Los settings GLOBALES: los entornos de CloudStudio que el usuario registra, y dónde se
 * crean las copias locales.
 *
 * Un **entorno es un servidor CloudStudio**: hoy los dos oficiales, mañana el on-premise
 * de un cliente. Vive en global y no en el proyecto porque un entorno sirve a muchos
 * proyectos; el proyecto solo guarda a cuál pertenece.
 *
 * TypeScript puro: ni disco ni red. El disco lo pone `agent/settingsEnDisco.ts`, igual
 * que `core/config.ts` deja el I/O a `agent/configEnDisco.ts` y `agent/authEnDisco.ts`.
 */
import { posix } from "node:path";

export interface Entorno {
  id: string;
  nombre: string;
  /** La URL del MCP. Es lo que define el entorno. */
  url: string;
  scopes?: readonly string[];
}

export interface Settings {
  entornos: Entorno[];
  /** La BASE del workspace. La disposición de dentro la fija `rutaDeWorkspace`. */
  workspace?: string;
}

/**
 * Publicable: no lleva nunca el valor sospechoso, solo el nombre del campo. Un error que
 * cite la credencial la filtraría al sitio donde menos se espera — un mensaje de consola.
 * Misma disciplina que `config.ts`: una clave de API no se avisa, se RECHAZA — un aviso
 * dejaría el fichero funcionando con la clave dentro.
 */
export class SettingsConCredencial extends Error {
  constructor(campo: string) {
    super(
      `settings.json no puede llevar credenciales (campo «${campo}»): van en ~/.xonecode/auth.json, modo 0600`
    );
  }
}

const CAMPOS_DE_CREDENCIAL = ["apikey", "api_key", "clave", "token", "secret", "password", "contrasena"];

function comprobarSinCredenciales(objeto: Record<string, unknown>): void {
  for (const campo of Object.keys(objeto)) {
    if (CAMPOS_DE_CREDENCIAL.includes(campo.toLowerCase())) throw new SettingsConCredencial(campo);
  }
}

function esEntorno(valor: unknown): valor is Entorno {
  if (typeof valor !== "object" || valor === null) return false;
  const e = valor as Record<string, unknown>;
  comprobarSinCredenciales(e);
  return typeof e.id === "string" && e.id !== ""
    && typeof e.nombre === "string" && e.nombre !== ""
    && typeof e.url === "string" && e.url !== "";
}

/**
 * Un entorno mal formado se DESCARTA en silencio; una credencial LANZA. La asimetría es
 * deliberada: un entorno roto es un dato de menos y el arranque puede seguir, pero una
 * credencial en el fichero equivocado es un fallo de seguridad que hay que ver.
 */
export function validarSettings(bruto: unknown): Settings {
  if (typeof bruto !== "object" || bruto === null || Array.isArray(bruto)) return { entornos: [] };
  const objeto = bruto as Record<string, unknown>;
  comprobarSinCredenciales(objeto);
  const lista = Array.isArray(objeto.entornos) ? objeto.entornos : [];
  const entornos: Entorno[] = [];
  for (const candidato of lista) {
    if (esEntorno(candidato)) {
      const e = candidato as Entorno;
      entornos.push({
        id: e.id,
        nombre: e.nombre,
        url: e.url,
        ...(Array.isArray(e.scopes) ? { scopes: e.scopes.filter((s) => typeof s === "string") } : {}),
      });
    }
  }
  const workspace = typeof objeto.workspace === "string" ? objeto.workspace : undefined;
  return workspace === undefined ? { entornos } : { entornos, workspace };
}

/** Un segmento que no puede salirse de su carpeta ni inventar niveles. */
function segmentoSeguro(valor: string, que: string): string {
  if (valor === "" || valor === "." || valor === ".." || /[/\\]/.test(valor)) {
    throw new Error(`«${valor}» no vale como ${que}: no puede llevar separadores ni ser «..»`);
  }
  return valor;
}

/**
 * Dónde queda la copia local de un proyecto.
 *
 * La BASE es configurable (`settings.workspace`); la disposición de dentro NO, porque es
 * lo que hace predecible encontrar una copia sin consultar un índice.
 */
export function rutaDeWorkspace(base: string, entorno: string, proyecto: string): string {
  return posix.join(
    base,
    segmentoSeguro(entorno, "id de entorno"),
    "workspace",
    segmentoSeguro(proyecto, "nombre de proyecto")
  );
}
