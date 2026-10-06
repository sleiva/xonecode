// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from "vitest";
import { medirElementos } from "./cajasDeMaqueta.js";

/**
 * Lo que se mide de una maqueta (`medirElementos`), con un DOM de pruebas. jsdom no maqueta: toda caja sale de
 * 0×0, así que se le da a cada elemento una de 10×10 —lo que se prueba aquí es QUÉ se mide, no dónde cae—.
 */
const d = (globalThis as any).document;
beforeAll(() => {
  (globalThis as any).Element.prototype.getBoundingClientRect = function () {
    return { left: 0, top: 0, width: this.getAttribute("data-oculto") === null ? 10 : 0, height: 10 };
  };
});
const medir = (html: string) => {
  d.body.innerHTML = html;
  return medirElementos(d).map((e) => ({ texto: e.texto, ...(e.boton === true ? { boton: true } : {}) }));
};

describe("medirElementos: los textos de la maqueta, no los botones con todo pegado", () => {
  it("una TARJETA (un botón con varios textos) se parte en sus textos (Maset)", () => {
    const tarjeta = `<button type="button"><div></div><div><svg></svg></div><div><div><span>ENTREGAS</span><span>Prioridad</span></div>
      <p>Reparto de pedidos y albaranes</p></div><div><div><span>12</span><span>pend.</span></div><svg></svg></div></button>`;
    expect(medir(tarjeta)).toEqual([
      { texto: "ENTREGAS" },
      { texto: "Prioridad" },
      { texto: "Reparto de pedidos y albaranes" },
      { texto: "12" },
      { texto: "pend." },
    ]);
  });

  it("una TECLA (un botón con un texto) es un elemento, con la caja del botón (la calculadora)", () => {
    expect(medir(`<button>7</button><button><span>AC</span></button>`)).toEqual([
      { texto: "7", boton: true },
      { texto: "AC", boton: true },
    ]);
  });

  it("el icono de Material no cuenta como otro texto: «content_copy COPY» sigue siendo un botón", () => {
    expect(medir(`<button><span class="material-symbols-outlined">content_copy</span>COPY</button>`)).toEqual([
      { texto: "content_copy COPY", boton: true },
    ]);
  });

  it("lo que NO es botón también se mide: cabecera, banda, sección, pie", () => {
    const cabecera = `<header><div><span>MASET</span></div><span>
          VINS &amp; CAVES • 1777
        </span><span>Ruta Activa • Zona Nord</span></header><h2>Menú Principal Logística</h2>`;
    expect(medir(cabecera)).toEqual([
      { texto: "MASET" },
      { texto: "VINS & CAVES • 1777" },
      { texto: "Ruta Activa • Zona Nord" },
      { texto: "Menú Principal Logística" },
    ]);
  });

  it("sin cajas invisibles, scripts ni estilos", () => {
    expect(medir(`<span data-oculto>no</span><script>var x = "no";</script><style>.a{}</style><span>sí</span>`)).toEqual([{ texto: "sí" }]);
  });
});
