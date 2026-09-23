import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { guardarMemoria } from "../motores/trueforge/memoriaTrueforge.js";
import { hayMemoriaDeHilo, olvidarMemoriaDeHilo } from "./memoriaDeHilo.js";

describe("la memoria de una sesión, de cualquiera de los dos motores", () => {
  it("una sesión de TrueForge con foto TIENE memoria —la web no la pinta como perdida— y borrarla se la lleva", async () => {
    const raiz = mkdtempSync(join(tmpdir(), "xc-memoria-hilo-"));
    expect(await hayMemoriaDeHilo(raiz, "s1")).toBe(false);
    guardarMemoria(raiz, "s1", { context: [{ role: "user", content: "hola" }] });
    expect(await hayMemoriaDeHilo(raiz, "s1")).toBe(true);
    await olvidarMemoriaDeHilo(raiz, "s1");
    expect(await hayMemoriaDeHilo(raiz, "s1")).toBe(false);
  });
});
