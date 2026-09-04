import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, it, expect } from "vitest";

// `new URL("./tipos.ts", import.meta.url)` —la forma que trae el brief— es EXACTAMENTE
// el patrón que el plugin `vite:asset-import-meta-url` reescribe para servir un asset:
// bajo el proyecto «cliente» (entorno jsdom, `environment.config.consumer === "client"`)
// lo convierte en una URL `http://localhost:.../…` en vez de dejarlo apuntar al fichero
// real, y `readFileSync` de esa URL falla con «must be of scheme file». Medido: hasta con
// `/* @vite-ignore */` delante de la cadena el resultado seguía sin ser la ruta real.
// `fileURLToPath` + `path.join` no coincide con ese patrón sintáctico, así que no lo activa.
const aqui = dirname(fileURLToPath(import.meta.url));
const RUTA_TIPOS = join(aqui, "tipos.ts");
const RUTA_ACTOS = join(aqui, "..", "..", "..", "src", "core", "actos.ts");
const RUTA_TRANSPORTE = join(aqui, "..", "..", "..", "src", "web", "servidor", "transporte.ts");

/**
 * `[a-z0-9_-]+` y no `[a-z]+`: la primera versión de este detector (la del brief) no veía
 * guion bajo ni guion. Medido en la ronda de revisión: un tipo llamado `"fantasma_review"`
 * metido a mano pasaba el test sin que nada chistara, porque el propio detector lo
 * truncaba a la parte anterior al `_` — o directamente no lo capturaba si el `_` iba al
 * principio del resto de la coincidencia. Un tipo real con guion bajo o guion sería
 * invisible a la comprobación de divergencia con la regex vieja.
 */
function literalesDe(campo: "tipo" | "clase", ruta: string): string[] {
  const regex = new RegExp(`\\{\\s*${campo}:\\s*"([a-z0-9_-]+)"`, "g");
  return [...readFileSync(ruta, "utf8").matchAll(regex)].map((m) => m[1]).sort();
}

describe("tipos del cliente", () => {
  it("los tipos de acto del cliente y del host no divergen", () => {
    expect(literalesDe("tipo", RUTA_TIPOS)).toEqual(literalesDe("tipo", RUTA_ACTOS));
  });

  /**
   * F1 de la revisión: el test de arriba solo miraba `Acto`. `MensajeDelCliente` se había
   * quedado sin `{ clase: "secreto"; valor: string }` (`transporte.ts:46`) y nada lo
   * delataba — `enviar()` no construye ese mensaje hoy, pero la Task 14 (el wizard, que usa
   * `leerSecreto`) se lo habría encontrado a mano. Se compara TODO literal `clase:` del
   * fichero —de las dos uniones, `MensajeAlCliente` y `MensajeDelCliente`, juntas— contra
   * todo literal `clase:` de `transporte.ts`: como `"secreto"` aparece una vez en cada
   * unión (la pregunta del servidor y la respuesta del cliente son mensajes DISTINTOS con
   * el mismo nombre de clase), la lista ordenada tiene que traer ese duplicado en los dos
   * ficheros para calzar.
   */
  it("los mensajes del transporte (clase:) del cliente y del host no divergen", () => {
    expect(literalesDe("clase", RUTA_TIPOS)).toEqual(literalesDe("clase", RUTA_TRANSPORTE));
  });

  it("el detector ve guion bajo y guion, no solo minúsculas: 'fantasma_review' no es invisible", () => {
    const conGuionBajo = '| { tipo: "fantasma_review"; texto: string }';
    const regex = /\{\s*tipo:\s*"([a-z0-9_-]+)"/g;
    expect([...conGuionBajo.matchAll(regex)].map((m) => m[1])).toEqual(["fantasma_review"]);
  });
});
