import { describe, expect, it } from "vitest";
import { cadenaDeCausas, falloLegible, registroDeFallo, TOPE_DE_CAUSAS, TOPE_DE_PASOS } from "./fallos.js";

const AHORA = new Date("2026-09-21T16:00:00.000Z");

describe("la cadena de causas", () => {
  /**
   * El caso que justifica todo esto: `MiddlewareError` envuelve el error de verdad en
   * `cause`, y arriba solo se veía su mensaje. Deducir que el envoltorio lo puso
   * `wrapToolCall` —o sea que reventó dentro de un subagente— costó media investigación.
   */
  it("sigue `cause` hasta el fondo, y el envoltorio va PRIMERO", () => {
    const dentro = new Error("400 The `reasoning_content` must be passed back");
    dentro.name = "BadRequestError";
    const fuera = new Error(dentro.message, { cause: dentro });
    fuera.name = "MiddlewareError";

    expect(cadenaDeCausas(fuera)).toEqual([
      { nombre: "MiddlewareError", mensaje: dentro.message },
      { nombre: "BadRequestError", mensaje: dentro.message },
    ]);
  });

  it("un `throw` que no es Error tampoco se pierde", () => {
    expect(cadenaDeCausas("se rompió")).toEqual([{ nombre: "string", mensaje: "se rompió" }]);
  });

  it("y un error sin nada que decir sigue dejando registro", () => {
    // Lista vacía se leería como «no se guardó», que es distinto de «no dijo nada».
    expect(cadenaDeCausas(undefined)).toEqual([{ nombre: "desconocido", mensaje: "(sin mensaje)" }]);
  });

  /** Un bucle aquí se come el proceso justo cuando algo ya ha ido mal. */
  it("una `cause` circular no cuelga", () => {
    const a = new Error("a");
    const b = new Error("b", { cause: a });
    (a as { cause?: unknown }).cause = b;
    expect(cadenaDeCausas(b).length).toBeLessThanOrEqual(TOPE_DE_CAUSAS);
  });

  it("y una cadena larguísima se corta por el tope", () => {
    let e = new Error("fondo");
    for (let i = 0; i < 20; i++) e = new Error(`capa ${i}`, { cause: e });
    expect(cadenaDeCausas(e)).toHaveLength(TOPE_DE_CAUSAS);
  });
});

describe("el registro", () => {
  it("lleva el encargo, los modelos y los pasos", () => {
    const r = registroDeFallo(
      {
        error: new Error("400"),
        peticion: "arregla el arranque",
        modelos: { trabajo: "deepseek/deepseek-flash" },
        pasos: ["task", "read_file"],
      },
      AHORA,
    );
    expect(r.at).toBe("2026-09-21T16:00:00.000Z");
    expect(r.peticion).toBe("arregla el arranque");
    expect(r.modelos).toEqual({ trabajo: "deepseek/deepseek-flash" });
    expect(r.pasos).toEqual(["task", "read_file"]);
  });

  /** Ausente es «no consta» en las cuatro capas, y aquí también. */
  it("lo que no se sabe va AUSENTE, no vacío", () => {
    const r = registroDeFallo({ error: new Error("x") }, AHORA);
    expect(r).not.toHaveProperty("peticion");
    expect(r).not.toHaveProperty("modelos");
    expect(r).not.toHaveProperty("pasos");
    expect(r.modelos).toBeUndefined();
  });

  it("se queda con los ÚLTIMOS pasos, que son los que llevan al fallo", () => {
    const muchos = Array.from({ length: 50 }, (_, i) => `paso${i}`);
    const r = registroDeFallo({ error: new Error("x"), pasos: muchos }, AHORA);
    expect(r.pasos).toHaveLength(TOPE_DE_PASOS);
    expect(r.pasos?.at(-1)).toBe("paso49");
  });

  it("y recorta la petición en vez de copiar el encargo entero", () => {
    const largo = "a".repeat(500);
    expect(registroDeFallo({ error: new Error("x"), peticion: largo }, AHORA).peticion!.length)
      .toBeLessThan(largo.length);
  });
});

describe("el fallo en texto, para pegarlo", () => {
  it("enseña la cadena con sangría creciente: quién envolvió a quién", () => {
    const dentro = new Error("400 del proveedor");
    dentro.name = "BadRequestError";
    const fuera = new Error("400 del proveedor", { cause: dentro });
    fuera.name = "MiddlewareError";
    const texto = falloLegible(
      registroDeFallo({ error: fuera, peticion: "arregla X", modelos: { trabajo: "deepseek/deepseek-flash" }, pasos: ["task"] }, AHORA),
    );
    expect(texto).toContain("MiddlewareError");
    expect(texto).toContain("↳ BadRequestError");
    expect(texto).toContain("trabajo=deepseek/deepseek-flash");
    expect(texto).toContain("pasos: task");
  });

  it("y sin los opcionales no inventa líneas", () => {
    const texto = falloLegible(registroDeFallo({ error: new Error("x") }, AHORA));
    expect(texto).not.toContain("encargo:");
    expect(texto).not.toContain("modelos:");
    expect(texto).not.toContain("pasos:");
  });
});
