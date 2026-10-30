import { describe, expect, it } from "vitest";
import { informeDeMaqueta } from "./informeDeMaqueta.js";
import type { MaquetaMedida } from "./geometriaDePantalla.js";

const tecla = (texto: string, x: number, y: number) => ({ texto, caja: { x, y, ancho: 76, alto: 64 }, boton: true as const });

/** Medido en la prueba de la calculadora: el orquestador encargó medir las bandas de la maqueta con PIL (19 llamadas). */
describe("la geometría de una maqueta, para un agente", () => {
  const medida: MaquetaMedida = {
    ancho: 390,
    alto: 746,
    elementos: [tecla("8", 112, 426), tecla("7", 24, 426), tecla("AC", 24, 350), tecla("±", 112, 350), { texto: "Standard Mode", caja: { x: 109, y: 53, ancho: 135, alto: 22 } }],
    bloques: [{ x: 16, y: 342, ancho: 358, alto: 384 }],
  };

  it("agrupa en FILAS de arriba abajo y de izquierda a derecha, con el hueco entre controles", () => {
    const t = informeDeMaqueta("/diseno/screen.png", medida, { ancho: 390, alto: 746 }).join("\n");
    expect(t).toContain("FILAS de controles, de arriba abajo (3)");
    expect(t.indexOf("«AC»")).toBeLessThan(t.indexOf("«±»"));
    expect(t.indexOf("«±»")).toBeLessThan(t.indexOf("«7»"));
    expect(t).toContain("hueco entre ellos 12–12 px");
    expect(t).toContain("x 16–374, y 342–726 (358×384 px; 91,8 % del ancho, 51,5 % del alto)");
  });

  it("las coordenadas van en px del PNG: una maqueta a 2× las dobla, y los % no cambian", () => {
    const t = informeDeMaqueta("/diseno/screen.png", medida, { ancho: 780, alto: 1492 }).join("\n");
    expect(t).toContain("«AC» (botón): x 48–200, y 700–828 (152×128 px; 19,5 % del ancho, 8,6 % del alto)");
  });
});
