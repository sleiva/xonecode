import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compararConMaqueta, controlesDelArbol, filasDelAparato, type GeometriaDelAparato, type MaquetaMedida } from "./geometriaDePantalla.js";
import {
  compararDescripciones,
  filasParaElDescriptor,
  hayQueArreglar,
  htmlComoAparato,
  informeDeComparacion,
  interpretarDescripcion,
  maquetaDeLaDescripcion,
  promptDescribirPantalla,
  type ControlVisto,
  type PantallaDescrita,
} from "./descripcionDePantalla.js";

const geo = JSON.parse(readFileSync(new URL("./__oro__/geometria/calculadora.geometria.json", import.meta.url), "utf8"));
const html: MaquetaMedida = JSON.parse(readFileSync(new URL("./__oro__/geometria/calculadora.maqueta.json", import.meta.url), "utf8"));
const aparato: GeometriaDelAparato = { pantalla: geo.pantalla, barras: geo.barras, controles: controlesDelArbol(geo.arbol) };

/** Lo que un modelo describe de `screen.png` de la calculadora, mirándola SOLA (escrito a mano, como lo pide el prompt). */
const tecla = (texto: string, estilo: Partial<ControlVisto> = {}): ControlVisto => ({ texto, unidades: 1, forma: "pildora", fondo: "#2A2A2E", colorTexto: "#FFFFFF", letra: "grande", borde: false, recortado: false, alineacion: "centro", ...estilo });
const fila = (zona: string, ...textos: string[]) => ({ zona, controles: textos.map((t) => tecla(t)) });
const descrita: PantallaDescrita = {
  filas: [
    fila("cabecera", "[arrastrar]", "[historial]"),
    { zona: "visor", controles: [{ texto: "0", letra: "enorme", alineacion: "derecha", borde: false }] },
    fila("visor", "• DEG", "COPY", "Tape"),
    fila("funciones", "(", ")", "√", "x²", "π", "±"),
    fila("teclado", "AC", "±", "%", "÷"),
    fila("teclado", "7", "8", "9", "×"),
    fila("teclado", "4", "5", "6", "−"),
    fila("teclado", "1", "2", "3", "+"),
    fila("teclado", "0", ".", "[borrar]", "="),
  ],
  extras: [],
};

describe("la maqueta DESCRITA contra el aparato medido (solo un PNG, sin code.html)", () => {
  const h = compararConMaqueta(maquetaDeLaDescripcion(descrita), aparato, { aproximada: true });

  it("encuentra lo que costó diez rondas: la «=» en otra fila y el «0» el doble de ancho", () => {
    expect(h.diferencias).toContain("En la maqueta «0», «.», «=» van en la MISMA fila; en el aparato «=» va en otra.");
    expect(h.diferencias).toContain("«0» mide 1,9 veces el ancho de las de su fila; en la maqueta, 1,0.");
  });

  it("y NUNCA es bloqueante: lo de la maqueta lo dijo un modelo, no se midió", () => {
    expect(h.bloqueantes).toEqual([]);
    expect(h.diferencias.find((d) => d.includes("«√»"))).toMatch(/puede ser una imagen/);
    expect(h.diferencias.join("\n")).not.toMatch(/PROPORCIÓN|«7»|«AC»/);
  });

  it("los datos de ejemplo de un visor no son «no lo encuentro»: solo una nota (descripción REAL de un modelo)", () => {
    const real: PantallaDescrita = {
      ...descrita,
      filas: [{ controles: [tecla("[historial]"), tecla("1,240 × 15% + 450 = 636", { unidades: 6 }), tecla("ANS")] }, ...descrita.filas],
    };
    const hr = compararConMaqueta(maquetaDeLaDescripcion(real), aparato, { aproximada: true });
    expect(hr.diferencias.join("\n")).not.toMatch(/1,240|ANS/);
    expect(hr.notas.find((n) => n.includes("1,240"))).toMatch(/datos de ejemplo/);
    expect(hr.diferencias.join("\n")).toContain("«√»");
  });

  it("sin unidades no compara anchos", () => {
    const sin: PantallaDescrita = { ...descrita, filas: descrita.filas.map((f) => ({ ...f, controles: f.controles.map((c) => ({ texto: c.texto })) })) };
    const hs = compararConMaqueta(maquetaDeLaDescripcion(sin), aparato, { aproximada: true });
    expect(hs.diferencias.join("\n")).not.toContain("veces el ancho");
    expect(hs.diferencias).toContain("En la maqueta «0», «.», «=» van en la MISMA fila; en el aparato «=» va en otra.");
  });
});

