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
 * cabeceras, viñetas y cercos ```. Lo que no empareja queda literal — inventarse un
 * cierre sería un bug mudo delante del usuario.
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
export type EstiloDeSegmento = "normal" | "negrita" | "mudo";
export interface Segmento {
  texto: string;
  estilo: EstiloDeSegmento;
}

/**
 * Parte una línea en segmentos `**negrita**` y `` `mudo` `` — la MISMA gramática que
 * `renderizarInline`, pero en datos y no en ANSI: la TUI no puede usar códigos de
 * escape dentro de un `<Text>` de Ink, así que pide significado y no color.
 */
export function segmentosDe(texto: string): Segmento[] {
  const segmentos: Segmento[] = [];
  const re = /\*\*([^*\n]+)\*\*|`([^`\n]+)`/g;
  let ultimo = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(texto)) !== null) {
    if (m.index > ultimo) segmentos.push({ texto: texto.slice(ultimo, m.index), estilo: "normal" });
    segmentos.push(
      m[1] !== undefined
        ? { texto: m[1]!, estilo: "negrita" }
        : { texto: m[2]!, estilo: "mudo" }
    );
    ultimo = m.index + m[0].length;
  }
  if (ultimo < texto.length) segmentos.push({ texto: texto.slice(ultimo), estilo: "normal" });
  return segmentos.length > 0 ? segmentos : [{ texto, estilo: "normal" }];
}