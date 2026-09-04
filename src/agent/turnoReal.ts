import { readdirSync, statSync, existsSync, readFileSync } from "node:fs";
import { join, sep, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { HumanMessage } from "@langchain/core/messages";
import { Command, MemorySaver } from "@langchain/langgraph";
import { collectPending, type Decision, MAX_APPROVAL_ROUNDS } from "../vendor/hitl.js";
import { aPendiente, ficheroDe, cambioDe, buildResume } from "./interrupts.js";
import type { PendienteDeAprobacion } from "../core/events.js";
import type { LineaDeDiff } from "../core/diff.js";
import type { Piel } from "../core/turno.js";
import { Bitacora } from "../core/bitacora.js";
import { correrTurno } from "../core/turno.js";
import type { ModelosPort, SkillsPort } from "../core/ports.js";
import type { Entorno } from "./entorno.js";
import { tomarInstantanea, type Instantanea, type Cambio } from "./instantanea.js";
import { construirAgente } from "./xoneAgent.js";
import { asegurarMemoriaDeProyecto } from "./memoriaDeProyecto.js";
import { aEventos } from "./puente.js";
import { createTokenTracker, type TokenTracker } from "../vendor/tokenTracking.js";
import { crearDiagnosticoDeTools } from "./diagnosticoDeTools.js";

/**
 * Una sesión de turno real: varios turnos sobre el MISMO agente y el MISMO hilo.
 *
 * Es la extracción de `correrReal` (`cli/run.ts`), reescrita de disparo único a reutilizable:
 * el agente, el checkpointer, el tracker y el `thread_id` viven en el cierre de
 * `abrirSesionReal` y se conservan entre llamadas. Lo que cada `turno()` renueva es la foto
 * del ANTES, porque el diff es del TURNO y no de la sesión: si la foto fuese una por sesión,
 * el turno 3 reportaría también lo que escribió el turno 1.
 */
export interface SesionReal {
  /** Un turno. Devuelve la bitácora y los cambios que dejó en el proyecto. */
  turno(
    peticion: string,
    piel: Piel
  ): Promise<{
    bitacora: Bitacora;
    cambios: Cambio[];
    /** Se agotó `MAX_APPROVAL_ROUNDS` con aprobaciones sin resolver. */
    cortadoPorTope: boolean;
  }>;
  /** Rehace el agente con modelos nuevos, CONSERVANDO el hilo. Para `/modelo`. */
  cambiarModelos(modelos: ModelosPort): Promise<void>;
  /** Abre un hilo nuevo. Para `/nuevo`. */
  /**
   * Abre un hilo nuevo. **Acepta el id** porque quien lo pide puede ya tener uno.
   *
   * Sin el parámetro había DOS ids para un mismo hilo: la consola generaba el suyo en su
   * `/nuevo` y la sesión otro aquí, así que `/hilo` enseñaba un `thread_id` que no era el
   * que usaba el grafo. Un identificador que no identifica es peor que no darlo.
   */
  nuevoHilo(id?: string): void;
  /** Aborta de inmediato la llamada al modelo que está en curso, si la hay. */
  cancelar(): void;
  /**
   * Termina la sesión: aborta lo que esté en curso y la deja inservible.
   *
   * Hace falta para CAMBIAR de proyecto (`web/servidor/vestibulo.ts`): la consola web abre
   * una consola de proyecto a la vez, y cerrar la anterior es agotar sus `lineas` para que
   * `correrConsola` retorne. Sin esto, un turno en vuelo mantendría el lazo dentro del
   * `await` durante minutos y la apertura del proyecto siguiente se quedaría esperando.
   *
   * Qué libera y qué no, dicho entero porque una fuga callada es peor que una declarada:
   * el `MemorySaver`, el agente construido y el tracker viven en el CIERRE de
   * `abrirSesionReal` y no exponen ningún `close()` —no hay sockets ni descriptores, el
   * cliente del modelo es por llamada—, así que se recogen con la referencia a la sesión
   * en cuanto quien la abrió la suelta. Lo único que hay que soltar activamente es la
   * llamada en curso, y eso es exactamente `cancelar()`. La bandera de cerrada existe para
   * que un `turno()` tardío falle en vez de revivir un hilo que ya nadie mira.
   */
  cerrar(): void;
  readonly tracker: TokenTracker;
  /** El `thread_id` ACTUAL: tras `nuevoHilo()` cambia, y hay que leerlo, no cachearlo. */
  readonly hilo: string;
}

/**
 * Recorre la raíz y devuelve las rutas en el ESPACIO VIRTUAL del backend.
 *
 * Exportada porque la consola la usa para el completado de «@ficheros» (cli puede
 * importar de agent; al revés no). El recorrido se hace EN CADA llamada a propósito:
 * la lista no se cachea porque los ficheros cambian durante la sesión.
 */
export function ficherosDelProyecto(raiz: string, prof = 0): ReadonlySet<string> {
  if (prof > 4 || !existsSync(raiz)) return new Set();
  const salida = new Set<string>();
  for (const entrada of readdirSync(raiz)) {
    if (entrada === "node_modules" || entrada === ".git") continue;
    const ruta = join(raiz, entrada);
    try {
      if (statSync(ruta).isDirectory()) {
        // La recursión devuelve rutas relativas al SUBDIRECTORIO: sin recoserle el
        // nombre, «app/Clientes.xne» saldría como «/Clientes.xne» y el Set dejaría de
        // responder por las vistas aplanadas ANIDADAS (este universo es el que consulta
        // `esVistaAplanada`).
        for (const f of ficherosDelProyecto(ruta, prof + 1)) salida.add(`/${entrada}${f}`);
      } else {
        salida.add("/" + ruta.slice(raiz.length + 1).split(sep).join("/"));
      }
    } catch {
      // Un enlace roto o un permiso no tumba el arranque; el agente vivirá sin ese fichero.
    }
  }
  return salida;
}

/**
 * Abre una sesión real: agente, checkpointer, hilo y tracker se construyen UNA vez aquí, y
 * viven en el cierre. Todo lo que sobreviva al primer turno tiene que salir de este cierre:
 * reconstruir el agente fuera (o un `MemorySaver` nuevo por llamada) tiraría la conversación.
 */
export async function abrirSesionReal(opciones: {
  raiz: string;
  modelos: ModelosPort;
  skills: SkillsPort;
  entorno: Entorno;
  /** Para las aprobaciones. Sin él, una escritura pendiente termina el turno diciéndolo. */
  pedirAprobacion?: (
    pendientes: PendienteDeAprobacion[],
    ficheros: Map<string, string>,
    diffs: Map<string, LineaDeDiff[]>
  ) => Promise<Map<string, Decision>>;
}): Promise<SesionReal> {
  const { raiz, entorno } = opciones;

  // Persiste fuera del checkpointer (que es solo de la sesión), pero no sobrescribe nunca
  // una memoria ya creada por el usuario o por otra sesión.
  asegurarMemoriaDeProyecto(raiz);

  const checkpointer = new MemorySaver();
  const tracker = createTokenTracker();
  const diagnostico = crearDiagnosticoDeTools(raiz);
  let modelos = opciones.modelos;
  let hilo = `xonecode-${randomUUID()}`;
  let cancelarEnCurso: (() => void) | undefined;
  let cerrada = false;

  const construir = async (): Promise<unknown> =>
    construirAgente({
      raiz,
      ficheros: ficherosDelProyecto(raiz),
      modelos,
      skills: opciones.skills,
      checkpointer: checkpointer,
      tracker,
      diagnostico,
    });

  let agente = await construir();

  /**
   * Los pendientes de aprobación, del ESTADO y no del resultado del stream.
   *
   * Se leen los crudos (`collectPending`) y no solo los traducidos, porque de ellos sale la
   * RUTA del fichero que se va a tocar (`ficheroDe`). Los argumentos NO se publican
   * —`write_file` lleva el contenido entero—, pero aprobar a ciegas es peor que no aprobar,
   * así que la ruta sí. Una sola llamada a `getState` para las dos cosas.
   */
  const leerPendientes = async (): Promise<{
    lista: PendienteDeAprobacion[];
    ficheros: Map<string, string>;
    diffs: Map<string, LineaDeDiff[]>;
  }> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const crudos = collectPending(await (agente as any).getState({
      configurable: { thread_id: hilo },
    }));
    const ficheros = new Map<string, string>();
    const diffs = new Map<string, LineaDeDiff[]>();
    for (const c of crudos) {
      const f = ficheroDe(c);
      if (f) ficheros.set(c.id, f);
      // El ANTES es el disco: el interrupt pausa ANTES de escribir. La ruta viene del
      // backend, que es relativo a la raíz del proyecto — y si no está en el disco, el
      // fichero es nuevo y su «antes» es la cadena vacía, no un error.
      const vista = cambioDe(c, (ruta) => {
        try {
          return readFileSync(resolve(raiz, ruta), "utf8");
        } catch {
          return "";
        }
      });
      if (vista) diffs.set(c.id, vista.lineas);
    }
    return { lista: crudos.map(aPendiente), ficheros, diffs };
  };

  /**
   * Un turno: foto del ANTES → stream con bucle de aprobación → diff contra esa foto.
   *
   * La foto es POR TURNO, no por sesión: con una sola, el diff del turno 3 incluiría lo que
   * escribió el turno 1.
   */
  const turno = async (
    peticion: string,
    piel: Piel
  ): Promise<{ bitacora: Bitacora; cambios: Cambio[]; cortadoPorTope: boolean }> => {
    // Un turno sobre una sesión ya cerrada reviviría un hilo que su dueño soltó al cambiar
    // de proyecto. Falla en vez de trabajar en silencio sobre la raíz equivocada.
    if (cerrada) throw new Error("la sesión ya está cerrada");
    const instantanea: Instantanea = await tomarInstantanea(raiz, entorno.git);

    let payload: unknown = { messages: [new HumanMessage(peticion)] };
    let bitacora = null as Awaited<ReturnType<typeof correrTurno>> | null;
    let ronda = 0;

    // El bucle de aprobación, tal como está en `correrReal` (`cli/run.ts`): una pausa
    // TERMINA la ronda, el interrupt queda en el estado, y se reanuda con un `Command`
    // con las decisiones — también con rejects, que si no se resumen dejan el interrupt
    // colgado para siempre y el modelo nunca llega a saber que se rechazó.
    let cortadoPorTope = false;

    while (true) {
      ronda += 1;
      const aborto = new AbortController();
      cancelarEnCurso = () => aborto.abort(new Error("turno cancelado por el usuario"));
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const stream = await (agente as any).stream(payload, {
          configurable: { thread_id: hilo },
          signal: aborto.signal,
          streamMode: ["updates", "messages"],
          subgraphs: true,
        });

        bitacora = await correrTurno(
          aEventos(
            stream,
            async () => (await leerPendientes()).lista,
            ({ nombre, detalle, parametros }) => diagnostico?.herramienta(nombre, detalle, parametros, tracker)
          ),
          piel,
          {
            avisos: (b) => (b.corrio("verify") ? [] : ["⚠ el verificador no ha corrido en este turno"]),
          }
        );
      } finally {
        cancelarEnCurso = undefined;
      }

      const { lista, ficheros, diffs } = await leerPendientes();
      if (lista.length === 0) break;

      // El tope existe porque un modelo que insiste tras cada rechazo convierte esto en un
      // ciclo automático de ~200k tokens por ronda (medido en da04). Sin resumir: nada se
      // aplica, pero el interrupt queda en el estado.
      if (ronda >= MAX_APPROVAL_ROUNDS) {
        piel.linea(`\n⚠ tope de ${MAX_APPROVAL_ROUNDS} rondas de aprobación agotado.`);
        piel.linea(`  quedaban ${lista.length} sin resolver, y NO se han aplicado.`);
        cortadoPorTope = true;
        break;
      }

      if (!opciones.pedirAprobacion) {
        piel.linea(`\n⏸  ${lista.length} escritura(s) piden aprobación, y no hay quién apruebe.`);
        piel.linea("   Nada se ha aprobado y nada se ha aplicado.");
        break;
      }

      const decisiones = await opciones.pedirAprobacion(lista, ficheros, diffs);
      payload = new Command({ resume: buildResume(decisiones) });
    }

    // El diff contra la foto de ESTE turno. Un turno que no tocó nada TIENE que verse igual.
    const cambios = await instantanea.cambios();
    // `cortadoPorTope` viaja en el retorno y no en la bitácora porque es lo que decide el
    // CÓDIGO DE SALIDA de quien invoca: un turno que se quedó con escrituras sin resolver
    // no es un éxito, y CI no puede leerlo como tal.
    return { bitacora: bitacora!, cambios, cortadoPorTope };
  };

  return {
    turno,
    cancelar: () => cancelarEnCurso?.(),
    cerrar: () => {
      cerrada = true;
      cancelarEnCurso?.();
    },
    /** Para `/modelo`: agente nuevo con los mismos hilo, checkpointer y tracker. */
    async cambiarModelos(nuevos: ModelosPort): Promise<void> {
      modelos = nuevos;
      agente = await construir();
    },
    /** Para `/nuevo`: solo cambia el hilo. El agente no se reconstruye. */
    nuevoHilo(id?: string): void {
      hilo = id ?? `xonecode-${randomUUID()}`;
    },
    tracker,
    get hilo(): string {
      return hilo;
    },
  };
}
