import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
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
