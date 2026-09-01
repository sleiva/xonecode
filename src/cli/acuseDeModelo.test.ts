import { describe, it, expect } from "vitest";
import { acuseDeModelo, modeloDeAcuse } from "./acuseDeModelo.js";

describe("el acuse de /modelo", () => {
  it("lo que un extremo escribe el otro lo lee: ida y vuelta por la MISMA función", () => {
    // El acople que fija esto: `consola.ts` escribía la frase y `tui/correrTui.ts`
    // la re-parseaba por un regex escrito a mano — dos copias sin prueba que las
    // atara. Aquí la frase tiene un solo hogar y el test prueba que el par cierra.
    const tres = acuseDeModelo(undefined, "ollama/glm");
    expect(tres).toBe("modelo (los tres papeles): ollama/glm\n");
    expect(modeloDeAcuse(tres)).toEqual({ modelo: "ollama/glm" });

    const uno = acuseDeModelo("trabajo", "anthropic/claude-x");
    expect(uno).toBe("modelo trabajo: anthropic/claude-x\n");
    expect(modeloDeAcuse(uno)).toEqual({ papel: "trabajo", modelo: "anthropic/claude-x" });

    expect(modeloDeAcuse("modelo rapido: ollama/rapido\n")).toEqual({ papel: "rapido", modelo: "ollama/rapido" });
    expect(modeloDeAcuse("modelo afilado: ollama/afilado\n")).toEqual({ papel: "afilado", modelo: "ollama/afilado" });
  });

  it("lo que no es un acuse de /modelo no se confunde con uno", () => {
    expect(modeloDeAcuse("hola\n")).toBeUndefined();
    expect(modeloDeAcuse("modelo inventado: x\n")).toBeUndefined();
    // Ni una línea suelta dentro de un bloque más largo.
    expect(modeloDeAcuse("antes\nmodelo trabajo: a/b\n")).toBeUndefined();
  });
});
