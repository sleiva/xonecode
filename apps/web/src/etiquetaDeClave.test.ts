import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { etiquetaDeClave } from "./etiquetaDeClave.js";

// Los MISMOS casos que `src/core/gestorDeTareas.test.ts#etiquetaDeClave`: la regla está
// redeclarada, y divergir tiene que dar rojo aquí.
const CASOS: [string, string | undefined][] = [
  ["087e117f-9478-4c60-871d-b5d76c2a7e30", "087e117f"],
  ["087E117F94784C60871DB5D76C2A7E30", "087e117f"],
  ["IXCODE-11", undefined],
  ["087e117f", undefined],
];

describe("etiquetaDeClave (cliente)", () => {
  it.each(CASOS)("%s → %s", (clave, esperada) => expect(etiquetaDeClave(clave)).toBe(esperada));

  it("el CUERPO es el mismo que el del host (la redeclaración no deriva)", () => {
    const aqui = dirname(fileURLToPath(import.meta.url));
    const cuerpo = (texto: string) => /export function etiquetaDeClave\(clave: string\): string \| undefined \{([\s\S]*?)\n\}/.exec(texto)?.[1]?.trim();
    const host = readFileSync(join(aqui, "..", "..", "..", "src", "core", "gestorDeTareas.ts"), "utf8");
    const cliente = readFileSync(join(aqui, "etiquetaDeClave.ts"), "utf8");
    expect(cuerpo(host)).toBeDefined();
    expect(cuerpo(cliente)).toBe(cuerpo(host));
  });
});
