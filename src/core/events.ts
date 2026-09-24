/**
 * Lo que un turno le cuenta al mundo. `agent/` los emite, `core/` decide qué se enseña,
 * las pieles (TUI y stdio) los pintan.
 *
 * Ningún evento lleva argumentos de tool. Ni truncados: `studio_edit_file` lleva el
 * contenido del fichero y una tool MCP lleva el bearer. Enseñar el progreso no puede ser
 * la forma de filtrar un secreto, así que el TIPO no los puede llevar.
 *
 * La excepción aparente es `tool.detalle`, y no es una excepción: es lo ÚNICO que
 * sale de los argumentos, un campo por tool elegido a mano en la lista blanca de
 * `agent/turno/resumenDeTool.ts` — `file_path`, `path` o `pattern`, nunca contenido. Una
 * tool sin entrada en la lista no lleva `detalle`, exista lo que exista en sus
 * argumentos.
 */
import type { Artefacto } from "./artefactos.js";
export type { Artefacto };

export type DomainEvent =
  | { tipo: "token"; texto: string; msgId?: string }
  /**
   * El razonamiento del modelo, cuando lo publica (los bloques `thinking` de Gemini, y el
   * equivalente de los demás). Va SEPARADO de `token` a propósito: no es la respuesta, y
   * mezclarlo con ella es lo que hacía `String(content)` —volcar el `repr` de la lista con
   * el razonamiento dentro— y por lo que el puente empezó a filtrar por bloques.
   *
   * Que exista el evento no obliga a nadie a pintarlo: `Piel.razonamiento` es opcional, y
   * las pieles de terminal no lo implementan — así la salida de una tubería sigue siendo
   * byte-idéntica.
   */
  | { tipo: "razonamiento"; texto: string; msgId?: string }
  /**
   * El RESUMEN con el que la librería compacta la conversación al pasar el umbral de contexto
   * (`agent/turno/resumenDeContexto.ts`), en trozos. Tampoco es la respuesta: salía por el
   * mismo stream que ella y se pintaba —y se guardaba— como un mensaje del asistente. Lo
   * distingue una ETIQUETA de la llamada, no el texto.
   *
   * Opcional como `razonamiento`: las pieles de terminal no lo implementan, así que ahí deja
   * de imprimirse (antes salía en inglés como si fuera la respuesta) y la tubería sigue igual.
   */
  | { tipo: "resumen"; texto: string; msgId?: string }
  | { tipo: "fase"; fase: Fase; detalle?: string }
  | { tipo: "tool"; nombre: string; detalle?: string; error?: string; origen?: OrigenDeLaTool }
  | { tipo: "plan"; tareas: TareaDelPlan[] }
  | { tipo: "tarea"; id: string; indice: number; total: number; estado: EstadoTarea }
  /**
   * El veredicto del simulador sobre lo que ESTE turno escribió.
   *
   * `verde`, `errores` y `avisos` son de los ficheros que el turno tocó. `hallazgos` los
   * lista —código, fichero RELATIVO al proyecto, línea y mensaje; nunca contenido—, porque
   * un «2 errores» sin decir dónde no lo puede arreglar nadie, ni el humano ni el paso de
   * reparación que viene detrás. `preexistentes` cuenta los que el simulador vio en
   * ficheros que el turno NO tocó: se dicen aparte porque atribuírselos al agente sería
   * falso, y callarlos sería fingir que el proyecto está limpio.
   */
  | {
      tipo: "verificacion";
      verde: boolean;
      errores: number;
      avisos: number;
      hallazgos?: HallazgoDelTurno[];
      preexistentes?: number;
    }
  | { tipo: "reparacion"; intento: number; tope: number }
  /**
   * El agente ha dejado un ARTEFACTO: un diagrama, un panel, una captura. No es un fichero
   * del proyecto —vive en la carpeta de la sesión, ver `core/artefactos.ts`— y por eso se
   * escribe SIN aprobación humana. Que se anuncie es la contrapartida: una escritura que
   * nadie aprueba tiene que decirse, o es una escritura muda.
   *
   * Lleva la ruta VIRTUAL (`/artefactos/…`) y nunca la del disco ni el contenido: por aquí
   * pasa lo que acaba en el transcript y en el cable.
   */
  | { tipo: "artefacto"; artefacto: Artefacto }
  /**
   * El agente le PREGUNTA a la persona y el turno se para ahí (`ask_user_question` del motor
   * TrueForge). La pregunta ya viaja como texto —con sus opciones numeradas— por `token`, que
   * es lo que ven stdio y la TUI; esto lleva lo MISMO como DATO, para la piel que sabe pintar
   * un botón por opción. Datos y no texto por la regla de `DecisionDeConsola`: deducir las
   * opciones de «1. …» sería leer la sintaxis que la propia piel acaba de escribir. Solo se
   * emite con opciones: sin ellas no hay botón que pintar y el texto basta.
   */
  | { tipo: "consulta"; pregunta: string; opciones: string[] }
  | { tipo: "bloqueado"; motivo: MotivoBloqueo; explicacion: string }
  | { tipo: "pausa"; pendientes: PendienteDeAprobacion[] }
  | { tipo: "aviso"; texto: string; severidad: "info" | "aviso" | "grave" }
  | { tipo: "fin"; ms: number };

