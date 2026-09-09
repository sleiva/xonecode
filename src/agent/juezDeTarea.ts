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

/**
 * Un hallazgo del verificador, dicho en una línea. Fichero RELATIVO y línea, nunca contenido.
 *
 * **La severidad se dice en castellano y por su nombre**, y no era cosmético: `h.severidad`
 * se pintaba en crudo, así que un aviso llegaba como «warning» —el enum, en inglés, al lado
 * de un «ERROR» que sí estaba traducido y en mayúsculas—. La huella de reparación del
 * verificador (`agent/turnoReal.ts`) usa solo los ERRORES porque «un aviso que va y viene no
 * dice nada de si el error se arregla», y la puerta de entrega (`core/entrega.ts`) cuenta
 * solo errores: si esa distinción manda en el código, no puede llegarle borrosa al juez.
 *
 * **Y un hallazgo SIN fichero se dice sin fichero.** Es el caso que produjo el rojo falso
 * medido: el reparto admite del lado del turno los hallazgos que no dicen dónde —el lado
 * conservador—, así que callarlo los dejaba pareciendo hallazgos sobre un fichero escrito.
 */
const lineaDeHallazgo = (h: HallazgoDelTurno): string =>
  `- ${h.severidad === "error" ? "ERROR" : h.severidad === "warning" ? "AVISO" : "INFO"} ${h.code}${
    h.fichero === undefined
      ? " (el simulador no dijo en qué fichero, así que no se puede atribuir a ninguno)"
      : ` en ${h.fichero}${h.linea === undefined ? "" : `:${h.linea}`}`
  }: ${h.mensaje}`;

/**
 * Cómo se lee un hallazgo, dicho antes de enseñar ninguno.
 *
 * **Esto es la corrección medida.** El encabezado era «Sus hallazgos sobre lo que este turno
 * tocó», que es FALSO justo para los hallazgos sin fichero, y de ahí salió el primer
 * hallazgo del rojo falso: «se modificaron ficheros de lógica JavaScript durante el turno
 * según los hallazgos del verificador». Un hallazgo no dice quién escribió nada — dice que
 * el proyecto tiene una inconsistencia, y el simulador mira el proyecto ENTERO porque es su
 * API. Es la misma regla que gobierna el reparto en `agent/turnoReal.ts#conVerificacion`:
 * «un error que ya estaba en un fichero que el agente no abrió no es del agente:
 * atribuírselo sería falso». Aquí se la dice también al juez.
 */
const COMO_SE_LEEN_LOS_HALLAZGOS = [
  "Cómo se leen esos hallazgos: el simulador mira el PROYECTO ENTERO, no lo que este turno",
  "escribió. Son OBSERVACIONES sobre el estado del proyecto y no atribuyen autoría:",
  "ninguno dice quién escribió qué, ni que este turno tocara el fichero del que habla.",
  "Lo único que dice qué escribió el turno es la lista de arriba.",
  "",
];

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
  const errores = hallazgos.filter((h) => h.severidad === "error");
  const avisos = hallazgos.filter((h) => h.severidad !== "error");
  return [
    caso.verificador === "verde"
      ? [
          "El verificador de XOne (xone-simulator) acabó en VERDE, así que",
          "no hay nada que reprochar por parte del verificador: no dejó ni un error.",
          "Los avisos no lo cambian — los errores son lo único que la puerta de entrega cuenta.",
        ].join("\n")
      : `El verificador de XOne (xone-simulator) acabó en ROJO: dejó ${errores.length} error(es) sin corregir.`,
    "",
    ...(hallazgos.length === 0 && caso.preexistentes === undefined ? [] : COMO_SE_LEEN_LOS_HALLAZGOS),
    ...(errores.length === 0
      ? []
      : [
          `Errores que caen en algo que este turno escribió, o que no dicen en qué fichero (${errores.length}):`,
          ...errores.map(lineaDeHallazgo),
        ]),
    ...(avisos.length === 0
      ? []
      : [
          `Avisos que caen en algo que este turno escribió, o que no dicen en qué fichero (${avisos.length}):`,
          ...avisos.map(lineaDeHallazgo),
        ]),
    /**
     * El otro lado del reparto, CONTADO. Ausente es «no se midió» y cero es «no había
     * ninguno más»: las dos cosas se dicen, porque callar el cero dejaría al juez sin saber
     * si la lista de arriba es todo lo que el simulador vio.
     */
    ...(caso.preexistentes === undefined
      ? []
      : caso.preexistentes === 0
        ? ["El simulador no encontró ningún otro hallazgo en el resto del proyecto."]
        : [
            `Y ${caso.preexistentes} hallazgo(s) más en ficheros que este turno no tocó, que quedan FUERA`,
            "de las listas de arriba: son del proyecto y no de este trabajo, y no hay que juzgarlos.",
          ]),
  ];
};

