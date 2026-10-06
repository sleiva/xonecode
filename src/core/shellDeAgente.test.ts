import { describe, expect, it } from "vitest";
import { VARIABLES_POR_PROVEEDOR } from "./modelos.js";
import { entornoDeShell, variableDeSkill, variablesDeAndroid, motivoDeComandoRechazado, motivoDeOtroAparato } from "./shellDeAgente.js";

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
