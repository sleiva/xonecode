import type { Tema } from "./tema.js";

/**
 * El markdown del asistente, pintado en una consola que NO repinta.
 *
 * Esa es la regla que gobierna todo el módulo: **lo escrito, escrito está**. Una línea
 * solo se puede renderizar cuando su texto es definitivo, y un párrafo largo que llega
 * en trozos solo se puede cortar por donde el corte no rompa un marcador — de ahí
 * `puntoSeguro`. No hay reflow posible: el historial vive en el scrollback del
 * terminal, que no es direccionable.
 *
 * Se pinta lo que los modelos EMITEN de verdad (medido): negritas, `código` en línea,
 * cabeceras, viñetas (anidadas y numeradas), citas, hr, cursiva, enlaces y cercos ```.
 * Lo que no empareja queda literal — inventarse un cierre sería un bug mudo delante
 * del usuario. Las tablas no se maquetan: pasan literales.
 */

/**
 * Los marcadores EN LÍNEA: `**negrita**` y `` `código` ``.
 *
 * Puro: recibe el tema y devuelve la línea lista para escribir. Con un tema sin color
 * (pipe, CI) los tokens son cadena vacía y la salida queda limpia.
 */
export function renderizarInline(texto: string, tema: Tema): string {
  // **Sin color no se despinta el markdown.** Los marcadores son la única pista del
  // énfasis que le queda a un pipe o a un CI que lea esta salida; quitárselos es
  // quitarle información y no darle nada a cambio.
  if (tema.negrita === "" && tema.mudo === "") return texto;
  return texto
    .replace(/\*\*([^*\n]+)\*\*/g, (_, t: string) => `${tema.negrita}${t}${tema.reset}`)
    .replace(/`([^`\n]+)`/g, (_, t: string) => `${tema.mudo}${t}${tema.reset}`);
}

/**
 * Por dónde cortar un párrafo que llega en trozos y aún no ha visto su `\n`.
 *
 * El streaming tiene que verse (un colchón que solo se suelta al final es un `ainvoke`
 * disfrazado), pero cortar por donde sea rompe marcadores: un `**` partido entre dos
 * escrituras queda literal para siempre. Así que el corte es en un ESPACIO, con los
 * pares `**` y `` ` `` CERRADOS en lo escrito. Se devuelve el ÚLTIMO corte seguro
 * (menos escrituras), y `undefined` si no hay ninguno — entonces se espera.
 */
export function puntoSeguro(colchon: string, minimo: number): number | undefined {
  let corte: number | undefined;
  for (let i = minimo; i <= colchon.length; i++) {
    if (colchon[i - 1] !== " ") continue;
    const prefijo = colchon.slice(0, i);
    if (prefijo.split("**").length % 2 !== 1) continue; // una negrita abierta
    if (prefijo.split("`").length % 2 !== 1) continue; // un código abierto
    corte = i;
  }
  return corte;
}

/**
 * ¿Qué líneas de una lista están DENTRO de un cerco? Una por línea, en orden: el
 * estado ANTES de cada línea (así la del ```, abierta o cerrada, queda fuera).
 *
 * La TUI necesita saberlo POR LÍNEA y sin estado propio: sus actos asistente son líneas
 * definitivas en orden, así que un pase sobre ellas basta. Un cerco sin cerrar deja el
 * resto dentro — inventarse un cierre sería un bug mudo delante del usuario.
 */
export function estadosDeCerco(lineas: readonly string[]): boolean[] {
  const dentro: boolean[] = [];
  let enCerco = false;
  for (const linea of lineas) {
    dentro.push(enCerco);
    if (linea.trimStart().startsWith("```")) enCerco = !enCerco;
  }
  return dentro;
}

/** Una línea de markdown ya clasificada: lo que la piel pinta sin volver a parsear. */
export type LineaDeMarkdown =
  | { tipo: "cabecera"; nivel: 1 | 2 | 3; texto: string }
  | { tipo: "vineta"; nivel: number; texto: string }
  | { tipo: "numerada"; nivel: number; numero: number; texto: string }
  | { tipo: "cita"; nivel: number; texto: string }
  | { tipo: "horizontal" }
  /** Abre o cierra: quien llama lo sabe por `estadosDeCerco`, no por la cadena. */
  | { tipo: "cerco"; lenguaje: string }
  | { tipo: "texto"; texto: string };

/**
 * Clasificar UNA línea definitiva de markdown: solo ve líneas que empiezan de verdad
 * (una continuación de párrafo es el colchón, y ese se pinta por su lado). La sangría
 * es 2 espacios por nivel, la medida que los modelos emiten de verdad.
 */
