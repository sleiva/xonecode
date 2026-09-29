import { describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cerrarCheckpointerDeProyecto, crearCheckpointerDeProyecto, hayCheckpoint } from "./checkpointer.js";

/** Lo mínimo que LangGraph escribe: basta para que `getTuple` devuelva algo. */
const CHECKPOINT = {
  v: 4,
  id: "1",
  ts: new Date().toISOString(),
  channel_values: { messages: ["hola"] },
  channel_versions: {},
  versions_seen: {},
} as never;
const META = { source: "input", step: 0, parents: {} } as never;

/**
 * Soltar la conexión de un proyecto es lo que deja BORRAR su copia local: el mapa de
 * conexiones no cierra nunca, y en Windows un `checkpoint.sqlite` abierto (con su `-wal`)
 * hace fallar el borrado de la carpeta. Aquí se borra de verdad, en la máquina que corre el
 * test, sin `force` que tape el fallo del fichero abierto.
 */
describe("soltar el checkpointer de un proyecto", () => {
  it("deja borrar la carpeta, y lo siguiente abre una conexión NUEVA", async () => {
    const raiz = mkdtempSync(join(tmpdir(), "xc-cp-cerrar-"));
    const saver = crearCheckpointerDeProyecto(raiz)!;
    await saver.put({ configurable: { thread_id: "s1" } }, CHECKPOINT, META, {});

    cerrarCheckpointerDeProyecto(raiz);
    rmSync(join(raiz, ".xonecode"), { recursive: true });
    expect(existsSync(join(raiz, ".xonecode"))).toBe(false);

    // Otra vez sobre la misma raíz: una conexión nueva y vacía, no la cerrada.
    const otro = crearCheckpointerDeProyecto(raiz)!;
    expect(otro).not.toBe(saver);
    await expect(hayCheckpoint(otro, "s1")).resolves.toBe(false);
    cerrarCheckpointerDeProyecto(raiz);
    rmSync(raiz, { recursive: true });
  });

  it("sobre una raíz sin conexión no hace nada, ni lanza", () => {
    expect(() => cerrarCheckpointerDeProyecto(join(tmpdir(), "no-existe-xc"))).not.toThrow();
  });
});
