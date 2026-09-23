/**
 * Una `SesionReal` con el motor de TrueForge debajo — la Fase 0 de
 * `docs/VARIANTE-TRUEFORGE-HARNESS.md`.
 *
 * Cumple el MISMO contrato que la de deepagents (`turno/turnoReal.ts#SesionReal`), así que la
 * consola —web, terminal, tareas— no sabe con cuál habla: los dos pintan eventos de dominio en la
 * misma `Piel`, aprueban por el mismo `pedirAprobacion` y devuelven los mismos `cambios`.
 *
 * **Lo que hay en esta fase, y lo que NO, dicho entero**:
 * - SÍ: el agente raíz con las seis tools de fichero sobre nuestro backend (`toolsDeFichero.ts`),
 *   nuestro modelo (`modeloLangchain.ts`), la aprobación de cada escritura con su diff, el modo
 *   autónomo, los artefactos sin preguntar, la cancelación, los tokens y los cambios del turno.
 * - NO todavía: subagentes, el verificador con su reparación, el juez y el crítico de pantalla,
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
import type { ConsumoDeSesionPorCuenta, ModelosPort } from "../../../core/ports.js";
import { correrTurno, type Piel } from "../../../core/turno.js";
import { esRutaDeArtefacto, type Artefacto } from "../../../core/artefactos.js";
import type { LineaDeDiff } from "../../../core/diff.js";
import { createTokenTracker, type TokenTracker } from "../../../vendor/tokenTracking.js";
import { MAX_APPROVAL_ROUNDS, type Decision } from "../../../vendor/hitl.js";
import { backendDeAgente, entornoDeLaShellDelProyecto } from "../../grafo/proyecto.js";
import { cargarAgentes } from "../../subagentes/agentesEnDisco.js";
import { promptDeAgente, type Agente } from "../../../core/agentes.js";
import { permisosDe, TEXTO_HITL } from "../../grafo/perfiles.js";
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

/** Quién pide las escrituras en este motor, para la tarjeta de aprobación. */
const ORIGEN = "trueforge";

/** Las tools que NO piden aprobación: las de lectura y la shell del conductor. */
const SIN_APROBACION = { enableTools: ["@all"], disableTools: [], preloadTools: [], requireApprovalForTools: [] };

/**
 * Lo que el agente raíz tiene que saber para DELEGAR: que no tiene shell y a quién se le pide lo
 * que se hace en un aparato. Sin esto, «lanza el hotswap» se contestaba con «no puedo ejecutar».
 */
function instruccionDeDelegar(conductor: Agente | undefined): string {
  if (conductor === undefined) return "No tienes shell ni un subagente que ejecute comandos: si te piden algo en un dispositivo, dilo.";
  return (
    `No tienes shell. Todo lo que haya que hacer en un dispositivo o emulador —desplegar, hotswap, lanzar la app, ` +
    `capturas, logs— lo DELEGAS con \`create_sub_agent\` usando exactamente \`name: "${conductor.nombre}"\` y un encargo ` +
    `autosuficiente: qué pantalla o colección tiene que alcanzar y qué comprobar. Es el único que ejecuta comandos.`
  );
}

export interface OpcionesDeSesionTrueforge {
  raiz: string;
  modelos: ModelosPort;
  entorno: Entorno;
  /** El prompt del agente raíz: las reglas de XOne y su papel. TrueForge lo envuelve con su
   *  propia identidad, que no se puede quitar. */
  instrucciones: string;
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

  /** Lo que el agente dejó en `/artefactos/` y aún no se ha anunciado: un artefacto se escribe
   *  SIN aprobación, así que tiene que ANUNCIARSE, como en deepagents. */
  const artefactosPorAnunciar: Artefacto[] = [];
  const backend = backendDeAgente({
    raiz,
    ficheros: ficherosDelProyecto(raiz),
    ...(opciones.artefactos === undefined
      ? {}
      : { artefactos: { carpeta: opciones.artefactos, alEscribir: (a: Artefacto) => void artefactosPorAnunciar.push(a) } }),
  }) as unknown as BackendDeFicheros;
  const toolSet = new ToolSet({
    source: fuenteDeFicheros({ backend, reglas: permisosDe({ nombre: ORIGEN, soloLectura: false }) }) as never,
    // Las que escriben PARAN el turno hasta que alguien decida, como el HITL de deepagents.
    selectors: { enableTools: ["@all"], disableTools: [], preloadTools: [], requireApprovalForTools: [...TOOLS_QUE_ESCRIBEN] },
    preload: true,
  });
  const llm = modeloParaTrueforge({ modelo: () => modelos.paraPapel("trabajo"), senal: () => aborto?.signal });

