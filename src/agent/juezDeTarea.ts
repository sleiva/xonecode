/**
 * El juez de QA de una tarea: ¿el trabajo hace lo que se pedía?
 *
 * Es la segunda de las dos piezas que ocupan el sitio del modal de aprobación desde que
 * una tarea aplica sus escrituras (§0 de `docs/superpowers/specs/2026-09-08-tareas-en-background-design.md`).
 * La primera es el verificador, que ya corre dentro del turno y establece HECHOS. Este
 * opina, y por eso **su veredicto no basta solo**: las condiciones las comprueba el código
 * (`core/entrega.ts`), porque a un modelo se le puede pedir que avise y a veces no avisa.
 *
 * Tres reglas y una medida:
 *  - **Entra por PUERTO** (`core/ports.ts#JuezDeTareaPort`) con un `invocar` inyectado, así
 *    que `npm test` no le pregunta a ningún modelo. La producción monta `invocarConModelos`.
 *  - **Usa el papel `afilado`**, que `core/modelos.ts` reserva al juez. Es el único sitio
 *    del repo que lo gasta.
 *  - **Lo que no se entiende NO es un verde**, que es la misma dirección de la aprobación
 *    humana: lo que no se entiende se rechaza. Una respuesta que no parsea, un veredicto
 *    que no es ninguno de los dos, o un verde sin resumen que poder leer, son
 *    `indeterminado`.
 *  - **Y que no se pueda usar es fallo del ENTORNO**, no un veredicto: se LANZA
 *    `ErrorDelJuezDeTarea` y quien llama aparca la tarea diciéndolo. Un fallo de red
 *    convertido en «rojo» culparía al trabajo del agente de un problema de la máquina; y
 *    convertido en «verde» entregaría sin haber preguntado.
 */
import type { CasoDeJuez, JuezDeTareaPort, ModelosPort, Papel } from "../core/ports.js";
import type { HallazgoDelTurno } from "../core/events.js";
import type { VeredictoDeTarea } from "../core/entrega.js";
import { textoDe } from "./puente.js";

/** El papel del juez, y solo del juez. Ver `core/modelos.ts`. */
export const PAPEL_DEL_JUEZ: Papel = "afilado";

/**
 * Cuánto resumen se guarda. De aquí sale el `motivo` de la tarea, que se pinta en una
 * tarjeta del kanban y viaja por el cable: 4 KB de prosa de un modelo llenan la columna
 * entera, y este número es del mismo orden que el de `servidorDeImplementacion`, que acota
 * a 60 el nombre que manda un servidor MCP. Aquí se admite más porque es una frase y no un
 * rótulo.
 */
export const TOPE_DE_RESUMEN = 400;

/** Cuántos hallazgos del juez se guardan, y cuánto cada uno. Por lo mismo de arriba. */
export const TOPE_DE_HALLAZGOS = 10;
const TOPE_DE_HALLAZGO = 200;

/**
 * No se pudo PREGUNTAR: no hay modelo, no hay clave, no hay red.
 *
 * Es fallo del entorno y no del proyecto, la misma familia que `ErrorDelSimulador`
 * (`agent/verificador.ts`), y por eso es un tipo propio: quien lo recoge tiene que poder
 * distinguirlo de un veredicto para aparcar la tarea con el motivo correcto.
 */
export class ErrorDelJuezDeTarea extends Error {
  constructor(motivo: string) {
    super(`no se pudo consultar al juez de QA (papel «${PAPEL_DEL_JUEZ}»): ${motivo}`);
    this.name = "ErrorDelJuezDeTarea";
  }
}

/** Cómo se le habla al modelo. Un papel y un prompt entran, su texto sale. */
/**
 * El tercer parámetro es la RAÍZ del proyecto de la tarea, y existe para que el papel
 * `afilado` se resuelva con la precedencia de siempre —proyecto sobre global—. En la consola
 * web nadie rellena `FuentesDeEleccion.proyecto`, así que sin esto un `config.json` de
 * proyecto que apuntara el juez a otro modelo se ignoraba en silencio: un ajuste escrito que
 * no hace nada, que en este repo es peor que no poder ponerlo.
 */
export type InvocarModelo = (papel: Papel, prompt: string, raiz: string) => Promise<string>;

