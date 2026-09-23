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
import { AgentThread, AgentThreadOrchestrator, EventType, ToolSet } from "@truefoundry/trueforge-core/core";
import { NOOP_AGENT_TRACING } from "@truefoundry/trueforge-core/core/tracing/NoopAgentTracing";
import type { DomainEvent, PendienteDeAprobacion } from "../../../core/events.js";
import type { ConsumoDeSesionPorCuenta, ModelosPort } from "../../../core/ports.js";
import { correrTurno, type Piel } from "../../../core/turno.js";
import { esRutaDeArtefacto, type Artefacto } from "../../../core/artefactos.js";
import type { LineaDeDiff } from "../../../core/diff.js";
import { createTokenTracker, type TokenTracker } from "../../../vendor/tokenTracking.js";
import { MAX_APPROVAL_ROUNDS, type Decision } from "../../../vendor/hitl.js";
import { backendDeAgente } from "../../grafo/proyecto.js";
import { permisosDe, TEXTO_HITL } from "../../grafo/perfiles.js";
import { cambioDe } from "../../turno/interrupts.js";
import { tomarInstantanea, type Cambio } from "../../turno/instantanea.js";
import { ficherosDelProyecto, type SesionReal } from "../../turno/turnoReal.js";
import type { Entorno } from "../../config/entorno.js";
import { modeloParaTrueforge } from "./modeloLangchain.js";
import { fuenteDeFicheros, TOOLS_QUE_ESCRIBEN, type BackendDeFicheros } from "./toolsDeFichero.js";
import { traducirEvento } from "./eventosTrueforge.js";

/** Quién pide las escrituras en este motor, para la tarjeta de aprobación. */
const ORIGEN = "trueforge";

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

  /** El árbol de hilos de UNA conversación. Se rehace con `nuevoHilo`. */
  const nuevoOrquestador = (): AgentThreadOrchestrator => {
    const raizDelArbol = new AgentThread({
      definition: { modelClient: llm, instruction: opciones.instrucciones },
      threadId: "main",
      title: "main",
      capabilities: [{ systemToolSets: [toolSet] }] as never,
      tracing: NOOP_AGENT_TRACING,
      logger,
    });
    return new AgentThreadOrchestrator({
      agentThreads: new Map([["main", raizDelArbol]]),
      // Sin subagentes en esta fase: pedir uno es un error que el motor devuelve al modelo.
      createDynamicSubAgentThread: async () => {
        throw new Error("este motor todavía no tiene subagentes");
      },
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
