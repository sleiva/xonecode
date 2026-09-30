/**
 * Comparar la ESTRUCTURA de dos pantallas con aritmética de píxeles (IXCODE-18).
 *
 * ## Por qué existe, medido
 *
 * Pidiendo a un agente «haz este diseño» (una calculadora de Stitch), el turno cerró diciendo «sin
 * solape ni recorte: los controles caben» mientras el teclado ocupaba un tercio de la pantalla y
 * las teclas salían cortadas. El crítico visual había dicho rojo y el propio agente lo descartó
 * como «no fiable»: dos opiniones de modelos, ninguna cifra. Con cifras el desacuerdo no cabe: la
 * maqueta ocupaba el 96 % del alto y la captura el 33 %.
 *
 * ## Qué mide, y por qué solo eso
 *
 * Es DETERMINISTA: las mismas dos imágenes dan siempre los mismos números, y no depende de que el
 * modelo tenga visión (DeepSeek no la tiene). Mide **dónde hay contenido**, no cómo es:
 *
 * 1. El FONDO es el color más frecuente (una pantalla de app es un fondo liso con cosas encima).
 * 2. «Contenido» es todo píxel que se aparta del fondo más que `UMBRAL_DE_CONTENIDO`.
 * 3. La ocupación por FRANJAS horizontales (`FRANJAS_DE_FILAS`) y verticales
 *    (`FRANJAS_DE_COLUMNAS`), y hasta dónde llega el contenido.
 *
 * Todo en PORCENTAJES del área útil, así que una maqueta de 390 px y una captura de 1080 px se
 * comparan sin escalar. Se recorta un margen arriba y abajo (barra de estado y de navegación).
 *
 * **Lo que NO hace, y se dice en cada respuesta**: no ve texto cortado, ni estilo (píldoras contra
 * lápidas), ni colores. Y **no cuenta teclas**: se probó y no es fiable (las teclas oscuras sobre
 * fondo oscuro se funden: 12 manchas en una maqueta de unas 20). Da el ESQUELETO; el parecido y las
 * roturas siguen siendo cosa del crítico con visión.
 *
 * `core/` no decodifica imágenes: recibe los píxeles ya en RGBA (`agent/dispositivos/
 * decodificarImagen.ts` los saca de un PNG o un JPEG).
 */

export interface ImagenRgba {
  ancho: number;
  alto: number;
  /** RGBA, 4 bytes por píxel, fila a fila. */
  datos: Uint8Array | Uint8ClampedArray;
}

/** Fracción del alto que se recorta arriba y abajo: barra de estado y barra de navegación. */
export const RECORTE_DE_BARRAS = 0.05;
export const FRANJAS_DE_FILAS = 10;
export const FRANJAS_DE_COLUMNAS = 8;

/** Suma de diferencias por canal a partir de la cual un píxel ya no es el fondo. */
export const UMBRAL_DE_CONTENIDO = 24;
/** Una franja «tiene contenido» si al menos esta fracción de sus píxeles no es fondo. */
const DENSIDAD_MINIMA_DE_FILA = 0.02;
/** En una franja, una columna tiene contenido si al menos esta fracción de su alto no es fondo. */
const DENSIDAD_MINIMA_DE_COLUMNA_EN_FRANJA = 0.05;
/**
 * El ENCAJE: cuánto puede separarse cada borde del contenido (arriba, abajo, izquierda, derecha) del de la maqueta, en
 * fracción de la pantalla. Existe porque las distancias por franjas PROMEDIAN: calc12 cumplía el 10 % en horizontal
 * (8 %) con el teclado acabando al 85 % del ancho donde la maqueta llega al 96 %, y 12 puntos vacíos abajo. Calibrado
 * contra las capturas de las pasadas: la mejor (calc9) queda en 0-1,6 puntos por lado.
 */
