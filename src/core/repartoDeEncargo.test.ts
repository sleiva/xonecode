import { describe, expect, it } from "vitest";
import type { Acto } from "./actos.js";
import { motivoDePropuestaInaceptable, propuestaPendiente, tareasEncadenadas, TOPE_DE_TAREAS_PROPUESTAS } from "./repartoDeEncargo.js";

const dos = {
  motivo: "son dos pantallas independientes",
  tareas: [
    { titulo: "A", peticion: "haz A" },
    { titulo: "B", peticion: "haz B" },
  ],
};

describe("una propuesta de tareas", () => {
  it("dos tareas con título y petición valen", () => {
    expect(motivoDePropuestaInaceptable(dos)).toBeUndefined();
  });

  it("una sola no es un reparto; más del tope tampoco", () => {
    expect(motivoDePropuestaInaceptable({ ...dos, tareas: [dos.tareas[0]!] })).toBeDefined();
    const muchas = Array.from({ length: TOPE_DE_TAREAS_PROPUESTAS + 1 }, (_, i) => ({ titulo: `T${i}`, peticion: "x" }));
    expect(motivoDePropuestaInaceptable({ ...dos, tareas: muchas })).toBeDefined();
  });

  it("vacíos y peticiones gigantes no", () => {
    expect(motivoDePropuestaInaceptable({ ...dos, motivo: " " })).toBeDefined();
    expect(motivoDePropuestaInaceptable({ ...dos, tareas: [{ titulo: "", peticion: "x" }, dos.tareas[1]!] })).toBeDefined();
    expect(motivoDePropuestaInaceptable({ ...dos, tareas: [{ titulo: "A", peticion: "  " }, dos.tareas[1]!] })).toBeDefined();
    expect(motivoDePropuestaInaceptable({ ...dos, tareas: [{ titulo: "A", peticion: "x".repeat(8001) }, dos.tareas[1]!] })).toBeDefined();
  });

  it("los adjuntos de cada tarea, por nombre de adjunto válido (con o sin /adjuntos/)", () => {
    const con = (adjuntos: string[]) => ({ ...dos, tareas: [{ ...dos.tareas[0]!, adjuntos }, dos.tareas[1]!] });
    expect(motivoDePropuestaInaceptable(con(["/adjuntos/maqueta_a.zip", "maqueta_b.png"]))).toBeUndefined();
    expect(motivoDePropuestaInaceptable(con(["../.env"]))).toBeDefined();
    expect(motivoDePropuestaInaceptable(con(["/adjuntos/../x"]))).toBeDefined();
  });
});

describe("tareasEncadenadas", () => {
  const crear = () => {
    let n = 0;
    return tareasEncadenadas({
      proyecto: { id: "p", raiz: "/r", nombre: "P" },
      tareas: [
        { peticion: "haz A", encargo: "A aumentado" },
        { peticion: "haz B", encargo: "  " },
        { peticion: "haz C", encargo: "C aumentado" },
      ],
      ahora: new Date("2026-10-06T10:00:00.000Z"),
      id: () => `t${++n}`,
    });
  };

  it("encadena por tras, en orden, todas en «nuevo»", () => {
    expect(crear().map((t) => [t.id, t.tras, t.estado])).toEqual([
      ["t1", undefined, "nuevo"],
      ["t2", "t1", "nuevo"],
      ["t3", "t2", "nuevo"],
    ]);
  });

  it("creada estrictamente creciente, para el FIFO del corredor", () => {
    const ts = crear();
    expect(ts[0]!.creada < ts[1]!.creada && ts[1]!.creada < ts[2]!.creada).toBe(true);
  });

  it("un encargo vacío cae a la petición, como «Encolar» de Nueva tarea", () => {
    expect(crear().map((t) => t.encargo)).toEqual(["A aumentado", "haz B", "C aumentado"]);
  });

  it("la primera no lleva la clave tras: ausente, no undefined", () => {
    expect("tras" in crear()[0]!).toBe(false);
  });
});

describe("propuestaPendiente", () => {
  const propuesta: Acto = { tipo: "propuesta-de-tareas", id: "p1", motivo: "dos", tareas: dos.tareas };
  it("la encuentra mientras nadie la resuelve", () => {
    expect(propuestaPendiente([{ tipo: "usuario", texto: "x" }, propuesta, { tipo: "asistente", texto: "y" }], "p1")).toEqual(propuesta);
  });
  it("encolada o descartada, ya no; y una que no existe tampoco", () => {
    expect(propuestaPendiente([propuesta, { tipo: "propuesta-resuelta", propuesta: "p1", encoladas: ["a", "b"] }], "p1")).toBeUndefined();
    expect(propuestaPendiente([propuesta, { tipo: "propuesta-resuelta", propuesta: "p1" }], "p1")).toBeUndefined();
    expect(propuestaPendiente([propuesta], "otra")).toBeUndefined();
  });
});
