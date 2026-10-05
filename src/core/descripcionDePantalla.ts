/**
 * El DESCRIPTOR DE PANTALLA: lo que el modelo ve en UNA imagen —la maqueta o la captura, cada una SOLA— con el
 * MISMO esquema y el MISMO vocabulario cerrado, para que la comparación la haga el CÓDIGO. Puro.
 *
 * Existe por la calculadora de MyAllXOne. El crítico comparaba las dos imágenes a la vez y contestaba en prosa
 * libre: vio el visor roto, pero en la misma lista dijo que el «0» de la maqueta era una píldora ancha y que la
 * «=» era más grande que las demás, las dos cosas falsas, y no había forma de separar lo cierto de lo inventado.
 * La maqueta ya se describía con un esquema; la captura, no. Ahora hablan el mismo idioma.
 *
 * Cuatro reglas:
 *
 * - **Cada imagen se describe SOLA.** Con las dos delante el modelo compara de memoria y lo que ve en una se
 *   contagia a la otra.
 * - **En la captura, la ESTRUCTURA la pone el árbol de controles** (`filasDelAparato`): se le dice qué controles
 *   existen y en qué fila, y solo describe cómo se ve cada uno. Así no puede inventarse una fila ni un botón.
 * - **Vocabulario CERRADO** (formas, tamaños de letra, alineación, colores en `#RRGGBB`): lo que no está en la
 *   lista se tira, no se interpreta.
 * - **La comparación es de CÓDIGO** (`compararDescripciones`), control a control y siempre con la misma frase,
 *   agrupada por diferencia: «forma píldora → círculo en «7», «8»…». Un texto RECORTADO se dice siempre.
 *
 * Las filas descritas de una maqueta sin `code.html` se comparan además contra el árbol medido
 * (`compararConMaqueta` en modo `aproximada`, vía `maquetaDeLaDescripcion`).
 */
import { textoParaEmparejar, type ControlDelAparato, type GeometriaDelAparato, type MaquetaMedida } from "./geometriaDePantalla.js";

export const FORMAS = ["pildora", "redondeada", "recta", "circulo"] as const;
export const LETRAS = ["pequena", "normal", "grande", "enorme"] as const;
export const ALINEACIONES = ["izquierda", "centro", "derecha"] as const;
export type Forma = (typeof FORMAS)[number];
export type Letra = (typeof LETRAS)[number];
export type Alineacion = (typeof ALINEACIONES)[number];

export interface ControlVisto {
  /** El texto VISIBLE; un icono sin texto va entre corchetes: `[borrar]`. */
  texto: string;
  /** Su ancho respecto al más estrecho de su fila (1, 2…). Ausente: no se compara su ancho. */
  unidades?: number;
  forma?: Forma;
  fondo?: string;
  colorTexto?: string;
  letra?: Letra;
  /** Lleva un CONTORNO visible. */
  borde?: boolean;
  /** Su texto se ve CORTADO por algún borde. */
  recortado?: boolean;
  alineacion?: Alineacion;
  // Las CIFRAS, cuando el control se MIDE en los píxeles (`estiloMedido.ts`) en vez de describirse.
  /** Radio de las esquinas del fondo entre el lado corto (0 recto … 0,5 extremo redondo). */
  radio?: number;
  /** Ancho entre alto de su fondo. */
  proporcion?: number;
  /** Altura de la tinta en fracción del ANCHO de la pantalla. */
  alturaDeLetra?: number;
  /** Su centro en fracción de la pantalla: con él se empareja, en vez de con la fila y la columna. */
  centro?: { x: number; y: number };
}

export interface FilaVista {
  /** Dónde está: `cabecera`, `visor`, `teclado`… (texto libre, corto). */
  zona?: string;
  controles: ControlVisto[];
}

export interface PantallaDescrita {
  /** De arriba abajo; cada fila de izquierda a derecha. */
  filas: FilaVista[];
  /** Lo visible que NO es un control: una caja vacía con borde, una línea, un marco. */
  extras: string[];
}

