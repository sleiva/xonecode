import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { crearRegistroDeFallos, rutaDeFallos } from "./registroDeFallos.js";

function lineas(raiz: string): Array<Record<string, unknown>> {
  return readFileSync(rutaDeFallos(raiz), "utf8").trim().split("\n").map((l) => JSON.parse(l) as Record<string, unknown>);
}

describe("registro de fallos", () => {
  it("apunta el CHAT cuando lo hay, leído al anotar", () => {
    // Sin él, el zip de soporte de UN chat no puede saber qué fallos son suyos.
    const raiz = mkdtempSync(join(tmpdir(), "xc-fallos-"));
    let chat = "chat-1";
    const registro = crearRegistroDeFallos(raiz, () => chat);
    registro.anotar({ error: new Error("uno") });
    chat = "chat-2";
    registro.anotar({ error: new Error("dos") });
    expect(lineas(raiz).map((l) => l.chat)).toEqual(["chat-1", "chat-2"]);
  });

  it("sin chat (una descarga, el alta) la línea no lo lleva", () => {
    const raiz = mkdtempSync(join(tmpdir(), "xc-fallos-"));
    crearRegistroDeFallos(raiz).anotar({ error: new Error("sin conversación") });
    expect(lineas(raiz)[0]).not.toHaveProperty("chat");
  });
});
