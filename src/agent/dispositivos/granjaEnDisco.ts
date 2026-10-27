/**
 * El token de acceso de la granja de dispositivos, en disco (`core/granja.ts`).
 *
 * Mismo trato que el authtoken de ngrok (`agent/remoto/ngrokEnMaquina.ts`): se TECLEA en Ajustes,
 * vive en un fichero NUESTRO —`~/.xonecode/granja.json`, 0600 desde que nace, temporal + rename— y
 * no vuelve nunca al cliente: al cable solo llega si lo hay. Ni `settings.json` ni el `config.json`
 * de un proyecto lo guardan, y la shell del agente no lo recibe.
 */
import { randomUUID } from "node:crypto";
import { closeSync, mkdirSync, openSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { esFormaDeTokenDeGranja } from "../../core/granja.js";
import { renombrarSobreSync } from "../renombrarSobre.js";

/** Dónde se guarda el token: fuera de cualquier proyecto. */
export const rutaDeTokenDeGranja = (casa: string): string => join(casa, ".xonecode", "granja.json");

export interface DependenciasDeTokenDeGranja {
  casa?: string;
  /** Lee un fichero de texto; lanza si no se puede. */
  leer?: (ruta: string) => string;
  /** Escribe el fichero del token. */
  escribir?: (ruta: string, contenido: string) => void;
  /** Borra el fichero del token; no lanza si no está. */
  borrar?: (ruta: string) => void;
}

/** El token guardado, o `undefined`. Un fichero roto o un token sin forma es «no hay token». */
export function tokenDeGranja(deps: DependenciasDeTokenDeGranja = {}): string | undefined {
  const leer = deps.leer ?? ((ruta: string) => readFileSync(ruta, "utf8"));
  try {
    const guardado = JSON.parse(leer(rutaDeTokenDeGranja(deps.casa ?? homedir()))) as { token?: unknown };
    return typeof guardado.token === "string" && esFormaDeTokenDeGranja(guardado.token) ? guardado.token : undefined;
  } catch {
    return undefined;
  }
}

export type ResultadoDeGuardarToken = { ok: true } | { ok: false; motivo: string };

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

/** Guarda el token (recortado). Uno sin forma `xfarm_…` no se escribe; un fallo devuelve un texto FIJO, sin la ruta. */
export function guardarTokenDeGranja(token: string, deps: DependenciasDeTokenDeGranja = {}): ResultadoDeGuardarToken {
  const limpio = token.trim();
  if (!esFormaDeTokenDeGranja(limpio)) {
    return { ok: false, motivo: "eso no parece un token de la granja: empieza por xfarm_ y se crea en su web, menú ☰ → «Tokens de acceso»" };
  }
  try {
    (deps.escribir ?? escribirAtomicoReal)(
      rutaDeTokenDeGranja(deps.casa ?? homedir()),
      JSON.stringify({ version: 1, token: limpio }, null, 2) + "\n",
    );
    return { ok: true };
  } catch {
    return { ok: false, motivo: "no se pudo guardar el token en este equipo" };
  }
}

/** Quita el token. Que no hubiera ninguno no es un fallo. */
export function quitarTokenDeGranja(deps: DependenciasDeTokenDeGranja = {}): void {
  (deps.borrar ?? ((ruta: string) => rmSync(ruta, { force: true })))(rutaDeTokenDeGranja(deps.casa ?? homedir()));
}