/**
 * El `invocar` de PRODUCCIÓN, sobre `ModelosPort`.
 *
 * **Dos sitios de envoltura, y la diferencia entre ellos está medida.** Construir el modelo
 * del papel falla ANTES de tocar la red y con un mensaje escrito para leerse: medido contra
 * `agent/modelos.ts`, un `afilado` apuntado a un proveedor sin clave lanza «falta la
 * credencial para nvidia (NVIDIA_API_KEY); usa /provider nvidia» —el nuestro— o «Anthropic
 * API key not found» —el del SDK—, y ninguno de los dos lleva nada que no se pueda leer. Ese
 * mensaje SÍ se conserva: es la única línea que dice qué hacer.
 *
 * La LLAMADA es otra cosa: ahí los SDK devuelven el cuerpo remoto, y ahí van claves
 * redactadas y cabeceras («401 Incorrect API key provided: sk-…»). De esa solo se conserva
 * el NOMBRE del error, que es la misma regla que `ErrorCatalogoModelos`: «nunca lleva la
 * clave ni el cuerpo remoto». No es ser opaco, es no filtrar secretos.
 */
export function invocarConModelos(modelos: ModelosPort): InvocarModelo {
  return async (papel, prompt) => {
    let modelo: unknown;
    try {
      modelo = modelos.paraPapel(papel);
    } catch (error) {
      throw new ErrorDelJuezDeTarea(error instanceof Error ? error.message : String(error));
    }
    if (
      typeof modelo !== "object" ||
      modelo === null ||
      typeof (modelo as { invoke?: unknown }).invoke !== "function"
    ) {
      // Un doble de modelos (`ModeloGuionizado`) devuelve `{guion}` y no sabe invocar. No es
      // un veredicto: es que este proceso no tiene con qué preguntar.
      throw new ErrorDelJuezDeTarea(`el modelo del papel «${papel}» no se puede invocar aquí`);
    }
    try {
      const respuesta = await (modelo as { invoke: (p: unknown) => Promise<unknown> }).invoke(prompt);
      // El MISMO extractor que el puente del stream, no una copia: dos reglas para sacar el
      // texto de un mensaje son dos reglas que divergen — y una de ellas metería el
      // razonamiento del modelo dentro del JSON que hay que parsear.
      return textoDe(respuesta);
    } catch (error) {
      throw new ErrorDelJuezDeTarea(error instanceof Error ? error.name : "error de la llamada");
    }
  };
}

/** Un hallazgo del verificador, dicho en una línea. Fichero RELATIVO y línea, nunca contenido. */
const lineaDeHallazgo = (h: HallazgoDelTurno): string =>
  `- ${h.severidad === "error" ? "ERROR" : h.severidad} ${h.code}${
    h.fichero === undefined ? "" : ` en ${h.fichero}${h.linea === undefined ? "" : `:${h.linea}`}`
  }: ${h.mensaje}`;

/** Cómo se le cuenta al juez lo que hizo el verificador. `no-corrio` se DICE. */
const parrafoDelVerificador = (caso: CasoDeJuez): string[] => {
  if (caso.verificador === undefined) return [];
  if (caso.verificador === "no-corrio") {
    return [
      "El verificador de XOne (xone-simulator) NO HA CORRIDO en este turno, así que nadie ha",
      "medido si lo escrito es XML válido. Tenlo en cuenta: no lo des por bueno.",
    ];
  }
  const hallazgos = caso.hallazgos ?? [];
  return [
    `El verificador de XOne acabó en ${caso.verificador.toUpperCase()}.`,
    ...(hallazgos.length === 0 ? [] : ["Sus hallazgos sobre lo que este turno tocó:", ...hallazgos.map(lineaDeHallazgo)]),
  ];
};

/**
 * El prompt del juez.
 *
 * Lleva el encargo, los ficheros que se autorizó escribir y el veredicto del verificador
 * con sus hallazgos — y nada más. **Nunca el contenido de un fichero**: la pregunta es si
 * el trabajo hace lo que se pedía, y este módulo no abre ni un fichero (no hay un solo
 * `readFile` aquí). Lo que sí se le dice es que no se invente: es la misma cláusula que
 * lleva la petición de reparación, y por el mismo motivo.
 */
function promptDelJuez(caso: CasoDeJuez): string {
  return [
    "Eres el QA de un equipo que desarrolla aplicaciones XOne. Otro agente ha ejecutado un",
    "encargo de forma autónoma, sin que ninguna persona revisara sus escrituras. Tu trabajo",
    "es decidir si lo hecho responde al encargo, para que se pueda dar por terminado o vuelva",
    "a manos del desarrollador.",
    "",
    "EL ENCARGO ERA:",
    caso.encargo,
    "",
    caso.autorizadas.length === 0
      ? "NO se autorizó escribir ningún fichero en este turno."
      : `Ficheros que se autorizó escribir (${caso.autorizadas.length}):\n${caso.autorizadas
          .map((f) => `- ${f}`)
          .join("\n")}`,
    "",
    ...parrafoDelVerificador(caso),
    "",
    "No tienes el contenido de los ficheros, y no lo pidas: juzga con el encargo y con los",
    "hechos de arriba. Si con eso no se puede saber, dilo — no te inventes nada para poder",
    "dar un veredicto, que es justo el fallo que este paso existe para atrapar.",
    "",
    "Contesta SOLO con este JSON y nada más:",
    '{"veredicto":"verde"|"rojo","resumen":"una o dos frases","hallazgos":["lo que falta, uno por entrada"]}',
    "«verde» = el encargo está cubierto. «rojo» = falta algo, o lo hecho no es lo que se pedía.",
  ].join("\n");
}

