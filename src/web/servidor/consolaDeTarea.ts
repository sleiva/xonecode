/**
 * La `Consola` con la que corre una tarea en background.
 *
 * **Aplica lo que escribe, y aparca lo que necesita a una persona.** Son dos cosas
 * distintas y esa distinción es todo el fichero.
 *
 * **Por qué APLICA** (§0 del diseño, decisión del usuario): la aprobación no estaba por la
 * propiedad del repo, estaba porque XOne ignora en silencio lo desconocido —un atributo
 * inventado no da error sino un bug mudo— y el diff era el único momento en que alguien lo
 * veía antes de que existiera. La autorización de una tarea es el acto de CREARLA: elegir
 * un proyecto y escribir un encargo es decir «trabaja en esto sin preguntarme», y por eso
 * no hay ningún interruptor nuevo que armar — sin tarea creada no hay escritura autónoma
 * posible. El sitio que deja libre el modal lo ocupan el verificador del turno
 * (`turnoReal.ts#conVerificacion`, que corre por este camino igual que por el de una
 * persona — MEDIDO) y el juez de la entrega.
 *
 * **Y NO es `seAplicaSinAprobacion`.** Ese ajuste dice «el humano que está aquí ha decidido
 * no pulsar» —lo calcula como `interactivo && !eof()`— y aquí no hay nadie aquí: con esta
 * consola devuelve `false` siempre, así que reutilizarlo habría dejado a las tareas sin
 * aplicar nada. Y al revés: la marca del `settings.json` de un proyecto offline no decide
 * sobre las tareas de nadie. Dos autorizaciones distintas, con alcances distintos.
 *
 * **Lo aplicado se DICE**, por dos canales y con los NOMBRES: al transcript (que es lo que
 * lee quien abre la sesión) y por `aplicado`, que el corredor guarda en la tarea. Una
 * escritura que nadie aprueba no puede ser además muda — es la regla del evento `artefacto`
 * y la del aviso de honestidad de `seAplicaSinAprobacion`, y aquí es el ÚNICO aviso que
 * hay: el de `turnoReal.ts` sale solo por su rama `todoAutomatico`, que este camino no
 * toma. Con los nombres y no un contador, porque un contador a secas es el aviso que enseña
 * a ignorar los avisos.
 *
 * **Lo que se apunta es lo AUTORIZADO, no lo escrito.** La decisión se toma antes de que el
 * backend escriba, así que una ruta que las guardas de ruta rechazan —`/artifacts/`, una
 * vista aplanada, `/.env`— se apunta aquí y no aparece en el disco (medido en el test de
 * este fichero: las cinco se siguen rechazando, unas por el backend y otras por
 * `permisosDe`). Quien dice qué hay en el disco es git, y eso se lee en Revisión con la ref
 * de la sesión. La misma imprecisión tiene `aplicadasSinPreguntar` en `turnoReal.ts`, y por
 * el mismo motivo.
 *
 * **Lo que NO cambia: `preguntar` y `leerSecreto`.** Aplicar una escritura no es contestar
 * por una persona. Hoy una consola de proyecto sin
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
import { rutaRelativaDeTarea } from "../../core/tareas.js";

/**
 * El mensaje que acompaña al rechazo, hermano de `REJECT_MESSAGE` (`vendor/hitl.ts`).
 *
 * **Quién lo usa desde que las escrituras se aplican**: la pendiente que NO admite
 * `approve`. `decisionesPermitidas` viene del `reviewConfigs` del interrupt y hay tools que
 * solo ofrecen rechazo; aprobar una de esas sería inventarse una decisión que la librería
 * no acepta. Ahí se rechaza con este mensaje Y se aparca, que es fail-closed: no se puede
 * resolver sin una persona.
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
 *
 * **La asimetría, dicha para que se encuentre en un `grep` y no en un turno que no cierra:**
 * ese `catch` de `turnoReal.ts` envuelve SOLO la llamada a `pedirAprobacion`, no el cuerpo
 * del bucle. Hoy da igual, y por eso no se ha ampliado: dentro de un turno de tarea las
 * aprobaciones van por `aprobacionesTui`, así que la rama `pedirDecisiones` —la única que
 * usa `Consola.preguntar` dentro del turno— no se toma nunca, y ampliar el `catch` sería
 * código para una hipótesis. Pero si algún día un `preguntar` acaba DENTRO de un turno, la
 * excepción de aquí se saltará ese `catch` y **ese turno se queda sin `piel.fin`**: sin
 * línea de tiempo en stdio y sin plegarse en la web. Entonces hay que ampliarlo al cuerpo
 * del bucle. La tarea sí queda aparcada y con su motivo en los dos casos, que es la
 * propiedad que sostiene todo esto.
 */
