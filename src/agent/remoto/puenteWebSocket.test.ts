import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { WebSocketServer, type WebSocket as Socket } from "ws";
import { cargarModuloRemoto, crearPuenteWebSocket, NOMBRE_DEL_PAQUETE, type ModuloRemoto } from "./puenteWebSocket.js";
import type { EstadoDelPuente } from "../../core/ports.js";

/** Un módulo FALSO: misma forma que el paquete, cifrado identidad. Los vectores reales se prueban en xonecode-server. */
const moduloFalso: ModuloRemoto = {
  VERSION_DEL_PROTOCOLO: 1,
  generarCredenciales: () => ({ sala: "SALA", secreto: "SECRETO" }),
  urlDeSesion: (base, sala, secreto) => `${base}/r/${sala}#${secreto}`,
  baseHttpDe: (ws) => ws.replace(/^ws/, "http").replace(/\/ws$/, ""),
  crearCanal: async () => ({
    cifrar: async (m: unknown) => JSON.stringify(m),
    descifrar: async (c: string) => JSON.parse(c) as unknown,
  }),
};

let servidor: WebSocketServer | undefined;
afterEach(() => servidor?.close());

function levantar() {
  servidor = new WebSocketServer({ port: 0 });
  const recibidos: Record<string, unknown>[] = [];
  const conexiones: Socket[] = [];
  servidor.on("connection", (ws) => {
    conexiones.push(ws);
    ws.on("message", (d) => recibidos.push(JSON.parse(String(d)) as Record<string, unknown>));
  });
  const puerto = (servidor.address() as { port: number }).port;
  return { url: `ws://127.0.0.1:${puerto}/ws`, recibidos, conexiones };
}

const escuchasVacias = { alPresencia: () => {}, alMensaje: () => {} };

describe("cargar el paquete bajo demanda", () => {
  it("devuelve el módulo, o undefined si no está instalado", async () => {
    expect(await cargarModuloRemoto(async () => moduloFalso)).toBe(moduloFalso);
    expect(
      await cargarModuloRemoto(async () => {
        throw new Error("Cannot find package");
      })
    ).toBeUndefined();
  });

  it("solo este fichero nombra el paquete", () => {
    const raiz = join(import.meta.dirname, "..", "..");
    for (const f of ["web/servidor/arranque.ts", "web/servidor/puenteRemoto.ts", "core/remoto.ts", "core/ports.ts"]) {
      expect(readFileSync(join(raiz, f), "utf8")).not.toContain(NOMBRE_DEL_PAQUETE);
    }
  });
});

