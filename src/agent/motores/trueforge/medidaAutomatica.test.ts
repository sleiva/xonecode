import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PNG } from "pngjs";
import { buscarMaqueta, cumpleElCriterio, medirContraMaqueta, resumenDeMedida, textoDeMedidaAutomatica, ultimaCaptura } from "./medidaAutomatica.js";

/** Un PNG oscuro con un bloque claro entre `desde` y `hasta` (fracciones del alto). */
function pngConBloque(desde: number, hasta: number, ancho = 108, alto = 240, derecha = 0.9): Buffer {
  const png = new PNG({ width: ancho, height: alto });
  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      const i = (y * ancho + x) * 4;
      const claro = y >= desde * alto && y < hasta * alto && x > ancho * 0.1 && x < ancho * derecha;
      png.data[i] = png.data[i + 1] = png.data[i + 2] = claro ? 230 : 20;
      png.data[i + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

describe("la medida automática tras probar en el aparato", () => {
  it("la maqueta es /diseno/screen.png si está; si no, la primera imagen de /diseno/ o de los adjuntos", () => {
    const raiz = mkdtempSync(join(tmpdir(), "xc-medida-"));
    expect(buscarMaqueta(raiz)).toBeUndefined();
    const adj = mkdtempSync(join(tmpdir(), "xc-adj-"));
    writeFileSync(join(adj, "maqueta.jpg"), "x");
    expect(buscarMaqueta(raiz, adj)?.virtual).toBe("/adjuntos/maqueta.jpg");
    mkdirSync(join(raiz, "diseno"));
    writeFileSync(join(raiz, "diseno", "b.png"), "x");
    expect(buscarMaqueta(raiz, adj)?.virtual).toBe("/diseno/b.png");
    writeFileSync(join(raiz, "diseno", "screen.png"), "x");
    expect(buscarMaqueta(raiz, adj)?.virtual).toBe("/diseno/screen.png");
  });

  it("la captura es la MÁS RECIENTE escrita desde que nació el hilo, también en una subcarpeta", () => {
    const art = mkdtempSync(join(tmpdir(), "xc-art-"));
    const antes = Date.now() / 1000 - 100;
    writeFileSync(join(art, "vieja.png"), "x");
    utimesSync(join(art, "vieja.png"), antes, antes);
    expect(ultimaCaptura(art, Date.now() - 10_000)).toBeUndefined();
    mkdirSync(join(art, "d0"));
    writeFileSync(join(art, "d0", "a.png"), "x");
    writeFileSync(join(art, "notas.txt"), "x");
    expect(ultimaCaptura(art, Date.now() - 10_000)).toBe("d0/a.png");
  });

  it("mide con la aritmética de comparar_capturas: igual cumple, distinta no, y el texto dice qué hacer", () => {
    const dir = mkdtempSync(join(tmpdir(), "xc-img-"));
    writeFileSync(join(dir, "maqueta.png"), pngConBloque(0.1, 0.9));
    writeFileSync(join(dir, "igual.png"), pngConBloque(0.1, 0.9));
    writeFileSync(join(dir, "corta.png"), pngConBloque(0.1, 0.5));
    const igual = medirContraMaqueta(join(dir, "igual.png"), join(dir, "maqueta.png"));
    const corta = medirContraMaqueta(join(dir, "corta.png"), join(dir, "maqueta.png"));
    expect(cumpleElCriterio(igual)).toBe(true);
    expect(cumpleElCriterio(corta)).toBe(false);
    expect(resumenDeMedida(corta, "c.png")).toMatch(/NO cumple el 10 % y el 3 % de encaje; captura \/artefactos\/c\.png/);
    const t = textoDeMedidaAutomatica({ quien: "device-controller", captura: "c.png", maqueta: "/diseno/screen.png", comparacion: corta, pedirCritica: true });
    expect(t).toContain("NO cumple el criterio");
    expect(t).toContain("No lo des por terminado ni lo devuelvas así");
    expect(t).toContain("pásala con pantalla=/artefactos/c.png y referencia=/diseno/screen.png");
    const bien = textoDeMedidaAutomatica({ quien: "device-controller", captura: "i.png", maqueta: "/diseno/screen.png", comparacion: igual, pedirCritica: false });
    expect(bien).toContain("CUMPLE el criterio");
    expect(bien).not.toContain("xone_critica_visual: pásala");
  });

  it("el ENCAJE es condición: un contenido que no llega al borde de la maqueta NO cumple aunque las distancias sí", () => {
    const dir = mkdtempSync(join(tmpdir(), "xc-encaje-"));
    writeFileSync(join(dir, "maqueta.png"), pngConBloque(0.1, 0.9));
    // Como calc12: el teclado acaba antes del borde derecho (8 puntos) y todo lo demás igual.
    writeFileSync(join(dir, "estrecha.png"), pngConBloque(0.1, 0.9, 108, 240, 0.82));
    const c = medirContraMaqueta(join(dir, "estrecha.png"), join(dir, "maqueta.png"));
    expect(c.distanciaHorizontal).toBeLessThan(0.1);
    expect(c.encaje.derecha).toBeLessThan(-0.03);
    expect(cumpleElCriterio(c)).toBe(false);
    const t = textoDeMedidaAutomatica({ quien: "device-controller", captura: "e.png", maqueta: "/diseno/screen.png", comparacion: c, pedirCritica: false });
    expect(t).toContain("ENCAJE a la derecha");
    expect(t).toContain("ensánchalo hasta el borde de la maqueta");
    expect(t).toContain("NO ENCAJA");
  });

  it("cuenta las rondas VISUALES: en la última, arreglar y devolver en vez de otra captura", () => {
    const dir = mkdtempSync(join(tmpdir(), "xc-rondas-"));
    writeFileSync(join(dir, "maqueta.png"), pngConBloque(0.1, 0.9));
    writeFileSync(join(dir, "corta.png"), pngConBloque(0.1, 0.5));
    const c = medirContraMaqueta(join(dir, "corta.png"), join(dir, "maqueta.png"));
    const texto = (ronda: number) => textoDeMedidaAutomatica({ quien: "device-controller", captura: "c.png", maqueta: "/diseno/screen.png", comparacion: c, pedirCritica: false, ronda });
    expect(texto(1)).toContain("Ronda visual 1 de 3: junta TODAS las diferencias");
    expect(texto(3)).toContain("Es tu ronda visual 3 de 3");
    expect(texto(3)).toContain("No pidas otra captura para retocar");
  });
});

