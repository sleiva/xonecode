import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

  it("un script con EXTENSIÓN también se corre por su nombre (medido: «check-update.mjs no es uno de tus scripts» con él en la lista)", () => {
    const conMjs = ["check-render-output.mjs", "xone-hotswap", "..x"];
    expect(motivoDeComandoExternoInaceptable("check-render-output.mjs --help", conMjs)).toBeUndefined();
    expect(motivoDeComandoExternoInaceptable("./check-render-output.mjs --help", conMjs)).toContain("no es uno de tus scripts");
    expect(motivoDeComandoExternoInaceptable("scripts/check-render-output.mjs", conMjs)).toContain("no es uno de tus scripts");
    expect(motivoDeComandoExternoInaceptable("..x", conMjs)).toContain("no es uno de tus scripts");
    expect(motivoDeComandoExternoInaceptable("otro.mjs", conMjs)).toContain("no es uno de tus scripts");
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

  it("con el Node ABSOLUTO del servidor no depende del PATH (medido: en el Git Bash del hijo, «node: command not found»)", async () => {
    const { comandoConNode } = await import("./comandoExterno.js");
    const rutas = { "xone-hotswap": "C:\\x\\scripts\\xone-hotswap" };
    expect(comandoConNode("xone-hotswap status", rutas, "C:\\Program Files\\nodejs\\node.exe")).toBe(
      "'C:/Program Files/nodejs/node.exe' 'C:/x/scripts/xone-hotswap' status"
    );
    expect(comandoConNode("xone-hotswap status", rutas, "C:\\O'Neil\\node.exe")).toBeUndefined();
  });

  it("sin ruta para el script, o con una comilla simple en la ruta, no compone nada", async () => {
    const { comandoConNode } = await import("./comandoExterno.js");
    expect(comandoConNode("xone-hotswap screen", { "xone-log-android": "C:/x" })).toBeUndefined();
    expect(comandoConNode("xone-hotswap screen", { "xone-hotswap": "C:/O'Neil/xone-hotswap" })).toBeUndefined();
  });
});

describe("conScriptsPorNode: la orden LIBRE con cada script como función que lo lanza con node (Windows)", () => {
  const rutas = { "xone-hotswap": "C:\\Users\\x\\scripts\\xone-hotswap", "xone-log-android": "C:\\Users\\x\\scripts\\xone-log-android" };

  it("la orden va tal cual DESPUÉS de las funciones, con la ruta y el Node en / y entre comillas simples", async () => {
    const { conScriptsPorNode } = await import("./comandoExterno.js");
    expect(conScriptsPorNode("xone-hotswap screen 2>&1 | tail -5", rutas, "C:\\Program Files\\nodejs\\node.exe")).toBe(
      [
        `xone-hotswap() { 'C:/Program Files/nodejs/node.exe' 'C:/Users/x/scripts/xone-hotswap' "$@"; }`,
        `xone-log-android() { 'C:/Program Files/nodejs/node.exe' 'C:/Users/x/scripts/xone-log-android' "$@"; }`,
        "xone-hotswap screen 2>&1 | tail -5",
      ].join("\n")
    );
  });

  it("un nombre que bash no admite o una ruta con comilla se quedan fuera; un Node con comilla deja la orden tal cual", async () => {
    const { conScriptsPorNode } = await import("./comandoExterno.js");
    expect(conScriptsPorNode("ls", { "mal nombre": "C:/a", "xone-x": "C:/O'Neil/xone-x" })).toBe("ls");
    expect(conScriptsPorNode("xone-hotswap screen", rutas, "C:\\O'Neil\\node.exe")).toBe("xone-hotswap screen");
    expect(conScriptsPorNode("ls", {})).toBe("ls");
  });

  // Que la forma CORRE en bash de verdad: nombre suelto, tubería, `$(…)` y argumentos con espacios.
  it.skipIf(!existsSync("/bin/bash"))("bash la ejecuta: el nombre suelto, en una tubería y en una subshell llegan al script con sus argumentos", async () => {
    const { conScriptsPorNode } = await import("./comandoExterno.js");
    const dir = mkdtempSync(join(tmpdir(), "xc-scripts-"));
    try {
      const script = join(dir, "xone-eco");
      writeFileSync(script, "console.log(JSON.stringify(process.argv.slice(2)));\n");
      const orden = conScriptsPorNode(`xone-eco a 'b c' | cat; echo "sub:$(xone-eco z)"`, { "xone-eco": script }, process.execPath);
      const salida = execFileSync("/bin/bash", ["-c", orden], { encoding: "utf8" });
      expect(salida).toBe('["a","b c"]\nsub:["z"]\n');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
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
    // Medido en Windows: «no tengo shell» sin probarla. Ahora se le pide probarla y copiar el error exacto.
    expect(t).toContain("PRUÉBALA (`xone-log-android --help`)");
    expect(t).toContain("copia el error EXACTO");
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
