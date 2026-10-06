/**
 * La GEOMETRÍA de una pantalla: comparar CAJAS, no píxeles. Pura.
 *
 * Existe por una sesión de MyAllXOne (crear una calculadora de Stitch): diez rondas de «cambio el CSS →
 * despliega y captura → compara» porque nada le decía al agente QUÉ estaba mal. El comparador de franjas
 * (`compararCapturas.ts`) da dónde hay contenido, no qué tecla; el SSIM se quedó en 0,44–0,48 en todas
 * las rondas; y el crítico con visión no vio la «=» tapada por la barra de navegación y se inventó
 * diferencias de color. Pero los dos lados se pueden tener como DATOS:
 *
 * - **El aparato** da su árbol de controles (`getAllElements`): cada control con su texto, su nombre y
 *   su caja en píxeles. Lo guarda con la captura, en el mismo momento, `xone-captura-android`.
 * - **Una maqueta de Stitch** trae `code.html`: renderizado, da la caja de cada botón con su texto.
 *
 * Dos niveles:
 * 1. **Solo con el aparato** (`hallazgosDelAparato`), haya maqueta o no: lo TAPADO por las barras del
 *    sistema (Android dibuja de borde a borde, así que un control puede quedar debajo de la de
 *    navegación), lo que se SALE de la pantalla y lo que se SOLAPA.
 * 2. **Con la maqueta** (`compararConMaqueta`): se EMPAREJAN por texto Y posición —por texto solo, el
 *    «0» del visor se emparejó con la tecla «0»— y se dice qué FALTA, qué cambia de FILA o de ORDEN, y
 *    qué TAMAÑO RELATIVO a sus vecinas cambia. Nada de coordenadas absolutas: las proporciones de la
 *    maqueta (390×746) y del aparato (1080×2400) no coinciden, y cada «está 30 px más abajo» sería ruido.
 *
 * Lo que es BLOQUEANTE (tapado, fuera, falta) decide el veredicto; el resto son diferencias.
 */

export interface Caja {
  x: number;
  y: number;
  ancho: number;
  alto: number;
}

export interface Rectangulo {
  izquierda: number;
  arriba: number;
  derecha: number;
  abajo: number;
}

export interface ControlDelAparato {
  nombre?: string;
  texto?: string;
  tipo?: string;
  /** El `propType` de XOne: `B` botón, `IMG` imagen, `T`/`TL`/`L` texto o etiqueta… */
  clase?: string;
  caja: Caja;
  /** El contenedor del que cuelga (un número por contenedor del árbol): solo los HERMANOS pueden solaparse por error. */
  padre?: number;
  /** El árbol dice que no se ve (`visibleBounds: null`): está fuera por el scroll de su lista, no fuera de la pantalla. */
  fueraDeVista?: true;
}

export interface GeometriaDelAparato {
  pantalla: { ancho: number; alto: number };
  barras?: { estado?: Rectangulo; navegacion?: Rectangulo };
  controles: ControlDelAparato[];
}

export interface ElementoDeMaqueta {
  /** El texto visible. Un botón de solo icono trae el nombre de la ligadura (`backspace`): eso NO es texto. */
  texto: string;
  caja: Caja;
  /** Su ancho no se conoce (una maqueta DESCRITA sin unidades): no entra en la comparación de anchos. */
  sinAncho?: true;
}

export interface MaquetaMedida {
  ancho: number;
  alto: number;
  elementos: ElementoDeMaqueta[];
  /**
   * Los BLOQUES anchos de la maqueta (cabecera, visor, panel…): casi tan anchos como la pantalla. No son controles,
   * pero su fondo y su forma también son el diseño (medido: una cabecera amarilla que la maqueta no tiene no salía).
   */
  bloques?: Caja[];
}

export interface HallazgosDeGeometria {
  /** Tapado, fuera de la pantalla, falta: deciden el veredicto. */
  bloqueantes: string[];
  /** Fila, orden, tamaño relativo, solapes, lo que sobra. */
  diferencias: string[];
  /** Lo que no se pudo comparar y por qué: se dice, no se calla. */
  notas: string[];
}

