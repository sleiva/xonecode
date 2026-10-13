/**
 * El túnel con un SDK de ngrok FALSO: `forward` devuelve un túnel con su dirección, falla con un `errorCode` como el SDK
 * real (`err.errorCode = "ERR_NGROK_xxx"`), tarda más que el tope, o avisa de que perdió la conexión por
 * `onStatusChange`. Ni ngrok, ni red, ni el paquete: el puente es un módulo falso que apunta si se cerró.
 */
import { describe, expect, it } from "vitest";
import { MOTIVOS_DEL_TUNEL } from "../../core/tunel.js";
import type { SdkDeNgrok } from "./ngrokEnMaquina.js";
import type { ModuloServidorRemoto } from "./puenteWebSocket.js";
import { crearTunelNgrok, type DependenciasDelTunel } from "./tunelNgrok.js";

function puenteFalso(orden: string[] = []) {
  const registro = { arrancados: 0, cerrados: 0, puertos: [] as number[] };
  const modulo: ModuloServidorRemoto = {
    async arrancarServidor({ puerto }) {
      registro.arrancados += 1;
      registro.puertos.push(puerto);
      return {
        urlHttp: "http://127.0.0.1:45678",
        urlWs: "ws://127.0.0.1:45678/ws",
        cerrar: async () => {
          registro.cerrados += 1;
          orden.push("puente");
        },
      };
    },
  };
  return { registro, modulo };
}

/** Un SDK falso. `responder` decide qué hace `forward`; lo que se le pidió y los cierres quedan apuntados. */
function sdkFalso(responder: "abre" | { errorCode: string } | "nunca" = "abre", orden: string[] = []) {
  const registro = {
    pedidos: [] as Parameters<SdkDeNgrok["forward"]>[0][],
    cerrados: 0,
    estado: undefined as ((estado: string) => void) | undefined,
  };
  const sdk: SdkDeNgrok = {
    forward: async (config) => {
      registro.pedidos.push(config);
      registro.estado = config.onStatusChange;
      if (responder === "nunca") return new Promise(() => {});
      if (responder !== "abre") throw Object.assign(new Error("authentication failed: tu@correo.es token abc123def456"), { errorCode: responder.errorCode });
      return {
        url: () => "https://1a2b-203-0-113-7.ngrok-free.app",
        close: async () => {
          registro.cerrados += 1;
          orden.push("tunel");
        },
      };
    },
  };
  return { registro, sdk };
}

function deps(sdk: SdkDeNgrok | undefined, modulo: ModuloServidorRemoto | undefined, extra: DependenciasDelTunel = {}): DependenciasDelTunel {
  return { cargarSdk: async () => sdk, cargarServidor: async () => modulo, authtoken: () => "abc123def456ghi", ...extra };
}