export class ErrorDeTareaSinHumano extends Error {
  constructor(motivo: string) {
    super(`la tarea necesita a una persona: ${motivo}`);
    this.name = "ErrorDeTareaSinHumano";
  }
}


export function crearConsolaDeTarea(opciones: {
  /** Aparca la tarea con este motivo. Se llama UNA vez por turno. */
  aparcar: (motivo: string) => void;
  /**
   * Los ficheros que se acaban de aplicar sin que nadie los aprobara, con ruta relativa.
   *
   * Se llama una vez por TANDA aprobada y no una por turno, al contrario que `aparcar`: un
   * turno aplica en varias rondas de aprobación (medido: cuatro en un turno que insiste), y
   * quedarse con la primera escondería los demás ficheros. Quien lo recoge —el corredor—
   * los acumula y los guarda en la tarea.
   *
   * Opcional porque quien monta esta consola puede no tener dónde guardarlos; entonces lo
   * aplicado se dice igualmente en el transcript, que es lo que no puede faltar.
   */
  aplicado?: (ficheros: readonly string[]) => void;
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
    // `interactivo: false` y `eof: true` dicen la verdad: no hay nadie delante. Lo que NO
    // se hace es dejar que de ahí se deduzca una decisión — quien contesta una PREGUNTA es
    // la persona que atienda la tarea, y las escrituras se aplican por la política de este
    // fichero y no por lo que estos dos campos digan. De rebote, `seAplicaSinAprobacion`
    // calcula «hay alguien delante» con exactamente esta cuenta (`interactivo && !eof()`),
    // así que con esta consola devuelve `false` siempre y no aporta nada por aquí: ese
    // ajuste es «el humano que está aquí ha decidido no pulsar».
    interactivo: false,
    eof: () => true,
    preguntar: async (pregunta: string) => {
      aparcar(`el agente preguntó y no había nadie: «${pregunta}»`);
      // El `catch` de `turnoReal.ts` envuelve solo `pedirAprobacion`: si algún día un
      // `preguntar` llega a correr DENTRO de un turno, este throw lo esquiva y ese turno se
      // queda sin `piel.fin`. Ver el docblock de `ErrorDeTareaSinHumano`.
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
      /** Cómo se nombra una pendiente: su ruta relativa, o su descripción si no la hay. */
      const nombreDe = (p: PendienteDeAprobacion): string => {
        const ruta = ficheros.get(p.id);
        // Sin `file_path` no hay nombre que dar, y un hueco haría desaparecer del registro
        // una escritura que se aplicó. La descripción del interrupt es texto fijo del
        // harness («[dev] quiere escribir un fichero del proyecto»), no una ruta: mismo
        // trato que `aplicadasSinPreguntar` en `turnoReal.ts`.
        return ruta === undefined ? p.descripcion : rutaRelativaDeTarea(ruta);
      };

      const decisiones = new Map<string, Decision>();
      const aplicadas: string[] = [];
      const sinResolver: string[] = [];
      for (const p of pendientes) {
        /**
         * **Solo se aprueba lo que admite aprobación.** `decisionesPermitidas` sale del
         * `reviewConfigs` del interrupt, y hay tools que solo ofrecen rechazo
         * (`consolaWeb.test.ts` ya cubre ese caso por la puerta de las personas). Aprobar
         * una de esas sería inventarse una decisión que la librería no acepta; y como no se
         * puede resolver sin una persona, se rechaza con su mensaje y se APARCA. Fail
         * closed, que es la única dirección posible aquí.
         */
        if (!p.decisionesPermitidas.includes("approve")) {
          decisiones.set(p.id, { type: "reject", message: MENSAJE_DE_RECHAZO_DE_TAREA });
          sinResolver.push(nombreDe(p));
          continue;
        }
        decisiones.set(p.id, { type: "approve" });
        aplicadas.push(nombreDe(p));
      }

      if (aplicadas.length > 0) {
        // Con los NOMBRES, y diciendo POR QUÉ no hubo aprobación: sin la palabra «tarea»
        // esto se lee como que la aprobación se rompió.
        opciones.escribir(
          `\n✎ ${aplicadas.length} escritura(s) aplicadas sin aprobación —es una tarea de fondo, y ` +
            `la autorización fue crearla—: ${aplicadas.join(", ")}\n`
        );
        opciones.aplicado?.(aplicadas);
      }
      /**
       * Y lo que no se pudo resolver aparca la tarea, con los nombres y sin leerse como un
       * rechazo: la escritura está propuesta y espera a alguien, que es lo accionable.
       */
      if (sinResolver.length > 0) {
        aparcar(
          `${sinResolver.length} escritura(s) que no se pueden aplicar sin una persona: ${sinResolver.join(", ")}`
        );
      }
      return decisiones;
    },
  };
}
