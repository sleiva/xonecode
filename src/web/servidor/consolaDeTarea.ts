/**
 * La `Consola` con la que corre una tarea en background.
 *
 * **Aparca en vez de contestar, y eso es todo el fichero.** Hoy una consola de proyecto sin
 * cliente enganchado rechaza toda aprobación en silencio —`consolaWeb.eof()` es
 * `!transporte.conectado()`— y contesta cadena vacía a cada pregunta. Para una tarea
 * autónoma eso es la peor combinación posible: el turno «acaba» y nadie se enteró de que
 * nada se aplicó. Aquí lo que no puede resolverse sin una persona se APARCA con su motivo,
 * que es lo único que hace que el estado «requiere atención» sea verdad.
 *
 * **`aparcar` es el ÚNICO canal, y está medido**: `EjecutorDeTurno` devuelve `Promise<void>`
 * y `crearEjecutorReal` (`cli/main.ts`) tira el retorno de `sesion.turno`, así que el
 * `cortadoPorTope` que sí sabría que quedaron escrituras sin aplicar no sale de ahí. Sin
 * este objeto, una tarea que se topa con una aprobación acabaría marcada «terminada».
 *
 * No se guarda el `interrupt` esperando una decisión: el proceso puede vivir días y morir
 * en medio. La aprobación se retoma al abrir la sesión —`saldarAprobacionesHuerfanas` salda
 * las llamadas colgadas diciendo la verdad, el modelo vuelve a proponer la escritura y ahí
 * ya hay una persona delante—.
 *
 * **Una consola por TURNO.** El «se aparca una vez» de abajo vale por turno porque quien la
 * monta (el corredor, en su `correrTarea`) construye una por turno. Reutilizarla para un
 * segundo turno lo dejaría mudo.
 */
import type { Consola } from "../../cli/consola.js";
import type { Escribir } from "../../cli/stdio.js";
import type { PendienteDeAprobacion } from "../../core/events.js";
import type { Piel } from "../../core/turno.js";
import type { CatalogoModelosPort, Papel } from "../../core/ports.js";
import type { Decision } from "../../vendor/hitl.js";

/**
 * El mensaje que acompaña al rechazo, hermano de `REJECT_MESSAGE` (`vendor/hitl.ts`).
 *
 * Se copian sus tres cláusulas operativas —no se ejecutó, no lo reintentes, DILO en la
 * respuesta final— porque su docblock describe exactamente el fallo que aquí más duele: un
 * rechazo pelado deja al modelo rematar el turno como si la escritura hubiese quedado
 * lista, y en una tarea de fondo el transcript es lo único que una persona leerá después.
 *
 * Lo que NO se copia es la atribución: el original dice «RECHAZADO por el usuario», y en
 * una tarea de fondo ningún usuario rechazó nada. Ese detalle acabaría en la respuesta
 * final contando un rechazo que nunca hubo, que es la misma clase de mentira que este
 * fichero existe para evitar.
 */
export const MENSAJE_DE_RECHAZO_DE_TAREA =
  "PENDIENTE DE APROBACIÓN. Esta operación NO se ha ejecutado y el proyecto NO se ha " +
  "modificado. Corría como una tarea de fondo y no había ninguna persona a quien " +
  "preguntar, así que la escritura quedó esperando aprobación. No la reintentes ni la " +
  "reformules. En tu respuesta final di explícitamente que el cambio no se aplicó porque " +
  "quedó pendiente de aprobación, y explica qué pretendías hacer y por qué, para que quien " +
  "atienda la tarea pueda decidir.";

/**
 * Se pidió algo que solo una persona puede contestar, y no había ninguna.
 *
 * **Cortar el turno es la única salida honesta de `preguntar`.** No tiene valor de
 * «rechazo»: devuelve una cadena, y cualquier cadena que se devuelva el agente la toma por
 * la respuesta de un humano. La cadena vacía tampoco sirve — `cli/aprobar.ts` la documenta
 * contada a mano: de sus 18 llamadores, 16 la leen como «cancela / usa el valor por
 * omisión», y «usa el valor por omisión» es una decisión que aquí nadie ha tomado. Es
 * además el error que este repo ya declara: «esa cadena vacía sola NO rechaza; aquí decía
 * que sí y era falso».
 *
 * Cortar desde dentro no es un camino nuevo: es lo que hace el «sin humano» de `cli/run.ts`
 * lanzando desde `pedirAprobacion`, y `turnoReal.ts` tiene un `catch` puesto para él.
 * Medido: una excepción desde ahí sale por `sesion.turno` y llega a quien corre el turno.
 * Con `aparcar` llamado ANTES de lanzar, el motivo bueno ya está escrito cuando el corredor
 * recoja el error — y su `motivo ??=` conserva el primero.
 */
export class ErrorDeTareaSinHumano extends Error {
  constructor(motivo: string) {
    super(`la tarea necesita a una persona: ${motivo}`);
    this.name = "ErrorDeTareaSinHumano";
  }
}

