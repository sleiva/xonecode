import { describe, it, expect } from "vitest";
import { depsOffline, describir, doblesGraves, type Deps } from "./deps.js";
import type { InformeVerificacion, Papel, VerifierPort } from "./ports.js";

/** Un verificador REAL de mentirijilla: no lleva la marca, así que no es un doble. */
const verificadorReal: VerifierPort = {
  async verificar(): Promise<InformeVerificacion> {
    return { verde: true, hallazgos: [] };
  },
};

describe("describir", () => {
  it("con todo dobles, canta el verificador como DE PEGA", () => {
    const l = describir(depsOffline()).join("\n");
    expect(l).toContain("⚠ DE PEGA");
    expect(l).toContain("verificador");
  });

  it("un puerto real sale como ✓ real", () => {
    const deps: Deps = { ...depsOffline(), verifier: verificadorReal };
    const linea = describir(deps).find((l) => l.includes("verificador"));
    expect(linea).toContain("✓ real");
    expect(linea).not.toContain("DE PEGA");
  });

  it("el resumen dice QUÉ no respalda la respuesta", () => {
    expect(describir(depsOffline()).join("\n")).toMatch(/NO está respaldado por/);
  });

  it("sin dobles graves NO hay resumen de aviso", () => {
    const deps: Deps = {
      ...depsOffline(),
      verifier: verificadorReal,
      modelos: {
        paraPapel: () => ({}),
        descripcion: () => ({ rapido: "x", trabajo: "x", afilado: "x" }) as Record<Papel, string>,
      },
    };
    expect(describir(deps).join("\n")).not.toMatch(/NO está respaldado/);
  });

  it("enseña un modelo por papel", () => {
    const l = describir(depsOffline()).join("\n");
    for (const papel of ["rapido", "trabajo", "afilado"]) expect(l).toContain(papel);
  });

  it("es PURA: no llama a ningún puerto caro", async () => {
    // Si `describir` invocara los puertos, necesitaría red y credenciales — justo lo
    // que este comando existe para no necesitar.
    let tocado = false;
    const deps: Deps = {
      ...depsOffline(),
      verifier: {
        async verificar() {
          tocado = true;
          return { verde: true, hallazgos: [] };
        },
      },
    };
    describir(deps);
    expect(tocado).toBe(false);
  });
});

describe("doblesGraves", () => {
  it("lista los puertos caros que son de pega", () => {
    expect(doblesGraves(depsOffline())).toContain("verificador");
  });

  it("no lista los que son reales", () => {
    expect(doblesGraves({ ...depsOffline(), verifier: verificadorReal })).not.toContain("verificador");
  });
});