describe("la imagen de la maqueta contra su code.html", () => {
  const nombres = { maqueta: "la imagen de la maqueta", aparato: "su code.html" };

  it("si cuentan lo mismo, no dice nada", () => {
    const h = compararConMaqueta(maquetaDeLaDescripcion(descrita, false), htmlComoAparato(html), { aproximada: true, nombres });
    expect(h.diferencias.filter((d) => !d.includes("no lo encuentro"))).toEqual([]);
  });

  it("si no, lo dice con los dos nombres", () => {
    const otra: PantallaDescrita = { ...descrita, filas: [...descrita.filas.slice(0, -2), fila("teclado", "1", "2", "3", "+", "="), fila("teclado", "0", ".", "[borrar]")] };
    const h = compararConMaqueta(maquetaDeLaDescripcion(otra, false), htmlComoAparato(html), { aproximada: true, nombres });
    expect(h.diferencias).toContain("En la imagen de la maqueta «1», «2», «3», «+», «=» van en la MISMA fila; en su code.html «=» va en otra.");
  });
});

describe("compararDescripciones: maqueta y captura con el MISMO esquema", () => {
  /** La captura final de la calculadora, como la contaría el descriptor: teclas en círculo, visor con bordes y texto cortado. */
  const captura: PantallaDescrita = {
    filas: [
      { zona: "cabecera", controles: [{ texto: "CALCULADORA" }] },
      { zona: "visor", controles: [tecla("12 + 3", { recortado: true, borde: true, letra: "normal", alineacion: "derecha" })] },
      { zona: "visor", controles: [{ texto: "15", letra: "enorme", alineacion: "derecha", borde: true }] },
      { zona: "visor", controles: [tecla("RAD", { recortado: true, borde: true }), tecla("COPY", { borde: true })] },
      ...descrita.filas.slice(3).map((f) => ({ ...f, controles: f.controles.map((c) => ({ ...c, forma: "circulo" as const })) })),
    ],
    extras: ["dos rectángulos vacíos con borde fino en el visor"],
  };
  const c = compararDescripciones(descrita, captura);

  it("dice lo que se ve mal con la misma frase, AGRUPADO: dieciséis teclas en círculo son una línea", () => {
    const forma = c.diferencias.find((d) => d.startsWith("forma píldora → círculo"));
    expect(forma).toMatch(/«7», «8», «9»/);
    expect(forma).toMatch(/\(\d+ controles\)\.$/);
    expect(c.diferencias.filter((d) => d.startsWith("forma"))).toHaveLength(1);
  });

  it("el texto RECORTADO, el BORDE que la maqueta no tiene y lo que FALTA", () => {
    expect(c.recortes).toEqual(["«12 + 3» se ve RECORTADO (le falta un trozo de las letras).", "«RAD» se ve RECORTADO (le falta un trozo de las letras)."]);
    expect(c.diferencias).toContain("lleva un BORDE que la maqueta no tiene en «COPY».");
    // Su fila existe en la captura (COPY se emparejó): lo que falta de ella SÍ se dice.
    expect(c.faltan).toEqual(["«DEG»", "«Tape»"]);
    expect(hayQueArreglar(c)).toBe(true);
  });

  it("el «0» del VISOR no se empareja con la tecla «0», y lo que se describe igual no sale", () => {
    // Solo la forma (de las teclas) y el borde de COPY: ni letra, ni alineación del «0», ni nada de la «=».
    expect(c.diferencias.every((d) => d.startsWith("forma píldora → círculo") || d.includes("BORDE"))).toBe(true);
    expect(c.faltan).not.toContain("«0»");
  });

  it("una pantalla contra sí misma no tiene nada que arreglar", () => {
    const sola = compararDescripciones(descrita, descrita);
    expect(hayQueArreglar(sola)).toBe(false);
    expect(informeDeComparacion(sola)).toEqual([expect.stringMatching(/^COMPARACIÓN CONTROL A CONTROL/), "- Nada: cada control se ve como en la maqueta."]);
  });

  it("un color estimado un poco distinto no es una diferencia; otro color sí", () => {
    const parecido = compararDescripciones(descrita, { ...descrita, filas: descrita.filas.map((f) => ({ ...f, controles: f.controles.map((x) => ({ ...x, fondo: "#33333A" })) })) });
    expect(parecido.diferencias).toEqual([]);
    const otro = compararDescripciones(descrita, { ...descrita, filas: [{ controles: [tecla("÷", { colorTexto: "#00E5FF" })] }] });
    expect(otro.diferencias).toContain("color del texto #FFFFFF → #00E0FF en «÷».");
  });

  it("el informe pone lo recortado PRIMERO y enseña los extras de los dos lados, sin contarlos", () => {
    const informe = informeDeComparacion(c);
    expect(informe[1]).toMatch(/RECORTADO/);
    expect(informe.join("\n")).toContain("en la captura: dos rectángulos vacíos con borde fino en el visor. En la maqueta, nada así.");
    expect(hayQueArreglar({ diferencias: [], faltan: [], recortes: [], extras: { maqueta: [], captura: ["algo"] } })).toBe(false);
  });
});

