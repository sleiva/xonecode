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
