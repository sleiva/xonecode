/**
 * El ESCRITOR de `~/.xonecode/auth.json` (el lector está en `configEnDisco.ts`).
 *
 * El contrato con el fichero del usuario: una escritura NUNCA destruye lo que ya
 * había. Por eso la base de la fusión es el objeto CRUDO tal cual (no el resultado
 * de `validarAuth`, que descarta en silencio entradas raras) y por eso ante un JSON
 * roto se PARA sin escribir, en vez de recuperar el fichero por su cuenta.
 *
 * Escribe TAMBIÉN en `process.env` (ver el final de `guardarCredencial`): el fichero es
 * para la próxima ejecución y la variable es para ésta, y una credencial que solo existe
 * en disco no la ve nada de lo que ya está corriendo.
 */

import { chmodSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { validarAuth, type Aviso } from "../core/config.js";
import type { Proveedor } from "../core/modelos.js";
import { aplicarCredencialAlProceso, rutaAuth, VARIABLES_POR_PROVEEDOR } from "./configEnDisco.js";

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

  // Y se aplica al proceso VIVO, machacando lo que hubiera en la variable.
  //
  // `aplicarAuth` (`configEnDisco.ts`) hace lo contrario a propósito: en el arranque, una
  // variable del entorno manda sobre el fichero. Aquí es al revés porque el fichero acaba
  // de cambiar por orden explícita de un humano —`/provider` o el asistente de cuenta— y
  // es lo último que se ha dicho sobre esa credencial.
  //
  // Sin esto, la clave escrita a media sesión no existía para nada de lo que corre después:
  // `CatalogoModelos` la lee de `process.env` (`agent/catalogoModelos.ts`), así que el
  // asistente de cuenta pedía la clave, la guardaba y a continuación fallaba con «falta la
  // credencial para …; usa /provider …» — medido, y el motivo por el que la validación de
  // la conexión no podía pasar en un arranque nuevo con ningún proveedor de pago.
  aplicarCredencialAlProceso(proveedor, clave);

  return { ruta, avisos };
}

/**
 * Quita la credencial de un proveedor de `auth.json`. Devuelve dónde estaba y si TODAVÍA
 * queda puesta por el entorno.
 *
 * Mismo contrato que escribir: se fusiona sobre el objeto CRUDO —lo que este fichero no
 * entiende se conserva— y ante un JSON roto se PARA sin tocar nada. Borrar lo que no
 * estaba no es un error: es el estado que se pedía, y decirlo dos veces no cambia el
 * fichero.
 *
 * De `process.env` se quita SOLO si la variable llevaba exactamente la clave que se acaba
 * de borrar. Ese es el caso de `aplicarAuth` (el arranque copió `auth.json` al entorno) y
 * también el de quien exportó la misma clave a mano — para el proceso son lo mismo. Una
 * variable con OTRO valor es del usuario, no nuestra: no se toca, y por eso se devuelve
 * `quedaEnEntorno`, para que quien lo pidió pueda decir la verdad («se borró del fichero,
 * pero sigue puesta por la variable»). Desexportar la shell de nadie no está a nuestro
 * alcance.
 */
export function borrarCredencial(proveedor: Proveedor, clave?: string): {
  ruta: string;
  borrada: boolean;
  quedaEnEntorno: boolean;
} {
  const ruta = rutaAuth();
  const variable = VARIABLES_POR_PROVEEDOR[proveedor];
  if (!existsSync(ruta)) {
    return { ruta, borrada: false, quedaEnEntorno: variable !== undefined && process.env[variable] !== undefined };
  }

  let bruto: unknown;
  try {
    bruto = JSON.parse(readFileSync(ruta, "utf8"));
  } catch {
    throw new AuthRotoEnDisco(`«${ruta}»: el JSON es inválido; no se sobrescribe. Edita el fichero a mano.`);
  }
  if (!esObjeto(bruto)) {
    throw new AuthRotoEnDisco(`«${ruta}»: el JSON raíz debe ser un objeto; no se sobrescribe. Edita el fichero a mano.`);
  }

  const borrada = proveedor in bruto;
  const anterior = clave ?? claveDe(bruto[proveedor]);
  if (borrada) {
    const { [proveedor]: _fuera, ...resto } = bruto;
    writeFileSync(ruta, JSON.stringify(resto, null, 2) + "\n", { mode: 0o600 });
    chmodSync(ruta, 0o600);
  }

  if (variable !== undefined && anterior !== undefined && process.env[variable] === anterior) {
    delete process.env[variable];
  }
  return {
    ruta,
    borrada,
    quedaEnEntorno: variable !== undefined && process.env[variable] !== undefined,
  };
}

/** Las dos formas que `auth.json` acepta para una credencial: `"clave"` y `{ key }`. */
function claveDe(valor: unknown): string | undefined {
  if (typeof valor === "string") return valor;
  if (esObjeto(valor) && typeof valor.key === "string") return valor.key;
  return undefined;
}
