import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compararDescripciones, hayQueArreglar } from "../../core/descripcionDePantalla.js";
import { compararBloques, pantallaMedida, type ControlAMedir } from "../../core/estiloMedido.js";
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

/**
 * Otra pasada de la misma calculadora: teclas cuadradas con un CONTORNO fino y claro. Con la primera versión del
 * medidor el contorno contaba como tinta: casi todas las teclas salían «recortadas», con la letra cuatro veces mayor y
 * los dígitos grises. Es la que fija las reglas del borde.
 */
describe("teclas con contorno fino, medidas sin confundir el contorno con el texto", () => {
  const geo2 = JSON.parse(oro("calculadora.teclas-con-borde.geometria.json").toString("utf8"));
  const vista = pantallaMedida(
    decodificarImagen(oro("calculadora.teclas-con-borde.jpg")),
    filasDelAparato({ pantalla: geo2.pantalla, controles: controlesDelArbol(geo2.arbol) }).map((f) => f.map((x) => ({ texto: x.texto ?? `[${x.nombre}]`, caja: x.caja })))
  );
  const c2 = compararDescripciones(maqueta, vista);

  it("ve el contorno que la maqueta no tiene, y ni un recorte ni una letra gigante", () => {
    expect(c2.diferencias.find((d) => d.startsWith("lleva un BORDE que la maqueta no tiene"))).toMatch(/«7», «8», «9»/);
    expect(c2.recortes).toEqual([]);
    expect(c2.diferencias.join("\n")).not.toMatch(/letra [2-9],\d veces la de la maqueta en .*«[0-9]»/);
  });

  it("los dígitos son del color de la maqueta (blancos), no el gris de un contorno", () => {
    expect(c2.diferencias.join("\n")).not.toMatch(/color del texto .* en .*«7»/);
  });
});

describe("los BLOQUES anchos: la cabecera también es el diseño", () => {
  const imgMaqueta = decodificarImagen(oro("calculadora.maqueta.png"));
  const bloquesDe = (nombre: string, imagen: string) => {
    const g = JSON.parse(oro(nombre).toString("utf8"));
    const util = { arriba: g.barras?.estado?.abajo ?? 0, abajo: g.barras?.navegacion?.arriba ?? g.pantalla.alto };
    const bloques = controlesDelArbol(g.arbol)
      .filter((c) => (c.tipo === "frame" || c.tipo === "group") && c.caja.ancho >= g.pantalla.ancho * 0.85 && c.caja.alto >= 40 && c.caja.alto <= g.pantalla.alto * 0.6 && c.caja.y >= util.arriba - 2)
      .map((c) => c.caja);
    return compararBloques({ img: imgMaqueta, bloques: cajas.bloques ?? [], util: { arriba: 0, abajo: cajas.alto } }, { img: decodificarImagen(oro(imagen)), bloques, util });
  };

  it("una cabecera AMARILLA donde la maqueta la tiene oscura se dice", () => {
    expect(bloquesDe("calculadora.teclas-con-borde.geometria.json", "calculadora.teclas-con-borde.jpg")).toEqual([
      expect.stringMatching(/^El bloque de arriba del todo es de color #F[0-9A-F]{5}; en la maqueta, #0[0-9A-F]{5}\.$/),
    ]);
  });

  it("y una cabecera oscura, como la de la maqueta, no", () => {
    expect(bloquesDe("calculadora.captura-final.geometria.json", "calculadora.captura-final.png").join("\n")).not.toContain("arriba del todo");
  });
});
