import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ImagenRgba } from "../../core/compararCapturas.js";
import { geometriaDeCaptura, mismaImagen } from "./geometriaEnDisco.js";

/** Una imagen de 4×4 de un color. */
const lisa = (r: number, g = 0, b = 0): ImagenRgba => ({
  ancho: 4,
  alto: 4,
  datos: new Uint8Array(Array.from({ length: 16 }, () => [r, g, b, 255]).flat()),
});

/** Un decodificador de pruebas: los bytes del fichero dicen qué imagen es. */
const IMAGENES: Record<string, ImagenRgba> = { A: lisa(200), B: lisa(200), C: lisa(10, 200, 10) };
const decodificar = (bytes: Buffer): ImagenRgba => {
  const i = IMAGENES[bytes.toString()];
  if (i === undefined) throw new Error("no es una imagen");
  return i;
};

const montar = () => {
  const d = mkdtempSync(join(tmpdir(), "xc-geo-"));
  const artefactos = join(d, "artefactos");
  const hotswap = join(d, "hotswap");
  mkdirSync(artefactos);
  mkdirSync(hotswap);
  const geo = (captura: string) => ({ v: 1, captura, pantalla: { ancho: 4, alto: 4 }, arbol: [{ name: captura }] });
  writeFileSync(join(artefactos, "captura-1.jpg"), "A");
  writeFileSync(join(hotswap, "captura-1.geometria.json"), JSON.stringify(geo("captura-1.jpg")));
  writeFileSync(join(artefactos, "captura-2.jpg"), "C");
  writeFileSync(join(hotswap, "captura-2.geometria.json"), JSON.stringify(geo("captura-2.jpg")));
  return { artefactos, hotswap };
};

describe("la geometría de una captura: por nombre y, si se renombró, por sus píxeles", () => {
  it("por nombre, como siempre", async () => {
    const { artefactos, hotswap } = montar();
    const g = (await geometriaDeCaptura(hotswap, "captura-2.jpg", { carpetaDeArtefactos: artefactos, decodificar })) as { captura: string };
    expect(g.captura).toBe("captura-2.jpg");
  });

  it("una captura CONVERTIDA a otro nombre (sips … --out menu.png) encuentra la geometría de su original (Maset)", async () => {
    const { artefactos, hotswap } = montar();
    writeFileSync(join(artefactos, "menu_ronda7.png"), "B");
    const g = (await geometriaDeCaptura(hotswap, "/artefactos/menu_ronda7.png", { carpetaDeArtefactos: artefactos, decodificar })) as { captura: string };
    expect(g.captura).toBe("captura-1.jpg");
  });

  it("una de OTRO momento no: sin píxeles iguales no hay geometría, aunque sea la más reciente", async () => {
    const { artefactos, hotswap } = montar();
    IMAGENES["D"] = lisa(90, 90, 90);
    writeFileSync(join(artefactos, "otra.png"), "D");
    expect(await geometriaDeCaptura(hotswap, "otra.png", { carpetaDeArtefactos: artefactos, decodificar })).toBeUndefined();
  });

  it("sin búsqueda por contenido, solo el nombre (como antes)", async () => {
    const { artefactos, hotswap } = montar();
    writeFileSync(join(artefactos, "menu_ronda7.png"), "B");
    expect(await geometriaDeCaptura(hotswap, "menu_ronda7.png")).toBeUndefined();
  });

  it("mismaImagen: igual es igual; otro tamaño u otro color, no", () => {
    expect(mismaImagen(lisa(200), lisa(201))).toBe(true);
    // Un solo píxel distinto en 16 ya no es la misma (dos rondas de la misma pantalla con algo movido).
    const casi = lisa(200);
    casi.datos[0] = 0;
    expect(mismaImagen(lisa(200), casi)).toBe(false);
    expect(mismaImagen(lisa(200), lisa(10, 200, 10))).toBe(false);
    expect(mismaImagen(lisa(200), { ...lisa(200), ancho: 2, alto: 8 })).toBe(false);
  });
});
