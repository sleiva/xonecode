import { describe, expect, it } from "vitest";
import type { AbrirSocketHotswap, SocketHotswap } from "./hotswap.js";
import { recargarEnAparato, relanzarEnAparato, type PeticionDeRecarga } from "./recargaEnAparato.js";

const ARBOL = { result: true, status: JSON.stringify([{ name: "MAP_BTN", type: "B" }]) };
const SIN_APP = { result: false, status: "App is not running" };

/** Un framework de mentira: saluda solo y contesta cada comando con `contestar`. */
function framework(contestar: (comando: Record<string, unknown>) => unknown) {
  const enviados: Record<string, unknown>[] = [];
  const urls: string[] = [];
  let cerrados = 0;
  const abrirSocket: AbrirSocketHotswap = (url) => {
    urls.push(url);
    const oyentes = new Map<string, ((v: unknown) => void)[]>();
    const emitir = (evento: string, valor?: unknown): void => {
      for (const cb of oyentes.get(evento) ?? []) cb(valor);
    };
    const socket: SocketHotswap = {
      on: (evento, cb) => {
        oyentes.set(evento, [...(oyentes.get(evento) ?? []), cb as (v: unknown) => void]);
      },
      send: (texto) => {
        const comando = JSON.parse(texto) as Record<string, unknown>;
        enviados.push(comando);
        emitir("message", Buffer.from(JSON.stringify(contestar(comando))));
      },
      close: () => {
        cerrados += 1;
      },
    };
    setTimeout(() => emitir("message", Buffer.from(JSON.stringify({ command: "server_hello", protocol_version: 2 }))), 0);
    return socket;
  };
  return { abrirSocket, enviados, urls, cerrados: () => cerrados, nombres: () => enviados.map((c) => c["command"]) };
}

const tunelBueno = async (): Promise<undefined> => undefined;

function peticion(ruta: string, texto: string | Uint8Array): PeticionDeRecarga {
  return {
    serie: "emulator-5554",
    puerto: 8445,
    app: "MiApp",
    ruta,
    bytes: typeof texto === "string" ? new TextEncoder().encode(texto) : texto,
  };
}

const vivaYAcepta = (c: Record<string, unknown>): unknown => (c["command"] === "getAllElements" ? ARBOL : { result: true, status: "" });

