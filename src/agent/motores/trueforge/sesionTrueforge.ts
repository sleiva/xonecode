/**
 * Una `SesionReal` con el motor de TrueForge debajo — la Fase 0 de
 * `docs/VARIANTE-TRUEFORGE-HARNESS.md`.
 *
 * Cumple el MISMO contrato que la de deepagents (`turno/turnoReal.ts#SesionReal`), así que la
 * consola —web, terminal, tareas— no sabe con cuál habla: los dos pintan eventos de dominio en la
 * misma `Piel`, aprueban por el mismo `pedirAprobacion` y devuelven los mismos `cambios`.
 *
 * **Lo que hay en esta fase, y lo que NO, dicho entero**:
 * - SÍ: el raíz como ORQUESTADOR de solo lectura y sin skills, y cada especialista como hijo
 *   sacado de su `.md` (prompt, skills, permisos, modelo; la shell solo quien la declara), sobre
 *   nuestro backend (`toolsDeFichero.ts`) y nuestro modelo (`modeloLangchain.ts`); la aprobación
 *   de cada escritura con su diff, devuelta al hilo que la pidió; el modo autónomo, los artefactos
 *   sin preguntar, la cancelación, los tokens y los cambios del turno.
 * - NO todavía: el verificador con su reparación, el juez y el crítico de pantalla,
 *   `xone_navegacion`/`regex_search` y la memoria del hilo en disco (vive en memoria: reabrir una
 *   sesión de este motor empieza la conversación de cero). Un turno que escribió lo DICE con un
 *   aviso, como hace el de deepagents cuando su verificador no corre.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import winston from "winston";
import { AgentThread, AgentThreadOrchestrator, EventType, ToolSet, dynamicSubAgents } from "@truefoundry/trueforge-core/core";
import { NOOP_AGENT_TRACING } from "@truefoundry/trueforge-core/core/tracing/NoopAgentTracing";
import type { DomainEvent, PendienteDeAprobacion } from "../../../core/events.js";
import type { ConsumoDeSesionPorCuenta, ModelosPort, SkillInfo } from "../../../core/ports.js";
import { correrTurno, type Piel } from "../../../core/turno.js";
import type { Artefacto } from "../../../core/artefactos.js";
import type { LineaDeDiff } from "../../../core/diff.js";
import { createTokenTracker, type TokenTracker } from "../../../vendor/tokenTracking.js";
import { MAX_APPROVAL_ROUNDS, type Decision } from "../../../vendor/hitl.js";
import { backendDeAgente, entornoDeLaShellDelProyecto } from "../../grafo/proyecto.js";
import { cargarAgentes } from "../../subagentes/agentesEnDisco.js";
import { fichaDeAgente, promptDeAgente, repartirSkills, type Agente } from "../../../core/agentes.js";
import { PERFIL_DEL_ORQUESTADOR, promptOrquestador } from "../../grafo/xoneAgent.js";
import { permisosDe, seDetieneEn, TEXTO_HITL } from "../../grafo/perfiles.js";
import { cambioDe } from "../../turno/interrupts.js";
import { tomarInstantanea, type Cambio } from "../../turno/instantanea.js";
import { ficherosDelProyecto, type SesionReal } from "../../turno/turnoReal.js";
import type { Entorno } from "../../config/entorno.js";
import { modeloParaTrueforge } from "./modeloLangchain.js";
import {
  fuenteDeEjecucion,
  fuenteDeFicheros,
  TOOLS_DE_LECTURA,
  TOOLS_QUE_ESCRIBEN,
  type BackendDeFicheros,
} from "./toolsDeFichero.js";
import { traducirEvento } from "./eventosTrueforge.js";
import { anuncioDeSkills } from "./skillsTrueforge.js";

/** Las tools que NO piden aprobación: las de lectura y la shell del conductor. */
const SIN_APROBACION = { enableTools: ["@all"], disableTools: [], preloadTools: [], requireApprovalForTools: [] };
/** Las que escriben PARAN el turno hasta que alguien decida, como el HITL de deepagents. */
const CON_APROBACION = { enableTools: ["@all"], disableTools: [], preloadTools: [], requireApprovalForTools: [...TOOLS_QUE_ESCRIBEN] };

