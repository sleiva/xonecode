/**
 * Leer los dos ficheros de configuración del disco y volcar las credenciales en el
 * entorno. Aquí está el I/O que `core/config.ts` no quiere: rutas, `readFileSync` y
 * `statSync`; lo que llega a `validar`/`validarAuth` es solo datos.
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  Aviso,
  Auth,
  ConfigDeFichero,
  Procedencia,
  validar,
  validarAuth,
} from "../core/config.js";
import { Proveedor, PROVEEDORES } from "../core/modelos.js";

export const NOMBRE_CARPETA = ".xonecode";

export function rutaConfigGlobal(): string {
  // homedir() en el momento de la llamada: si se cacheara en una constante de módulo,
  // un test que reescribe HOME después del import vería la ruta vieja.
  return join(homedir(), NOMBRE_CARPETA, "config.json");
}

export function rutaConfigDeProyecto(raiz: string): string {
  return join(raiz, NOMBRE_CARPETA, "config.json");
}

export function rutaAuth(): string {
  return join(homedir(), NOMBRE_CARPETA, "auth.json");
}

export function cargar(raiz: string): {
  config: { proyecto?: ConfigDeFichero; global?: ConfigDeFichero };
  auth: Auth;
  rutas: Array<{ ruta: string; existe: boolean; procedencia: Procedencia | "auth" }>;
  avisos: Aviso[];
} {
  const rutas: Array<{ ruta: string; existe: boolean; procedencia: Procedencia | "auth" }> =
    [];
  const avisos: Aviso[] = [];
  const config: { proyecto?: ConfigDeFichero; global?: ConfigDeFichero } = {};
  let auth: Auth = {};

  const rutaProyecto = rutaConfigDeProyecto(raiz);
  const existeProyecto = existsSync(rutaProyecto);
  rutas.push({ ruta: rutaProyecto, existe: existeProyecto, procedencia: "proyecto" });
  if (existeProyecto) {
    try {
      const bruto: unknown = JSON.parse(readFileSync(rutaProyecto, "utf8"));
      const res = validar(bruto, rutaProyecto, "proyecto");
      config.proyecto = res.config;
      avisos.push(...res.avisos);
    } catch {
      // El mensaje no interpola err.message: el contenido del fichero puede acabar en
      // logs y el aviso solo dice QUÉ pasó, nunca qué contenía.
      avisos.push({
        texto: `«${rutaProyecto}»: el JSON es inválido; se ignora el fichero.`,
        severidad: "aviso",
      });
    }
  }

  const rutaGlobal = rutaConfigGlobal();
  const existeGlobal = existsSync(rutaGlobal);
  rutas.push({ ruta: rutaGlobal, existe: existeGlobal, procedencia: "global" });
  if (existeGlobal) {
    try {
      const bruto: unknown = JSON.parse(readFileSync(rutaGlobal, "utf8"));
      const res = validar(bruto, rutaGlobal, "global");
      config.global = res.config;
      avisos.push(...res.avisos);
    } catch {
      avisos.push({
        texto: `«${rutaGlobal}»: el JSON es inválido; se ignora el fichero.`,
        severidad: "aviso",
      });
    }
  }

  const rutaAuthFichero = rutaAuth();
  const existeAuth = existsSync(rutaAuthFichero);
  rutas.push({ ruta: rutaAuthFichero, existe: existeAuth, procedencia: "auth" });
  if (existeAuth) {
    try {
      const bruto: unknown = JSON.parse(readFileSync(rutaAuthFichero, "utf8"));
      const modo = statSync(rutaAuthFichero).mode & 0o777;
      const res = validarAuth(bruto, rutaAuthFichero, modo, "global");
      auth = res.auth;
      avisos.push(...res.avisos);
    } catch {
      avisos.push({
        texto: `«${rutaAuthFichero}»: el JSON es inválido; se ignora el fichero.`,
        severidad: "aviso",
      });
    }
  }

  return { config, auth, rutas, avisos };
}

/** Las claves ya presentes en el entorno MANDAN: `auth.json` no las machaca. */
const VARIABLES_POR_PROVEEDOR: Partial<Record<Proveedor, string>> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  gemini: "GOOGLE_API_KEY",
};

/**
 * Vuelca las credenciales en `process.env` y devuelve los proveedores que SÍ se
 * aplicaron. Las que ya estaban en el entorno se dejan intactas y no se cuentan.
 * `ollama` no tiene variable: no aparece en el mapa y se ignora.
 */
export function aplicarAuth(auth: Auth): string[] {
  const aplicadas: string[] = [];
  for (const proveedor of PROVEEDORES) {
    const variable = VARIABLES_POR_PROVEEDOR[proveedor];
    const credencial = auth[proveedor];
    if (variable === undefined || credencial === undefined) continue;
    if (process.env[variable] !== undefined) continue;
    process.env[variable] = credencial.key;
    aplicadas.push(proveedor);
  }
  return aplicadas;
}