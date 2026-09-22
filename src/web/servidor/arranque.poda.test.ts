import { describe, expect, it, vi } from "vitest";
import { mantenimientoDeMemoriaCableado } from "./arranque.js";

/**
 * **El patrón de fallo de esta arquitectura, por décima vez.** Esta composición vivía en el
 * cierre de `arrancarConsolaWeb`, que todos sus tests doblan: ahí la regla podía dejar de
 * estar montada CON TODO EN VERDE. Lo que se mira es cada argumento por separado, porque
 * TypeScript no se queja de una lambda que ignora parámetros.
 */
describe("mantenimientoDeMemoriaCableado", () => {
  it("le pasa la raíz al abrir el checkpointer Y a la poda", () => {
    const abrir = vi.fn(() => "la-conexion" as never);
    const podar = vi.fn(() => ({ antes: 900e6, despues: 20e6, checkpointsBorrados: 2, writesBorrados: 3 }));

    mantenimientoDeMemoriaCableado({ podar, checkpointer: abrir })("/una/raiz");

    expect(abrir).toHaveBeenCalledWith("/una/raiz");
    // Los DOS argumentos: la conexión de ESE proyecto y su raíz.
    expect(podar).toHaveBeenCalledWith("la-conexion", "/una/raiz");
  });

  it("devuelve el resumen de lo que hizo", () => {
    const texto = mantenimientoDeMemoriaCableado({
      podar: () => ({ antes: 900e6, despues: 20e6, checkpointsBorrados: 2750, writesBorrados: 6182 }),
      checkpointer: () => undefined,
    })("/r");

    expect(texto).toContain("2750");
    expect(texto).not.toMatch(/\/r/);
  });

  /** El caso NORMAL: por debajo de la cota no se poda y no se cuenta nada. */
  it("cuando no toca podar no dice nada", () => {
    expect(
      mantenimientoDeMemoriaCableado({ podar: () => undefined, checkpointer: () => undefined })("/r"),
    ).toBeUndefined();
  });

  /** Y una poda que no recuperó nada tampoco se anuncia. */
  it("una poda que no liberó nada se calla", () => {
    expect(
      mantenimientoDeMemoriaCableado({
        podar: () => ({ antes: 100, despues: 100, checkpointsBorrados: 0, writesBorrados: 0 }),
        checkpointer: () => undefined,
      })("/r"),
    ).toBeUndefined();
  });
});
