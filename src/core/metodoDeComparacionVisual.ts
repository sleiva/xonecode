/**
 * **El MÉTODO para comparar una captura con su maqueta**, el mismo para el crítico visual (`juezVisual.ts`) y para un
 * desarrollador en Claude Code que compara él mismo (`agentes.ts#textoDeTrabajoSinLlamar`): dos que comparan distinto
 * dan dos veredictos que no se pueden contrastar.
 *
 * Existe por una medida en Maset (MAS-3): con un prompt que pedía comparar «forma, tamaños, color, colocación» en
 * general, DeepSeek flash vio la mitad de lo evidente; con este recorrido —inventario de la maqueta elemento a elemento,
 * y cada uno comparado en un orden fijo— vio además las flechas desalineadas y las tarjetas más altas. Lo que le falta a
 * un modelo no es la vista: es un recorrido que no le deje resumir.
 */
export const METODO_DE_COMPARACION_VISUAL = [
  "Hazlo con este método, sin saltarte pasos:",
  "1. INVENTARIO. Recorre la MAQUETA de arriba abajo y apunta cada elemento visible: la cabecera y el logo, las franjas,",
  "   los títulos, cada tarjeta o fila y, DENTRO de cada una, cada pieza por separado (icono, título, subtítulo, número o",
  "   contador, su etiqueta, píldora, flecha), los botones y el pie. No resumas: una tarjeta con cinco piezas son cinco",
  "   elementos.",
  "2. COMPARACIÓN. Para CADA elemento del inventario, búscalo en la CAPTURA y compáralo en este orden:",
  "   - ¿Está? Si falta entero, o falta una parte (un número, una píldora, un icono), es una diferencia.",
  "   - TEXTO: ¿dice lo mismo?",
  "   - POSICIÓN dentro de su tarjeta o fila: más arriba o más abajo, a la izquierda o a la derecha, junto a qué va. Y si",
  "     en la maqueta está ALINEADO con sus iguales de las otras filas (por ejemplo todas las flechas en la misma",
  "     vertical), ¿lo sigue estando?",
  "   - TAMAÑO, frente a la pantalla y frente a sus vecinos: más grande o más pequeño, más alto, más compacto o con más aire.",
  "   - FORMA: esquinas, bordes, SOMBRAS, si es píldora o rectángulo, la separación entre un icono y su texto.",
  "   - COLOR y LETRA: color, grosor, tamaño de la letra y espacio entre letras.",
  "3. SOBRANTES. Recorre después la CAPTURA y di lo que está en ella y NO en la maqueta.",
  "",
  "Los números de la maqueta (un 12, un 0…) pueden ser datos de ejemplo y su valor no importa; pero que su SITIO esté",
  "vacío, o que en su lugar haya otra cosa, sí es una diferencia. Ignora la barra de estado del teléfono (hora, batería).",
].join("\n");

/** Cuántas pasadas del modelo por crítica con maqueta: una sola variaba mucho (medido: de 4 a 8 diferencias). */
export const PASADAS_DE_COMPARACION = 2;

/** Lo que dos observaciones tienen que compartir para ser la MISMA dicha con otras palabras. */
export const PARECIDO_PARA_REPETIDA = 0.5;

const sinTildes = (texto: string): string => texto.normalize("NFKD").replace(/[̀-ͯ]/g, "");
const palabrasDe = (texto: string): Set<string> => new Set(sinTildes(texto.toLowerCase()).match(/[a-z0-9]{4,}/g) ?? []);
/** Los controles que nombra: palabras en MAYÚSCULAS de cuatro letras o más (ENTREGAS, SALIR). */
const controlesDe = (texto: string): Set<string> => new Set(sinTildes(texto).match(/\b[A-Z][A-Z0-9]{3,}\b/g) ?? []);
/** Lo que cita entre comillas angulares («12», «pend.»). */
const citasDe = (texto: string): Set<string> => new Set([...texto.matchAll(/«([^»]+)»/g)].map((m) => m[1]!.trim().toLowerCase()));
const comunes = (a: Set<string>, b: Set<string>): number => [...a].filter((x) => b.has(x)).length;

interface Observacion {
  texto: string;
  palabras: Set<string>;
  controles: Set<string>;
  citas: Set<string>;
}

/**
 * ¿Es la MISMA observación dicha con otras palabras? Por dos caminos: comparten al menos `PARECIDO_PARA_REPETIDA` de sus
 * palabras (de cuatro letras o más, sin tildes, sobre la más corta), o nombran el mismo control y citan al menos DOS
 * mismos textos («ENTREGAS» con «12» y «pend.»). Medido con dos pasadas reales de Maset: con solo lo primero se colaba
 * «falta el número «12» encima de «pend.»» frente a «falta el contador «12» sobre la etiqueta «pend.»».
 */
function repetidas(a: Observacion, b: Observacion): boolean {
  const menor = Math.min(a.palabras.size, b.palabras.size);
  if (menor === 0) return a.texto.trim() === b.texto.trim();
  if (comunes(a.palabras, b.palabras) / menor >= PARECIDO_PARA_REPETIDA) return true;
  return comunes(a.controles, b.controles) >= 1 && comunes(a.citas, b.citas) >= 2;
}

/**
 * Las observaciones de varias pasadas, sin las repetidas (`repetidas`): dos pasadas del mismo modelo cuentan lo mismo
 * con otras palabras. Puro y en orden: primero las de la primera pasada.
 */
export function unirObservaciones(...listas: readonly (readonly string[])[]): string[] {
  const salida: Observacion[] = [];
  for (const lista of listas) {
    for (const texto of lista) {
      const o = { texto, palabras: palabrasDe(texto), controles: controlesDe(texto), citas: citasDe(texto) };
      if (!salida.some((ya) => repetidas(ya, o))) salida.push(o);
    }
  }
  return salida.map((o) => o.texto);
}
