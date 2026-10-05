import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compararDescripciones, hayQueArreglar } from "../../core/descripcionDePantalla.js";
import { pantallaMedida, type ControlAMedir } from "../../core/estiloMedido.js";
import { controlesDelArbol, filas, filasDelAparato, type MaquetaMedida } from "../../core/geometriaDePantalla.js";
import { decodificarImagen } from "./decodificarImagen.js";

/**
 * El caso REAL: la calculadora de MyAllXOne tal como la dejó el agente (captura nativa y su árbol de controles) contra
 * la maqueta de Stitch y las cajas de su `code.html`. Con el modelo describiendo, la misma imagen salía distinta cada
 * vez y el texto recortado del visor no salía nunca; medido en los píxeles, sale siempre lo mismo.
 */
const oro = (n: string) => readFileSync(new URL(`../../core/__oro__/geometria/${n}`, import.meta.url));
const geo = JSON.parse(oro("calculadora.captura-final.geometria.json").toString("utf8"));
const cajas: MaquetaMedida = JSON.parse(oro("calculadora.maqueta.json").toString("utf8"));
const captura = pantallaMedida(
  decodificarImagen(oro("calculadora.captura-final.png")),
  filasDelAparato({ pantalla: geo.pantalla, controles: controlesDelArbol(geo.arbol) }).map((f) => f.map((c) => ({ texto: c.texto ?? `[${c.nombre}]`, caja: c.caja })))
);
const indice = filas(cajas.elementos.map((e) => e.caja));
const porFila = new Map<number, ControlAMedir[]>();
cajas.elementos.forEach((e, i) => porFila.set(indice[i]!, [...(porFila.get(indice[i]!) ?? []), e]));
const maqueta = pantallaMedida(decodificarImagen(oro("calculadora.maqueta.png")), [...porFila.values()]);
const c = compararDescripciones(maqueta, captura);

describe("la calculadora real, medida en sus píxeles", () => {
  it("ve el visor roto: «12 + 3» y «RAD» recortados, y bordes que la maqueta no tiene", () => {
    expect(c.recortes).toEqual(["«12 + 3» se ve RECORTADO (le falta un trozo de las letras).", "«RAD» se ve RECORTADO (le falta un trozo de las letras)."]);
    expect(c.diferencias).toContain("lleva un BORDE, y en la maqueta nada lo lleva en «12 + 3», «15».");
  });

  it("las teclas: cuadrados redondeados en la maqueta, círculos en el aparato; y el DEG que está en RAD no «falta»", () => {
    expect(c.diferencias.find((d) => d.startsWith("forma redondeada"))).toMatch(/→ círculo \(1,0:1\) en «AC».*\(1\d controles\)\.$/);
    expect(c.diferencias).toContain("dice «RAD» donde la maqueta dice «DEG» (¿un estado distinto?).");
    expect(c.faltan).toEqual(["«receipt_long Tape»"]);
  });

  it("sin inventar: los dígitos tienen la letra y el color de la maqueta, y la maqueta contra sí misma está bien", () => {
    expect(c.diferencias.join("\n")).not.toMatch(/letra .* en .*«7»|color del texto .* en .*«7»/);
    expect(hayQueArreglar(c)).toBe(true);
    expect(hayQueArreglar(compararDescripciones(maqueta, maqueta))).toBe(false);
  });
});
