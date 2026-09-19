import { describe, expect, it } from "vitest";
import {
  conHechosDelProyecto,
  TOPE_DE_COLECCIONES,
  type HechosDelProyecto,
} from "./hechosDelProyecto.js";

const hechos = (parcial: Partial<HechosDelProyecto> = {}): HechosDelProyecto => ({
  entrada: ["EntradaApp"],
  login: [],
  estilos: ["default.css"],
  colecciones: ["EntradaApp", "Clientes"],
  ...parcial,
});

describe("conHechosDelProyecto", () => {
  it("sin hechos devuelve la petición TAL CUAL", () => {
    // Nombrar un inventario que no se tiene es la mentira con forma de dato: el agente se la
    // cree y concluye que el proyecto no tiene colecciones.
    expect(conHechosDelProyecto("arregla el visor", undefined)).toBe("arregla el visor");
  });

  it("con todo vacío tampoco pinta nada", () => {
    // Un índice que cargó pero no encontró nada es indistinguible de uno que no cargó, y en
    // los dos casos la lista vacía se leería como «este proyecto está vacío».
    const vacio = { entrada: [], login: [], estilos: [], colecciones: [] };
    expect(conHechosDelProyecto("hola", vacio)).toBe("hola");
  });

  it("la petición va PRIMERO y los hechos detrás", () => {
    const r = conHechosDelProyecto("arregla el visor", hechos());
    expect(r.startsWith("arregla el visor")).toBe(true);
    expect(r).toContain("Clientes");
  });

  it("una lista vacía dice «no consta», que no es «no hay»", () => {
    // Es la distinción de `AppDeNavegacion.entrada`, y perderla aquí haría que el agente
    // afirmara que la app no pide login cuando lo que pasa es que no se pudo leer.
    const r = conHechosDelProyecto("x", hechos({ login: [] }));
    expect(r).toContain("Login: no consta");
  });

  it("lo que no cabe se CUENTA, y dice con qué pedirlo", () => {
    // Una lista recortada en silencio se lee como la lista entera, y entonces «esa colección
    // no existe» es una conclusión falsa sacada de un dato cierto.
    const muchas = Array.from({ length: TOPE_DE_COLECCIONES + 7 }, (_, i) => `Coll${i}`);
    const r = conHechosDelProyecto("x", hechos({ colecciones: muchas }));
    expect(r).toContain("y 7 más que no caben");
    expect(r).toContain("xone_navegacion");
    expect(r).not.toContain(`Coll${TOPE_DE_COLECCIONES + 1}`);
  });

  it("dice el TOTAL aunque recorte la lista", () => {
    const muchas = Array.from({ length: TOPE_DE_COLECCIONES + 7 }, (_, i) => `Coll${i}`);
    const r = conHechosDelProyecto("x", hechos({ colecciones: muchas }));
    expect(r).toContain(`${TOPE_DE_COLECCIONES + 7} colecciones`);
  });

  it("manda a `xone_navegacion` para lo que esta foto NO contesta", () => {
    // La foto dice QUÉ hay, no cómo es cada cosa. Sin esta línea el agente la tomaría por el
    // índice entero y daría por inexistente un campo que no ha mirado.
    const r = conHechosDelProyecto("x", hechos());
    expect(r).toContain("xone_navegacion");
    expect(r).toMatch(/campos de una colecci/i);
  });

  it("pide que los hechos viajen en el HANDOFF, que es donde se pierden hoy", () => {
    // Medido: los especialistas no comparten transcript y repiten las mismas búsquedas.
    expect(conHechosDelProyecto("x", hechos())).toContain("HANDOFF DE ANÁLISIS");
  });
});