const TOPE_DE_FILAS = 30;
const TOPE_POR_FILA = 12;
const TOPE_DE_UNIDADES = 6;
const TOPE_DE_EXTRAS = 8;
const TOPE_DE_EXTRA = 160;

/**
 * El prompt, el MISMO para la maqueta y para la captura. `controlesQueExisten` (de la captura, del árbol): las
 * filas con sus textos, que el modelo tiene que usar tal cual.
 */
export function promptDescribirPantalla(controlesQueExisten?: readonly string[]): string {
  return [
    "Te doy UNA imagen: una pantalla de app móvil. NO la compares con nada: descríbela, en DOS FASES y en este orden.",
    "",
    "FASE 1, GEOMETRÍA. Las filas de controles de ARRIBA ABAJO, cada una con su `zona` (cabecera, visor, teclado…); en",
    "cada fila, los controles de IZQUIERDA A DERECHA, cada uno con:",
    "- `texto`: el texto visible EXACTO (respeta los signos: «÷», «×», «−», «√»). Un icono sin texto, su nombre entre",
    "  corchetes: «[borrar]», «[historial]».",
    "- `unidades`: su ancho respecto al control MÁS ESTRECHO de su fila (1, 2, 3…). Si todos miden igual, todos 1.",
    "Un bloque que ocupa la fila entera (un visor, un título) es una fila de un solo elemento.",
    ...(controlesQueExisten === undefined || controlesQueExisten.length === 0
      ? []
      : [
          "",
          "Estos son los controles que EXISTEN en esta pantalla, fila a fila (medidos, no los adivines): usa ESTAS filas y",
          "ESTOS textos, sin añadir ni quitar. Si uno no se ve en la imagen, ponle `\"noVisible\": true`.",
          ...controlesQueExisten.map((f) => `  ${f}`),
        ]),
    "",
    "FASE 2, ESTILO. Para CADA control de la fase 1, en el mismo objeto:",
    `- \`forma\`: una de ${FORMAS.join(", ")} (un círculo es tan alto como ancho; una píldora es más ancha que alta con`,
    "  los extremos redondos).",
    "- `fondo`: el color de su fondo, como #RRGGBB. `colorTexto`: el color de su texto o icono, como #RRGGBB.",
    `- \`letra\`: el tamaño del texto, uno de ${LETRAS.join(", ")}.`,
    "- `borde`: true si tiene un contorno o una línea visible alrededor.",
    "- `recortado`: true si su texto se ve CORTADO por algún borde (le falta un trozo de las letras).",
    `- \`alineacion\`: dónde va su texto dentro del control, una de ${ALINEACIONES.join(", ")}.`,
    "",
    "Y en `extras`, en frases cortas, lo que SE VE y no es ningún control: cajas vacías, rectángulos con borde, líneas,",
    "marcos. Si no hay nada así, lista vacía.",
    "",
    "Describe SOLO lo que se ve. No inventes controles.",
    "",
    'Contesta SOLO este JSON: {"filas":[{"zona":"teclado","controles":[{"texto":"7","unidades":1,"forma":"circulo","fondo":"#2A2E36","colorTexto":"#FFFFFF","letra":"grande","borde":false,"recortado":false,"alineacion":"centro"}, …]}, …],"extras":["…"]}',
  ].join("\n");
}

/** La fila de la captura como se le da al modelo: los textos, y un control sin texto por su nombre entre corchetes. */
export function filasParaElDescriptor(filas: readonly (readonly ControlDelAparato[])[]): string[] {
  return filas.map((fila, i) => `fila ${i + 1}: ${fila.map((c) => `«${c.texto ?? `[${c.nombre ?? "sin nombre"}]`}»`).join(" ")}`);
}

