import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  cajaParaElEstilo,
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

describe("una pantalla de tarjetas (Maset): datos de ejemplo, texto dentro de una imagen", () => {
  // Maqueta 400×800; aparato 1000×2000.
  const maqueta: MaquetaMedida = {
    ancho: 400,
    alto: 800,
    elementos: [
      { texto: "MASET", caja: { x: 150, y: 40, ancho: 100, alto: 20 } },
      { texto: "VINS & CAVES • 1777", caja: { x: 120, y: 70, ancho: 160, alto: 14 } },
      { texto: "09:41", caja: { x: 20, y: 10, ancho: 30, alto: 14 } },
      { texto: "INCIDENCIAS", caja: { x: 100, y: 400, ancho: 100, alto: 20 } },
      { texto: "0", caja: { x: 300, y: 400, ancho: 20, alto: 20 } },
      { texto: "7", caja: { x: 20, y: 600, ancho: 80, alto: 60 }, boton: true },
    ],
  };
  const aparato: GeometriaDelAparato = {
    pantalla: { ancho: 1000, alto: 2000 },
    controles: [
      { nombre: "IMGLOGO", tipo: "prop", clase: "IMG", caja: { x: 300, y: 80, ancho: 400, alto: 150 } },
      { nombre: "MAP_TIT", texto: "INCIDENCIAS", tipo: "prop", clase: "L", caja: { x: 250, y: 1000, ancho: 250, alto: 50 } },
      { nombre: "MAP_CONT", texto: "--", tipo: "prop", clase: "T", caja: { x: 760, y: 1000, ancho: 40, alto: 50 } },
      { nombre: "IMGCHEV", tipo: "prop", clase: "IMG", caja: { x: 820, y: 1000, ancho: 40, alto: 50 } },
    ],
  };
  const h = compararConMaqueta(maqueta, aparato);

  it("un texto de la maqueta dibujado dentro de una imagen del aparato no falta", () => {
    expect(h.bloqueantes.join("\n")).not.toContain("VINS");
    expect(h.notas).toContain("dibujado dentro de una imagen (no falta): «VINS & CAVES • 1777».");
  });

  it("una cifra que no es botón es un dato de ejemplo: no falta, y no se empareja con la imagen de al lado", () => {
    expect(h.bloqueantes.join("\n")).not.toMatch(/«0»|09:41/);
    expect(h.notas.some((n) => n.startsWith("datos de ejemplo") && n.includes("«09:41»") && n.includes("«0»"))).toBe(true);
    expect(emparejar(maqueta, aparato).parejas.some((p) => p.maqueta.texto === "0")).toBe(false);
  });

  it("pero una TECLA que falta sigue siendo bloqueante", () => {
    expect(h.bloqueantes).toContain("«7» de la maqueta NO está en el aparato (ningún control con ese texto).");
  });
});

