import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * **La aplicación no importa CodeMirror; solo el editor, y al editor solo se llega con `import()`.**
 * CodeMirror con sus lenguajes y su diff pesa lo bastante para notarse al abrir la consola, y un
 * import estático desde cualquier fichero de la aplicación lo metería en el bundle principal sin
 * que nada lo notara: el síntoma sería una consola que tarda más en abrir. Se comprueba por TEXTO,
 * como `openui/frontera.test.ts`. Los tests están exentos: montan el editor a propósito.
 */
const aqui = dirname(fileURLToPath(import.meta.url));
const src = join(aqui, "..");

function ficheros(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const r = join(dir, n);
    if (statSync(r).isDirectory()) return ficheros(r);
    return /\.(ts|tsx)$/.test(n) && !/\.test\.tsx?$/.test(n) ? [r] : [];
  });
}

/** Fuera de `editor/` es lo que NO tiene `editor` como PRIMER segmento: un `editorial/` vecino no es el editor. */
const deFuera = (): string[] => ficheros(src).filter((f) => relative(src, f).split(/[\\/]/)[0] !== "editor");

/** Las tres formas de traer un paquete: `from "…"`, el import de EFECTO `import "…"` y el dinámico `import("…")`. */
const IMPORTA_CODEMIRROR = /(?:from\s+|import\s*\(?\s*)["']@(?:codemirror|lezer)\//;

describe("la frontera del editor en el cliente", () => {
  it("la búsqueda caza las tres formas de importar, y hay ficheros que mirar", () => {
    for (const forma of ['import { x } from "@codemirror/view";', 'import "@codemirror/view";', 'const m = await import("@lezer/highlight");']) {
      expect(IMPORTA_CODEMIRROR.test(forma), forma).toBe(true);
    }
    expect(IMPORTA_CODEMIRROR.test('import { x } from "./codemirror.js";')).toBe(false);
    expect(deFuera().length).toBeGreaterThan(0);
  });

  it("fuera de src/editor/ nadie importa CodeMirror ni Lezer", () => {
    const culpables = deFuera()
      .filter((f) => IMPORTA_CODEMIRROR.test(readFileSync(f, "utf8")))
      .map((f) => relative(src, f));
    expect(culpables).toEqual([]);
  });

  it("y fuera de src/editor/ nadie importa el editor de forma estática", () => {
    const culpables = deFuera()
      .filter((f) => /from\s+["'](\.\.?\/)+editor\//.test(readFileSync(f, "utf8")))
      .map((f) => relative(src, f));
    expect(culpables).toEqual([]);
  });

  it("Ficheros lo carga en diferido, que es la única puerta", () => {
    const ficherosTsx = readFileSync(join(src, "componentes", "Ficheros.tsx"), "utf8");
    expect(ficherosTsx).toMatch(/lazy\(\s*\(\)\s*=>\s*import\(\s*["']\.\.\/editor\/EditorDeFichero\.js["']\s*\)\s*\)/);
  });
});
