import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  compararConMaqueta,
  controlesDelArbol,
  emparejar,
  hallazgosDeGeometria,
  hallazgosDelAparato,
  informeDeGeometria,
  textoParaEmparejar,
  type GeometriaDelAparato,
  type MaquetaMedida,
} from "./geometriaDePantalla.js";

/**
 * El caso REAL (sesión de MyAllXOne, la calculadora de Stitch): el árbol de la ronda en que la «=» acababa
 * en y=2384, con las barras medidas en ese mismo AVD, y las cajas de la maqueta renderizando su `code.html`
 * a 390×746.
 */
const geo = JSON.parse(readFileSync(new URL("./__oro__/geometria/calculadora.geometria.json", import.meta.url), "utf8"));
const maqueta: MaquetaMedida = JSON.parse(readFileSync(new URL("./__oro__/geometria/calculadora.maqueta.json", import.meta.url), "utf8"));
const aparato: GeometriaDelAparato = { pantalla: geo.pantalla, barras: geo.barras, controles: controlesDelArbol(geo.arbol) };

describe("la geometría de la calculadora real", () => {
  const h = hallazgosDeGeometria(aparato, maqueta);

  it("dice los defectos que tuvieron al desarrollador diez rondas", () => {
    expect(h.bloqueantes).toContain(
      "«=» (MAP_T_IGUAL) queda TAPADO por la barra de navegación: acaba en y=2384 y la barra empieza en y=2337 (47 px debajo)."
    );
    expect(h.diferencias).toContain("En la maqueta «0», «.», «=» van en la MISMA fila; en el aparato «=» va en otra.");
    expect(h.diferencias).toContain("«0» mide 1,9 veces el ancho de las de su fila; en la maqueta, 1,0.");
    expect(h.notas.some((n) => n.includes("«backspace»"))).toBe(true);
  });

  it("y NADA de lo que no está mal: ni «DEG» (una etiqueta con viñeta), ni «√» (una imagen en su sitio), ni las teclas buenas", () => {
    const todo = [...h.bloqueantes, ...h.diferencias].join("\n");
    expect(todo).not.toMatch(/DEG|√|«7»|«AC»/);
    expect(h.bloqueantes).toHaveLength(1);
    expect(h.notas.some((n) => n.includes("«√»") && n.includes("SIN texto"))).toBe(true);
  });

  it("la maqueta contra SÍ MISMA no da ningún hallazgo", () => {
    const comoAparato: GeometriaDelAparato = {
      pantalla: { ancho: maqueta.ancho, alto: maqueta.alto },
      barras: { estado: { izquierda: 0, arriba: 0, derecha: 390, abajo: 24 }, navegacion: { izquierda: 0, arriba: 730, derecha: 390, abajo: 746 } },
      controles: maqueta.elementos.map((e) => ({ ...(textoParaEmparejar(e.texto) === "" ? {} : { texto: e.texto }), tipo: "prop", caja: e.caja })),
    };
    expect(hallazgosDeGeometria(comoAparato, maqueta)).toEqual({ bloqueantes: [], diferencias: [], notas: [] });
  });

  it("el informe separa lo medido y dice si hubo maqueta", () => {
    expect(informeDeGeometria(h, true)[0]).toMatch(/^GEOMETRÍA, MEDIDA .*maqueta/);
    expect(informeDeGeometria({ bloqueantes: [], diferencias: [], notas: [] }, false).join("\n")).toContain("sin cajas de la maqueta");
  });
});