export const TOLERANCIA_DE_ENCAJE = 0.03;
/** Diferencia de ocupación (en puntos de 0 a 1) a partir de la cual una franja se señala. */
export const DIFERENCIA_QUE_SE_SEÑALA = 0.3;
/** Diferencia media de perfil bajo la que dos pantallas se dan por parecidas en estructura. */
export const DISTANCIA_PARECIDA = 0.12;
/** Se mira uno de cada tantos píxeles al buscar el fondo: no hace falta ver los 2,6 millones. */
const PASO_DE_MUESTREO = 7;

export interface MedidaDePantalla {
  /** El color de fondo detectado, RGB. */
  fondo: [number, number, number];
  /** De 0 a 1: hasta dónde llega el contenido (primera a última fila con contenido, sobre el alto útil). */
  inicioDelContenido: number;
  finDelContenido: number;
  /** De 0 a 1: dónde empieza y acaba el contenido a lo ANCHO, la mediana de las franjas del alto que tienen contenido. */
  izquierdaDelContenido: number;
  derechaDelContenido: number;
  /** Ocupación (0 a 1) de cada franja horizontal, de arriba abajo. */
  filas: number[];
  /** Ocupación (0 a 1) de cada franja vertical, de izquierda a derecha. */
  columnas: number[];
}

export type Veredicto = "parecida" | "distinta";

export interface Comparacion {
  referencia: MedidaDePantalla;
  captura: MedidaDePantalla;
  /** Diferencia media de ocupación por franjas, de 0 (igual) a 1. */
  distanciaVertical: number;
  distanciaHorizontal: number;
  /** Cuánto se separa cada borde del contenido del de la maqueta (captura − referencia, fracción de la pantalla). */
  encaje: { arriba: number; abajo: number; izquierda: number; derecha: number };
  hallazgos: string[];
  veredicto: Veredicto;
}

const pct = (n: number): string => `${Math.round(n * 100)} %`;

/** Fracción del ancho, a cada lado, donde se busca el fondo: los márgenes de una pantalla. */
const BORDE_PARA_EL_FONDO = 0.03;
/** Si el color más frecuente del borde no llega a esta fracción de los píxeles del borde, el borde no es fiable. */
const FRACCION_MINIMA_DEL_BORDE = 0.3;

function modaDeColor(
  img: ImagenRgba,
  desde: number,
  hasta: number,
  dentro: (x: number) => boolean
): { color: [number, number, number]; fraccion: number } {
  const cuentas = new Map<number, number>();
  const { ancho, datos } = img;
  let total = 0;
  for (let y = desde; y < hasta; y += PASO_DE_MUESTREO) {
    for (let x = 0; x < ancho; x++) {
      if (!dentro(x)) continue;
      const i = (y * ancho + x) * 4;
      // Cuantizado a 6 bits por canal para tolerar el ruido de un JPEG.
      const clave = ((datos[i]! >> 2) << 16) | ((datos[i + 1]! >> 2) << 8) | (datos[i + 2]! >> 2);
      cuentas.set(clave, (cuentas.get(clave) ?? 0) + 1);
      total++;
    }
  }
  let mejor = 0;
  let cuenta = -1;
  for (const [clave, n] of cuentas) {
    if (n > cuenta) {
      cuenta = n;
      mejor = clave;
    }
  }
  return {
    color: [((mejor >> 16) & 63) << 2, ((mejor >> 8) & 63) << 2, (mejor & 63) << 2],
    fraccion: total === 0 ? 0 : cuenta / total,
  };
}

/**
 * El color de FONDO: el más frecuente en los MÁRGENES laterales, no en toda la imagen.
 *
 * **Lo de «el más frecuente de todos» falló, y se midió**: en una calculadora cuyas teclas redondas
 * ocupaban más superficie que el fondo, eligió el gris de las teclas, y toda la barra superior y la
 * tarjeta del display contaron como contenido al cien por cien (una distancia del 46 % a una pantalla
 * que a la vista estaba mucho más cerca de la maqueta). Incluso en la maqueta y en una captura buena
 * eligió el color de la tarjeta del display, con menos de un tercio de los píxeles. Los márgenes
 * laterales, en cambio, son fondo casi siempre —el contenido de una app deja margen a los lados— y
 * dieron el mismo color en las cuatro imágenes probadas. Si el borde no es uniforme (contenido a
 * sangre), se cae al más frecuente global, que es lo que había.
 */
