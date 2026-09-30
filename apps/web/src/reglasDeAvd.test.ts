import { describe, expect, it } from "vitest";
import { motivoParaNoEliminarAvd } from "./reglasDeAvd.js";

describe("motivoParaNoEliminarAvd: las negativas del servidor, aplicadas antes de enviar", () => {
  it("el único no se elimina, esté apagado o no", () => {
    expect(motivoParaNoEliminarAvd("pixel8", ["pixel8"], [])).toBe("es el único: siempre tiene que quedar al menos uno");
    expect(motivoParaNoEliminarAvd("pixel8", ["pixel8"], ["pixel8"])).toBe("es el único: siempre tiene que quedar al menos uno");
  });

  it("uno en marcha no se elimina: se apaga primero", () => {
    expect(motivoParaNoEliminarAvd("otro", ["pixel8", "otro"], ["otro"])).toBe("apágalo para eliminarlo");
  });

  it("con otro AVD y apagado, sí", () => {
    expect(motivoParaNoEliminarAvd("otro", ["pixel8", "otro"], ["pixel8"])).toBeUndefined();
  });
});