/**
 * La ruta como la dicen los hallazgos del verificador: relativa a la raíz del proyecto.
 *
 * Las del interrupt vienen del backend virtual (`/app.xne`), así que nunca son de la
 * máquina — pero la barra de delante las hace parecerlo, y el motivo viaja por el cable,
 * que puede ir por un túnel.
 */
const relativa = (ruta: string): string => ruta.replace(/^\/+/, "");

export function crearConsolaDeTarea(opciones: {
  /** Aparca la tarea con este motivo. Se llama UNA vez por turno. */
  aparcar: (motivo: string) => void;
  escribir: Escribir;
  /**
   * La piel con la que el turno se pinta. Ausente y `crearEjecutorReal` cae en
   * `crearPielStdio(escribir)`, que es texto de consola metido en actos `sistema`: la sesión
   * de la tarea se guarda, pero degradada — sin actos de asistente, ni de razonamiento, ni
   * las tarjetas de artefacto, o sea una pared de líneas grises donde debería leerse una
   * conversación. Quien la monte debería pasarle la piel de la consola de PROYECTO, que es
   * la que sabe hacer actos de verdad; entra por aquí y no se construye dentro porque esta
   * capa no conoce el transporte de esa consola.
   */
  piel?: () => Piel;
  catalogoModelos: CatalogoModelosPort;
  guardarModeloGlobal: (papel: Papel, id: string) => { ruta: string; id: string };
}): Consola {
  // Una vez por turno: el modelo que vuelve a proponer tras cada rechazo hace que esto se
  // llame CUATRO veces en un solo turno (medido sobre el bucle de `turnoReal.ts`), y cuatro
  // motivos encadenados taparían el primero, que es el que explica de verdad por qué paró.
  let yaAparcada = false;
  const aparcar = (motivo: string): void => {
    if (yaAparcada) return;
    yaAparcada = true;
    // Y no muda: el estado de la tarea lo lee el kanban, pero el transcript lo lee quien
    // abra la sesión para atenderla — y ahí un turno que se corta sin decir nada se lee
    // como que el agente se quedó callado. Es la misma regla que el aviso de honestidad de
    // las escrituras que nadie aprobó.
    opciones.escribir(`\n⏸  tarea aparcada: ${motivo}\n`);
    opciones.aparcar(motivo);
  };

  return {
    // Una tarea es UN turno con un encargo, no una conversación: no hay más líneas que dar.
    lineas: (async function* () {})(),
    escribir: opciones.escribir,
    // Se reenvía o no está: `piel: undefined` en el objeto haría que un `"piel" in consola`
    // dijera que sí, y quien la busque lo hace para saber si tiene una mejor que la de stdio.
    ...(opciones.piel === undefined ? {} : { piel: opciones.piel }),
    // `interactivo: false` y `eof: true` dicen la verdad. Lo que NO se hace es dejar que de
    // ahí se deduzca una decisión: quien decide es la persona que atienda la tarea. De
    // rebote —y a propósito— `seAplicaSinAprobacion` calcula «hay alguien delante» con
    // exactamente esta cuenta (`interactivo && !eof()`), así que una tarea NO auto-aplica
    // ni en un proyecto puesto en «sin aprobación»: ese ajuste es «el humano que está aquí
    // ha decidido no pulsar», y aquí no hay ninguno.
    interactivo: false,
    eof: () => true,
    preguntar: async (pregunta: string) => {
      aparcar(`el agente preguntó y no había nadie: «${pregunta}»`);
      throw new ErrorDeTareaSinHumano("hizo una pregunta");
    },
    leerSecreto: async () => {
      // El ENUNCIADO no se copia al motivo: la pregunta de un secreto nombra el proveedor,
      // y el motivo se pinta en el kanban de todos los proyectos. Con saber que pidió una
      // credencial ya se sabe qué hacer.
      aparcar("el agente pidió una credencial, y eso no se contesta sin una persona");
      throw new ErrorDeTareaSinHumano("pidió una credencial");
    },
    catalogoModelos: opciones.catalogoModelos,
    guardarModeloGlobal: opciones.guardarModeloGlobal,
    aprobacionesTui: async (
      pendientes: PendienteDeAprobacion[],
      ficheros: Map<string, string>
    ): Promise<Map<string, Decision>> => {
      const rutas = pendientes.map((p) => {
        const ruta = ficheros.get(p.id);
        return ruta === undefined ? p.descripcion : relativa(ruta);
      });
      aparcar(`${pendientes.length} escritura(s) esperando aprobación: ${rutas.join(", ")}`);
      /**
       * **Rechazo, y con su mensaje.** El rechazo es lo que deja el turno cerrar limpio:
       * medido sobre el bucle de `turnoReal.ts`, se reanuda con las decisiones, el modelo
       * se entera de que no se escribió y el turno termina con `cortadoPorTope` en `false`.
       * Sin resumir, el interrupt se queda colgado para siempre. La escritura NO se pierde:
       * al atender la tarea, el modelo la vuelve a proponer con alguien delante.
       */
      const decisiones = new Map<string, Decision>();
      for (const p of pendientes) {
        decisiones.set(p.id, { type: "reject", message: MENSAJE_DE_RECHAZO_DE_TAREA });
      }
      return decisiones;
    },
  };
}