function colorDeFondo(img: ImagenRgba, desde: number, hasta: number): [number, number, number] {
  const margen = img.ancho * BORDE_PARA_EL_FONDO;
  const borde = modaDeColor(img, desde, hasta, (x) => x < margen || x >= img.ancho - margen);
  if (borde.fraccion >= FRACCION_MINIMA_DEL_BORDE) return borde.color;
  return modaDeColor(img, desde, hasta, () => true).color;
}

/**
 * La ocupación de una imagen. **Lanza si no se puede medir** (vacía o diminuta): quien llama lo
 * convierte en texto.
 */
export function medirPantalla(img: ImagenRgba, recorte: number = RECORTE_DE_BARRAS): MedidaDePantalla {
  if (img.ancho < FRANJAS_DE_COLUMNAS || img.alto < FRANJAS_DE_FILAS * 4) {
    throw new Error("la imagen es demasiado pequeña para medirla");
  }
  if (img.datos.length < img.ancho * img.alto * 4) throw new Error("la imagen está incompleta");
  const desde = Math.floor(img.alto * recorte);
  const hasta = img.alto - Math.floor(img.alto * recorte);
  const alto = hasta - desde;
  const fondo = colorDeFondo(img, desde, hasta);
  const { ancho, datos } = img;

  const densidadDeFila = new Float64Array(alto);
  const cuentaDeColumna = new Float64Array(ancho);
  for (let y = 0; y < alto; y++) {
    let n = 0;
    const base = (desde + y) * ancho * 4;
    for (let x = 0; x < ancho; x++) {
      const i = base + x * 4;
      const d =
        Math.abs(datos[i]! - fondo[0]) + Math.abs(datos[i + 1]! - fondo[1]) + Math.abs(datos[i + 2]! - fondo[2]);
      if (d > UMBRAL_DE_CONTENIDO) {
        n++;
        cuentaDeColumna[x]! += 1;
      }
    }
    densidadDeFila[y] = n / ancho;
  }

  let primera = -1;
  let ultima = -1;
  for (let y = 0; y < alto; y++) {
    if (densidadDeFila[y]! > DENSIDAD_MINIMA_DE_FILA) {
      if (primera < 0) primera = y;
      ultima = y;
    }
  }
  const media = (v: ArrayLike<number>, a: number, b: number): number => {
    let s = 0;
    for (let i = a; i < b; i++) s += v[i]!;
    return b > a ? s / (b - a) : 0;
  };
  const filas = Array.from({ length: FRANJAS_DE_FILAS }, (_, k) =>
    media(densidadDeFila, Math.floor((k * alto) / FRANJAS_DE_FILAS), Math.floor(((k + 1) * alto) / FRANJAS_DE_FILAS))
  );
  const columnas = Array.from({ length: FRANJAS_DE_COLUMNAS }, (_, k) =>
    media(cuentaDeColumna, Math.floor((k * ancho) / FRANJAS_DE_COLUMNAS), Math.floor(((k + 1) * ancho) / FRANJAS_DE_COLUMNAS)) /
    alto
  );
  // Dónde empieza y acaba el contenido por los LADOS: la MEDIANA de cada franja del alto, no el recuadro de la pantalla
  // entera, que lo fija el elemento más ancho (la barra de arriba ocupa todo) y no dice si el teclado llega al borde.
  const bordesDeFranja: Array<[number, number]> = [];
  for (let k = 0; k < FRANJAS_DE_FILAS; k++) {
    const y0 = Math.floor((k * alto) / FRANJAS_DE_FILAS);
    const y1 = Math.floor(((k + 1) * alto) / FRANJAS_DE_FILAS);
    const cuenta = new Float64Array(ancho);
    for (let y = y0; y < y1; y++) {
      const base = (desde + y) * ancho * 4;
      for (let x = 0; x < ancho; x++) {
        const i = base + x * 4;
        const d = Math.abs(datos[i]! - fondo[0]) + Math.abs(datos[i + 1]! - fondo[1]) + Math.abs(datos[i + 2]! - fondo[2]);
        if (d > UMBRAL_DE_CONTENIDO) cuenta[x]! += 1;
      }
    }
    let a = -1;
    let b = -1;
    for (let x = 0; x < ancho; x++) {
      if (cuenta[x]! / Math.max(y1 - y0, 1) > DENSIDAD_MINIMA_DE_COLUMNA_EN_FRANJA) {
        if (a < 0) a = x;
        b = x;
      }
    }
    if (a >= 0) bordesDeFranja.push([a / ancho, (b + 1) / ancho]);
  }
  const mediana = (v: number[]): number => {
    if (v.length === 0) return 0;
    const o = [...v].sort((x, y) => x - y);
    const m = Math.floor(o.length / 2);
    return o.length % 2 === 1 ? o[m]! : (o[m - 1]! + o[m]!) / 2;
  };
  return {
    fondo,
    inicioDelContenido: primera < 0 ? 0 : primera / alto,
    finDelContenido: ultima < 0 ? 0 : (ultima + 1) / alto,
    izquierdaDelContenido: mediana(bordesDeFranja.map(([a]) => a)),
    derechaDelContenido: mediana(bordesDeFranja.map(([, b]) => b)),
    filas,
    columnas,
  };
}

