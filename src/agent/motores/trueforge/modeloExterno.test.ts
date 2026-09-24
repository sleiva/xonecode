import { describe, expect, it } from "vitest";
import { textoDeFalloExterno } from "../../subagentes/subagenteExterno.js";

describe("el fallo de un motor externo, tal como lo lee el orquestador", () => {
  it("no lleva ninguna ruta de la máquina: va al modelo, al chat y al `.jsonl`", () => {
    const texto = textoDeFalloExterno("codex", new Error("no se pudo lanzar codex: spawn /Users/alguien/.local/bin/codex ENOENT"));
    expect(texto).not.toContain("/Users/alguien");
    // Lo que queda sigue diciendo qué pasó.
    expect(texto).toContain("no se pudo lanzar codex: spawn <ruta> ENOENT");
  });

  it("también cuando no es un `Error`", () => {
    expect(textoDeFalloExterno("opencode", "falló en '/private/tmp/x/opencode.json'")).not.toContain("/private/tmp");
  });
});