/** Cuántos hallazgos de cada clase como mucho: más es ruido que nadie lee. */
export const TOPE_DE_HALLAZGOS = 10;
/** Cuánto (en fracción del alto del control) tiene que meterse bajo una barra para contar como tapado. */
const FRACCION_TAPADA = 0.1;
/** Cuánto cambia el tamaño relativo a sus vecinas para decirlo: un 40 %. */
const CAMBIO_DE_TAMAÑO = 0.4;
/** Distancia máxima (en fracción de la pantalla) para emparejar un icono sin texto por su posición. */
const DISTANCIA_PARA_ICONOS = 0.08;
/**
 * Cuánto puede moverse el borde de una fila (en fracción del ancho de la pantalla) sin que sea noticia. Medido en la
 * calculadora: un teclado cuya cuarta columna acababa en el 87 % del ancho, con la maqueta llegando al 94 %, dejaba
 * una franja vacía a la derecha que ni las filas ni los anchos relativos veían.
 */
const ENCAJE = 0.04;

// ---------------------------------------------------------------- el árbol del aparato

/** Los controles del árbol de `getAllElements` (lista anidada de nodos con `bounds`), aplanados. */
export function controlesDelArbol(arbol: unknown): ControlDelAparato[] {
  const salida: ControlDelAparato[] = [];
  let contenedores = 0;
  const visitar = (n: unknown, padre?: number): void => {
    if (Array.isArray(n)) {
      for (const x of n) visitar(x, padre);
      return;
    }
    if (n === null || typeof n !== "object") return;
    const nodo = n as Record<string, unknown>;
    const b = nodo["bounds"] as Record<string, unknown> | undefined;
    if (
      b !== undefined &&
      nodo["visible"] !== false &&
      typeof b["left"] === "number" &&
      typeof b["top"] === "number" &&
      typeof b["width"] === "number" &&
      typeof b["height"] === "number" &&
      b["width"] > 0 &&
      b["height"] > 0
    ) {
      const texto = typeof nodo["text"] === "string" ? nodo["text"].trim() : "";
      contenedores += 1;
      const yo = contenedores;
      salida.push({
        ...(padre === undefined ? {} : { padre }),
        ...("visibleBounds" in nodo && nodo["visibleBounds"] === null ? { fueraDeVista: true as const } : {}),
        ...(typeof nodo["name"] === "string" ? { nombre: nodo["name"] } : {}),
        ...(texto === "" ? {} : { texto }),
        ...(typeof nodo["type"] === "string" ? { tipo: nodo["type"] } : {}),
        ...(typeof nodo["propType"] === "string" ? { clase: nodo["propType"] } : {}),
        caja: { x: b["left"] as number, y: b["top"] as number, ancho: b["width"] as number, alto: b["height"] as number },
      });
      for (const v of Object.values(nodo)) if (v !== null && typeof v === "object") visitar(v, yo);
      return;
    }
    for (const v of Object.values(nodo)) if (v !== null && typeof v === "object") visitar(v, padre);
  };
  visitar(arbol);
  return salida;
}

/** Un control «de verdad» (con texto, o que no es un contenedor): los marcos llegan de borde a borde y solo meten ruido. */
/** Un control que se juzga: con texto o que no es un marco, y que se VE (no está fuera por el scroll de su lista). */
const esHoja = (c: ControlDelAparato): boolean =>
  c.fueraDeVista !== true && (c.texto !== undefined || (c.tipo !== undefined && c.tipo !== "frame" && c.tipo !== "group"));

/** Cómo se nombra un control en un hallazgo: su texto entre comillas, y su nombre si lo tiene. */
function nombrar(c: ControlDelAparato): string {
  if (c.texto !== undefined && c.nombre !== undefined) return `«${c.texto}» (${c.nombre})`;
  return c.texto !== undefined ? `«${c.texto}»` : (c.nombre ?? "un control sin nombre");
}

// ---------------------------------------------------------------- nivel 1: solo el aparato