describe("interpretarDescripcion y el prompt", () => {
  it("tira lo que no está en el vocabulario, no inventa unidades y respeta `noVisible`", () => {
    const d = interpretarDescripcion({
      filas: [
        { zona: "teclado", controles: [{ texto: "AC", unidades: 1, forma: "pildora", fondo: "#ff7a59", borde: false, recortado: true, alineacion: "centro" }, { texto: "=", unidades: 99, forma: "hexagono", fondo: "naranja" }, { texto: "" }, { texto: "X", noVisible: true }] },
        [{ texto: "suelta" }],
        "no es fila",
      ],
      extras: ["caja vacía", 3],
    });
    expect(d).toEqual({
      filas: [
        { zona: "teclado", controles: [{ texto: "AC", unidades: 1, forma: "pildora", fondo: "#FF7A59", borde: false, recortado: true, alineacion: "centro" }, { texto: "=" }] },
        { controles: [{ texto: "suelta" }] },
      ],
      extras: ["caja vacía"],
    });
  });

  it("sin filas no hay descripción", () => {
    expect(interpretarDescripcion({ filas: [] })).toBeUndefined();
    expect(interpretarDescripcion(undefined)).toBeUndefined();
  });

  it("a la captura se le dan los controles que EXISTEN, sacados del árbol, fila a fila", () => {
    const filas = filasParaElDescriptor(filasDelAparato(aparato));
    expect(filas.find((f) => f.includes("«7»"))).toMatch(/^fila \d+: «7» «8» «9» «×»$/);
    const prompt = promptDescribirPantalla(filas);
    expect(prompt).toMatch(/FASE 1, GEOMETRÍA[\s\S]*controles que EXISTEN[\s\S]*FASE 2, ESTILO/);
    expect(promptDescribirPantalla()).not.toContain("EXISTEN");
  });
});

