/**
 * El ESCRITOR de `~/.xonecode/settings.json` (el lector puro está en `core/settings.ts`).
 *
 * Misma disciplina que `authEnDisco.ts`: una escritura nunca destruye lo que ya había,
 * así que la base de la fusión es el objeto CRUDO tal cual (no el resultado de
 * `validarSettings`, que descarta en silencio entradas raras) y ante un JSON roto se
 * PARA sin escribir, en vez de recuperar el fichero por su cuenta. La mecánica de
 * escritura —temporal + `renameSync`— es la de `agent/cloudstudioMcp.ts#guardarEstado`:
 * un `writeFileSync` a medias dejaría un `settings.json` truncado si el proceso muere a
 * mitad de escritura, y el rename es atómico.
 */

import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { Aviso } from "../core/config.js";
import { Entorno, Settings, validarSettings } from "../core/settings.js";

const NOMBRE_CARPETA = ".xonecode";

/** Un `settings.json` existente que no se puede fusionar: no se escribe nada encima. */
export class SettingsRotosEnDisco extends Error {}

/** Misma regla que en core/config.ts y core/settings.ts: un JSON-array no es una raíz de fusionado. */
function esObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * `casa` es inyectable (por omisión `homedir()`) porque los tests no pueden tocar el
 * `~/.xonecode` real — se resuelve en cada llamada, nunca se cachea, por la misma razón
 * que `configEnDisco.ts#rutaConfigGlobal`: un test que cambia la home después del import
 * vería si no la ruta vieja.
 */
export function rutaSettings(casa: string = homedir()): string {
  return join(casa, NOMBRE_CARPETA, "settings.json");
}

/**
 * Sin fichero, settings vacíos y sin avisos: no hay nada que crear solo por leer.
 *
 * Igual que `cargar()` en `configEnDisco.ts`, devuelve `{ settings, avisos }` — el JSON
 * roto y la credencial colada NO lanzan, se cuentan como aviso: un fallo del área de
 * CloudStudio no puede tumbar el arranque de la consola (invariante de `CLAUDE.md`), y
 * `validarSettings` ya no lanza para una credencial, solo para JSON-que-no-parsea, que
 * aquí se atrapa igual que en `configEnDisco.ts`.
 */
export function cargarSettings(casa: string = homedir()): { settings: Settings; avisos: Aviso[] } {
  const ruta = rutaSettings(casa);
  if (!existsSync(ruta)) return { settings: { entornos: [] }, avisos: [] };
  let bruto: unknown;
  try {
    bruto = JSON.parse(readFileSync(ruta, "utf8"));
  } catch {
    return {
      settings: { entornos: [] },
      avisos: [{ texto: `«${ruta}»: el JSON es inválido; se ignora el fichero.`, severidad: "aviso" }],
    };
  }
  return validarSettings(bruto);
}

function leerCrudoOAbortar(ruta: string): Record<string, unknown> {
  if (!existsSync(ruta)) return {};
  let bruto: unknown;
  try {
    bruto = JSON.parse(readFileSync(ruta, "utf8"));
  } catch {
    // El mensaje solo nombra la ruta, nunca el contenido: eso acaba en logs y capturas.
    throw new SettingsRotosEnDisco(
      `«${ruta}»: el JSON es inválido; no se sobrescribe. Edita el fichero a mano.`
    );
  }
  if (!esObjeto(bruto)) {
    throw new SettingsRotosEnDisco(
      `«${ruta}»: el JSON raíz debe ser un objeto; no se sobrescribe. Edita el fichero a mano.`
    );
  }
  // Fusionar desde validarSettings BORRARÍA del fichero del usuario todo lo que la
  // validación descarta (entornos rotos, campos desconocidos). La base es el objeto crudo.
  return { ...bruto };
}

function escribirAtomico(ruta: string, contenido: string): void {
  const directorio = dirname(ruta);
  // 0700 en la misma llamada que crea la carpeta: un mkdir + chmod posterior dejaría una
  // ventana con la carpeta legible de más.
  mkdirSync(directorio, { recursive: true, mode: 0o700 });
  const temporal = join(directorio, `.settings.json.${randomUUID()}.tmp`);
  let descriptor: number | undefined;
  try {
    descriptor = openSync(temporal, "wx", 0o600);
    writeFileSync(descriptor, contenido, "utf8");
    closeSync(descriptor);
    descriptor = undefined;
    renameSync(temporal, ruta);
  } catch (error) {
    if (descriptor !== undefined) {
      try {
        closeSync(descriptor);
      } catch {
        // Un fallo al cerrar durante la recuperación no puede impedir borrar el temporal.
      }
    }
    try {
      unlinkSync(temporal);
    } catch {
      // Si no llegó a crearse, no hay nada que limpiar.
    }
    throw error;
  }
}

/** Registra o sustituye un entorno por `id`, sin tocar los demás ni el resto del fichero. */
export function guardarEntorno(casa: string | undefined, entorno: Entorno): { ruta: string } {
  const ruta = rutaSettings(casa ?? homedir());
  const base = leerCrudoOAbortar(ruta);
  const listaBruta = Array.isArray(base.entornos) ? base.entornos : [];
  const otros = listaBruta.filter(
    (e) => !(esObjeto(e) && e.id === entorno.id)
  );
  const fusionado = { ...base, entornos: [...otros, { ...entorno }] };
  escribirAtomico(ruta, JSON.stringify(fusionado, null, 2) + "\n");
  return { ruta };
}

/** Guarda solo la base del workspace, sin tocar la lista de entornos. */
export function guardarWorkspace(casa: string | undefined, base: string): { ruta: string } {
  const ruta = rutaSettings(casa ?? homedir());
  const crudo = leerCrudoOAbortar(ruta);
  const fusionado = { ...crudo, workspace: base };
  escribirAtomico(ruta, JSON.stringify(fusionado, null, 2) + "\n");
  return { ruta };
}
