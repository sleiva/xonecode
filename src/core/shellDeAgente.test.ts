import { describe, expect, it } from "vitest";
import { VARIABLES_POR_PROVEEDOR } from "./modelos.js";
import { entornoDeShell, variableDeSkill, variablesDeAndroid, motivoDeComandoRechazado, motivoDeOtroAparato } from "./shellDeAgente.js";
import { scriptQueNoArranca, textoDeScriptsQueNoArrancan } from "./shellDeAgente.js";

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

  it("en WINDOWS la variable es `Path` y se une con `;`: se escribe en la MISMA, sin crear otra `PATH`", () => {
    // Medido en la máquina Windows de un usuario: se creaba un `PATH` aparte solo con los scripts y unido con `:`; el hijo
    // de Claude Code daba «node: command not found» y el device-controller rehacía el PATH a mano en 1156 comandos.
    const e = entornoDeShell({
      entorno: { Path: "C:\\Windows\\System32;C:\\Program Files\\nodejs" },
      binarios: ["C:\\xc\\skills\\xone-hotswap\\scripts"],
      plataforma: "win32",
    });
    expect(e["Path"]).toBe("C:\\Windows\\System32;C:\\Program Files\\nodejs;C:\\xc\\skills\\xone-hotswap\\scripts");
    expect(Object.keys(e).filter((k) => k.toUpperCase() === "PATH")).toEqual(["Path"]);
    // Sin PATH heredado en Windows, la clave es `Path` y el separador `;`.
    expect(entornoDeShell({ entorno: {}, binarios: ["C:\\a", "C:\\b"], plataforma: "win32" })["Path"]).toBe("C:\\a;C:\\b");
  });

  it("fuera de Windows, igual que siempre: `PATH` con `:`", () => {
    expect(entornoDeShell({ entorno: { PATH: "/usr/bin" }, binarios: ["/a"], plataforma: "darwin" })["PATH"]).toBe("/usr/bin:/a");
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

describe("las búsquedas por el disco entero no se lanzan", () => {
  it("las dos de calc14, y sus parientes, se rechazan con el camino bueno", () => {
    for (const c of [
      'find / -name "xone-validate*" 2>/dev/null | head; find / -name "xone-hotswap" -type f 2>/dev/null | head',
      'find / -type d -name "calculadora-menu-principal" 2>/dev/null | head',
      "which x; find ~ -name '*.xne'",
      "find $HOME -maxdepth 6 -name x",
      "grep -rn TASKS /Users",
      "ls -laR / | head",
      "du -sh ~",
    ]) {
      const m = motivoDeComandoRechazado(c);
      expect(m, c).toContain("recorre el disco entero");
      expect(m, c).toContain("$XONECODE_SKILL_<NOMBRE>");
      expect(m, c).toContain("usa la tool `glob`");
    }
  });
  it("buscar FICHEROS desde la shell, aunque sea en una carpeta, manda a las tools `glob`, `grep` y `ls`", () => {
    for (const c of ["find . -name '*.xne'", "find icons -name '*.svg'", "find $XONECODE_SKILL_XONE_HOTSWAP -name '*.md'", "grep -rn CALC .", "cd $XONECODE_ARTEFACTOS && ls -R"]) {
      const m = motivoDeComandoRechazado(c);
      expect(m, c).toContain("para buscar ficheros no uses la shell");
      expect(m, c).toContain("usa la tool `glob`");
    }
  });

  it("una ruta VIRTUAL en la shell se devuelve con la del disco (Maset: cinco comandos salían vacíos sin error)", () => {
    for (const c of [
      `grep -o '"name":"[^"]*"' /hotswap/respuesta-status-1791283681304.json 2>/dev/null | tail -20`,
      "B64=$(base64 -i /EntryPoint.xne 2>/dev/null || base64 /EntryPoint.xne)",
      `grep -n "loginLocal\\|PWD" /funciones.js | head -40`,
      `python3 - <<'EOF'\nimport json\ndata=json.load(open("/hotswap/respuesta-status-1791284014152.json"))\nEOF`,
      "ls /artefactos/",
    ]) {
      const m = motivoDeComandoRechazado(c);
      expect(m, c).toContain("ruta virtual");
      expect(m, c).toContain("$XONECODE_HOTSWAP/x");
    }
  });

  it("y las rutas de verdad, los scripts y una URL pasan", () => {
    for (const c of [
      `grep -o '"name"' "$XONECODE_HOTSWAP"/respuesta-status-1.json`,
      "base64 EntryPoint.xne",
      "xone-recargar-android EntryPoint.xne",
      "ls /usr/bin/node",
      "curl -s http://127.0.0.1:8443/hotswap/x",
      "adb shell ls /sdcard/Download",
    ]) {
      expect(motivoDeComandoRechazado(c), c).toBeUndefined();
    }
  });

  it("SQL que ESCRIBE en la base de la app no se lanza; consultar sí (Maset: un UPDATE para cambiar un contador)", () => {
    for (const c of [
      `xone-hotswap sql maset "UPDATE GEN_LIQUIDACIONES SET ACTIVO=0 WHERE ID IN (50,51,52,53)" 2>&1 | tail -2`,
      `xone-hotswap runSql app=maset query="delete from gen_usuarios"`,
      `xone-hotswap sql maset "insert into x values (1)"`,
    ]) {
      expect(motivoDeComandoRechazado(c), c).toContain("CAMBIA los datos de la app");
    }
    for (const c of [
      `xone-hotswap sql maset "select ID, ACTIVO, IDUSUARIO from GEN_LIQUIDACIONES WHERE ACTIVO=1" 2>&1 | tail -2`,
      `xone-hotswap sql maset "select name from sqlite_master where type='table'"`,
    ]) {
      expect(motivoDeComandoRechazado(c), c).toBeUndefined();
    }
  });

  it("lo que no busca ficheros pasa: scripts, filtros de su salida, listar una carpeta", () => {
    for (const c of [
      'ls -t $XONECODE_HOTSWAP/ | head',
      "xone-log-android --app | grep CALC",
      'cd $XONECODE_ARTEFACTOS && ls',
      "adb -s emulator-5554 shell input tap 415 1390",
      "ls /planes 2>/dev/null",
      "xone-log-android --app 2>&1 | grep -i CALC",
      "adb shell pidof com.xone.android.framework | grep -c .",
    ]) expect(motivoDeComandoRechazado(c), c).toBeUndefined();
  });
});

describe("un túnel a mano (`adb forward`) no se lanza", () => {
  it.each([
    "adb forward tcp:8443 tcp:8443",
    "adb -s emulator-5556 forward tcp:8444 tcp:8443",
    '"$XONECODE_ADB" forward tcp:8443 tcp:8443',
    "xone-log-android && adb forward tcp:1 tcp:2",
    "adb forward --remove tcp:8443",
    "adb -e forward tcp:1 tcp:2",
    "adb -e -s emulator-5554 forward tcp:1 tcp:2",
  ])("se rechaza: %s", (c) => {
    const m = motivoDeComandoRechazado(c);
    expect(m, c).toContain("xone-desplegar-android");
    expect(m, c).toContain("xone-reiniciar-android");
    expect(m, c).toContain("xone-hotswap");
    expect(m, c).toContain("otra sesión");
  });

  // `echo "adb forward"`: elegido que PASE. La regex exige que `adb` empiece un comando (inicio de línea, `;`, `&`, `|`, `(` o
  // espacio), y aquí lo precede una comilla; es la regex más sencilla que cumple el resto, y no se lanza nada por ahí.
  it.each([
    "adb forward --list",
    "adb -s emulator-5556 forward --list",
    "adb devices",
    "adb reverse tcp:8443 tcp:8443",
    "adb -d reverse tcp:1 tcp:2",
    "xone-reiniciar-android --app X",
    'echo "adb forward"',
  ])("pasa: %s", (c) => {
    expect(motivoDeComandoRechazado(c), c).toBeUndefined();
  });
});

describe("el aparato de la sesión manda también en la shell (IXCODE-32)", () => {
  const fisico = { id: "R58N", nombre: "Galaxy", plataforma: "android", clase: "fisico" } as const;
  const iphone = { id: "UDID-1", nombre: "iPhone 16", plataforma: "ios", clase: "simulador" } as const;

  it("un adb sobre el aparato tiene que llevar el -s de la sesión", () => {
    expect(motivoDeOtroAparato("adb -s R58N shell getprop", fisico)).toBeUndefined();
    expect(motivoDeOtroAparato('"$XONECODE_ADB" -s R58N logcat -d', fisico)).toBeUndefined();
    expect(motivoDeOtroAparato("adb -s emulator-5554 shell input tap 10 10", fisico)).toMatch(/Galaxy.*-s R58N/s);
    expect(motivoDeOtroAparato("adb shell screencap -p", fisico)).toMatch(/-s R58N/);
    expect(motivoDeOtroAparato("adb -e install app.apk", fisico)).toMatch(/-s R58N/);
  });

  it("lo que no actúa sobre un aparato pasa: listar, la versión, el servidor", () => {
    expect(motivoDeOtroAparato("adb devices -l", fisico)).toBeUndefined();
    expect(motivoDeOtroAparato("adb version && adb devices", fisico)).toBeUndefined();
    expect(motivoDeOtroAparato("adb kill-server", fisico)).toBeUndefined();
  });

  it("mira CADA llamada de una cadena, no solo la primera", () => {
    expect(motivoDeOtroAparato("adb -s R58N shell ls; adb -s emulator-5554 shell ls", fisico)).toMatch(/emulator-5554/);
    expect(motivoDeOtroAparato("xone-log-android --app | grep X && adb shell ps", fisico)).toMatch(/-s R58N/);
  });

  it("no se lanza un emulador a mano con un físico o un iPhone en la sesión", () => {
    expect(motivoDeOtroAparato("emulator -avd pixel8 -no-window &", fisico)).toMatch(/emulador/);
    expect(motivoDeOtroAparato('"$XONECODE_EMULATOR" -avd pixel8', iphone)).toMatch(/iPhone 16/);
    expect(motivoDeOtroAparato("emulator -avd pixel8", { id: "emulator-5554", nombre: "pixel8", plataforma: "android", clase: "emulador" })).toBeUndefined();
  });

  it("con un iPhone en la sesión, adb sobre un aparato se rechaza", () => {
    expect(motivoDeOtroAparato("adb shell ls", iphone)).toMatch(/iPhone 16/);
  });

  it("sin aparato en la sesión no dice nada: la regla de siempre", () => {
    expect(motivoDeOtroAparato("adb -s emulator-5554 shell ls", undefined)).toBeUndefined();
    expect(motivoDeOtroAparato("emulator -avd pixel8", undefined)).toBeUndefined();
  });
});

describe("una captura a mano (`adb … screencap`) no se lanza: sin el script no hay geometría para el crítico", () => {
  it.each([
    // Las cuatro capturas de la calculadora de MyAllXOne, tal cual.
    'mkdir -p "$XONECODE_ARTEFACTOS"; adb -s emulator-5554 exec-out screencap -p > "$XONECODE_ARTEFACTOS/calc-01.png" 2>/dev/null',
    'adb -s emulator-5554 exec-out screencap -p > "$XONECODE_ARTEFACTOS/calc-02.png" 2>/dev/null; md5 "$XONECODE_ARTEFACTOS/calc-02.png"',
    "adb shell screencap -p /sdcard/x.png && adb pull /sdcard/x.png",
    '"$XONECODE_ADB" exec-out screencap -p > a.png',
  ])("se rechaza: %s", (c) => {
    const m = motivoDeComandoRechazado(c);
    expect(m, c).toContain("xone-captura-android");
    expect(m, c).toContain("árbol de controles");
  });

  it.each(["xone-captura-android --nombre calc-01.png", "xone-hotswap shot", "adb shell dumpsys window", 'echo "screencap"'])("pasa: %s", (c) => {
    expect(motivoDeComandoRechazado(c), c).toBeUndefined();
  });
});

describe("resumenDelEntorno: lo que la traza dice de la shell de un agente", () => {
  it("en Windows ve las DOS claves (el fallo medido) y busca node.exe en las carpetas de la que manda", async () => {
    const { resumenDelEntorno } = await import("./shellDeAgente.js");
    const existe = (r: string) => r === "C:\\Program Files\\nodejs\\node.exe";
    const r = resumenDelEntorno(
      { Path: "C:\\Windows\\System32;C:\\Program Files\\nodejs", PATH: "C:\\x:C:\\y" },
      { plataforma: "win32", existe, scripts: 9, nodeDelServidor: "C:\\Program Files\\nodejs\\node.exe" }
    );
    expect(r).toEqual({ plataforma: "win32", clavePath: "Path", clavesPath: 2, carpetas: 2, node: true, adb: false, shell: "cmd.exe", scripts: 9, nodeDelServidor: true });
  });

  it("sin PATH lo dice, y en macOS busca el binario a secas", async () => {
    const { resumenDelEntorno } = await import("./shellDeAgente.js");
    expect(resumenDelEntorno({}, { plataforma: "darwin", existe: () => true })).toMatchObject({ clavePath: "(ninguna)", carpetas: 0, node: false });
    expect(resumenDelEntorno({ PATH: "/usr/bin:/opt/bin" }, { plataforma: "darwin", existe: (r) => r === "/opt/bin/adb" })).toMatchObject({ node: false, adb: true, carpetas: 2 });
  });
});

/**
 * IXCODE-72: en Windows `shell: true` es `cmd.exe`, y el modelo escribe bash. Medido en la máquina de un usuario: la raíz
 * del proyecto se llenaba de ficheros `6612`, `@getsdsd`… — cada `>` de un `x => x > 6612` entre comillas simples, que
 * `cmd` no entiende, era una redirección a fichero. Con el Git Bash que trae Git para Windows la orden es bash de verdad.
 */
describe("la shell del agente en Windows", () => {
  const GIT = "C:\\Program Files\\Git";
  const conGit = { Path: `C:\\Windows\\System32;${GIT}\\cmd;C:\\Program Files\\nodejs` };

  it("encuentra el bash de Git a partir del git.exe del PATH", async () => {
    const { bashDeGit } = await import("./shellDeAgente.js");
    const hay = new Set([`${GIT}\\cmd\\git.exe`, `${GIT}\\bin\\bash.exe`]);
    expect(bashDeGit({ entorno: conGit, existe: (r) => hay.has(r) })).toBe(`${GIT}\\bin\\bash.exe`);
  });

  it("NUNCA el bash de WSL: es otra máquina, con otro disco", async () => {
    const { bashDeGit } = await import("./shellDeAgente.js");
    const wsl = { Path: "C:\\Windows\\System32" };
    const hay = new Set(["C:\\Windows\\System32\\git.exe", "C:\\Windows\\System32\\bash.exe", "C:\\Windows\\bin\\bash.exe"]);
    expect(bashDeGit({ entorno: wsl, existe: (r) => hay.has(r) })).toBeUndefined();
  });

  it("sin git en el PATH prueba la carpeta de siempre, y sin nada no inventa", async () => {
    const { bashDeGit } = await import("./shellDeAgente.js");
    const defecto = `${GIT}\\bin\\bash.exe`;
    expect(bashDeGit({ entorno: { Path: "C:\\x" }, existe: (r) => r === defecto })).toBe(defecto);
    expect(bashDeGit({ entorno: { Path: "C:\\x" }, existe: () => false })).toBeUndefined();
  });

  it("con bash: `bash -c` con la orden ENTERA, sin `cmd`, y sin que MSYS reescriba rutas como /sdcard", async () => {
    const { lanzamientoDeShell } = await import("./shellDeAgente.js");
    const bash = `${GIT}\\bin\\bash.exe`;
    expect(lanzamientoDeShell("node -e 'x => x > 6612'", { plataforma: "win32", bash })).toEqual({
      programa: bash,
      argumentos: ["-c", "node -e 'x => x > 6612'"],
      shell: false,
      entorno: { MSYS_NO_PATHCONV: "1", MSYS2_ARG_CONV_EXCL: "*" },
      nombre: "git-bash",
    });
  });

  it("sin bash en Windows, `cmd.exe` como antes; fuera de Windows, nada cambia", async () => {
    const { lanzamientoDeShell } = await import("./shellDeAgente.js");
    expect(lanzamientoDeShell("ls", { plataforma: "win32" })).toEqual({ programa: "ls", argumentos: [], shell: true, entorno: {}, nombre: "cmd.exe" });
    expect(lanzamientoDeShell("ls", { plataforma: "darwin", bash: "/bin/bash" })).toEqual({ programa: "ls", argumentos: [], shell: true, entorno: {}, nombre: "sh" });
  });

  it("la traza dice qué shell corre", async () => {
    const { resumenDelEntorno } = await import("./shellDeAgente.js");
    const hay = new Set([`${GIT}\\cmd\\git.exe`, `${GIT}\\bin\\bash.exe`]);
    expect(resumenDelEntorno(conGit, { plataforma: "win32", existe: (r) => hay.has(r) }).shell).toBe("git-bash");
    expect(resumenDelEntorno({ PATH: "/usr/bin" }, { plataforma: "darwin", existe: () => false }).shell).toBe("sh");
  });
});

/**
 * Medido en el soporte de una tarea en Windows (23-10-2026): los siete `xone-*` fallaron con «Cannot find module» y la
 * persona no se enteró: solo lo decía, de pasada, el cierre del agente. Este detector decide cuándo el HARNESS lo avisa.
 */
describe("un script que NO ARRANCA es un fallo de la máquina, no del trabajo", () => {
  it("reconoce que el script o su intérprete no se encuentran, y nada más", () => {
    expect(scriptQueNoArranca("node:internal/modules/cjs/loader:1228\n  throw err;\nError: Cannot find module 'C:\\c\\Users\\X\\scripts\\xone-hotswap'\n[exit code 1]")).toBe("Cannot find module");
    expect(scriptQueNoArranca("/bin/sh: xone-hotswap: command not found\n[exit code 127]")).toBe("command not found");
    expect(scriptQueNoArranca("/usr/bin/env: 'node': No such file or directory\n[exit code 127]")).toBe("node no encontrado");
    expect(scriptQueNoArranca("'xone-hotswap' is not recognized as an internal or external command")).toBe("orden no reconocida");
    // Un script que arranca y falla por su cuenta, o que va bien, no es esto.
    expect(scriptQueNoArranca("error: no hay ningún aparato conectado\n[exit code 1]")).toBeUndefined();
    expect(scriptQueNoArranca("ok\n[exit code 0]")).toBeUndefined();
  });

  it("el aviso no lleva ninguna ruta de la máquina: viaja al chat", () => {
    const t = textoDeScriptsQueNoArrancan("Cannot find module");
    expect(t).toContain("NO arrancan");
    expect(t).toContain("no se ha podido probar en el aparato");
    expect(t).not.toMatch(/[A-Z]:\\|\/Users\//);
  });
});
