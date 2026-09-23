import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { VERSION_DE_TRUEFORGE } from "./trueforge.js";

/** Todos los `.ts` de `src/`, recorridos a mano: el test no puede depender de un glob externo. */
function ficheros(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const ruta = join(dir, n);
    return statSync(ruta).isDirectory() ? ficheros(ruta) : ruta.endsWith(".ts") || ruta.endsWith(".tsx") ? [ruta] : [];
  });
}

/**
 * ¿Este código CARGA `@truefoundry/`? Las cuatro formas de hacerlo: `… from "x"` (import y
 * re-export), `import "x"` a secas, `import("x")` dinámico y `require("x")`. Solo buscar el `from`
 * dejaba pasar las otras tres. Y es un PATRÓN de carga, no «el nombre aparece»: `core/imports.test.ts`
 * nombra el paquete en una cadena para PROHIBIRLO, y eso no es importarlo.
 */
export const CARGA_TRUEFORGE = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)["'`]@truefoundry\//;

describe("la frontera con TrueForge", () => {
  it("el detector caza las CUATRO formas de cargar el paquete, y no una mención", () => {
    for (const carga of [
      'import { X } from "@truefoundry/trueforge-core/core";',
      'export { X } from "@truefoundry/trueforge-core/core";',
      'import type { X } from "@truefoundry/trueforge-core";',
      'import "@truefoundry/trueforge-core/core";',
      'const m = await import("@truefoundry/trueforge-core/core");',
      "const m = await import('@truefoundry/trueforge-core');",
      'const m = require("@truefoundry/trueforge-core");',
    ]) {
      expect(CARGA_TRUEFORGE.test(carga), carga).toBe(true);
    }
    for (const mencion of ['const PROHIBIDOS = ["@truefoundry/", "winston"];', "// ver @truefoundry/trueforge-core"]) {
      expect(CARGA_TRUEFORGE.test(mencion), mencion).toBe(false);
    }
  });

  it("la versión que se DECLARA es la fijada en `package.json` y la instalada: la foto de memoria la lleva", () => {
    const leer = (ruta: string) => JSON.parse(readFileSync(join(process.cwd(), ruta), "utf8")) as Record<string, unknown>;
    const fijada = (leer("package.json").dependencies as Record<string, string>)["@truefoundry/trueforge-core"];
    expect(fijada).toBe(VERSION_DE_TRUEFORGE);
    expect(leer(join("node_modules", "@truefoundry", "trueforge-core", "package.json")).version).toBe(VERSION_DE_TRUEFORGE);
  });

  it("SOLO `trueforge.ts` carga `@truefoundry/`: subir la librería se revisa en un fichero", () => {
    const src = join(process.cwd(), "src");
    const culpables = ficheros(src)
      .filter((f) => !f.endsWith(join("motores", "trueforge", "trueforge.ts")))
      // Este mismo fichero lleva las formas prohibidas como EJEMPLOS del detector.
      .filter((f) => !f.endsWith(join("motores", "trueforge", "frontera.test.ts")))
      .filter((f) => CARGA_TRUEFORGE.test(readFileSync(f, "utf8")))
      .map((f) => relative(src, f));
    expect(culpables).toEqual([]);
  });
});
