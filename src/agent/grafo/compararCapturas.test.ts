import { describe, expect, it } from "vitest";
import { PNG } from "pngjs";
import { crearCompararCapturas, NOMBRE_COMPARAR_CAPTURAS } from "./compararCapturas.js";
import { CAMPOS_SEGUROS, detalleDe } from "../turno/resumenDeTool.js";

function png(ancho: number, alto: number, contenidoHasta: number): Buffer {
  const p = new PNG({ width: ancho, height: alto });
  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      const i = (y * ancho + x) * 4;
      const c = y > alto * 0.28 && y < alto * contenidoHasta && x > ancho * 0.1 && x < ancho * 0.9 ? 90 : 16;
      p.data[i] = c; p.data[i + 1] = c; p.data[i + 2] = c + 4; p.data[i + 3] = 255;
    }
  }
  return PNG.sync.write(p);
}
const archivos: Record<string, Buffer> = {
  "maqueta.png": png(390, 746, 0.98),
  "buena.png": png(1080, 2400, 0.98),
  "corta.png": png(1080, 2400, 0.5),
  "roto.png": Buffer.concat([png(20, 20, 0.9).subarray(0, 30), Buffer.alloc(20, 3)]),
  "nota.txt": Buffer.from("no soy una imagen"),
};
const leidos: string[] = [];
const llamar = (e: Record<string, unknown>): Promise<string> =>
  crearCompararCapturas({
    leerArtefacto: async (n) => {
      leidos.push(n);
      const b = archivos[n];
      if (b === undefined) throw Object.assign(new Error("ENOENT: no such file or directory, open '/Users/x/secreto/" + n + "'"), { code: "ENOENT" });
      return b;
    },
  }).invoke(e as never) as Promise<string>;

describe("comparar_capturas", () => {
  it("una pantalla que llena la maqueta sale PARECIDA, con el aviso de lo que no mide", async () => {
    const r = await llamar({ referencia: "/artefactos/maqueta.png", captura: "/artefactos/buena.png" });
    expect(r).toContain("PARECIDA");
    expect(r).toContain("no ve texto cortado");
  });

  it("un teclado a medias sale DISTINTA y dice la banda vacía con números", async () => {
    const r = await llamar({ referencia: "/artefactos/maqueta.png", captura: "/artefactos/corta.png" });
    expect(r).toContain("DISTINTA");
    expect(r).toMatch(/banda vacía/);
    expect(r).toMatch(/\d+ %/);
  });

  it("las guardas de ruta: fuera de /artefactos/, con .. o sin ser imagen, y NO se abre nada antes", async () => {
    leidos.length = 0;
    for (const mal of ["/.env", "/artefactos/../.env", "/etc/passwd", "/artefactos/nota.txt"]) {
      const r = await llamar({ referencia: mal, captura: "/artefactos/buena.png" });
      expect(r, mal).toMatch(/no es|no hay nada que medir|Solo puedo/);
    }
    expect(leidos).toEqual([]);
  });

  it("una segunda ruta mala se descubre ANTES de abrir la primera", async () => {
    leidos.length = 0;
    await llamar({ referencia: "/artefactos/maqueta.png", captura: "/.env" });
    expect(leidos).toEqual([]);
  });

  it("un fichero que falta o está roto se DEVUELVE como texto, sin ruta de la máquina", async () => {
    const falta = await llamar({ referencia: "/artefactos/maqueta.png", captura: "/artefactos/noexiste.png" });
    expect(falta).toContain("noexiste.png");
    expect(falta).toContain("ENOENT");
    expect(falta).not.toContain("/Users/");
    expect(falta).not.toContain("secreto");
    const roto = await llamar({ referencia: "/artefactos/maqueta.png", captura: "/artefactos/roto.png" });
    expect(roto).toMatch(/No pude usar|No se pudo medir/);
  });

  it("el detalle de la línea son las rutas, y el informe no cruza", () => {
    expect(CAMPOS_SEGUROS[NOMBRE_COMPARAR_CAPTURAS]).toBeDefined();
    expect(detalleDe(NOMBRE_COMPARAR_CAPTURAS, { captura: "/artefactos/a.png", referencia: "/artefactos/b.png" })).toBe("/artefactos/a.png");
  });
});
