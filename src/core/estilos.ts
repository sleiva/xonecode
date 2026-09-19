/**
 * Qué estilo le toca de verdad a un control, y de dónde sale.
 *
 * ## La medida que lo motiva
 *
 * Diez pasadas reales del mismo encargo visual («el título sale cortado»), 19-09-2026. En OCHO
 * de ellas `xone_navegacion` es la PRIMERA tool del turno —el modelo sí empieza por donde se le
 * dice— y luego deja de servirle: la usa una o dos veces y el resto del turno son **20-46
 * lecturas y 30-42 `grep`**, de los cuales ~22 de cada 30 son **la misma clase con variantes**
 * (`xnTituloHeaderC`, `.xnTituloHeader`, `xnHeader`, `xnLightTitle`, `font42`…). Más cinco
 * ficheros CSS, varios `.xne` AJENOS buscando ejemplos, y nueve documentos de skill.
 *
 * El índice actual contesta sobre el MODELO `.xne` —colecciones, campos, referencias— y el
 * trabajo de un arreglo visual vive en la capa de ESTILOS, que no tenía índice. Esto lo cierra.
 *
 * ## Lo que NO se rederiva
 *
 * La cascada de XOne la resuelve `xone-linter`, no este módulo: `Stylesheet.lookup` está
 * anotado como fiel a `FindStylesheetByClassName` (`CXoneApplication.mm:6146-6166`), con la
 * sutileza de que **un fichero posterior que redirige por `extends` gana al atributo DIRECTO de
 * uno anterior** —resolución intercalada por fichero, no dos pasadas globales—, y
 * `selectorsFor` implementa el orden de prioridad (`prop.clase:tipo` → `prop.clase` →
 * `.clase` → `prop:tipo` → `prop`) con sus dos banderas. Reescribir eso aquí sería un segundo
 * sitio donde decidir lo mismo, que es justo el argumento por el que `xone_navegacion` usa la
 * librería en vez de reimplementar `CrossReferenceRule`.
 *
 * Aquí vive lo que se ENSEÑA y con qué topes. Puro: sin disco y sin librería.
 */

/** Un atributo que acaba aplicándose, y por dónde llegó. */
export interface AtributoEfectivo {
  atributo: string;
  valor: string;
  /** El selector que lo aportó, o la marca de que viene del XML. */
  de: string;
}

export interface EstiloDeProp {
  coll: string;
  prop: string;
  tipo?: string;
  /** El `class=` del prop, tal cual. Ausente si no tiene. */
  clase?: string;
  /** Selectores candidatos, de MÁS a MENOS prioridad. */
  selectores: readonly string[];
  /** Lo que la hoja aporta, ya resuelto. */
  deLaHoja: readonly AtributoEfectivo[];
  /** Lo que el XML del prop pone a mano. **Gana siempre** sobre la hoja. */
  delXml: readonly AtributoEfectivo[];
  /** Qué fichero declara cada selector que aporta algo. */
  declaradoEn: readonly { selector: string; fichero: string }[];
}

/**
 * Topes de lo que se enseña.
 *
 * Existen porque esto viaja al contexto del modelo entero y una hoja grande tiene decenas de
 * atributos por selector. **Lo que no cabe se CUENTA**, como en todas partes aquí: una lista
 * recortada en silencio se lee como la lista entera, y sobre eso se concluye de más.
 */
export const LIMITES_ESTILOS = { atributos: 30, selectores: 12, declaraciones: 12 } as const;

/** La marca de que un valor no viene de la hoja sino del XML del propio control. */
export const DEL_XML = "el XML del prop (gana a la hoja)";

function recortar<T>(lista: readonly T[], tope: number, pinta: (x: T) => string): string[] {
  const cabe = lista.slice(0, tope).map(pinta);
  const fuera = lista.length - cabe.length;
  return fuera > 0 ? [...cabe, `  … y ${fuera} más`] : cabe;
}

/**
 * La respuesta, en el formato que el turno necesitaba.
 *
 * Las cuatro preguntas que los greps estaban haciendo a mano —qué se aplica, de qué selector,
 * qué selectores compiten y en qué fichero están— en una sola llamada. El orden no es
 * cosmético: primero lo que se aplica, que es lo que se preguntó; los selectores y los ficheros
 * van después, porque son el CAMINO y solo hacen falta si hay que cambiar algo.
 */
export function pintarEstiloDeProp(e: EstiloDeProp): string {
  const cabecera =
    `${e.coll}.${e.prop}` +
    (e.tipo === undefined ? "" : `  type=${e.tipo}`) +
    (e.clase === undefined ? "" : `  class="${e.clase}"`);

  const nada = e.deLaHoja.length === 0 && e.delXml.length === 0;
  return [
    cabecera,
    "",
    "LO QUE ACABA APLICÁNDOSE",
    ...(nada
      ? ["  (nada: ni la hoja ni el XML le ponen ningún atributo)"]
      : recortar(
          [...e.delXml, ...e.deLaHoja],
          LIMITES_ESTILOS.atributos,
          (a) => `  ${a.atributo.padEnd(18)} ${a.valor.padEnd(14)} ← ${a.de}`
        )),
    "",
    "SELECTORES QUE APLICAN, de más a menos prioridad",
    ...(e.selectores.length === 0
      ? ["  (ninguno: el prop no tiene clase y la hoja no declara reglas de tipo)"]
      : recortar(e.selectores, LIMITES_ESTILOS.selectores, (s) => `  ${s}`)),
    ...(e.declaradoEn.length === 0
      ? []
      : [
          "",
          "DÓNDE SE DECLARAN",
          ...recortar(
            e.declaradoEn,
            LIMITES_ESTILOS.declaraciones,
            (d) => `  ${d.selector.padEnd(28)} ${d.fichero}`
          ),
        ]),
  ].join("\n");
}
