/**
 * El ESTILO de cada control, MEDIDO en los píxeles de su caja: lo que `descripcionDePantalla.ts` le pedía al modelo
 * (forma, fondo, color del texto, tamaño de la letra, borde, texto recortado, alineación), sacado de la imagen con
 * aritmética. Puro: recibe los píxeles ya en RGBA.
 *
 * Existe porque describirlo con el modelo no sirvió, medido sobre la calculadora de MyAllXOne: la MISMA imagen
 * descrita dos veces salía con diecisiete teclas de otra forma y colores a más de cien puntos, y ninguna de dos
 * pasadas vio el «12 + 3» recortado del visor. Con las cajas del árbol de controles (la captura) o del `code.html`
 * renderizado (la maqueta), cada medida es la misma cada vez y cuesta milisegundos.
 *
 * Cómo se mide, dentro de la caja de un control:
 * - **Fuera**: el color del anillo de píxeles que rodea la caja (lo que hay detrás).
 * - **Fondo**: el color más repetido dentro de la caja, si se distingue de lo de fuera; si no, el control no pinta
 *   fondo propio (un texto suelto) y no tiene forma que medir.
 * - **Forma**: sobre el rectángulo que ocupa el fondo, cuánto se come cada esquina (radio) frente al lado corto, y
 *   la proporción ancho/alto: recta, redondeada, píldora o círculo.
 * - **Tinta**: los píxeles lejos del fondo Y de lo de fuera: el texto o el icono. De ahí el color del texto, la
 *   altura de la letra (en fracción del ANCHO de la pantalla: aparato y maqueta tienen distinta proporción de alto) y
 *   la alineación.
 * - **Recortado**: hay tinta en la primera o la última fila de la caja: las letras siguen más allá del borde.
 * - **Borde**: los lados de la caja (o del fondo) son una línea de un color distinto del de dentro.
 */
import type { ImagenRgba } from "./compararCapturas.js";
import type { Caja } from "./geometriaDePantalla.js";
import type { Alineacion, ControlVisto, Forma, Letra, PantallaDescrita } from "./descripcionDePantalla.js";

type Rgb = [number, number, number];

/** Dos colores «iguales» a efectos de qué es fondo: compresión JPEG y antialias incluidos. */
const MISMO_COLOR = 28;
/**
 * Un fondo PROPIO se distingue de lo de fuera con poco: una tecla #26292E sobre un panel #1C1E22 (medido en la
 * calculadora) se separa unos 17 puntos, y con el umbral de «mismo color» la tecla pasaba por etiqueta sin fondo.
 */
const FONDO_PROPIO = 10;
/** Lo que se aparta del fondo lo bastante para ser tinta (texto, icono). */
const TINTA = 70;

const distancia = (a: Rgb, b: Rgb): number => Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
const hex = (c: Rgb): string => `#${c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("").toUpperCase()}`;

function pixel(img: ImagenRgba, x: number, y: number): Rgb {
  const i = (Math.min(img.alto - 1, Math.max(0, y)) * img.ancho + Math.min(img.ancho - 1, Math.max(0, x))) * 4;
  return [img.datos[i]!, img.datos[i + 1]!, img.datos[i + 2]!];
}

/** El color más repetido de una lista, contando en cubos de 16 niveles y devolviendo la media del cubo ganador. */
function moda(colores: readonly Rgb[]): Rgb | undefined {
  if (colores.length === 0) return undefined;
  const cubos = new Map<number, { n: number; suma: Rgb }>();
  for (const c of colores) {
    const k = ((c[0] >> 4) << 8) | ((c[1] >> 4) << 4) | (c[2] >> 4);
    const cubo = cubos.get(k) ?? { n: 0, suma: [0, 0, 0] };
    cubo.n += 1;
    cubo.suma = [cubo.suma[0] + c[0], cubo.suma[1] + c[1], cubo.suma[2] + c[2]];
    cubos.set(k, cubo);
  }
  const mejor = [...cubos.values()].sort((a, b) => b.n - a.n)[0]!;
  return [mejor.suma[0] / mejor.n, mejor.suma[1] / mejor.n, mejor.suma[2] / mejor.n];
}

