import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { argsDeArranque, puertoDeAvd, puertoDeFisico } from "./puertosDeAvd.js";
import { validarSettings } from "./settings.js";

type Deps = { casa?: string; leer?: (ruta: string) => string; ejecutar?: (bin: string, args: string[]) => string };
type Lib = {
  avdDeLaSerie: (serie: string | undefined, deps?: Deps) => string | undefined;
  serieAndroid: (explicita: string | undefined, deps?: Deps & { entorno?: Record<string, string>; adb?: string }) => { serie: string | undefined; porque: string };
  puertoConMotivo: (explicito: string | undefined, serie: string | undefined, deps?: Deps) => { puerto: number; porque?: string };
  BANDERAS_SIN_VENTANA: string[];
  retirarOpciones: (a: string[], n: string[]) => { opciones: Record<string, string | undefined>; resto: string[] };
  puertoAndroid: (explicito: string | undefined, serie: string | undefined, deps?: Deps) => number;
  duenoDelPuerto: (salida: string, puerto: number) => string | undefined;
  estadoDelTunel: (serie: string, puerto: number, deps?: { entorno?: Record<string, string>; ejecutar?: Deps["ejecutar"] }) => { estado: string; dueno?: string };
  textoDeTunelAjeno: (serie: string, puerto: number, dueno: string) => string;
  asegurarTunel: (
    serie: string,
    puerto: number,
    deps?: { entorno?: Record<string, string>; ejecutar?: Deps["ejecutar"]; negar?: (t: string) => never; poner?: boolean },
  ) => { estado: string; dueno?: string };
  salidaDelCliente: (cliente: string, argumentos: string[], url: string, ejecutar?: (...a: unknown[]) => string) => string;
};

// La skill no puede importar TypeScript: la regla vive dos veces, y esto es lo que impide que diverjan.
const lib = (await import(
  pathToFileURL(resolve(__dirname, "../../skills/xone-hotswap/lib/dispositivo.mjs")).href
)) as Lib;

const settings = { dispositivos: { avds: { pixel8: { puerto: 8443 }, "pixel8-tagmyxone": { puerto: 8444, sinVentana: true as const } } } };
const leer = () => JSON.stringify(settings);
const ejecutar = (_bin: string, args: string[]) => (args[1] === "emulator-5556" ? "pixel8-tagmyxone\nOK\n" : "pixel8\nOK\n");

