import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

// La skill no puede importar TypeScript: se prueba su módulo tal cual.
const lib = (await import(pathToFileURL(resolve(__dirname, "../../skills/xone-hotswap/lib/carpetas.mjs")).href)) as {
  carpetasPorOmision: (entorno: Record<string, string | undefined>, cwd: string) => Record<string, string>;
  rutaParaAbrir: (cual: "artefactos" | "hotswap", entorno: Record<string, string | undefined>) => string;
};

/** Medido con Codex sobre la calculadora: sin el harness, `--captura` fallaba por no tener `XONECODE_ARTEFACTOS`. */
describe("las carpetas de xone-hotswap sin harness", () => {
  it("con el harness no se toca nada y las rutas son las virtuales", () => {
    expect(lib.carpetasPorOmision({ XONECODE_ARTEFACTOS: "/a", XONECODE_HOTSWAP: "/h" }, "/x")).toEqual({});
    expect(lib.rutaParaAbrir("hotswap", { XONECODE_HOTSWAP: "/h" })).toBe("/hotswap/");
  });

  it("en un proyecto XOne van a su `.xonecode/` —nunca a la raíz— y la salida nombra la ruta REAL", () => {
    const proyecto = mkdtempSync(join(tmpdir(), "xc-carpetas-"));
    writeFileSync(join(proyecto, "app.xml"), "<app/>");
    const c = lib.carpetasPorOmision({}, proyecto);
    expect(c.XONECODE_ARTEFACTOS).toBe(join(proyecto, ".xonecode", "artefactos"));
    expect(c.XONECODE_HOTSWAP).toBe(join(proyecto, ".xonecode", "hotswap"));
    expect(lib.rutaParaAbrir("artefactos", c)).toBe(`${join(proyecto, ".xonecode", "artefactos")}/`);
  });

  it("fuera de un proyecto, a una temporal; y un harness viejo (solo artefactos) sigue como estaba", () => {
    const suelto = mkdtempSync(join(tmpdir(), "xc-suelto-"));
    mkdirSync(join(suelto, "sub"));
    expect(lib.carpetasPorOmision({}, suelto).XONECODE_ARTEFACTOS).toBe(join(tmpdir(), "xone-hotswap", "artefactos"));
    expect(lib.carpetasPorOmision({ XONECODE_ARTEFACTOS: "/a" }, suelto)).toEqual({});
  });
});
