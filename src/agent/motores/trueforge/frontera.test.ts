import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/** Todos los `.ts` de `src/`, recorridos a mano: el test no puede depender de un glob externo. */
function ficheros(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const ruta = join(dir, n);
    return statSync(ruta).isDirectory() ? ficheros(ruta) : ruta.endsWith(".ts") || ruta.endsWith(".tsx") ? [ruta] : [];
  });
}

describe("la frontera con TrueForge", () => {
  it("SOLO `trueforge.ts` importa `@truefoundry/`: subir la librería se revisa en un fichero", () => {
    const src = join(process.cwd(), "src");
    const culpables = ficheros(src)
      .filter((f) => !f.endsWith(join("motores", "trueforge", "trueforge.ts")))
      // `core/imports.test.ts` NOMBRA el paquete para prohibirlo; no lo importa.
      .filter((f) => /from\s+["']@truefoundry\//.test(readFileSync(f, "utf8")))
      .map((f) => relative(src, f));
    expect(culpables).toEqual([]);
  });
});
