import { describe, expect, it } from "vitest";
import {
  avisoDeNoSatisfecho,
  esTerminal,
  mensajeDeRevision,
  TOPE_DE_VUELTAS,
  type EstadoDeRubrica,
} from "./rubrica.js";

describe("esTerminal", () => {
  it("solo `necesita-revision` continúa el bucle", () => {
    const todos: EstadoDeRubrica[] = [
      "satisfecho",
      "necesita-revision",
      "fallido",
      "tope-de-vueltas",
      "error-del-calificador",
    ];
    expect(todos.filter((e) => !esTerminal(e))).toEqual(["necesita-revision"]);
  });
});

describe("mensajeDeRevision", () => {
  it("lleva el comentario y de qué vuelta va", () => {
    // Sin la vuelta, tres mensajes iguales seguidos se leen como un bucle y el modelo no sabe
    // cuánto margen le queda.
    const m = mensajeDeRevision("El título sigue cortado", 2, 3);
    expect(m).toContain("El título sigue cortado");
    expect(m).toContain("2 de 3");
  });

  it("habla con voz del HARNESS, no como una petición nueva del usuario", () => {
    // Si se disfrazara de encargo nuevo, el agente podría tomarlo por un cambio de opinión y
    // ponerse a otra cosa en vez de terminar la misma.
    const m = mensajeDeRevision("falta", 1, 3);
    expect(m).toContain("[harness]");
    expect(m).toMatch(/no es un encargo nuevo/i);
  });

  it("deja salida a que la revisión se equivoque", () => {
    // Un bucle que solo admite «obedece» hace que el agente cambie lo mismo tres veces cuando
    // el equivocado es el calificador.
    expect(mensajeDeRevision("falta", 1, 3)).toMatch(/si crees que ya está/i);
  });
});

describe("avisoDeNoSatisfecho", () => {
  it("no dice nada cuando se satisfizo", () => {
    expect(avisoDeNoSatisfecho("satisfecho")).toBeUndefined();
  });

  it("no dice nada a mitad del bucle", () => {
    // `necesita-revision` no es un final: avisar ahí sería alarmar por cada vuelta.
    expect(avisoDeNoSatisfecho("necesita-revision")).toBeUndefined();
  });

  it("AVISA en los tres finales malos, que es lo que el original NO hace", () => {
    for (const estado of ["fallido", "tope-de-vueltas", "error-del-calificador"] as const) {
      expect(avisoDeNoSatisfecho(estado)).toBeDefined();
    }
  });

  it("distingue un fallo del ENTORNO de un trabajo que no cumple", () => {
    // Mezclarlos manda a arreglar lo que no estaba roto.
    expect(avisoDeNoSatisfecho("error-del-calificador")).toMatch(/fallo del entorno/i);
    expect(avisoDeNoSatisfecho("tope-de-vueltas")).toContain(String(TOPE_DE_VUELTAS));
  });

  it("dice que es una OPINIÓN y no una medida", () => {
    // El verde del verificador es una medida del simulador; esto es un modelo opinando sobre un
    // transcript. Leerlos igual es darle al segundo una autoridad que no tiene.
    expect(avisoDeNoSatisfecho("tope-de-vueltas")).toMatch(/no una medida/i);
  });

  it("lleva el comentario si lo hay, y no inventa uno si no", () => {
    expect(avisoDeNoSatisfecho("tope-de-vueltas", "sigue cortado")).toContain("sigue cortado");
    expect(avisoDeNoSatisfecho("tope-de-vueltas", "   ")).not.toContain("undefined");
  });
});