const distancia = (a: readonly number[], b: readonly number[]): number =>
  a.reduce((s, v, i) => s + Math.abs(v - b[i]!), 0) / a.length;

/** Franjas consecutivas que difieren, juntadas en un rango: «franjas 5–10 (40–100 % del alto)». */
function rangos(dif: readonly number[], total: number): Array<{ desde: number; hasta: number }> {
  const salida: Array<{ desde: number; hasta: number }> = [];
  let abierto: { desde: number; hasta: number } | undefined;
  dif.forEach((d, k) => {
    if (Math.abs(d) >= DIFERENCIA_QUE_SE_SEÑALA) {
      if (abierto !== undefined && abierto.hasta === k) abierto.hasta = k + 1;
      else {
        abierto = { desde: k, hasta: k + 1 };
        salida.push(abierto);
      }
    }
  });
  return salida.map((r) => ({ desde: r.desde / total, hasta: r.hasta / total }));
}

function describirRangos(
  nombre: "alto" | "ancho",
  ref: readonly number[],
  cap: readonly number[]
): string[] {
  const dif = cap.map((c, k) => c - ref[k]!);
  return rangos(dif, ref.length).map((r) => {
    const a = Math.floor(r.desde * ref.length);
    const b = Math.ceil(r.hasta * ref.length);
    const media = (v: readonly number[]): number => v.slice(a, b).reduce((s, x) => s + x, 0) / Math.max(b - a, 1);
    const donde = `entre el ${pct(r.desde)} y el ${pct(r.hasta)} del ${nombre}`;
    const r0 = media(ref);
    const c0 = media(cap);
    // «Casi nada» solo si de verdad lo es: un 45 % frente a un 89 % es la MITAD, no nada.
    if (c0 < r0) {
      return c0 < r0 * 0.25
        ? `${donde} la referencia tiene contenido (${pct(r0)} de ocupación) y la captura casi nada (${pct(c0)})`
        : `${donde} la captura tiene bastante menos contenido (${pct(c0)}) que la referencia (${pct(r0)})`;
    }
    return `${donde} la captura tiene mucho más contenido (${pct(c0)}) que la referencia (${pct(r0)})`;
  });
}