const esTexto = (x: unknown): x is string => typeof x === "string" && x.trim() !== "";
const color = (x: unknown): string | undefined => (typeof x === "string" && /^#[0-9a-fA-F]{6}$/.test(x) ? x.toUpperCase() : undefined);
const booleano = (x: unknown): boolean | undefined => (typeof x === "boolean" ? x : undefined);

function controlVisto(c: Record<string, unknown>): ControlVisto | undefined {
  if (!esTexto(c["texto"]) || c["noVisible"] === true) return undefined;
  const u = c["unidades"];
  const campos: ControlVisto = { texto: (c["texto"] as string).trim() };
  if (typeof u === "number" && Number.isFinite(u) && u >= 1 && u <= TOPE_DE_UNIDADES) campos.unidades = u;
  const forma = FORMAS.find((f) => f === c["forma"]);
  if (forma !== undefined) campos.forma = forma;
  const fondo = color(c["fondo"]);
  if (fondo !== undefined) campos.fondo = fondo;
  const colorTexto = color(c["colorTexto"]);
  if (colorTexto !== undefined) campos.colorTexto = colorTexto;
  const letra = LETRAS.find((l) => l === c["letra"]);
  if (letra !== undefined) campos.letra = letra;
  const borde = booleano(c["borde"]);
  if (borde !== undefined) campos.borde = borde;
  const recortado = booleano(c["recortado"]);
  if (recortado !== undefined) campos.recortado = recortado;
  const alineacion = ALINEACIONES.find((a) => a === c["alineacion"]);
  if (alineacion !== undefined) campos.alineacion = alineacion;
  return campos;
}

/** La descripción que devolvió el modelo, o `undefined` si no trae al menos una fila. Lo que no encaja se tira. */
export function interpretarDescripcion(objeto: Record<string, unknown> | undefined): PantallaDescrita | undefined {
  if (objeto === undefined || !Array.isArray(objeto["filas"])) return undefined;
  const filas = (objeto["filas"] as unknown[])
    .slice(0, TOPE_DE_FILAS)
    .map((f): FilaVista | undefined => {
      // Se acepta también la fila como lista suelta de controles.
      const fila = Array.isArray(f) ? { controles: f } : typeof f === "object" && f !== null ? (f as Record<string, unknown>) : undefined;
      if (fila === undefined || !Array.isArray(fila["controles"])) return undefined;
      const controles = (fila["controles"] as unknown[])
        .filter((c): c is Record<string, unknown> => typeof c === "object" && c !== null)
        .map(controlVisto)
        .filter((c): c is ControlVisto => c !== undefined)
        .slice(0, TOPE_POR_FILA);
      return controles.length === 0 ? undefined : { ...(esTexto(fila["zona"]) ? { zona: (fila["zona"] as string).trim().slice(0, 30) } : {}), controles };
    })
    .filter((f): f is FilaVista => f !== undefined);
  if (filas.length === 0) return undefined;
  const extras = (Array.isArray(objeto["extras"]) ? (objeto["extras"] as unknown[]) : [])
    .filter(esTexto)
    .map((e) => (e.length > TOPE_DE_EXTRA ? `${e.slice(0, TOPE_DE_EXTRA - 1)}…` : e.trim()))
    .slice(0, TOPE_DE_EXTRAS);
  return { filas, extras };
}

const UNIDAD = 10;

/**
 * La descripción como cajas de una REJILLA: cada fila a su altura, cada control a lo ancho de sus unidades. Solo
 * sirven para decir fila, orden y ancho relativo (`compararConMaqueta` en modo `aproximada`); un control sin
 * unidades —o todos, con `conAnchos: false`— va marcado `sinAncho`.
 */
export function maquetaDeLaDescripcion(d: PantallaDescrita, conAnchos = true): MaquetaMedida {
  const elementos: MaquetaMedida["elementos"] = [];
  let anchoMaximo = 0;
  d.filas.forEach((fila, f) => {
    let x = 0;
    for (const c of fila.controles) {
      const unidades = c.unidades ?? 1;
      elementos.push({
        texto: c.texto,
        caja: { x, y: f * UNIDAD, ancho: unidades * UNIDAD, alto: UNIDAD * 0.8 },
        ...(conAnchos && c.unidades !== undefined ? {} : { sinAncho: true as const }),
      });
      x += unidades * UNIDAD;
    }
    anchoMaximo = Math.max(anchoMaximo, x);
  });
  return { ancho: Math.max(anchoMaximo, UNIDAD), alto: d.filas.length * UNIDAD, elementos };
}

/** La maqueta MEDIDA (las cajas del `code.html`) vista como si fuera un aparato, para compararla con la descrita. */
export function htmlComoAparato(m: MaquetaMedida): GeometriaDelAparato {
  return {
    pantalla: { ancho: m.ancho, alto: m.alto },
    controles: m.elementos.map((e) => ({ ...(textoParaEmparejar(e.texto) === "" ? {} : { texto: e.texto }), caja: e.caja })),
  };
}

// ---------------------------------------------------------------- comparar dos descripciones

const NOMBRE_DE_FORMA: Record<Forma, string> = { pildora: "píldora", redondeada: "redondeada", recta: "recta", circulo: "círculo" };
const NOMBRE_DE_LETRA: Record<Letra, string> = { pequena: "pequeña", normal: "normal", grande: "grande", enorme: "enorme" };

/**
 * Cuánto se separan dos colores para contarlo: una distancia en RGB. El modelo ESTIMA el color de una imagen y
 * varía de una vez a otra en la misma; por debajo de esto es la misma tinta descrita dos veces.
 */
const DISTANCIA_DE_COLOR = 90;

/** Un color redondeado a pasos de 16 por canal: para AGRUPAR, que «#BDF3FE» y «#BDF4FF» son la misma tinta. */
const redondo = (h: string): string =>
  `#${[1, 3, 5].map((i) => Math.min(255, Math.round(parseInt(h.slice(i, i + 2), 16) / 16) * 16).toString(16).padStart(2, "0")).join("").toUpperCase()}`;

function distanciaDeColor(a: string, b: string): number {
  const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [rgb(a), rgb(b)];
  return Math.sqrt(x.reduce((s, v, i) => s + (v - y[i]!) ** 2, 0));
}

const ICONO = "\u0000icono";
/** La clave con que se emparejan: el texto (con sus alias). Todos los iconos comparten clave y se emparejan por cercanía. */
function clave(c: ControlVisto): string {
  const t = textoParaEmparejar(c.texto);
  return t !== "" ? t : ICONO;
}
/** Hasta dónde se busca pareja a un icono, o a un texto que en la captura dice otra cosa (un DEG que está en RAD). */
const CERCA = 0.12;
const MUY_CERCA = 0.06;
/** Un texto con letras o cifras: en uno solo de signos («−», «.»), la altura de la tinta no es el tamaño de la letra. */
const conLetras = (t: string): boolean => /[0-9A-Za-zÁÉÍÓÚáéíóúÑñ]/.test(textoParaEmparejar(t));
const decimal = (x: number, d = 1): string => x.toFixed(d).replace(".", ",");

export interface ComparacionDeDescripciones {
  /** «forma píldora → círculo en «7», «8»…»: una línea por diferencia, con los controles que la tienen. */
  diferencias: string[];
  /** Lo de la maqueta que no está en la captura. */
  faltan: string[];
  /** Texto RECORTADO en la captura: se dice siempre, haya maqueta o no. */
  recortes: string[];
  /**
   * Lo que se ve y no es un control (cajas vacías, rectángulos con borde…), de cada lado. Texto libre: se ENSEÑA
   * para que lo mire quien arregla, pero no cuenta para el veredicto —no se puede comparar por código—.
   */
  extras: { maqueta: string[]; captura: string[] };
}

/** El texto de un control en un hallazgo. */
const nombrar = (c: ControlVisto): string => `«${c.texto}»`;

/**
 * La comparación, control a control y con la misma frase siempre. Se empareja por TEXTO en orden de lectura
 * (el segundo «±» de la maqueta con el segundo de la captura). Las diferencias iguales se AGRUPAN: dieciséis
 * teclas que pasan de píldora a círculo son una línea, no dieciséis.
 */
export function compararDescripciones(maqueta: PantallaDescrita, captura: PantallaDescrita): ComparacionDeDescripciones {
  /**
   * Cada control con su SITIO: su centro medido si lo trae (fracción de la pantalla), o su fila y columna relativas
   * si viene descrito. Se empareja por TEXTO y, entre los del mismo texto, por cercanía: por texto solo, el «0» del
   * visor de la maqueta se emparejaba con la tecla «0» de la captura.
   */
  const situar = (d: PantallaDescrita) =>
    d.filas.flatMap((f, i) =>
      f.controles.map((c, j) => ({
        c,
        fila: i,
        y: c.centro?.y ?? (d.filas.length > 1 ? i / (d.filas.length - 1) : 0),
        x: c.centro?.x ?? (f.controles.length > 1 ? j / (f.controles.length - 1) : 0.5),
      }))
    );
  const ms = situar(maqueta);
  const as = situar(captura);
  const lejania = (i: number, j: number) => Math.abs(ms[i]!.y - as[j]!.y) + Math.abs(ms[i]!.x - as[j]!.x) / 4;
  const pareja = new Map<number, number>();
  const usadas = new Set<number>();
  const emparejar = (candidatas: { i: number; j: number; d: number }[]) => {
    for (const { i, j } of candidatas.sort((x, y) => x.d - y.d)) {
      if (pareja.has(i) || usadas.has(j)) continue;
      pareja.set(i, j);
      usadas.add(j);
    }
  };
  const todas: { i: number; j: number; d: number }[] = [];
  ms.forEach((m, i) => as.forEach((a, j) => clave(m.c) === clave(a.c) && todas.push({ i, j, d: lejania(i, j) })));
  emparejar(todas.filter(({ i, d }) => clave(ms[i]!.c) !== ICONO || d <= CERCA));

  const grupos = new Map<string, string[]>();
  const anotar = (que: string, quien: ControlVisto) => grupos.set(que, [...(grupos.get(que) ?? []), nombrar(quien)]);

  // Un texto que en la captura dice OTRA cosa en el mismo sitio (un interruptor DEG que está en RAD): no falta. Solo
  // con los dos sitios MEDIDOS: con la fila y la columna de una descripción, el «0» de muestra del visor «estaba en
  // el mismo sitio» que el «12 + 3» de la captura.
  const otroTexto: { i: number; j: number; d: number }[] = [];
  ms.forEach((m, i) => {
    if (pareja.has(i) || clave(m.c) === ICONO || m.c.centro === undefined) return;
    as.forEach((a, j) => !usadas.has(j) && clave(a.c) !== ICONO && a.c.centro !== undefined && lejania(i, j) <= MUY_CERCA && otroTexto.push({ i, j, d: lejania(i, j) }));
  });
  const antes = new Set(pareja.keys());
  emparejar(otroTexto);
  for (const i of pareja.keys()) if (!antes.has(i)) anotar(`dice «${as[pareja.get(i)!]!.c.texto}» donde la maqueta dice`, ms[i]!.c);

  // Lo que no está solo es noticia si su FILA existe en la captura (algún vecino se emparejó): los datos de ejemplo
  // de un visor («1,240 × 15%…», un «0» de muestra) no tienen por qué estar.
  const filasConPareja = new Set([...pareja.keys()].map((i) => ms[i]!.fila));
  const faltan: string[] = [];
  ms.forEach(({ c: m, fila }, i) => {
    const j = pareja.get(i);
    if (j === undefined) {
      if (filasConPareja.has(fila) && clave(m) !== ICONO) faltan.push(nombrar(m));
      return;
    }
    const a = as[j]!.c;
    if (m.forma !== undefined && a.forma !== undefined && m.forma !== a.forma) {
      const cifra = (c: ControlVisto) => (c.proporcion === undefined ? "" : ` (${decimal(c.proporcion)}:1)`);
      anotar(`forma ${NOMBRE_DE_FORMA[m.forma]}${cifra(m)} → ${NOMBRE_DE_FORMA[a.forma]}${cifra(a)}`, m);
    }
    if (conLetras(m.texto)) {
      if (m.alturaDeLetra !== undefined && a.alturaDeLetra !== undefined) {
        const veces = a.alturaDeLetra / m.alturaDeLetra;
        if (veces > 1.3 || veces < 0.77) anotar(`letra ${decimal(veces)} veces la de la maqueta`, m);
      } else if (m.letra !== undefined && a.letra !== undefined && m.letra !== a.letra) {
        anotar(`letra ${NOMBRE_DE_LETRA[m.letra]} → ${NOMBRE_DE_LETRA[a.letra]}`, m);
      }
    }
    if (m.borde !== undefined && a.borde !== undefined && m.borde !== a.borde) anotar(a.borde ? "lleva un BORDE que la maqueta no tiene" : "le falta el borde de la maqueta", m);
    if (m.alineacion !== undefined && a.alineacion !== undefined && m.alineacion !== a.alineacion) anotar(`texto alineado a ${m.alineacion} → a ${a.alineacion}`, m);
    if (m.fondo !== undefined && a.fondo !== undefined && distanciaDeColor(m.fondo, a.fondo) > DISTANCIA_DE_COLOR) anotar(`fondo ${redondo(m.fondo)} → ${redondo(a.fondo)}`, m);
    if (m.colorTexto !== undefined && a.colorTexto !== undefined && distanciaDeColor(m.colorTexto, a.colorTexto) > DISTANCIA_DE_COLOR) {
      anotar(`color del texto ${redondo(m.colorTexto)} → ${redondo(a.colorTexto)}`, m);
    }
  });
  // Un BORDE en la captura cuando la maqueta no tiene ninguno: también en lo que no tiene pareja (el visor).
  if (!ms.some(({ c }) => c.borde === true)) {
    as.forEach(({ c }, j) => {
      if (!usadas.has(j) && c.borde === true) anotar("lleva un BORDE, y en la maqueta nada lo lleva", c);
    });
  }

  const diferencias = [...grupos.entries()]
    .sort((x, y) => y[1].length - x[1].length)
    .map(([que, quienes]) =>
      que.endsWith("donde la maqueta dice")
        ? `${que.replace(" donde la maqueta dice", "")} donde la maqueta dice ${quienes.join(", ")} (¿un estado distinto?).`
        : `${que} en ${quienes.join(", ")}${quienes.length > 3 ? ` (${quienes.length} controles)` : ""}.`
    );
  const recortes = as
    .map((x) => x.c)
    .filter((c) => c.recortado === true)
    .map((c) => `${nombrar(c)} se ve RECORTADO (le falta un trozo de las letras).`);
  return { diferencias, faltan, recortes, extras: { maqueta: maqueta.extras, captura: captura.extras } };
}

/** El bloque que ve el agente. `medida`: las dos salen de los píxeles de cada control, no de un modelo. */
export function informeDeComparacion(c: ComparacionDeDescripciones, como: "medida" | "descrita" = "descrita"): string[] {
  const lineas = [
    como === "medida"
      ? "COMPARACIÓN CONTROL A CONTROL, MEDIDA en los píxeles de cada control (la caja del árbol en la captura, la del code.html en la maqueta; en cada línea, maqueta → aparato):"
      : "COMPARACIÓN CONTROL A CONTROL (la maqueta y la captura descritas POR SEPARADO, con el mismo esquema; en cada línea, maqueta → aparato):",
  ];
  for (const r of c.recortes) lineas.push(`- ${r}`);
  if (c.faltan.length > 0) lineas.push(`- No los encuentro en la captura: ${c.faltan.join(", ")}.`);
  for (const d of c.diferencias) lineas.push(`- ${d}`);
  if (c.extras.captura.length > 0) {
    lineas.push(
      `- Lo que se ve y no es un control, en la captura: ${c.extras.captura.join("; ")}.` +
        (c.extras.maqueta.length > 0 ? ` En la maqueta: ${c.extras.maqueta.join("; ")}.` : " En la maqueta, nada así.")
    );
  }
  if (lineas.length === 1) lineas.push("- Nada: cada control se ve como en la maqueta.");
  return lineas;
}

/** Hay algo que arreglar según la comparación. */
export const hayQueArreglar = (c: ComparacionDeDescripciones): boolean => c.recortes.length + c.faltan.length + c.diferencias.length > 0;
