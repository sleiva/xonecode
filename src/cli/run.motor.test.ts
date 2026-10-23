import { mkdtempSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * El motor caído sale con 70, no con 0. Medido el 23-10-2026: un 429 del proveedor tumbó TrueForge
 * en la primera llamada, la sesión lo devolvió en `falloDelMotor` y el turno «acabó limpio»… y
 * `run` salió con 0, que CI lee como «bien». Es un fallo del ENTORNO (contrato de códigos de salida).
 * Atado por la PUERTA de verdad, como `run.tope.test.ts`: la regla vive dentro de `correrReal`.
 */
const resultado: { falloDelMotor?: string } = {};
vi.mock("../agent/turno/turnoReal.js", async (original) => {
  const real = (await original()) as Record<string, unknown>;
  return {
    ...real,
    abrirSesionReal: async () => ({
      turno: async () => ({
        bitacora: { corrio: () => false },
        cambios: [],
        cortadoPorTope: false,
        verificador: "no-corrio",
        pendientes: 0,
        ...resultado,
      }),
      consumo: () => ({ modelo: { entrada: 0, salida: 0, cache: 0 }, externo: { entrada: 0, salida: 0, cache: 0 }, contexto: 0 }),
      tracker: { calls: 0 },
    }),
  };
});
const { cmdRun } = await import("./run.js");
const { crearProyecto } = await import("../agent/config/crearProyecto.js");

const previo = process.cwd();
afterEach(() => process.chdir(previo));

async function correr(): Promise<{ codigo: number; salida: string }> {
  const raiz = realpathSync(mkdtempSync(join(tmpdir(), "xc-run-motor-")));
  crearProyecto(raiz, { nombre: "P", titulo: "P", orientacion: "portrait", login: false });
  process.chdir(raiz);
  let salida = "";
  const codigo = await cmdRun({
    peticion: "x",
    real: true,
    escribir: (t) => void (salida += t),
    entornoDeProceso: {},
    hidratar: (_r, fuentes) => ({ fuentes, cargado: { config: {}, auth: {}, rutas: [], avisos: [] } }),
  });
  return { codigo, salida };
}

describe("run con el motor caído", () => {
  it("sale con 70 y lo dice", async () => {
    resultado.falloDelMotor = "429 status code (no body)";
    const { codigo, salida } = await correr();
    expect(codigo).toBe(70);
    expect(salida).toMatch(/fallo del entorno/);
  });

  it("sin fallo del motor, el camino de siempre: 0", async () => {
    delete resultado.falloDelMotor;
    expect((await correr()).codigo).toBe(0);
  });
});