describe("lo MENOR no pone el rojo", () => {
  const medido = (texto: string, forma: "recta" | "redondeada" | "pildora" | "circulo", proporcion: number, radio: number, alturaDeLetra = 0.05): ControlVisto => ({ texto, forma, proporcion, radio, alturaDeLetra, centro: { x: 0.5, y: 0.5 } });

  it("una forma VECINA con las dos cifras casi iguales es menor; con otra proporción, no", () => {
    const vecina = compararDescripciones({ filas: [{ controles: [medido("DEG", "pildora", 2.2, 0.39)] }], extras: [] }, { filas: [{ controles: [medido("DEG", "redondeada", 2.2, 0.36)] }], extras: [] });
    expect(vecina.diferencias).toEqual([]);
    expect(vecina.menores?.[0]).toMatch(/^forma píldora/);
    expect(hayQueArreglar(vecina)).toBe(false);
    // El caso de las teclas de la calculadora: radio parecido, 1,2:1 frente a 1,0:1. Se ve.
    const teclas = compararDescripciones({ filas: [{ controles: [medido("7", "redondeada", 1.2, 0.48)] }], extras: [] }, { filas: [{ controles: [medido("7", "circulo", 1.0, 0.5)] }], extras: [] });
    // Se dice como posible diferencia de diseño, pero lo medido del ESTILO no pone el rojo (21-10-2026: falsos positivos).
    expect(teclas.diferencias.join("\n")).toMatch(/forma redondeada/);
    expect(hayQueArreglar(teclas)).toBe(false);
  });

  /** La frontera de 21-10-2026: el TAMAÑO de la letra es un detalle, de uno o de varios controles. Se dice y no pone rojo. */
  it("la letra, de uno o de varios controles, es DETALLE: se dice y no pone el rojo", () => {
    const fila = (alturas: number[]) => ({ filas: [{ controles: alturas.map((a, i) => ({ ...medido(String(i + 1), "redondeada", 1.2, 0.3, a), centro: { x: i / 4, y: 0.5 } })) }], extras: [] });
    expect(hayQueArreglar(compararDescripciones(fila([0.05, 0.05, 0.05]), fila([0.09, 0.05, 0.05])))).toBe(false);
    const varios = compararDescripciones(fila([0.05, 0.05, 0.05]), fila([0.035, 0.035, 0.035]));
    expect(hayQueArreglar(varios)).toBe(false);
    expect(varios.menores?.join("\n")).toMatch(/letra/);
  });

  /** Petición suya: «una etiqueta con un color diferente y que sea un elemento importante es una diferencia». */
  it("el color de un texto IMPORTANTE (letra grande) es DISEÑO; el de uno secundario, DETALLE", () => {
    const texto = (t: string, alturaDeLetra: number, colorTexto: string, x: number): ControlVisto => ({ texto: t, alturaDeLetra, colorTexto, centro: { x, y: 0.5 } });
    const pantalla = (cTitulo: string, cEtiqueta: string) => ({
      filas: [{ controles: [texto("ENTREGAS", 0.08, cTitulo, 0.2), texto("pend.", 0.04, cEtiqueta, 0.5), texto("hoy", 0.04, "#808080", 0.8)] }],
      extras: [],
    });
    const titulo = compararDescripciones(pantalla("#F0F0F0", "#808080"), pantalla("#A0A0A0", "#808080"));
    expect(titulo.diferencias.join("\n")).toMatch(/color del texto .* en «ENTREGAS»/);
    const etiqueta = compararDescripciones(pantalla("#F0F0F0", "#808080"), pantalla("#F0F0F0", "#E02020"));
    expect(hayQueArreglar(etiqueta)).toBe(false);
    expect(etiqueta.menores?.join("\n")).toMatch(/color del texto .* en «pend\.»/);
  });

  it("un texto TRADUCIDO en su sitio va como nota y no pone el rojo; su estilo sí se compara", () => {
    const en = (texto: string, colorTexto: string): ControlVisto => ({ ...medido(texto, "redondeada", 2.5, 0.3), colorTexto });
    const traducido = compararDescripciones(
      { filas: [{ controles: [en("content_copy COPY", "#E0C0B0")] }], extras: [] },
      { filas: [{ controles: [en("COPIAR", "#E0C0B0")] }], extras: [] }
    );
    expect(traducido.notas).toEqual(["«COPIAR» donde la maqueta dice «COPY»: otro texto en su sitio (traducido, u otro estado). No cuenta; su estilo sí se compara."]);
    expect(traducido.faltan).toEqual([]);
    expect(hayQueArreglar(traducido)).toBe(false);
    const otroColor = compararDescripciones(
      { filas: [{ controles: [en("COPY", "#E0C0B0")] }], extras: [] },
      { filas: [{ controles: [en("COPIAR", "#202020")] }], extras: [] }
    );
    // Su estilo se compara: el color de un texto sale (aquí es el único, así que es detalle: no hay con qué decir que destaca).
    expect([...otroColor.diferencias, ...(otroColor.menores ?? [])].join("\n")).toContain("color del texto");
  });

  it("un DATO DE EJEMPLO de la maqueta no falta: con otro valor es una nota, y sin él se dice sin rojo", () => {
    // Medido en Maset (liquidaciones): «3 Liquidaciones» de la maqueta frente a «5 Liquidaciones» del aparato era un «falta».
    const en = (texto: string, x: number, y: number): ControlVisto => ({ ...medido(texto, "redondeada", 2.5, 0.3), centro: { x, y } });
    const maqueta: PantallaDescrita = { filas: [{ controles: [en("RECAUDACIÓN ACUMULADA", 0.3, 0.2), en("3 Liquidaciones", 0.8, 0.2)] }], extras: [] };
    const otroValor = compararDescripciones(maqueta, { filas: [{ controles: [en("RECAUDACIÓN ACUMULADA", 0.3, 0.2)] }, { controles: [en("5 Liquidaciones", 0.2, 0.9)] }], extras: [] });
    expect(otroValor.faltan).toEqual([]);
    expect(otroValor.notas?.join("\n")).toContain("dato de ejemplo con otro valor");
    const sinEl = compararDescripciones(maqueta, { filas: [{ controles: [en("RECAUDACIÓN ACUMULADA", 0.3, 0.2)] }], extras: [] });
    expect(sinEl.faltan).toEqual([]);
    expect(hayQueArreglar(sinEl)).toBe(false);
    expect(sinEl.diferencias.join("\n")).toContain("dato de ejemplo de la maqueta y no está");
  });

  it("una cifra no es la traducción de una palabra: «19» no empareja con «COPY»", () => {
    const c = compararDescripciones(
      { filas: [{ controles: [medido("COPY", "redondeada", 2.5, 0.3), medido("7", "redondeada", 1.2, 0.3)] }], extras: [] },
      { filas: [{ controles: [medido("19", "redondeada", 2.5, 0.3), medido("7", "redondeada", 1.2, 0.3)] }], extras: [] }
    );
    expect(c.notas).toBeUndefined();
    expect(c.faltan).toEqual(["«COPY»"]);
  });
});


