import { describe, it, expect } from "vitest";
import { Mensajes } from "./mensajes.js";

describe("Mensajes", () => {
  it("los trozos de una misma respuesta no cierran línea", () => {
    const m = new Mensajes();
    expect(m.trozo("run-1", "Hola")).toEqual({ pintar: true, cierraLinea: false });
    expect(m.trozo("run-1", " qué")).toEqual({ pintar: true, cierraLinea: false });
    expect(m.trozo("run-1", " tal")).toEqual({ pintar: true, cierraLinea: false });
  });

  it("un id distinto es un mensaje NUEVO y cierra la línea", () => {
    // Sin esto: "...ya está.⚠ VERIFICADOR DE PEGA" pegado.
    const m = new Mensajes();
    m.trozo("run-1", "ya está.");
    expect(m.trozo("aviso-1", "⚠ VERIFICADOR DE PEGA")).toEqual({
      pintar: true,
      cierraLinea: true,
    });
  });

  it("un mensaje ya cerrado que se reemite NO se pinta dos veces", () => {
    // La forma medida que duplica: el nodo devuelve un AIMessage nuevo y el modo
    // `messages` lo emite entero además de los trozos.
    const m = new Mensajes();
    m.trozo("run-1", "respuesta");
    m.trozo("aviso-1", "aviso");            // cierra run-1
    expect(m.trozo("run-1", "respuesta")).toEqual({ pintar: false, cierraLinea: false });
  });

  it("un trozo sin texto no pinta (Gemini manda trozos finales vacíos)", () => {
    const m = new Mensajes();
    expect(m.trozo("run-1", "")).toEqual({ pintar: false, cierraLinea: false });
    expect(m.trozo("run-1", undefined)).toEqual({ pintar: false, cierraLinea: false });
  });

  it("un trozo vacío NO abre línea ni marca el id como visto", () => {
    const m = new Mensajes();
    m.trozo("run-1", "");
    expect(m.trozo("run-1", "hola")).toEqual({ pintar: true, cierraLinea: false });
  });

  it("tras fin(), lo que estaba abierto se considera cerrado", () => {
    const m = new Mensajes();
    m.trozo("run-1", "respuesta");
    m.fin();
    expect(m.trozo("run-1", "respuesta")).toEqual({ pintar: false, cierraLinea: false });
  });

  it("un mensaje sin id se pinta y no rompe nada", () => {
    const m = new Mensajes();
    expect(m.trozo(undefined, "algo").pintar).toBe(true);
  });
});