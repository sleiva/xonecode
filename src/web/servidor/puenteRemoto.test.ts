import { describe, expect, it } from "vitest";
import { PuenteRemotoEnMemoria } from "../../core/ports.js";
import { crearSesionRemota, type EstadoDeSesionRemota } from "./puenteRemoto.js";
import type { Sumidero } from "./transporte.js";

function montar(topeDeSalida?: number) {
  const puerto = new PuenteRemotoEnMemoria();
  const enganchados = new Set<Sumidero>();
  const despachados: unknown[] = [];
  const informados: string[] = [];
  const estados: EstadoDeSesionRemota[] = [];
  const sesion = crearSesionRemota({
    puerto: async () => puerto,
    servidor: () => "ws://127.0.0.1:8787/ws",
    engancharCliente: (s) => void enganchados.add(s),
    soltarCliente: (s) => void enganchados.delete(s),
    despachar: (m) => void despachados.push(m),
    informar: (t) => void informados.push(t),
    alCambiar: (e) => void estados.push(e),
    ...(topeDeSalida === undefined ? {} : { topeDeSalida }),
  });
  return { puerto, enganchados, despachados, informados, estados, sesion };
}

describe("la sesión remota", () => {
  it("encender abre el puente y, al abrirse, está activa con su URL", async () => {
    const p = montar();
    await p.sesion.encender();
    expect(p.puerto.aperturas).toEqual(["ws://127.0.0.1:8787/ws"]);
    p.puerto.abierta("https://r/r/S#K");
    expect(p.sesion.estado()).toEqual({ estado: "activa", url: "https://r/r/S#K", moviles: 0 });
  });

  it("cada móvil es un sumidero propio que solo deja salir lo permitido", async () => {
    const p = montar();
    await p.sesion.encender();
    p.puerto.abierta();
    p.puerto.presencia("m1");
    expect(p.enganchados.size).toBe(1);
    expect(p.sesion.estado()).toMatchObject({ estado: "activa", moviles: 1 });
    const [sumidero] = [...p.enganchados];
    sumidero!({ clase: "acto", acto: { tipo: "usuario", texto: "hola" } } as never);
    sumidero!({ clase: "secreto", texto: "clave" } as never);
    sumidero!({ clase: "alta", proyectoActivo: "p", sesionActiva: "s", proyectos: [{ id: "p", nombre: "AppDemo", sesiones: [{ id: "s", titulo: "Hola" }] }] } as never);
    await Promise.resolve();
    expect(p.puerto.enviados).toEqual([
      { para: "m1", mensaje: { clase: "acto", acto: { tipo: "usuario", texto: "hola" } } },
      { para: "m1", mensaje: { clase: "remoto.estado", proyecto: "AppDemo", sesion: "Hola" } },
    ]);
  });

  it("un móvil que se va se suelta", async () => {
    const p = montar();
    await p.sesion.encender();
    p.puerto.abierta();
    p.puerto.presencia("m1", "m2");
    p.puerto.presencia("m2");
    expect(p.enganchados.size).toBe(1);
    expect(p.sesion.estado()).toMatchObject({ moviles: 1 });
  });

  it("lo que entra: lo permitido se despacha, lo demás se informa, y un desconocido se ignora", async () => {
    const p = montar();
    await p.sesion.encender();
    p.puerto.abierta();
    p.puerto.presencia("m1");
    p.puerto.delMovil("m1", { clase: "prosa", texto: "hola" });
    p.puerto.delMovil("m1", { clase: "sesion", proyecto: "otro" });
    p.puerto.delMovil("intruso", { clase: "cancelar" });
    expect(p.despachados).toEqual([{ clase: "prosa", texto: "hola" }]);
    expect(p.informados).toHaveLength(1);
    expect(p.informados[0]).toMatch(/sesion/);
  });

  it("apagar suelta y cierra; revocar abre un canal nuevo", async () => {
    const p = montar();
    await p.sesion.encender();
    p.puerto.abierta();
    p.puerto.presencia("m1");
    await p.sesion.revocar();
    expect(p.enganchados.size).toBe(0);
    expect(p.puerto.cerrados).toBe(1);
    expect(p.puerto.aperturas).toHaveLength(2);
    p.sesion.apagar();
    expect(p.puerto.cerrados).toBe(2);
    expect(p.sesion.estado()).toEqual({ estado: "apagada" });
  });

  it("sin paquete o con un fallo al abrir, el estado lo dice", async () => {
    const sinPaquete = crearSesionRemota({
      puerto: async () => undefined,
      servidor: () => "wss://x/ws",
      engancharCliente: () => {},
      soltarCliente: () => {},
      despachar: () => {},
      informar: () => {},
      alCambiar: () => {},
    });
    await sinPaquete.encender();
    expect(sinPaquete.estado()).toEqual({ estado: "error", motivo: "la sesión remota no está disponible en esta instalación" });

    const p = montar();
    p.puerto.abrir = async () => {
      throw Object.assign(new Error("connect ECONNREFUSED /Users/x/ruta"), { code: "ECONNREFUSED" });
    };
    await p.sesion.encender();
    expect(p.sesion.estado()).toEqual({ estado: "error", motivo: "ECONNREFUSED" });

    // Sin `code` no cruza el mensaje (puede llevar rutas): texto fijo.
    const q = montar();
    q.puerto.abrir = async () => {
      throw new Error("ENOENT /Users/x/secreto");
    };
    await q.sesion.encender();
    expect(q.sesion.estado()).toEqual({ estado: "error", motivo: "no se pudo abrir la sesión remota" });
  });

  /** Hace que `abrir` no resuelva hasta que el test lo diga. */
  function abrirPendiente(p: ReturnType<typeof montar>) {
    const original = p.puerto.abrir.bind(p.puerto);
    let soltar!: () => void;
    const puerta = new Promise<void>((r) => (soltar = r));
    p.puerto.abrir = async (servidor, escuchas) => {
      const canal = await original(servidor, escuchas);
      await puerta;
      return canal;
    };
    return soltar;
  }

  it("encender dos veces mientras abre abre UN solo canal", async () => {
    const p = montar();
    const soltar = abrirPendiente(p);
    const a = p.sesion.encender();
    const b = p.sesion.encender();
    soltar();
    await Promise.all([a, b]);
    expect(p.puerto.canales).toHaveLength(1);
  });

  it("lo que dice un canal tras apagar no cambia nada", async () => {
    const p = montar();
    await p.sesion.encender();
    p.puerto.abierta();
    p.sesion.apagar();
    p.puerto.abierta("https://tarde/r/S#K", 0);
    p.puerto.presenciaDe(0, "m1");
    expect(p.sesion.estado()).toEqual({ estado: "apagada" });
    expect(p.enganchados.size).toBe(0);
  });

  it("tras revocar, un cerrada del canal VIEJO no toca al nuevo", async () => {
    const p = montar();
    await p.sesion.encender();
    p.puerto.abierta();
    await p.sesion.revocar();
    p.puerto.abierta("https://nuevo/r/S#K");
    p.puerto.presencia("m1");
    p.puerto.cerrada("viejo muere", 0);
    p.puerto.presenciaDe(0, "m9");
    expect(p.sesion.estado()).toEqual({ estado: "activa", url: "https://nuevo/r/S#K", moviles: 1 });
    expect(p.enganchados.size).toBe(1);
  });

  it("apagar con la apertura pendiente cierra ese canal al resolver y sigue apagada", async () => {
    const p = montar();
    const soltar = abrirPendiente(p);
    const e = p.sesion.encender();
    await Promise.resolve();
    p.sesion.apagar();
    soltar();
    await e;
    expect(p.puerto.canales[0]!.cerrado).toBe(true);
    expect(p.sesion.estado()).toEqual({ estado: "apagada" });
  });

  it("un fallo de apertura de una generación vieja no pisa el estado", async () => {
    const p = montar();
    let fallar!: () => void;
    const puerta = new Promise<void>((_, rej) => (fallar = () => rej(new Error("tarde"))));
    p.puerto.abrir = async () => {
      await puerta;
      throw new Error("no llega");
    };
    const e = p.sesion.encender();
    await Promise.resolve();
    p.sesion.apagar();
    fallar();
    await e;
    expect(p.sesion.estado()).toEqual({ estado: "apagada" });
  });

  it("cerrada con motivo: error y móviles soltados", async () => {
    const p = montar();
    await p.sesion.encender();
    p.puerto.abierta();
    p.puerto.presencia("m1");
    p.puerto.cerrada("sala caducada");
    expect(p.sesion.estado()).toEqual({ estado: "error", motivo: "sala caducada" });
    expect(p.enganchados.size).toBe(0);
  });

  it("reconectando conserva la url y los móviles", async () => {
    const p = montar();
    await p.sesion.encender();
    p.puerto.abierta("https://r/r/S#K");
    p.puerto.presencia("m1");
    p.puerto.reconectando();
    expect(p.sesion.estado()).toEqual({ estado: "reconectando", url: "https://r/r/S#K", moviles: 1 });
  });

  it("el tope de salida: una aprobación enorme no sale y se informa; una reemisión se recorta", async () => {
    const p = montar(600);
    await p.sesion.encender();
    p.puerto.abierta();
    p.puerto.presencia("m1");
    const [sumidero] = [...p.enganchados];
    sumidero!({ clase: "aprobacion", diff: "x".repeat(5000) } as never);
    const actos = Array.from({ length: 50 }, (_, i) => ({ tipo: "usuario", texto: `mensaje ${i}` }));
    sumidero!({ clase: "reemision", actos } as never);
    await Promise.resolve();
    expect(p.informados).toHaveLength(1);
    expect(p.informados[0]).toMatch(/aprobacion/);
    expect(p.puerto.enviados).toHaveLength(1);
    const enviado = p.puerto.enviados[0]!.mensaje as { clase: string; actos: { texto: string }[] };
    expect(enviado.clase).toBe("reemision");
    expect(enviado.actos.length).toBeGreaterThan(0);
    expect(enviado.actos.length).toBeLessThan(50);
    expect(enviado.actos.at(-1)!.texto).toBe("mensaje 49");
  });
});
