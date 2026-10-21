import { describe, expect, it } from "vitest";
import { axml } from "./__pruebas__/apk.js";
import { paqueteDelManifiesto } from "./manifiestoApk.js";

const CADENAS = ["versionCode", "package", "manifest", "com.xone.android.framework"];

describe("el paquete de un AndroidManifest binario", () => {
  it("con la tabla de cadenas en UTF-16", () => {
    const m = axml({ cadenas: CADENAS, elemento: "manifest", atributos: [{ nombre: "versionCode" }, { nombre: "package", crudo: "com.xone.android.framework" }] });
    expect(paqueteDelManifiesto(m)).toBe("com.xone.android.framework");
  });

  it("con la tabla en UTF-8", () => {
    const m = axml({ cadenas: CADENAS, utf8: true, elemento: "manifest", atributos: [{ nombre: "package", crudo: "com.xone.android.framework" }] });
    expect(paqueteDelManifiesto(m)).toBe("com.xone.android.framework");
  });

  it("con el valor solo TIPADO (sin crudo)", () => {
    const m = axml({ cadenas: CADENAS, elemento: "manifest", atributos: [{ nombre: "package", tipado: "com.xone.android.framework" }] });
    expect(paqueteDelManifiesto(m)).toBe("com.xone.android.framework");
  });

  it("el otro flavor se lee como lo que es", () => {
    const cadenas = ["package", "manifest", "com.xone.android.developer.framework"];
    const m = axml({ cadenas, elemento: "manifest", atributos: [{ nombre: "package", crudo: "com.xone.android.developer.framework" }] });
    expect(paqueteDelManifiesto(m)).toBe("com.xone.android.developer.framework");
  });

  it("lo que no se entiende no es un paquete", () => {
    expect(paqueteDelManifiesto(new Uint8Array(0))).toBeUndefined();
    expect(paqueteDelManifiesto(new TextEncoder().encode("<manifest package=\"x\"/>"))).toBeUndefined();
    const sinPaquete = axml({ cadenas: CADENAS, elemento: "manifest", atributos: [{ nombre: "versionCode" }] });
    expect(paqueteDelManifiesto(sinPaquete)).toBeUndefined();
    const otroElemento = axml({ cadenas: CADENAS, elemento: "package", atributos: [{ nombre: "package", crudo: "manifest" }] });
    expect(paqueteDelManifiesto(otroElemento)).toBeUndefined();
    // Truncado a la mitad: ni lanza ni inventa.
    const entero = axml({ cadenas: CADENAS, elemento: "manifest", atributos: [{ nombre: "package", crudo: "com.xone.android.framework" }] });
    expect(paqueteDelManifiesto(entero.slice(0, 40))).toBeUndefined();
  });
});