describe("el puente WebSocket", () => {
  it("abre la sala, entrega presencia y datos, y envía dirigido", async () => {
    const s = levantar();
    const estados: EstadoDelPuente[] = [];
    const presencias: (readonly string[])[] = [];
    const mensajes: [string, unknown][] = [];
    const canal = await crearPuenteWebSocket(moduloFalso).abrir(s.url, {
      alEstado: (e) => void estados.push(e),
      alPresencia: (p) => void presencias.push(p),
      alMensaje: (de, m) => void mensajes.push([de, m]),
    });
    await expect.poll(() => s.recibidos[0]).toEqual({ t: "abrir", sala: "SALA", v: 1 });
    const ws = s.conexiones[0]!;
    ws.send(JSON.stringify({ t: "abierta" }));
    await expect.poll(() => estados.at(-1)).toEqual({ estado: "abierta", url: `${moduloFalso.baseHttpDe(s.url)}/r/SALA#SECRETO` });
    ws.send(JSON.stringify({ t: "presencia", moviles: ["m1"] }));
    ws.send(JSON.stringify({ t: "dato", de: "m1", carga: JSON.stringify({ clase: "cancelar" }) }));
    await expect.poll(() => mensajes).toEqual([["m1", { clase: "cancelar" }]]);
    expect(presencias).toEqual([["m1"]]);
    await canal.enviar("m1", { clase: "turno", activo: true });
    await expect.poll(() => s.recibidos.at(-1)).toEqual({ t: "dato", para: "m1", carga: JSON.stringify({ clase: "turno", activo: true }) });
    canal.cerrar();
  });

  it("si se cae, reconecta a la MISMA sala y con el MISMO canal cifrado", async () => {
    const s = levantar();
    const estados: EstadoDelPuente[] = [];
    let canalesCreados = 0;
    const modulo: ModuloRemoto = {
      ...moduloFalso,
      crearCanal: (o) => {
        canalesCreados += 1;
        return moduloFalso.crearCanal(o);
      },
    };
    const canal = await crearPuenteWebSocket(modulo, { esperasMs: [10] }).abrir(s.url, { ...escuchasVacias, alEstado: (e) => void estados.push(e) });
    await expect.poll(() => s.conexiones.length).toBe(1);
    s.conexiones[0]!.close();
    await expect.poll(() => estados.some((e) => e.estado === "reconectando")).toBe(true);
    await expect.poll(() => s.recibidos.filter((r) => r.t === "abrir")).toEqual([
      { t: "abrir", sala: "SALA", v: 1 },
      { t: "abrir", sala: "SALA", v: 1 },
    ]);
    // Un canal nuevo al reconectar dejaría al relé repetir mensajes viejos del móvil.
    expect(canalesCreados).toBe(1);
    canal.cerrar();
  });

  it("otra versión del protocolo se dice con «actualiza xonecode»", async () => {
    const s = levantar();
    const estados: EstadoDelPuente[] = [];
    await crearPuenteWebSocket(moduloFalso).abrir(s.url, { ...escuchasVacias, alEstado: (e) => void estados.push(e) });
    await expect.poll(() => s.conexiones.length).toBe(1);
    s.conexiones[0]!.send(JSON.stringify({ t: "error", motivo: "version" }));
    await expect.poll(() => estados.at(-1)).toMatchObject({ estado: "cerrada" });
    expect((estados.at(-1) as { motivo?: string }).motivo).toMatch(/actualiza xonecode/);
  });

  it.each([
    ["sala-ocupada", "esa sala ya tiene un anfitrión"],
    ["ritmo", "el puente cortó la conexión por exceso de mensajes"],
    ["mensaje-ilegible", "el puente no entendió un mensaje"],
  ])("el motivo %s cierra la sesión con su texto", async (motivo, texto) => {
    const s = levantar();
    const estados: EstadoDelPuente[] = [];
    await crearPuenteWebSocket(moduloFalso).abrir(s.url, { ...escuchasVacias, alEstado: (e) => void estados.push(e) });
    await expect.poll(() => s.conexiones.length).toBe(1);
    s.conexiones[0]!.send(JSON.stringify({ t: "error", motivo }));
    await expect.poll(() => estados.at(-1)).toEqual({ estado: "cerrada", motivo: texto });
  });

  it("un cierre 1009 del relé (mensaje demasiado grande) cierra con su motivo, sin reconectar", async () => {
    const s = levantar();
    const estados: EstadoDelPuente[] = [];
    await crearPuenteWebSocket(moduloFalso, { esperasMs: [10] }).abrir(s.url, { ...escuchasVacias, alEstado: (e) => void estados.push(e) });
    await expect.poll(() => s.conexiones.length).toBe(1);
    s.conexiones[0]!.close(1009);
    await expect.poll(() => estados.at(-1)).toEqual({ estado: "cerrada", motivo: "un mensaje superó el tamaño máximo del puente" });
    await new Promise((r) => setTimeout(r, 60));
    expect(s.conexiones.length).toBe(1);
  });

  it("un mensaje que no descifra no tumba el puente", async () => {
    const s = levantar();
    const mensajes: unknown[] = [];
    const modulo: ModuloRemoto = {
      ...moduloFalso,
      crearCanal: async () => ({
        cifrar: async (m) => JSON.stringify(m),
        descifrar: async () => {
          throw new Error("auth");
        },
      }),
    };
    await crearPuenteWebSocket(modulo).abrir(s.url, { ...escuchasVacias, alEstado: () => {}, alMensaje: (_d, m) => void mensajes.push(m) });
    await expect.poll(() => s.conexiones.length).toBe(1);
    s.conexiones[0]!.send(JSON.stringify({ t: "dato", de: "m1", carga: "x" }));
    await new Promise((r) => setTimeout(r, 40));
    expect(mensajes).toEqual([]);
  });

  it("procesa los mensajes del relé en orden de llegada, aunque descifrar tarde distinto", async () => {
    const s = levantar();
    const orden: string[] = [];
    // Como el paquete real: por origen, un mensaje solo vale si su secuencia supera la última vista.
    let ultima = 0;
    const modulo: ModuloRemoto = {
      ...moduloFalso,
      crearCanal: async () => ({
        cifrar: async (m) => JSON.stringify(m),
        descifrar: async (c) => {
          const m = JSON.parse(c) as { n: number };
          await new Promise((r) => setTimeout(r, m.n === 1 ? 50 : 0));
          if (m.n <= ultima) throw new Error("secuencia vieja");
          ultima = m.n;
          return m;
        },
      }),
    };
    await crearPuenteWebSocket(modulo).abrir(s.url, {
      alEstado: () => {},
      alPresencia: () => void orden.push("presencia"),
      alMensaje: (_d, m) => void orden.push(`dato${(m as { n: number }).n}`),
    });
    await expect.poll(() => s.conexiones.length).toBe(1);
    const ws = s.conexiones[0]!;
    ws.send(JSON.stringify({ t: "dato", de: "m1", carga: JSON.stringify({ n: 1 }) }));
    ws.send(JSON.stringify({ t: "dato", de: "m1", carga: JSON.stringify({ n: 2 }) }));
    ws.send(JSON.stringify({ t: "presencia", moviles: ["m1"] }));
    await expect.poll(() => orden.length).toBe(3);
    expect(orden).toEqual(["dato1", "dato2", "presencia"]);
  });
});
