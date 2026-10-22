import { describe, expect, it } from "vitest";
import { PNG } from "pngjs";
import { ANCHO_MINIMO_DE_MAQUETA, maquetaParaElModelo } from "./maquetaParaElModelo.js";
import { decodificarImagen } from "./decodificarImagen.js";

const png = (ancho: number, alto: number) => {
  const p = new PNG({ width: ancho, height: alto });
  p.data.fill(200);
  return { base64: PNG.sync.write(p).toString("base64"), mime: "image/png" };
};

describe("la maqueta que ve el modelo", () => {
  it("una pequeña (la de Stitch a 390 px) se amplía hasta el ancho mínimo, como PNG", () => {
    // Medido en Maset (Incidencias): a 390 px la crítica no vio una píldora rosa pálida.
    const r = maquetaParaElModelo(png(390, 884));
    const img = decodificarImagen(Buffer.from(r.base64, "base64"));
    expect(r.mime).toBe("image/png");
    expect(img.ancho).toBeGreaterThanOrEqual(ANCHO_MINIMO_DE_MAQUETA);
    expect(img.alto).toBe(884 * (img.ancho / 390));
  });

  it("una grande se manda tal cual, y lo que no se puede leer también", () => {
    const grande = png(ANCHO_MINIMO_DE_MAQUETA, 100);
    expect(maquetaParaElModelo(grande)).toBe(grande);
    const rota = { base64: Buffer.from("no es una imagen").toString("base64"), mime: "image/png" };
    expect(maquetaParaElModelo(rota)).toBe(rota);
  });
});
