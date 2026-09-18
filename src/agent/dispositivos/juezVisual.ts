/**
 * El crítico VISUAL de una pantalla: mira una captura del aparato y dice qué se ve mal.
 *
 * Existe porque hay una clase de fallo que ninguna de las otras tres fuentes ve. Medido sobre
 * la Calculadora de AppDemo: `xone-simulator validate` en verde, `smoke --interact` con
 * `renderOk: true` y `jsErrors: 0`, el log del aparato sin un solo error… y la captura
 * enseñaba **todas las etiquetas cortadas por la mitad**. La aritmética era correcta —`75 + 3`
 * daba `78`— y la pantalla era ilegible. Eso no lo dice nadie más que una imagen.
 *
 * TRES REGLAS, y las tres salieron de medirlo tres veces contra el modelo real:
 *
 *  - **Lo que devuelve son OBSERVACIONES, no hallazgos, y la diferencia está MEDIDA.** Las tres
 *    primeras vueltas describieron el texto como «rotado 180°, boca abajo». No está rotado:
 *    está CORTADO por la mitad. Es un error sistemático, no ruido.
 *
 *    **Y pedirle en el prompt que no diagnostique NO lo arregla**: se probó —«describe lo que
 *    se ve, no la causa»— y las tres vueltas siguientes volvieron a decir «girado 180°». El
 *    modelo no está razonando de más: está PERCIBIENDO eso. La instrucción se queda porque no
 *    estorba y acota el resto, pero el remedio no puede estar ahí: quien enseñe estas
 *    observaciones tiene que decir que la REDACCIÓN no es fiable, aunque el sitio al que
 *    apuntan sí lo sea. En las seis vueltas acertó siempre QUÉ control estaba mal.
 *  - **NO es una huella, y por eso no puede frenar el bucle.** La MISMA captura, seis vueltas:
 *    4, 2, 4, 5, 3 y 5 observaciones, con redacción distinta cada vez. La
 *    guarda de «no progreso» de `turnoReal.ts#conVerificacion` se queda en los sensores
 *    deterministas; esto opina, como `juezDeTarea`.
 *  - **Fail-closed: lo que no se entiende NO es verde**, igual que el juez de tareas y que la
 *    aprobación humana. Y un ROJO sin nada que enseñar tampoco vale: nadie sabría qué mirar.
 *
 * Y que no se pueda preguntar es fallo del ENTORNO, no un veredicto: se LANZA. Un fallo de red
 * convertido en rojo culparía al trabajo del agente de un problema de la máquina.
 */
import type { Papel } from "../../core/ports.js";
import { objetoDe } from "../tareas/juezDeTarea.js";

/** El papel del juez, el mismo que el de tareas. `core/modelos.ts` lo reserva para esto. */
export const PAPEL_DEL_JUEZ_VISUAL: Papel = "afilado";

/**
 * Cuántas observaciones se conservan y cuánto ocupa cada una.
 *
 * Del mismo orden que las del juez de tareas, y por lo mismo: esto acaba en una tarjeta o en
 * un mensaje de reparación, no en un informe. No se acota para poder compararlo —no se puede,
 * ver la cabecera— sino para que quepa.
 */
export const TOPE_DE_OBSERVACIONES = 8;
const TOPE_DE_OBSERVACION = 200;

/** No se pudo PREGUNTAR: no hay modelo, no hay clave, no hay red. */
export class ErrorDelJuezVisual extends Error {
  constructor(motivo: string) {
    super(`no se pudo consultar al crítico visual (papel «${PAPEL_DEL_JUEZ_VISUAL}»): ${motivo}`);
    this.name = "ErrorDelJuezVisual";
  }
}

/** Una captura, ya en memoria. Nunca una ruta: por aquí no viaja el disco. */
export interface CapturaDePantalla {
  base64: string;
  mime: string;
}

export type InvocarVisual = (
  papel: Papel,
  prompt: string,
  imagen: CapturaDePantalla
) => Promise<string>;

export interface VeredictoVisual {
  veredicto: "verde" | "rojo" | "indeterminado";
  /**
   * Lo que SE VE, en palabras del modelo. No son hallazgos: no llevan fichero, no llevan
   * línea, y su explicación de la causa está medida como poco fiable.
   */
  observaciones: string[];
}

/**
 * Lo que se le pide, y está escrito para que conteste lo que puede saber.
 *
 * «No digas la causa» no es modestia: es lo único que separa una observación útil —«el texto
 * de los botones sale cortado»— de una pista falsa —«está rotado 180°»—, y lo segundo es lo
 * que contestó las tres veces que se midió.
 */