describe("puerto del aparato, visto desde la skill", () => {
  it("avdDeLaSerie lee la consola del emulador", () => {
    expect(lib.avdDeLaSerie("emulator-5556", { ejecutar })).toBe("pixel8-tagmyxone");
    expect(lib.avdDeLaSerie("R58M123", { ejecutar: () => { throw new Error("no debería llamarse"); } })).toBeUndefined();
    expect(lib.avdDeLaSerie("emulator-5554", { ejecutar: () => { throw new Error("adb caído"); } })).toBeUndefined();
  });

  it.each([
    ["emulator-5554", undefined, 8443],
    ["emulator-5556", undefined, 8444],
    ["emulator-5556", "9001", 9001],
    // Un físico no comparte el 8443 del primer AVD (IXCODE-32): el primero libre.
    ["R58M123", undefined, 8445],
    ["R58M123", "9001", 9001],
    [undefined, undefined, 8443],
  ])("serie %s, --puerto %s → %s", (serie, explicito, esperado) => {
    expect(lib.puertoAndroid(explicito, serie, { casa: "/casa", leer, ejecutar })).toBe(esperado);
  });

  it("dice lo mismo que core", () => {
    for (const avd of ["pixel8", "pixel8-tagmyxone", "otro"]) {
      // La consola del emulador contesta con el nombre del AVD que se está probando.
      const ej = () => `${avd}\nOK\n`;
      expect(lib.puertoAndroid(undefined, "emulator-5554", { casa: "/casa", leer, ejecutar: ej })).toBe(puertoDeAvd(settings.dispositivos, avd));
    }
  });

  it("un físico: el guardado, o el primero libre; lo mismo que core tras validar", () => {
    const casos = [
      settings,
      { dispositivos: { ...settings.dispositivos, fisicos: { R58M123: { puerto: 9100 } } } },
      { dispositivos: { ...settings.dispositivos, fisicos: { ZY22: { puerto: 8445 }, R58M123: { puerto: "9100" } } } },
      { dispositivos: { avds: { "-x": { puerto: 8443 } }, fisicos: { "a b": { puerto: 8444 } } } },
      {},
    ];
    for (const crudo of casos) {
      const enCore = puertoDeFisico(validarSettings({ entornos: [], ...crudo }).settings.dispositivos, "R58M123");
      expect(lib.puertoAndroid(undefined, "R58M123", { casa: "/casa", leer: () => JSON.stringify(crudo) }), JSON.stringify(crudo)).toBe(enCore);
    }
  });

  it("un settings roto o ausente es el puerto de siempre", () => {
    expect(lib.puertoAndroid(undefined, "emulator-5556", { casa: "/casa", leer: () => "{roto", ejecutar })).toBe(8443);
    expect(lib.puertoAndroid(undefined, "emulator-5556", { casa: "/casa", leer: () => { throw Object.assign(new Error(), { code: "ENOENT" }); }, ejecutar })).toBe(8443);
  });

  it("con datos raros guardados, el mismo puerto que core tras validar", () => {
    for (const puerto of [80, "8444", 1023, 65536, 8443.5, 9001]) {
      const crudo = { dispositivos: { avds: { pixel8: { puerto } } } };
      const enCore = puertoDeAvd(validarSettings(crudo).settings.dispositivos, "pixel8");
      const ej = () => "pixel8\nOK\n";
      expect(lib.puertoAndroid(undefined, "emulator-5554", { casa: "/casa", leer: () => JSON.stringify(crudo), ejecutar: ej }), String(puerto)).toBe(enCore);
    }
    // Un nombre sin la forma de AVD tampoco cuenta.
    const crudo = { dispositivos: { avds: { "-x": { puerto: 9001 } } } };
    expect(lib.puertoAndroid(undefined, "emulator-5554", { casa: "/casa", leer: () => JSON.stringify(crudo), ejecutar: () => "-x\nOK\n" })).toBe(8443);
  });

  describe("el dueño del túnel (IXCODE-32)", () => {
    const lista = "emulator-5554 tcp:8443 tcp:8443\nR58M123 tcp:8445 tcp:8443\n";
    it("duenoDelPuerto lee adb forward --list", () => {
      expect(lib.duenoDelPuerto(lista, 8443)).toBe("emulator-5554");
      expect(lib.duenoDelPuerto(lista, 8445)).toBe("R58M123");
      expect(lib.duenoDelPuerto(lista, 8444)).toBeUndefined();
      // tcp:84430 no es tcp:8443.
      expect(lib.duenoDelPuerto("X tcp:84430 tcp:8443", 8443)).toBeUndefined();
    });
    it("propio, libre, ajeno o desconocido", () => {
      const ejecutar = () => lista;
      expect(lib.estadoDelTunel("R58M123", 8445, { entorno: {}, ejecutar })).toEqual({ estado: "propio" });
      expect(lib.estadoDelTunel("R58M123", 8444, { entorno: {}, ejecutar })).toEqual({ estado: "libre" });
      expect(lib.estadoDelTunel("R58M123", 8443, { entorno: {}, ejecutar })).toEqual({ estado: "ajeno", dueno: "emulator-5554" });
      expect(lib.estadoDelTunel("R58M123", 8443, { entorno: {}, ejecutar: () => { throw new Error("adb caído"); } })).toEqual({ estado: "desconocido" });
    });
    it("asegurarTunel: lo ajeno se niega, lo libre se pone (salvo con poner: false), lo propio no se toca", () => {
      const llamadas: string[][] = [];
      const ejecutar = (_bin: string, args: string[]) => {
        llamadas.push(args);
        return args[0] === "forward" ? lista : "";
      };
      const negar = (t: string): never => { throw new Error(t); };
      expect(() => lib.asegurarTunel("R58M123", 8443, { entorno: {}, ejecutar, negar })).toThrow(/emulator-5554/);
      llamadas.length = 0;
      lib.asegurarTunel("R58M123", 8445, { entorno: {}, ejecutar, negar });
      expect(llamadas).toEqual([["forward", "--list"]]);
      llamadas.length = 0;
      lib.asegurarTunel("R58M123", 8444, { entorno: {}, ejecutar, negar, poner: false });
      expect(llamadas).toEqual([["forward", "--list"]]);
      llamadas.length = 0;
      lib.asegurarTunel("R58M123", 8444, { entorno: {}, ejecutar, negar });
      expect(llamadas).toEqual([["forward", "--list"], ["-s", "R58M123", "forward", "tcp:8444", "tcp:8443"]]);
    });

    it("lo ajeno se dice con los dos aparatos y el puerto", () => {
      const t = lib.textoDeTunelAjeno("R58M123", 8443, "emulator-5554");
      expect(t).toContain("R58M123");
      expect(t).toContain("emulator-5554");
      expect(t).toContain("8443");
    });
  });

  it("las banderas de «sin ventana» son las de core", () => {
    expect(lib.BANDERAS_SIN_VENTANA).toEqual(argsDeArranque("x", { sinVentana: true }).slice(2));
  });

  it("la vuelta a 8443 por no saber el AVD se dice; un físico o un AVD sin puerto, no", () => {
    const cae = () => { throw new Error("adb caído"); };
    expect(lib.puertoConMotivo(undefined, "emulator-5556", { casa: "/casa", leer, ejecutar: cae })).toMatchObject({ puerto: 8443, porque: expect.stringContaining("emulator-5556") });
    expect(lib.puertoConMotivo(undefined, "R58M123", { casa: "/casa", leer, ejecutar: cae })).toEqual({ puerto: 8445 });
    expect(lib.puertoConMotivo(undefined, "emulator-5556", { casa: "/casa", leer, ejecutar }).porque).toBeUndefined();
    expect(lib.puertoConMotivo("9001", "emulator-5556", { casa: "/casa", leer, ejecutar: cae })).toEqual({ puerto: 9001 });
  });

  it("serieAndroid: un adb que falla o vence no cuelga ni tumba, cae en «sin elegir»", () => {
    const entorno = {} as Record<string, string>;
    expect(lib.serieAndroid(undefined, { entorno, ejecutar: () => { throw new Error("ETIMEDOUT"); } })).toEqual({ serie: undefined, porque: "sin elegir" });
    const r = lib.serieAndroid(undefined, { entorno, ejecutar: () => "List of devices attached\nemulator-5556\tdevice\n" });
    expect(r.serie).toBe("emulator-5556");
  });

  describe("retirarOpciones", () => {
    const n = ["--puerto", "--serie"];
    it("sin banderas, el resto es la entrada", () => {
      const e = ["click", "name=X", "--", "click", "name=Y", "--dry-run"];
      expect(lib.retirarOpciones(e, n)).toEqual({ opciones: {}, resto: e });
    });
    it.each([
      [["--puerto", "9000", "click", "name=X"]],
      [["click", "--puerto", "9000", "name=X"]],
      [["click", "name=X", "--puerto", "9000"]],
    ])("--puerto en cualquier sitio: %j", (e) => {
      expect(lib.retirarOpciones(e, n)).toEqual({ opciones: { "--puerto": "9000" }, resto: ["click", "name=X"] });
    });
    it("--serie y --puerto juntos, o solo --serie", () => {
      expect(lib.retirarOpciones(["--serie", "emulator-5556", "click", "--puerto", "9000", "name=X", "--", "screen"], n)).toEqual({
        opciones: { "--serie": "emulator-5556", "--puerto": "9000" },
        resto: ["click", "name=X", "--", "screen"],
      });
      expect(lib.retirarOpciones(["getAllElements", "--serie", "emulator-5556"], n).resto).toEqual(["getAllElements"]);
    });
  });
});

