import { describe, expect, it } from "vitest";

import {
  MODO_POR_OMISION,
  TOPE_DE_RONDAS_DE_CONSOLA,
  esModoDeEscritura,
  modoDeTexto,
  seEscribeSinPreguntar,
} from "./modoDeEscritura.js";
import { TOPE_DE_RONDAS_DE_TAREA } from "./tareas.js";

describe("el modo de escritura", () => {
  it("nace supervisado", () => {
    expect(MODO_POR_OMISION).toBe("supervisado");
  });

  it("reconoce los dos nombres y nada más", () => {
    expect(esModoDeEscritura("supervisado")).toBe(true);
    expect(esModoDeEscritura("autonomo")).toBe(true);
    expect(esModoDeEscritura("autónomo")).toBe(false);
    expect(esModoDeEscritura("automatica")).toBe(false);
    expect(esModoDeEscritura(true)).toBe(false);
    expect(esModoDeEscritura(undefined)).toBe(false);
  });

  describe("modoDeTexto", () => {
    it("acepta el vocabulario nuevo, con y sin tilde", () => {
      expect(modoDeTexto("supervisado")).toBe("supervisado");
      expect(modoDeTexto("autonomo")).toBe("autonomo");
      expect(modoDeTexto("autónomo")).toBe("autonomo");
      expect(modoDeTexto("AUTÓNOMO")).toBe("autonomo");
    });

    it("sigue aceptando el vocabulario viejo de /aprobacion", () => {
      expect(modoDeTexto("humana")).toBe("supervisado");
      expect(modoDeTexto("automatica")).toBe("autonomo");
      expect(modoDeTexto("automática")).toBe("autonomo");
    });

    it("lo que no reconoce es undefined, nunca un modo por defecto", () => {
      expect(modoDeTexto("")).toBeUndefined();
      expect(modoDeTexto("auto")).toBeUndefined();
      expect(modoDeTexto("si")).toBeUndefined();
    });
  });

  describe("seEscribeSinPreguntar", () => {
    it("solo en autónomo", () => {
      expect(seEscribeSinPreguntar({ modo: "autonomo", interactivo: true })).toBe(true);
      expect(seEscribeSinPreguntar({ modo: "supervisado", interactivo: true })).toBe(false);
    });

    it("ausente es supervisado: una sesión que no lo dijo pregunta", () => {
      expect(seEscribeSinPreguntar({ modo: undefined, interactivo: true })).toBe(false);
    });

    it("sin nadie delante NO se escribe solo, aunque el modo esté puesto", () => {
      // Es la barrera que sobrevive al cambio de diseño: si se cae el cable a mitad de
      // turno, la escritura vuelve al camino de aprobación, donde el eof la rechaza.
      expect(seEscribeSinPreguntar({ modo: "autonomo", interactivo: false })).toBe(false);
    });
  });

  it("el tope de rondas de la consola es el mismo que el medido para una tarea", () => {
    // Una ronda no es una insistencia, es una TANDA de escrituras: los cinco de
    // `MAX_APPROVAL_ROUNDS` cortan trabajos legítimos a la mitad. Se comprueba contra la
    // constante de la tarea y no contra un 20 literal, porque el número sale de ESA medida
    // — si alguien afina aquella, este test dice que hay que mirar esta.
    expect(TOPE_DE_RONDAS_DE_CONSOLA).toBe(TOPE_DE_RONDAS_DE_TAREA);
  });
});
