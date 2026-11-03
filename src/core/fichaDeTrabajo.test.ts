import { describe, expect, it } from "vitest";
import {
  casosDeLaSalida,
  conEscritura,
  conEvidencia,
  conRespaldo,
  estadoDeCriterio,
  estadoDeTarea,
  fichaNueva,
  interpretarFicha,
  pruebaVigente,
  vigente,
} from "./fichaDeTrabajo.js";

const ahora = "2026-11-03T12:00:00Z";
const pedido = { texto: "Crea la calculadora", procedencia: "persona" as const, cuando: ahora };

describe("la ficha de un trabajo", () => {
  it("una evidencia vale mientras los ficheros del trabajo no cambien; editar uno la CADUCA", () => {
    let f = conEscritura(fichaNueva(pedido), "/Calc.xne", "h1", "developer-xone", ahora);
    const { ficha, id } = conEvidencia(f, { tipo: "casos", resumen: "3 caso(s)", quien: "developer-xone", cuando: ahora });
    f = ficha;
    const e = f.evidencias.find((x) => x.id === id)!;
    expect(vigente(e, { "/Calc.xne": "h1" })).toBe(true);
    expect(vigente(e, { "/Calc.xne": "h2" })).toBe(false);
    // Un fichero que ya no existe también la caduca.
    expect(vigente(e, {})).toBe(false);
  });

  it("para marcar hace falta una prueba EN EL APARATO vigente; validar o escribir no cuentan", () => {
    let f = conEscritura(fichaNueva(pedido), "/Calc.xne", "h1", "developer-xone", ahora);
    f = conEvidencia(f, { tipo: "validacion", resumen: "valida", quien: "developer-xone", cuando: ahora }).ficha;
    expect(pruebaVigente(f, { "/Calc.xne": "h1" })).toBeUndefined();
    f = conEvidencia(f, { tipo: "captura", resumen: "/artefactos/c.png", quien: "developer-xone", cuando: ahora }).ficha;
    expect(pruebaVigente(f, { "/Calc.xne": "h1" })?.tipo).toBe("captura");
    // Tras editar, la captura ya no respalda nada.
    expect(pruebaVigente(f, { "/Calc.xne": "h2" })).toBeUndefined();
  });

  it("un criterio: vigente, caducado o sin evidencia, nunca solo «hecho»", () => {
    let f = conEscritura(fichaNueva(pedido), "/Calc.xne", "h1", "developer-xone", ahora);
    const { ficha, id } = conEvidencia(f, { tipo: "casos", resumen: "2 caso(s)", quien: "developer-xone", cuando: ahora });
    f = conRespaldo(ficha, { plan: "calculadora", tarea: "01", criterio: 1, evidencia: id, cuando: ahora });
    const donde = { plan: "calculadora", tarea: "01", criterio: 1 };
    expect(estadoDeCriterio(f, donde, { "/Calc.xne": "h1" })).toBe("vigente");
    expect(estadoDeCriterio(f, donde, { "/Calc.xne": "h2" })).toBe("caducado");
    expect(estadoDeCriterio(f, { ...donde, criterio: 2 }, { "/Calc.xne": "h1" })).toBe("sin-evidencia");
  });

  it("el estado de la tarea lo calcula el código: hecha SOLO con todo vigente y el verificador en verde", () => {
    expect(estadoDeTarea(["sin-evidencia", "sin-evidencia"], 0, "verde")).toBe("pendiente");
    expect(estadoDeTarea(["vigente", "sin-evidencia"], 1, "verde")).toBe("en curso");
    expect(estadoDeTarea(["vigente", "caducado"], 2, "verde")).toBe("implementada");
    expect(estadoDeTarea(["vigente", "vigente"], 2, "rojo")).toBe("implementada");
    expect(estadoDeTarea(["vigente", "vigente"], 2, undefined)).toBe("implementada");
    expect(estadoDeTarea(["vigente", "vigente"], 2, "verde")).toBe("hecha");
    expect(estadoDeTarea([], 0, "verde")).toBe("pendiente");
  });

  it("se lee con su versión, y lo que no se entiende no se adivina", () => {
    const f = conEscritura(fichaNueva(pedido), "/x.xne", "h", "developer-xone", ahora);
    expect(interpretarFicha(JSON.parse(JSON.stringify(f)))).toEqual(f);
    expect(interpretarFicha({ ...f, version: 2 })).toBeUndefined();
    expect(interpretarFicha({ version: 1 })).toBeUndefined();
    expect(interpretarFicha("basura")).toBeUndefined();
  });

  it("los casos de una salida de xone-hotswap con ---; una orden suelta no es una prueba de casos", () => {
    const salida = [
      '{"comando":"caso","caso":1,"pasos":"AC 7 ADD 8 EQ","nuevos":["7 + 8 = 15","15"],"quitados":["0"]}',
      '{"comando":"click","result":false,"status":"Element not found"}',
      '{"comando":"caso","caso":2,"pasos":"AC 9 DIV 0 EQ","nuevos":["Error"]}',
    ].join("\n");
    expect(casosDeLaSalida(salida)).toEqual({ casos: 2, resumen: "2 caso(s): AC 7 ADD 8 EQ → 7 + 8 = 15, 15 · AC 9 DIV 0 EQ → Error" });
    expect(casosDeLaSalida('{"comando":"textos","automatico":true,"textos":["15"]}')).toBeUndefined();
  });
});
