import { describe, expect, it } from "vitest";
import { abrirPestana, pestanasVigentes, TOPE_DE_PESTANAS } from "./PestanasDelIde.js";

describe("las pestañas de editor", () => {
  it("abrir una que ya está no la mueve; una nueva entra al final", () => {
    const lista = [{ proyecto: "p", sesion: "a" }, { proyecto: "p", sesion: "b" }];
    expect(abrirPestana(lista, { proyecto: "p", sesion: "a" })).toEqual(lista);
    expect(abrirPestana(lista, { proyecto: "q", sesion: "c" })).toEqual([...lista, { proyecto: "q", sesion: "c" }]);
  });

  it("la sesión nueva, al recibir su id, sustituye en su sitio a la «nueva» de su proyecto", () => {
    const lista = [{ proyecto: "p", sesion: "a" }, { proyecto: "q" }, { proyecto: "p", sesion: "b" }];
    expect(abrirPestana(lista, { proyecto: "q", sesion: "z" })).toEqual([{ proyecto: "p", sesion: "a" }, { proyecto: "q", sesion: "z" }, { proyecto: "p", sesion: "b" }]);
  });

  it("con el tope lleno sale la más antigua", () => {
    const llena = Array.from({ length: TOPE_DE_PESTANAS }, (_, i) => ({ proyecto: "p", sesion: String(i) }));
    const tras = abrirPestana(llena, { proyecto: "p", sesion: "nueva" });
    expect(tras).toHaveLength(TOPE_DE_PESTANAS);
    expect(tras[0]).toEqual({ proyecto: "p", sesion: "1" });
  });

  it("se van la de una sesión borrada, la de un proyecto fuera del entorno y la «nueva» que ya no es la activa", () => {
    const proyectos = [{ id: "p", sesiones: [{ id: "a" }] }];
    const lista = [{ proyecto: "p", sesion: "a" }, { proyecto: "p", sesion: "borrada" }, { proyecto: "fuera", sesion: "x" }, { proyecto: "p" }];
    expect(pestanasVigentes(lista, proyectos, undefined)).toEqual([{ proyecto: "p", sesion: "a" }]);
    // La activa vale aunque el índice todavía no la traiga.
    expect(pestanasVigentes(lista, proyectos, { proyecto: "p" })).toEqual([{ proyecto: "p", sesion: "a" }, { proyecto: "p" }]);
  });
});
