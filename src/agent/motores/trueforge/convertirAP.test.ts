import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import { crearConvertirAP } from "./convertirAP.js";

/** Un proyecto con su app.xml y, en la carpeta de artefactos, la maqueta de Stitch con el ancho dado. */
function sesion(anchoDeLaMaqueta?: number) {
  const raiz = mkdtempSync(join(tmpdir(), "xc-convertir-"));
  writeFileSync(join(raiz, "app.xml"), '<app resolution-width="1080" resolution-height="1920"/>\n');
  const artefactos = mkdtempSync(join(tmpdir(), "xc-convertir-art-"));
  if (anchoDeLaMaqueta !== undefined) {
    mkdirSync(join(artefactos, "diseno"));
    const png = new PNG({ width: anchoDeLaMaqueta, height: 10 });
    writeFileSync(join(artefactos, "diseno", "screen.png"), PNG.sync.write(png));
  }
  return crearConvertirAP({ raiz, artefactos });
}

const medidas = [{ nombre: "icono", px: 24 }];

describe("convertir_a_p: el ancho de la maqueta", () => {
  it("lo saca de la imagen de la maqueta a 1×, y dice de dónde", async () => {
    const texto = await sesion(390).invoke({ medidas });
    expect(texto).toContain("/ 390 (ancho de la maqueta, el de la imagen /artefactos/diseno/screen.png)");
    expect(texto).toContain("| icono | 24 px | 66p |");
  });

  it("una imagen a 2× no se adivina: lo pide", async () => {
    const texto = await sesion(780).invoke({ medidas });
    expect(texto).toContain("No convierto");
    expect(texto).toContain("390 si está a 2×");
  });

  it("el que da el agente manda sobre la imagen", async () => {
    const texto = await sesion(780).invoke({ medidas, ancho_maqueta: 390 });
    expect(texto).toContain("lo indicaste tú");
    expect(texto).toContain("66p");
  });

  it("sin maqueta y sin ancho, lo pide", async () => {
    expect(await sesion().invoke({ medidas })).toContain("no encuentro la imagen de la maqueta");
  });
});