/** El pie de Maset: en la maqueta «Framework:» va suelto y en la captura dentro de una línea con las tres etiquetas. */
describe("compararDescripciones: lo que va dentro de otro texto de la captura no falta", () => {
  const maqueta: PantallaDescrita = { filas: [fila("pie", "Framework:", "PIE")], extras: [] };
  const captura: PantallaDescrita = { filas: [fila("pie", "Aplicación: 10.09.2026-1 Framework: 5.0.5.7dev Versión Code: 28", "PIE")], extras: [] };

  it("no está en `faltan` ni pone el rojo; va como nota", () => {
    const c = compararDescripciones(maqueta, captura);
    expect(c.faltan).toEqual([]);
    expect(hayQueArreglar(c)).toBe(false);
    expect(c.notas?.some((n) => n.includes("«Framework:»") && n.includes("dentro de"))).toBe(true);
  });

  it("sin esa línea, sí falta", () => {
    const sola: PantallaDescrita = { filas: [fila("pie", "PIE")], extras: [] };
    expect(compararDescripciones(maqueta, sola).faltan).toEqual(["«Framework:»"]);
  });
});

/**
 * **Lo medido del ESTILO no pone el rojo** (21-10-2026, validado con cinco pantallas de Maset contra el ojo): el bloque
 * de arriba emparejado con otro, el color de una flecha tomado por el de «Volver», un borde dorado que «no tiene» la
 * maqueta… Se dice como POSIBLE diferencia de diseño. Lo que sí pone el rojo: un texto que FALTA o que se ve RECORTADO.
 */
describe("hayQueArreglar: solo lo que falta o se ve recortado", () => {
  it("un texto que falta pone el rojo; una forma o un color medidos, no", () => {
    const c = (faltan: string[], diferencias: string[]) => ({ diferencias, faltan, recortes: [], extras: { maqueta: [], captura: [] } });
    expect(hayQueArreglar(c(["«Limpiar»"], []))).toBe(true);
    expect(hayQueArreglar(c([], ["forma recta → píldora en «Entrar»."]))).toBe(false);
    expect(informeDeComparacion(c([], ["forma recta → píldora en «Entrar»."])).join("\n")).toMatch(/posible diseño, medido/);
  });
});
