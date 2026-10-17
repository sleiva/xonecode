// src/agent/cloudstudio/crearRama.test.ts
import { describe, expect, it, vi } from "vitest";
import type { CloudStudioPort } from "../../core/ports.js";
import { crearRama } from "./crearRama.js";

function puertoDoble(ramas: string[]): CloudStudioPort & { abiertos: string[] } {
  const abiertos: string[] = [];
  return {
    abiertos,
    abrir: async (n: string) => void abiertos.push(n),
    ramas: async () => [...ramas],
  } as unknown as CloudStudioPort & { abiertos: string[] };
}

describe("crearRama", () => {
  it("crea la rama desde el origen y reabre el proyecto", async () => {
    const ramas = ["main"];
    const puerto = puertoDoble(ramas);
    const invocar = vi.fn(async () => {
      ramas.push("tarea-1");
      return { content: [{ type: "text", text: "ok" }] };
    });
    const creada = await crearRama(invocar, puerto, "Maset", "tarea-1", "main");
    expect(creada).toBe(true);
    expect(invocar).toHaveBeenCalledWith("studio_manage_branches", {
      operation: "create",
      branchName: "tarea-1",
      targetBranch: "main",
    });
    expect(puerto.abiertos).toEqual(["Maset", "Maset"]);
  });

  it("no hace nada si la rama ya existe", async () => {
    const invocar = vi.fn();
    const creada = await crearRama(invocar, puertoDoble(["main", "tarea-1"]), "Maset", "tarea-1", "main");
    expect(creada).toBe(false);
    expect(invocar).not.toHaveBeenCalled();
  });

  it("se niega si la rama origen no existe", async () => {
    await expect(crearRama(vi.fn(), puertoDoble(["main"]), "Maset", "x", "dev")).rejects.toThrow(
      "la rama origen «dev» no existe"
    );
  });

  it("dice si Studio no la creó", async () => {
    const invocar = vi.fn(async () => ({ content: [] }));
    await expect(crearRama(invocar, puertoDoble(["main"]), "Maset", "x", "main")).rejects.toThrow(
      /Studio no creó la rama «x»/
    );
  });
});