describe("el script xone-hotswap real, con --dry-run", () => {
  const script = resolve(__dirname, "../../skills/xone-hotswap/scripts/xone-hotswap");
  const correr = (...args: string[]) =>
    execFileSync(process.execPath, [script, ...args], { encoding: "utf8", env: { ...process.env, HOTSWAP_URL: "wss://127.0.0.1:1/hotswap", XONECODE_DISPOSITIVO: "" } }).trim();
  it.each([
    [["getAllElements", "--dry-run"], '{"command":"getAllElements"}'],
    [["click", "name=X", "--dry-run"], '{"command":"click","name":"X"}'],
    [["--serie", "emulator-5556", "click", "name=X", "--dry-run"], '{"command":"click","name":"X"}'],
    [["--dry-run", "click", "name=X", "--", "click", "name=Y"], '{"command":"click","name":"X"}\n{"command":"click","name":"Y"}'],
    // Los atajos del 22-10-2026 (medido contra pixel8): `js` sin Base64 a mano y `abrir` directo a una ventana.
    [["--dry-run", "js", "return", "1+1;"], `{"command":"runScript","scriptLanguage":"javascript","scriptText":"${Buffer.from("return 1+1;").toString("base64")}"}`],
    [["--dry-run", "abrir", "MenuAlbaranes"], `{"command":"runScript","scriptLanguage":"javascript","scriptText":"${Buffer.from('ui.openMenu("MenuAlbaranes"); return "abierta MenuAlbaranes";').toString("base64")}"}`],
    // Los del 27-10-2026 (medido en Busme): atrás por el canal y los textos pintados sin uiautomator dump.
    [["--dry-run", "atras"], '{"command":"pressKey","keyCode":4}'],
    [["--dry-run", "textos"], '{"command":"getAllElements","format":"uiautomator"}'],
    [["--dry-run", "esperar", "Elige", "antes", "timeout=800"], '{"command":"getAllElements","format":"uiautomator"}'],
  ])("%j", (args, esperado) => {
    expect(correr(...args)).toBe(esperado);
  });
});

