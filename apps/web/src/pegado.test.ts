import { describe, expect, it } from "vitest";
import { extensionDePegado, ficherosDelPegado, renombrarPegados } from "./pegado.js";

const png = () => new File([new Uint8Array([1, 2, 3])], "image.png", { type: "image/png" });

describe("ficherosDelPegado", () => {
  it("lee `files` cuando el navegador los trae", () => {
    const f = png();
    expect(ficherosDelPegado({ files: [f], items: [] })).toEqual([f]);
  });

  it("con `files` vacío cae a los `items` de clase fichero (así llegan algunos recortes de Windows)", () => {
    const f = png();
    const items = [
      { kind: "string", getAsFile: () => null },
      { kind: "file", getAsFile: () => f },
    ];
    expect(ficherosDelPegado({ files: [], items })).toEqual([f]);
  });

  it("un pegado de solo texto, o sin portapapeles, no trae ficheros", () => {
    expect(ficherosDelPegado({ files: [], items: [{ kind: "string", getAsFile: () => null }] })).toEqual([]);
    expect(ficherosDelPegado(null)).toEqual([]);
    expect(ficherosDelPegado(undefined)).toEqual([]);
  });

  it("un item de fichero que no se deja leer se descarta, no rompe", () => {
    expect(ficherosDelPegado({ files: [], items: [{ kind: "file", getAsFile: () => null }] })).toEqual([]);
  });
});

describe("extensionDePegado", () => {
  it("sale del tipo MIME, y sin tipo cae en `bin`", () => {
    expect(extensionDePegado("image/png")).toBe("png");
    expect(extensionDePegado("image/svg+xml")).toBe("svg");
    expect(extensionDePegado("")).toBe("bin");
  });
});

describe("renombrarPegados", () => {
  it("numera desde el primer «pegado-N» libre: pegar dos veces no choca con lo ya adjunto", () => {
    const nombres = renombrarPegados([png(), png()], new Set(["pegado-1.png"])).map((f) => f.name);
    expect(nombres).toEqual(["pegado-2.png", "pegado-3.png"]);
  });

  it("conserva el tipo y los bytes", async () => {
    const [f] = renombrarPegados([png()], new Set());
    expect(f!.type).toBe("image/png");
    expect(f!.size).toBe(3);
  });
});