  /**
   * **El que EJECUTA es un subagente, y es el único con shell** —la regla de deepagents, que aquí
   * se conserva—: una shell no pasa por `permisosDe` ni por la aprobación, así que no se le da al
   * agente raíz, que escribe el proyecto. Es el `.md` con `ejecucion: true` (hoy el
   * `device-controller`), con su prompt, sus tools de LECTURA y `execute` sobre el mismo backend
   * que le monta deepagents.
   */
  const conductor = (): Agente | undefined => cargarAgentes(raiz).agentes.find((a) => a.ejecucion === true);

  /**
   * El hilo de un subagente. TrueForge no tiene subagentes con nombre ni deja poner prompt propio a
   * un hijo —su identidad fija dice además que tiene «las mismas tools que el padre», que aquí no es
   * verdad—, así que las instrucciones van en su primer mensaje, CORRIGIENDO esa frase, y el encargo
   * detrás. Un nombre que no es el del conductor da un hijo genérico de SOLO LECTURA y sin shell:
   * un nombre inventado no tumba el turno ni se lleva la shell.
   */
  const crearHijo = async (params: {
    request: { name: string; input: string };
    threadId: string;
    parent: unknown;
  }): Promise<AgentThread> => {
    const elConductor = conductor();
    const esElConductor = elConductor !== undefined && params.request.name === elConductor.nombre;
    const lectura = fuenteDeFicheros({ backend, reglas: permisosDe({ nombre: params.request.name, soloLectura: true }), tools: TOOLS_DE_LECTURA });
    const tools: unknown[] = [new ToolSet({ source: lectura as never, selectors: SIN_APROBACION, preload: true })];
    let instrucciones: string;
    if (esElConductor) {
      const carpeta = opciones.artefactos;
      const conShell = backendDeAgente({
        raiz,
        ficheros: ficherosDelProyecto(raiz),
        ...(carpeta === undefined
          ? {}
          : { artefactos: { carpeta, alEscribir: (a: Artefacto) => void artefactosPorAnunciar.push(a) } }),
        ejecucion: { entorno: entornoDeLaShellDelProyecto(raiz, carpeta) },
      }) as unknown as { execute(c: string): unknown };
      tools.push(new ToolSet({ source: fuenteDeEjecucion(conShell) as never, selectors: SIN_APROBACION, preload: true }));
      const skills = elConductor.skills.map((s) => `/skills/${s}/SKILL.md`).join(", ");
      instrucciones = [
        promptDeAgente(elConductor, { suyas: [], faltan: [] }),
        "",
        "NOTA DEL HARNESS: aunque tu identidad diga lo contrario, NO tienes las mismas tools que quien te " +
          "delega. Tienes `ls`, `read_file`, `glob`, `grep` y `execute`; no puedes escribir ficheros del proyecto.",
        ...(skills === "" ? [] : [`Tus skills están en ${skills}: léelas con read_file antes de usar sus scripts.`]),
      ].join("\n");
    } else {
      instrucciones =
        "NOTA DEL HARNESS: eres un subagente de SOLO LECTURA. Tienes `ls`, `read_file`, `glob` y `grep`; " +
        "no puedes escribir ficheros ni ejecutar comandos. Contesta con lo que encuentres y dónde.";
    }
    const modelo = esElConductor && elConductor.modelo !== undefined ? elConductor.modelo : undefined;
    return new AgentThread({
      definition: {
        modelClient: modeloParaTrueforge({
          modelo: () => (modelo === undefined ? modelos.paraPapel("trabajo") : modelos.paraModelo(modelo)),
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
      definition: { modelClient: llm, instruction: `${opciones.instrucciones}\n\n${instruccionDeDelegar(conductor())}` },
      threadId: "main",
      title: "main",
      capabilities: [
        { systemToolSets: [toolSet] },
        // `create_sub_agent`: la delegación de TrueForge, un nivel y cinco a la vez como mucho.
        dynamicSubAgents({ sandboxAvailable: false, tracing: NOOP_AGENT_TRACING }),
      ] as never,
      tracing: NOOP_AGENT_TRACING,
      logger,
    });
    return new AgentThreadOrchestrator({
      agentThreads: new Map([["main", raizDelArbol]]),
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

  /** Lo que el orquestador dice al ejecutar, traducido; y lo que pidió aprobar al terminar. */
  async function* paso(lote: unknown[], senal: AbortSignal, acciones: { pendientes: { id: string; nombre: string; args: Record<string, unknown> }[] }): AsyncGenerator<DomainEvent> {
    for await (const _ of orquestador.send(lote as never)) void _;
    const llamadas = new Map<string, { nombre: string; args: Record<string, unknown> }>();
    const it = orquestador.execute({ signal: senal });
    let r = await it.next();
    while (!r.done) {
      const evento = r.value as { type?: string; output?: unknown };
      // Las tool calls de este paso, por id: es lo que dice QUÉ se pide aprobar.
      if (evento.type === "internal.agent.context.append" && Array.isArray(evento.output)) {
        for (const m of evento.output) {
          for (const t of (m as { tool_calls?: { id: string; function: { name: string; arguments: string } }[] }).tool_calls ?? []) {
            let args: Record<string, unknown> = {};
            try {
              args = JSON.parse(t.function.arguments) as Record<string, unknown>;
            } catch {
              args = {};
            }
            llamadas.set(t.id, { nombre: t.function.name, args });
          }
        }
      }
      const { eventos, uso } = traducirEvento(evento);
      if (uso !== undefined) {
        tracker.input += uso.input;
        tracker.output += uso.output;
        tracker.cache += uso.cache;
        tracker.calls += 1;
        tracker.contexto = uso.input;
        avisar();
      }
      yield* eventos;
      while (artefactosPorAnunciar.length > 0) yield { tipo: "artefacto", artefacto: artefactosPorAnunciar.shift()! };
      r = await it.next();
    }
    const resultado = r.value as { required_actions?: { type?: string; tool_calls?: { id: string }[] }[] };
    for (const accion of resultado.required_actions ?? []) {
      if (accion.type !== "tool.approval_required") continue;
      for (const { id } of accion.tool_calls ?? []) {
        const llamada = llamadas.get(id);
        if (llamada !== undefined) acciones.pendientes.push({ id, ...llamada });
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
          const acciones = { pendientes: [] as { id: string; nombre: string; args: Record<string, unknown> }[] };
          yield* paso(lote, senal, acciones);
          if (acciones.pendientes.length === 0) return;

          const leer = (ruta: string): string => {
            try {
              return readFileSync(join(raiz, ruta), "utf8");
            } catch {
              return "";
            }
          };
          const decisiones = new Map<string, Decision>();
          const humanos: PendienteDeAprobacion[] = [];
          const ficheros = new Map<string, string>();
          const diffs = new Map<string, LineaDeDiff[]>();
          const autonomo = opciones.sinAprobacion?.() === true;
          for (const p of acciones.pendientes) {
            const ruta = typeof p.args.file_path === "string" ? p.args.file_path : "";
            if (esRutaDeArtefacto(ruta)) {
              decisiones.set(p.id, { type: "approve" });
            } else if (autonomo) {
              decisiones.set(p.id, { type: "approve" });
              aplicadasSinPreguntar.push(ruta);
            } else {
              const pendiente: PendienteDeAprobacion = {
                id: p.id,
                origen: ORIGEN,
                descripcion: `quiere ${TEXTO_HITL[p.nombre] ?? p.nombre}`,
                decisionesPermitidas: ["approve", "reject"],
              };
              humanos.push(pendiente);
              ficheros.set(p.id, ruta);
              const vista = cambioDe({ id: p.id, tool: p.nombre, args: p.args, description: "", allowedDecisions: [] }, leer);
              if (vista !== undefined) diffs.set(p.id, vista.lineas);
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
          lote = [...decisiones.entries()].map(([id, d]) => ({
            type: "user.tool_approval",
            thread_id: "main",
            tool_call_id: id,
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
