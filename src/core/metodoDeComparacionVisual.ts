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
  "1. INVENTARIO. Recorre la MAQUETA de arriba abajo, por zonas —barra superior (título, botones), cabecera o franja,",
  "   bloques o tarjetas de resumen, la lista o el formulario, botones y pie— y apunta cada elemento visible: el logo,",
  "   los títulos, cada tarjeta o fila y, DENTRO de cada una, cada pieza por separado (icono, título, subtítulo, número o",
  "   contador, su etiqueta, píldora, flecha). No resumas: una tarjeta con cinco piezas son cinco elementos. De una lista,",
  "   mira UNA fila con lupa y luego si las demás son iguales.",
  "2. COMPARACIÓN. Para CADA elemento del inventario, búscalo en la CAPTURA y compáralo en este orden:",
  "   - ¿Está? Si falta entero, o falta una parte (un número, una píldora, un icono), es una diferencia.",
  "   - TEXTO: ¿dice lo mismo?",
  "   - POSICIÓN dentro de su tarjeta o fila: más arriba o más abajo, a la izquierda o a la derecha, junto a qué va. Y si",
  "     en la maqueta está ALINEADO con sus iguales de las otras filas (por ejemplo todas las flechas en la misma",
  "     vertical), ¿lo sigue estando?",
  "   - TAMAÑO, frente a la pantalla y frente a sus vecinos: más grande o más pequeño, más alto, más compacto o con más aire.",
  "   - FORMA: esquinas, bordes, SOMBRAS, si es píldora o rectángulo, la separación entre un icono y su texto.",
  "   - COLOR y LETRA: color, grosor, tamaño de la letra y espacio entre letras.",
  // Medido en Maset (liquidaciones): la app pintaba un recuadro oscuro alrededor de cada fila de la lista —el borde de
  // celda por omisión de XOne— y no lo vio ninguna crítica; pidiéndolo a propósito, el mismo modelo lo vio tres de tres.
  "3. SOBRANTES. Recorre después la CAPTURA y di lo que está en ella y NO en la maqueta. Busca a propósito lo que más se",
  "   escapa: líneas, recuadros, bordes, marcos, separadores, sombras, fondos o cajas que la maqueta no tiene. Mira el",
  "   contorno de cada tarjeta y de cada fila, el hueco entre filas y lo que rodea cada valor. Antes de decir que un borde",
  "   SOBRA, mira el MISMO elemento en la maqueta con lupa: si allí tiene contorno, aunque sea tenue, no sobra.",
  "",
  // Medido en Maset (login): la crítica pedía la versión «5.0.6.1dev» de la maqueta donde la app pinta la real, y los
  // puntos de una contraseña en un campo que la app abre vacío. Los VALORES son de muestra; su sitio y su estilo, no.
  "Los VALORES de la maqueta son datos de ejemplo: números (un 12, un 0…), versiones, fechas, nombres, códigos y lo que",
  "haya escrito en un campo, también los puntos de una contraseña. Que el valor sea OTRO no es una diferencia y no lo",
  "digas, ni que un campo de entrada esté vacío; de un valor compara solo su estilo (color, letra, tamaño).",
  // Medido en Maset (liquidaciones): «en la captura hay 5 filas y en la maqueta 3, y la fila con «1 albarán» usa el singular».
  "Tampoco CUÁNTAS filas tiene una lista (la maqueta pinta unas pocas de muestra y la app, las reales), ni un singular",
  "o un plural que cambia con ese valor: de una lista se compara cómo es UNA fila y cómo se colocan.",
  "Pero que su SITIO esté vacío, o que en su lugar haya otra cosa, sí es una diferencia. Ignora las barras del teléfono (la de estado, con hora y batería, y la de navegación),",
  // Medido en Maset (Entradas/Salidas): «junto a Volver no aparece el 09:41 de la maqueta», y era el reloj de la barra
  // que Stitch dibuja arriba de cada maqueta.
  "también la que la MAQUETA dibuja arriba: su hora («09:41») no es un dato de la pantalla y no falta.",
  "",
  // Medido el 21-10-2026: las 31 críticas con maqueta del workspace eran rojas, porque cualquier diferencia pesaba igual.
  // La frontera es SUYA, y el color de lo importante también: «una etiqueta con otro color y que sea un elemento
  // importante es una diferencia».
  "4. CLASIFICA cada diferencia en DISEÑO o DETALLE.",
  // Validado contra el ojo con cinco pantallas de Maset: el modelo llamaba diseño a «más redondeada», «borde en vez de
  // sombra» o «otra tipografía», y daba rojo a pantallas que respetaban el diseño. La FORMA es de categoría; el grado, no.
  "   - DISEÑO es lo que cambia cómo se ve la pantalla a primera vista: falta o sobra una pieza; un BORDE, recuadro,",
  "     marco o caja que la maqueta no tiene (alrededor de una fila, de un valor, de un bloque que allí va sin él); otra FORMA de",
  "     categoría (esquinas rectas donde la maqueta las redondea o al revés, un elemento PLANO —sin sombra ni borde—",
  "     donde la maqueta tiene una tarjeta, una píldora donde hay un rectángulo); otro color de un texto IMPORTANTE",
  "     (un título, el importe principal, el texto de un botón, una cabecera), de un fondo o de un botón; otra",
  "     DISPOSICIÓN (algo en otro sitio o en otro orden).",
  "   - DETALLE es el GRADO de lo que ya está: un radio algo mayor o menor, una sombra cambiada por un borde fino en la MISMA tarjeta, unos",
  "     píxeles de tamaño, de alto, de margen o de separación, un TONO más claro u oscuro del mismo color (un rojo más",
  "     apagado donde la maqueta pone rojo; gris donde pone rojo sí es otro color), otra tipografía o grosor, el espacio entre letras, un",
  "     icono macizo donde la maqueta lo dibuja de contorno, un texto en una línea donde la maqueta lo parte en dos, y la",
  "     letra o el color de un texto secundario (una etiqueta pequeña, un valor del pie).",
  "   - Lo que viene de los DATOS no es ni lo uno ni lo otro: no lo digas.",
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

