import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { geometriaDeCaptura, nombreDeGeometria } from "./geometriaEnDisco.js";

/**
 * El nombre de la geometría vive en DOS sitios: lo escribe el script de la skill
 * (`skills/xone-hotswap/lib/geometria.mjs`, que corre en la shell del agente) y lo lee el crítico del host
 * (`geometriaEnDisco.ts`). Este test los ata: si uno cambia y el otro no, el crítico dejaría de encontrar
 * la geometría de cada captura sin dar ningún error.
 */
const skill = (): Promise<{
  nombreDeGeometria: (n: string) => string;
  barrasDeDumpsys: (s: string) => unknown;
  medidasDeImagen: (b: Buffer) => unknown;
  esCapturaDeUnControl: (pantalla: { ancho: number; alto: number }, arbol: unknown, barras?: unknown) => boolean;
}> => import(pathToFileURL(resolve(__dirname, "../../../skills/xone-hotswap/lib/geometria.mjs")).href);

describe("la geometría guardada con cada captura", () => {
  it("el script y el host nombran IGUAL el fichero de geometría", async () => {
    const s = await skill();
    for (const n of ["calc_08.jpg", "captura-1791216861749.jpg", "login.png", "sin-extension"]) {
      expect(nombreDeGeometria(n)).toBe(s.nombreDeGeometria(n));
    }
    expect(nombreDeGeometria("calc_08.jpg")).toBe("calc_08.geometria.json");
  });

  it("las barras del sistema salen de `dumpsys window` (formato medido en un pixel8)", async () => {
    const s = await skill();
    const salida = [
      "        InsetsSource id=b5490001 type=navigationBars frame=[0,2337][1080,2400] visible=true flags=SUPPRESS_SCRIM sideHint=BOTTOM",
      "        InsetsSource id=2e170000 type=statusBars frame=[0,0][1080,132] visible=true flags= sideHint=TOP",
    ].join("\n");
    expect(s.barrasDeDumpsys(salida)).toEqual({
      estado: { izquierda: 0, arriba: 0, derecha: 1080, abajo: 132 },
      navegacion: { izquierda: 0, arriba: 2337, derecha: 1080, abajo: 2400 },
    });
    expect(s.barrasDeDumpsys("nada útil")).toBeUndefined();
  });

  it("el crítico la lee por el NOMBRE de su captura, y lo que no entiende no lo usa", async () => {
    const carpeta = mkdtempSync(join(tmpdir(), "xc-geo-"));
    writeFileSync(join(carpeta, "calc_08.geometria.json"), JSON.stringify({ v: 1, captura: "calc_08.jpg", pantalla: { ancho: 1080, alto: 2400 }, arbol: [] }));
    writeFileSync(join(carpeta, "vieja.geometria.json"), JSON.stringify({ v: 9 }));
    expect(await geometriaDeCaptura(carpeta, "calc_08.jpg")).toMatchObject({ captura: "calc_08.jpg" });
    expect(await geometriaDeCaptura(carpeta, "vieja.jpg")).toBeUndefined();
    expect(await geometriaDeCaptura(carpeta, "no-existe.jpg")).toBeUndefined();
  });
});

describe("una captura de UN CONTROL no lleva la geometría de la pantalla", () => {
  it("se distingue porque la imagen es claramente más pequeña que lo que ocupa el árbol", async () => {
    const s = await skill();
    const arbol = [{ bounds: { left: 0, top: 0, width: 1080, height: 2400 } }, { bounds: { left: 66, top: 421, width: 948, height: 48 } }];
    expect(s.esCapturaDeUnControl({ ancho: 1080, alto: 2400 }, arbol)).toBe(false);
    // `shot name=MAP_DSH` (medido: 1080×1998 y 993×110 en la calculadora).
    expect(s.esCapturaDeUnControl({ ancho: 1080, alto: 1998 }, arbol)).toBe(true);
    expect(s.esCapturaDeUnControl({ ancho: 993, alto: 110 }, arbol)).toBe(true);
  });

  it("un pie flotante que se sale por abajo no convierte la pantalla entera en «un control»: manda la barra de navegación", async () => {
    const s = await skill();
    // Medido en la calculadora: FLOAT_FOOTER_FRAME hasta y=2542 en una pantalla de 2400.
    const arbol = [{ bounds: { left: 0, top: 338, width: 1080, height: 1996 } }, { bounds: { left: 0, top: 2336, width: 1080, height: 206 } }];
    const barras = { navegacion: { izquierda: 0, arriba: 2337, derecha: 1080, abajo: 2400 } };
    expect(s.esCapturaDeUnControl({ ancho: 1080, alto: 2400 }, arbol, barras)).toBe(false);
    expect(s.esCapturaDeUnControl({ ancho: 1080, alto: 1998 }, arbol, barras)).toBe(true);
  });
});
