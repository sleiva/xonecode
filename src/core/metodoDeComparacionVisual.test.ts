import { describe, expect, it } from "vitest";
import { METODO_DE_COMPARACION_VISUAL, unirObservaciones } from "./metodoDeComparacionVisual.js";

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