/** Un control medido: los campos de estilo de `ControlVisto`, con las cifras de las que salen sus categorías. */
export type EstiloMedido = Omit<ControlVisto, "texto" | "unidades" | "centro">;

/** Las categorías de forma a partir de las cifras. Pura y exportada para el test. */
export function formaDe(radio: number, proporcion: number): Forma {
  if (radio < 0.12) return "recta";
  if (radio < 0.38) return "redondeada";
  // Extremos redondos: círculo si es tan ancho como alto, píldora si es claramente más ancho (o alto). En medio
  // —las teclas de la maqueta: 1,2:1 con radio 0,48— es un cuadrado muy redondeado, no una píldora.
  if (Math.abs(proporcion - 1) <= 0.08) return "circulo";
  return proporcion >= 1.3 || proporcion <= 0.77 ? "pildora" : "redondeada";
}

/** El tamaño de letra a partir de su altura (fracción del ancho de pantalla). */
export function letraDe(altura: number): Letra {
  if (altura < 0.03) return "pequena";
  if (altura < 0.045) return "normal";
  if (altura < 0.08) return "grande";
  return "enorme";
}

/** Mide un control. `img` es la imagen entera; `caja`, en sus píxeles. Lo que no se puede medir no se pone. */
export function medirControl(img: ImagenRgba, caja: Caja): EstiloMedido {
  const x0 = Math.max(0, Math.round(caja.x));
  const y0 = Math.max(0, Math.round(caja.y));
  const x1 = Math.min(img.ancho - 1, Math.round(caja.x + caja.ancho) - 1);
  const y1 = Math.min(img.alto - 1, Math.round(caja.y + caja.alto) - 1);
  if (x1 - x0 < 4 || y1 - y0 < 4) return {};

  // Lo de FUERA: un anillo a 3 px de la caja.
  const anillo: Rgb[] = [];
  for (let x = x0; x <= x1; x += 2) anillo.push(pixel(img, x, y0 - 3), pixel(img, x, y1 + 3));
  for (let y = y0; y <= y1; y += 2) anillo.push(pixel(img, x0 - 3, y), pixel(img, x1 + 3, y));
  const fuera = moda(anillo)!;

  const dentro: Rgb[] = [];
  for (let y = y0; y <= y1; y += 1) for (let x = x0; x <= x1; x += 1) dentro.push(pixel(img, x, y));
  const medido: EstiloMedido = {};

  // El FONDO propio: el color más repetido, si no es lo de fuera.
  const masRepetido = moda(dentro)!;
  const conFondo = distancia(masRepetido, fuera) > FONDO_PROPIO;
  const fondo = conFondo ? masRepetido : fuera;
  if (conFondo) medido.fondo = hex(fondo);

  // El rectángulo del FONDO y su forma.
  let fx0 = x0;
  let fy0 = y0;
  let fx1 = x1;
  let fy1 = y1;
  /**
   * Qué es «del fondo» al buscar su forma: la mitad del contraste entre el fondo y lo de fuera. Con un umbral fijo,
   * una tecla #282A2E sobre un panel #1F2125 (medido en la maqueta de la calculadora) se confundía con él y su esquina
   * redondeada salía recta.
   */
  const delFondo = Math.max(6, Math.min(MISMO_COLOR, distancia(fondo, fuera) / 2));
  if (conFondo) {
    [fx0, fy0, fx1, fy1] = [x1, y1, x0, y0];
    for (let y = y0; y <= y1; y += 1)
      for (let x = x0; x <= x1; x += 1)
        if (distancia(pixel(img, x, y), fondo) <= delFondo) {
          fx0 = Math.min(fx0, x);
          fx1 = Math.max(fx1, x);
          fy0 = Math.min(fy0, y);
          fy1 = Math.max(fy1, y);
        }
    const ancho = fx1 - fx0 + 1;
    const alto = fy1 - fy0 + 1;
    // Cuánto se come la esquina: por la diagonal desde cada esquina, hasta el primer píxel de fondo. En un arco de
    // radio r, la diagonal llega a d = r·(1 − 1/√2).
    const esquinas: [number, number, number, number][] = [
      [fx0, fy0, 1, 1],
      [fx1, fy0, -1, 1],
      [fx0, fy1, 1, -1],
      [fx1, fy1, -1, -1],
    ];
    const radios = esquinas.map(([ex, ey, dx, dy]) => {
      let d = 0;
      while (d < Math.min(ancho, alto) / 2 && distancia(pixel(img, ex + dx * d, ey + dy * d), fondo) > delFondo) d += 1;
      return d / (1 - Math.SQRT1_2);
    });
    const radio = radios.sort((a, b) => a - b)[1]! / Math.min(ancho, alto);
    medido.radio = Math.round(Math.min(radio, 0.5) * 100) / 100;
    medido.proporcion = Math.round((ancho / alto) * 100) / 100;
    medido.forma = formaDe(medido.radio, medido.proporcion);
  }

  // El BORDE: los lados de la caja son una línea de otro color que lo de dentro, en tres de los cuatro lados.
  /** Un lado es una LÍNEA si, en alguna de las tres primeras filas hacia dentro, casi todo es de un color distinto. */
  /**
   * Un lado es una LÍNEA FINA: casi todo de un color distinto del fondo y de lo de fuera, y tres píxeles más afuera
   * (`afuera`: hacia dónde es fuera, en x e y) vuelve a verse lo de fuera. Sin esto último, el halo de un botón con
   * resplandor contaba como borde (medido: la «=» de la maqueta).
   */
  const lado = (puntos: [number, number][], afuera: [number, number]): boolean => {
    const colores = puntos.map(([x, y]) => pixel(img, x, y));
    const linea = moda(colores)!;
    const iguales = colores.filter((c) => distancia(c, linea) <= MISMO_COLOR).length / colores.length;
    if (iguales <= 0.7 || distancia(linea, fondo) <= MISMO_COLOR || distancia(linea, fuera) <= MISMO_COLOR) return false;
    const masAfuera = puntos.filter(([x, y]) => distancia(pixel(img, x + 3 * afuera[0], y + 3 * afuera[1]), fuera) <= MISMO_COLOR).length;
    return masAfuera / puntos.length > 0.7;
  };
  const tramo = (a: number, b: number) => Array.from({ length: Math.max(1, Math.floor((b - a) * 0.6)) }, (_, i) => Math.round(a + (b - a) * 0.2 + i));
  const [bx0, by0, bx1, by1] = conFondo ? [fx0, fy0, fx1, fy1] : [x0, y0, x1, y1];
  const lados = [0, 1, 2, 3].filter((cual) =>
    // La línea puede caer justo FUERA del rectángulo del relleno (este se mide por el color del fondo, y el contorno es
    // de otro color) o justo dentro: se busca a los dos lados.
    [-3, -2, -1, 0, 1, 2].some((hacia) => {
      if (cual === 0) return lado(tramo(bx0, bx1).map((x): [number, number] => [x, by0 + hacia]), [0, -1]);
      if (cual === 1) return lado(tramo(bx0, bx1).map((x): [number, number] => [x, by1 - hacia]), [0, 1]);
      if (cual === 2) return lado(tramo(by0, by1).map((y): [number, number] => [bx0 + hacia, y]), [-1, 0]);
      return lado(tramo(by0, by1).map((y): [number, number] => [bx1 - hacia, y]), [1, 0]);
    })
  ).length;
  // En una píldora los lados cortos son arcos enteros: basta con los dos largos.
  medido.borde = lados >= ((medido.radio ?? 0) >= 0.38 ? 2 : 3);

  // La TINTA: lejos del fondo y de lo de fuera. Con borde, su franja no es tinta.
  /**
   * Con borde, su franja no es tinta; y si las esquinas son redondeadas, tampoco su ARCO: los píxeles suavizados de
   * una línea curva no se parecen al color de la línea y entraban como texto que medía todo el alto (medido en las
   * teclas de la calculadora). Todo punto del arco cae a menos de r·(1 − 1/√2) ≈ 0,3·r de algún lado.
   */
  const arco = medido.radio === undefined ? 0 : Math.ceil(0.3 * medido.radio * Math.min(x1 - x0, y1 - y0));
  // En un control con fondo, 6 px más el arco: la compresión JPEG deja un halo junto a una línea fina y brillante. En
  // una etiqueta sin fondo —donde se mide el recorte— basta la línea: un texto cortado justo encima de su borde
  // inferior tiene que seguir llegando al límite (medido: el «12 + 3» del visor).
  const margen = !medido.borde ? 0 : conFondo ? 6 + arco : 1;
  // Desde el rectángulo del FONDO si lo hay: la caja del árbol puede ser mayor que lo dibujado.
  const [ix0, iy0, ix1, iy1] = [bx0 + margen, by0 + margen, bx1 - margen, by1 - margen];
  // La tinta, como máscara.
  const anchoI = Math.max(0, ix1 - ix0 + 1);
  const altoI = Math.max(0, iy1 - iy0 + 1);
  const esTinta = new Uint8Array(anchoI * altoI);
  const porColumna = new Uint32Array(anchoI);
  const porFilaN = new Uint32Array(altoI);
  for (let y = iy0; y <= iy1; y += 1)
    for (let x = ix0; x <= ix1; x += 1) {
      const p = pixel(img, x, y);
      if (distancia(p, fondo) <= TINTA || distancia(p, fuera) <= TINTA) continue;
      esTinta[(y - iy0) * anchoI + (x - ix0)] = 1;
      porColumna[x - ix0]! += 1;
      porFilaN[y - iy0]! += 1;
    }
  /**
   * Una LÍNEA no es texto: una columna con tinta en casi todo el alto (el lado de un contorno) o una fila con tinta en
   * casi todo el ancho (su tapa) se quita. Hace falta aunque no se haya detectado el borde: medido, un contorno tenue
   * sobre una tecla poco contrastada no se detectaba y sus lados hacían medir a la letra todo el alto de la tecla.
   */
  const lineaVertical = (cx: number) => porColumna[cx]! > altoI * 0.8;
  const lineaHorizontal = (cy: number) => porFilaN[cy]! > anchoI * 0.8;
  const porFila = new Map<number, { colores: Rgb[]; x0: number; x1: number }>();
  for (let cy = 0; cy < altoI; cy += 1) {
    if (lineaHorizontal(cy)) continue;
    for (let cx = 0; cx < anchoI; cx += 1) {
      if (esTinta[cy * anchoI + cx] !== 1 || lineaVertical(cx)) continue;
      const [x, y] = [ix0 + cx, iy0 + cy];
      const fila = porFila.get(y) ?? { colores: [], x0: x, x1: x };
      fila.colores.push(pixel(img, x, y));
      fila.x1 = x;
      porFila.set(y, fila);
    }
  }
  /**
   * El TEXTO es el bloque continuo de filas con más tinta (huecos de hasta 3 filas: la «i», el «=»). Lo que sobra de un
   * contorno, unos pocos píxeles sueltos lejos del texto, forma bloques aparte y no estira la altura de la letra
   * (medido: una tecla «8» con borde redondeado medía cuatro veces su letra).
   */
  const bloques: { y0: number; y1: number; n: number }[] = [];
  // Una fila con solo un par de píxeles de tinta (lo que deja un contorno tenue en cada lado) no es texto, y no puede
  // unir el texto con la tapa y el pie de la caja.
  const minimo = Math.max(4, Math.round(anchoI * 0.02));
  for (const y of [...porFila.keys()].sort((a, b) => a - b)) {
    const ultimo = bloques[bloques.length - 1];
    const n = porFila.get(y)!.colores.length;
    if (n <= minimo) continue;
    if (ultimo !== undefined && y - ultimo.y1 <= 4) {
      ultimo.y1 = y;
      ultimo.n += n;
    } else bloques.push({ y0: y, y1: y, n });
  }
  const texto = bloques.sort((a, b) => b.n - a.n)[0];
  const tinta: Rgb[] = [];
  let [tx0, ty0, tx1, ty1] = [ix1, iy1, ix0, iy0];
  if (texto !== undefined)
    for (let y = texto.y0; y <= texto.y1; y += 1) {
      const fila = porFila.get(y);
      if (fila === undefined) continue;
      tinta.push(...fila.colores);
      [tx0, tx1, ty0, ty1] = [Math.min(tx0, fila.x0), Math.max(tx1, fila.x1), Math.min(ty0, y), Math.max(ty1, y)];
    }
  const tocaArriba = texto !== undefined && texto.y0 <= iy0 + 1;
  const tocaAbajo = texto !== undefined && texto.y1 >= iy1 - 1;
  if (tinta.length >= 6) {
    /**
     * El color del texto es el de la tinta MÁS lejana del fondo: en un botón con degradado, el propio degradado se
     * aparta del color más repetido y entra como «tinta» (medido: la «=» de la maqueta daba el coral del degradado y
     * no el granate de su signo).
     */
    const lejos = Math.max(...tinta.map((p) => distancia(p, fondo)));
    medido.colorTexto = hex(moda(tinta.filter((p) => distancia(p, fondo) >= Math.max(TINTA, lejos * 0.6)))!);
    medido.alturaDeLetra = Math.round(((ty1 - ty0 + 1) / img.ancho) * 1000) / 1000;
    medido.letra = letraDe(medido.alturaDeLetra);
    const centro = (tx0 + tx1) / 2;
    const tercio = (ix1 - ix0) / 3;
    medido.alineacion = (centro < ix0 + tercio ? "izquierda" : centro > ix1 - tercio ? "derecha" : "centro") as Alineacion;
    /**
     * Recortado solo en lo que NO pinta fondo propio (una etiqueta de texto): en un botón, un degradado del fondo es
     * «tinta» que llega al borde (medido: la «=» de la calculadora) y el texto de un botón no es lo que se corta.
     */
    if (!conFondo) medido.recortado = tocaArriba || tocaAbajo;
  }

  return medido;
}