export const PROMPT_VISUAL = [
  "Eres un revisor VISUAL de la pantalla de una app móvil. Mira la captura y di SOLO lo que se",
  "ve mal, sin diagnosticar: describe lo que se ve, no la causa ni cómo arreglarlo. Quien lo",
  "lea tiene el código delante y tú no.",
  "",
  "Busca defectos OBJETIVOS: texto cortado, que se sale o ilegible; controles solapados o fuera",
  "de la pantalla; alineaciones rotas; huecos que no cuadran; algo que no se puede leer por",
  "contraste. NO opines de gustos, de la paleta ni de la marca.",
  "",
  "Si no ves ningún defecto, dilo con la lista vacía.",
  "",
  'Contesta SOLO este JSON: {"veredicto":"verde"|"rojo","hallazgos":["lo que se ve", …]}',
].join("\n");

export interface ContextoVisual {
  /** Qué pantalla se supone que es. Va en el prompt para que no adivine dónde está. */
  pantalla: string;
}

/**
 * Le enseña la captura al modelo y devuelve su veredicto.
 *
 * `invocar` entra por parámetro, así que `npm test` no le pregunta a ningún modelo — el mismo
 * molde que `JuezDeTareaPort`.
 */
export async function juzgarPantalla(
  imagen: CapturaDePantalla,
  contexto: ContextoVisual,
  invocar: InvocarVisual
): Promise<VeredictoVisual> {
  const prompt = `${PROMPT_VISUAL}\n\nLa captura es de la pantalla «${contexto.pantalla}».`;
  let texto: string;
  try {
    texto = await invocar(PAPEL_DEL_JUEZ_VISUAL, prompt, imagen);
  } catch (error) {
    throw new ErrorDelJuezVisual(error instanceof Error ? error.message : String(error));
  }

  const objeto = objetoDe(texto);
  if (objeto === undefined) return { veredicto: "indeterminado", observaciones: [] };

  const observaciones = (Array.isArray(objeto["hallazgos"]) ? objeto["hallazgos"] : [])
    .filter((o): o is string => typeof o === "string" && o.trim() !== "")
    .slice(0, TOPE_DE_OBSERVACIONES)
    .map((o) => (o.length > TOPE_DE_OBSERVACION ? `${o.slice(0, TOPE_DE_OBSERVACION - 1)}…` : o));

  const dicho = objeto["veredicto"];
  if (dicho === "verde") return { veredicto: "verde", observaciones };
  /**
   * Un rojo sin nada que enseñar no se puede actuar: quien lo reciba no sabe qué mirar. Es la
   * misma regla que «un verde sin resumen» del juez de tareas, por el otro lado.
   */
  if (dicho === "rojo" && observaciones.length > 0) return { veredicto: "rojo", observaciones };
  return { veredicto: "indeterminado", observaciones };
}

/**
 * El `invocar` de PRODUCCIÓN, sobre `ModelosPort`.
 *
 * La imagen viaja como un bloque `image_url` con un `data:` dentro de un `HumanMessage`, que
 * es la forma multimodal que entienden los tres proveedores a través de langchain. Se mide
 * aquí y no en el módulo puro porque esto toca el SDK.
 *
 * **La misma asimetría de `juezDeTarea#invocarConModelos`, y por la misma medida**: construir
 * el modelo falla antes de tocar la red y con un mensaje escrito para leerse, así que ése se
 * CONSERVA; de la llamada solo se conserva el NOMBRE del error, porque ahí los SDK devuelven
 * el cuerpo remoto y con él cabeceras y claves redactadas.
 */
export function invocarVisualConModelos(modelos: {
  paraPapel(papel: Papel): unknown;
}): InvocarVisual {
  return async (papel, prompt, imagen) => {
    let modelo: unknown;
    try {
      modelo = modelos.paraPapel(papel);
    } catch (error) {
      throw new ErrorDelJuezVisual(error instanceof Error ? error.message : String(error));
    }
    if (
      typeof modelo !== "object" ||
      modelo === null ||
      typeof (modelo as { invoke?: unknown }).invoke !== "function"
    ) {
      throw new ErrorDelJuezVisual(`el modelo del papel «${papel}» no se puede invocar aquí`);
    }
    const { HumanMessage } = await import("@langchain/core/messages");
    const { textoDe } = await import("../turno/puente.js");
    try {
      const respuesta = await (modelo as { invoke: (p: unknown) => Promise<unknown> }).invoke([
        new HumanMessage({
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: `data:${imagen.mime};base64,${imagen.base64}` } },
          ],
        }),
      ]);
      // El MISMO extractor que el puente del stream y que el juez de tareas: dos reglas para
      // sacar el texto de un mensaje son dos reglas que divergen.
      return textoDe(respuesta);
    } catch (error) {
      throw new ErrorDelJuezVisual(error instanceof Error ? error.name : "error de la llamada");
    }
  };
}
