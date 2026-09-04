/**
 * Leer los dos ficheros de configuración del disco y volcar las credenciales en el
 * entorno. Aquí está el I/O que `core/config.ts` no quiere: rutas, `readFileSync` y
 * `statSync`; lo que llega a `validar`/`validarAuth` es solo datos.
 */

import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import {
  Aviso,
  Auth,
  ConfigDeFichero,
  Procedencia,
  validar,
  validarAuth,
} from "../core/config.js";
import { parsear, Proveedor, PROVEEDORES } from "../core/modelos.js";
import type { Papel } from "../core/ports.js";

export const NOMBRE_CARPETA = ".xonecode";

export class ConfigRotaEnDisco extends Error {
  constructor(ruta: string, causa?: unknown) {
    super(`«${ruta}»: el config global está roto y no se puede actualizar.`);
    this.name = "ConfigRotaEnDisco";
    if (causa !== undefined) this.cause = causa;
  }
}

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

function esObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function leerObjetoCrudoOAbortar(ruta: string): Record<string, unknown> {
  if (!existsSync(ruta)) return {};
  let bruto: unknown;
  try {
    bruto = JSON.parse(readFileSync(ruta, "utf8"));
  } catch (error) {
    throw new ConfigRotaEnDisco(ruta, error);
  }
  if (!esObjeto(bruto)) throw new ConfigRotaEnDisco(ruta);
  return bruto;
}

export interface OperacionesDeEscritura {
  openSync: typeof openSync;
  writeFileSync: typeof writeFileSync;
  closeSync: typeof closeSync;
  renameSync: typeof renameSync;
  unlinkSync: typeof unlinkSync;
}

const OPERACIONES_DE_ESCRITURA: OperacionesDeEscritura = {
  openSync,
  writeFileSync,
  closeSync,
  renameSync,
  unlinkSync,
};

function escribirAtomico(
  ruta: string,
  contenido: string,
  operaciones: OperacionesDeEscritura = OPERACIONES_DE_ESCRITURA,
): void {
  const directorio = dirname(ruta);
  mkdirSync(directorio, { recursive: true, mode: 0o700 });
  const temporal = join(directorio, `.config.json.${randomUUID()}.tmp`);
  let descriptor: number | undefined;
  try {
    descriptor = operaciones.openSync(temporal, "wx", 0o600);
    operaciones.writeFileSync(descriptor, contenido, "utf8");
    operaciones.closeSync(descriptor);
    descriptor = undefined;
    operaciones.renameSync(temporal, ruta);
  } catch (error) {
    if (descriptor !== undefined) {
      try {
        operaciones.closeSync(descriptor);
      } catch {
        // Un fallo al cerrar durante la recuperación no puede impedir borrar el temporal.
      }
    }
    try {
      operaciones.unlinkSync(temporal);
    } catch {
      // Si no llegó a crearse, no hay nada que limpiar.
    }
    throw error;
  }
}

/** Guarda una elección de papel sin perder el resto del config global. */
export function guardarModeloGlobal(
  papel: Papel,
  id: string,
  operaciones?: OperacionesDeEscritura,
): { ruta: string; id: string } {
  parsear(id);
  const ruta = rutaConfigGlobal();
  const base = leerObjetoCrudoOAbortar(ruta);
  const modelos = esObjeto(base.modelos) ? { ...base.modelos } : {};
  const fusionado = { ...base, modelos: { ...modelos, [papel]: id } };
  escribirAtomico(ruta, JSON.stringify(fusionado, null, 2) + "\n", operaciones);
  return { ruta, id };
}

/** Guarda la preferencia estética junto al proyecto; nunca en el config global de la cuenta. */
export function guardarTemaDeProyecto(raiz: string, tema: string): { ruta: string; tema: string } {
  const ruta = rutaConfigDeProyecto(raiz);
  const base = leerObjetoCrudoOAbortar(ruta);
  const fusionado = { ...base, tema };
  escribirAtomico(ruta, JSON.stringify(fusionado, null, 2) + "\n");
  return { ruta, tema };
}

/** El modelo que este proyecto usa, sea cual sea el global. Nunca lleva claves. */
export function guardarModelosDeProyecto(
  raiz: string,
  papel: Papel,
  id: string,
): { ruta: string; id: string } {
  parsear(id);
  const ruta = rutaConfigDeProyecto(raiz);
  const base = leerObjetoCrudoOAbortar(ruta);
  const modelos = esObjeto(base.modelos) ? { ...base.modelos } : {};
  const fusionado = { ...base, modelos: { ...modelos, [papel]: id } };
  escribirAtomico(ruta, JSON.stringify(fusionado, null, 2) + "\n");
  return { ruta, id };
}

/**
 * La rama ORIGEN del proyecto: de la que se baja y contra la que se compara.
 * Va dentro de `cloudstudio`, junto a la URL y al proyecto, porque es identidad del
 * remoto y no una preferencia del usuario.
 */