/** Un control que medir: su texto (o `[NOMBRE]` si no tiene) y su caja en los píxeles de la imagen. */
export interface ControlAMedir {
  texto: string;
  caja: Caja;
}

/**
 * Una pantalla entera MEDIDA, en el mismo esquema que `compararDescripciones` entiende: las filas que se le dan, y
 * cada control con su estilo medido y su centro en fracción de la pantalla (con eso se empareja).
 */
export function pantallaMedida(img: ImagenRgba, filas: readonly (readonly ControlAMedir[])[]): PantallaDescrita {
  return {
    filas: filas.map((fila) => ({
      controles: fila.map((c) => ({
        texto: c.texto,
        centro: { x: (c.caja.x + c.caja.ancho / 2) / img.ancho, y: (c.caja.y + c.caja.alto / 2) / img.alto },
        ...medirControl(img, c.caja),
      })),
    })),
    extras: [],
  };
}

// ---------------------------------------------------------------- los bloques anchos (cabecera, visor, panel)

/** Los bloques que no están dentro de otro: la cabecera y no su título, el visor y no sus filas. Pura. */
export function bloquesDeFuera(cajas: readonly Caja[]): Caja[] {
  const dentro = (a: Caja, b: Caja) => a !== b && a.x >= b.x - 2 && a.y >= b.y - 2 && a.x + a.ancho <= b.x + b.ancho + 2 && a.y + a.alto <= b.y + b.alto + 2;
  return cajas.filter((a) => !cajas.some((b) => dentro(a, b) && !(dentro(b, a) && cajas.indexOf(b) > cajas.indexOf(a))));
}