export function hallazgosDelAparato(g: GeometriaDelAparato): HallazgosDeGeometria {
  const bloqueantes: string[] = [];
  const diferencias: string[] = [];
  const notas: string[] = [];
  const hojas = g.controles.filter(esHoja);
  const nav = g.barras?.navegacion;
  const estado = g.barras?.estado;
  if (g.barras === undefined) notas.push("sin las barras del sistema: no puedo decir qué queda tapado por ellas");

  for (const c of hojas) {
    const abajo = c.caja.y + c.caja.alto;
    const derecha = c.caja.x + c.caja.ancho;
    if (nav !== undefined && abajo - nav.arriba > c.caja.alto * FRACCION_TAPADA && c.caja.y < nav.abajo) {
      bloqueantes.push(
        `${nombrar(c)} queda TAPADO por la barra de navegación: acaba en y=${abajo} y la barra empieza en y=${nav.arriba} (${abajo - nav.arriba} px debajo).`
      );
    } else if (estado !== undefined && estado.abajo - c.caja.y > c.caja.alto * FRACCION_TAPADA && abajo > estado.arriba && c.caja.y < estado.abajo) {
      bloqueantes.push(
        `${nombrar(c)} queda TAPADO por la barra de estado: empieza en y=${c.caja.y} y la barra acaba en y=${estado.abajo}.`
      );
    } else if (c.caja.x < -2 || c.caja.y < -2 || derecha > g.pantalla.ancho + 2 || abajo > g.pantalla.alto + 2) {
      bloqueantes.push(`${nombrar(c)} se SALE de la pantalla (${c.caja.x},${c.caja.y} → ${derecha},${abajo} en una de ${g.pantalla.ancho}×${g.pantalla.alto}).`);
    }
  }

  // Solapes entre controles con texto: dos teclas montadas una encima de otra se ven, pero no se pulsan. Solo entre
  // HERMANOS: un panel que se abre encima del teclado (medido: la cinta de la calculadora) no es un error de maqueta. El
  // árbol de `getAllElements` viene PLANO pero en el orden de la jerarquía (cada marco antes que lo suyo), así que el
  // contenedor es el último marco ANTERIOR en la lista que lo contiene. Por geometría sola, un panel que tapa una tecla
  // entera pasaba por su contenedor.
  const contiene = (m: Caja, c: Caja) => c.x >= m.x - 1 && c.y >= m.y - 1 && c.x + c.ancho <= m.x + m.ancho + 1 && c.y + c.alto <= m.y + m.alto + 1;
  const contenedor = (c: ControlDelAparato): number | ControlDelAparato | undefined => {
    if (c.padre !== undefined) return c.padre;
    const i = g.controles.indexOf(c);
    for (let k = i - 1; k >= 0; k--) {
      const m = g.controles[k]!;
      if ((m.tipo === "frame" || m.tipo === "group") && contiene(m.caja, c.caja)) return m;
    }
    return undefined;
  };
  const conTexto = hojas.filter((c) => c.texto !== undefined);
  for (let i = 0; i < conTexto.length; i++) {
    for (let j = i + 1; j < conTexto.length; j++) {
      if (contenedor(conTexto[i]!) !== contenedor(conTexto[j]!)) continue;
      const a = conTexto[i]!.caja;
      const b = conTexto[j]!.caja;
      const ancho = Math.min(a.x + a.ancho, b.x + b.ancho) - Math.max(a.x, b.x);
      const alto = Math.min(a.y + a.alto, b.y + b.alto) - Math.max(a.y, b.y);
      if (ancho <= 0 || alto <= 0) continue;
      const menor = Math.min(a.ancho * a.alto, b.ancho * b.alto);
      // Uno DENTRO de otro (un texto dentro de su tarjeta) no es un solape: es anidar.
      if (ancho * alto >= menor * 0.95) continue;
      if (ancho * alto > menor * 0.2) diferencias.push(`${nombrar(conTexto[i]!)} y ${nombrar(conTexto[j]!)} se SOLAPAN.`);
    }
  }
  return { bloqueantes, diferencias, notas };
}

// ---------------------------------------------------------------- nivel 2: contra la maqueta

/** Los signos que se escriben de varias formas. */
const ALIAS: Record<string, string> = { "−": "-", "–": "-", "×": "x", "*": "x", "÷": "/" };
/** Adornos que el aparato pinta delante de un texto («• DEG») y no forman parte de él. */
const ADORNOS = /[•◦▪●]/g;

/**
 * El texto con el que se empareja, o `""` si es un ICONO. Los botones de Stitch llevan iconos de Material
 * como ligaduras (`backspace`, `content_copy COPY`): una palabra en minúsculas y con `_` es el nombre de un
 * icono, no texto que se vea.
 */
