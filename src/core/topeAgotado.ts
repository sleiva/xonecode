/**
 * Lo que se le dice a quien delegó cuando a un especialista se le acabó el presupuesto.
 *
 * ## El fallo que cierra, medido el 19-09-2026
 *
 * Cada especialista corre con un tope de llamadas al modelo
 * (`TOPE_DE_LLAMADAS_DEL_ESPECIALISTA`, con `exitBehavior: "end"`). Al agotarse, la librería
 * añade un `AIMessage` con SU texto —«Model call limits exceeded: run level call limit reached
 * with 15 model calls»— y salta al final. Y el `task` de deepagents devuelve **solo el último
 * mensaje** (`extractLastMessage`).
 *
 * O sea que lo que el orquestador recibe como respuesta del especialista es esa frase, en
 * inglés y en jerga del harness, **y todo lo que el especialista averiguó en sus quince
 * llamadas se tira**. Medido: 100-160k de entrada por especialista, y menos de 900 tokens de
 * salida devueltos. Por eso el orquestador encadena al siguiente: no es que enrute mal, es que
 * no recibe nada con lo que seguir.
 *
 * **Por eso el tope es NUESTRO** (`topeDeLlamadas`) en vez de parchear el de la librería: sus
 * dos ganchos de salida —el mensaje y el reset del contador— van detrás de un `jumpTo: "end"`
 * que cortocircuita todo lo que haya debajo, así que **no corre NINGÚN middleware posterior**
 * (medido contra la librería real, con `FakeToolCallingModel` y `runLimit: 0`). No había dónde
 * engancharse: ni `afterAgent`, ni otro `beforeModel`. Reconocer su frase en inglés para
 * sustituirla habría atado esto a un texto suyo, y encima sin sitio donde hacerlo.
 *
 * Esto NO sube el tope —que está medido y argumentado— ni lo quita. Hace tres cosas:
 * devuelve el trabajo que se iba a tirar, lo marca como PARCIAL para que nadie lo lea como una
 * conclusión, y dice qué hacer a continuación. Que un presupuesto se agote es normal; que se
 * agote **en silencio** es el fallo.
 *
 * Puro y en `core/`: el texto se puede probar sin librería ni modelo. Quién lo mete en la
 * conversación es de `agent/`.
 */

/**
 * Cuánto del trabajo parcial se devuelve.
 *
 * Hay tope porque esto viaja como respuesta de una `task` y entra ENTERO en el contexto del
 * orquestador: devolver sin límite convertiría el arreglo de un gasto en otro gasto. Lo que no
 * cabe se dice, como en todas partes aquí.
 */
export const TOPE_DE_PARCIAL = 4_000;

export interface TopeAgotado {
  /** El tope que se agotó, para que el mensaje no se invente la cifra. */
  limite: number;
  /** Lo último SUSTANCIAL que dijo el especialista, si dijo algo. */
  parcial?: string;
}

/**
 * El mensaje que sustituye al de la librería.
 *
 * **Habla con voz del harness y en primera persona del especialista**, porque quien lo va a
 * leer es el orquestador y lo va a leer como la respuesta de aquél. Y dice las tres cosas que
 * la frase de la librería no dice: que está a medias, qué había, y qué NO hacer — volver a
 * encargarle lo mismo a otro es exactamente lo que se midió que pasa.
 */
export function mensajeDeTopeAgotado({ limite, parcial }: TopeAgotado): string {
  const hay = parcial !== undefined && parcial.trim() !== "";
  const recortado = hay && parcial.length > TOPE_DE_PARCIAL;
  return [
    `[harness] Me he quedado sin presupuesto: ${limite} llamadas al modelo, y NO he terminado.`,
    "",
    ...(hay
      ? [
          "Esto es lo último que tenía, y es PARCIAL — no es una conclusión:",
          "",
          recortado ? `${parcial.slice(0, TOPE_DE_PARCIAL)}…` : parcial,
          ...(recortado ? ["", `(recortado: había ${parcial.length} caracteres)`] : []),
        ]
      : ["No llegué a dejar nada en claro: se me fue el presupuesto antes."]),
    "",
    "NO se lo encargues igual a otro especialista: gastará su presupuesto en volver a averiguar",
    "lo mismo. O le pasas lo de arriba en el bloque `HANDOFF DE ANÁLISIS`, o parte el encargo en",
    "uno más pequeño.",
  ].join("\n");
}
