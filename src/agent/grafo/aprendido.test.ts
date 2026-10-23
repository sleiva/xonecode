import { mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { crearApuntarAprendizaje, leerAprendido, leerAprendidoDeXone, rutaDeAprendido, rutaDeAprendidoDeXone } from "./aprendido.js";

describe("apuntar_aprendizaje, contra el disco", () => {
  it("escribe en .xonecode/aprendido.json con 0600, sustituye el mismo tema y rechaza sin lanzar", async () => {
    const raiz = mkdtempSync(join(tmpdir(), "xc-aprendido-"));
    const t = crearApuntarAprendizaje({ raiz, quien: "device-controller", ahora: () => new Date("2026-10-15T10:00:00Z") });
    expect(await t.invoke({ tema: "cómo entrar en la app", texto: "usuario 1", como_lo_se: "lo probé", alcance: "proyecto" })).toContain("Apuntado «cómo entrar en la app»");
    await t.invoke({ tema: "Cómo entrar en la app", texto: "usuario 08006, sin clave; pulsar Entrar", como_lo_se: " entré en el emulador ", alcance: "proyecto" });
    expect(leerAprendido(raiz)).toEqual([
      {
        tema: "Cómo entrar en la app",
        texto: "usuario 08006, sin clave; pulsar Entrar",
        comoLoSe: "entré en el emulador",
        cuando: "2026-10-15T10:00:00.000Z",
        quien: "device-controller",
      },
    ]);
    if (process.platform !== "win32") expect(statSync(rutaDeAprendido(raiz)).mode & 0o777).toBe(0o600);
    expect(await t.invoke({ tema: "", texto: "x", como_lo_se: "lo probé", alcance: "proyecto" })).toBe("No se apunta: falta el tema.");
    expect(await t.invoke({ tema: "otra cosa", texto: "x", como_lo_se: "", alcance: "proyecto" })).toContain("No se apunta: falta cómo lo sabes");
    expect(JSON.parse(readFileSync(rutaDeAprendido(raiz), "utf8"))).toHaveLength(1);
  });

  it("sin fichero no hay nada apuntado", () => {
    expect(leerAprendido(mkdtempSync(join(tmpdir(), "xc-aprendido-")))).toEqual([]);
  });

  it("lo de XOne va a la carpeta GLOBAL, no al proyecto, y lo lee cualquier otro proyecto", async () => {
    const casa = mkdtempSync(join(tmpdir(), "xc-casa-"));
    const raiz = mkdtempSync(join(tmpdir(), "xc-aprendido-"));
    const t = crearApuntarAprendizaje({ raiz, quien: "developer-xone", casa, ahora: () => new Date("2026-10-23T08:00:00Z") });
    const respuesta = await t.invoke({ tema: "imgbk anula border-corner-radius", texto: "en un frame", como_lo_se: "lo vi en el emulador", alcance: "xone" });
    expect(respuesta).toContain("TODOS los proyectos");
    expect(leerAprendido(raiz)).toEqual([]);
    expect(rutaDeAprendidoDeXone(casa)).toBe(join(casa, ".xonecode", "aprendido-xone.json"));
    expect(leerAprendidoDeXone(casa)).toEqual([
      { tema: "imgbk anula border-corner-radius", texto: "en un frame", comoLoSe: "lo vi en el emulador", cuando: "2026-10-23T08:00:00.000Z", quien: "developer-xone" },
    ]);
    if (process.platform !== "win32") expect(statSync(rutaDeAprendidoDeXone(casa)).mode & 0o777).toBe(0o600);
  });

  it("sin alcance la tool no se ejecuta: el esquema lo exige", async () => {
    const t = crearApuntarAprendizaje({ raiz: mkdtempSync(join(tmpdir(), "xc-aprendido-")), quien: "x" });
    await expect(t.invoke({ tema: "t", texto: "x", como_lo_se: "lo probé" } as never)).rejects.toThrow();
  });

  it("lo de XOne que nombra una colección del proyecto NO se apunta en el global, y se dice cómo apuntarlo", async () => {
    const casa = mkdtempSync(join(tmpdir(), "xc-casa-"));
    const raiz = join(mkdtempSync(join(tmpdir(), "xc-aprendido-")), "Maset");
    mkdirSync(raiz);
    writeFileSync(join(raiz, "MenuLiquidacionesGeneral.xne"), "<coll/>");
    const t = crearApuntarAprendizaje({ raiz, quien: "designer-xone", casa });
    const r = await t.invoke({ tema: "qué hay en /artefactos/diseno", texto: "la maqueta de MenuLiquidacionesGeneral", como_lo_se: "lo leí", alcance: "xone" });
    expect(r).toContain("No se apunta como XOne");
    expect(r).toContain("alcance «proyecto»");
    expect(leerAprendidoDeXone(casa)).toEqual([]);
    // El mismo, con alcance proyecto, sí.
    expect(await t.invoke({ tema: "qué hay en /artefactos/diseno", texto: "la maqueta de MenuLiquidacionesGeneral", como_lo_se: "lo leí", alcance: "proyecto" })).toContain("Apuntado");
  });
});