export function textoParaEmparejar(texto: string): string {
  // `[borrar]`: así nombra un icono quien DESCRIBE una maqueta (`maquetaDescrita.ts`).
  if (/^\[[^\]]*\]$/.test(texto.trim())) return "";
  const palabras = texto.replace(ADORNOS, " ").trim().split(/\s+/).filter((p) => p !== "");
  const visibles = palabras.filter((p) => !/^[a-z][a-z0-9]*(_[a-z0-9]+)+$/.test(p) && !(palabras.length === 1 && /^[a-z]{4,}$/.test(p)));
  const unido = visibles.join(" ");
  return unido
    .split("")
    .map((c) => ALIAS[c] ?? c)
    .join("")
    .toLowerCase();
}

interface Pareja {
  maqueta: ElementoDeMaqueta;
  aparato: ControlDelAparato;
  /** Tenía texto en la maqueta y se emparejó por POSICIÓN con un control sin texto (una imagen). */
  porPosicion?: true;
  /** Los dos tienen PALABRAS y dicen otra cosa, en el mismo sitio: un texto traducido o cambiado. */
  otroTexto?: true;
}

/**
 * ¿Lleva LETRAS el texto (ya pasado por `textoParaEmparejar`)? Una cifra o un signo no se empareja por sitio con una
 * palabra: medido en la calculadora, el «19» del visor salía como pareja de «COPY».
 */
export function tieneLetras(texto: string): boolean {
  return /[a-záéíóúüñ]/i.test(texto);
}

/** Lo que se VE de un texto: sin el nombre de la ligadura de un icono (`content_copy COPY` → `COPY`). */
export function textoVisible(texto: string): string {
  const palabras = texto.replace(ADORNOS, " ").trim().split(/\s+/).filter((p) => p !== "");
  const visibles = palabras.filter((p) => !/^[a-z][a-z0-9]*(_[a-z0-9]+)+$/.test(p));
  return (visibles.length > 0 ? visibles : palabras).join(" ");
}

/** El centro de una caja en fracción de su pantalla. */
const centro = (c: Caja, ancho: number, alto: number): [number, number] => [(c.x + c.ancho / 2) / ancho, (c.y + c.alto / 2) / alto];

/**
 * Empareja uno a uno: primero por TEXTO igual, eligiendo entre los iguales el más cercano (así el «0» de
 * la tecla no se empareja con el «0» del visor); después los ICONOS por posición, solo si el más cercano
 * está cerca y libre. Lo que no se empareja se devuelve aparte.
 */
