/**
 * De las medidas de una MAQUETA (px CSS) a la `p` de XOne, con la cuenta de la skill
 * (`references/css/de-una-maqueta-a-xone.md`, «medido»): `p = px × resolution-width / ancho_de_la_maqueta`.
 *
 * ## Por qué una cuenta en código y no una regla en el prompt
 *
 * Medido en una tarea de Maset (rediseño desde una maqueta de Stitch): el agente copió los px de la maqueta TAL CUAL
 * como `p` —`width="24p"` para un icono de 24 px— y los iconos salieron unas 2,6 veces más pequeños; la regla estaba
 * en la skill y no la aplicó. Aquí los dos datos que la cuenta necesita NO los pone el modelo: el `resolution-width`
 * sale del `app.xml` del proyecto y el ancho de la maqueta, de su imagen (o lo dice él, si la imagen no lo deja claro).
 *
 * ## Lo que no se adivina
 *
 * - Un `app.xml` sin `resolution-width`, o con `-1` (visto en un proyecto real, sin documentar en la skill), no se
 *   convierte: se dice.
 * - Una imagen de maqueta puede venir a 1× (Stitch: 390 o 427 de ancho) o a 2×/3× (780): solo un ancho de pantalla
 *   de móvil en px CSS (`ANCHO_DE_MAQUETA_MINIMO`…`ANCHO_DE_MAQUETA_MAXIMO`) se toma por bueno; otro se dice con sus
 *   divisiones y se pide.
 */

export const NOMBRE_CONVERTIR_A_P = "convertir_a_p";

/** El ancho de una pantalla de móvil en px CSS: fuera de aquí, la imagen va a otra escala (o no es de un móvil). */
export const ANCHO_DE_MAQUETA_MINIMO = 320;
export const ANCHO_DE_MAQUETA_MAXIMO = 480;

/** Cuántas medidas por llamada: una pantalla entera cabe de sobra. */
export const TOPE_DE_MEDIDAS = 60;

export interface Resolucion {
  ancho: number;
  /** Ausente si el `app.xml` no lo declara (o es -1): la cuenta del ancho no lo necesita. */
  alto?: number;
}

/** El `resolution-width`/`resolution-height` del nodo `<app>` de un `app.xml`, o por qué no se puede usar. */
export function resolucionDeAppXml(texto: string): Resolucion | { motivo: string } {
  const app = /<app\b[^>]*>/i.exec(texto)?.[0];
  if (app === undefined) return { motivo: "el app.xml no tiene un nodo <app>" };
  const atributo = (nombre: string): string | undefined => new RegExp(`\\s${nombre}\\s*=\\s*["']([^"']*)["']`, "i").exec(app)?.[1]?.trim();
  const ancho = atributo("resolution-width");
  if (ancho === undefined) return { motivo: "el app.xml no declara resolution-width" };
  const n = Number(ancho);
  if (!Number.isInteger(n) || n <= 0) {
    return { motivo: `el app.xml declara resolution-width="${ancho}", que no es un ancho en píxeles: la skill no documenta cómo escala la p con ese valor` };
  }
  const alto = Number(atributo("resolution-height"));
  return Number.isInteger(alto) && alto > 0 ? { ancho: n, alto } : { ancho: n };
}

/** ¿Vale el ancho de esta imagen como ancho de la maqueta en px CSS? Si no, por qué, con sus divisiones a 2× y 3×. */
export function anchoDeMaquetaDeImagen(ancho: number, donde: string): { ancho: number } | { motivo: string } {
  if (ancho >= ANCHO_DE_MAQUETA_MINIMO && ancho <= ANCHO_DE_MAQUETA_MAXIMO) return { ancho };
  const escalas = [2, 3]
    .map((e) => ({ e, a: Math.round(ancho / e) }))
    .filter(({ a }) => a >= ANCHO_DE_MAQUETA_MINIMO && a <= ANCHO_DE_MAQUETA_MAXIMO)
    .map(({ e, a }) => `${a} si está a ${e}×`);
  return {
    motivo:
      `la maqueta ${donde} mide ${ancho} px de ancho, que no es el de una pantalla de móvil en px CSS ` +
      `(${ANCHO_DE_MAQUETA_MINIMO}–${ANCHO_DE_MAQUETA_MAXIMO})` +
      (escalas.length > 0 ? `: probablemente está a otra escala (${escalas.join(", ")})` : "") +
      ". Mira el ancho del viewport en su code.html y pásalo en ancho_maqueta",
  };
}

/** La cuenta. Redondeada a la `p` entera: XOne no usa decimales en una medida. */
export function pDeMaqueta(px: number, resolucionAncho: number, anchoMaqueta: number): number {
  return Math.round((px * resolucionAncho) / anchoMaqueta);
}

export interface MedidaDeMaqueta {
  nombre: string;
  px: number;
}

/** Qué no vale de una lista de medidas, o `undefined`. */
export function motivoDeMedidasInaceptables(medidas: readonly MedidaDeMaqueta[]): string | undefined {
  if (medidas.length === 0) return "no hay ninguna medida que convertir";
  if (medidas.length > TOPE_DE_MEDIDAS) return `demasiadas medidas en una llamada (máximo ${TOPE_DE_MEDIDAS})`;
  const mala = medidas.find((m) => !Number.isFinite(m.px) || m.px < 0);
  return mala === undefined ? undefined : `la medida «${mala.nombre}» tiene que ser un número de px no negativo`;
}

/** El informe de la tool: la tabla, la cuenta con sus dos datos y de dónde salió cada uno, y lo que NO convierte. */
export function informeDeConversion(opciones: {
  medidas: readonly MedidaDeMaqueta[];
  resolucion: Resolucion;
  anchoMaqueta: number;
  /** De dónde salió el ancho de la maqueta: «lo indicaste tú» o la ruta de la imagen. */
  origenDelAncho: string;
}): string {
  const { medidas, resolucion, anchoMaqueta } = opciones;
  const filas = medidas.map((m) => `| ${m.nombre} | ${m.px} px | ${pDeMaqueta(m.px, resolucion.ancho, anchoMaqueta)}p |`);
  return [
    `Cuenta: p = px × ${resolucion.ancho} (resolution-width del app.xml) / ${anchoMaqueta} (ancho de la maqueta, ${opciones.origenDelAncho}).`,
    "",
    "| medida | maqueta | XOne |",
    "|---|---|---|",
    ...filas,
    "",
    "Escribe estos valores, no los px de la maqueta. Vale para anchos, altos, márgenes y paddings en p; un alto en p escala con " +
      "el ALTO útil del aparato, así que en un teléfono alargado sale algo más alto que en la maqueta. NO vale para " +
      "border-corner-radius (va en píxeles del aparato) ni para fontsize (la letra es px − 8): mira la referencia " +
      "css/de-una-maqueta-a-xone.md de la skill para esos dos.",
  ].join("\n");
}
