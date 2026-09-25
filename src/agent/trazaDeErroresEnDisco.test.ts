import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { anotarPaso, ponerSumideroDeErrores } from "../core/trazaDeErrores.js";
import { encenderTrazaDeErrores, VARIABLE_TRAZA_ERRORES } from "./trazaDeErroresEnDisco.js";

afterEach(() => ponerSumideroDeErrores(undefined));

describe("encenderTrazaDeErrores", () => {
  it("solo se activa de forma explícita", () => {
    const raiz = mkdtempSync(join(tmpdir(), "xc-traza-errores-"));
    expect(encenderTrazaDeErrores(raiz, {})).toBeUndefined();
    anotarPaso("x#y")();
    expect(existsSync(join(raiz, ".xonecode", "traza-errores.jsonl"))).toBe(false);
  });

  it("una sesión SIN la variable APAGA el sumidero de una sesión ANTERIOR", () => {
    // El sumidero es GLOBAL (core/trazaDeErrores.ts): sin esto, abrir una segunda sesión sin
    // depurar seguiría escribiendo los hitos de esa segunda sesión en el `raiz` de la
    // PRIMERA, que ya no tiene nada que ver — y apagar la casilla en Ajustes no apagaría nada
    // de verdad mientras el proceso siguiera vivo.
    const raizA = mkdtempSync(join(tmpdir(), "xc-traza-errores-a-"));
    const raizB = mkdtempSync(join(tmpdir(), "xc-traza-errores-b-"));
    encenderTrazaDeErrores(raizA, { [VARIABLE_TRAZA_ERRORES]: "1" });
    encenderTrazaDeErrores(raizB, {});
    anotarPaso("x#y")();
    expect(existsSync(join(raizA, ".xonecode", "traza-errores.jsonl"))).toBe(false);
    expect(existsSync(join(raizB, ".xonecode", "traza-errores.jsonl"))).toBe(false);
  });

  it("sigue escribiendo cuando SÍ está activa", () => {
    const raiz = mkdtempSync(join(tmpdir(), "xc-traza-errores-"));
    encenderTrazaDeErrores(raiz, { [VARIABLE_TRAZA_ERRORES]: "1" });
    anotarPaso("x#y")();
    const lineas = readFileSync(join(raiz, ".xonecode", "traza-errores.jsonl"), "utf8").trim().split("\n");
    expect(lineas.some((l) => JSON.parse(l).donde === "x#y")).toBe(true);
  });
});