/**
 * Un comando que el servidor RECHAZA (`result: false`) hace salir con 1. Medido en una tarea de Maset (23-10-2026): el
 * desarrollador probó cuatro sintaxis de `launchApplication` seguidas porque todas salían con 0.
 */
describe("el script xone-hotswap real, contra un servidor de mentira", () => {
  const script = resolve(__dirname, "../../skills/xone-hotswap/scripts/xone-hotswap");
  /** `respuesta` puede ser una lista: la n-ésima petición recibe la n-ésima (y la última se repite). */
  async function correrContra(
    respuesta: Record<string, unknown> | Record<string, unknown>[],
    ...args: string[]
  ): Promise<{ codigo: number | null; err: string; out: string; peticiones: number }> {
    const { WebSocketServer } = await import("ws");
    const servidor = new WebSocketServer({ port: 0, host: "127.0.0.1" });
    await new Promise<void>((r) => servidor.once("listening", () => r()));
    const respuestas = Array.isArray(respuesta) ? respuesta : [respuesta];
    let peticiones = 0;
    servidor.on("connection", (ws) => {
      ws.send(JSON.stringify({ command: "server_hello" }));
      ws.on("message", () => ws.send(JSON.stringify(respuestas[Math.min(peticiones++, respuestas.length - 1)])));
    });
    const puerto = (servidor.address() as { port: number }).port;
    const { spawn } = await import("node:child_process");
    const hijo = spawn(process.execPath, [script, ...args], { env: { ...process.env, HOTSWAP_URL: `ws://127.0.0.1:${puerto}/hotswap`, XONECODE_DISPOSITIVO: "" } });
    let err = "";
    let out = "";
    hijo.stderr.on("data", (d) => (err += String(d)));
    hijo.stdout.on("data", (d) => (out += String(d)));
    const codigo = await new Promise<number | null>((r) => hijo.on("close", r));
    servidor.close();
    return { codigo, err, out, peticiones };
  }

  const volcado = (...textos: string[]) => ({
    result: true,
    status: `<hierarchy>${textos.map((t) => `<node index="0" text="${t}" bounds="[0,0][1,1]"/>`).join("")}<node text="" /></hierarchy>`,
  });

  it("textos: los pintados en una línea, sin vacíos ni repetidos y con las entidades deshechas", async () => {
    const r = await correrContra(volcado("¿Cuándo?", "Más tarde &amp; ahora", "¿Cuándo?"), "textos");
    expect(r.codigo).toBe(0);
    expect(JSON.parse(r.out)).toEqual({ comando: "textos", textos: ["¿Cuándo?", "Más tarde & ahora"] });
  }, 20_000);

  it("esperar: vuelve a mirar por la misma conexión hasta que se pinta, sin tildes ni mayúsculas", async () => {
    const r = await correrContra([volcado("Inicio"), volcado("Inicio"), volcado("ELIGE ANTES UNA PARADA")], "esperar", "elige", "antes", "timeout=10000");
    expect(r.codigo).toBe(0);
    expect(r.peticiones).toBe(3);
    expect(JSON.parse(r.out)).toMatchObject({ comando: "esperar", visto: "ELIGE ANTES UNA PARADA" });
  }, 20_000);

  it("esperar sin verlo: sale con 1 y dice lo que SÍ había", async () => {
    const r = await correrContra(volcado("Inicio", "Ayuda"), "esperar", "Cuándo", "timeout=700");
    expect(r.codigo).toBe(1);
    expect(JSON.parse(r.out)).toMatchObject({ comando: "esperar", visto: false, enPantalla: ["Inicio", "Ayuda"] });
    expect(r.err).toContain("no apareció «Cuándo» en 700 ms");
  }, 20_000);

  it("js sin return avisa antes del viaje; con return, no", async () => {
    expect((await correrContra({ result: true, status: "" }, "js", "var a=1; a")).err).toContain("sin «return» no devuelve nada");
    expect((await correrContra({ result: true, status: "1" }, "js", "return 1;")).err).not.toContain("return");
  }, 20_000);

  it("rechazado (result:false) sale con 1 y lo dice; aceptado, con 0", async () => {
    const malo = await correrContra({ result: false, status: "Unknown command: launchapplication" }, "launchapplication", "app=maset");
    expect(malo.codigo).toBe(1);
    expect(malo.err).toContain("el servidor rechazó launchapplication");
    expect((await correrContra({ result: true, status: "" }, "launchApplication", "appName=maset")).codigo).toBe(0);
  }, 20_000);
});

