import { mkdtempSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { topeDeRondasDeEntorno, TOPE_MAXIMO_DE_RONDAS_DE_ENTORNO } from "../core/modoDeEscritura.js";

/**
 * El tope de rondas de `run` por entorno (IXCODE-18), atado por la PUERTA de verdad: se intercepta
 * `abrirSesionReal` y se mira qué `topeDeRondas` le llega. Compuesto dentro de `correrReal`, que ningún
 * test alcanza, la regla se quedaría escrita y sin probar.
 */
const capturado: { opciones?: Record<string, unknown> } = {};
vi.mock("../agent/turno/turnoReal.js", async (original) => {
  const real = (await original()) as Record<string, unknown>;
  return {
    ...real,
    abrirSesionReal: async (o: Record<string, unknown>) => {
      capturado.opciones = o;
      throw new Error("PARA-AQUI");
    },
  };
});
const { cmdRun } = await import("./run.js");
const { crearProyecto } = await import("../agent/config/crearProyecto.js");

const previo = process.cwd();
afterEach(() => process.chdir(previo));

async function correr(entornoDeProceso: Record<string, string | undefined>): Promise<string> {
  const raiz = realpathSync(mkdtempSync(join(tmpdir(), "xc-run-tope-")));
  crearProyecto(raiz, { nombre: "P", titulo: "P", orientacion: "portrait", login: false });
  process.chdir(raiz);
  capturado.opciones = undefined;
  let salida = "";
  await cmdRun({
    peticion: "x",
    real: true,
    escribir: (t) => void (salida += t),
    entornoDeProceso,
    hidratar: (_r, fuentes) => ({ fuentes, cargado: { config: {}, auth: {}, rutas: [], avisos: [] } }),
  }).catch(() => undefined);
  return salida;
}

describe("XONECODE_TOPE_DE_RONDAS en run", () => {
  it("con un valor válido, llega a abrirSesionReal y se DICE en la salida", async () => {
    const salida = await correr({ XONECODE_TOPE_DE_RONDAS: "20" });
    expect(capturado.opciones?.["topeDeRondas"]).toBe(20);
    expect(salida).toMatch(/tope de rondas de aprobación: 20/);
  });

  it("sin la variable no se pasa ninguno: manda el de siempre", async () => {
    await correr({});
    expect(capturado.opciones).toBeDefined();
    expect(capturado.opciones).not.toHaveProperty("topeDeRondas");
  });

  it("un valor inválido NO se aplica y se avisa", async () => {
    for (const malo of ["0", "-3", "abc", "2.5", "999999", `${TOPE_MAXIMO_DE_RONDAS_DE_ENTORNO + 1}`]) {
      const salida = await correr({ XONECODE_TOPE_DE_RONDAS: malo });
      expect(capturado.opciones, malo).not.toHaveProperty("topeDeRondas");
      expect(salida, malo).toMatch(/no vale/);
    }
  });
});

describe("topeDeRondasDeEntorno", () => {
  it("solo enteros de 1 al máximo", () => {
    expect(topeDeRondasDeEntorno("1")).toBe(1);
    expect(topeDeRondasDeEntorno(" 20 ")).toBe(20);
    expect(topeDeRondasDeEntorno(String(TOPE_MAXIMO_DE_RONDAS_DE_ENTORNO))).toBe(TOPE_MAXIMO_DE_RONDAS_DE_ENTORNO);
    for (const malo of [undefined, "", "0", "01", "-1", "1e3", "20.0", "veinte", String(TOPE_MAXIMO_DE_RONDAS_DE_ENTORNO + 1)]) {
      expect(topeDeRondasDeEntorno(malo), String(malo)).toBeUndefined();
    }
  });
});
