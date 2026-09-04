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
describe("tipos del cliente", () => {
  it("los tipos de acto del cliente y del host no divergen", () => {
    const aqui = dirname(fileURLToPath(import.meta.url));
    const tiposDe = (ruta: string) =>
      [...readFileSync(ruta, "utf8").matchAll(/\{\s*tipo:\s*"([a-z]+)"/g)].map((m) => m[1]).sort();
    expect(tiposDe(join(aqui, "tipos.ts")))
      .toEqual(tiposDe(join(aqui, "..", "..", "..", "src", "core", "actos.ts")));
  });
});
