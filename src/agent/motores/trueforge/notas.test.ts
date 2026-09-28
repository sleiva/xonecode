import { describe, expect, it } from "vitest";
import {
  crearNota,
  entregarNotas,
  sobrantes,
  textoDeNota,
  textoDeNotaParaHijo,
  textoDeNotaYaEntregada,
  type Nota,
} from "./notas.js";

const ctx = (hijosVivos: number) => ({ hiloRaiz: "main", hijosVivos, nombreDe: (h: string) => (h === "h1" ? "analyst-xone" : h) });

describe("Nota: UN dueño, y los demás la ven como información (IXCODE-4)", () => {
  it("una nota nueva no es de nadie", () => {
    const n = crearNota("cambia el color a rojo");
    expect(n.texto).toBe("cambia el color a rojo");
    expect(n.duenio).toBeUndefined();
    expect(n.vistaPorElRaiz).toBe(false);
  });

  it("el diagrama doble, medido: el ÚNICO hijo que trabaja se la queda, y el raíz la recibe como YA ENCARGADA", () => {
    const notas: Nota[] = [crearNota("y créame un diagrama")];
    expect(entregarNotas(notas, "h1", ctx(1))).toEqual([textoDeNotaParaHijo("y créame un diagrama")]);
    // No se repite para el mismo hijo.
    expect(entregarNotas(notas, "h1", ctx(1))).toEqual([]);
    // Al volver el raíz: información, no encargo.
    expect(entregarNotas(notas, "main", ctx(0))).toEqual([textoDeNotaYaEntregada("y créame un diagrama", "analyst-xone")]);
    expect(entregarNotas(notas, "main", ctx(0))).toEqual([]);
    // Un hijo del plan NUEVO no la recibe: el raíz ya la tiene en cuenta al delegar.
    expect(entregarNotas(notas, "h2", ctx(1))).toEqual([]);
    expect(sobrantes(notas)).toBeUndefined();
  });

  it("con VARIOS hijos en paralelo no es de ninguno: la decide el raíz al volver, como encargo", () => {
    const notas: Nota[] = [crearNota("añade el menú")];
    expect(entregarNotas(notas, "h1", ctx(2))).toEqual([]);
    expect(entregarNotas(notas, "h2", ctx(2))).toEqual([]);
    expect(entregarNotas(notas, "main", ctx(0))).toEqual([textoDeNota("añade el menú")]);
  });

  it("sin hijos trabajando, la nota es del raíz, y un hijo que nazca después ya no la recibe", () => {
    const notas: Nota[] = [crearNota("hazlo en rojo")];
    expect(entregarNotas(notas, "main", ctx(0))).toEqual([textoDeNota("hazlo en rojo")]);
    expect(entregarNotas(notas, "h1", ctx(1))).toEqual([]);
  });

  it("el texto del hijo le da la salida: incorporarla o devolverla como pendiente", () => {
    expect(textoDeNotaParaHijo("x")).toContain("«x»");
    expect(textoDeNotaParaHijo("x")).toContain("PENDIENTE DE LA PERSONA");
    expect(textoDeNotaYaEntregada("x", "analyst-xone")).toContain("analyst-xone");
    expect(textoDeNotaYaEntregada("x", "analyst-xone")).toContain("NO la vuelvas a encargar");
  });

  it("textoDeNota (el del raíz) no cambia", () => {
    expect(textoDeNota("prueba")).toBe("[la persona escribió mientras trabajabas: «prueba»]");
  });

  it("sobrantes: solo lo que NADIE se quedó, concatenado; ausente si no queda nada", () => {
    const notas: Nota[] = [crearNota("de alguien"), crearNota("nadie la vio"), crearNota("tampoco esta")];
    entregarNotas([notas[0]!], "main", ctx(0));
    expect(sobrantes(notas)).toBe("nadie la vio\n\ntampoco esta");
    expect(sobrantes([notas[0]!])).toBeUndefined();
    expect(sobrantes([])).toBeUndefined();
  });
});
