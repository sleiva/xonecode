import { describe, expect, it } from "vitest";
import { motivoDeNombreDeAvdInaceptable, motivoParaNoEliminarAvd, nombreSugerido } from "./reglasDeAvd.js";

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

describe("nombreSugerido: la base y un sufijo aleatorio", () => {
  it("es la base, un guion y cuatro letras o cifras, y es un nombre válido", () => {
    const n = nombreSugerido("pixel8", ["pixel8"]);
    expect(n).toMatch(/^pixel8-[a-z0-9]{4}$/);
    expect(motivoDeNombreDeAvdInaceptable(n, ["pixel8"])).toBeUndefined();
  });

  it("no repite uno que ya existe: prueba otro sufijo", () => {
    // El primer sufijo sale «aaaa» (azar 0), que ya existe; el segundo, «bbbb».
    const valores = [0, 0, 0, 0, 1 / 36, 1 / 36, 1 / 36, 1 / 36];
    let i = 0;
    expect(nombreSugerido("pixel8", ["pixel8", "pixel8-aaaa"], () => valores[i++] ?? 0)).toBe("pixel8-bbbb");
  });

  it("una base larga se recorta para que el nombre quepa en 64", () => {
    const n = nombreSugerido("x".repeat(70), []);
    expect(n.length).toBe(64);
    expect(motivoDeNombreDeAvdInaceptable(n, [])).toBeUndefined();
  });
});
