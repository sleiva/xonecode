import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PNG } from "pngjs";
import { buscarMaqueta, buscarMaquetas, cumpleElCriterio, medirContraLaMasParecida, medirContraMaqueta, RONDAS_VISUALES, resumenDeMedida, textoDeMedidaAutomatica, ultimaCaptura } from "./medidaAutomatica.js";

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
    expect(texto(1)).toContain(`Ronda visual 1 de ${String(RONDAS_VISUALES)}: junta TODAS las diferencias`);
    expect(texto(RONDAS_VISUALES - 1)).not.toContain("No pidas otra captura");
    expect(texto(RONDAS_VISUALES)).toContain(`Es tu ronda visual ${String(RONDAS_VISUALES)} de ${String(RONDAS_VISUALES)}`);
    expect(texto(RONDAS_VISUALES)).toContain("No pidas otra captura para retocar");
  });
});

/** IXCODE-63: varias pantallas elegidas, cada una en su carpeta, y cada captura contra la más parecida. */
describe("varias maquetas", () => {
  it("buscarMaquetas da las traídas en orden (`diseno/`, `diseno/2/`…), y la de siempre sin traídas", () => {
    const raiz = mkdtempSync(join(tmpdir(), "xc-maquetas-"));
    const artefactos = join(raiz, "artefactos");
    mkdirSync(join(artefactos, "diseno", "2"), { recursive: true });
    writeFileSync(join(artefactos, "diseno", "screen.png"), pngConBloque(0.1, 0.3));
    writeFileSync(join(artefactos, "diseno", "2", "screen.jpg"), pngConBloque(0.6, 0.9));
    expect(buscarMaquetas(raiz, undefined, artefactos).map((m) => m.virtual)).toEqual([
      "/artefactos/diseno/screen.png",
      "/artefactos/diseno/2/screen.jpg",
    ]);
    // `buscarMaqueta` sigue dando la primera, para quien solo quiere una (el ancho de `convertir_a_p`).
    expect(buscarMaqueta(raiz, undefined, artefactos)?.virtual).toBe("/artefactos/diseno/screen.png");
    expect(buscarMaquetas(raiz, undefined, join(raiz, "no-hay"))).toEqual([]);
  });

  it("la captura se mide contra la MÁS PARECIDA, y lo dice", () => {
    const dir = mkdtempSync(join(tmpdir(), "xc-parecida-"));
    const arriba = join(dir, "arriba.png");
    const abajo = join(dir, "abajo.png");
    const captura = join(dir, "captura.png");
    writeFileSync(arriba, pngConBloque(0.1, 0.3));
    writeFileSync(abajo, pngConBloque(0.6, 0.9));
    writeFileSync(captura, pngConBloque(0.6, 0.9));
    const { maqueta } = medirContraLaMasParecida(captura, [
      { virtual: "/artefactos/diseno/screen.png", disco: arriba },
      { virtual: "/artefactos/diseno/2/screen.png", disco: abajo },
    ]);
    expect(maqueta.virtual).toBe("/artefactos/diseno/2/screen.png");
    // Una que no se puede abrir se salta; sin ninguna, lanza.
    expect(medirContraLaMasParecida(captura, [{ virtual: "x", disco: join(dir, "nada.png") }, { virtual: "y", disco: abajo }]).maqueta.virtual).toBe("y");
    expect(() => medirContraLaMasParecida(captura, [{ virtual: "x", disco: join(dir, "nada.png") }])).toThrow();
  });
});


describe("la medida automática de una LISTA", () => {
  it("con la captura marcada como lista, lo vertical no tumba el criterio, y el resumen lo dice", () => {
    const dir = mkdtempSync(join(tmpdir(), "xc-lista-"));
    writeFileSync(join(dir, "maqueta.png"), pngConBloque(0.1, 0.9));
    writeFileSync(join(dir, "larga.png"), pngConBloque(0.1, 0.5));
    expect(cumpleElCriterio(medirContraMaqueta(join(dir, "larga.png"), join(dir, "maqueta.png")))).toBe(false);
    const lista = medirContraMaqueta(join(dir, "larga.png"), join(dir, "maqueta.png"), 5);
    expect(cumpleElCriterio(lista)).toBe(true);
    expect(resumenDeMedida(lista, "l.png")).toMatch(/lista de 5 filas: la vertical no cuenta/);
  });
});