/** El hilo raíz de TrueForge. Se llama así en la librería y no se elige. */
const HILO_RAIZ = "main";

/**
 * Lo que el orquestador tiene que saber para DELEGAR en ESTE motor. Su prompt es el de siempre
 * (`promptOrquestador`), que habla de `task` y de la ficha que va en su descripción: aquí la
 * delegación es `create_sub_agent` y no tiene descripción por especialista, así que se traduce
 * el nombre de la tool y las fichas van escritas aquí, con la MISMA función que deepagents.
 */
export function notaDeDelegacion(agentes: readonly Agente[]): string {
  if (agentes.length === 0) return "";
  return [
    "NOTA DEL HARNESS: en este entorno NO existe la tool `task`. Se delega con `create_sub_agent`:",
    "`name` es EXACTAMENTE el nombre del especialista y `input` el encargo, autosuficiente —el",
    "especialista no ve esta conversación—. Donde estas instrucciones dicen `task` o `subagent_type`,",
    "entiende `create_sub_agent` y `name`. Las fichas de los especialistas:",
    ...agentes.map((a) => `- ${a.nombre}: ${fichaDeAgente(a)}`),
  ].join("\n");
}

/**
 * Qué tools lleva un especialista, por lo que declara su `.md` — la MISMA partición que
 * deepagents (`perfiles.ts#toolsDe` y `montajeDeFicheros`):
 * - quien EJECUTA: lectura + `execute`, y nada de escribir (la shell no pasa por los permisos,
 *   así que el camino normal de tocar el proyecto sigue siendo el de la aprobación);
 * - quien solo lee: las seis SIN aprobación, porque `permisosDe` lo confina a lo que no es el
 *   proyecto —`/artefactos/` y `/planes/`, que es donde el analista deja su plan—: en deepagents
 *   `hitlDe` le devuelve `{}` por lo mismo;
 * - el resto: las seis, con `write_file`/`edit_file` pidiendo aprobación y `permisosDe` acotando
 *   (`escribeEn` incluido).
 */
export function clasesDeTools(agente: Pick<Agente, "soloLectura" | "ejecucion">): "ejecuta" | "lee" | "escribe" {
  if (agente.ejecucion === true) return "ejecuta";
  return agente.soloLectura ? "lee" : "escribe";
}

const TOOLS_QUE_TIENE: Record<ReturnType<typeof clasesDeTools>, string> = {
  ejecuta: "Tienes `ls`, `read_file`, `glob`, `grep` y `execute`; no puedes escribir ficheros del proyecto.",
  lee:
    "Tienes `ls`, `read_file`, `glob`, `grep`, `write_file` y `edit_file`, pero solo puedes escribir en " +
    "`/artefactos/` y `/planes/`: el proyecto no lo puedes tocar, y no puedes ejecutar comandos.",
  escribe:
    "Tienes `ls`, `read_file`, `glob`, `grep`, `write_file` y `edit_file`; cada escritura la aprueba una persona " +
    "viendo su diff, y no puedes ejecutar comandos.",
};

/** Un nombre que no es de ningún especialista: lectura a secas, sin escribir en ningún sitio. */
const TOOLS_DEL_GENERICO = "Tienes `ls`, `read_file`, `glob` y `grep`; no puedes escribir ficheros ni ejecutar comandos.";

export interface OpcionesDeSesionTrueforge {
  raiz: string;
  modelos: ModelosPort;
  entorno: Entorno;
  /**
   * El catálogo de skills de la sesión. OBLIGATORIO: sin él cada especialista se quedaría sin
   * el anuncio de las suyas y trabajaría como si no las tuviera, sin un error que leer — el
   * patrón de fallo del campo opcional.
   */
  skills: readonly SkillInfo[];
  pedirAprobacion?: (
    pendientes: PendienteDeAprobacion[],
    ficheros: Map<string, string>,
    diffs: Map<string, LineaDeDiff[]>
  ) => Promise<Map<string, Decision>>;
  /** El modo autónomo de la sesión, leído en CADA ronda (`core/modoDeEscritura.ts`). */
  sinAprobacion?: () => boolean;
  /** La carpeta de artefactos de la sesión (lo que el agente ve como `/artefactos/`). */
  artefactos?: string;
  hilo?: string;
  /** Tope de rondas de aprobación con alguien delante (el de la consola). */
  topeDeRondas?: number;
}

