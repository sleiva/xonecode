import { describe, expect, it } from "vitest";
import { dondeDe, lineasDeVerificacion } from "./lineasDeVerificacion.js";

describe("lineasDeVerificacion", () => {
  it("las mismas líneas que escribe el terminal (`core/turno.ts`)", () => {
    expect(
      lineasDeVerificacion({
        verde: false,
        errores: 1,
        avisos: 1,
        hallazgos: [
          { code: "E1", severidad: "error", mensaje: "mal", fichero: "app/a.xne", linea: 3 },
          { code: "W2", severidad: "warning", mensaje: "ojo" },
        ],
        preexistentes: 2,
      })
    ).toEqual([
      "✗  verificación: 1 error(es), 1 aviso(s)",
      "   ✗ E1 app/a.xne:3 — mal",
      "   △ W2 — ojo",
      "   (y 2 hallazgo(s) más en ficheros que este turno no tocó)",
    ]);
    expect(lineasDeVerificacion({ verde: true, errores: 0, avisos: 0 })).toEqual(["✓  verificación en verde"]);
  });

  it("el sitio: fichero y línea, fichero solo, o nada", () => {
    expect(dondeDe({ code: "x", severidad: "info", mensaje: "", fichero: "a", linea: 1 })).toBe("a:1");
    expect(dondeDe({ code: "x", severidad: "info", mensaje: "", fichero: "a" })).toBe("a");
    expect(dondeDe({ code: "x", severidad: "info", mensaje: "" })).toBeUndefined();
  });
});
