import { describe, expect, it, vi } from "vitest";
import { lanzarEnGranja } from "./lanzamientoEnGranja.js";
import type { GestorDeCopias } from "./releDeGranja.js";

const COPIA = { serial: "P3", numero: 1, telefono: "Pixel 3" };
const CONEXION = { direccion: "https://g:8090", token: "xfarm_AbCdEf123456" };

function copias(r: Awaited<ReturnType<GestorDeCopias["asegurarCopia"]>> = COPIA): GestorDeCopias {
  return { asegurarCopia: vi.fn(async () => r) } as unknown as GestorDeCopias;
}

describe("lanzarEnGranja", () => {
  it("pide la copia de la sesión, sube el paquete CON base y lanza por el canal de la sesión", async () => {
    const fases: string[] = [];
    const subir = vi.fn(async () => ({ ok: true as const }));
    const lanzar = vi.fn(async () => ({ viva: true }));
    const empaquetar = vi.fn(() => new Uint8Array([1, 2, 3]));
    const g = copias();
    const r = await lanzarEnGranja(
      { copias: g, conexion: () => CONEXION, canal: (s) => `ws://127.0.0.1:1/granja/${s}/hotswap`, empaquetar, subir, lanzar },
      { sesion: "hilo-1", raiz: "/p", app: "AppDeve" },
      { alFase: (f) => void fases.push(f) },
    ).terminado;
    expect(r.estado).toBe("ok");
    expect(g.asegurarCopia).toHaveBeenCalledWith("hilo-1");
    expect(empaquetar).toHaveBeenCalledWith("/p");
    expect(subir).toHaveBeenCalledWith(CONEXION, COPIA, new Uint8Array([1, 2, 3]), "AppDeve");
    expect(lanzar).toHaveBeenCalledWith("AppDeve", "ws://127.0.0.1:1/granja/hilo-1/hotswap");
    expect([...new Set(fases)]).toEqual(["comprobando", "empaquetando", "subiendo", "lanzando", "comprobando-arranque"]);
  });

  it("sin copia libre falla en `comprobando` con el motivo del gestor y no sube nada", async () => {
    const subir = vi.fn();
    const r = await lanzarEnGranja(
      { copias: copias({ motivo: "no hay ninguna copia libre en la granja ahora mismo" }), conexion: () => CONEXION, canal: () => "", subir, empaquetar: () => new Uint8Array() },
      { sesion: "h", raiz: "/p", app: "A" },
      { alFase: () => {} },
    ).terminado;
    expect(r).toMatchObject({ estado: "fallo", fase: "comprobando", motivo: "no hay ninguna copia libre en la granja ahora mismo" });
    expect(subir).not.toHaveBeenCalled();
  });

  it("una subida rechazada o una app que no contesta son `fallo` con su motivo; nunca lanza", async () => {
    const base = { copias: copias(), conexion: () => CONEXION, canal: () => "ws://x", empaquetar: () => new Uint8Array() };
    const rechazo = await lanzarEnGranja({ ...base, subir: async () => ({ ok: false, motivo: "la granja no aceptó la subida (500)" }) }, { sesion: "h", raiz: "/p", app: "A" }, { alFase: () => {} }).terminado;
    expect(rechazo).toMatchObject({ estado: "fallo", fase: "subiendo", motivo: "la granja no aceptó la subida (500)" });
    const muerta = await lanzarEnGranja({ ...base, subir: async () => ({ ok: true }), lanzar: async () => ({ viva: false, motivo: "App is not running" }) }, { sesion: "h", raiz: "/p", app: "A" }, { alFase: () => {} }).terminado;
    expect(muerta).toMatchObject({ estado: "fallo", fase: "comprobando-arranque", motivo: "App is not running" });
    const revienta = await lanzarEnGranja({ ...base, empaquetar: () => { throw new Error("EACCES"); } }, { sesion: "h", raiz: "/p", app: "A" }, { alFase: () => {} }).terminado;
    expect(revienta).toMatchObject({ estado: "fallo", motivo: "EACCES" });
  });

  it("cancelar entre pasos para antes de subir", async () => {
    const subir = vi.fn(async () => ({ ok: true as const }));
    let cancelar = (): void => {};
    const enCurso = lanzarEnGranja(
      { copias: copias(), conexion: () => CONEXION, canal: () => "ws://x", subir, empaquetar: () => (cancelar(), new Uint8Array()) },
      { sesion: "h", raiz: "/p", app: "A" },
      { alFase: () => {} },
    );
    cancelar = enCurso.cancelar;
    expect((await enCurso.terminado).estado).toBe("cancelada");
    expect(subir).not.toHaveBeenCalled();
  });
});
