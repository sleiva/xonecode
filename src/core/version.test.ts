import { describe, it, expect } from "vitest";
import { lineaDeVersion } from "./version.js";

describe("la versión que se imprime al arrancar", () => {
  it("con commit limpio, lo dice y nada más", () => {
    expect(lineaDeVersion({ version: "0.5.0", commit: "85219d4", sucio: false })).toBe(
      "xonecode 0.5.0 · 85219d4"
    );
  });

  it("con el árbol SUCIO lo dice, porque entonces el commit miente sobre lo que corre", () => {
    // Es el caso normal en desarrollo, y el que más falta hace: el commit solo no describe
    // lo que hay vivo en el proceso.
    expect(lineaDeVersion({ version: "0.5.0", commit: "85219d4", sucio: true })).toBe(
      "xonecode 0.5.0 · 85219d4 + cambios sin commitear"
    );
  });

  it("si no se pudo mirar, se dice eso — que no es «limpio»", () => {
    // Ausente es «no consta». Afirmar que estaba limpio sin haberlo comprobado sería la
    // misma invención que un porcentaje sobre un tope que nadie midió.
    expect(lineaDeVersion({ version: "0.5.0", commit: "85219d4" })).toContain(
      "no se pudo mirar"
    );
  });

  it("sin git, solo la versión: un paquete instalado no tiene commit", () => {
    // No se inventa un «desconocido»: ahí el commit no existe como concepto.
    expect(lineaDeVersion({ version: "0.5.0" })).toBe("xonecode 0.5.0");
  });
});