describe("el TAMAÑO de una imagen respecto a su pantalla (Maset: px de la maqueta copiados como p)", () => {
  // Maqueta 420 de ancho; aparato 1080. Tres iconos de 24 px en la maqueta (5,7 % del ancho); en el aparato, de 24 px
  // (2,2 %): unas 2,6 veces menores. Ninguno tiene vecina distinta, así que lo relativo no lo veía.
  const maqueta: MaquetaMedida = {
    ancho: 420,
    alto: 900,
    elementos: [
      { texto: "phone", caja: { x: 20, y: 200, ancho: 24, alto: 24 } },
      { texto: "schedule", caja: { x: 20, y: 400, ancho: 24, alto: 24 } },
      { texto: "chevron_right", caja: { x: 370, y: 600, ancho: 24, alto: 24 } },
      { texto: "ALBARANES", caja: { x: 60, y: 200, ancho: 200, alto: 24 } },
    ],
  };
  const aparato = (ladoDelIcono: number): GeometriaDelAparato => ({
    pantalla: { ancho: 1080, alto: 2314 },
    controles: [
      { nombre: "IMG_TEL", tipo: "prop", clase: "IMG", caja: { x: 51, y: 514, ancho: ladoDelIcono, alto: ladoDelIcono } },
      { nombre: "IMG_HORA", tipo: "prop", clase: "IMG", caja: { x: 51, y: 1028, ancho: ladoDelIcono, alto: ladoDelIcono } },
      { nombre: "IMG_CHEV", tipo: "prop", clase: "IMG", caja: { x: 951, y: 1543, ancho: ladoDelIcono, alto: ladoDelIcono } },
      { nombre: "MAP_TIT", texto: "ALBARANES", tipo: "prop", clase: "L", caja: { x: 154, y: 514, ancho: 514, alto: 62 } },
    ],
  });

  it("iconos 2,6 veces menores: UNA línea con los tres, y su porcentaje del ancho en cada lado", () => {
    const tamaño = compararConMaqueta(maqueta, aparato(24)).diferencias.filter((d) => d.includes("veces MENOR"));
    expect(tamaño).toEqual([
      "3 imágenes (el icono «phone», el icono «schedule», el icono «chevron_right») salen a un tamaño unas 2,6 veces MENOR que en la maqueta: la primera ocupa el 2,2 % del ancho de la pantalla en el aparato y el 5,7 % en la maqueta.",
    ]);
  });

  it("convertidos con convertir_a_p (62p ≈ 62 px en un aparato de 1080) no dicen nada", () => {
    expect(compararConMaqueta(maqueta, aparato(62)).diferencias.join("\n")).not.toMatch(/veces (MENOR|MAYOR)/);
  });

  it("una maqueta DESCRITA (aproximada) no tiene un ancho de pantalla de verdad: no se compara", () => {
    expect(compararConMaqueta(maqueta, aparato(24), { aproximada: true }).diferencias.join("\n")).not.toContain("veces MENOR");
  });
});

describe("un CONTADOR que no se pinta no es un dato de ejemplo (Maset: «12» sobre «pend.»)", () => {
  const maqueta: MaquetaMedida = {
    ancho: 420,
    alto: 900,
    elementos: [
      { texto: "ENTREGAS", caja: { x: 100, y: 220, ancho: 120, alto: 20 } },
      { texto: "12", caja: { x: 330, y: 220, ancho: 16, alto: 16 } },
      { texto: "pend.", caja: { x: 326, y: 238, ancho: 26, alto: 10 } },
      { texto: "09:41", caja: { x: 20, y: 10, ancho: 30, alto: 14 } },
    ],
  };
  const aparato: GeometriaDelAparato = {
    pantalla: { ancho: 1080, alto: 2314 },
    controles: [
      { nombre: "MAP_TIT", texto: "ENTREGAS", tipo: "prop", clase: "L", caja: { x: 257, y: 566, ancho: 309, alto: 51 } },
      { nombre: "MAP_PEND", texto: "pend.", tipo: "prop", clase: "L", caja: { x: 838, y: 612, ancho: 67, alto: 26 } },
    ],
  };
  const h = compararConMaqueta(maqueta, aparato);

  it("la cifra junto a una etiqueta que SÍ está se dice: falta el número", () => {
    expect(h.diferencias).toContain(
      "«12» de la maqueta, junto a «pend.», no se pinta en el aparato: su etiqueta está y el número no (su valor puede ser de ejemplo; que su sitio quede vacío, no)."
    );
    expect(h.notas.join("\n")).not.toContain("«12»");
  });

  it("una cifra suelta (el reloj de una barra simulada) sigue siendo un dato de ejemplo", () => {
    expect(h.notas.some((n) => n.startsWith("datos de ejemplo") && n.includes("«09:41»"))).toBe(true);
  });
  it("pintado con OTRO valor no es que falte: «51» encima de «pend.» en el aparato (medido en Maset)", () => {
    const conValor = compararConMaqueta(maqueta, {
      ...aparato,
      controles: [...aparato.controles, { nombre: "MAP_CNT1", texto: "51", tipo: "prop", clase: "T", caja: { x: 838, y: 567, ancho: 67, alto: 45 } }],
    });
    expect(conValor.diferencias.join("\n")).not.toContain("no se pinta");
    expect(conValor.notas.join("\n")).toContain("«12»");
  });
});

