import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * **La aplicación no importa OpenUI; solo su visor.** El renderer y su librería de componentes
 * pesan varios megas (`vite.openui.config.ts`), y un import desde la consola los metería en el
 * bundle de la aplicación sin que ningún test lo notara: el síntoma sería una consola que tarda
 * más en abrir. Así que se comprueba por TEXTO en todo `src/` salvo `src/openui/`.
 */
const aqui = dirname(fileURLToPath(import.meta.url));
const src = join(aqui, "..");

function ficheros(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const r = join(dir, n);
    if (statSync(r).isDirectory()) return ficheros(r);
    return /\.(ts|tsx)$/.test(n) ? [r] : [];
  });
}

describe("la frontera de OpenUI en el cliente", () => {
  it("fuera de src/openui/ nadie importa @openuidev", () => {
    const culpables = ficheros(src)
      .filter((f) => !relative(src, f).startsWith("openui"))
      .filter((f) => /from\s+["']@openuidev\//.test(readFileSync(f, "utf8")))
      .map((f) => relative(src, f));
    expect(culpables).toEqual([]);
  });

  it("y la aplicación no importa el visor", () => {
    const culpables = ficheros(src)
      .filter((f) => !relative(src, f).startsWith("openui"))
      .filter((f) => /from\s+["'][./]+openui\/visor/.test(readFileSync(f, "utf8")))
      .map((f) => relative(src, f));
    expect(culpables).toEqual([]);
  });
});
