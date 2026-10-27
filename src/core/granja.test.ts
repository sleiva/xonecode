import { describe, expect, it } from "vitest";
import {
  direccionDeGranja,
  esFormaDeTokenDeGranja,
  esOrigenDeDispositivos,
  motivoDePruebaDeGranja,
  resumenDeGranja,
  skillsSegunOrigen,
  usuarioDeGranja,
} from "./granja.js";

describe("direccionDeGranja", () => {
  it("una IP a secas se completa a https con el puerto de la granja", () => {
    expect(direccionDeGranja(" 192.168.1.40 ")).toEqual({ url: "https://192.168.1.40:8090" });
  });

  it("un host con puerto conserva su puerto", () => {
    expect(direccionDeGranja("granja.local:9000")).toEqual({ url: "https://granja.local:9000" });
  });

  it("una URL completa se queda como está, sin la barra final", () => {
    expect(direccionDeGranja("https://192.168.1.40:8090/")).toEqual({ url: "https://192.168.1.40:8090" });
  });

  it("con esquema y sin puerto NO se inventa el 8090: manda la URL", () => {
    expect(direccionDeGranja("https://granja.xone.es")).toEqual({ url: "https://granja.xone.es" });
  });

  it("http solo en loopback, que es como escucha la granja por omisión", () => {
    expect(direccionDeGranja("http://127.0.0.1:8090")).toEqual({ url: "http://127.0.0.1:8090" });
    expect(direccionDeGranja("http://192.168.1.40:8090")).toHaveProperty("motivo");
  });

  it("rechaza vacío, credenciales dentro y rutas detrás", () => {
    expect(direccionDeGranja("  ")).toHaveProperty("motivo");
    expect(direccionDeGranja("https://ana:clave@192.168.1.40:8090")).toHaveProperty("motivo");
    expect(direccionDeGranja("https://192.168.1.40:8090/api/state")).toHaveProperty("motivo");
    expect(direccionDeGranja("https://192.168.1.40:8090?x=1")).toHaveProperty("motivo");
    expect(direccionDeGranja("ftp://192.168.1.40")).toHaveProperty("motivo");
  });
});

describe("esFormaDeTokenDeGranja", () => {
  it("exige el prefijo xfarm_ y sin espacios", () => {
    expect(esFormaDeTokenDeGranja("xfarm_AbC123def456")).toBe(true);
    expect(esFormaDeTokenDeGranja("AbC123def456")).toBe(false);
    expect(esFormaDeTokenDeGranja("xfarm_ab c")).toBe(false);
    expect(esFormaDeTokenDeGranja("xfarm_")).toBe(false);
  });
});

describe("esOrigenDeDispositivos", () => {
  it("solo local o granja", () => {
    expect(esOrigenDeDispositivos("local")).toBe(true);
    expect(esOrigenDeDispositivos("granja")).toBe(true);
    expect(esOrigenDeDispositivos("Granja")).toBe(false);
    expect(esOrigenDeDispositivos(undefined)).toBe(false);
  });
});

describe("resumenDeGranja", () => {
  const telefono = (estado: string, version: string | null, slots: unknown[]) => ({
    serial: "S",
    state: estado,
    framework: { selected: null, version },
    slots,
  });

  it("cuenta teléfonos listos, copias tuyas y libres, y versiones sin repetir", () => {
    const estado = {
      devices: [
        telefono("ready", "5.0.6.4", [
          { number: 1, mine: true, owner: "ana", state: "running" },
          { number: 2, mine: false, owner: null, state: "running" },
          { number: 3, owner: null, state: "error" },
        ]),
        telefono("ready", "5.0.6.4", [{ number: 1, owner: null, state: "running" }]),
        telefono("installing", "5.0.6.3", [{ number: 1, owner: null, state: "running" }]),
      ],
    };
    expect(resumenDeGranja(estado)).toEqual({ telefonos: 2, copias: { tuyas: 1, libres: 2 }, frameworks: ["5.0.6.4"] });
  });

  it("la de otro (que solo ve un admin) no es ni tuya ni libre", () => {
    const estado = { devices: [telefono("ready", null, [{ number: 1, mine: false, owner: "luis", state: "running" }])] };
    expect(resumenDeGranja(estado)).toEqual({ telefonos: 1, copias: { tuyas: 0, libres: 0 }, frameworks: [] });
  });

  it("lo que no es una granja da undefined, y basura dentro no cuenta", () => {
    expect(resumenDeGranja(null)).toBeUndefined();
    expect(resumenDeGranja({ ok: true })).toBeUndefined();
    expect(resumenDeGranja({ devices: [null, 3, { state: "ready", slots: "no" }] })).toEqual({
      telefonos: 1,
      copias: { tuyas: 0, libres: 0 },
      frameworks: [],
    });
  });
});

describe("usuarioDeGranja", () => {
  it("lee usuario y rol; un rol desconocido es normal", () => {
    expect(usuarioDeGranja({ user: "ana", role: "admin" })).toEqual({ usuario: "ana", rol: "admin" });
    expect(usuarioDeGranja({ user: "ana", role: "raro" })).toEqual({ usuario: "ana", rol: "normal" });
    expect(usuarioDeGranja({ role: "admin" })).toBeUndefined();
  });
});

describe("motivoDePruebaDeGranja", () => {
  it("dice el código de Node sin la dirección", () => {
    expect(motivoDePruebaDeGranja({ estado: "no-responde", codigo: "ECONNREFUSED" })).toContain("(ECONNREFUSED)");
  });
  it("cada estado tiene su frase", () => {
    expect(motivoDePruebaDeGranja({ estado: "token-rechazado" })).toContain("401");
    expect(motivoDePruebaDeGranja({ estado: "sin-configurar", falta: "token" })).toContain("token");
    expect(motivoDePruebaDeGranja({ estado: "respuesta-inesperada", http: 404 })).toContain("404");
  });
});

describe("skillsSegunOrigen", () => {
  it("con la granja, xone-hotswap pasa a xone-granja en su sitio; sin ella, al revés", () => {
    expect(skillsSegunOrigen(["xone-development", "xone-hotswap", "archify"], "granja")).toEqual(["xone-development", "xone-granja", "archify"]);
    expect(skillsSegunOrigen(["xone-granja", "archify"], "local")).toEqual(["xone-hotswap", "archify"]);
    expect(skillsSegunOrigen(["xone-development"], "granja")).toEqual(["xone-development"]);
  });

  it("no repite: si el .md ya declaraba las dos, queda una", () => {
    expect(skillsSegunOrigen(["xone-hotswap", "xone-granja"], "granja")).toEqual(["xone-granja"]);
  });
});
