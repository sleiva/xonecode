/**
 * Pasar un `.xne` de 8 bits a UTF-8, sin perder un solo carácter.
 *
 * POR QUÉ EXISTE. Un hijo de Claude Code escribe con SUS `Write`/`Edit`, que solo escriben UTF-8.
 * Medido: Claude Code 2.1.263 y 2.1.280 escribían UTF-8 dentro de un `.xne` que declara
 * `iso-8859-15` («CAMIÓN» quedaba como los bytes `c3 93`, roto sin aviso), y 2.1.301 se NIEGA a
 * escribir un fichero que no sea UTF-8 — antes de que xonecode pueda intervenir. Además los tres
 * leen el fichero con «�» en cada tilde. Así que quien maqueta lo convierte antes de editarlo:
 * con este script, la conversión es exacta y el prólogo dice la verdad.
 *
 * La regla de la tabla es la de xonecode (`src/core/codificacion.ts`): ISO-8859-15 si el prólogo
 * la declara (su € en 0xA4), si no windows-1252. La regla vive dos veces porque una skill no puede
 * importar TypeScript; `src/core/aUtf8.skill.test.ts` impide que diverjan.
 *
 * Fuera de `scripts/` a propósito: esa carpeta va al PATH y cada fichero suyo es un comando.
 */

/** Los bytes son UTF-8 válido. */
export function esUtf8(bytes) {
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

const ENCODING_DEL_PROLOGO = /^(﻿?<\?xml[^>]*?\bencoding\s*=\s*)(["'])([^"']*)\2/i;

/** La tabla de 8 bits con que se leen estos bytes: la del prólogo si es ISO-8859-15, si no windows-1252. */
export function tablaDe(bytes) {
  const cabeza = new TextDecoder("latin1").decode(bytes.subarray(0, 200));
  const m = ENCODING_DEL_PROLOGO.exec(cabeza);
  const declarada = m?.[3].toLowerCase().replace(/[_\s]/g, "-");
  return declarada === "iso-8859-15" || declarada === "latin-9" || declarada === "latin9" ? "iso-8859-15" : "windows-1252";
}

/**
 * La conversión, pura: `{ yaUtf8: true }` si no hay nada que hacer, o el texto en UTF-8 con el
 * prólogo cambiado a `UTF-8`, la tabla de la que viene y cuántos caracteres no ASCII llevaba.
 */
export function aUtf8(bytes) {
  if (esUtf8(bytes)) return { yaUtf8: true };
  const tabla = tablaDe(bytes);
  const texto = new TextDecoder(tabla).decode(bytes);
  const prologo = ENCODING_DEL_PROLOGO.test(texto);
  const convertido = prologo ? texto.replace(ENCODING_DEL_PROLOGO, (_t, antes, comilla) => `${antes}${comilla}UTF-8${comilla}`) : texto;
  const noAscii = [...texto].filter((c) => c.charCodeAt(0) > 0x7f).length;
  return { yaUtf8: false, texto: convertido, tabla, prologo, noAscii };
}

/**
 * Por qué NO se convierte esa ruta, o `undefined` si vale. Relativa a la raíz del proyecto, un
 * `.xne` y nada de lo que xonecode no deja tocar: `.git`, `.xonecode`, `.env`, ni subir de carpeta.
 * Un `.xml` no: los genera XOne Studio y no se tocan.
 */
export function motivoDeRuta(ruta) {
  if (typeof ruta !== "string" || ruta.trim() === "") return "dime qué fichero, relativo a la raíz del proyecto (p. ej. EntryPoint.xne)";
  const limpia = ruta.replace(/^\.\//, "");
  if (limpia.startsWith("/") || /^[A-Za-z]:/.test(limpia) || limpia.includes("\\")) {
    return "la ruta va relativa a la raíz del proyecto, sin barra delante (p. ej. EntryPoint.xne)";
  }
  const partes = limpia.split("/");
  if (partes.some((p) => p === ".." || p === "" || p === ".")) return "la ruta no puede subir de carpeta ni tener tramos vacíos";
  if ([".git", ".xonecode", ".env"].includes(partes[0])) return `«${partes[0]}» no es del proyecto: no se toca`;
  if (!limpia.toLowerCase().endsWith(".xne")) return "solo convierte ficheros .xne (los .xml los genera XOne Studio y no se tocan)";
  return undefined;
}