/**
 * Qué es la lista de rutas, y qué dice git. El segundo hallazgo del rojo falso medido salió
 * de aquí: «no se puede comprobar la existencia ni el contenido de DOCUMENTACION.md con los
 * datos facilitados», con `DOCUMENTACION.md` en la lista.
 *
 * El encabezado decía «Ficheros que se autorizó escribir», que se lee como un PERMISO —lo
 * que se podría haber escrito— y no como el registro de lo que se escribió. No se arregla
 * prometiendo más de lo que el dato aguanta: `Tarea.autorizadas` se apunta al autorizar cada
 * escritura, así que una ruta que una guarda rechazara aparecería igual, y «la verdad sobre
 * lo que cambió la tiene Revisión». Por eso se dice lo que es Y se pone al lado el único
 * hecho sobre el disco que llega hasta aquí, que es lo que dice git.
 */
const parrafoDeLoEscrito = (caso: CasoDeJuez): string[] => {
  if (caso.autorizadas.length === 0) {
    return [
      "El turno NO escribió ningún fichero: no consta ninguna ruta.",
      ...(caso.escribio === true
        ? ["Pero git confirma que la sesión cambió ficheros, así que algo se tocó sin quedar apuntado."]
        : caso.escribio === false
          ? ["Y git dice que la sesión no cambió ningún fichero, así que fue un trabajo de solo lectura."]
          : ["Y no hay marca de git con la que comprobarlo, así que sobre el disco no se afirma nada."]),
    ];
  }
  return [
    `LO QUE EL TURNO ESCRIBIÓ (${caso.autorizadas.length} ruta(s)):`,
    ...caso.autorizadas.map((f) => `- ${f}`),
    "Son las rutas que el turno escribió sin que ninguna persona las aprobara, apuntadas al",
    "autorizar cada escritura: es el registro de lo que se tocó en este trabajo.",
    ...(caso.escribio === true
      ? ["git confirma que la sesión cambió ficheros."]
      : caso.escribio === false
        ? [
            "Ojo: git dice que la sesión no cambió ningún fichero. O una guarda rechazó esas",
            "escrituras, o se deshicieron — y eso SÍ es algo que reprochar a este trabajo.",
          ]
        : ["No hay marca de git con la que comprobar si la sesión cambió algo, así que eso no se afirma."]),
    "Por eso «no puedo comprobar si existe X» sobre una ruta de esa lista",
    "no es una respuesta válida: que el turno la escribió es exactamente lo que dice la lista.",
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
    ...parrafoDeLoEscrito(caso),
    "",
    ...parrafoDelVerificador(caso),
    "",
    /**
     * Los dos límites, y la frontera entre ellos DICHA.
     *
     * «Si con eso no se puede saber, dilo» y «no puedo comprobar si existe X no vale» se
     * contradicen si no se separa qué es cada cosa: no tener el contenido es un dato de
     * partida —lo mismo para todos los casos— y no un hallazgo sobre este trabajo. Lo que
     * de verdad no se puede juzgar sin contenido es la CALIDAD; qué se escribió sí se sabe.
     */
    "No tienes el contenido de los ficheros y no lo vas a tener: eso es un dato de partida de",
    "este paso, no es un hallazgo sobre este trabajo, y no lo pidas. Lo que no puedes juzgar",
    "así es la CALIDAD de lo escrito —si la documentación está bien redactada, si el XML es el",
    "que hacía falta—; qué se escribió sí lo sabes, y es la lista de arriba. Si el encargo",
    "no se puede juzgar por los nombres y los hechos de arriba, dilo en el resumen:",
    "no te inventes nada para poder dar un veredicto, que es justo el fallo que este paso",
    "existe para atrapar.",
    "",
    "Contesta SOLO con este JSON y nada más:",
    '{"veredicto":"verde"|"rojo","resumen":"una o dos frases","hallazgos":["lo que falta, uno por entrada"]}',
    "«verde» = el encargo está cubierto. «rojo» = falta algo, o lo hecho no es lo que se pedía.",
    "Un aviso del verificador, o un defecto que ya estaba en el proyecto, no es motivo de «rojo»:",
    "lo que se juzga es ESTE encargo y ESTE trabajo, no el estado general del proyecto.",
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
