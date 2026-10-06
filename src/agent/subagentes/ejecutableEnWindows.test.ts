import { describe, expect, it } from "vitest";
import { destinoDeShimDeNpm, ejecutableParaLanzar, resolverEnWindows, type MaquinaWindows } from "./ejecutableEnWindows.js";

/** El shim que npm deja de verdad para opencode 1.18.34 (copiado de la máquina donde falló). */
const SHIM_DE_OPENCODE = [
  "@ECHO off",
  "GOTO start",
  ":find_dp0",
  "SET dp0=%~dp0",
  "EXIT /b",
  ":start",
  "SETLOCAL",
  "CALL :find_dp0",
  '"%dp0%\\node_modules\\opencode-ai\\bin\\opencode.exe"   %*',
  "",
].join("\r\n");

/** El que deja para `@openai/codex`: un script de Node, con `node.exe` nombrado ANTES (copiado igual). */
const SHIM_DE_CODEX = [
  "@ECHO off",
  "SETLOCAL",
  "CALL :find_dp0",
  "",
  'IF EXIST "%dp0%\\node.exe" (',
  '  SET "_prog=%dp0%\\node.exe"',
  ") ELSE (",
  '  SET "_prog=node"',
  ")",
  "",
  'endLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%"  "%dp0%\\node_modules\\@openai\\codex\\bin\\codex.js" %*',
  "",
].join("\r\n");

/** Otro script de Node cualquiera: ese no se persigue. */
const SHIM_DE_OTRO = '"%_prog%"  "%dp0%\\node_modules\\otro\\bin\\otro.js" %*';

const NPM = "C:\\Users\\u\\AppData\\Roaming\\npm";
const EXE_DE_OPENCODE = `${NPM}\\node_modules\\opencode-ai\\bin\\opencode.exe`;
const PAQUETE_DE_CODEX = `${NPM}\\node_modules\\@openai\\codex`;
const CODEX_ANIDADO = `${PAQUETE_DE_CODEX}\\node_modules\\@openai\\codex-win32-x64\\vendor\\x86_64-pc-windows-msvc\\bin\\codex.exe`;
const CODEX_SUBIDO = `${NPM}\\node_modules\\@openai\\codex-win32-x64\\vendor\\x86_64-pc-windows-msvc\\bin\\codex.exe`;
const CODEX_ARM = `${PAQUETE_DE_CODEX}\\node_modules\\@openai\\codex-win32-arm64\\vendor\\aarch64-pc-windows-msvc\\bin\\codex.exe`;

function maquina(ficheros: Record<string, string>, path = `C:\\Windows;${NPM}`, arquitectura = "x64"): MaquinaWindows {
  return {
    path,
    pathext: ".COM;.EXE;.BAT;.CMD",
    arquitectura,
    esFichero: (ruta) => ruta in ficheros,
    leer: (ruta) => {
      const t = ficheros[ruta];
      if (t === undefined) throw new Error("ENOENT");
      return t;
    },
  };
}

describe("destinoDeShimDeNpm", () => {
  it("saca el .exe al que reenvía el shim de npm", () => {
    expect(destinoDeShimDeNpm(SHIM_DE_OPENCODE)).toBe("node_modules\\opencode-ai\\bin\\opencode.exe");
  });
  it("en el de un script de Node, el destino es el SCRIPT, no el `node.exe` del IF EXIST", () => {
    expect(destinoDeShimDeNpm(SHIM_DE_CODEX)).toBe("node_modules\\@openai\\codex\\bin\\codex.js");
  });
});

