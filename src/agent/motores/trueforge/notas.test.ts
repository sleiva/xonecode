import { describe, expect, it } from "vitest";
import { crearNota, marcarEntregada, pendientesPara, sobrantes, textoDeNota, type Nota } from "./notas.js";

describe("Nota: a quién se le debe y qué queda sin entregar", () => {
  it("una nota nueva no se le ha entregado a nadie", () => {
    const n = crearNota("cambia el color a rojo");
    expect(n.texto).toBe("cambia el color a rojo");
    expect(n.entregadaA.size).toBe(0);
  });

  it("pendientesPara devuelve solo lo que ESE hilo no tiene, y no repite tras marcarla", () => {
    const notas: Nota[] = [crearNota("a"), crearNota("b")];
    expect(pendientesPara(notas, "main").map((n) => n.texto)).toEqual(["a", "b"]);
    for (const n of pendientesPara(notas, "main")) marcarEntregada(n, "main");
    expect(pendientesPara(notas, "main")).toEqual([]);
    // Otro hilo, que no ha preguntado todavía, las sigue debiendo las DOS.
    expect(pendientesPara(notas, "hijo-1").map((n) => n.texto)).toEqual(["a", "b"]);
  });

  it("textoDeNota envuelve el texto para quien no sabe que viene de fuera de la conversación", () => {
    expect(textoDeNota("prueba")).toBe("[la persona escribió mientras trabajabas: «prueba»]");
  });

  it("sobrantes: solo lo que NADIE recibió, concatenado; ausente si no queda nada", () => {
    const entregada = crearNota("ya la vio alguien");
    marcarEntregada(entregada, "main");
    const sinEntregar1 = crearNota("nadie la vio");
    const sinEntregar2 = crearNota("tampoco esta");
    expect(sobrantes([entregada, sinEntregar1, sinEntregar2])).toBe("nadie la vio\n\ntampoco esta");
    expect(sobrantes([entregada])).toBeUndefined();
    expect(sobrantes([])).toBeUndefined();
  });
});