export function emparejar(
  m: MaquetaMedida,
  g: GeometriaDelAparato,
  /** Solo por texto: con una maqueta DESCRITA las posiciones son de una rejilla, y un icono «cerca» no significa nada. */
  soloTexto = false
): { parejas: Pareja[]; sinPareja: ElementoDeMaqueta[] } {
  const hojas = g.controles.filter(esHoja);
  const usadosM = new Set<number>();
  const usadosA = new Set<number>();
  const parejas: Pareja[] = [];
  const distancia = (e: ElementoDeMaqueta, c: ControlDelAparato): number => {
    const [mx, my] = centro(e.caja, m.ancho, m.alto);
    const [ax, ay] = centro(c.caja, g.pantalla.ancho, g.pantalla.alto);
    return Math.abs(mx - ax) + Math.abs(my - ay);
  };

  const candidatas: { i: number; j: number; d: number }[] = [];
  m.elementos.forEach((e, i) => {
    const t = textoParaEmparejar(e.texto);
    if (t === "") return;
    hojas.forEach((c, j) => {
      if (c.texto !== undefined && textoParaEmparejar(c.texto) === t) candidatas.push({ i, j, d: distancia(e, c) });
    });
  });
  for (const { i, j } of candidatas.sort((a, b) => a.d - b.d)) {
    if (usadosM.has(i) || usadosA.has(j)) continue;
    usadosM.add(i);
    usadosA.add(j);
    parejas.push({ maqueta: m.elementos[i]!, aparato: hojas[j]! });
  }

  /**
   * Palabras que dicen OTRA cosa en el mismo sitio: la maqueta de Stitch viene en inglés y el agente escribe en el
   * idioma de la app («COPY» → «COPIAR», «Tape» → «HISTORIAL»). Medido en la calculadora: sin este paso, cada texto
   * traducido salía como BLOQUEANTE («NO está en el aparato») y la pantalla no daba verde nunca; y el paso de iconos
   * de abajo emparejaba «Tape» con la imagen de al lado. Va ANTES que los iconos y solo entre controles con letras.
   */
  if (!soloTexto) {
    const porSitio: { i: number; j: number; d: number }[] = [];
    m.elementos.forEach((e, i) => {
      const t = textoParaEmparejar(e.texto);
      if (usadosM.has(i) || !tieneLetras(t)) return;
      hojas.forEach((c, j) => {
        if (usadosA.has(j) || c.texto === undefined || !tieneLetras(textoParaEmparejar(c.texto))) return;
        const d = distancia(e, c);
        if (d <= DISTANCIA_PARA_ICONOS) porSitio.push({ i, j, d });
      });
    });
    for (const { i, j } of porSitio.sort((a, b) => a.d - b.d)) {
      if (usadosM.has(i) || usadosA.has(j)) continue;
      usadosM.add(i);
      usadosA.add(j);
      parejas.push({ maqueta: m.elementos[i]!, aparato: hojas[j]!, otroTexto: true });
    }
  }

  // Iconos —y lo que en la maqueta es texto y en el aparato una IMAGEN («√»)—: por posición, contra
  // controles SIN texto que nadie ha cogido.
  m.elementos.forEach((e, i) => {
    if (soloTexto || usadosM.has(i)) return;
    let mejor: { j: number; d: number } | undefined;
    hojas.forEach((c, j) => {
      if (usadosA.has(j) || c.texto !== undefined) return;
      const d = distancia(e, c);
      if (mejor === undefined || d < mejor.d) mejor = { j, d };
    });
    if (mejor !== undefined && mejor.d <= DISTANCIA_PARA_ICONOS) {
      usadosM.add(i);
      usadosA.add(mejor.j);
      parejas.push({ maqueta: e, aparato: hojas[mejor.j]!, ...(textoParaEmparejar(e.texto) === "" ? {} : { porPosicion: true as const }) });
    }
  });

  return { parejas, sinPareja: m.elementos.filter((_, i) => !usadosM.has(i)) };
}

/** Agrupa en FILAS: dos van en la misma si sus centros verticales están a menos de medio alto. Devuelve el índice de fila de cada uno. */
export function filas(cajas: readonly Caja[]): number[] {
  const orden = cajas.map((c, i) => ({ i, cy: c.y + c.alto / 2, alto: c.alto })).sort((a, b) => a.cy - b.cy);
  const fila = new Array<number>(cajas.length).fill(0);
  let actual = -1;
  let referencia: { cy: number; alto: number } | undefined;
  for (const o of orden) {
    if (referencia === undefined || Math.abs(o.cy - referencia.cy) >= Math.min(o.alto, referencia.alto) / 2) {
      actual += 1;
      referencia = { cy: o.cy, alto: o.alto };
    }
    fila[o.i] = actual;
  }
  return fila;
}

const mediana = (xs: readonly number[]): number => {
  const o = [...xs].sort((a, b) => a - b);
  return o.length === 0 ? 0 : o.length % 2 === 1 ? o[(o.length - 1) / 2]! : (o[o.length / 2 - 1]! + o[o.length / 2]!) / 2;
};
const etiqueta = (e: ElementoDeMaqueta): string => {
  const t = e.texto.trim();
  return /^[a-z][a-z0-9_]*$/.test(t) ? `el icono «${t}»` : `«${t.replace(/^[a-z_]+\s+/, "")}»`;
};
const veces = (x: number): string => x.toFixed(1).replace(".", ",");
const mayuscula = (t: string): string => t.charAt(0).toUpperCase() + t.slice(1);

/**
 * Cómo se compara. Por omisión, una maqueta MEDIDA contra el aparato. `aproximada` es una maqueta DESCRITA
 * por el modelo (`maquetaDescrita.ts`): sus cajas son una rejilla, así que se empareja solo por texto, no hay
 * proporción que comparar, y lo que falta NO es bloqueante —es lo que el modelo dijo ver, no una medida—.
 */