describe("recargarEnAparato", () => {
  it("una colección: sube a disco, la carga en caliente y COMPRUEBA que la app sigue viva", async () => {
    const f = framework(vivaYAcepta);
    const r = await recargarEnAparato(peticion("Inicio.xne", '<coll name="Inicio"></coll>'), {
      abrirSocket: f.abrirSocket,
      aplicarTunel: tunelBueno,
    });
    expect(r).toEqual({ estado: "aplicada", clase: "coleccion" });
    expect(f.nombres()).toEqual(["getAllElements", "uploadFile", "loadCollection", "getAllElements"]);
    expect(f.enviados[1]!["destinationPath"]).toBe("app_miapp/Inicio.xne");
    expect(f.enviados[2]!["encoding"]).toBe("UTF-8");
    // El puerto es el del AVD, no el de fábrica.
    expect(f.urls).toEqual(["wss://127.0.0.1:8445/hotswap"]);
    expect(f.cerrados()).toBeGreaterThan(0);
  });

  it("un .xne Latin-1: a DISCO van sus bytes; a memoria, UTF-8 con el prólogo diciendo UTF-8 (medido)", async () => {
    const f = framework(vivaYAcepta);
    const bytes = new Uint8Array([
      ...new TextEncoder().encode('<?xml version="1.0" encoding="iso-8859-15"?><coll name="A" title="Espa'),
      0xf1,
      ...new TextEncoder().encode('a"></coll>'),
    ]);
    await recargarEnAparato(peticion("A.xne", bytes), { abrirSocket: f.abrirSocket, aplicarTunel: tunelBueno });
    expect(Buffer.from(String(f.enviados[1]!["fileData"]), "base64")).toEqual(Buffer.from(bytes));
    expect(f.enviados[2]!["encoding"]).toBe("UTF-8");
    expect(Buffer.from(String(f.enviados[2]!["xmlNode"]), "base64").toString("utf8")).toBe(
      '<?xml version="1.0" encoding="UTF-8"?><coll name="A" title="España"></coll>'
    );
  });

  it("un .js: sube y recompila el include", async () => {
    const f = framework(vivaYAcepta);
    const r = await recargarEnAparato(peticion("js/funciones.js", "function a(){}"), {
      abrirSocket: f.abrirSocket,
      aplicarTunel: tunelBueno,
    });
    expect(r).toEqual({ estado: "aplicada", clase: "js" });
    expect(f.enviados[2]).toMatchObject({ command: "loadIncludeFile", file: "js/funciones.js", compile: true });
  });

  it("un CSS: sube y RELANZA la app, porque es lo único que relee los estilos (medido)", async () => {
    const f = framework(vivaYAcepta);
    const r = await recargarEnAparato(peticion("estilos.css", "a{}"), { abrirSocket: f.abrirSocket, aplicarTunel: tunelBueno });
    expect(r).toEqual({ estado: "relanzada", clase: "relanzar" });
    expect(f.nombres()).toEqual(["getAllElements", "uploadFile", "launchApplication", "getAllElements"]);
  });


  it("sin la app corriendo no toca NADA: ni sube ni aplica", async () => {
    const f = framework(() => SIN_APP);
    const r = await recargarEnAparato(peticion("Inicio.xne", "<coll>"), { abrirSocket: f.abrirSocket, aplicarTunel: tunelBueno });
    expect(r.estado).toBe("sin-app");
    expect(f.nombres()).toEqual(["getAllElements"]);
  });

  it("sin túnel (no hay aparato) contesta sin abrir el canal", async () => {
    const f = framework(vivaYAcepta);
    const r = await recargarEnAparato(peticion("Inicio.xne", "<coll>"), {
      abrirSocket: f.abrirSocket,
      aplicarTunel: async () => "adb forward falló (1)",
    });
    expect(r).toEqual({ estado: "sin-app", motivo: "adb forward falló (1)" });
    expect(f.urls).toEqual([]);
  });

  it("un canal que revienta no LANZA: contesta sin-app", async () => {
    const abrirSocket: AbrirSocketHotswap = () => {
      throw Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" });
    };
    const r = await recargarEnAparato(peticion("Inicio.xne", "<coll>"), { abrirSocket, aplicarTunel: tunelBueno });
    // Sin el error crudo: es «la app no corre», no un fallo que leer.
    expect(r).toEqual({ estado: "sin-app" });
  });

  it("un icono no se recarga suelto, y ni siquiera se pone el túnel", async () => {
    let tuneles = 0;
    const r = await recargarEnAparato(peticion("icons/a.png", "x"), {
      aplicarTunel: async () => {
        tuneles += 1;
        return undefined;
      },
    });
    expect(r).toEqual({ estado: "no-aplica" });
    expect(tuneles).toBe(0);
  });

  it("si la app deja de contestar tras aplicar, es un fallo dicho", async () => {
    let lecturas = 0;
    const f = framework((c) => {
      if (c["command"] !== "getAllElements") return { result: true, status: "" };
      lecturas += 1;
      return lecturas === 1 ? ARBOL : SIN_APP;
    });
    const r = await recargarEnAparato(peticion("Inicio.xne", "<coll>"), { abrirSocket: f.abrirSocket, aplicarTunel: tunelBueno });
    expect(r.estado).toBe("fallo");
  });

  it("un NO del framework al aplicar trae su frase literal", async () => {
    const f = framework((c) =>
      c["command"] === "getAllElements" ? ARBOL : c["command"] === "loadCollection" ? { result: false, exceptionMessage: "XML mal formado" } : { result: true }
    );
    const r = await recargarEnAparato(peticion("Inicio.xne", "<coll>"), { abrirSocket: f.abrirSocket, aplicarTunel: tunelBueno });
    expect(r).toEqual({ estado: "fallo", clase: "coleccion", motivo: "loadCollection: XML mal formado" });
  });
});

describe("relanzarEnAparato", () => {
  it("relanza con lanzarYComprobar y afirma solo lo que leyó", async () => {
    const f = framework(vivaYAcepta);
    const r = await relanzarEnAparato({ serie: "emulator-5554", puerto: 8445, app: "MiApp" }, {
      abrirSocket: f.abrirSocket,
      aplicarTunel: tunelBueno,
    });
    expect(r).toEqual({ estado: "relanzada" });
    expect(f.nombres()).toEqual(["launchApplication", "getAllElements"]);
  });
});
