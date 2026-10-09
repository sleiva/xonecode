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
      throw new Error("ECONNREFUSED");
    };
    await p.sesion.encender();
    expect(p.sesion.estado()).toEqual({ estado: "error", motivo: "ECONNREFUSED" });
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
