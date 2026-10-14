import { describe, it, expect } from "vitest";
import { resaltesDelTramo, trozosDelCambio } from "./cambioEnLinea.js";

describe("trozosDelCambio", () => {
  it("marca solo lo de en medio, a límite de palabra", () => {
    const { antes, despues } = trozosDelCambio('<prop name="MAP_VERSIONAPP" fontsize="12"/>', '<prop name="MAP_VERSIONAPP" fontsize="14"/>');
    expect(antes).toEqual([
      { texto: '<prop name="MAP_VERSIONAPP" fontsize="', cambia: false },
      { texto: "12", cambia: true },
      { texto: '"/>', cambia: false },
    ]);
    expect(despues.find((t) => t.cambia)?.texto).toBe("14");
  });

  it("no parte una palabra por la mitad", () => {
    const { despues } = trozosDelCambio("class=textoNegro", "class=textoBlanco");
    expect(despues.find((t) => t.cambia)?.texto).toBe("textoBlanco");
  });

  it("lo que solo se añade al final es el cambio entero", () => {
    expect(trozosDelCambio("a b", "a b c").despues).toEqual([
      { texto: "a b", cambia: false },
      { texto: " c", cambia: true },
    ]);
  });
});

describe("resaltesDelTramo", () => {
  it("empareja quitadas con añadidas por orden; una añadida sin pareja no se resalta por dentro", () => {
    const resaltes = resaltesDelTramo([
      { tipo: "igual", texto: "x" },
      { tipo: "quitado", texto: "a=1" },
      { tipo: "anadido", texto: "a=2" },
      { tipo: "anadido", texto: "nueva" },
    ]);
    expect([...resaltes.keys()]).toEqual([1, 2]);
    expect(resaltes.get(2)?.find((t) => t.cambia)?.texto).toBe("2");
  });

  it("dos líneas que apenas se parecen no se resaltan por dentro", () => {
    expect(resaltesDelTramo([
      { tipo: "quitado", texto: "</frame>" },
      { tipo: "anadido", texto: '<prop name="SALIR" type="B"/>' },
    ]).size).toBe(0);
  });
});