/** Un bloque y la imagen en la que vive, con la franja útil de la pantalla (sin barras del sistema), en píxeles. */
export interface BloquesAMedir {
  img: ImagenRgba;
  bloques: readonly Caja[];
  util: { arriba: number; abajo: number };
}

const porciento = (x: number) => `${Math.round(x * 100)} %`;

/** El color más repetido dentro de una caja: el del fondo del bloque, sea propio o el de lo que tiene detrás. */
function colorDominante(img: ImagenRgba, caja: Caja): Rgb | undefined {
  const colores: Rgb[] = [];
  const paso = Math.max(1, Math.floor(Math.sqrt((caja.ancho * caja.alto) / 4000)));
  for (let y = Math.round(caja.y); y < caja.y + caja.alto; y += paso) for (let x = Math.round(caja.x); x < caja.x + caja.ancho; x += paso) colores.push(pixel(img, x, y));
  return moda(colores);
}

/**
 * Compara el COLOR y la FORMA de los bloques anchos, emparejados por su altura relativa dentro de la franja útil de
 * cada pantalla (la maqueta y el aparato no tienen la misma proporción). Pura. Existe por la calculadora: una cabecera
 * amarilla donde la maqueta tiene la del fondo oscuro no la veía nadie, porque solo se comparaban los botones.
 *
 * Solo dice DIFERENCIAS de lo emparejado: un bloque sin pareja no es noticia, porque los dos lados no parten igual
 * (el aparato puede tener un bloque por fila de teclas donde la maqueta tiene un solo panel).
 */