describe("resolverEnWindows", () => {
  it("un .cmd de npm se resuelve a su .exe, que es lo que spawn sin shell sabe lanzar", () => {
    expect(resolverEnWindows("opencode", maquina({ [`${NPM}\\opencode.cmd`]: SHIM_DE_OPENCODE, [EXE_DE_OPENCODE]: "" }))).toBe(EXE_DE_OPENCODE);
  });

  it("el `opencode` SIN extensión (el shim de sh para Git Bash) no se acepta", () => {
    expect(resolverEnWindows("opencode", maquina({ [`${NPM}\\opencode`]: "#!/bin/sh" }))).toBeUndefined();
  });

  it("un .exe en el PATH gana a un .cmd posterior, en el orden del PATH", () => {
    const directo = "C:\\Windows\\opencode.exe";
    expect(resolverEnWindows("opencode", maquina({ [directo]: "", [`${NPM}\\opencode.cmd`]: SHIM_DE_OPENCODE, [EXE_DE_OPENCODE]: "" }))).toBe(directo);
  });

  it("Codex: del shim al `codex.exe` de su paquete de plataforma, con la regla de `codex.js`", () => {
    // Ni `cmd.exe` ni `node codex.js`: matar a cualquiera de los dos deja vivo al `codex.exe`.
    const shim = { [`${NPM}\\codex.cmd`]: SHIM_DE_CODEX };
    expect(resolverEnWindows("codex", maquina({ ...shim, [CODEX_ANIDADO]: "" }))).toBe(CODEX_ANIDADO);
    expect(resolverEnWindows("codex", maquina({ ...shim, [CODEX_SUBIDO]: "" }))).toBe(CODEX_SUBIDO);
    // En ARM, el paquete de ARM: el de x64 no vale aunque esté.
    expect(resolverEnWindows("codex", maquina({ ...shim, [CODEX_ANIDADO]: "", [CODEX_ARM]: "" }, undefined, "arm64"))).toBe(CODEX_ARM);
  });

  it("un shim de otro script de Node, o cuyo destino no está, no se persigue", () => {
    expect(resolverEnWindows("otro", maquina({ [`${NPM}\\otro.cmd`]: SHIM_DE_OTRO }))).toBeUndefined();
    expect(resolverEnWindows("opencode", maquina({ [`${NPM}\\opencode.cmd`]: SHIM_DE_OPENCODE }))).toBeUndefined();
    expect(resolverEnWindows("codex", maquina({ [`${NPM}\\codex.cmd`]: SHIM_DE_CODEX }))).toBeUndefined();
  });

  it("sin nada en el PATH, nada", () => {
    expect(resolverEnWindows("opencode", maquina({}, ""))).toBeUndefined();
  });
});

describe("ejecutableParaLanzar", () => {
  const conShims = maquina({
    [`${NPM}\\opencode.cmd`]: SHIM_DE_OPENCODE,
    [EXE_DE_OPENCODE]: "",
    [`${NPM}\\codex.cmd`]: SHIM_DE_CODEX,
    [CODEX_ANIDADO]: "",
  });

  it("fuera de Windows no toca nada", () => {
    expect(ejecutableParaLanzar("opencode", conShims, "linux")).toBe("opencode");
  });
  it("en Windows, el nombre a secas va al nativo", () => {
    expect(ejecutableParaLanzar("opencode", conShims, "win32")).toBe(EXE_DE_OPENCODE);
    expect(ejecutableParaLanzar("codex", conShims, "win32")).toBe(CODEX_ANIDADO);
  });
  it("un OPENCODE_BIN o CODEX_BIN que apunta al .cmd también va al nativo", () => {
    expect(ejecutableParaLanzar(`${NPM}\\opencode.cmd`, conShims, "win32")).toBe(EXE_DE_OPENCODE);
    expect(ejecutableParaLanzar(`${NPM}\\codex.cmd`, conShims, "win32")).toBe(CODEX_ANIDADO);
  });
  it("una ruta a un .exe se respeta, y lo que no se resuelve vuelve como llegó", () => {
    expect(ejecutableParaLanzar("D:\\bin\\opencode.exe", conShims, "win32")).toBe("D:\\bin\\opencode.exe");
    expect(ejecutableParaLanzar("otro", conShims, "win32")).toBe("otro");
  });
});