/**
 * Sin saltos de línea, sin caracteres de control y acotado. Ver `TOPE_DE_RESUMEN`.
 *
 * Los controles se van y no se escapan, por el mismo motivo que en
 * `servidorDeImplementacion`: «un salto de línea en un nombre parte la línea de un log y
 * disfraza lo que venga detrás», y este texto acaba en el `motivo` de la tarea, que se
 * pinta en una tarjeta y viaja por el cable.
 */
const unaFrase = (texto: string, tope: number): string =>
  texto
    .replace(/[\u0000-\u001F\u007F]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, tope);

/**
 * El JSON de la respuesta, tolerando la valla de código.
 *
 * Los modelos contestan «Aquí va: ```json … ```» aunque se les pida solo el JSON, así que
 * se busca el primer `{` y el último `}`. Lo que no parsee no es un error: es un veredicto
 * `indeterminado`, que no es verde.
 */
function objetoDe(texto: string): Record<string, unknown> | undefined {
  const desde = texto.indexOf("{");
  const hasta = texto.lastIndexOf("}");
  if (desde === -1 || hasta <= desde) return undefined;
  try {
    const valor: unknown = JSON.parse(texto.slice(desde, hasta + 1));
    return typeof valor === "object" && valor !== null ? (valor as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

/** El veredicto tal como se guarda, o `indeterminado` diciendo por qué. */
export function veredictoDeTexto(texto: string): VeredictoDeTarea {
  const objeto = objetoDe(texto);
  if (objeto === undefined) {
    return { veredicto: "indeterminado", resumen: "el juez no contestó con el JSON que se le pidió" };
  }
  const dicho = objeto.veredicto;
  if (dicho !== "verde" && dicho !== "rojo") {
    return {
      veredicto: "indeterminado",
      resumen: `el juez contestó un veredicto que no es ninguno de los dos: «${unaFrase(String(dicho), 40)}»`,
    };
  }
  const resumen = typeof objeto.resumen === "string" ? unaFrase(objeto.resumen, TOPE_DE_RESUMEN) : "";
  if (resumen === "") {
    // Un veredicto sin resumen no se puede leer, y de esto sale la tarjeta que alguien
    // mira: fail-closed, como todo lo demás por aquí.
    return { veredicto: "indeterminado", resumen: `el juez dijo «${dicho}» y no explicó por qué` };
  }
  const hallazgos = Array.isArray(objeto.hallazgos)
    ? objeto.hallazgos
        .filter((h): h is string => typeof h === "string")
        .map((h) => unaFrase(h, TOPE_DE_HALLAZGO))
        .filter((h) => h !== "")
        .slice(0, TOPE_DE_HALLAZGOS)
    : [];
  // Ausente y vacío: sin hallazgos el campo NO se pone, para que `[]` siga pudiendo
  // significar «los miró y no encontró ninguno» el día que alguien lo distinga.
  return { veredicto: dicho, resumen, ...(hallazgos.length === 0 ? {} : { hallazgos }) };
}

export function crearJuezDeTarea(opciones: { invocar: InvocarModelo }): JuezDeTareaPort {
  return {
    juzgar: async (caso) => {
      let texto: string;
      try {
        texto = await opciones.invocar(PAPEL_DEL_JUEZ, promptDelJuez(caso), caso.raiz);
      } catch (error) {
        // Lo que ya viene envuelto se deja: `invocarConModelos` distingue el fallo de
        // CONSTRUIR (cuyo mensaje es el accionable) del de LLAMAR (cuyo cuerpo no se
        // repite). Cualquier otro `invocar` puede lanzar lo que sea, y entonces solo se
        // conserva el nombre del error — la regla de `ErrorCatalogoModelos`.
        if (error instanceof ErrorDelJuezDeTarea) throw error;
        throw new ErrorDelJuezDeTarea(error instanceof Error ? error.name : "error al preguntar");
      }
      return veredictoDeTexto(texto);
    },
  };
}