/** Una tool call que espera decisión: en QUÉ hilo, con qué id, y qué pide. */
interface Pendiente {
  clave: string;
  hilo: string;
  id: string;
  nombre: string;
  args: Record<string, unknown>;
}

const claveDe = (hilo: string, id: string): string => `${hilo}:${id}`;

export async function abrirSesionTrueforge(opciones: OpcionesDeSesionTrueforge): Promise<SesionReal> {
  const { raiz } = opciones;
  let modelos = opciones.modelos;
  const logger = winston.createLogger({ silent: true, transports: [] });
  const tracker: TokenTracker = createTokenTracker();
  const oyentes = new Set<() => void>();
  let aborto: AbortController | undefined;
  /** Se pidió cancelar ESTE turno. Hace falta además del `aborto`: entre dos rondas —mientras
   *  se espera una aprobación— no hay llamada en curso que abortar, y la ronda siguiente
   *  abriría un control nuevo y se llevaría la cancelación por delante. */
  let cancelado = false;
  let cerrada = false;
  let hilo = opciones.hilo ?? `tf-${Date.now()}`;
  const catalogo = opciones.skills;
  const disponibles = new Set(catalogo.map((s) => s.nombre));
  /** De quién es cada hilo, para que la tarjeta de aprobación diga QUIÉN quiere escribir. */
  const quienEs = new Map<string, string>([[HILO_RAIZ, PERFIL_DEL_ORQUESTADOR.nombre]]);

  /** Lo que el agente dejó en `/artefactos/` y aún no se ha anunciado: un artefacto se escribe
   *  SIN aprobación, así que tiene que ANUNCIARSE, como en deepagents. */
  const artefactosPorAnunciar: Artefacto[] = [];
  const montarBackend = (ejecucion?: { entorno: Record<string, string> }) =>
    backendDeAgente({
      raiz,
      ficheros: ficherosDelProyecto(raiz),
      ...(opciones.artefactos === undefined
        ? {}
        : { artefactos: { carpeta: opciones.artefactos, alEscribir: (a: Artefacto) => void artefactosPorAnunciar.push(a) } }),
      ...(ejecucion === undefined ? {} : { ejecucion }),
    });
  const backend = montarBackend() as unknown as BackendDeFicheros;

  /**
   * **El raíz es el ORQUESTADOR, de solo lectura y SIN skills** — la regla de deepagents
   * (`xoneAgent.ts`): los subagentes no heredan las skills del orquestador, cada uno recibe
   * las de su `.md`. Lee para orientarse y contestar lo que se contesta mirando; todo lo que
   * escribe o ejecuta lo delega. Solo los de motor `modelo`: a uno externo no se le puede
   * delegar desde aquí, y ofrecerlo sería un botón muerto que pulsa el modelo.
   */
  const especialistas = (): Agente[] => cargarAgentes(raiz).agentes.filter((a) => a.motor === "modelo");
  const toolsDelRaiz = new ToolSet({
    source: fuenteDeFicheros({ backend, reglas: permisosDe(PERFIL_DEL_ORQUESTADOR), tools: TOOLS_DE_LECTURA }) as never,
    selectors: SIN_APROBACION,
    preload: true,
  });
  const llm = modeloParaTrueforge({ modelo: () => modelos.paraPapel("trabajo"), senal: () => aborto?.signal });

  /**
   * El hilo de un subagente, sacado de SU `.md`: su prompt, SUS skills, sus permisos y su
   * modelo. TrueForge no tiene subagentes con nombre ni deja poner prompt propio a un hijo —su
   * identidad fija dice además que tiene «las mismas tools que el padre», que aquí no es
   * verdad—, así que las instrucciones van en su primer mensaje, CORRIGIENDO esa frase, y el
   * encargo detrás. Un nombre que no es de ningún especialista da un hijo genérico de SOLO
   * LECTURA y sin shell: un nombre inventado no tumba el turno ni se lleva la escritura.
   */
  const crearHijo = async (params: {
    request: { name: string; input: string };
    threadId: string;
    parent: unknown;
  }): Promise<AgentThread> => {
    const agente = especialistas().find((a) => a.nombre === params.request.name);
    quienEs.set(params.threadId, agente?.nombre ?? params.request.name);
    const clase = agente === undefined ? "lee" : clasesDeTools(agente);
    const reglas = permisosDe(agente ?? { nombre: params.request.name, soloLectura: true });
    const tools: unknown[] = [];
    if (clase === "escribe") {
      tools.push(new ToolSet({ source: fuenteDeFicheros({ backend, reglas }) as never, selectors: CON_APROBACION, preload: true }));
    } else if (clase === "lee" && agente !== undefined) {
      tools.push(new ToolSet({ source: fuenteDeFicheros({ backend, reglas }) as never, selectors: SIN_APROBACION, preload: true }));
    } else {
      tools.push(
        new ToolSet({ source: fuenteDeFicheros({ backend, reglas, tools: TOOLS_DE_LECTURA }) as never, selectors: SIN_APROBACION, preload: true })
      );
    }
    if (clase === "ejecuta") {
      const conShell = montarBackend({ entorno: entornoDeLaShellDelProyecto(raiz, opciones.artefactos) }) as unknown as {
        execute(c: string): unknown;
      };
      tools.push(new ToolSet({ source: fuenteDeEjecucion(conShell) as never, selectors: SIN_APROBACION, preload: true }));
    }
    const nota = `NOTA DEL HARNESS: aunque tu identidad diga lo contrario, NO tienes las mismas tools que quien te delega. ${
      agente === undefined ? TOOLS_DEL_GENERICO : TOOLS_QUE_TIENE[clase]
    }`;
    const instrucciones =
      agente === undefined
        ? `${nota} Contesta con lo que encuentres y dónde.`
        : [promptDeAgente(agente, repartirSkills(agente, disponibles)), "", nota, anuncioDeSkills(agente, catalogo)]
            .filter((l) => l !== undefined)
            .join("\n")
            .trimEnd();
    const papel = agente?.soloLectura === true ? "rapido" : "trabajo";
    return new AgentThread({
      definition: {
        modelClient: modeloParaTrueforge({
          modelo: () =>
            agente?.modelo === undefined ? modelos.paraPapel(papel, agente?.esfuerzo) : modelos.paraModelo(agente.modelo, agente.esfuerzo),
          senal: () => aborto?.signal,
        }),
        messages: [{ role: "user", content: `${instrucciones}\n\nENCARGO:\n${params.request.input}` }] as never,
      },
      threadId: params.threadId,
      title: params.request.name,
      parent: params.parent as never,
      agentInfo: { type: "dynamic", ...params.request } as never,
      capabilities: [{ systemToolSets: tools }] as never,
      tracing: NOOP_AGENT_TRACING,
      logger,
    });
  };

  /** El árbol de hilos de UNA conversación. Se rehace con `nuevoHilo`. */
  const nuevoOrquestador = (): AgentThreadOrchestrator => {
    const raizDelArbol = new AgentThread({
      definition: {
        modelClient: llm,
        instruction: [promptOrquestador(especialistas()), notaDeDelegacion(especialistas())].filter((l) => l !== "").join("\n\n"),
      },
      threadId: HILO_RAIZ,
      title: HILO_RAIZ,
      capabilities: [
        { systemToolSets: [toolsDelRaiz] },
        // `create_sub_agent`: la delegación de TrueForge, un nivel y cinco a la vez como mucho.
        dynamicSubAgents({ sandboxAvailable: false, tracing: NOOP_AGENT_TRACING }),
      ] as never,
      tracing: NOOP_AGENT_TRACING,
      logger,
    });
    return new AgentThreadOrchestrator({
      agentThreads: new Map([[HILO_RAIZ, raizDelArbol]]),
      createDynamicSubAgentThread: async (params) =>
        crearHijo(params as unknown as { request: { name: string; input: string }; threadId: string; parent: unknown }),
      tracing: NOOP_AGENT_TRACING,
      logger,
    });
  };
  let orquestador = nuevoOrquestador();

  const avisar = (): void => {
    for (const o of oyentes) o();
  };

  /**
   * Lo que el orquestador dice al ejecutar, traducido; y lo que pidió aprobar al terminar.
   *
   * **Una aprobación se devuelve al hilo que la PIDIÓ.** Con subagentes que escriben, la
   * `write_file` la pide el hijo, y el orquestador de TrueForge reparte las decisiones por
   * `thread_id`: mandarla al raíz no la contestaría —o la rechazaría por hilo desconocido—.
   * Por eso las tool calls se apuntan por hilo Y por id: dos hijos pueden repetir id.
   */
  async function* paso(lote: unknown[], senal: AbortSignal, pendientes: Pendiente[]): AsyncGenerator<DomainEvent> {
    for await (const _ of orquestador.send(lote as never)) void _;
    const llamadas = new Map<string, { nombre: string; args: Record<string, unknown> }>();
    const it = orquestador.execute({ signal: senal });
    let r = await it.next();
    while (!r.done) {
      const evento = r.value as { type?: string; thread_id?: string; output?: unknown };
      const deHilo = evento.thread_id ?? HILO_RAIZ;
      if (evento.type === "internal.agent.context.append" && Array.isArray(evento.output)) {
        for (const m of evento.output) {
          for (const t of (m as { tool_calls?: { id: string; function: { name: string; arguments: string } }[] }).tool_calls ?? []) {
            let args: Record<string, unknown> = {};
            try {
              args = JSON.parse(t.function.arguments) as Record<string, unknown>;
            } catch {
              args = {};
            }
            llamadas.set(claveDe(deHilo, t.id), { nombre: t.function.name, args });
          }
        }
      }
      const { eventos, uso } = traducirEvento(evento);
      if (uso !== undefined) {
        // Los tokens de TODOS los hilos se gastaron, así que todos cuentan. La VENTANA es otra
        // pregunta —cuánto ocupa la conversación—, y esa es la del raíz: la de un hijo es la de
        // un encargo que muere con él.
        tracker.input += uso.input;
        tracker.output += uso.output;
        tracker.cache += uso.cache;
        tracker.calls += 1;
        if (deHilo === HILO_RAIZ) tracker.contexto = uso.input;
        avisar();
      }
      yield* eventos;
      while (artefactosPorAnunciar.length > 0) yield { tipo: "artefacto", artefacto: artefactosPorAnunciar.shift()! };
      r = await it.next();
    }
    const resultado = r.value as { required_actions?: { type?: string; thread_id?: string; tool_calls?: { id: string }[] }[] };
    for (const accion of resultado.required_actions ?? []) {
      if (accion.type !== "tool.approval_required") continue;
      const deHilo = accion.thread_id ?? HILO_RAIZ;
      for (const { id } of accion.tool_calls ?? []) {
        const clave = claveDe(deHilo, id);
        const llamada = llamadas.get(clave);
        if (llamada !== undefined) pendientes.push({ clave, hilo: deHilo, id, ...llamada });
      }
    }
  }

  return {
    get tracker() {
      return tracker;
    },
    get hilo() {
      return hilo;
    },
    async turno(peticion: string, piel: Piel) {
      if (cerrada) throw new Error("la sesión está cerrada");
      const t0 = Date.now();
      cancelado = false;
      const instantanea = await tomarInstantanea(raiz, opciones.entorno.git);
      const tope = opciones.topeDeRondas ?? MAX_APPROVAL_ROUNDS;
      const aplicadasSinPreguntar: string[] = [];
      let escribio = false;
      let cortadoPorTope = false;
      let sinResolver = 0;

      async function* flujo(): AsyncGenerator<DomainEvent> {
        let lote: unknown[] = [{ type: EventType.USER_MESSAGE, content: peticion }];
        let rondas = 0;
        while (true) {
          if (cancelado || cerrada) return;
          aborto = new AbortController();
          const senal = aborto.signal;
          const pendientes: Pendiente[] = [];
          yield* paso(lote, senal, pendientes);
          if (pendientes.length === 0) return;

          const leer = (ruta: string): string => {
            try {
              return readFileSync(join(raiz, ruta), "utf8");
            } catch {
              return "";
            }
          };
          // Todo va por la CLAVE (hilo + id): es lo que viaja a la tarjeta y lo que vuelve.
          const decisiones = new Map<string, Decision>();
          const humanos: PendienteDeAprobacion[] = [];
          const ficheros = new Map<string, string>();
          const diffs = new Map<string, LineaDeDiff[]>();
          const autonomo = opciones.sinAprobacion?.() === true;
          for (const p of pendientes) {
            const ruta = typeof p.args.file_path === "string" ? p.args.file_path : "";
            // Lo que NO es el proyecto —artefactos y planes— y lo que el backend va a rechazar de
            // todas formas no se pregunta: la MISMA función que el HITL de deepagents.
            if (!seDetieneEn({ toolCall: { args: p.args } })) {
              decisiones.set(p.clave, { type: "approve" });
            } else if (autonomo) {
              decisiones.set(p.clave, { type: "approve" });
              aplicadasSinPreguntar.push(ruta);
            } else {
              humanos.push({
                id: p.clave,
                origen: quienEs.get(p.hilo) ?? p.hilo,
                descripcion: `quiere ${TEXTO_HITL[p.nombre] ?? p.nombre}`,
                decisionesPermitidas: ["approve", "reject"],
              });
              ficheros.set(p.clave, ruta);
              const vista = cambioDe({ id: p.clave, tool: p.nombre, args: p.args, description: "", allowedDecisions: [] }, leer);
              if (vista !== undefined) diffs.set(p.clave, vista.lineas);
            }
          }

          if (humanos.length > 0) {
            rondas += 1;
            yield { tipo: "pausa", pendientes: humanos };
            if (opciones.pedirAprobacion === undefined || rondas > tope) {
              // Nadie a quien preguntar, o se agotó el tope: lo que no se decide NO se aplica.
              cortadoPorTope = rondas > tope;
              sinResolver = humanos.length;
              return;
            }
            const respuesta = await opciones.pedirAprobacion(humanos, ficheros, diffs);
            if (cancelado || cerrada) {
              // Cancelado mientras se decidía: no se aplica nada de lo que estaba en la mesa.
              sinResolver = humanos.length;
              return;
            }
            for (const h of humanos) decisiones.set(h.id, respuesta.get(h.id) ?? { type: "reject" });
          }
          if ([...decisiones.values()].some((d) => d.type === "approve")) escribio = true;
          lote = pendientes.map((p) => ({ p, d: decisiones.get(p.clave) ?? ({ type: "reject" } as Decision) })).map(({ p, d }) => ({
            type: "user.tool_approval",
            thread_id: p.hilo,
            tool_call_id: p.id,
            approval: d.type === "approve" ? { status: "allow" } : { status: "deny", reason: d.message ?? "rechazado por el usuario" },
          }));
        }
      }

      let bitacora;
      try {
        bitacora = await correrTurno(flujo(), piel, {
          avisos: () => [
            // El verificador no corre todavía en este motor: si el turno ESCRIBIÓ, se dice.
            ...(escribio ? ["⚠ el verificador no ha corrido en este turno (el motor TrueForge aún no lo integra)"] : []),
            ...(aplicadasSinPreguntar.length === 0
              ? []
              : [`⚠ ${aplicadasSinPreguntar.length} escritura(s) aplicadas SIN aprobación: ${aplicadasSinPreguntar.join(", ")} — esta sesión va en modo autónomo`]),
          ],
          desde: t0,
        });
      } finally {
        aborto = undefined;
      }
      const cambios: Cambio[] = await instantanea.cambios();
      return { bitacora, cambios, cortadoPorTope, verificador: "no-corrio" as const, pendientes: sinResolver };
    },
    async cambiarModelos(nuevos: ModelosPort) {
      // El ILLM pide el modelo en cada llamada, así que basta con cambiar a quién se lo pide:
      // el hilo sigue entero.
      modelos = nuevos;
    },
    nuevoHilo(id?: string) {
      hilo = id ?? `tf-${Date.now()}`;
      orquestador = nuevoOrquestador();
    },
    cancelar() {
      cancelado = true;
      aborto?.abort(new Error("turno cancelado por el usuario"));
    },
    consumo(): ConsumoDeSesionPorCuenta {
      return {
        modelo: { entrada: tracker.input, salida: tracker.output, cache: tracker.cache },
        externo: { entrada: 0, salida: 0, cache: 0 },
        contexto: tracker.contexto,
      };
    },
    alCambiarConsumo(oyente: () => void) {
      oyentes.add(oyente);
      return () => oyentes.delete(oyente);
    },
    cerrar() {
      cerrada = true;
      aborto?.abort(new Error("sesión cerrada"));
    },
  } as SesionReal;
}
