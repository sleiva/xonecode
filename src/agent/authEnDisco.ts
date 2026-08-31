/**
 * El ESCRITOR de `~/.xonecode/auth.json` (el lector está en `configEnDisco.ts`).
 *
 * El contrato con el fichero del usuario: una escritura NUNCA destruye lo que ya
 * había. Por eso la base de la fusión es el objeto CRUDO tal cual (no el resultado
 * de `validarAuth`, que descarta en silencio entradas raras) y por eso ante un JSON
 * roto se PARA sin escribir, en vez de recuperar el fichero por su cuenta.
 */

import { chmodSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { validarAuth, type Aviso } from "../core/config.js";
import type { Proveedor } from "../core/modelos.js";
import { rutaAuth } from "./configEnDisco.js";

/** Un `auth.json` existente que no se puede fusionar: no se escribe nada encima. */
export class AuthRotoEnDisco extends Error {}

/** Misma regla que en core/config.ts: un JSON-array NO es una raíz de fusionado. */
function esObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function guardarCredencial(proveedor: Proveedor, clave: string): { ruta: string; avisos: Aviso[] } {
  const ruta = rutaAuth();

  // 0700 en la misma llamada que crea la carpeta: un mkdir + chmod posterior dejaría
  // una ventana con la carpeta de credenciales legible.
  mkdirSync(dirname(ruta), { recursive: true, mode: 0o700 });

  let base: Record<string, unknown> = {};
  let avisos: Aviso[] = [];

  if (existsSync(ruta)) {
    let bruto: unknown;
    try {
      bruto = JSON.parse(readFileSync(ruta, "utf8"));
    } catch {
      // El mensaje solo nombra la ruta, nunca el contenido: eso acaba en logs y captures.
      throw new AuthRotoEnDisco(
        `«${ruta}»: el JSON es inválido; no se sobrescribe. Edita el fichero a mano.`
      );
    }
    if (!esObjeto(bruto)) {
      throw new AuthRotoEnDisco(
        `«${ruta}»: el JSON raíz debe ser un objeto; no se sobrescribe. Edita el fichero a mano.`
      );
    }

    // Fusionar desde el result de validarAuth BORRARÍA del fichero del usuario todo lo
    // que la validación descarta (proveedores desconocidos, credenciales de forma rara).
    // La base es el objeto crudo; a validarAuth solo se le piden los avisos.
    base = { ...bruto };
    const modoReal = statSync(ruta).mode & 0o777;
    avisos = validarAuth(bruto, ruta, modoReal, "global").avisos;
  }

  // Siempre la forma canónica { key } por proveedor, para que el resultado sea homogéneo
  // aunque el fichero previo mezclara formas.
  const fusionado = { ...base, [proveedor]: { key: clave } };

  // El { mode } solo aplica al CREAR; en el caso de fusión el fichero conserva su modo
  // previo, que puede haber sido malo. chmod después no viola la atomicidad: la creación
  // sigue siendo 0600 desde el primer byte.
  writeFileSync(ruta, JSON.stringify(fusionado, null, 2) + "\n", { mode: 0o600 });
  chmodSync(ruta, 0o600);

  return { ruta, avisos };
}