import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { huella, type Hallazgo } from "./ports.js";

/**
 * Test-oro sobre la salida REAL de `xone-simulator validate --json` (xone-linter 1.4.0).
 *
 * El fichero de `__oro__/` reproduce la forma medida el 2026-08-30 contra un proyecto de
 * verdad, incluidos los tres casos que el primer borrador del tipo se había equivocado en
 * suponer: un hallazgo SIN `location`, uno con `location` pero SIN linea, y uno con linea
 * y columna. Vive como fichero y no como literal en el test para que el dia que el
 * simulador cambie su salida se pueda sustituir por una corrida nueva y ver el diff.
 *
 * No invoca al simulador: `npm test` tiene que correr sin Node externo ni binarios.
 * La corrida contra el binario real es cosa de `xonecode doctor`.
 */
const ORO = join(dirname(fileURLToPath(import.meta.url)), "__oro__", "validate-con-hallazgos.json");

interface IssueDelSimulador {
  severity: string;
  code: string;
  message: string;
  file?: string;
  location?: { file: string; line?: number; column?: number };
}

/** Lo que el adaptador de la fase 3 tendra que hacer. Aqui se fija el contrato. */
function aHallazgo(i: IssueDelSimulador): Hallazgo {
  return {
    code: i.code,
    severidad: i.severity as Hallazgo["severidad"],
    mensaje: i.message,
    fichero: i.location?.file ?? i.file,
    linea: i.location?.line,
    columna: i.location?.column,
  };
}

describe("la forma real de un hallazgo del simulador", () => {
  const bruto = JSON.parse(readFileSync(ORO, "utf8")) as {
    success: boolean;
    issues: IssueDelSimulador[];
  };
  const hallazgos = bruto.issues.map(aHallazgo);

  it("un hallazgo puede NO traer location (y entonces no hay linea)", () => {
    const h = hallazgos[0]!;
    expect(h.code).toBe("XML_PARSE");
    expect(h.fichero).toBe("/ruta/al/proyecto/app.xml");
    expect(h.linea).toBeUndefined();
  });

  it("un hallazgo puede traer location SIN linea", () => {
    // El caso que rompia el tipo original, que la declaraba obligatoria.
    expect(hallazgos[1]!.linea).toBeUndefined();
    expect(hallazgos[1]!.fichero).toBe("/ruta/al/proyecto/ListaClientes.xne");
  });

  it("y puede traer linea y columna", () => {
    expect(hallazgos[2]!.linea).toBe(42);
    expect(hallazgos[2]!.columna).toBe(7);
  });

  it("la severidad `warning` existe y NO se traduce", () => {
    // Colapsar warning/info en un solo cubo es una decision de producto que nadie ha tomado.
    expect(hallazgos.map((h) => h.severidad)).toEqual(["error", "error", "warning"]);
  });

  it("`success: false` es lo que hace el informe rojo", () => {
    expect(bruto.success).toBe(false);
  });
});

describe("huella (deteccion de no-progreso)", () => {
  it("dos hallazgos iguales salvo el mensaje tienen la MISMA huella", () => {
    // El mensaje lleva nombres interpolados que varian sin que el problema cambie.
    const a: Hallazgo = { code: "X", severidad: "error", mensaje: "falta MAP_A", fichero: "f.xne", linea: 3 };
    const b: Hallazgo = { code: "X", severidad: "error", mensaje: "falta MAP_B", fichero: "f.xne", linea: 3 };
    expect(huella(a)).toBe(huella(b));
  });

  it("distingue por code, fichero y linea", () => {
    const base: Hallazgo = { code: "X", severidad: "error", mensaje: "m", fichero: "f.xne", linea: 3 };
    expect(huella({ ...base, code: "Y" })).not.toBe(huella(base));
    expect(huella({ ...base, fichero: "g.xne" })).not.toBe(huella(base));
    expect(huella({ ...base, linea: 4 })).not.toBe(huella(base));
  });

  it("no revienta ni colisiona cuando falta la linea, que es el caso NORMAL", () => {
    const sinLinea: Hallazgo = { code: "X", severidad: "error", mensaje: "m", fichero: "f.xne" };
    const conLinea: Hallazgo = { code: "X", severidad: "error", mensaje: "m", fichero: "f.xne", linea: 0 };
    expect(() => huella(sinLinea)).not.toThrow();
    expect(huella(sinLinea)).not.toBe(huella(conLinea));
  });
});
