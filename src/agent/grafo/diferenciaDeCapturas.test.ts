import { describe, expect, it } from "vitest";
import { PNG } from "pngjs";
import { crearDiferenciaDeCapturas, NOMBRE_DIFERENCIA_DE_CAPTURAS } from "./diferenciaDeCapturas.js";
import { CAMPOS_SEGUROS, detalleDe } from "../turno/resumenDeTool.js";

function png(ancho: number, alto: number, conNumero: boolean, tam = 1): Buffer {
  const p = new PNG({ width: ancho * tam, height: alto * tam });
  for (let y = 0; y < p.height; y++) {
    for (let x = 0; x < p.width; x++) {
      const i = (y * p.width + x) * 4;
      const numero = conNumero && x > p.width * 0.6 && x < p.width * 0.9 && y > p.height * 0.1 && y < p.height * 0.16;
      const c = numero ? 230 : 16;
      p.data[i] = c; p.data[i + 1] = c; p.data[i + 2] = c + 4; p.data[i + 3] = 255;
    }
  }
  return PNG.sync.write(p);
}
const archivos: Record<string, Buffer> = {
  "antes.png": png(400, 800, false),
  "despues.png": png(400, 800, true),
  "igual.png": png(400, 800, false),
  "otro-tamano.png": png(200, 400, true),
  "nota.txt": Buffer.from("no soy una imagen"),
};
const leidos: string[] = [];
const llamar = (e: Record<string, unknown>): Promise<string> =>
  crearDiferenciaDeCapturas({
    leerArtefacto: async (n) => {
      leidos.push(n);
      const b = archivos[n];
      if (b === undefined) throw Object.assign(new Error("ENOENT: no such file, open '/Users/x/secreto/" + n + "'"), { code: "ENOENT" });
      return b;
    },
  }).invoke(e as never) as Promise<string>;
const DISPLAY = { x: 0, y: 0.05, ancho: 1, alto: 0.25 };

describe("diferencia_de_capturas", () => {
  it("una zona donde aparece un número CAMBIÓ, con el porcentaje y dónde", async () => {
    const r = await llamar({ antes: "/artefactos/antes.png", despues: "/artefactos/despues.png", zona: DISPLAY });
    expect(r).toContain("CAMBIÓ");
    expect(r).toMatch(/\d+(\.\d)? %/);
  });

  it("sin cambios es IGUAL y avisa de las dos explicaciones, sin dar la captura por cacheada", async () => {
    const r = await llamar({ antes: "/artefactos/antes.png", despues: "/artefactos/igual.png", zona: DISPLAY });
    expect(r).toContain("IGUAL");
    expect(r).toMatch(/no repinta/);
    expect(r).toMatch(/antes del repintado/);
  });

  it("tamaños distintos, zona absurda, ruta fuera de artefactos: texto, sin lanzar y sin abrir nada antes", async () => {
    expect(await llamar({ antes: "/artefactos/antes.png", despues: "/artefactos/otro-tamano.png" })).toMatch(/mismo tamaño/);
    expect(await llamar({ antes: "/artefactos/antes.png", despues: "/artefactos/igual.png", zona: { x: 0, y: 0, ancho: 2, alto: 1 } })).toMatch(/fracciones/);
    leidos.length = 0;
    for (const mal of ["/.env", "/artefactos/../.env", "/artefactos/nota.txt"]) {
      const r = await llamar({ antes: mal, despues: "/artefactos/igual.png" });
      expect(r, mal).toMatch(/no es|no hay nada que medir|Solo puedo/);
    }
    expect(leidos).toEqual([]);
  });

  it("un fichero que falta se devuelve como texto y sin la ruta de la máquina", async () => {
    const r = await llamar({ antes: "/artefactos/antes.png", despues: "/artefactos/noexiste.png" });
    expect(r).toContain("ENOENT");
    expect(r).not.toContain("/Users/");
  });

  it("el detalle de la línea es la captura de después, y el informe no cruza", () => {
    expect(CAMPOS_SEGUROS[NOMBRE_DIFERENCIA_DE_CAPTURAS]).toBeDefined();
    expect(detalleDe(NOMBRE_DIFERENCIA_DE_CAPTURAS, { antes: "/artefactos/a.png", despues: "/artefactos/b.png" })).toBe("/artefactos/b.png");
  });
});
