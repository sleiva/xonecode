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
  hallazgos: string[];
  veredicto: Veredicto;
}

const pct = (n: number): string => `${Math.round(n * 100)} %`;

/** El color más frecuente, cuantizado a 6 bits por canal para tolerar el ruido de un JPEG. */
function colorDeFondo(img: ImagenRgba, desde: number, hasta: number): [number, number, number] {
  const cuentas = new Map<number, number>();
  const { ancho, datos } = img;
  for (let y = desde; y < hasta; y += PASO_DE_MUESTREO) {
    for (let x = 0; x < ancho; x += PASO_DE_MUESTREO) {
      const i = (y * ancho + x) * 4;
      const clave = ((datos[i]! >> 2) << 16) | ((datos[i + 1]! >> 2) << 8) | (datos[i + 2]! >> 2);
      cuentas.set(clave, (cuentas.get(clave) ?? 0) + 1);
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
  return [((mejor >> 16) & 63) << 2, ((mejor >> 8) & 63) << 2, (mejor & 63) << 2];
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
  return {
    fondo,
    inicioDelContenido: primera < 0 ? 0 : primera / alto,
    finDelContenido: ultima < 0 ? 0 : (ultima + 1) / alto,
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

/** Compara dos pantallas ya medidas. Puro: los números salen de `medirPantalla`. */
export function compararMedidas(referencia: MedidaDePantalla, captura: MedidaDePantalla): Comparacion {
  const dv = distancia(referencia.filas, captura.filas);
  const dh = distancia(referencia.columnas, captura.columnas);
  const hallazgos: string[] = [];

  const finRef = referencia.finDelContenido;
  const finCap = captura.finDelContenido;
  if (finRef - finCap > 0.15) {
    hallazgos.push(
      `El contenido de la captura acaba al ${pct(finCap)} del alto útil y el de la referencia al ${pct(finRef)}: ` +
        `queda una banda vacía de un ${pct(finRef - finCap)} debajo`
    );
  } else if (finCap - finRef > 0.15) {
    hallazgos.push(
      `El contenido de la captura llega al ${pct(finCap)} del alto útil y el de la referencia solo al ${pct(finRef)}`
    );
  }
  const inicioRef = referencia.inicioDelContenido;
  const inicioCap = captura.inicioDelContenido;
  if (Math.abs(inicioRef - inicioCap) > 0.1) {
    hallazgos.push(
      `El contenido de la captura empieza al ${pct(inicioCap)} del alto útil y el de la referencia al ${pct(inicioRef)}`
    );
  }
  hallazgos.push(...describirRangos("alto", referencia.filas, captura.filas));
  hallazgos.push(...describirRangos("ancho", referencia.columnas, captura.columnas));

  const parecida = dv <= DISTANCIA_PARECIDA && dh <= DISTANCIA_PARECIDA && hallazgos.length === 0;
  return {
    referencia,
    captura,
    distanciaVertical: dv,
    distanciaHorizontal: dh,
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
export function informeDeComparacion(c: Comparacion): string[] {
  const filas = (m: MedidaDePantalla): string => m.filas.map((f) => String(Math.round(f * 100)).padStart(3)).join("");
  const lineas = [
    `Estructura ${c.veredicto === "parecida" ? "PARECIDA" : "DISTINTA"} (distancia vertical ${pct(c.distanciaVertical)}, horizontal ${pct(c.distanciaHorizontal)}; se da por parecida bajo ${pct(DISTANCIA_PARECIDA)}).`,
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
