import { mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { crearApuntarAprendizaje, leerAprendido, rutaDeAprendido } from "./aprendido.js";

describe("apuntar_aprendizaje, contra el disco", () => {
  it("escribe en .xonecode/aprendido.json con 0600, sustituye el mismo tema y rechaza sin lanzar", async () => {
    const raiz = mkdtempSync(join(tmpdir(), "xc-aprendido-"));
    const t = crearApuntarAprendizaje({ raiz, quien: "device-controller", ahora: () => new Date("2026-10-15T10:00:00Z") });
    expect(await t.invoke({ tema: "cómo entrar en la app", texto: "usuario 1" })).toContain("Apuntado «cómo entrar en la app»");
    await t.invoke({ tema: "Cómo entrar en la app", texto: "usuario 08006, sin clave; pulsar Entrar" });
    expect(leerAprendido(raiz)).toEqual([
      { tema: "Cómo entrar en la app", texto: "usuario 08006, sin clave; pulsar Entrar", cuando: "2026-10-15T10:00:00.000Z", quien: "device-controller" },
    ]);
    if (process.platform !== "win32") expect(statSync(rutaDeAprendido(raiz)).mode & 0o777).toBe(0o600);
    expect(await t.invoke({ tema: "", texto: "x" })).toBe("No se apunta: falta el tema.");
    expect(JSON.parse(readFileSync(rutaDeAprendido(raiz), "utf8"))).toHaveLength(1);
  });

  it("sin fichero no hay nada apuntado", () => {
    expect(leerAprendido(mkdtempSync(join(tmpdir(), "xc-aprendido-")))).toEqual([]);
  });
});