/** El peor borde, en valor absoluto: lo que decide si encaja. */
export function desajusteDeEncaje(e: Comparacion["encaje"]): number {
  return Math.max(Math.abs(e.arriba), Math.abs(e.abajo), Math.abs(e.izquierda), Math.abs(e.derecha));
}

/** Un hallazgo por borde que se sale de la tolerancia, dicho como lo que hay que hacer para que ocupe la pantalla como la maqueta. */
function hallazgosDeEncaje(e: Comparacion["encaje"], ref: MedidaDePantalla, cap: MedidaDePantalla): string[] {
  const salida: string[] = [];
  const fuera = (d: number): boolean => Math.abs(d) > TOLERANCIA_DE_ENCAJE;
  if (fuera(e.derecha)) {
    salida.push(
      `ENCAJE a la derecha: el contenido acaba al ${pct(cap.derechaDelContenido)} del ancho y en la maqueta al ${pct(ref.derechaDelContenido)} ` +
        (e.derecha < 0 ? `(le faltan ${pct(-e.derecha)}: ensánchalo hasta el borde de la maqueta)` : `(se pasa ${pct(e.derecha)})`)
    );
  }
  if (fuera(e.izquierda)) {
    salida.push(
      `ENCAJE a la izquierda: el contenido empieza al ${pct(cap.izquierdaDelContenido)} del ancho y en la maqueta al ${pct(ref.izquierdaDelContenido)}`
    );
  }
  if (fuera(e.abajo)) {
    salida.push(
      `ENCAJE abajo: el contenido acaba al ${pct(cap.finDelContenido)} del alto útil y en la maqueta al ${pct(ref.finDelContenido)} ` +
        (e.abajo < 0 ? `(queda una banda vacía de ${pct(-e.abajo)}: el contenido tiene que llegar abajo como en la maqueta)` : `(se pasa ${pct(e.abajo)})`)
    );
  }
  if (fuera(e.arriba)) {
    salida.push(`ENCAJE arriba: el contenido empieza al ${pct(cap.inicioDelContenido)} del alto útil y en la maqueta al ${pct(ref.inicioDelContenido)}`);
  }
  return salida;
}

/** Compara dos pantallas ya medidas. Puro: los números salen de `medirPantalla`. */
export function compararMedidas(referencia: MedidaDePantalla, captura: MedidaDePantalla): Comparacion {
  const dv = distancia(referencia.filas, captura.filas);
  const dh = distancia(referencia.columnas, captura.columnas);
  const hallazgos: string[] = [];

  const encaje = {
    arriba: captura.inicioDelContenido - referencia.inicioDelContenido,
    abajo: captura.finDelContenido - referencia.finDelContenido,
    izquierda: captura.izquierdaDelContenido - referencia.izquierdaDelContenido,
    derecha: captura.derechaDelContenido - referencia.derechaDelContenido,
  };
  hallazgos.push(...hallazgosDeEncaje(encaje, referencia, captura));
  hallazgos.push(...describirRangos("alto", referencia.filas, captura.filas));
  hallazgos.push(...describirRangos("ancho", referencia.columnas, captura.columnas));

  const parecida = dv <= DISTANCIA_PARECIDA && dh <= DISTANCIA_PARECIDA && hallazgos.length === 0;
  return {
    referencia,
    captura,
    distanciaVertical: dv,
    distanciaHorizontal: dh,
    encaje,
    hallazgos,
    veredicto: parecida ? "parecida" : "distinta",
  };
}

/** Medir las dos y compararlas. */
export function compararPantallas(referencia: ImagenRgba, captura: ImagenRgba): Comparacion {
  return compararMedidas(medirPantalla(referencia), medirPantalla(captura));
}

/**
 * El informe en texto, que es lo que lee el modelo. **Termina diciendo lo que esto NO mide**: un
 * «parecida» de aquí es «la estructura coincide», y se leería como «se ve bien» si no se dijera.
 */