describe("hallazgosDelAparato: lo que se ve sin maqueta", () => {
  const pantalla = { ancho: 1000, alto: 2000 };
  const barras = { estado: { izquierda: 0, arriba: 0, derecha: 1000, abajo: 100 }, navegacion: { izquierda: 0, arriba: 1900, derecha: 1000, abajo: 2000 } };
  const tecla = (texto: string, x: number, y: number, ancho = 200, alto = 150) => ({ texto, tipo: "prop", caja: { x, y, ancho, alto } });

  it("tapado por la de navegación o la de estado, fuera de la pantalla, y solapes", () => {
    const h = hallazgosDelAparato({
      pantalla,
      barras,
      controles: [tecla("=", 0, 1820), tecla("X", 0, 40), tecla("fuera", 900, 500), tecla("A", 0, 600), tecla("B", 100, 650), tecla("bien", 0, 1000)],
    });
    expect(h.bloqueantes.join("\n")).toMatch(/«=» queda TAPADO por la barra de navegación.*70 px debajo/);
    expect(h.bloqueantes.join("\n")).toMatch(/«X» queda TAPADO por la barra de estado/);
    expect(h.bloqueantes.join("\n")).toMatch(/«fuera» se SALE de la pantalla/);
    expect(h.diferencias).toEqual(["«A» y «B» se SOLAPAN."]);
    expect(h.bloqueantes.join("\n") + h.diferencias.join("\n")).not.toContain("«bien»");
  });

  it("los marcos no cuentan: van de borde a borde por diseño", () => {
    const h = hallazgosDelAparato({ pantalla, barras, controles: [{ tipo: "frame", caja: { x: 0, y: 0, ancho: 1000, alto: 2000 } }] });
    expect(h.bloqueantes).toEqual([]);
  });

  it("sin barras lo dice, en vez de dar por bueno lo que pueda estar tapado", () => {
    expect(hallazgosDelAparato({ pantalla, controles: [] }).notas).toEqual(["sin las barras del sistema: no puedo decir qué queda tapado por ellas"]);
  });
});

describe("emparejar y textoParaEmparejar", () => {
  it("las ligaduras de iconos de Material no son texto; los signos con alias sí casan", () => {
    expect(textoParaEmparejar("backspace")).toBe("");
    expect(textoParaEmparejar("content_copy COPY")).toBe("copy");
    expect(textoParaEmparejar("• DEG")).toBe("deg");
    expect(textoParaEmparejar("−")).toBe(textoParaEmparejar("-"));
    expect(textoParaEmparejar("×")).toBe(textoParaEmparejar("x"));
    expect(textoParaEmparejar("x²")).toBe("x²");
  });

  it("por texto Y posición: el «0» de la tecla no se empareja con el «0» del visor", () => {
    const m: MaquetaMedida = { ancho: 100, alto: 200, elementos: [{ texto: "0", caja: { x: 10, y: 170, ancho: 20, alto: 20 } }] };
    const g: GeometriaDelAparato = {
      pantalla: { ancho: 1000, alto: 2000 },
      controles: [
        { nombre: "VISOR", texto: "0", tipo: "prop", caja: { x: 50, y: 300, ancho: 900, alto: 200 } },
        { nombre: "TECLA_0", texto: "0", tipo: "prop", caja: { x: 100, y: 1700, ancho: 200, alto: 200 } },
      ],
    };
    expect(emparejar(m, g).parejas[0]?.aparato.nombre).toBe("TECLA_0");
  });
});

describe("el ENCAJE: dónde empieza y acaba cada fila", () => {
  const tecla = (texto: string, x: number, ancho: number) => ({ texto, caja: { x, y: 100, ancho, alto: 50 } });
  const maqueta: MaquetaMedida = { ancho: 400, alto: 800, elementos: ["7", "8", "9", "×"].map((t, i) => tecla(t, 20 + i * 90, 80)) };
  const aparato = (escala: number): GeometriaDelAparato => ({
    pantalla: { ancho: 1000, alto: 2000 },
    controles: ["7", "8", "9", "×"].map((t, i) => ({ texto: t, tipo: "prop", clase: "B", caja: { x: 50 + i * 225 * escala, y: 250, ancho: 200 * escala, alto: 125 } })),
  });

  it("una fila que no llega al borde derecho de la maqueta deja una franja vacía, y se dice con cifras", () => {
    // Maqueta: del 5 % al 93 % (370 de 400). Aparato: del 5 % al 83 % (829 de 1000).
    expect(compararConMaqueta(maqueta, aparato(0.89)).diferencias).toContain(
      "La fila de «7» acaba en el 83 % del ancho (en la maqueta, en el 93 %): no ocupa el mismo ANCHO."
    );
  });

  it("y la que encaja no dice nada", () => {
    expect(compararConMaqueta(maqueta, aparato(0.98)).diferencias.join("\n")).not.toContain("ANCHO");
  });
});

