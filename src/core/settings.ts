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
import { type Aviso, CLAVES_DENEGADAS } from "./config.js";

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
 * Misma disciplina que `config.json` (`CLAVES_DENEGADAS`, reexportada de `config.ts` como
 * fuente ÚNICA — dos listas de nombres de credencial ya divergieron una vez, medido: «key»,
 * el campo exacto de `auth.json`, faltaba aquí), más las formas en castellano que solo
 * hacían falta en este fichero. Comparación en minúsculas: quien escribe «apiKey» a mano
 * también escribe «apikey».
 */
const CAMPOS_DE_CREDENCIAL: readonly string[] = [
  ...CLAVES_DENEGADAS,
  "clave",
  "password",
  "contrasena",
].map((c) => c.toLowerCase());

function esCampoDeCredencial(campo: string): boolean {
  return CAMPOS_DE_CREDENCIAL.includes(campo.toLowerCase());
}

/**
 * Un aviso «grave» que nombra el CAMPO y nunca el valor: el mensaje acaba en logs y
 * capturas, y ahí es donde menos se quiere ver una clave.
 */
function avisoCredencial(campo: string, donde: string): Aviso {
  return {
    texto: `settings.json: el campo «${campo}»${donde} parece una clave de API y no se acepta; las claves van en ~/.xonecode/auth.json. Se descarta.`,
    severidad: "grave",
  };
}

/**
 * Un entorno con campos de credencial se sigue cargando si el resto es válido — el campo
 * sospechoso simplemente no se copia, como cualquier campo desconocido —, pero SIEMPRE
 * deja un aviso: la asimetría con «entorno mal formado, se descarta en silencio» es
 * deliberada, porque una credencial es el fallo que hay que ver y un `url` vacío no.
 */
function validarEntorno(candidato: unknown, avisos: Aviso[]): Entorno | undefined {
  if (typeof candidato !== "object" || candidato === null) return undefined;
  const e = candidato as Record<string, unknown>;
  const idParaElAviso = typeof e.id === "string" && e.id !== "" ? ` (entorno «${e.id}»)` : "";
  for (const campo of Object.keys(e)) {
    if (esCampoDeCredencial(campo)) avisos.push(avisoCredencial(campo, idParaElAviso));
  }
  if (typeof e.id !== "string" || e.id === "") return undefined;
  if (typeof e.nombre !== "string" || e.nombre === "") return undefined;
  if (typeof e.url !== "string" || e.url === "") return undefined;
  return {
    id: e.id,
    nombre: e.nombre,
    url: e.url,
    ...(Array.isArray(e.scopes) ? { scopes: e.scopes.filter((s) => typeof s === "string") } : {}),
  };
}

/**
 * Un entorno mal formado se DESCARTA en silencio; una credencial deja un AVISO grave y
 * sigue. La asimetría es deliberada: un entorno roto es un dato de menos y el arranque
 * puede seguir sin decir nada, pero una credencial en el fichero equivocado es un fallo de
 * seguridad que tiene que verse — igual que hace `config.json` (`config.ts`, línea 112):
 * un aviso «grave» que descarta el campo, no una excepción que tumbe el arranque. Este
 * fichero antes lanzaba (`SettingsConCredencial`); se cambió a aviso porque `CLAUDE.md`
 * exige que un fallo de CloudStudio no pueda tumbar el arranque de la consola.
 */
export function validarSettings(bruto: unknown): { settings: Settings; avisos: Aviso[] } {
  const avisos: Aviso[] = [];

  if (typeof bruto !== "object" || bruto === null || Array.isArray(bruto)) {
    return { settings: { entornos: [] }, avisos };
  }
  const objeto = bruto as Record<string, unknown>;

  for (const campo of Object.keys(objeto)) {
    if (esCampoDeCredencial(campo)) avisos.push(avisoCredencial(campo, ""));
  }

  const lista = Array.isArray(objeto.entornos) ? objeto.entornos : [];
  const entornos: Entorno[] = [];
  for (const candidato of lista) {
    const entorno = validarEntorno(candidato, avisos);
    if (entorno !== undefined) entornos.push(entorno);
  }

  const workspace = typeof objeto.workspace === "string" ? objeto.workspace : undefined;
  return {
    settings: workspace === undefined ? { entornos } : { entornos, workspace },
    avisos,
  };
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