describe("el túnel de ngrok, con el SDK", () => {
  it("abre hacia el puente con el authtoken, devuelve wss://…/ws, y cerrar cierra el túnel ANTES que el puente", async () => {
    const orden: string[] = [];
    const p = puenteFalso(orden);
    const s = sdkFalso("abre", orden);
    const t = await crearTunelNgrok(deps(s.sdk, p.modulo)).abrir({});
    expect(t.servidor).toBe("wss://1a2b-203-0-113-7.ngrok-free.app/ws");
    expect(s.registro.pedidos[0]).toMatchObject({ addr: "127.0.0.1:45678", authtoken: "abc123def456ghi" });
    expect(s.registro.pedidos[0]).not.toHaveProperty("domain");
    expect(p.registro.puertos).toEqual([0]);
    await t.cerrar();
    expect(orden).toEqual(["tunel", "puente"]);
    await t.cerrar();
    expect(s.registro.cerrados).toBe(1);
  });

  it("con dominio, se lo pide al SDK", async () => {
    const s = sdkFalso();
    const t = await crearTunelNgrok(deps(s.sdk, puenteFalso().modulo)).abrir({ dominio: "mi-app.ngrok.app" });
    expect(s.registro.pedidos[0]).toMatchObject({ domain: "mi-app.ngrok.app" });
    await t.cerrar();
  });

  it("un error del SDK se clasifica por su CÓDIGO, con texto FIJO (nunca el del error), y el puente se cierra", async () => {
    for (const [codigo, motivo] of [
      ["ERR_NGROK_105", MOTIVOS_DEL_TUNEL.autenticacion],
      ["ERR_NGROK_313", MOTIVOS_DEL_TUNEL.dominio],
      ["ERR_NGROK_108", MOTIVOS_DEL_TUNEL.otraSesion],
      ["ERR_NGROK_9999", MOTIVOS_DEL_TUNEL.otro],
    ] as const) {
      const p = puenteFalso();
      const error = await crearTunelNgrok(deps(sdkFalso({ errorCode: codigo }).sdk, p.modulo)).abrir({}).catch((e: Error) => e);
      expect((error as Error).message).toBe(motivo);
      expect((error as Error).message).not.toContain("correo");
      expect(p.registro.cerrados).toBe(1);
    }
  });

  it("un SDK que no contesta: tiempo agotado, y el puente se cierra", async () => {
    const p = puenteFalso();
    const error = await crearTunelNgrok(deps(sdkFalso("nunca").sdk, p.modulo, { topeMs: 30 })).abrir({}).catch((e: Error) => e);
    expect((error as Error).message).toBe(MOTIVOS_DEL_TUNEL.sinDireccion);
    expect(p.registro.cerrados).toBe(1);
  });

  it("perder la conexión NO es caída si el SDK reconecta a tiempo; si no, alCaer UNA vez, con el puente ya cerrado", async () => {
    const p = puenteFalso();
    const s = sdkFalso();
    const t = await crearTunelNgrok(deps(s.sdk, p.modulo, { esperaDeReconexionMs: 30 })).abrir({});
    const avisos: string[] = [];
    t.alCaer((m) => {
      expect(p.registro.cerrados).toBe(1);
      avisos.push(m);
    });
    t.alCaer(() => {
      throw new Error("un oyente que lanza");
    });
    t.alCaer((m) => avisos.push(`otro: ${m}`));
    s.registro.estado!("closed");
    s.registro.estado!("connected");
    await new Promise((r) => setTimeout(r, 60));
    expect(avisos).toEqual([]);
    s.registro.estado!("closed");
    await new Promise((r) => setTimeout(r, 60));
    expect(avisos).toEqual([MOTIVOS_DEL_TUNEL.seCerro, `otro: ${MOTIVOS_DEL_TUNEL.seCerro}`]);
    expect(s.registro.cerrados).toBe(1);
    // Y quien se apunta tarde, también se entera.
    const tarde: string[] = [];
    t.alCaer((m) => tarde.push(m));
    await new Promise((r) => setTimeout(r, 0));
    expect(tarde).toEqual([MOTIVOS_DEL_TUNEL.seCerro]);
  });

  it("cerrar a propósito no avisa de ninguna caída", async () => {
    const s = sdkFalso();
    const t = await crearTunelNgrok(deps(s.sdk, puenteFalso().modulo, { esperaDeReconexionMs: 10 })).abrir({});
    const avisos: string[] = [];
    t.alCaer((m) => avisos.push(m));
    s.registro.estado!("closed");
    await t.cerrar();
    await new Promise((r) => setTimeout(r, 40));
    expect(avisos).toEqual([]);
  });
});

describe("el túnel, antes de abrir nada", () => {
  it("sin el SDK cargable: el motivo de que no carga, y el puente ni arranca", async () => {
    const p = puenteFalso();
    await expect(crearTunelNgrok(deps(undefined, p.modulo)).abrir({})).rejects.toThrow(MOTIVOS_DEL_TUNEL.noInstalado);
    expect(p.registro.arrancados).toBe(0);
  });
  it("sin authtoken: el de autenticación, sin llamar al SDK", async () => {
    const s = sdkFalso();
    await expect(crearTunelNgrok(deps(s.sdk, puenteFalso().modulo, { authtoken: () => undefined })).abrir({})).rejects.toThrow(MOTIVOS_DEL_TUNEL.autenticacion);
    expect(s.registro.pedidos).toEqual([]);
  });
  it("un paquete sin el puente: el motivo de versión vieja", async () => {
    await expect(crearTunelNgrok(deps(sdkFalso().sdk, undefined)).abrir({})).rejects.toThrow(MOTIVOS_DEL_TUNEL.paqueteViejo);
  });
  it("un puente que no arranca: su motivo fijo, sin el error de Node", async () => {
    const modulo: ModuloServidorRemoto = {
      async arrancarServidor() {
        throw new Error("EADDRINUSE /Users/alguien");
      },
    };
    await expect(crearTunelNgrok(deps(sdkFalso().sdk, modulo)).abrir({})).rejects.toThrow(MOTIVOS_DEL_TUNEL.puente);
  });
  it("un dominio sin forma no llega al SDK", async () => {
    const s = sdkFalso();
    await expect(crearTunelNgrok(deps(s.sdk, puenteFalso().modulo)).abrir({ dominio: "https://x" })).rejects.toThrow(MOTIVOS_DEL_TUNEL.dominio);
    expect(s.registro.pedidos).toEqual([]);
  });
});
