import { describe, expect, it, vi } from "vitest";
import { PuenteRemotoEnMemoria, TunelEnMemoria, type TunelPort } from "../../core/ports.js";
import { MOTIVOS_DEL_TUNEL } from "../../core/tunel.js";
import { crearSesionRemota, type EstadoDeSesionRemota } from "./puenteRemoto.js";
import type { Sumidero } from "./transporte.js";

function montar(topeDeSalida?: number, tunel?: () => TunelPort | undefined) {
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
    ...(tunel === undefined
      ? {}
      : {
          tunel: () => {
            const t = tunel();
            return t === undefined ? undefined : { abrir: () => t.abrir({}) };
          },
        }),
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

  it("un relé inalcanzable: reconectando ANTES de abrirse se anuncia, sin url, y se puede apagar", async () => {
    const p = montar();
    await p.sesion.encender();
    p.puerto.reconectando();
    expect(p.sesion.estado()).toEqual({ estado: "reconectando", moviles: 0 });
    expect(p.estados.at(-1)).toEqual({ estado: "reconectando", moviles: 0 });
    p.sesion.apagar();
    expect(p.sesion.estado()).toEqual({ estado: "apagada" });
    expect(p.puerto.cerrados).toBe(1);
  });

  it("la clase de un mensaje rechazado solo llega al terminal si es un nombre limpio", async () => {
    const p = montar();
    await p.sesion.encender();
    p.puerto.abierta();
    p.puerto.presencia("m1");
    p.puerto.delMovil("m1", { clase: "\u001b]52;c;cGlzdA==\u0007" });
    p.puerto.delMovil("m1", { clase: "x".repeat(33) });
    p.puerto.delMovil("m1", { clase: "remoto.estado" });
    expect(p.informados).toHaveLength(3);
    expect(p.informados[0]).toContain("desconocida");
    expect(p.informados[0]).not.toContain("\u001b");
    expect(p.informados[1]).toContain("desconocida");
    expect(p.informados[2]).toContain("clase remoto.estado");
  });

  it("revocar no anuncia el apagado de en medio: el diálogo de la consola sigue abierto", async () => {
    const p = montar();
    await p.sesion.encender();
    p.puerto.abierta("https://r/r/S#K");
    const desde = p.estados.length;
    await p.sesion.revocar();
    p.puerto.abierta("https://r/r/T#L");
    expect(p.estados.slice(desde).map((e) => e.estado)).toEqual(["abriendo", "activa"]);
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

  describe("por el túnel (vía ngrok)", () => {
    function conTunel(via: () => "ngrok" | "servidor" = () => "ngrok") {
      const tunel = new TunelEnMemoria();
      const p = montar(undefined, () => (via() === "ngrok" ? tunel : undefined));
      return { ...p, tunel };
    }

    it("encender abre el túnel y el puente va a SU dirección", async () => {
      const p = conTunel();
      await p.sesion.encender();
      expect(p.tunel.aperturas).toHaveLength(1);
      expect(p.puerto.aperturas).toEqual(["wss://tunel.example/ws"]);
      p.puerto.abierta("https://tunel.example/r/S#K");
      expect(p.sesion.estado()).toEqual({ estado: "activa", url: "https://tunel.example/r/S#K", moviles: 0 });
    });

    it("sin túnel (vía servidor) no se toca: el puente va al servidor de siempre", async () => {
      const p = conTunel(() => "servidor");
      await p.sesion.encender();
      expect(p.tunel.aperturas).toHaveLength(0);
      expect(p.puerto.aperturas).toEqual(["ws://127.0.0.1:8787/ws"]);
    });

    it("apagar cierra el túnel, y la promesa espera a que esté cerrado", async () => {
      const p = conTunel();
      await p.sesion.encender();
      p.puerto.abierta();
      await p.sesion.apagar();
      expect(p.tunel.cerrados).toBe(1);
      expect(p.puerto.cerrados).toBe(1);
      expect(p.sesion.estado()).toEqual({ estado: "apagada" });
    });

    it("apagar deja que el canal termine de cerrarse ANTES de matar el túnel: el «cerrada» llega al móvil por él", async () => {
      const p = conTunel();
      let soltar!: () => void;
      const abrirReal = p.puerto.abrir.bind(p.puerto);
      p.puerto.abrir = async (servidor, escuchas) => {
        const c = await abrirReal(servidor, escuchas);
        return {
          ...c,
          cerrar: () => {
            void c.cerrar();
            return new Promise<void>((r) => (soltar = r));
          },
        };
      };
      await p.sesion.encender();
      p.puerto.abierta();
      let apagada = false;
      const apagado = p.sesion.apagar().then(() => void (apagada = true));
      for (let i = 0; i < 5; i++) await Promise.resolve();
      expect(p.sesion.estado()).toEqual({ estado: "apagada" });
      expect(p.tunel.cerrados).toBe(0);
      expect(apagada).toBe(false);
      soltar();
      await apagado;
      expect(p.tunel.cerrados).toBe(1);
    });

    it("revocar CONSERVA el túnel: no se abre otro ngrok, la sala sí es nueva", async () => {
      const p = conTunel();
      await p.sesion.encender();
      p.puerto.abierta("https://tunel.example/r/S#K");
      await p.sesion.revocar();
      expect(p.tunel.aperturas).toHaveLength(1);
      expect(p.tunel.cerrados).toBe(0);
      expect(p.puerto.aperturas).toEqual(["wss://tunel.example/ws", "wss://tunel.example/ws"]);
      p.puerto.abierta("https://tunel.example/r/T#L");
      expect(p.sesion.estado()).toMatchObject({ estado: "activa", url: "https://tunel.example/r/T#L" });
    });

    it("tras revocar, la caída del túnel (que es el MISMO) sigue llegando", async () => {
      const p = conTunel();
      await p.sesion.encender();
      p.puerto.abierta();
      await p.sesion.revocar();
      p.puerto.abierta();
      p.puerto.presencia("m1");
      p.tunel.caer(MOTIVOS_DEL_TUNEL.seCerro);
      expect(p.sesion.estado()).toEqual({ estado: "error", motivo: MOTIVOS_DEL_TUNEL.seCerro });
      expect(p.enganchados.size).toBe(0);
      expect(p.puerto.canales.at(-1)?.cerrado).toBe(true);
    });

    it("la caída del túnel cierra el canal y deja el error con el motivo fijo", async () => {
      const p = conTunel();
      await p.sesion.encender();
      p.puerto.abierta();
      p.puerto.presencia("m1");
      p.tunel.caer(MOTIVOS_DEL_TUNEL.seCerro);
      expect(p.sesion.estado()).toEqual({ estado: "error", motivo: MOTIVOS_DEL_TUNEL.seCerro });
      expect(p.puerto.canales.at(-1)?.cerrado).toBe(true);
      expect(p.enganchados.size).toBe(0);
    });

    it("una caída con un texto que NO es nuestro no cruza: sale el genérico", async () => {
      const p = conTunel();
      await p.sesion.encender();
      p.puerto.abierta();
      p.tunel.caer("ERR_NGROK_4018 authtoken 2abcDEF… en /Users/x/.config/ngrok/ngrok.yml");
      expect(p.sesion.estado()).toEqual({ estado: "error", motivo: MOTIVOS_DEL_TUNEL.otro });
    });

    it("un fallo al abrir el túnel: error con su motivo si es nuestro, y el puente ni se abre", async () => {
      const p = conTunel();
      p.tunel.fallo = MOTIVOS_DEL_TUNEL.autenticacion;
      await p.sesion.encender();
      expect(p.sesion.estado()).toEqual({ estado: "error", motivo: MOTIVOS_DEL_TUNEL.autenticacion });
      expect(p.puerto.aperturas).toEqual([]);
      p.tunel.fallo = "spawn /opt/homebrew/bin/ngrok EACCES";
      await p.sesion.encender();
      expect(p.sesion.estado()).toEqual({ estado: "error", motivo: MOTIVOS_DEL_TUNEL.otro });
    });

    it("un túnel que llega TARDE (se apagó mientras abría) se cierra y no abre el puente", async () => {
      let soltar!: () => void;
      const real = new TunelEnMemoria();
      const lento: TunelPort = {
        abrir: async (o) => {
          await new Promise<void>((r) => (soltar = r));
          return real.abrir(o);
        },
      };
      const p = montar(undefined, () => lento);
      const encendido = p.sesion.encender();
      await Promise.resolve();
      await Promise.resolve();
      expect(p.sesion.estado()).toEqual({ estado: "abriendo" });
      void p.sesion.apagar();
      soltar();
      await encendido;
      await Promise.resolve();
      expect(real.cerrados).toBe(1);
      expect(p.puerto.aperturas).toEqual([]);
      expect(p.sesion.estado()).toEqual({ estado: "apagada" });
    });

    it("apagar mientras ngrok arranca y volver a encender: NO hay dos ngrok a la vez", async () => {
      const real = new TunelEnMemoria();
      const sueltas: (() => void)[] = [];
      const enVuelo = { ahora: 0, maximo: 0 };
      const lento: TunelPort = {
        abrir: async (o) => {
          enVuelo.ahora += 1;
          enVuelo.maximo = Math.max(enVuelo.maximo, enVuelo.ahora);
          await new Promise<void>((r) => sueltas.push(r));
          const t = await real.abrir(o);
          return {
            ...t,
            cerrar: async () => {
              enVuelo.ahora -= 1;
              await t.cerrar();
            },
          };
        },
      };
      const p = montar(undefined, () => lento);
      const primero = p.sesion.encender();
      await Promise.resolve();
      await Promise.resolve();
      void p.sesion.apagar();
      const segundo = p.sesion.encender();
      for (let i = 0; i < 5; i++) await Promise.resolve();
      // El segundo espera al primero: sigue habiendo UN arranque de ngrok.
      expect(sueltas).toHaveLength(1);
      expect(p.sesion.estado()).toEqual({ estado: "abriendo" });
      sueltas[0]!();
      await primero;
      await vi.waitFor(() => expect(sueltas).toHaveLength(2));
      // El del primero ya se cerró antes de lanzar el segundo.
      expect(real.cerrados).toBe(1);
      sueltas[1]!();
      await segundo;
      expect(enVuelo.maximo).toBe(1);
      expect(p.puerto.aperturas).toEqual(["wss://tunel.example/ws"]);
      expect(p.sesion.estado()).toEqual({ estado: "abriendo" });
    });

    it("encender justo tras apagar un túnel ACTIVO espera a que el viejo termine de cerrarse", async () => {
      const real = new TunelEnMemoria();
      const cierres: (() => void)[] = [];
      const vivos = { ahora: 0, maximo: 0 };
      const lentoAlCerrar: TunelPort = {
        abrir: async (o) => {
          const t = await real.abrir(o);
          vivos.ahora += 1;
          vivos.maximo = Math.max(vivos.maximo, vivos.ahora);
          return {
            ...t,
            cerrar: async () => {
              await new Promise<void>((r) => cierres.push(r));
              vivos.ahora -= 1;
              await t.cerrar();
            },
          };
        },
      };
      const p = montar(undefined, () => lentoAlCerrar);
      await p.sesion.encender();
      p.puerto.abierta("https://tunel.example/r/S#K");
      const apagado = p.sesion.apagar();
      const segundo = p.sesion.encender();
      for (let i = 0; i < 5; i++) await Promise.resolve();
      // El ngrok viejo sigue cerrándose: el nuevo NO se lanza aún (ERR_NGROK_108).
      expect(real.aperturas).toHaveLength(1);
      expect(p.sesion.estado()).toEqual({ estado: "abriendo" });
      cierres[0]!();
      await apagado;
      await segundo;
      expect(real.aperturas).toHaveLength(2);
      expect(vivos.maximo).toBe(1);
      expect(p.puerto.aperturas).toEqual(["wss://tunel.example/ws", "wss://tunel.example/ws"]);
    });

    it("si el puente falla tras abrir el túnel, el túnel se cierra", async () => {
      const tunel = new TunelEnMemoria();
      const p = montar(undefined, () => tunel);
      p.puerto.abrir = async () => {
        throw Object.assign(new Error("connect ECONNREFUSED 127.0.0.1"), { code: "ECONNREFUSED" });
      };
      await p.sesion.encender();
      expect(p.sesion.estado()).toEqual({ estado: "error", motivo: "ECONNREFUSED" });
      expect(tunel.cerrados).toBe(1);
    });

    it("un canal que se cierra solo también cierra el túnel", async () => {
      const p = conTunel();
      await p.sesion.encender();
      p.puerto.abierta();
      p.puerto.cerrada("sala caducada");
      await Promise.resolve();
      expect(p.tunel.cerrados).toBe(1);
    });

    it("si al encender ya no toca túnel (la vía cambió), el que quedaba de un revocar se cierra", async () => {
      let via: "ngrok" | "servidor" = "ngrok";
      const p = conTunel(() => via);
      await p.sesion.encender();
      p.puerto.abierta();
      via = "servidor";
      await p.sesion.revocar();
      expect(p.tunel.cerrados).toBe(1);
      expect(p.puerto.aperturas.at(-1)).toBe("ws://127.0.0.1:8787/ws");
    });
  });
});