export interface ModoDeComparacion {
  aproximada?: true;
  /** Cómo se nombra cada lado en los hallazgos: por omisión «la maqueta» y «el aparato». */
  nombres?: { maqueta: string; aparato: string };
}

export function compararConMaqueta(m: MaquetaMedida, g: GeometriaDelAparato, modo: ModoDeComparacion = {}): HallazgosDeGeometria {
  const bloqueantes: string[] = [];
  const diferencias: string[] = [];
  const notas: string[] = [];
  const aproximada = modo.aproximada === true;
  const { maqueta: laMaqueta, aparato: elAparato } = modo.nombres ?? { maqueta: "la maqueta", aparato: "el aparato" };
  const { parejas, sinPareja } = emparejar(m, g, aproximada);
  for (const p of parejas) {
    if (p.otroTexto === true) {
      notas.push(`${etiqueta(p.maqueta)} de ${laMaqueta} dice «${textoVisible(p.aparato.texto ?? "")}» en ${elAparato}: otro texto en su sitio (traducido o cambiado), no falta. Comparo su caja igual.`);
    }
    if (p.porPosicion === true) notas.push(`${etiqueta(p.maqueta)} de ${laMaqueta} es en ${elAparato} un control SIN texto (${p.aparato.nombre ?? "sin nombre"}): una imagen en su sitio. Comparo su caja igual.`);
  }

  /**
   * En una maqueta DESCRITA, un texto sin pareja solo es noticia si su FILA existe en el otro lado (algún
   * vecino suyo sí se emparejó): medido sobre la calculadora, los textos de ejemplo del visor
   * («1,240 × 15% + 450 = 636») no están en el aparato, y no tienen por qué.
   */
  const filasConPareja = new Set(parejas.map((p) => p.maqueta.caja.y));
  const sinFila: string[] = [];
  for (const e of sinPareja) {
    if (textoParaEmparejar(e.texto) === "") {
      if (!aproximada) notas.push(`${etiqueta(e)} de ${laMaqueta} no lo puedo emparejar: no tiene texto y nada de ${elAparato} cae cerca de su sitio.`);
    } else if (aproximada) {
      if (filasConPareja.has(e.caja.y)) diferencias.push(`${etiqueta(e)} de ${laMaqueta} no lo encuentro en ${elAparato} con ese texto (puede ser una imagen en su sitio: míralo).`);
      else sinFila.push(etiqueta(e));
    } else bloqueantes.push(`${etiqueta(e)} de ${laMaqueta} NO está en ${elAparato} (ningún control con ese texto).`);
  }
  if (sinFila.length > 0) {
    notas.push(`sin el mismo texto en ${elAparato}, ni en su fila: ${sinFila.slice(0, 5).join(", ")}${sinFila.length > 5 ? "…" : ""} (si son datos de ejemplo de un visor, es normal).`);
  }
  if (parejas.length < 2) {
    notas.push("con menos de dos controles emparejados no hay filas ni tamaños que comparar.");
    return { bloqueantes, diferencias, notas };
  }

  const filaM = filas(parejas.map((p) => p.maqueta.caja));
  const filaA = filas(parejas.map((p) => p.aparato.caja));

  // FILAS: lo que en la maqueta va junto y en el aparato no (o al revés), dicho por fila de la maqueta.
  const porFilaM = new Map<number, number[]>();
  filaM.forEach((f, i) => porFilaM.set(f, [...(porFilaM.get(f) ?? []), i]));
  for (const indices of porFilaM.values()) {
    if (indices.length < 2) continue;
    const enAparato = new Map<number, number[]>();
    for (const i of indices) enAparato.set(filaA[i]!, [...(enAparato.get(filaA[i]!) ?? []), i]);
    const nombres = indices
      .slice()
      .sort((a, b) => parejas[a]!.maqueta.caja.x - parejas[b]!.maqueta.caja.x)
      .map((i) => etiqueta(parejas[i]!.maqueta));
    if (enAparato.size > 1) {
      // La parte más grande es «la fila»; lo demás, lo que se ha ido a otra.
      const grupos = [...enAparato.values()].sort((a, b) => b.length - a.length);
      const fuera = grupos.slice(1).flat().map((i) => etiqueta(parejas[i]!.maqueta));
      diferencias.push(`${mayuscula(`en ${laMaqueta}`)} ${nombres.join(", ")} van en la MISMA fila; en ${elAparato} ${fuera.join(", ")} va${fuera.length > 1 ? "n" : ""} en otra.`);
      continue;
    }
    // Misma fila en los dos: el ORDEN de izquierda a derecha.
    const ordenA = indices.slice().sort((a, b) => parejas[a]!.aparato.caja.x - parejas[b]!.aparato.caja.x).map((i) => etiqueta(parejas[i]!.maqueta));
    if (ordenA.join("|") !== nombres.join("|")) diferencias.push(`En la fila ${nombres.join(", ")} el ORDEN cambia: en ${elAparato} va ${ordenA.join(", ")}.`);
  }

  // ENCAJE: dónde empieza y acaba cada fila, en fracción del ancho de su pantalla. Solo con las dos medidas (una
  // maqueta descrita es una rejilla y su ancho no es el de nada). Las filas con el mismo desajuste van juntas.
  if (!aproximada) {
    const porcentaje = (x: number) => `${Math.round(x * 100)} %`;
    const encajes = new Map<string, string[]>();
    for (const indices of porFilaM.values()) {
      if (indices.length < 2) continue;
      const borde = (lado: "maqueta" | "aparato", ancho: number) => ({
        izq: Math.min(...indices.map((i) => parejas[i]![lado].caja.x)) / ancho,
        der: Math.max(...indices.map((i) => parejas[i]![lado].caja.x + parejas[i]![lado].caja.ancho)) / ancho,
      });
      const bm = borde("maqueta", m.ancho);
      const ba = borde("aparato", g.pantalla.ancho);
      const primera = etiqueta(parejas[indices.slice().sort((a, b) => parejas[a]!.maqueta.caja.x - parejas[b]!.maqueta.caja.x)[0]!]!.maqueta);
      const partes: string[] = [];
      if (Math.abs(ba.izq - bm.izq) > ENCAJE) partes.push(`empieza{n} en el ${porcentaje(ba.izq)} del ancho (en ${laMaqueta}, en el ${porcentaje(bm.izq)})`);
      if (Math.abs(ba.der - bm.der) > ENCAJE) partes.push(`acaba{n} en el ${porcentaje(ba.der)} del ancho (en ${laMaqueta}, en el ${porcentaje(bm.der)})`);
      if (partes.length > 0) encajes.set(partes.join(" y "), [...(encajes.get(partes.join(" y ")) ?? []), primera]);
    }
    for (const [como, filas] of encajes) {
      const n = filas.length > 1 ? "n" : "";
      diferencias.push(`${filas.length > 1 ? `Las filas de ${filas.join(", ")}` : `La fila de ${filas[0]}`} ${como.replaceAll("{n}", n)}: no ocupa${n} el mismo ANCHO.`);
    }
  }

  // TAMAÑO relativo a sus vecinas de fila (en la maqueta y en el aparato, cada uno con las suyas). Solo
  // entre BOTONES e imágenes: la caja de una etiqueta es el hueco que le da el layout, no lo que se pinta,
  // y medido sobre la calculadora, «• DEG» salía «2,7 veces el ancho» sin verse distinto.
  const comparable = (i: number): boolean => {
    const clase = parejas[i]!.aparato.clase;
    return clase === undefined || clase === "B" || clase === "IMG";
  };
  for (const todos of porFilaM.values()) {
    const indices = todos.filter((i) => comparable(i) && parejas[i]!.maqueta.sinAncho !== true);
    if (indices.length < 2) continue;
    const anchosM = indices.map((i) => parejas[i]!.maqueta.caja.ancho);
    const anchosA = indices.map((i) => parejas[i]!.aparato.caja.ancho);
    const medM = mediana(anchosM);
    const medA = mediana(anchosA);
    if (medM <= 0 || medA <= 0) continue;
    indices.forEach((i, k) => {
      const rm = anchosM[k]! / medM;
      const ra = anchosA[k]! / medA;
      if (Math.abs(ra / rm - 1) > CAMBIO_DE_TAMAÑO) {
        diferencias.push(`${etiqueta(parejas[i]!.maqueta)} mide ${veces(ra)} veces el ancho de las de su fila; en ${laMaqueta}, ${veces(rm)}.`);
      }
    });
  }
  // PROPORCIÓN de cada control (alto entre ancho): una tecla aplastada o estirada. Si su ANCHO ya se ha
  // dicho, la proporción es la misma noticia contada otra vez.
  if (aproximada) return { bloqueantes, diferencias, notas };
  const yaDichos = new Set(diferencias.filter((d) => d.includes("veces el ancho")).map((d) => d.split(" mide ")[0]));
  parejas.forEach((p, i) => {
    if (!comparable(i) || yaDichos.has(etiqueta(p.maqueta))) return;
    const pm = p.maqueta.caja.alto / p.maqueta.caja.ancho;
    const pa = p.aparato.caja.alto / p.aparato.caja.ancho;
    if (pm > 0 && Math.abs(pa / pm - 1) > CAMBIO_DE_TAMAÑO && (pa < pm ? pm / pa : pa / pm) > 1.4) {
      diferencias.push(`${etiqueta(p.maqueta)} tiene otra PROPORCIÓN: alto/ancho ${veces(pa)} en el aparato y ${veces(pm)} en la maqueta (${pa < pm ? "más aplastado" : "más estirado"}).`);
    }
  });
  return { bloqueantes, diferencias, notas };
}