export function compararBloques(maqueta: BloquesAMedir, aparato: BloquesAMedir): string[] {
  const situar = (b: BloquesAMedir) =>
    bloquesDeFuera(b.bloques)
      .slice()
      .sort((x, y) => x.y - y.y)
      .map((caja) => {
        const alto = Math.max(1, b.util.abajo - b.util.arriba);
        return { caja, y0: (caja.y - b.util.arriba) / alto, y1: (caja.y + caja.alto - b.util.arriba) / alto, color: colorDominante(b.img, caja), forma: medirControl(b.img, caja).forma };
      });
  const ms = situar(maqueta);
  const as = situar(aparato);
  const usados = new Set<number>();
  const salida: string[] = [];
  for (const a of as) {
    let mejor: { i: number; solape: number } | undefined;
    ms.forEach((m, i) => {
      const solape = Math.min(a.y1, m.y1) - Math.max(a.y0, m.y0);
      if (!usados.has(i) && solape > 0 && (mejor === undefined || solape > mejor.solape)) mejor = { i, solape };
    });
    if (mejor === undefined || mejor.solape < (a.y1 - a.y0) * 0.4) continue;
    usados.add(mejor.i);
    const m = ms[mejor.i]!;
    const donde = a.y0 < 0.12 ? "de arriba del todo" : `que va del ${porciento(Math.max(0, a.y0))} al ${porciento(Math.min(1, a.y1))} del alto`;
    if (a.color !== undefined && m.color !== undefined && Math.hypot(a.color[0] - m.color[0], a.color[1] - m.color[1], a.color[2] - m.color[2]) > 90) {
      salida.push(`El bloque ${donde} es de color ${hex(a.color)}; en la maqueta, ${hex(m.color)}.`);
    }
    const proporcion = (a.y1 - a.y0) / Math.max(0.001, m.y1 - m.y0);
    if (a.forma !== undefined && m.forma !== undefined && a.forma !== m.forma && proporcion > 0.6 && proporcion < 1.6) {
      salida.push(`El bloque ${donde} tiene forma ${a.forma}; en la maqueta, ${m.forma}.`);
    }
  }
  return salida;
}
