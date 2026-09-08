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
const RUTA_TAREAS = join(aqui, "..", "..", "..", "src", "core", "tareas.ts");

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

  /**
   * Task 13: `AccionesDeTarea.tsx` decide qué botón ofrecer mirando `TRANSICIONES`, y esa
   * tabla vive en `core/tareas.ts` — la frontera del cliente no deja importarla, así que
   * `tipos.ts` la redeclara. Sin este test, la copia del cliente se podría quedar vieja el
   * día que alguien cambie una transición en el host y nadie lo note: exactamente la
   * divergencia silenciosa que esta tarea existe para cerrar.
   */
  it("TRANSICIONES del cliente y del host no divergen", () => {
    expect(transicionesDe(RUTA_TIPOS)).toEqual(transicionesDe(RUTA_TAREAS));
  });
});

/**
 * Extrae, para cada estado conocido, la lista de estados a los que puede ir — de un bloque
 * `TRANSICIONES: … = { … };`, por TEXTO y no por import (misma razón que `literalesDe`).
 * El regex acepta la clave con o sin comillas (`nuevo:` en el host, `"en-proceso":` al
 * lado) y no le importan los comentarios intercalados, porque solo mira dentro de cada
 * `[...]`.
 */
function transicionesDe(ruta: string): Record<string, string[]> {
  const fuente = readFileSync(ruta, "utf8");
  const bloque = fuente.match(/TRANSICIONES[^=]*=\s*\{([\s\S]*?)\n\};/);
  if (bloque === null) throw new Error(`no se encontró TRANSICIONES en ${ruta}`);
  const resultado: Record<string, string[]> = {};
  const regex = /"?([a-z][a-z-]*)"?:\s*\[([^\]]*)\]/g;
  for (const m of bloque[1].matchAll(regex)) {
    resultado[m[1]] = m[2]
      .split(",")
      .map((v) => v.trim().replace(/^"|"$/g, ""))
      .filter((v) => v !== "")
      .sort();
  }
  return resultado;
}
