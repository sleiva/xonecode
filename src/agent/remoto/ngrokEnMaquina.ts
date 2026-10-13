/**
 * ngrok en ESTA máquina: si el SDK carga, si hay cuenta (authtoken), y guardar el authtoken.
 *
 * **ngrok viene con xonecode** (`@ngrok/ngrok`, el SDK oficial: npm instala solo el binario nativo de la plataforma, sin
 * pasos posteriores a la instalación), así que «instalado» es que el SDK CARGA —falla solo en una plataforma sin binario
 * del SDK—, y no que haya un programa `ngrok` en el PATH. Ya no hay receta para instalarlo.
 *
 * **El authtoken, por orden**: `NGROK_AUTHTOKEN` del entorno; el fichero nuestro (`~/.xonecode/ngrok.json`, 0600), que es
 * donde lo escribe Ajustes; y la configuración del programa `ngrok` si ya lo usabas (`core/tunel.ts#rutasDeConfigDeNgrok`),
 * para no pedírtelo otra vez. Ni el token ni las rutas salen de aquí: un fallo es un texto de `MOTIVOS_DEL_TUNEL`.
 */
import { randomUUID } from "node:crypto";
import { closeSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { authtokenDeConfig, FORMA_DE_AUTHTOKEN, MOTIVOS_DEL_TUNEL, rutasDeConfigDeNgrok } from "../../core/tunel.js";
import { renombrarSobreSync } from "../renombrarSobre.js";

/** Lo que se usa del SDK. `forward` abre el túnel; el resto de su API no hace falta. */
export interface SdkDeNgrok {
  forward(config: {
    addr: string;
    authtoken?: string;
    domain?: string;
    onStatusChange?: (estado: string) => void;
  }): Promise<{ url(): string | null; close(): Promise<void> }>;
}

/** El SDK de verdad, o `undefined` si su binario nativo no carga en esta plataforma. Por `import()`: solo se carga al usarlo. */
export async function cargarSdkReal(): Promise<SdkDeNgrok | undefined> {
  try {
    const modulo = (await import("@ngrok/ngrok")) as unknown as { default?: SdkDeNgrok } & SdkDeNgrok;
    const sdk = modulo.default ?? modulo;
    return typeof sdk.forward === "function" ? sdk : undefined;
  } catch {
    return undefined;
  }
}

/** Donde Ajustes guarda el authtoken: un fichero NUESTRO, 0600, nunca el proyecto. */
export const rutaDeAuthtoken = (casa: string): string => join(casa, ".xonecode", "ngrok.json");

export interface DependenciasDeNgrok {
  cargarSdk?: () => Promise<SdkDeNgrok | undefined>;
  entorno?: Record<string, string | undefined>;
  casa?: string;
  plataforma?: string;
  /** Lee un fichero de texto; lanza si no se puede. */
  leer?: (ruta: string) => string;
  /** Escribe el fichero del authtoken. */
  escribir?: (ruta: string, contenido: string) => void;
}

/** El authtoken que se usará, por el orden de la cabecera, o `undefined` si no hay ninguno. */
export function authtokenDeNgrok(deps: DependenciasDeNgrok = {}): string | undefined {
  const entorno = deps.entorno ?? process.env;
  const casa = deps.casa ?? homedir();
  const leer = deps.leer ?? ((ruta: string) => readFileSync(ruta, "utf8"));
  const delEntorno = (entorno.NGROK_AUTHTOKEN ?? "").trim();
  if (delEntorno !== "") return delEntorno;
  try {
    const nuestro = JSON.parse(leer(rutaDeAuthtoken(casa))) as { authtoken?: unknown };
    if (typeof nuestro.authtoken === "string" && FORMA_DE_AUTHTOKEN.test(nuestro.authtoken)) return nuestro.authtoken;
  } catch {
    // No hay fichero nuestro, o no se entiende: se sigue buscando.
  }
  for (const ruta of rutasDeConfigDeNgrok(deps.plataforma ?? process.platform, entorno, casa)) {
    try {
      const token = authtokenDeConfig(leer(ruta));
      if (token !== undefined) return token;
    } catch {
      // Esa configuración no está.
    }
  }
  return undefined;
}

export interface MedidaDeNgrok {
  instalado: boolean;
  cuenta: boolean;
}

export async function medirNgrok(deps: DependenciasDeNgrok = {}): Promise<MedidaDeNgrok> {
  const sdk = await (deps.cargarSdk ?? cargarSdkReal)();
  return { instalado: sdk !== undefined, cuenta: authtokenDeNgrok(deps) !== undefined };
}

export type ResultadoDeGuardarAuthtoken = { ok: true } | { ok: false; motivo: string };

/** Temporal + rename, 0600 desde el principio: el token nunca está en un fichero legible por otros. */
function escribirAtomicoReal(ruta: string, contenido: string): void {
  mkdirSync(dirname(ruta), { recursive: true, mode: 0o700 });
  const temporal = `${ruta}.${randomUUID()}.tmp`;
  let fd: number | undefined;
  try {
    fd = openSync(temporal, "wx", 0o600);
    writeFileSync(fd, contenido, "utf8");
    closeSync(fd);
    fd = undefined;
    renombrarSobreSync(temporal, ruta);
  } catch (error) {
    if (fd !== undefined) closeSync(fd);
    try {
      unlinkSync(temporal);
    } catch {
      // no llegó a crearse
    }
    throw error;
  }
}

/**
 * Guarda el authtoken en `~/.xonecode/ngrok.json` (0600). Ya no pasa por `ngrok config add-authtoken`, así que el token no
 * aparece en la línea de órdenes de ningún proceso. Un fallo devuelve un texto FIJO.
 */
export async function guardarAuthtoken(token: string, deps: DependenciasDeNgrok = {}): Promise<ResultadoDeGuardarAuthtoken> {
  const limpio = token.trim();
  if (!FORMA_DE_AUTHTOKEN.test(limpio)) return { ok: false, motivo: MOTIVOS_DEL_TUNEL.authtokenSinForma };
  try {
    (deps.escribir ?? escribirAtomicoReal)(rutaDeAuthtoken(deps.casa ?? homedir()), JSON.stringify({ version: 1, authtoken: limpio }, null, 2) + "\n");
    return { ok: true };
  } catch {
    return { ok: false, motivo: MOTIVOS_DEL_TUNEL.authtokenNoGuardado };
  }
}
