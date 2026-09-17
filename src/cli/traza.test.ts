import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cmdTraza } from "./traza.js";
import { rutaTrazaDeTools } from "../agent/turno/diagnosticoDeTools.js";

function proyectoConTraza(lineas: string[]): string {
  const raiz = mkdtempSync(join(tmpdir(), "xc-cmd-traza-"));
  mkdirSync(join(raiz, ".xonecode"), { recursive: true });
  writeFileSync(rutaTrazaDeTools(raiz), lineas.map((l) => `${l}\n`).join(""), "utf8");
  return raiz;
}

const modelo = (origen: string, input: number, output: number, sesion: string): string =>
  JSON.stringify({ v: 1, sesion, at: "2026-09-17T10:00:00.000Z", tipo: "modelo", origen, input, output, cache: 0, llamadas: 1, contexto: input });

function recoger(): { escribir: (t: string) => void; texto: () => string } {
  let texto = "";
  return { escribir: (t) => (texto += t), texto: () => texto };
}

describe("xonecode traza", () => {
  it("sin traza no dice «cero»: dice cómo se enciende", async () => {
    const raiz = mkdtempSync(join(tmpdir(), "xc-cmd-traza-"));
    const salida = recoger();
    const codigo = await cmdTraza(raiz, salida.escribir);
    expect(codigo).toBe(70);
    expect(salida.texto()).toContain("XONECODE_TRACE_TOOLS=1");
  });

  it("por omisión informa de la ÚLTIMA sesión y dice cuántas hay", async () => {
    const raiz = proyectoConTraza([modelo("orquestador", 100, 10, "s1"), modelo("developer-xone", 900, 90, "s2")]);
    const salida = recoger();
    expect(await cmdTraza(raiz, salida.escribir)).toBe(0);
    expect(salida.texto()).toContain("developer-xone");
    // La de antes no se pinta, pero SE DICE que está: un informe que calla lo que no enseña
    // deja creyendo que la traza es solo lo que se ve.
    expect(salida.texto()).not.toContain("orquestador");
    expect(salida.texto()).toContain("2 sesion");
  });

  it("con `--todas` salen todas, en orden", async () => {
    const raiz = proyectoConTraza([modelo("orquestador", 100, 10, "s1"), modelo("developer-xone", 900, 90, "s2")]);
    const salida = recoger();
    expect(await cmdTraza(raiz, salida.escribir, { todas: true })).toBe(0);
    expect(salida.texto().indexOf("orquestador")).toBeLessThan(salida.texto().indexOf("developer-xone"));
  });

  it("una traza vacía no es un informe vacío: lo dice", async () => {
    const raiz = proyectoConTraza([]);
    const salida = recoger();
    expect(await cmdTraza(raiz, salida.escribir)).toBe(70);
    expect(salida.texto()).toContain("sin ninguna llamada");
  });
});
