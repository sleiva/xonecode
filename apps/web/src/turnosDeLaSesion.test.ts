import { describe, it, expect } from "vitest";
import { turnosDeLaSesion } from "./turnosDeLaSesion.js";
import type { Acto, ConsumoDeTurno } from "./tipos.js";

const consumo: ConsumoDeTurno = {
  modelo: { entrada: 12_000, salida: 400, cache: 9_100 },
  externo: { entrada: 0, salida: 0, cache: 0 },
  ventana: 11_600,
};

describe("turnosDeLaSesion", () => {
  it("corta un turno por cada mensaje de la persona y le da las cifras de SU fin", () => {
    const actos: Acto[] = [
      { tipo: "usuario", texto: "uno", cuando: "2026-10-14T15:53:00Z" },
      { tipo: "herramientas", lineas: ["→ lee /login.js", "✎ edita /login.js"], detalles: [{ nombre: "read_file" }, { nombre: "edit_file", error: "rechazada" }] },
      { tipo: "sistema", texto: "dev: quiere modificar un fichero del proyecto", clase: "permiso" },
      { tipo: "razonamiento", texto: "pienso" },
      { tipo: "artefacto", ruta: "/artefactos/a.png", nombre: "a.png", bytes: 10 },
      { tipo: "asistente", texto: "hecho", cuando: "2026-10-14T15:54:00Z" },
      { tipo: "fin", ms: 29_600, consumo },
      { tipo: "usuario", texto: "dos" },
    ];
    const [primero, segundo] = turnosDeLaSesion(actos);
    expect(primero).toMatchObject({
      numero: 1,
      desde: 0,
      empezo: "2026-10-14T15:53:00Z",
      acabo: "2026-10-14T15:54:00Z",
      abierto: false,
      ms: 29_600,
      consumo,
      // Dos llamadas a tool; ni el razonamiento ni el artefacto son pasos (`pasos.ts`).
      pasos: 2,
      fallidas: 1,
    });
    expect(primero?.veredicto).toBeUndefined();
    // El segundo no ha cerrado: sin fin no hay duración ni consumo, y no se rellenan con ceros.
    expect(segundo).toMatchObject({ numero: 2, desde: 7, abierto: true, pasos: 0 });
    expect(segundo?.ms).toBeUndefined();
    expect(segundo?.consumo).toBeUndefined();
    expect(segundo?.empezo).toBeUndefined();
  });

  it("se queda con el ÚLTIMO veredicto del turno", () => {
    const actos: Acto[] = [
      { tipo: "usuario", texto: "x" },
      { tipo: "verificacion", verde: false, errores: 2, avisos: 0 },
      { tipo: "verificacion", verde: true, errores: 0, avisos: 1 },
      { tipo: "fin", ms: 1 },
    ];
    expect(turnosDeLaSesion(actos)[0]?.veredicto).toEqual({ verde: true, errores: 0, avisos: 1 });
  });

  it("lo que llega antes del primer mensaje o después de un fin no es de ningún turno", () => {
    const actos: Acto[] = [
      { tipo: "sistema", texto: "hola" },
      { tipo: "usuario", texto: "x" },
      { tipo: "fin", ms: 5 },
      { tipo: "sistema", texto: "acuse de un comando", clase: "permiso" },
      { tipo: "herramientas", lineas: ["→ lee /a"] },
    ];
    const turnos = turnosDeLaSesion(actos);
    expect(turnos).toHaveLength(1);
    expect(turnos[0]).toMatchObject({ pasos: 0 });
  });

  it("sin mensajes no hay turnos", () => {
    expect(turnosDeLaSesion([])).toEqual([]);
  });
});