const pp = (x: number): string => `${x >= 0 ? "+" : "−"}${Math.round(Math.abs(x) * 100)}`;

export function informeDeComparacion(c: Comparacion): string[] {
  const filas = (m: MedidaDePantalla): string => m.filas.map((f) => String(Math.round(f * 100)).padStart(3)).join("");
  const lineas = [
    `Estructura ${c.veredicto === "parecida" ? "PARECIDA" : "DISTINTA"} (distancia vertical ${pct(c.distanciaVertical)}, horizontal ${pct(c.distanciaHorizontal)}; se da por parecida bajo ${pct(DISTANCIA_PARECIDA)}).`,
    `Encaje de los bordes del contenido frente a la maqueta (tolerancia ${pct(TOLERANCIA_DE_ENCAJE)} por lado): arriba ${pp(c.encaje.arriba)}, abajo ${pp(c.encaje.abajo)}, izquierda ${pp(c.encaje.izquierda)}, derecha ${pp(c.encaje.derecha)} → ${desajusteDeEncaje(c.encaje) <= TOLERANCIA_DE_ENCAJE ? "ENCAJA" : "NO ENCAJA"}.`,
    `Ocupación por franjas del alto, de arriba abajo (%):`,
    `  referencia:${filas(c.referencia)}`,
    `  captura:   ${filas(c.captura)}`,
  ];
  if (c.hallazgos.length > 0) {
    lineas.push("Diferencias que se señalan:", ...c.hallazgos.map((h) => `  - ${h}`));
  } else {
    lineas.push("Ninguna franja difiere más de lo tolerado.");
  }
  lineas.push(
    "OJO, esto mide DÓNDE hay contenido y no CÓMO es: no ve texto cortado, ni el estilo de las formas (píldoras o rectángulos), " +
      "ni colores, ni cuenta teclas. Para eso está xone_critica_visual, pasándole esta misma referencia."
  );
  return lineas;
}

/* ------------------------------------------------------------------------------------------- */
/* ¿CAMBIÓ esta zona entre dos capturas de la MISMA app?                                        */
/* ------------------------------------------------------------------------------------------- */

/**
 * Una zona de la imagen, en FRACCIONES de la imagen entera (0 a 1): `x`, `y` y su tamaño. Así sirve
 * igual a 1080×2400 que a cualquier otra resolución.
 */
export interface Region {
  x: number;
  y: number;
  ancho: number;
  alto: number;
}

/** Fracción de píxeles de la zona que tienen que diferir para dar la zona por CAMBIADA. */
export const UMBRAL_DE_CAMBIO = 0.003;

export interface Cambio {
  region: Region;
  /** Fracción (0 a 1) de los píxeles de la zona que cambiaron. */
  cambiados: number;
  /** El rectángulo mínimo que contiene todo lo que cambió, en fracciones de la imagen; ausente si nada cambió. */
  cajaDelCambio?: Region;
  veredicto: "cambio" | "igual";
}

const IMAGEN_ENTERA: Region = { x: 0, y: 0, ancho: 1, alto: 1 };

/** Por qué una zona no vale, o `undefined`. */
export function motivoDeRegionInaceptable(r: Region): string | undefined {
  const finitos = [r.x, r.y, r.ancho, r.alto].every((n) => Number.isFinite(n));
  if (!finitos || r.x < 0 || r.y < 0 || r.ancho <= 0 || r.alto <= 0 || r.x + r.ancho > 1.0001 || r.y + r.alto > 1.0001) {
    return "la zona va en fracciones de la imagen (0 a 1): x e y de la esquina y su ancho y su alto, sin salirse";
  }
  return undefined;
}

/**
 * Cuánto cambió una zona entre dos capturas. **Lanza** si no son comparables: las dos tienen que ser
 * del MISMO tamaño (dos capturas del mismo aparato); comparar tamaños distintos es la pregunta de
 * `compararPantallas`, no ésta.
 *
 * Es lo que un agente escribía a mano cada pasada (46 scripts de Python con PIL y 31 `md5`): un
 * `md5` igual solo dice que TODA la imagen es igual, no si cambió lo que importaba, y uno distinto
 * puede ser solo un cursor parpadeando.
 */
