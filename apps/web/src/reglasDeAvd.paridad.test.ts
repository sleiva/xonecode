/**
 * Las reglas del cliente (`reglasDeAvd.ts`, `store.ts#avdsDelCable`) son una REDECLARACIÓN de las
 * del host (`core/puertosDeAvd.ts`, `core/settings.ts#validarAvds`): el cliente no importa de
 * `src/` en producción. Este test sí importa de `core/` (es puro) para que diverjan en rojo, no en
 * un bug mudo: comparan RESULTADO, y el texto del motivo.
 */
import { describe, expect, it } from "vitest";
import { motivoDeNombreDeAvdInaceptable as nombreCore, motivoDePuertoInaceptable as puertoCore } from "../../../src/core/puertosDeAvd.js";
import { validarSettings } from "../../../src/core/settings.js";
import { motivoDeNombreDeAvdInaceptable as nombreCliente, motivoDePuertoInaceptable as puertoCliente } from "./reglasDeAvd.js";
import { avdsDelCable } from "./store.js";

const ajustes = { avds: { pixel8: { puerto: 8443 }, otro: { puerto: 8444 } } };
const existentes = ["pixel8", "otro"];

describe("reglasDeAvd.ts dice lo mismo que core/puertosDeAvd.ts", () => {
  it.each([
    ["vacío", ""],
    ["largo 65", "a".repeat(65)],
    ["largo 64", "a".repeat(64)],
    ["-x", "-x"],
    ["a b", "a b"],
    ["válido", "tienda_2.1-x"],
    ["existente", "pixel8"],
  ])("nombre %s", (_c, nombre) => {
    expect(nombreCliente(nombre, existentes)).toBe(nombreCore(nombre, existentes));
  });

  it.each([1023, 1024, 5553, 5554, 5585, 5586, 65535, 65536, 8443.5, 8444, 8443, 9001, Number.NaN, -1])("puerto %s", (puerto) => {
    for (const avd of ["pixel8", "nuevo"]) {
      expect(puertoCliente(puerto, avd, ajustes), `${puerto} en ${avd}`).toBe(puertoCore(puerto, avd, ajustes));
    }
  });
});

describe("store.ts#avdsDelCable filtra como core/settings.ts#validarAvds", () => {
  it("mismo resultado para válidos e inválidos", () => {
    const entrada = {
      pixel8: { puerto: 8443, sinVentana: true },
      "-x": { puerto: 9000 },
      "a b": { puerto: 9001 },
      bajo: { puerto: 80 },
      alto: { puerto: 65536 },
      cadena: { puerto: "8444" },
      decimal: { puerto: 8443.5 },
      falso: { sinVentana: "true", puerto: 9002 },
      procedencia: { copiaDe: "pixel8", clon: true },
      soloCopia: { copiaDe: "pixel8" },
      copiaMala: { copiaDe: "a b", clon: true },
      clonSuelto: { clon: true },
      clonFalso: { copiaDe: "pixel8", clon: "true" },
      vacio: {},
      nulo: null,
      numero: 3,
    };
    const enCore = validarSettings({ dispositivos: { avds: entrada } }).settings.dispositivos?.avds;
    expect(avdsDelCable(entrada)).toEqual(enCore);
    expect(avdsDelCable({})).toBeUndefined();
    expect(avdsDelCable({ "-x": { puerto: 9000 } })).toBeUndefined();
  });
});