export function clasificarLinea(texto: string): LineaDeMarkdown {
  const sangria = /^( *)/.exec(texto)![1]!;
  const cuerpo = texto.slice(sangria.length);

  const cerco = /^```(\S*)\s*$/.exec(cuerpo);
  if (cerco) return { tipo: "cerco", lenguaje: cerco[1] ?? "" };

  const horizontal = /^(---+|\*\*\*+|___+)\s*$/.exec(cuerpo);
  if (horizontal) return { tipo: "horizontal" };

  const cabecera = /^(#{1,3})\s+(.*)$/.exec(cuerpo);
  if (cabecera) return { tipo: "cabecera", nivel: cabecera[1]!.length as 1 | 2 | 3, texto: cabecera[2]! };

  const vineta = /^[-*]\s+(.*)$/.exec(cuerpo);
  if (vineta) return { tipo: "vineta", nivel: Math.floor(sangria.length / 2), texto: vineta[1]! };

  const numerada = /^(\d+)[.)]\s+(.*)$/.exec(cuerpo);
  if (numerada)
    return { tipo: "numerada", nivel: Math.floor(sangria.length / 2), numero: Number(numerada[1]), texto: numerada[2]! };

  const cita = /^>\s?(.*)$/.exec(cuerpo);
  if (cita) return { tipo: "cita", nivel: Math.floor(sangria.length / 2), texto: cita[1]! };

  return { tipo: "texto", texto };
}

/** Una línea de tabla ya parseada, con los anchos que comparte con TODA su tabla. */
export interface LineaDeTabla {
  celdas: string[];
  anchos: number[];
  rol: "cabecera" | "separador" | "fila";
  /** La última línea del tramo: el skin pinta el cierre después de ella. */
  esUltima: boolean;
}

/** ¿Es una línea de tabla? Empieza por barra — una fila, una cabecera o un separador. */
function esFilaDeTabla(linea: string): boolean {
  return linea.trimStart().startsWith("|");
}

/** Las celdas de una fila de tabla: sin bordes, sin aire. */
function celdasDe(linea: string): string[] {
  return linea
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

/** El separador `|---|:---:|`: todas sus celdas son guiones con alineación opcional. */
function esSeparadorDeTabla(linea: string): boolean {
  const celdas = celdasDe(linea);
  return celdas.length > 0 && celdas.every((c) => /^:?-+:?$/.test(c));
}

const anchoDe = (texto: string): number => Array.from(texto).length;

/** La celda cabe en su columna: recortada con «…» si no cabe — nunca desbordar la pantalla. */
function celdaFija(texto: string, ancho: number): string {
  const letras = Array.from(texto);
  if (letras.length <= ancho) return texto + " ".repeat(ancho - letras.length);
  return letras.slice(0, Math.max(1, ancho - 1)).join("") + "…";
}

/**
 * El reparto del ancho entre columnas, copiado del «full» del TextTable de OpenTUI: la
 * tabla LLENA el panel — una tabla que acaba a medias con el panel vacío a la derecha
 * se lee rota (medido en terminal).
 *
 * Dos casos. Si cabe todo, el SOBRANTE se reparte (columnas más anchas que su contenido,
 * como en la referencia). Si no cabe, se recorta por NIVELES de agua — la primera
 * propuesta fue un tope plano y era injusto: la columna corta desaprovechaba su sitio
 * mientras la larga perdía el doble. Aquí la corta se queda con lo suyo y cede el resto.
 */
function repartir(naturales: readonly number[], presupuesto: number): number[] {
  const total = naturales.reduce((s, a) => s + a, 0);
  if (total <= presupuesto) {
    const llenas = [...naturales];
    let sobra = presupuesto - total;
    for (let j = 0; sobra > 0; j++) {
      llenas[j % llenas.length]! += 1;
      sobra--;
    }
    return llenas;
  }
  const resultado = naturales.map(() => 0);
  const orden = naturales.map((_, i) => i).sort((a, b) => naturales[a]! - naturales[b]!);
  let vivos = naturales.length;
  let resto = presupuesto;
  for (const idx of orden) {
    const nivel = Math.max(3, Math.floor(resto / vivos));
    const asignado = Math.min(naturales[idx]!, nivel);
    resultado[idx] = asignado;
    resto -= asignado;
    vivos--;
  }
  return resultado;
}

/**
 * Detectar las tablas de una lista de líneas (la que la TUI ya sabe que es asistente):
 * una tabla es cabecera + separador + filas consecutivas que empiezan por `|`; una
 * línea vacía o de otro tipo la corta. Sin separador NO hay tabla — las barras de un
 * párrafo normal quedan literales. El resultado, uno por línea: qué celdas lleva, qué
 * anchos comparte toda la tabla (el máximo por columna, recortado con «…» al ancho
 * disponible) y si es la última del tramo (para pintar el cierre).
 */
export function contextoDeTabla(lineas: readonly string[], ancho = 80): (LineaDeTabla | null)[] {
  const resultado: (LineaDeTabla | null)[] = lineas.map(() => null);
  for (let i = 0; i < lineas.length; i++) {
    // Tabla empieza en una fila SEGUIDA de separador: sin ese par, barras literales.
    if (!esFilaDeTabla(lineas[i]!)) continue;
    if (i + 1 >= lineas.length || !esSeparadorDeTabla(lineas[i + 1]!)) continue;

    let fin = i;
    while (fin + 1 < lineas.length && esFilaDeTabla(lineas[fin + 1]!)) fin++;
    const tramo = lineas.slice(i, fin + 1);

    const filas = tramo.filter((l) => !esSeparadorDeTabla(l)).map(celdasDe);
    const columnas = Math.max(...filas.map((f) => f.length));
    let anchos: number[] = [];
    for (const f of filas)
      f.forEach((c, j) => {
        anchos[j] = Math.max(anchos[j] ?? 0, anchoDe(c));
      });
    // Lo que sobra para las celdas una vez descontados los bordes («│ » + « │» por
    // columna y las esquinas): el reparto — llenar o receder — lo hace `repartir`.
    anchos = repartir(anchos, ancho - 1 - 3 * columnas);

    tramo.forEach((l, j) => {
      const rol = j === 0 ? "cabecera" : esSeparadorDeTabla(l) ? "separador" : "fila";
      resultado[i + j] = {
        celdas: rol === "separador" ? [] : celdasDe(l).map((c, k) => celdaFija(c, anchos[k] ?? 0)),
        anchos,
        rol,
        esUltima: j === tramo.length - 1,
      };
    });
    i = fin;
  }
  return resultado;
}

/** El estado de bloque que sobrevive entre líneas: solo el cerco de código. */
export class RenderizadorDeMarkdown {
  private enCerco = false;

  constructor(private readonly tema: Tema) {}

  /**
   * Una línea (o un corte de párrafo) tal como llega del flujo, SIN su `\n`.
   *
   * `inicioDeLinea` dice si este trozo empieza línea de verdad: una continuación de
   * párrafo no puede ser cabecera ni viñeta, aunque empiece por «##» o «- ».
   *
   * **Sin color (pipe, CI), la línea sale tal cual**: no se quitan «##», ni «- » se
   * vuelve «•», ni el cerco desaparece. Despintar el markdown sin dar nada a cambio
   * es quitarle información a quien lee la salida.
   */
  linea(texto: string, inicioDeLinea = true): string {
    if (this.tema.negrita === "" && this.tema.mudo === "") return texto;
    if (texto.trimStart().startsWith("```")) {
      this.enCerco = !this.enCerco;
      return ""; // el cerco es ruido del formato: no se pinta
    }
    if (this.enCerco) return `${this.tema.mudo}${texto}${this.tema.reset}`;

    if (inicioDeLinea) {
      const cabecera = /^(#{1,3})\s+(.*)$/.exec(texto.trim());
      if (cabecera) return `${this.tema.negrita}${cabecera[2]}${this.tema.reset}`;

      const vineta = /^[-*]\s+(.*)$/.exec(texto.trim());
      if (vineta) return `• ${vineta[1]}`;
    }
    return renderizarInline(texto, this.tema);
  }
}

