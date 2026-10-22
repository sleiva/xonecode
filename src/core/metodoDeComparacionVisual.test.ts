import { describe, expect, it } from "vitest";
import { confirmadas, METODO_DE_COMPARACION_VISUAL, unirObservaciones } from "./metodoDeComparacionVisual.js";

describe("las observaciones de dos pasadas, sin las repetidas", () => {
  it("las dos pasadas reales de Maset: se queda una por diferencia", () => {
    const p2 = [
      "En la fila ENTREGAS falta el número «12» que la maqueta muestra encima de «pend.», a la izquierda de la flecha; en la captura solo queda «pend.».",
      "El pie de pantalla dice «Maset v10.09.2026-1» en la captura, mientras que la maqueta dice «Maset Direct Logistic v2.4 • Bodegas Maset».",
    ];
    const p3 = [
      "En la tarjeta ENTREGAS falta el contador «12» sobre la etiqueta «pend.»; solo se ve «pend.» a la derecha y a la altura del subtítulo, no centrado como en la maqueta.",
      "El pie de la captura dice «Maset v10.09.2026-1», mientras que la maqueta dice «Maset Direct Logistic v2.4 • Bodegas Maset».",
      "En la captura las flechas de las tarjetas no quedan todas en la misma vertical (las de ENTREGAS e INCIDENCIAS quedan más a la izquierda); en la maqueta están alineadas.",
    ];
    expect(unirObservaciones(p2, p3)).toEqual([p2[0], p2[1], p3[2]]);
  });

  it("dos distintas del mismo control no se juntan por nombrarlo", () => {
    const a = "En ENTREGAS falta el número «12» encima de «pend.».";
    const b = "En ENTREGAS el icono del camión es más grande que en la maqueta.";
    expect(unirObservaciones([a], [b])).toEqual([a, b]);
  });
});

describe("los valores de la maqueta son de ejemplo", () => {
  it("el método lo dice para versiones y campos, sin soltar el sitio vacío", () => {
    expect(METODO_DE_COMPARACION_VISUAL).toMatch(/versiones/);
    expect(METODO_DE_COMPARACION_VISUAL).toMatch(/puntos de una contraseña/);
    expect(METODO_DE_COMPARACION_VISUAL).toMatch(/SITIO esté vacío/);
    expect(METODO_DE_COMPARACION_VISUAL).toMatch(/CUÁNTAS filas tiene una lista/);
  });
});

/**
 * DISEÑO o DETALLE: el veredicto responde a «¿respeta el diseño?», no a «¿hay diferencias?». Medido el 21-10-2026: las 31
 * críticas con maqueta del workspace eran rojas, porque el verde exigía CERO diferencias entre un render web y una app.
 */
describe("la frontera entre diseño y detalle", () => {
  it("el método la escribe, con el color de lo IMPORTANTE como diseño", () => {
    expect(METODO_DE_COMPARACION_VISUAL).toMatch(/DISEÑO/);
    expect(METODO_DE_COMPARACION_VISUAL).toMatch(/DETALLE/);
    expect(METODO_DE_COMPARACION_VISUAL).toMatch(/esquinas rectas donde la maqueta las redondea/);
    // El GRADO es detalle: medido contra el ojo, «más redondeada» o «borde en vez de sombra» daban rojo en falso.
    expect(METODO_DE_COMPARACION_VISUAL).toMatch(/un radio algo mayor o menor, una sombra cambiada por un borde fino/);
    // Petición suya: una etiqueta importante con otro color es diseño; un texto secundario, detalle.
    expect(METODO_DE_COMPARACION_VISUAL).toMatch(/color de un texto IMPORTANTE/);
    // Un borde que SOBRA es diseño, y se busca a propósito (medido en Maset: el borde de celda de una lista no lo vio nadie).
    expect(METODO_DE_COMPARACION_VISUAL).toMatch(/un BORDE, recuadro,/);
    expect(METODO_DE_COMPARACION_VISUAL).toMatch(/Busca a propósito lo que más se/);
    expect(METODO_DE_COMPARACION_VISUAL).toMatch(/secundario/);
  });
});

/**
 * Una diferencia de DISEÑO solo pone rojo si la ven las DOS miradas: lo que sale en una sí y en otra no es ruido. Las dos
 * pasadas describen lo mismo con palabras distintas (Maset, liquidaciones, dos pasadas reales).
 */
describe("confirmadas: lo que vieron las dos pasadas", () => {
  it("la misma diferencia contada con otras palabras se confirma", () => {
    const a = ["Las filas de la lista no tienen esquinas redondeadas ni sombra: son rectángulos planos de borde recto."];
    const b = ["Las tarjetas de la lista son rectángulos planos, sin las esquinas redondeadas ni la sombra suave de la maqueta."];
    expect(confirmadas([a, b])).toEqual({ confirmadas: a, sueltas: [] });
  });

  it("lo que solo vio una se queda suelto, y dos distintas no se confirman entre sí", () => {
    const a = ["Las filas de la lista no tienen esquinas redondeadas ni sombra.", "El botón «Entrar» es gris y en la maqueta es rojo."];
    const b = ["Las tarjetas de la lista son rectángulos sin esquinas redondeadas."];
    expect(confirmadas([a, b])).toEqual({ confirmadas: [a[0]], sueltas: [a[1]] });
  });

  it("con UNA sola pasada legible no hay con qué contrastar: vale lo que dijo", () => {
    const a = ["El botón «Entrar» es gris y en la maqueta es rojo."];
    expect(confirmadas([a])).toEqual({ confirmadas: a, sueltas: [] });
  });

  it("y lo que la otra pasada vio y la primera no, también queda suelto", () => {
    expect(confirmadas([[], ["El logo es más pequeño."]])).toEqual({ confirmadas: [], sueltas: ["El logo es más pequeño."] });
  });
});