export function guardarRamaDeProyecto(
  raiz: string,
  rama: string,
): { ruta: string; rama: string } {
  const ruta = rutaConfigDeProyecto(raiz);
  const base = leerObjetoCrudoOAbortar(ruta);
  const cloudstudio = esObjeto(base.cloudstudio) ? { ...base.cloudstudio } : {};
  const fusionado = { ...base, cloudstudio: { ...cloudstudio, rama } };
  escribirAtomico(ruta, JSON.stringify(fusionado, null, 2) + "\n");
  return { ruta, rama };
}

/**
 * El modo pertenece al proyecto, no a la cuenta: una carpeta puede trabajarse sin red
 * aunque la anterior se abriera desde CloudStudio. OAuth queda siempre fuera de aquí.
 */
export function guardarModoDeProyecto(
  raiz: string,
  modo: "offline" | "cloud",
): { ruta: string; modo: "offline" | "cloud" } {
  const ruta = rutaConfigDeProyecto(raiz);
  const base = leerObjetoCrudoOAbortar(ruta);
  const fusionado = { ...base, modo };
  escribirAtomico(ruta, JSON.stringify(fusionado, null, 2) + "\n");
  return { ruta, modo };
}

/**
 * Guarda solo el endpoint MCP: OAuth nunca vive dentro del proyecto.
 *
 * Fusiona sobre `cloudstudio`, no lo reemplaza entero: un `/connect-studio` posterior
 * (nueva URL, o la misma) no puede borrar en silencio la `rama` o el `proyecto` que ya
 * se habían fijado — la próxima sincronización compararía contra la rama equivocada.
 */
export function guardarCloudStudioDeProyecto(
  raiz: string,
  url: string,
  scopes: readonly string[] = []
): { ruta: string; url: string; scopes: string[] } {
  const ruta = rutaConfigDeProyecto(raiz);
  const base = leerObjetoCrudoOAbortar(ruta);
  const cloudstudio = esObjeto(base.cloudstudio) ? { ...base.cloudstudio } : {};
  const fusionado = { ...base, cloudstudio: { ...cloudstudio, url, scopes: [...scopes] } };
  escribirAtomico(ruta, JSON.stringify(fusionado, null, 2) + "\n");
  return { ruta, url, scopes: [...scopes] };
}

/**
 * A qué entorno de `~/.xonecode/settings.json` pertenece este proyecto.
 *
 * Se guarda ADEMÁS de `cloudstudio.url`, nunca en su lugar: la URL es lo que leen
 * `crearSincronizador` (`cli/main.ts`) y todo lo que cuelga de él, y conservarla es lo que
 * hace literalmente cierto que la sincronización no se toca. El `entorno` añade la
 * referencia que hacía falta para leer el juego de credenciales correcto
 * (`porEntorno[id]`, `agent/cloudstudioMcp.ts`) en vez de reautenticar bajo `legado`.
 *
 * Misma mecánica que `guardarCloudStudioDeProyecto`: fusión sobre el objeto CRUDO y
 * escritura atómica, para no borrar lo que ya hubiera en el fichero.
 */
export function guardarEntornoDeProyecto(
  raiz: string,
  entorno: string | undefined,
): { ruta: string; entorno: string | undefined } {
  const ruta = rutaConfigDeProyecto(raiz);
  const base = leerObjetoCrudoOAbortar(ruta);
  // `undefined` BORRA la clave, y esa es la mitad importante: `/connect-studio` puede
  // reescribir la `url` con la de un servidor que no está registrado en `settings.json`, y
  // un `entorno` que sobreviviera a ese cambio apuntaría al hueco de credenciales de OTRO
  // servidor. Mandar el token de un CloudStudio a otro es peor que reautenticar.
  const { entorno: _viejo, ...sinEntorno } = base;
  const fusionado = entorno === undefined ? sinEntorno : { ...base, entorno };
  escribirAtomico(ruta, JSON.stringify(fusionado, null, 2) + "\n");
  return { ruta, entorno };
}

/** Guarda la identidad del proyecto remoto, sin mezclarla con el token OAuth. */
export function guardarProyectoCloudStudioDeProyecto(
  raiz: string,
  proyecto: { id: string; nombre: string },
): { ruta: string; proyecto: { id: string; nombre: string } } {
  const ruta = rutaConfigDeProyecto(raiz);
  const base = leerObjetoCrudoOAbortar(ruta);
  const cloudstudio = esObjeto(base.cloudstudio) ? { ...base.cloudstudio } : {};
  const seleccionado = { id: proyecto.id, nombre: proyecto.nombre };
  const fusionado = { ...base, cloudstudio: { ...cloudstudio, proyecto: seleccionado } };
  escribirAtomico(ruta, JSON.stringify(fusionado, null, 2) + "\n");
  return { ruta, proyecto: seleccionado };
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
  "ollama-cloud": "OLLAMA_API_KEY",
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
