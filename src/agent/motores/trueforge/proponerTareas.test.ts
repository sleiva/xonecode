import { describe, expect, it } from "vitest";
import type { PropuestaDeTareas } from "../../../core/repartoDeEncargo.js";
import { crearProponerTareas } from "./proponerTareas.js";

const dos = {
  motivo: "son dos pantallas independientes",
  tareas: [
    { titulo: "Ventana A", peticion: "Crea la ventana A con la maqueta a.zip", adjuntos: ["/adjuntos/a.zip"] },
    { titulo: "Ventana B", peticion: "Crea la ventana B con la maqueta b.zip", adjuntos: ["b.zip"] },
  ],
};

describe("proponer_tareas", () => {
  it("con una propuesta válida la entrega a la sesión y le dice al agente que termine el turno", async () => {
    const recibidas: PropuestaDeTareas[] = [];
    const salida = await crearProponerTareas((p) => recibidas.push(p)).invoke(dos);
    expect(recibidas).toEqual([dos]);
    expect(salida).toContain("2 tareas en orden");
    expect(salida).toContain("NO las hagas en este turno");
  });

  it("una inválida se DEVUELVE con el motivo y no se entrega (no lanza)", async () => {
    const recibidas: PropuestaDeTareas[] = [];
    const herramienta = crearProponerTareas((p) => recibidas.push(p));
    const salida = await herramienta.invoke({ ...dos, motivo: " " });
    expect(salida).toContain("No se propone: falta el motivo");
    const conAdjuntoMalo = await herramienta.invoke({ ...dos, tareas: [{ ...dos.tareas[0]!, adjuntos: ["../.env"] }, dos.tareas[1]!] });
    expect(conAdjuntoMalo).toContain("no es un adjunto");
    expect(recibidas).toEqual([]);
  });

  it("sin adjuntos en una tarea, la propuesta no inventa la clave", async () => {
    const recibidas: PropuestaDeTareas[] = [];
    await crearProponerTareas((p) => recibidas.push(p)).invoke({ ...dos, tareas: [{ titulo: "A", peticion: "haz A" }, dos.tareas[1]!] });
    expect("adjuntos" in recibidas[0]!.tareas[0]!).toBe(false);
  });
});