/**
 * Un rechazo del servidor es una RESPUESTA para quien solo pregunta si el canal está en pie. Medido en el emulador
 * (28-10-2026): con el framework vivo y sin app, `getAllElements` contesta «App is not running» con `result:false`, el
 * cliente sale con 1 desde que eso cuenta como rechazo, y reiniciar (25 s) y desplegar (68 s) daban el canal por muerto.
 */
describe("salidaDelCliente: el latido de los scripts acepta un rechazo y no un silencio", () => {
  const cliente = resolve(__dirname, "../../skills/xone-hotswap/scripts/xone-hotswap");
  const modulo = pathToFileURL(resolve(__dirname, "../../skills/xone-hotswap/lib/dispositivo.mjs")).href;

  /** `salidaDelCliente` es síncrona: corre en un hijo para que el servidor de mentira de este proceso pueda contestar. */
  async function latido(url: string): Promise<{ codigo: number | null; out: string }> {
    const { spawn } = await import("node:child_process");
    const programa = `import { salidaDelCliente } from ${JSON.stringify(modulo)};
      try { console.log(salidaDelCliente(${JSON.stringify(cliente)}, ["getAllElements", "format=xone"], ${JSON.stringify(url)})); }
      catch { process.exit(3); }`;
    const hijo = spawn(process.execPath, ["--input-type=module", "-e", programa], { env: { ...process.env, XONECODE_DISPOSITIVO: "" } });
    let out = "";
    hijo.stdout.on("data", (d) => (out += String(d)));
    const codigo = await new Promise<number | null>((r) => hijo.on("close", r));
    return { codigo, out };
  }

  it("framework vivo y sin app: «App is not running» vuelve como salida, no como canal muerto", async () => {
    const { WebSocketServer } = await import("ws");
    const servidor = new WebSocketServer({ port: 0, host: "127.0.0.1" });
    await new Promise<void>((r) => servidor.once("listening", () => r()));
    servidor.on("connection", (ws) => {
      ws.send(JSON.stringify({ command: "server_hello" }));
      ws.on("message", () => ws.send(JSON.stringify({ result: false, status: "App is not running" })));
    });
    const puerto = (servidor.address() as { port: number }).port;
    const r = await latido(`ws://127.0.0.1:${puerto}/hotswap`);
    servidor.close();
    expect(r.codigo).toBe(0);
    expect(r.out).toContain("App is not running");
  }, 20_000);

  it("sin nadie escuchando, lanza: eso sí es canal muerto", async () => {
    const { createServer } = await import("node:net");
    const libre = createServer();
    await new Promise<void>((r) => libre.listen(0, "127.0.0.1", () => r()));
    const puerto = (libre.address() as { port: number }).port;
    await new Promise<void>((r) => libre.close(() => r()));
    expect((await latido(`ws://127.0.0.1:${puerto}/hotswap`)).codigo).toBe(3);
  }, 20_000);

  it("un fallo sin `result:false` en la salida se relanza", () => {
    const sinRespuesta = Object.assign(new Error("ECONNREFUSED"), { stdout: "" });
    expect(() => lib.salidaDelCliente("c", ["getAllElements"], "ws://x", () => { throw sinRespuesta; })).toThrow("ECONNREFUSED");
    const rechazo = Object.assign(new Error("salió con 1"), { stdout: '{"comando":"getAllElements","result":false,"status":"App is not running"}\n' });
    expect(lib.salidaDelCliente("c", ["getAllElements"], "ws://x", () => { throw rechazo; })).toContain("App is not running");
  });

  it("reiniciar y desplegar preguntan al canal SOLO por salidaDelCliente", () => {
    for (const nombre of ["xone-reiniciar-android", "xone-desplegar-android"]) {
      const texto = readFileSync(resolve(__dirname, `../../skills/xone-hotswap/scripts/${nombre}`), "utf8");
      // El cliente a pelo con getAllElements era el latido que tomaba el rechazo por silencio.
      expect(texto, nombre).not.toMatch(/execFileSync\(NODE, \[cliente, "getAllElements"/);
      expect(texto, nombre).toContain("salidaDelCliente(");
    }
    // reiniciar pasa todos sus comandos por `mandar`, y `mandar` es `salidaDelCliente`.
    const reiniciar = readFileSync(resolve(__dirname, "../../skills/xone-hotswap/scripts/xone-reiniciar-android"), "utf8");
    expect(reiniciar).toMatch(/const mandar = [\s\S]*?return salidaDelCliente\(/);
    // desplegar conserva su `mandar` a pelo para la captura, pero ninguna pregunta de árbol pasa ya por él.
    const desplegar = readFileSync(resolve(__dirname, "../../skills/xone-hotswap/scripts/xone-desplegar-android"), "utf8");
    expect(desplegar).not.toMatch(/mandar\(\{ command: "getAllElements"/);
    expect(desplegar).not.toMatch(/mandar\(\{ command: "launchApplication"/);
  });
});

describe("xone-desplegar-android avisa de que sustituye la base del aparato", () => {
  it("el aviso está en la rama que acaba bien, antes de salir con 0", () => {
    // Medido en Maset: desplegar entero para subir un icono borró dos veces los datos de prueba.
    const texto = readFileSync(resolve(__dirname, "../../skills/xone-hotswap/scripts/xone-desplegar-android"), "utf8");
    const aviso = texto.indexOf("ha SUSTITUIDO la base de datos del aparato");
    expect(aviso).toBeGreaterThan(0);
    expect(texto.indexOf("process.exit(0)", aviso)).toBeGreaterThan(aviso);
  });
});
