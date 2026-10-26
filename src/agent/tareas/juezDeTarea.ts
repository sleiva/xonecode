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
import { anotarError } from "../../core/trazaDeErrores.js";
import type { CasoDeJuez, DictamenDelJuez, JuezDeTareaPort, ModelosPort, Papel } from "../../core/ports.js";
import type { EstadoJuzgado } from "../../core/tareasDelPlan.js";
import { soloDocumentacion } from "../../core/entrega.js";
import type { HallazgoDelTurno } from "../../core/events.js";
import type { VeredictoDeTarea } from "../../core/entrega.js";
import { textoDe } from "../turno/puente.js";
import { planesDelProyecto, type PlanEnDisco } from "./planesDelProyecto.js";

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
const TOPE_DE_HALLAZGO = 300;

/**
 * No se pudo PREGUNTAR: no hay modelo, no hay clave, no hay red.
 *
 * Es fallo del entorno y no del proyecto, la misma familia que `ErrorDelSimulador`
 * (`agent/turno/verificador.ts`), y por eso es un tipo propio: quien lo recoge tiene que poder
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
 * `agent/config/modelos.ts`, un `afilado` apuntado a un proveedor sin clave lanza «falta la
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
      /**
       * **`callbacks: []` CORTA la cadena, y sin eso el veredicto se ve en el chat.**
       *
       * LangChain propaga los callbacks del run padre a toda invocación anidada. Este juez
       * se llama DENTRO de una tool del turno, así que sus tokens salían por el mismo
       * puente que la respuesta del agente y se pintaban como texto del asistente: en un
       * turno real aparecieron seis bloques de `{"veredicto":"rojo","hallazgos":[…]}` en
       * mitad de la conversación. Comprobado en el `.jsonl` de la sesión — llegaban como
       * actos `asistente`, justo detrás del grupo con `xone_critica_visual`.
       *
       * No es cosmético: el juez es maquinaria, y su salida cruda en el hilo es la misma
       * clase de fuga que un argumento de tool en un evento. Lo que la persona tiene que
       * leer es lo que el harness decide contar con ese veredicto, no el JSON.
       */
      const respuesta = await (modelo as { invoke: (p: unknown, o?: unknown) => Promise<unknown> })
        .invoke(prompt, { callbacks: [] });
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
 * verificador (`agent/turno/turnoReal.ts`) usa solo los ERRORES porque «un aviso que va y viene no
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
 * API. Es la misma regla que gobierna el reparto en `agent/turno/turnoReal.ts#conVerificacion`:
 * «un error que ya estaba en un fichero que el agente no abrió no es del agente:
 * atribuírselo sería falso». Aquí se la dice también al juez.
 */
const COMO_SE_LEEN_LOS_HALLAZGOS = [
  "Cómo se leen esos hallazgos: el simulador mira el PROYECTO ENTERO, no lo que este turno",
  "escribió. Son OBSERVACIONES sobre el estado del proyecto y no atribuyen autoría:",
  "ninguno dice quién escribió qué, ni que este turno tocara el fichero del que habla.",
  "Lo único que dice qué tocó este turno son las listas de arriba, y el HECHO es la de git.",
  "",
];

/** Cómo se le cuenta al juez lo que hizo el verificador. `no-corrio` se DICE. */
/**
 * Las comprobaciones VISUALES del turno, medidas por el harness. Sin este párrafo, un criterio de aceptación que pedía
 * validar contra la maqueta era un rojo seguro: medido en una tarea real (Maset), el juez dijo «no consta» de seis
 * comparaciones y seis críticas hechas. Y sin ninguna, se le DICE que no hubo, para que «no consta» sea la verdad.
 */
const parrafoDeLoVisual = (caso: CasoDeJuez): string[] =>
  caso.comprobacionesVisuales === undefined || caso.comprobacionesVisuales.length === 0
    ? ["Comprobaciones visuales en este turno: NINGUNA (ni comparación con la maqueta ni crítica de pantalla).", ""]
    : [
        "Comprobaciones visuales que se HICIERON en este turno, medidas por el harness (no contadas por el agente; las",
        "últimas, en orden). Cuentan como constancia de la validación visual; juzga por lo que DIJERON, no por si existen:",
        ...caso.comprobacionesVisuales.map((c) => `- ${c}`),
        "",
      ];