/**
 * QUIÉN pidió una tool: el orquestador o un especialista, y cuál si se sabe.
 *
 * El `rol` es EXACTO en los dos motores —un especialista siempre llega por la delegación, y eso
 * se ve en el namespace de deepagents y en el hilo de TrueForge—; lo que puede faltar es el
 * NOMBRE. deepagents no lo da (sus segmentos son ids opacos, ver `puente.ts#origenDeTool`) y
 * TrueForge sí (`quienEs`, hilo → especialista). **Ausente es «no consta»**, y por eso no hay un
 * booleano de exactitud al lado: permitiría la combinación imposible de un nombre «inexacto».
 *
 * El nombre es el de un especialista CARGADO, nunca el texto que el modelo puso al delegar ni un
 * id de hilo: un nombre inventado por el modelo o un id opaco en el cable serían un dato con
 * forma de dato que no lo es. Y el orquestador no lleva nombre porque solo hay uno.
 *
 * Ausente entero —el evento sin `origen`— es lo de antes: el doble guionizado y las sesiones
 * guardadas antes de que existiera.
 */
export type OrigenDeLaTool = { rol: "orquestador" } | { rol: "especialista"; nombre?: string };

/** Las fases del lazo. Es lo que llena los 100-300 s en que el agente no habla. */
/** Un hallazgo del simulador, ya relativo al proyecto. Sin contenido de ningún fichero. */
export interface HallazgoDelTurno {
  code: string;
  severidad: "error" | "warning" | "info";
  mensaje: string;
  fichero?: string;
  linea?: number;
}

export type Fase =
  | "entendiendo"
  | "planificando"
  | "esperando-aprobacion"
  | "ejecutando"
  | "verificando"
  | "juzgando"
  | "subiendo"
  | "respondiendo";

export type EstadoTarea = "pendiente" | "en-curso" | "hecha" | "fallida";

export interface TareaDelPlan {
  id: string;
  descripcion: string;
  /** Criterios de aceptación. VACÍO es honesto; un texto de relleno haría juzgar un adorno. */
  aceptacion: string[];
}

/**
 * Los tres motivos por los que el lazo para sin terminar, y son DISTINTOS a propósito.
 *
 * `no-progreso` no es «se acabaron los intentos»: es la misma huella de error dos veces,
 * y se corta ANTES de agotar el presupuesto porque seguir no va a cambiar nada.
 */
export type MotivoBloqueo = "no-progreso" | "tope-reparaciones" | "tope-replanificaciones";

export interface PendienteDeAprobacion {
  id: string;
  /** Qué especialista lo pide. Viaja aquí porque el interrupt NO dice de dónde viene. */
  origen: string;
  descripcion: string;
  decisionesPermitidas: string[];
}