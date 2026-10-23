import { describe, expect, it } from "vitest";
import type { AlcanceDeAprendizaje, Aprendizaje } from "../../core/aprendido.js";
import { atenderAprendido, type DiscoDeAprendido, type ListadoDeAprendido } from "./aprendidoDelPanel.js";

const clave: Aprendizaje = { tema: "cómo entrar en la app", texto: "usuario 08006, contraseña vacía", cuando: "2026-10-22T16:52:00.000Z", comoLoSe: "entré", quien: "developer-xone" };
const ruta: Aprendizaje = { tema: "abrir MenuLiquidacionesGeneral", texto: "entrar por EntryPoint", cuando: "2026-10-23T07:11:00.000Z", comoLoSe: "lo reproduje" };
const alfa: Aprendizaje = { tema: "alfa en SVG", texto: "#RRGGBBAA, al final", cuando: "2026-10-23T06:44:00.000Z", comoLoSe: "medido" };

function disco(): DiscoDeAprendido & { listas: Record<AlcanceDeAprendizaje, Aprendizaje[]> } {
  const listas: Record<AlcanceDeAprendizaje, Aprendizaje[]> = { proyecto: [clave, ruta], xone: [alfa] };
  return {
    listas,
    leer: (a) => listas[a].slice(),
    escribir: (a, l) => void (listas[a] = [...l]),
    nombresDelProyecto: () => ["Maset", "MenuLiquidacionesGeneral", "EntryPoint"],
  };
}

const listadoDe = (r: ReturnType<typeof atenderAprendido>): ListadoDeAprendido => {
  expect(r.estado).toBe(200);
  return r.cuerpo as ListadoDeAprendido;
};

describe("la pestaña «Lo aprendido», en el servidor", () => {
  it("listar trae los dos alcances, y lo sensible SIN su texto", () => {
    const l = listadoDe(atenderAprendido({ accion: "listar" }, disco()));
    expect(l.proyecto.map((e) => e.tema)).toEqual([clave.tema, ruta.tema]);
    expect(l.proyecto[0]).toMatchObject({ oculto: true });
    expect(JSON.stringify(l)).not.toContain("08006");
    expect(l.xone[0]).toMatchObject({ texto: alfa.texto });
  });

  it("«Ver» da el texto de UNA entrada, solo a quien lo pide", () => {
    expect(atenderAprendido({ accion: "ver", alcance: "proyecto", id: "cómo entrar en la app" }, disco())).toEqual({ estado: 200, cuerpo: { texto: clave.texto } });
    expect(atenderAprendido({ accion: "ver", alcance: "proyecto", id: "no-existe" }, disco()).estado).toBe(409);
  });

  it("guardar aplica las reglas de la tool, y lo de XOne que nombra el proyecto se niega", () => {
    const d = disco();
    expect(listadoDe(atenderAprendido({ accion: "guardar", alcance: "xone", id: "alfa en svg", tema: "alfa en SVG", texto: "va al final", comoLoSe: "medido en el aparato" }, d)).xone[0]).toMatchObject({ texto: "va al final" });
    expect(atenderAprendido({ accion: "guardar", alcance: "xone", id: "alfa en svg", tema: "alfa en SVG", texto: "x", comoLoSe: "" }, d)).toEqual({ estado: 409, cuerpo: { motivo: expect.stringContaining("falta cómo lo sabes") } });
    const r = atenderAprendido({ accion: "guardar", alcance: "xone", id: "alfa en svg", tema: "alfa en SVG", texto: "visto en EntryPoint", comoLoSe: "medido" }, d);
    expect(r).toEqual({ estado: 409, cuerpo: { motivo: expect.stringContaining("«EntryPoint»") } });
    expect(d.listas.xone[0]!.texto).toBe("va al final");
  });

  it("editar una oculta sin mandar su texto lo CONSERVA", () => {
    const d = disco();
    atenderAprendido({ accion: "guardar", alcance: "proyecto", id: "cómo entrar en la app", tema: "entrar en la app", comoLoSe: "lo probé" }, d);
    expect(d.listas.proyecto[0]).toMatchObject({ tema: "entrar en la app", texto: clave.texto, comoLoSe: "lo probé" });
  });

  it("borrar quita esa entrada y devuelve el listado", () => {
    const d = disco();
    expect(listadoDe(atenderAprendido({ accion: "borrar", alcance: "proyecto", id: "abrir menuliquidacionesgeneral" }, d)).proyecto).toHaveLength(1);
  });

  it("mover a XOne pasa por la guarda; mover al proyecto, no; un tema que ya está en el destino se niega", () => {
    const d = disco();
    expect(atenderAprendido({ accion: "mover", de: "proyecto", id: "abrir menuliquidacionesgeneral" }, d)).toEqual({ estado: 409, cuerpo: { motivo: expect.stringContaining("«MenuLiquidacionesGeneral»") } });
    expect(d.listas.proyecto).toHaveLength(2);
    const l = listadoDe(atenderAprendido({ accion: "mover", de: "xone", id: "alfa en svg" }, d));
    expect(l.xone).toEqual([]);
    expect(l.proyecto.map((e) => e.tema)).toContain("alfa en SVG");
    d.listas.xone = [alfa];
    expect(atenderAprendido({ accion: "mover", de: "xone", id: "alfa en svg" }, d)).toEqual({ estado: 409, cuerpo: { motivo: expect.stringContaining("ya hay una entrada con ese tema") } });
  });

  it("lo que no se entiende es una negativa", () => {
    for (const m of [{ accion: "borrar" }, { accion: "borrar", id: "x" }, { accion: "guardar", alcance: "xone", id: "x" }, { accion: "inventada", id: "x" }]) {
      expect(atenderAprendido(m, disco()).estado, JSON.stringify(m)).toBe(409);
    }
  });
});