const parrafoDelVerificador = (caso: CasoDeJuez): string[] => {
  if (caso.verificador === undefined) return [];
  if (caso.verificador === "no-corrio" && caso.cambiados !== undefined && soloDocumentacion(caso.cambiados)) {
    // Solo documentación, según git (IXCODE-27): el simulador no la comprueba, así que no correr no es una sospecha.
    return [
      "El verificador de XOne (xone-simulator) no ha corrido porque este turno solo cambió documentación, que no",
      "comprueba. No es un fallo: juzga la documentación por lo que dice.",
    ];
  }
  if (caso.verificador === "no-corrio") {
    return [
      "El verificador de XOne (xone-simulator) NO HA CORRIDO en este turno, así que nadie ha",
      "medido si lo escrito es XML válido. Tenlo en cuenta: no lo des por bueno.",
    ];
  }
  /**
   * **Al juez solo le llegan los ERRORES** (decisión suya). Medido en Maset (MAS-3): el verificador cerró en verde con
   * cinco avisos `REF_FUNC_MISSING` —un `self.executeNode("irColl(…)")` leído como llamada a una función que no existe,
   * cuando `irColl` es un NODO de la colección— y el juez los convirtió en «la navegación no está garantizada», con las
   * seis opciones probadas en el aparato. Un aviso del linter puede ser falso; la puerta de entrega ya contaba solo errores.
   */
  const errores = (caso.hallazgos ?? []).filter((h) => h.severidad === "error");
  return [
    caso.verificador === "verde"
      ? [
          "El verificador de XOne (xone-simulator) acabó en VERDE, así que",
          "no hay nada que reprochar por parte del verificador: no dejó ni un error.",
        ].join("\n")
      : `El verificador de XOne (xone-simulator) acabó en ROJO: dejó ${errores.length} error(es) sin corregir.`,
    "",
    ...(errores.length === 0 && caso.preexistentes === undefined ? [] : COMO_SE_LEEN_LOS_HALLAZGOS),
    ...(errores.length === 0
      ? []
      : [
          `Errores que caen en algo que este turno escribió, o que no dicen en qué fichero (${errores.length}):`,
          ...errores.map(lineaDeHallazgo),
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
 * Qué se escribió: la INTENCIÓN y el HECHO, por separado y sin confundirlos.
 *
 * El segundo hallazgo del rojo falso medido salió de aquí: «no se puede comprobar la
 * existencia ni el contenido de DOCUMENTACION.md con los datos facilitados», con
 * `DOCUMENTACION.md` en la lista. El encabezado decía «Ficheros que se autorizó escribir»,
 * que se lee como un PERMISO —lo que se podría haber escrito— y no como un registro.
 *
 * **Y no se arregla prometiendo más de lo que `autorizadas` aguanta.** Ese campo se apunta
 * al autorizar cada escritura, así que una ruta que una guarda rechace sale igual, y «la
 * verdad sobre lo que cambió la tiene Revisión». Lo que se hace es DARLE la verdad:
 * `cambiados` es el diff de git de la sesión contra su «antes», o sea un hecho sobre el
 * disco, con la ruta relativa. Con eso «no puedo comprobar si existe X» deja de tener de
 * dónde agarrarse — y de propina el juez puede juzgar la cobertura del encargo ruta por ruta.
 *
 * Las tres respuestas de git se dicen distintas, que es la regla de siempre: lista con
 * ficheros, lista VACÍA («no cambió nada», una afirmación) y AUSENTE («no se pudo preguntar»,
 * que no es lo mismo y no puede leerse como un proyecto intacto).
 */
const parrafoDeLoEscrito = (caso: CasoDeJuez): string[] => {
  const cambiados = caso.cambiados;
  /** Autorizadas que git no ve cambiadas: o las rechazó una guarda, o escribieron lo que ya
   *  estaba. Callarlo dejaría al juez creyendo que aterrizó algo que no aterrizó. */
  const sinAterrizar = cambiados === undefined ? [] : caso.autorizadas.filter((r) => !cambiados.includes(r));
  return [
    // Con git delante, la lista de lo AUTORIZADO no añade nada y despista: en una tarea las escrituras locales de un
    // especialista ya no pasan por autorizar (`escribeSinPreguntar`), y medido en Maset el juez leyó «10 autorizadas y
    // 30 cambiadas» como ficheros escritos «sin constancia de su procedencia». Solo se dice lo que no aterrizó (abajo).
    ...(cambiados !== undefined
      ? []
      : caso.autorizadas.length === 0
      ? ["El turno no autorizó escribir ningún fichero: no consta ninguna ruta."]
      : [
          `LO QUE EL TURNO AUTORIZÓ ESCRIBIR (${caso.autorizadas.length} ruta(s)):`,
          ...caso.autorizadas.map((f) => `- ${f}`),
          "Son las rutas que el turno escribió sin que ninguna persona las aprobara, apuntadas",
          "al autorizar cada escritura: es su registro de lo que quiso tocar.",
        ]),
    "",
    ...(cambiados === undefined
      ? [
          "No hay marca de git con la que comprobar qué cambió en el proyecto, así que sobre el",
          "disco no se afirma nada: eso es «no se pudo mirar», no «no cambió nada».",
        ]
      : cambiados.length === 0
        ? caso.entregadosAntes !== undefined
          ? [
              "Y git dice que esta pasada no cambió ningún fichero del proyecto. Es una medida, no",
              "una suposición: el diff desde que empezó esta continuación sale vacío.",
            ]
          : [
              "Y git dice que la sesión no cambió ningún fichero del proyecto. Es una medida, no",
              "una suposición: el diff de la sesión contra su «antes» sale vacío.",
            ]
        : [
            `LO QUE CAMBIÓ EN EL PROYECTO, según git (${cambiados.length} fichero(s)):`,
            ...cambiados.map((f) => `- ${f}`),
            "Es el diff de la sesión contra su «antes», o sea un HECHO sobre el disco y no una",
            "intención. Por eso «no puedo comprobar si existe X» sobre un fichero de esta lista",
            "no es una respuesta válida: git dice que está y que cambió en este trabajo.",
          ]),
    ...parrafoDeLasPasadasAnteriores(caso),
    ...(sinAterrizar.length === 0
      ? []
      : [
          `Ojo: de lo autorizado, git no ve cambio en: ${sinAterrizar.join(", ")}. O lo rechazó`,
          "una guarda de ruta, o escribió lo que ya estaba — no des por hecho que aterrizó.",
        ]),
  ];
};

/**
 * Una CONTINUACIÓN, dicha: lo que ya entregaron las pasadas anteriores del mismo hilo (`CasoDeJuez.entregadosAntes`).
 *
 * Medido en Maset (tarea fa556690, 26-10-2026): la lista de git de una continuación se mide desde que se creó, el encargo
 * es el entero, y el juez dictó rojo por «Git no lista MaestroSalidas… ni el plan», que estaban en el disco, commiteados
 * por las pasadas anteriores. Lo de antes cuenta como RASTRO para la entrega; lo que se juzga como trabajo de ESTA pasada
 * (conformidad, acabado) sigue siendo la lista de arriba.
 */
const parrafoDeLasPasadasAnteriores = (caso: CasoDeJuez): string[] => {
  const antes = caso.entregadosAntes;
  if (antes === undefined) return [];
  return [
    "",
    "Este trabajo es una CONTINUACIÓN de otra tarea en la misma conversación: la lista de arriba es solo lo de ESTA",
    "pasada, y el encargo es el de la tarea entera.",
    ...(antes.length === 0
      ? ["Según git, las pasadas anteriores no cambiaron ningún fichero del proyecto."]
      : [
          `LO QUE YA CAMBIARON LAS PASADAS ANTERIORES de esta tarea, según git (${antes.length} fichero(s)):`,
          ...antes.map((f) => `- ${f}`),
          "También es un HECHO sobre el disco: cuenta como rastro de la ENTREGA (criterio 1). Que estos ficheros no",
          "salgan en la lista de esta pasada no es una contradicción con lo que el agente diga de rondas anteriores. La",
          "conformidad y el acabado de ESTE trabajo se juzgan sobre la lista de esta pasada.",
        ]),
  ];
};

/** Cuánto de la respuesta del agente ve el juez: lo bastante para lo que comprobó y lo que no tocó, no un informe entero. */
export const TOPE_DE_RESPUESTA_AL_JUEZ = 3000;

/**
 * Lo que el agente DICE que hizo, marcado como AFIRMACIÓN (`CasoDeJuez.respuestaDelAgente`). Medido en una tarea real: sin
 * ello el juez dictó rojo por cosas que el agente había comprobado o que no había tocado. No es contenido de ficheros: es
 * su informe, y el criterio 3 dice que lo medido gana sobre él.
 */
const parrafoDeLoQueDiceElAgente = (caso: CasoDeJuez): string[] => {
  const r = caso.respuestaDelAgente?.trim();
  if (r === undefined || r === "") return [];
  const recortada = r.length > TOPE_DE_RESPUESTA_AL_JUEZ ? `${r.slice(0, TOPE_DE_RESPUESTA_AL_JUEZ)}…` : r;
  return ["LO QUE DICE EL AGENTE que hizo (AFIRMADO, no medido: contrástalo con lo de arriba y lo de abajo):", recortada, ""];
};

/** Cuántos planes se nombran: los más recientes, que son los de esta tarea; los demás se cuentan. */
export const TOPE_DE_PLANES_PARA_EL_JUEZ = 6;

/**
 * Los PLANES, que git no ve (`planesDelProyecto`). Solo nombres y cuándo se tocaron: con eso «no hay plan» deja de poder
 * afirmarse en falso, y el juez puede casar la carpeta que nombra el encargo con la que existe.
 */
const parrafoDeLosPlanes = (planes: readonly PlanEnDisco[]): string[] => {
  if (planes.length === 0) return ["No hay ningún plan en /planes/."];
  const hace = (m: number) => (m < 60 ? `hace ${m} min` : m < 48 * 60 ? `hace ${Math.round(m / 60)} h` : `hace ${Math.round(m / 1440)} días`);
  const vistos = planes.slice(0, TOPE_DE_PLANES_PARA_EL_JUEZ);
  return [
    "LOS PLANES DEL PROYECTO (viven en /planes/, fuera de git: por eso no salen en la lista de git, y que no salgan ahí no",
    "significa que no existan). Los más recientes primero:",
    ...vistos.map((p) => `- ${p.carpeta}: ${p.ficheros.join(", ")} — tocado ${hace(p.minutos)}`),
    ...(planes.length > vistos.length ? [`- y ${planes.length - vistos.length} más antiguos.`] : []),
  ];
};

/**
 * El PLAN de la tarea y qué se le pide sobre él: el estado de cada tarea del plan que esta tarea TOCÓ, con la misma
 * vara que el veredicto. «hecha» solo con lo COMPROBADO (verificador, capturas, crítico); escrito sin comprobar es
 * «implementada»; lo que no se tocó, no se nombra (el harness no cambia lo que el juez no nombre).
 */
const parrafoDelPlanDeLaTarea = (caso: CasoDeJuez): string[] =>
  caso.plan === undefined
    ? []
    : [
        `EL PLAN DE ESTA TAREA: ${caso.plan.carpeta}. Sus tareas, con lo que dicen ahora:`,
        ...caso.plan.tareas.map(
          (t) =>
            `- ${t.numero} — ${t.titulo}${t.estado === undefined ? "" : ` (estado: ${t.estado})`}${t.criterios.total === 0 ? "" : ` · ${String(t.criterios.hechos)}/${String(t.criterios.total)} criterios`}`
        ),
        "Además del veredicto, di en `plan` el estado de cada tarea del plan que ESTE trabajo tocó: «hecha» solo si lo",
        "COMPROBADO arriba (verificador, comprobaciones visuales) lo acredita; «implementada» si se escribió y no se comprobó",
        "o no pasó; «pendiente» si no se hizo. Las que este trabajo no tocó, no las pongas. Lo que digas se escribe en el plan.",
        // Medido en Maset (Incidencias): con «verde» el juez omitió `plan` y el TASKS.md se quedó con las seis en «pendiente».
        "`plan` es OBLIGATORIO también con «verde»: sin él, el plan se queda sin actualizar. Usa los números tal como salen arriba.",
        "",
      ];

/**
 * **Cómo decide, EN ESTE ORDEN.** Traído del selector ciego de Harness² (Google), que juzga un resultado con seis
 * criterios ordenados —entrega, conformidad, fidelidad a la fuente, coherencia, uso real, acabado— y «la longitud y el
 * pulido no son mérito». Aquí ADAPTADOS a lo que este juez tiene, que no es el contenido: rutas de git, planes, el
 * verificador y las comprobaciones visuales. Así que la fidelidad no es «contrastar con la fuente» sino «gana lo MEDIDO
 * sobre lo afirmado», y la conformidad se juzga por fichero, no por línea.
 *
 * **La conformidad es un HALLAZGO, no un rojo por sí sola** (sí lo es si el encargo lo prohibía): medido en Maset, los
 * rojos falsos del juez venían de cargar al trabajo cosas que no eran defectos, y un fichero «de más» suele ser el
 * estilo o el script que la pantalla pedida necesita. Que se DIGA basta para que la persona lo mire.
 */
export const CRITERIOS_DEL_JUEZ: readonly string[] = [
  "CÓMO DECIDIR, EN ESTE ORDEN:",
  "1. ENTREGA. Por cada cosa que pide el encargo, ¿hay rastro de que se hizo, en las listas de git (la de esta pasada o,",
  "   en una continuación, la de las anteriores) o en los planes? Lo pedido sin ningún rastro es un hallazgo y es motivo",
  "   de «rojo».",
  "2. CONFORMIDAD. ¿Se cambió algo que el encargo NO pedía? Un fichero de la lista de git que ninguna parte del encargo",
  "   explica (otra pantalla, otra funcionalidad) es una DESVIACIÓN, no una mejora: dilo como hallazgo. No es «rojo» por",
  "   sí solo, salvo que el encargo lo prohibiera; lo que sostiene lo pedido (estilos, scripts o recursos de esa",
  "   pantalla) no es desviación.",
  "3. LO MEDIDO MANDA. El verificador y `comparar_capturas` son MEDIDAS: si un plan, un estado o lo que dice el agente",
  "   chocan con ellas, gana la medida. El CRÍTICO VISUAL (`xone_critica_visual`, el crítico de pantalla) es una OPINIÓN:",
  "   solo pesa para el «rojo» si toca algo que el ENCARGO pide, y eso depende de su ALCANCE. En un encargo PUNTUAL",
  "   (cambiar un botón, un color, un texto) solo cuenta lo de ese elemento; en uno AMPLIO (rediseñar una pantalla contra",
  "   su maqueta) la pantalla entera es el encargo y lo que el crítico vea en ella sí cuenta. Lo demás es observación. Y",
  "   lo que este trabajo NO tocó y ya era así —un icono que no se cambió, un estilo que ya estaba— no es un defecto suyo",
  "   aunque se vea en la captura.",
  "4. COHERENCIA. Si dos hechos de arriba se contradicen (una tarea del plan «hecha» con su comprobación en contra),",
  "   dilo: es un hallazgo aunque no sepas cuál de los dos está mal.",
  "5. SE PUEDE USAR. Un ERROR del verificador en un fichero que este trabajo tocó deja la app sin poder usarse: «rojo».",
  "6. ACABADO. Lo que el encargo cubre y el plan sigue dando por «pendiente» no está terminado.",
  "Cuántos ficheros se cambiaron no es mérito: muchos cambios no hacen un «verde», y pocos y justos no son un «rojo».",
  "Lo que DICE el agente (si va arriba) no es una medida: úsalo para saber qué se comprobó y por qué algo no es defecto",
  "suyo, y créelo solo donde nada medido lo contradiga.",
];

/**
 * El prompt del juez.
 *
 * Lleva el encargo, los ficheros que se autorizó escribir y el veredicto del verificador
 * con sus hallazgos — y nada más. **Nunca el contenido de un fichero**: la pregunta es si
 * el trabajo hace lo que se pedía, y este módulo no abre ni un fichero (no hay un solo
 * `readFile` aquí). Lo que sí se le dice es que no se invente: es la misma cláusula que
 * lleva la petición de reparación, y por el mismo motivo.
 */
function promptDelJuez(caso: CasoDeJuez, planes: readonly PlanEnDisco[]): string {
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
    ...parrafoDeLosPlanes(planes),
    "",
    ...parrafoDelPlanDeLaTarea(caso),
    ...parrafoDeLoQueDiceElAgente(caso),
    ...parrafoDelVerificador(caso),
    "",
    ...parrafoDeLoVisual(caso),
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
    "que hacía falta—; qué se escribió sí lo sabes, y son las listas de arriba. Si el encargo",
    "no se puede juzgar por los nombres y los hechos de arriba, dilo en el resumen:",
    "no te inventes nada para poder dar un veredicto, que es justo el fallo que este paso",
    "existe para atrapar.",
    "",
    ...CRITERIOS_DEL_JUEZ,
    "",
    "Contesta SOLO con este JSON y nada más:",
    caso.plan === undefined
      ? '{"veredicto":"verde"|"rojo","resumen":"una o dos frases","hallazgos":["lo que falta, uno por entrada"]}'
      : `{"veredicto":"verde"|"rojo","resumen":"una o dos frases","hallazgos":["lo que falta, uno por entrada"],"plan":[{"tarea":"${caso.plan.tareas[0]?.numero ?? "T1"}","estado":"hecha"|"implementada"|"pendiente"}]}`,
    "Cada hallazgo, UNA frase corta (menos de 200 caracteres): se lee en una tarjeta.",
    "«verde» = el encargo está cubierto. «rojo» = falta algo, o lo hecho no es lo que se pedía.",
    "Un aviso del verificador, o un defecto que ya estaba en el proyecto, no es motivo de «rojo»:",
    "lo que se juzga es ESTE encargo y ESTE trabajo, no el estado general del proyecto.",
    // Medido en Maset (21→22-10-2026): «la forma de pago no muestra el dato real que la maqueta exige: A16-0842189», y «la
    // pantalla vacía no supera» frente a una maqueta dibujada firmada y con datos. Ninguno de los dos era un defecto.
    "Lo que importa es que la pantalla use VISUALMENTE el diseño de la maqueta. Una maqueta de rediseño (de Stitch o de donde sea)",
    "lleva datos inventados:",
    "un texto de la maqueta que no está en la app (una población, un nombre, una cifra) no es un fallo, aunque una medida lo diga.",
    "Los DATOS que pinta la maqueta —números, códigos, nombres, importes, cuántas filas tiene una lista— son de EJEMPLO:",
    "no se exigen. Tampoco el ESTADO en que está dibujada (firmada, rellena, con filas): si la captura es de otro estado y",
    "el trabajo lo dice, la diferencia que salga por eso no es motivo de «rojo». Lo que sí cuenta es que el SITIO de cada pieza",
    "exista y se vea como en la maqueta.",
    // Medido en Maset (menú principal): la imagen de Stitch traía una franja de su lienzo y el contenido cortado, y el rojo
    // salió de «estructura distinta» y «bordes fuera de tolerancia» contra ella. La maqueta no se corrige: se dice.
    "Si una comprobación trae un «AVISO DE LA MAQUETA», la maqueta viene DEFECTUOSA de Stitch: lo medido contra ella",
    "(estructura distinta, bordes que no encajan) no es motivo de «rojo». Juzga por el resto, y dilo en el resumen como",
    "observación para quien hizo la maqueta, no como fallo del trabajo.",
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
const unaFrase = (texto: string, tope: number): string => {
  const limpio = texto
    .replace(/[\u0000-\u001F\u007F]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (limpio.length <= tope) return limpio;
  /**
   * Cortado se DICE, y por palabra: medido en Maset (liquidaciones), los hallazgos acababan «…fuera del control de git,
   * no» y «…no cubre el compo», y no se sabía si faltaba algo. El «…» cuenta dentro del tope.
   */
  const cabe = limpio.slice(0, tope - 1);
  const espacio = cabe.lastIndexOf(" ");
  return `${(espacio > tope / 2 ? cabe.slice(0, espacio) : cabe).replace(/[\s,;:.—-]+$/, "")}…`;
};

/**
 * El JSON de la respuesta, tolerando la valla de código.
 *
 * Los modelos contestan «Aquí va: ```json … ```» aunque se les pida solo el JSON, así que
 * se busca el primer `{` y el último `}`. Lo que no parsee no es un error: es un veredicto
 * `indeterminado`, que no es verde.
 */
export function objetoDe(texto: string): Record<string, unknown> | undefined {
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

const ESTADOS_JUZGADOS: readonly EstadoJuzgado[] = ["hecha", "implementada", "pendiente"];

/**
 * El estado de las tareas del plan que dice el juez, SOLO de las que existen en el plan y con una de las tres palabras.
 * Lo demás se tira: el harness no escribe en el plan nada que no se pueda casar. Sin plan, o sin nada válido, `undefined`.
 */
export function tareasDelPlanDeTexto(texto: string, plan: CasoDeJuez["plan"]): DictamenDelJuez["tareasDelPlan"] {
  if (plan === undefined) return undefined;
  const lista = objetoDe(texto)?.plan;
  if (!Array.isArray(lista)) return undefined;
  const existen = new Set(plan.tareas.map((t) => t.numero));
  const salida: { numero: string; estado: EstadoJuzgado }[] = [];
  for (const x of lista) {
    const o = x as { tarea?: unknown; estado?: unknown };
    if (typeof o.tarea !== "string" || typeof o.estado !== "string") continue;
    const estado = o.estado.trim().toLowerCase() as EstadoJuzgado;
    if (!existen.has(o.tarea.trim()) || !ESTADOS_JUZGADOS.includes(estado)) continue;
    if (!salida.some((s) => s.numero === o.tarea)) salida.push({ numero: o.tarea.trim(), estado });
  }
  return salida.length === 0 ? undefined : salida;
}

export function crearJuezDeTarea(opciones: {
  invocar: InvocarModelo;
  /** Qué planes hay. Por omisión el lector REAL: un opcional que nadie pasa es el patrón de fallo de este repo. */
  planes?: (raiz: string) => readonly PlanEnDisco[];
}): JuezDeTareaPort {
  const planes = opciones.planes ?? planesDelProyecto;
  return {
    juzgar: async (caso) => {
      let texto: string;
      try {
        texto = await opciones.invocar(PAPEL_DEL_JUEZ, promptDelJuez(caso, planes(caso.raiz)), caso.raiz);
      } catch (error) {
        // Lo que ya viene envuelto se deja: `invocarConModelos` distingue el fallo de
        // CONSTRUIR (cuyo mensaje es el accionable) del de LLAMAR (cuyo cuerpo no se
        // repite). Cualquier otro `invocar` puede lanzar lo que sea, y entonces solo se
        // conserva el nombre del error — la regla de `ErrorCatalogoModelos`.
        if (error instanceof ErrorDelJuezDeTarea) throw error;
        throw new ErrorDelJuezDeTarea(error instanceof Error ? error.name : "error al preguntar");
      }
      const veredicto: DictamenDelJuez = veredictoDeTexto(texto);
      const delPlan = tareasDelPlanDeTexto(texto, caso.plan);
      /**
       * Una respuesta sin el JSON pedido se APUNTA, recortada: medido en una tarea real (Maset), la tarjeta decía «el juez
       * no contestó con el JSON que se le pidió» y no había forma de saber qué contestó. Va al registro de errores (la
       * casilla «Depurar»), que quita las rutas de la máquina; es texto del modelo sobre nombres de ficheros, nunca su
       * contenido.
       */
      if (veredicto.veredicto === "indeterminado") {
        anotarError(
          "juezDeTarea#juzgar",
          Object.assign(new Error(`${veredicto.resumen}. Contestó (${texto.length} caracteres): ${texto.trim() === "" ? "(vacío)" : unaFrase(texto, TOPE_DE_RESPUESTA_APUNTADA)}`), {
            name: "RespuestaDelJuez",
          })
        );
      }
      return delPlan === undefined ? veredicto : { ...veredicto, tareasDelPlan: delPlan };
    },
  };
}

/** Cuánto de una respuesta del juez sin JSON se apunta: lo justo para ver qué hizo en vez de contestar. */
export const TOPE_DE_RESPUESTA_APUNTADA = 600;