/** Un trozo de línea con su significado: la TUI lo pinta y la stdio lo colorea. */
export type EstiloDeSegmento = "normal" | "negrita" | "mudo" | "codigo" | "cursiva" | "enlace";
export interface Segmento {
  texto: string;
  estilo: EstiloDeSegmento;
}

/**
 * Parte una línea en segmentos inline — la MISMA gramática que `renderizarInline`
 * (`**negrita**`, `` `código` ``) más lo que la TUI maqueta y la stdio no: `*cursiva*`
 * y `[enlace](url)`, que se pide en DATOS y no en ANSI (un `<Text>` de Ink no puede
 * llevar códigos de escape dentro). El código y el enlace llevan estilo PROPIO
 * («codigo», «enlace»), que la TUI pinta en acento; la url del enlace va aparte, en
 * mudo y entre paréntesis — en TUI no hay clic, y despintar la url es quitarle
 * información a quien lee.
 */
export function segmentosDe(texto: string): Segmento[] {
  const segmentos: Segmento[] = [];
  // El orden importa: `**negrita**` antes que `*cursiva*`, y una cursiva necesita
  // contenido sin aire en los bordes para no despintar un «3 * 4».
  const re =
    /\*\*([^*\n]+)\*\*|`([^`\n]+)`|\*(\S(?:[^*\n]*\S)?)\*|\[([^\]\n]+)\]\(([^)\n]+)\)/g;
  let ultimo = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(texto)) !== null) {
    if (m.index > ultimo) segmentos.push({ texto: texto.slice(ultimo, m.index), estilo: "normal" });
    const [_, negrita, codigo, cursiva, enlace, url] = m;
    if (negrita !== undefined) segmentos.push({ texto: negrita, estilo: "negrita" });
    else if (codigo !== undefined) segmentos.push({ texto: codigo, estilo: "codigo" });
    else if (cursiva !== undefined) segmentos.push({ texto: cursiva, estilo: "cursiva" });
    else if (enlace !== undefined) {
      segmentos.push({ texto: enlace, estilo: "enlace" });
      segmentos.push({ texto: `(${url})`, estilo: "mudo" });
    }
    ultimo = m.index + m[0].length;
  }
  if (ultimo < texto.length) segmentos.push({ texto: texto.slice(ultimo), estilo: "normal" });
  return segmentos.length > 0 ? segmentos : [{ texto, estilo: "normal" }];
}
