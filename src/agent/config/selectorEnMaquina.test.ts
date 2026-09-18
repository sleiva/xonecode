import { describe, expect, it } from "vitest";

import { elegirCarpetaEnMaquina, haySelectorDeCarpeta } from "./selectorEnMaquina.js";

describe("elegirCarpetaEnMaquina", () => {
  it("devuelve la carpeta que el diálogo escupió", async () => {
    const elegida = await elegirCarpetaEnMaquina({
      plataforma: "darwin",
      lanzar: async () => "/Users/ana/xone-proyectos/\n",
    });
    expect(elegida).toBe("/Users/ana/xone-proyectos");
  });

  it("le dice al diálogo dónde abrirse", async () => {
    // Sin esto el selector empieza en un sitio cualquiera y hay que navegar desde cero.
    const vistos: string[][] = [];
    await elegirCarpetaEnMaquina({
      plataforma: "darwin",
      desde: "/Users/ana/.xonecode/workspace",
      lanzar: async (c) => {
        vistos.push([...c.argumentos]);
        return "/x\n";
      },
    });
    expect(vistos[0]).toContain("/Users/ana/.xonecode/workspace");
  });

  it("cancelar NO lanza: devuelve ausente, y el campo se queda como estaba", async () => {
    // `osascript` sale con código 1 al cerrar el diálogo, igual que si reventara. No se
    // distinguen a propósito: afirmar cuál fue sería inventarlo.
    const elegida = await elegirCarpetaEnMaquina({
      plataforma: "darwin",
      lanzar: async () => {
        throw new Error("Command failed: osascript");
      },
    });
    expect(elegida).toBeUndefined();
  });

  it("en un sistema sin selector no se lanza NADA", async () => {
    let lanzado = false;
    const elegida = await elegirCarpetaEnMaquina({
      plataforma: "win32",
      lanzar: async () => {
        lanzado = true;
        return "/x";
      },
    });
    expect({ elegida, lanzado }).toEqual({ elegida: undefined, lanzado: false });
  });

  it("una salida que no es una ruta no se cuela", async () => {
    const elegida = await elegirCarpetaEnMaquina({
      plataforma: "darwin",
      lanzar: async () => "execution error: No se pudo",
    });
    expect(elegida).toBeUndefined();
  });
});

describe("haySelectorDeCarpeta", () => {
  it("es lo que decide si se OFRECE el botón", () => {
    expect(haySelectorDeCarpeta("darwin")).toBe(true);
    expect(haySelectorDeCarpeta("linux")).toBe(true);
    expect(haySelectorDeCarpeta("win32")).toBe(false);
  });
});
