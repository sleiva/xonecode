import { describe, expect, it } from "vitest";
import { consultaPendiente } from "./consultaPendiente.js";
import type { Acto } from "./tipos.js";

const consulta: Acto = { tipo: "consulta", pregunta: "¿Qué pantalla?", opciones: ["Login", "Menú"] };

describe("la pregunta del agente pendiente", () => {
  it("la última consulta sin usuario detrás está pendiente, con su posición", () => {
    const actos: Acto[] = [{ tipo: "usuario", texto: "arregla" }, { tipo: "asistente", texto: "¿Qué pantalla?" }, consulta, { tipo: "fin", ms: 1 }];
    expect(consultaPendiente(actos, false)).toEqual({ indice: 2, pregunta: "¿Qué pantalla?", opciones: ["Login", "Menú"] });
  });

  it("contestada —un acto de usuario detrás— ya no lo está", () => {
    expect(consultaPendiente([consulta, { tipo: "usuario", texto: "Menú" }, { tipo: "asistente", texto: "ok" }], false)).toBeUndefined();
  });

  it("con el turno en vuelo no hay nada pendiente", () => {
    expect(consultaPendiente([consulta], true)).toBeUndefined();
  });

  it("una consulta anterior al último mensaje de la persona no resucita", () => {
    expect(consultaPendiente([consulta, { tipo: "usuario", texto: "otra cosa" }], false)).toBeUndefined();
  });

  it("sin opciones válidas no es una tarjeta: lo que llega del cable se criba", () => {
    const rara = { tipo: "consulta", pregunta: "¿?", opciones: [3, "", null] } as unknown as Acto;
    expect(consultaPendiente([rara], false)).toBeUndefined();
    expect(consultaPendiente([{ ...consulta, opciones: ["A", 7 as unknown as string] }], false)?.opciones).toEqual(["A"]);
  });
});
