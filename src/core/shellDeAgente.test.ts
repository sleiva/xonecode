import { describe, expect, it } from "vitest";
import { VARIABLES_POR_PROVEEDOR } from "./modelos.js";
import { entornoDeShell, variableDeSkill, variablesDeAndroid } from "./shellDeAgente.js";

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

  it("y la carpeta donde dejar lo que NO es una salida para una persona", () => {
    // La hermana de la anterior, y la diferencia es el anuncio: lo que cae en artefactos
    // sale en el hilo y en su pestaña; lo que cae aquí, no. Ver `core/hotswap.ts`.
    expect(entornoDeShell({ entorno: {}, hotswap: "/ses/hotswap" })).toHaveProperty(
      "XONECODE_HOTSWAP",
      "/ses/hotswap",
    );
    expect(entornoDeShell({ entorno: {} })).not.toHaveProperty("XONECODE_HOTSWAP");
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

describe("los scripts de una skill, en el PATH", () => {
  it("se añaden al PATH heredado, sin perderlo", () => {
    const { PATH } = entornoDeShell({
      entorno: { PATH: "/usr/bin:/bin" },
      binarios: ["/skills/xone-hotswap/scripts"],
    });

    expect(PATH).toBe("/usr/bin:/bin:/skills/xone-hotswap/scripts");
  });

  it("al FINAL, para que una skill no pueda sombrear un binario del sistema", () => {
    // Una skill puede venir en un `.zip` de cualquier sitio: con el PATH prepuesto, un script
    // suyo llamado `git` o `ls` ganaría al de verdad.
    const { PATH } = entornoDeShell({ entorno: { PATH: "/usr/bin" }, binarios: ["/de/una/skill"] });

    expect(PATH!.indexOf("/usr/bin")).toBeLessThan(PATH!.indexOf("/de/una/skill"));
  });

  it("sin PATH heredado no se inventa uno: solo van los de las skills", () => {
    expect(entornoDeShell({ entorno: {}, binarios: ["/a", "/b"] })["PATH"]).toBe("/a:/b");
  });

  it("y sin scripts no se toca el PATH", () => {
    expect(entornoDeShell({ entorno: { PATH: "/usr/bin" } })["PATH"]).toBe("/usr/bin");
  });
});

describe("variableDeSkill", () => {
  it("deriva el nombre igual que la clave de un proveedor personalizado", () => {
    expect(variableDeSkill("xone-hotswap")).toBe("XONECODE_SKILL_XONE_HOTSWAP");
  });
});

describe("variablesDeAndroid", () => {
  it("nombra el emulador y el adb que el localizador encontró", () => {
    const variables = variablesDeAndroid((nombre) =>
      nombre === "emulator" ? "/sdk/emulator/emulator" : "/sdk/platform-tools/adb",
    );

    expect(variables).toEqual({
      XONECODE_EMULATOR: "/sdk/emulator/emulator",
      XONECODE_ADB: "/sdk/platform-tools/adb",
    });
  });

  /**
   * La MISMA regla que el resto del módulo: una variable sin valor se descarta en vez de
   * pasarse vacía. Un `XONECODE_EMULATOR=""` no es «no consta», es una ruta rota que el
   * script tomaría por buena y ejecutaría.
   */
  it("lo que el localizador NO encuentra no sale como cadena vacía: no sale", () => {
    expect(variablesDeAndroid(() => undefined)).toEqual({});
    expect(variablesDeAndroid((n) => (n === "adb" ? "/usr/bin/adb" : undefined))).toEqual({
      XONECODE_ADB: "/usr/bin/adb",
    });
  });

  it("busca cada binario en la subcarpeta del SDK que le toca", () => {
    const pedidos: Array<[string, string]> = [];
    variablesDeAndroid((nombre, subcarpeta) => {
      pedidos.push([nombre, subcarpeta]);
      return undefined;
    });

    expect(pedidos).toEqual([
      ["emulator", "emulator"],
      ["adb", "platform-tools"],
    ]);
  });
});

describe("entornoDeShell con Android", () => {
  /**
   * El motivo de todo esto: en esta máquina `adb` está en el PATH y `emulator` NO —vive en
   * `.../share/android-commandlinetools/emulator/`— y `ANDROID_HOME` está vacía. Sin la
   * variable, el script tendría que adivinar dónde está el SDK, que es una segunda regla
   * compitiendo con `localizadorDeAndroid`.
   */
  it("pone en el entorno lo que el localizador encontró", () => {
    const entorno = entornoDeShell({
      entorno: { PATH: "/usr/bin" },
      android: { XONECODE_EMULATOR: "/sdk/emulator/emulator" },
    });

    expect(entorno["XONECODE_EMULATOR"]).toBe("/sdk/emulator/emulator");
    expect(entorno["PATH"]).toBe("/usr/bin");
  });

  it("sin Android no aparece ninguna de las dos variables", () => {
    const entorno = entornoDeShell({ entorno: { PATH: "/usr/bin" } });

    expect(entorno).not.toHaveProperty("XONECODE_EMULATOR");
    expect(entorno).not.toHaveProperty("XONECODE_ADB");
  });
});