describe("cajaParaElEstilo: el estilo de un texto se mide en su ENVOLTORIO (el frame que hace de botón o de píldora)", () => {
  const caja = (x: number, y: number, ancho: number, alto: number) => ({ x, y, ancho, alto });
  const g: GeometriaDelAparato = {
    pantalla: { ancho: 1080, alto: 2400 },
    controles: [
      // SALIR: un frame con un icono y una etiqueta dentro
      { nombre: "frmSalir", tipo: "frame", caja: caja(55, 2100, 968, 138) },
      { nombre: "IMGSALIR", tipo: "prop", clase: "IMG", caja: caja(270, 2140, 55, 55) },
      { nombre: "MAP_TLSALIR", tipo: "prop", clase: "L", texto: "SALIR / CERRAR SESIÓN", caja: caja(348, 2140, 493, 58) },
      // Una tarjeta: un frame con varios textos dentro
      { nombre: "card", tipo: "frame", caja: caja(55, 600, 968, 220) },
      { nombre: "MAP_TIT", tipo: "prop", clase: "L", texto: "ENTREGAS", caja: caja(250, 630, 300, 60) },
      { nombre: "MAP_SUB", tipo: "prop", clase: "L", texto: "Reparto", caja: caja(250, 700, 500, 50) },
    ],
  };
  const de = (nombre: string) => cajaParaElEstilo(g.controles.find((c) => c.nombre === nombre)!, g);

  it("la etiqueta de un botón hecho con un frame se mide en el frame (Maset: «le falta el borde» falso en SALIR)", () => {
    expect(de("MAP_TLSALIR")).toEqual(caja(55, 2100, 968, 138));
  });

  it("un texto de una tarjeta (con más textos al lado) se mide en su propia caja", () => {
    expect(de("MAP_TIT")).toEqual(caja(250, 630, 300, 60));
  });
});

describe("los bloqueantes van MARCADOS en el informe, y se leen de vuelta", () => {
  it("la marca está en la línea y `bloqueantesDelInforme` los saca sin ella", async () => {
    const { bloqueantesDelInforme, MARCA_DE_BLOQUEANTE } = await import("./geometriaDePantalla.js");
    const lineas = informeDeGeometria({ bloqueantes: ["«=» queda TAPADO"], diferencias: ["otra cosa"], notas: [] }, true);
    expect(lineas).toContain(`- ${MARCA_DE_BLOQUEANTE}«=» queda TAPADO`);
    expect(bloqueantesDelInforme(lineas.join("\n"))).toEqual(["«=» queda TAPADO"]);
  });
});

/**
 * La PROPORCIÓN, solo de un botón. Medido en Maset: la caja de «ENTREGAS» en la maqueta es lo que ocupan sus letras y
 * en el aparato la etiqueta ocupa su ancho asignado: salía «aplastado» y costó otra vuelta al desarrollador.
 */
describe("la proporción de un control se compara solo si en la maqueta es un BOTÓN", () => {
  const maqueta: MaquetaMedida = {
    ancho: 400,
    alto: 800,
    elementos: [
      { texto: "ENTREGAS", caja: { x: 100, y: 200, ancho: 80, alto: 20 } },
      { texto: "SALIR", caja: { x: 20, y: 700, ancho: 360, alto: 40 }, boton: true },
    ],
  };
  const aparato: GeometriaDelAparato = {
    pantalla: { ancho: 1000, alto: 2000 },
    controles: [
      // La etiqueta ocupa su ancho asignado: proporción 0,1 frente a 0,25 de las letras de la maqueta.
      { nombre: "MAP_TIT", texto: "ENTREGAS", tipo: "prop", clase: "L", caja: { x: 250, y: 500, ancho: 600, alto: 50 } },
      // El botón, en cambio, sale el doble de alto: 0,22 frente a 0,11.
      { nombre: "BT6", texto: "SALIR", tipo: "prop", clase: "B", caja: { x: 50, y: 1750, ancho: 900, alto: 200 } },
    ],
  };
  const h = compararConMaqueta(maqueta, aparato);

  it("un texto suelto no sale «aplastado»; el botón estirado sí", () => {
    const todo = h.diferencias.join("\n");
    expect(todo).not.toMatch(/«ENTREGAS» tiene otra PROPORCIÓN/);
    expect(todo).toMatch(/«SALIR» tiene otra PROPORCIÓN/);
  });
});
