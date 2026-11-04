import { describe, expect, it } from "vitest";
import { crearSerieDeEscrituras } from "../../../core/serieDeEscrituras.js";
import { conColaDelAparato } from "./colaDelAparato.js";

/** Una shell cuyas órdenes no acaban hasta que se las suelta: se ve quién ENTRÓ sin esperar a nadie. */
function shellConBarreras() {
  const entradas: string[] = [];
  const soltar = new Map<string, (v: unknown) => void>();
  const shell = {
    execute: (c: string) => {
      entradas.push(c);
      if (c.startsWith("falla")) return Promise.reject(new Error("falló"));
      return new Promise((r) => soltar.set(c, r));
    },
    write: (_ruta: string, _contenido: string) => ({}),
  };
  return { shell, entradas, soltar: (c: string) => soltar.get(c)?.({ output: c, exitCode: 0 }) };
}
const vuelta = () => new Promise((r) => setTimeout(r, 0));

describe("la cola del aparato (docs/PARALELISMO-TRUEFORGE.md §5.2)", () => {
  it("al MISMO aparato, la segunda no entra hasta que acaba la primera; a OTRO aparato, entra ya", async () => {
    const { shell, entradas, soltar } = shellConBarreras();
    const cola = crearSerieDeEscrituras();
    let aparato = "emulator-5554";
    const a = conColaDelAparato(shell, cola, () => aparato);
    const uno = a.execute("uno") as Promise<unknown>;
    const dos = a.execute("dos") as Promise<unknown>;
    await vuelta();
    expect(entradas).toEqual(["uno"]);
    aparato = "emulator-5556";
    const tres = a.execute("tres") as Promise<unknown>;
    await vuelta();
    expect(entradas).toEqual(["uno", "tres"]);
    soltar("uno");
    await uno;
    await vuelta();
    expect(entradas).toEqual(["uno", "tres", "dos"]);
    soltar("dos");
    soltar("tres");
    await Promise.all([dos, tres]);
  });

  it("una orden que FALLA libera la cola para la siguiente", async () => {
    const { shell, entradas, soltar } = shellConBarreras();
    const a = conColaDelAparato(shell, crearSerieDeEscrituras(), () => "x");
    await expect(a.execute("falla")).rejects.toThrow("falló");
    const otra = a.execute("otra") as Promise<unknown>;
    await vuelta();
    expect(entradas).toEqual(["falla", "otra"]);
    soltar("otra");
    await otra;
  });

  it("lo que no es `execute` pasa tal cual", () => {
    const { shell } = shellConBarreras();
    const a = conColaDelAparato(shell, crearSerieDeEscrituras(), () => undefined);
    expect(a.write("x", "y")).toEqual({});
  });
});
