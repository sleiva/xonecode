import { describe, expect, it } from "vitest";
import { probarGranja, type Hablar, type ResultadoDeHablar } from "./granjaEnRed.js";

const HUELLA = Array.from({ length: 32 }, () => "AB").join(":");
const OTRA = Array.from({ length: 32 }, () => "CD").join(":");
const BASE = { direccion: "https://192.168.1.40:8090", token: "xfarm_AbCdEf123456" };

/** Un doble que contesta por ruta y apunta lo que le piden. */
function doble(respuestas: Record<string, ResultadoDeHablar>): { hablar: Hablar; pedidas: Parameters<Hablar>[0][] } {
  const pedidas: Parameters<Hablar>[0][] = [];
  return {
    pedidas,
    hablar: async (p) => {
      pedidas.push(p);
      const r = respuestas[p.ruta];
      if (r === undefined) throw new Error(`ruta no esperada ${p.ruta}`);
      return r;
    },
  };
}

const ESTADO = {
  devices: [
    {
      state: "ready",
      framework: { version: "5.0.6.4" },
      slots: [
        { number: 1, mine: true, owner: "ana", state: "running" },
        { number: 2, owner: null, state: "running" },
      ],
    },
  ],
};

describe("probarGranja", () => {
  it("sin dirección o sin token no habla con nadie", async () => {
    const { hablar, pedidas } = doble({});
    expect(await probarGranja({ token: BASE.token }, { hablar })).toEqual({ estado: "sin-configurar", falta: "direccion" });
    expect(await probarGranja({ direccion: BASE.direccion }, { hablar })).toEqual({ estado: "sin-configurar", falta: "token" });
    expect(pedidas).toHaveLength(0);
  });

  it("conectada: usuario, rol, resumen y la huella que contestó (la primera vez, para fijarla)", async () => {
    const { hablar, pedidas } = doble({
      "/api/me": { tipo: "respuesta", http: 200, cuerpo: { user: "ana", role: "normal", mustChange: false }, huella: HUELLA },
      "/api/state": { tipo: "respuesta", http: 200, cuerpo: ESTADO, huella: HUELLA },
    });
    expect(await probarGranja(BASE, { hablar })).toEqual({
      estado: "conectada",
      usuario: "ana",
      rol: "normal",
      resumen: { telefonos: 1, copias: { tuyas: 1, libres: 1 }, frameworks: ["5.0.6.4"] },
      huella: HUELLA,
    });
    // Sin huella aceptada todavía: no se pide ninguna en concreto.
    expect(pedidas.every((p) => p.huellaAceptada === undefined)).toBe(true);
  });

  it("con huella aceptada se exige esa, y una distinta para en la PRIMERA petición", async () => {
    const { hablar, pedidas } = doble({ "/api/me": { tipo: "huella-distinta", ahora: OTRA } });
    expect(await probarGranja({ ...BASE, huella: HUELLA }, { hablar })).toEqual({
      estado: "huella-distinta",
      aceptada: HUELLA,
      ahora: OTRA,
    });
    expect(pedidas).toEqual([{ base: BASE.direccion, token: BASE.token, huellaAceptada: HUELLA, ruta: "/api/me" }]);
  });

  it("401 es token rechazado; 403 con mustChange, contraseña pendiente", async () => {
    expect(await probarGranja(BASE, doble({ "/api/me": { tipo: "respuesta", http: 401, cuerpo: { error: "x" } } }))).toEqual({
      estado: "token-rechazado",
    });
    expect(
      await probarGranja(BASE, doble({ "/api/me": { tipo: "respuesta", http: 403, cuerpo: { mustChange: true } } })),
    ).toEqual({ estado: "debe-cambiar-contrasena" });
  });

  it("sin respuesta lleva el código de Node; algo que no es la granja, su código HTTP", async () => {
    expect(await probarGranja(BASE, doble({ "/api/me": { tipo: "sin-respuesta", codigo: "ECONNREFUSED" } }))).toEqual({
      estado: "no-responde",
      codigo: "ECONNREFUSED",
    });
    expect(await probarGranja(BASE, doble({ "/api/me": { tipo: "respuesta", http: 404, cuerpo: undefined } }))).toEqual({
      estado: "respuesta-inesperada",
      http: 404,
    });
    expect(
      await probarGranja(
        BASE,
        doble({
          "/api/me": { tipo: "respuesta", http: 200, cuerpo: { user: "ana", role: "admin" } },
          "/api/state": { tipo: "respuesta", http: 200, cuerpo: { otra: "cosa" } },
        }),
      ),
    ).toEqual({ estado: "respuesta-inesperada", http: 200 });
  });
});