/** Palabras que salen en cualquier observación y no dicen DE QUÉ habla. */
const VACIAS = new Set(
  "maqueta captura pantalla tiene tienen como esta estan donde mientras sobre entre mucho poco algo cada todo todos todas otra otro otras otros mismo misma aparece aparecen queda quedan pero hacia tambien".split(" ")
);
const significativas = (texto: string): Set<string> => new Set([...palabrasDe(texto)].filter((p) => !VACIAS.has(p)));

/** Lo que dos observaciones de PASADAS DISTINTAS tienen que compartir para hablar de lo mismo, con otras palabras. */
export const PARECIDO_PARA_CONFIRMAR = 0.34;

/**
 * ¿Hablan de LO MISMO dos observaciones de pasadas distintas? Más laxo que `repetidas`, a propósito: cada mirada cuenta la
 * misma diferencia con sus palabras («filas sin esquinas redondeadas ni sombra» / «tarjetas planas, sin sombra»), y un
 * emparejado estricto bajaría a detalle una diferencia real. Basta una cita «» o un control en común, o una parte de las
 * palabras que dicen de qué habla (`VACIAS` fuera).
 */
function hablanDeLoMismo(a: string, b: string): boolean {
  const oa = { texto: a, palabras: palabrasDe(a), controles: controlesDe(a), citas: citasDe(a) };
  const ob = { texto: b, palabras: palabrasDe(b), controles: controlesDe(b), citas: citasDe(b) };
  if (repetidas(oa, ob) || comunes(oa.citas, ob.citas) >= 1 || comunes(oa.controles, ob.controles) >= 1) return true;
  const sa = significativas(a);
  const sb = significativas(b);
  const menor = Math.min(sa.size, sb.size);
  return menor > 0 && comunes(sa, sb) / menor >= PARECIDO_PARA_CONFIRMAR;
}

/**
 * **Las diferencias de DISEÑO que vieron TODAS las pasadas**, y las que no (`sueltas`). Una diferencia de diseño solo pone
 * el rojo si la ven las dos miradas: lo que sale en una sí y en otra no —o se contradice— es ruido, y baja a detalle. Con
 * una sola pasada legible no hay con qué contrastar y vale lo que dijo. Puro.
 */
export function confirmadas(listas: readonly (readonly string[])[]): { confirmadas: string[]; sueltas: string[] } {
  if (listas.length <= 1) return { confirmadas: [...(listas[0] ?? [])], sueltas: [] };
  const [primera, ...resto] = listas as [readonly string[], ...(readonly string[])[]];
  const vistas = primera.filter((o) => resto.every((l) => l.some((x) => hablanDeLoMismo(o, x))));
  const sueltas = unirObservaciones(
    primera.filter((o) => !vistas.includes(o)),
    ...resto.map((l) => l.filter((x) => !vistas.some((c) => hablanDeLoMismo(c, x))))
  );
  return { confirmadas: unirObservaciones(vistas), sueltas };
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