describe("una lista con scroll y un panel encima no son errores de maqueta", () => {
  const pantalla = { ancho: 1000, alto: 2000 };
  const barras = { estado: { izquierda: 0, arriba: 0, derecha: 1000, abajo: 100 }, navegacion: { izquierda: 0, arriba: 1900, derecha: 1000, abajo: 2000 } };

  it("lo que el árbol da sin `visibleBounds` está fuera por el scroll: ni «se sale» ni «tapado»", () => {
    const arbol = [
      { name: "FILA_9", type: "prop", text: "636", visible: true, bounds: { left: 50, top: 2400, width: 600, height: 90 }, visibleBounds: null },
      { name: "FILA_1", type: "prop", text: "8", visible: true, bounds: { left: 50, top: 500, width: 600, height: 90 }, visibleBounds: { left: 50, top: 500, width: 600, height: 90 } },
    ];
    const h = hallazgosDelAparato({ pantalla, barras, controles: controlesDelArbol(arbol) });
    expect(h.bloqueantes).toEqual([]);
  });

  it("un panel que se abre ENCIMA del teclado no «se solapa» con él; dos teclas del mismo panel sí", () => {
    const marco = (name: string, left: number, top: number, width: number, height: number) => ({ name, type: "frame", visible: true, bounds: { left, top, width, height } });
    const prop = (name: string, text: string, left: number, top: number) => ({ name, type: "prop", text, visible: true, bounds: { left, top, width: 200, height: 150 } });
    const arbol = [
      marco("TECLADO", 0, 900, 1000, 900),
      prop("BT_7", "7", 50, 1000),
      prop("BT_8", "8", 150, 1050), // se pisa con el 7: mismo marco
      marco("CINTA", 20, 950, 960, 600),
      prop("MAP_T1", "4+4", 60, 1000),
    ];
    const h = hallazgosDelAparato({ pantalla, barras, controles: controlesDelArbol(arbol) });
    expect(h.diferencias).toEqual(["«7» (BT_7) y «8» (BT_8) se SOLAPAN."]);
  });
});

describe("un texto TRADUCIDO en su sitio no falta (la maqueta de Stitch viene en inglés)", () => {
  // Maqueta 400×800; aparato 1000×2000: el mismo sitio en fracción.
  const maqueta: MaquetaMedida = {
    ancho: 400,
    alto: 800,
    elementos: [
      { texto: "content_copy COPY", caja: { x: 300, y: 100, ancho: 80, alto: 30 } },
      { texto: "receipt_long Tape", caja: { x: 20, y: 100, ancho: 80, alto: 30 } },
      { texto: "History", caja: { x: 160, y: 700, ancho: 80, alto: 30 } },
    ],
  };
  const aparato: GeometriaDelAparato = {
    pantalla: { ancho: 1000, alto: 2000 },
    controles: [
      { nombre: "MAP_COPIAR", texto: "COPIAR", tipo: "prop", clase: "B", caja: { x: 750, y: 250, ancho: 200, alto: 75 } },
      // Una IMAGEN al lado y el texto traducido en el sitio: gana el texto.
      { nombre: "IMG_CURSOR", tipo: "prop", clase: "IMG", caja: { x: 60, y: 260, ancho: 40, alto: 40 } },
      { nombre: "MAP_HISTORIAL", texto: "HISTORIAL", tipo: "prop", clase: "B", caja: { x: 50, y: 250, ancho: 200, alto: 75 } },
      // Una CIFRA donde la maqueta tiene una palabra: no es una traducción.
      { nombre: "VISOR", texto: "19", tipo: "prop", clase: "T", caja: { x: 400, y: 1750, ancho: 200, alto: 75 } },
    ],
  };
  const h = compararConMaqueta(maqueta, aparato);

  it("se empareja por su sitio y va como NOTA, no como bloqueante", () => {
    expect(h.bloqueantes.join("\n")).not.toMatch(/COPY|Tape/);
    expect(h.notas).toContain("«COPY» de la maqueta dice «COPIAR» en el aparato: otro texto en su sitio (traducido o cambiado), no falta. Comparo su caja igual.");
    expect(h.notas.some((n) => n.startsWith("«Tape» de la maqueta dice «HISTORIAL»"))).toBe(true);
    expect(emparejar(maqueta, aparato).parejas.find((p) => p.maqueta.texto.endsWith("Tape"))?.aparato.nombre).toBe("MAP_HISTORIAL");
  });

  it("una cifra en el sitio de una palabra no es su traducción: sigue faltando", () => {
    expect(h.bloqueantes).toContain("«History» de la maqueta NO está en el aparato (ningún control con ese texto).");
  });
});
