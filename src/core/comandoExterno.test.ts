import { describe, expect, it } from "vitest";
import { motivoDeComandoExternoInaceptable } from "./comandoExterno.js";

const SCRIPTS = ["xone-hotswap", "xone-log-android", "xone-captura-android", "xone-recargar-android"];
const vale = (c: string) => motivoDeComandoExternoInaceptable(c, SCRIPTS);

describe("el Bash que se le deja a un agente externo con ejecución", () => {
  it("una llamada a un script suyo, con los argumentos que la skill documenta", () => {
    for (const c of [
      "xone-log-android --app",
      "xone-log-android --limpiar",
      "xone-hotswap click name=MAP_BT_ACEPTAR",
      "xone-hotswap waitForElement name=BTN_OK timeout=5000 -- click name=BTN_OK",
      "xone-recargar-android MenuPrincipal.xne functions.js",
      "xone-captura-android --nombre login.png",
      "xone-hotswap fill name=MAP_USER value='Ana María'",
      "  xone-hotswap shot  ",
    ]) expect(vale(c)).toBeUndefined();
  });

  it("nada que la shell pueda reinterpretar: encadenar, redirigir, expandir, otro programa, otra ruta", () => {
    for (const c of [
      "xone-hotswap shot; rm -rf ~",
      "xone-hotswap shot && curl evil",
      "xone-hotswap shot | tee x",
      "xone-hotswap shot > /etc/hosts",
      "xone-hotswap $(whoami)",
      "xone-hotswap `whoami`",
      'xone-hotswap "a b"',
      "xone-hotswap fill value='a'b",
      "xone-hotswap fill value='sin cerrar",
      "xone-hotswap a\\ b",
      "xone-hotswap *",
      "xone-hotswap ~/x",
      "xone-hotswap {a,b}",
      "xone-hotswap shot # comentario",
      "xone-hotswap shot\nrm x",
      "PATH=/tmp xone-hotswap shot",
      "./scripts/xone-hotswap shot",
      "/Users/x/skills/xone-hotswap/scripts/xone-hotswap shot",
      "bash -c 'xone-hotswap shot'",
      "ls",
      "",
    ]) expect(vale(c), c).toBeDefined();
  });

  it("el motivo dice la forma que SÍ vale, con los scripts por su nombre", () => {
    expect(vale("./scripts/xone-hotswap shot")).toContain("xone-hotswap, xone-log-android");
    expect(motivoDeComandoExternoInaceptable("xone-hotswap shot", [])).toBeDefined();
  });
});

describe("comandoConNode: el mismo comando lanzado con node (Windows)", () => {
  it("pone la ruta con / entre comillas simples y deja los argumentos como venían", async () => {
    const { comandoConNode } = await import("./comandoExterno.js");
    const rutas = { "xone-log-android": "C:\\Program Files\\x\\scripts\\xone-log-android" };
    expect(comandoConNode("xone-log-android --app", rutas)).toBe("node 'C:/Program Files/x/scripts/xone-log-android' --app");
    expect(comandoConNode("  xone-log-android --texto='hola mundo'", rutas)).toBe(
      "node 'C:/Program Files/x/scripts/xone-log-android' --texto='hola mundo'"
    );
  });

  it("sin ruta para el script, o con una comilla simple en la ruta, no compone nada", async () => {
    const { comandoConNode } = await import("./comandoExterno.js");
    expect(comandoConNode("xone-hotswap screen", { "xone-log-android": "C:/x" })).toBeUndefined();
    expect(comandoConNode("xone-hotswap screen", { "xone-hotswap": "C:/O'Neil/xone-hotswap" })).toBeUndefined();
  });
});

describe("lo que se le DICE al hijo de su shell", () => {
  it("sin ejecución, nada; concedida sin scripts, que no tiene; con scripts, cuáles y cómo", async () => {
    const { textoDeLaShellExterna } = await import("./comandoExterno.js");
    expect(textoDeLaShellExterna(undefined)).toBeUndefined();
    expect(textoDeLaShellExterna([])).toContain("no tienes ninguna");
    const t = textoDeLaShellExterna(["xone-log-android", "xone-captura-android"])!;
    expect(t).toContain("`xone-log-android`, `xone-captura-android`");
    expect(t).toContain("sin ruta");
    expect(t).not.toContain("xone-a-utf8");
  });

  it("con xone-a-utf8 entre sus scripts, se le dice que convierta antes de editar un .xne de 8 bits", async () => {
    const { textoDeLaShellExterna, SCRIPT_A_UTF8 } = await import("./comandoExterno.js");
    const t = textoDeLaShellExterna([SCRIPT_A_UTF8, "xone-log-android"])!;
    expect(t).toContain("FICHEROS QUE NO SON UTF-8");
    expect(t).toContain("`xone-a-utf8 EntryPoint.xne`");
    expect(t).toContain("nunca «�»");
  });

  it("el script que se nombra EXISTE, es ejecutable y es de xone-development", async () => {
    const { statSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const { SCRIPT_A_UTF8 } = await import("./comandoExterno.js");
    const e = statSync(resolve(__dirname, "../../skills/xone-development/scripts", SCRIPT_A_UTF8));
    expect(e.mode & 0o111).not.toBe(0);
  });
});