export function medirCambio(antes: ImagenRgba, despues: ImagenRgba, region: Region = IMAGEN_ENTERA): Cambio {
  if (antes.ancho !== despues.ancho || antes.alto !== despues.alto) {
    throw new Error(
      `las dos capturas no tienen el mismo tamaño (${antes.ancho}×${antes.alto} frente a ${despues.ancho}×${despues.alto})`
    );
  }
  const motivo = motivoDeRegionInaceptable(region);
  if (motivo !== undefined) throw new Error(motivo);
  if (antes.datos.length < antes.ancho * antes.alto * 4 || despues.datos.length < despues.ancho * despues.alto * 4) {
    throw new Error("una de las imágenes está incompleta");
  }
  const x0 = Math.floor(region.x * antes.ancho);
  const y0 = Math.floor(region.y * antes.alto);
  const x1 = Math.min(antes.ancho, Math.ceil((region.x + region.ancho) * antes.ancho));
  const y1 = Math.min(antes.alto, Math.ceil((region.y + region.alto) * antes.alto));
  let cambiados = 0;
  let minX = Infinity, minY = Infinity, maxX = -1, maxY = -1;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * antes.ancho + x) * 4;
      const d =
        Math.abs(antes.datos[i]! - despues.datos[i]!) +
        Math.abs(antes.datos[i + 1]! - despues.datos[i + 1]!) +
        Math.abs(antes.datos[i + 2]! - despues.datos[i + 2]!);
      if (d > UMBRAL_DE_CONTENIDO) {
        cambiados++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  const total = Math.max((x1 - x0) * (y1 - y0), 1);
  const fraccion = cambiados / total;
  const cambio = fraccion >= UMBRAL_DE_CAMBIO;
  return {
    region,
    cambiados: fraccion,
    ...(cambio
      ? {
          cajaDelCambio: {
            x: minX / antes.ancho,
            y: minY / antes.alto,
            ancho: (maxX - minX + 1) / antes.ancho,
            alto: (maxY - minY + 1) / antes.alto,
          },
        }
      : {}),
    veredicto: cambio ? "cambio" : "igual",
  };
}

const pct1 = (n: number): string => `${(n * 100).toFixed(n < 0.1 ? 1 : 0)} %`;

/** El informe en texto. En «igual» dice las DOS explicaciones posibles, para que no se elija una sin mirar. */
export function informeDeCambio(c: Cambio): string[] {
  const zona = `zona x ${pct1(c.region.x)}, y ${pct1(c.region.y)}, ${pct1(c.region.ancho)} de ancho por ${pct1(c.region.alto)} de alto`;
  if (c.veredicto === "cambio" && c.cajaDelCambio !== undefined) {
    const b = c.cajaDelCambio;
    return [
      `CAMBIÓ: el ${pct1(c.cambiados)} de los píxeles de la ${zona} son distintos.`,
      `Lo que cambió cabe en x ${pct1(b.x)}, y ${pct1(b.y)}, ${pct1(b.ancho)} de ancho por ${pct1(b.alto)} de alto.`,
    ];
  }
  return [
    `IGUAL: solo el ${pct1(c.cambiados)} de los píxeles de la ${zona} difieren, bajo el ${pct1(UMBRAL_DE_CAMBIO)} que se da por un cambio.`,
    "Si esperabas un cambio hay DOS explicaciones y no se distinguen con estas dos capturas: que la app no repinta,",
    "o que la segunda captura se tomó antes del repintado (que es asíncrono). Toma otra unos 500 ms después y vuelve a medir;",
    "si sigue igual, es que no se repinta. No la des por «cacheada» sin haberlo hecho.",
  ];
}
