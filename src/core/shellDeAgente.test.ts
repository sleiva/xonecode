import { describe, expect, it } from "vitest";
import { VARIABLES_POR_PROVEEDOR } from "./modelos.js";
import { entornoDeShell, variableDeSkill } from "./shellDeAgente.js";

describe("entornoDeShell", () => {
  it("quita las claves de API de los proveedores de serie", () => {
    const entorno = entornoDeShell({
      entorno: {
        PATH: "/usr/bin",
        ANTHROPIC_API_KEY: "sk-ant-secreta",
        OPENAI_API_KEY: "sk-openai-secreta",
        GOOGLE_API_KEY: "secreta",
      },
    });

    expect(entorno["PATH"]).toBe("/usr/bin");
    expect(entorno).not.toHaveProperty("ANTHROPIC_API_KEY");
    expect(entorno).not.toHaveProperty("OPENAI_API_KEY");
    expect(entorno).not.toHaveProperty("GOOGLE_API_KEY");
  });

  it("quita TODAS las variables de la tabla, no una lista escrita a mano", () => {
    const todas = Object.fromEntries(
      Object.values(VARIABLES_POR_PROVEEDOR).map((v) => [v, "secreta"]),
    );

    const entorno = entornoDeShell({ entorno: { ...todas, PATH: "/usr/bin" } });

    expect(Object.keys(entorno)).toEqual(["PATH"]);
  });

  it("quita las de un proveedor PERSONALIZADO, que no están en la tabla", () => {
    const entorno = entornoDeShell({
      entorno: { XONECODE_CLAVE_MI_LM_STUDIO: "secreta", XONECODE_TRACE_TOOLS: "1" },
    });

    expect(entorno).not.toHaveProperty("XONECODE_CLAVE_MI_LM_STUDIO");
    // Y no se lleva por delante lo que solo EMPIEZA por XONECODE_: no toda variable nuestra
    // es una credencial.
    expect(entorno["XONECODE_TRACE_TOOLS"]).toBe("1");
  });

  it("descarta las variables sin valor en vez de pasarlas como vacías", () => {
    const entorno = entornoDeShell({ entorno: { PATH: "/usr/bin", VACIA: undefined } });

    expect(entorno).not.toHaveProperty("VACIA");
  });

  it("nombra cada skill montada con su propia variable, con la ruta REAL", () => {
    const entorno = entornoDeShell({
      entorno: {},
      skills: [
        { nombre: "xone-hotswap", dir: "/una/ruta/xone-hotswap" },
        { nombre: "archify", dir: "/otra/archify" },
      ],
    });

    expect(entorno["XONECODE_SKILL_XONE_HOTSWAP"]).toBe("/una/ruta/xone-hotswap");
    expect(entorno["XONECODE_SKILL_ARCHIFY"]).toBe("/otra/archify");
  });

  it("nombra la carpeta donde dejar una captura, y solo si la hay", () => {
    expect(entornoDeShell({ entorno: {}, artefactos: "/ses/artefactos" })).toHaveProperty(
      "XONECODE_ARTEFACTOS",
      "/ses/artefactos",
    );
    expect(entornoDeShell({ entorno: {} })).not.toHaveProperty("XONECODE_ARTEFACTOS");
  });

  it("una skill NO puede pisar una credencial con su nombre", () => {
    // `XONECODE_CLAVE_X` se descarta del entorno heredado; una skill llamada así tampoco
    // puede reintroducirla por la puerta de atrás, porque su variable lleva otro prefijo.
    const entorno = entornoDeShell({
      entorno: { ANTHROPIC_API_KEY: "secreta" },
      skills: [{ nombre: "anthropic-api-key", dir: "/x" }],
    });

    expect(entorno).not.toHaveProperty("ANTHROPIC_API_KEY");
    expect(entorno["XONECODE_SKILL_ANTHROPIC_API_KEY"]).toBe("/x");
  });
});

describe("variableDeSkill", () => {
  it("deriva el nombre igual que la clave de un proveedor personalizado", () => {
    expect(variableDeSkill("xone-hotswap")).toBe("XONECODE_SKILL_XONE_HOTSWAP");
  });
});