/** Los dos niveles juntos, recortados al tope, y sin repetir. */
export function hallazgosDeGeometria(g: GeometriaDelAparato, m?: MaquetaMedida): HallazgosDeGeometria {
  const aparato = hallazgosDelAparato(g);
  const maqueta = m === undefined ? { bloqueantes: [], diferencias: [], notas: [] } : compararConMaqueta(m, g);
  const unico = (xs: string[]): string[] => [...new Set(xs)];
  const recorte = (xs: string[]): string[] =>
    xs.length <= TOPE_DE_HALLAZGOS ? xs : [...xs.slice(0, TOPE_DE_HALLAZGOS), `… y ${xs.length - TOPE_DE_HALLAZGOS} más del mismo tipo.`];
  return {
    bloqueantes: recorte(unico([...aparato.bloqueantes, ...maqueta.bloqueantes])),
    diferencias: recorte(unico([...aparato.diferencias, ...maqueta.diferencias])),
    notas: unico([...aparato.notas, ...maqueta.notas]),
  };
}

/** El bloque de texto que ve el agente (y que se le da al crítico como HECHOS). */
export function informeDeGeometria(h: HallazgosDeGeometria, conMaqueta: boolean): string[] {
  const lineas = [
    conMaqueta
      ? "GEOMETRÍA, MEDIDA (árbol de controles del aparato contra las cajas de la maqueta: exacta, no es una opinión):"
      : "GEOMETRÍA, MEDIDA (árbol de controles del aparato; sin cajas de la maqueta, solo lo que se ve en el propio aparato):",
  ];
  if (h.bloqueantes.length === 0 && h.diferencias.length === 0) lineas.push("- Nada: ningún control tapado, fuera de la pantalla o solapado" + (conMaqueta ? ", y la estructura cuadra con la maqueta." : "."));
  for (const b of h.bloqueantes) lineas.push(`- ${b}`);
  for (const d of h.diferencias) lineas.push(`- ${d}`);
  for (const n of h.notas) lineas.push(`- (nota) ${n}`);
  return lineas;
}

/**
 * Los controles que SE VEN en el aparato, en filas de arriba abajo y cada fila de izquierda a derecha: los que
 * tienen texto, y los botones e imágenes sin él. Es la ESTRUCTURA que se le da a quien describe la captura
 * (`descripcionDePantalla.ts`), para que describa estos controles y no se invente otros.
 */
export function filasDelAparato(g: GeometriaDelAparato): ControlDelAparato[][] {
  const visibles = g.controles.filter((c) => c.texto !== undefined || c.clase === "B" || c.clase === "IMG");
  const indice = filas(visibles.map((c) => c.caja));
  const porFila = new Map<number, ControlDelAparato[]>();
  visibles.forEach((c, i) => porFila.set(indice[i]!, [...(porFila.get(indice[i]!) ?? []), c]));
  return [...porFila.entries()].sort((a, b) => a[0] - b[0]).map(([, fila]) => fila.sort((a, b) => a.caja.x - b.caja.x));
}
