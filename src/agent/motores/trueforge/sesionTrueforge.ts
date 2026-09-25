/**
 * Una `SesionReal` con el motor de TrueForge debajo — la Fase 0 de
 * `docs/VARIANTE-TRUEFORGE-HARNESS.md`.
 *
 * Cumple el MISMO contrato que la de deepagents (`turno/sesionReal.ts`), así que la
 * consola —web, terminal, tareas— no sabe con cuál habla: los dos pintan eventos de dominio en la
 * misma `Piel`, aprueban por el mismo `pedirAprobacion` y devuelven los mismos `cambios`.
 *
 * **Lo que hay, y lo que NO, dicho entero**:
 * - SÍ: el raíz como ORQUESTADOR de solo lectura y sin skills, y cada especialista como hijo
 *   sacado de su `.md` (prompt, skills, permisos, modelo; la shell solo quien la declara), sobre
 *   nuestro backend (`toolsDeFichero.ts`) y nuestro modelo (`modeloLangchain.ts`); las tools
 *   propias adaptadas (`toolsPropias.ts`: `xone_navegacion`, `regex_search`, la crítica visual…);
 *   los recortes de deepagents y la compactación del raíz (`recortes.ts`); la aprobación de cada
 *   escritura con su diff, devuelta al hilo que la pidió; el verificador con su reparación, con
 *   las reglas compartidas de `turno/verificacion.ts`; el modo autónomo, los artefactos sin
 *   preguntar, la cancelación, los tokens y los cambios del turno.
 *   Y la memoria en disco: la foto del raíz se guarda al final de cada turno y reabrir la sesión
 *   continúa la conversación (`memoriaTrueforge.ts`).
 *   Y además: los hechos del proyecto delante de cada turno, el juez del turno y el crítico de
 *   pantalla enganchados al final, la pregunta del orquestador también como dato para la tarjeta,
 *   y Claude Code, Codex y OpenCode como hijos por el mismo puerto que deepagents
 *   (`modeloExterno.ts`).
 * - NO: un presupuesto GLOBAL por turno (la suma de todos los hilos), que deepagents tampoco tiene.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import winston from "winston";
import { AgentThread, AgentThreadOrchestrator, EventType, NOOP_AGENT_TRACING, askUserQuestion, contextCompaction, dynamicSubAgents } from "./trueforge.js";
import { TOPE_DE_LLAMADAS_DEL_CONDUCTOR, TOPE_DE_LLAMADAS_DEL_ESPECIALISTA, UMBRAL_RESUMEN_TOKENS } from "../../turno/resumenDeContexto.js";
import type { DomainEvent, HallazgoDelTurno, PendienteDeAprobacion } from "../../../core/events.js";
import type {
  ConsumoDeSesion,
  ConsumoDeSesionPorCuenta,
  ModelosPort,
  MotorExterno,
  SkillInfo,
  SubagenteExternoPort,
  VerifierPort,
} from "../../../core/ports.js";
import { crearSubagenteExterno } from "../../subagentes/subagenteExterno.js";
import { inventarioDelProyecto, opcionesDeSubagenteExterno } from "../../subagentes/escrituraExterna.js";
import { sumarConsumo, SIN_CONSUMO } from "../../subagentes/consumoExterno.js";
import { ColaDeEventos, entrelazar } from "../../../core/entrelazar.js";
import { modeloExternoParaTrueforge } from "./modeloExterno.js";
import { diferenciasDelContraste, metricasDeTrueforge } from "./metricasTrueforge.js";
import { cambiosQueSeVerifican, huellaDeErrores, repartirHallazgos, textoDeReparacion, tocaCriticarPantalla, TOPE_REPARACIONES } from "../../turno/verificacion.js";
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
import { ficherosDelProyecto } from "../../turno/ficherosDelProyecto.js";
import type { SesionReal } from "../../turno/sesionReal.js";
import { accionDelJuez, type HechosDelTurno, type VeredictoDelTurno } from "../../../core/juezDelTurno.js";
import type { Entorno } from "../../config/entorno.js";
import { modeloParaTrueforge } from "./modeloLangchain.js";
import { TOOLS_DE_LECTURA, type BackendDeFicheros } from "./toolsDeFichero.js";
import { topeAgotadoDe, traducirEvento, type PensamientoPorHilo } from "./eventosTrueforge.js";
import { anuncioDeSkills } from "./skillsTrueforge.js";
import {
  capabilitiesDe,
  capacidadDeFecha,
  capacidadDeFicheros,
  capacidadDeInstrucciones,
  capacidadDePropias,
  capacidadDeRecortes,
  capacidadesDelEspecialista,
  clasesDeTools,
  toolsDe,
} from "./capacidades.js";
import { crearDiagnosticoDeTools, type DiagnosticoDeTools } from "../../turno/diagnosticoDeTools.js";
import { encenderTrazaDeErrores } from "../../trazaDeErroresEnDisco.js";
import { entornoConDepuracion } from "../../turno/depuracion.js";
import { detalleDe, parametrosDe } from "../../turno/resumenDeTool.js";
import { apartarMemoria, cargarMemoria, fotoSaneada, guardarMemoria, textoDeMemoriaDescartada, type FotoDeHilo } from "./memoriaTrueforge.js";
import type { ToolDeLangchain } from "./toolsPropias.js";
import { crearNavegacionXone } from "../../grafo/navegacionXone.js";
import { hechosDelProyectoDe } from "../../navegacion/hechosEnDisco.js";
import { conHechosDelProyecto } from "../../../core/hechosDelProyecto.js";
import { crearBusquedaRegex } from "../../grafo/busquedaRegex.js";
import { crearCopiarArtefacto } from "../../grafo/copiarArtefacto.js";
import { crearUnirSecciones } from "../../grafo/unirSecciones.js";
import { crearCriticaVisual } from "../../grafo/criticaVisual.js";
import { crearTraerDeLaMaquina } from "../../grafo/traerDeLaMaquina.js";
import { invocarVisualConModelos } from "../../dispositivos/juezVisual.js";
import { estilosDeDisco, indiceEnDisco, type CargarIndice } from "../../navegacion/indiceEnDisco.js";

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

/** Lo que cada clase NO puede hacer, que la lista de tools no dice sola. */
const LIMITES_DE: Record<ReturnType<typeof clasesDeTools>, string> = {
  ejecuta: "No puedes escribir ficheros del proyecto.",
  lee: "Solo puedes escribir en `/artefactos/` y `/planes/`: el proyecto no lo puedes tocar, y no puedes ejecutar comandos.",
  escribe: "Cada escritura la aprueba una persona viendo su diff, y no puedes ejecutar comandos.",
};

/**
 * La frase de las tools que TIENE, sacada de los nombres que de verdad se le montan: escrita a
 * mano se quedaba vieja en cuanto se añadía una —la nota decía cuatro y el modelo veía seis—.
 */
export function notaDeTools(nombres: readonly string[], limite: string): string {
  return `NOTA DEL HARNESS: aunque tu identidad diga lo contrario, NO tienes las mismas tools que quien te delega. Tienes ${nombres
    .map((n) => `\`${n}\``)
    .join(", ")}. ${limite}`;
}

/** Un nombre que no es de ningún especialista: lectura a secas, sin escribir en ningún sitio. */
const LIMITE_DEL_GENERICO = "No puedes escribir ficheros ni ejecutar comandos.";

/**
 * La pregunta del orquestador, como TEXTO del chat: la pregunta y sus opciones numeradas. Se pinta
 * en la respuesta y no en un diálogo, a propósito: así llega igual a la web, a la TUI y al terminal
 * sin tocar ninguna piel, y la persona contesta como contesta siempre, escribiendo.
 */
export function textoDePregunta(args: Record<string, unknown>): string {
  const { pregunta, opciones } = consultaDe(args);
  return [
    "\n\n" + pregunta,
    ...(opciones.length === 0 ? [] : ["", ...opciones.map((o, i) => `${i + 1}. ${o}`), "", "Contesta con el número o con tus palabras."]),
  ].join("\n");
}

/**
 * La pregunta y sus opciones como DATO (`events.ts#consulta`), de los argumentos que mandó el
 * modelo: una sola lectura para el texto, la tarjeta y la respuesta, o las tres divergirían.
 */
export function consultaDe(args: Record<string, unknown>): { pregunta: string; opciones: string[] } {
  return {
    pregunta: typeof args.question === "string" ? args.question.trim() : "",
    opciones: Array.isArray(args.options) ? args.options.filter((o): o is string => typeof o === "string") : [],
  };
}

/** Lo que escribió la persona, como respuesta: un número de opción se traduce a su texto. */
export function respuestaAPregunta(args: Record<string, unknown>, escrito: string): string {
  const { opciones } = consultaDe(args);
  const n = /^\s*(\d+)\s*[.)]?\s*$/.exec(escrito);
  const elegida = n === null ? undefined : opciones[Number(n[1]) - 1];
  return elegida ?? escrito;
}

/**
 * El tope de llamadas del ORQUESTADOR en un turno. deepagents no le pone ninguno —no puede quedarse
 * a medias— y TrueForge exige un número (su omisión, 25, es la del core); 100 es la omisión de su
 * propio `AgentSpec`. Es POR TURNO porque el raíz se rehace desde su foto al acabar cada uno.
 */
export const LIMITE_DE_LLAMADAS_DEL_RAIZ = 100;

/** La pregunta guardada en la foto, en la forma con que la espera el turno. */
function preguntaDeLaFoto(foto: FotoDeHilo | undefined): Pendiente | undefined {
  const p = foto?.pregunta_pendiente;
  if (p === undefined) return undefined;
  return {
    clave: claveDe(p.hilo, p.id),
    hilo: p.hilo,
    id: p.id,
    nombre: "ask_user_question",
    args: p.args,
    ...(p.encargo === undefined ? {} : { encargo: p.encargo }),
  };
}

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
  /**
   * El índice de `xone_navegacion`. Solo para doblarlo en un test: ausente es el REAL, sobre la
   * raíz (`indiceEnDisco`), y la omisión vive aquí y no en quien llama por el patrón de fallo de
   * siempre — compuesta en un cierre que los tests doblan, la tool quedaría escrita y sin montar.
   */
  navegacion?: CargarIndice;
  /**
   * El simulador. Entra por parámetro, como en deepagents, para que `npm test` siga sin él; en
   * producción lo pasa `abrirSesionReal`, que es quien lo recibe de todas las pieles.
   */
  verifier?: VerifierPort;
  /** Solo para doblar la traza en un test; ausente es la real (`crearDiagnosticoDeTools`). */
  diagnostico?: DiagnosticoDeTools;
  /** Tope de rondas de aprobación con alguien delante (el de la consola). */
  topeDeRondas?: number;
  /**
   * El crítico VISUAL y el JUEZ del turno, los MISMOS puertos que deepagents
   * (`turnoReal.ts#abrirSesionReal`): llaman a un modelo, así que entran por parámetro y
   * `npm test` no pregunta a nadie. Ausente es «esta ejecución no tiene», nunca «está bien».
   */
  criticaVisual?: (
    captura: { base64: string; mime: string },
    pantalla: string
  ) => Promise<{ veredicto: string; observaciones: string[] }>;
  juezDelTurno?: (caso: { objetivo: string; respuesta: string; hechos: HechosDelTurno }) => Promise<VeredictoDelTurno>;
  /**
   * La FÁBRICA del puerto de los motores externos (Claude Code, Codex, OpenCode), no el puerto:
   * así un test recibe las opciones que la sesión COMPONE —política, modo, cola, consumo— y las
   * comprueba una a una. Ausente es la real (`crearSubagenteExterno`), y la omisión vive aquí por
   * el patrón de fallo de siempre: compuesta en un cierre que los tests doblan, quedaría escrita.
   */
  subagenteExterno?: (opciones: ReturnType<typeof opcionesDeSubagenteExterno>) => SubagenteExternoPort;
  /**
   * ¿Las dos trazas opt-in van encendidas sin variable de entorno? Resuelto por quien LLAMA,
   * igual que en deepagents (`turnoReal.ts#abrirSesionReal`) — ver ahí el porqué de que
   * ausente se comporte exactamente como hoy.
   */
  depurar?: boolean;
}

/** Una tool call que espera decisión: en QUÉ hilo, con qué id, y qué pide. */
interface Pendiente {
  clave: string;
  hilo: string;
  id: string;
  nombre: string;
  args: Record<string, unknown>;
  /** Solo en una PREGUNTA: el encargo CRUDO que la provocó, para juzgar y reparar contra él y no
   *  contra la respuesta. Viaja en la foto, así que sobrevive a reabrir la sesión. */
  encargo?: string;
}

const claveDe = (hilo: string, id: string): string => `${hilo}:${id}`;

export async function abrirSesionTrueforge(opciones: OpcionesDeSesionTrueforge): Promise<SesionReal> {
  const { raiz } = opciones;
  let modelos = opciones.modelos;
  const logger = winston.createLogger({ silent: true, transports: [] });
  /**
   * La traza de tools (`XONECODE_TRACE_TOOLS=1`), la MISMA de deepagents: mismo fichero y mismo
   * formato, así que `xonecode traza` compara los dos motores. La omisión es la real —entrar por
   * parámetro solo sirve para doblarla—, que es lo que evita dejarla escrita y sin montar.
   */
  const entornoDeDiagnostico = entornoConDepuracion(opciones.depurar === true);
  const diagnostico = opciones.diagnostico ?? crearDiagnosticoDeTools(raiz, entornoDeDiagnostico);
  /**
   * La traza de EXCEPCIONES e HITOS, la MISMA de deepagents (`turnoReal.ts`) y que aquí
   * faltaba por completo: TrueForge nunca la encendía, ni siquiera con la variable de entorno
   * puesta a mano.
   */
  encenderTrazaDeErrores(raiz, entornoDeDiagnostico);
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
  /**
   * El especialista CARGADO de cada hilo hijo, para el `origen` de sus tools. No es `quienEs`:
   * ése guarda también el nombre que el modelo puso al delegar aunque no sea de nadie, y lo que
   * viaja por el cable como nombre de un especialista tiene que serlo de verdad.
   */
  const especialistaDeHilo = new Map<string, string>();

  /** Lo que el agente dejó en `/artefactos/` y aún no se ha anunciado: un artefacto se escribe
   *  SIN aprobación, así que tiene que ANUNCIARSE, como en deepagents. */
  const artefactosPorAnunciar: Artefacto[] = [];
  /** Las IMÁGENES que dejó el turno en curso, para el crítico de pantalla. Se vacía al empezar
   *  cada turno: una captura de antes enseña la pantalla de antes. */
  let capturasDelTurno: Artefacto[] = [];
  const anotarArtefacto = (a: Artefacto): void => {
    artefactosPorAnunciar.push(a);
    if (a.mime !== undefined && a.mime.startsWith("image/")) capturasDelTurno.push(a);
  };
  const montarBackend = (ejecucion?: { entorno: Record<string, string>; senal?: () => AbortSignal | undefined }) =>
    backendDeAgente({
      raiz,
      ficheros: ficherosDelProyecto(raiz),
      ...(opciones.artefactos === undefined
        ? {}
        : { artefactos: { carpeta: opciones.artefactos, alEscribir: anotarArtefacto } }),
      ...(ejecucion === undefined ? {} : { ejecucion }),
    });
  const backend = montarBackend() as unknown as BackendDeFicheros;

  /**
   * **Los motores EXTERNOS**, por el MISMO puerto que deepagents (`subagenteExterno.ts`), con sus
   * guardas de ruta, su política —la de la sesión, traducida (`politicaExternaDeSesion`)— y su
   * consumo. Lo que el hijo hace MIENTRAS trabaja entra por `eventosExternos` y se entrelaza con el
   * flujo del turno; las rutas que aplica sin preguntar van al aviso del turno por
   * `apuntarAplicadasSinPreguntar`, un puntero de la sesión a una lista del turno: la política se
   * compone una vez y el aviso es de cada turno.
   */
  const eventosExternos = new ColaDeEventos();
  let consumoExterno: ConsumoDeSesion = SIN_CONSUMO;
  let apuntarAplicadasSinPreguntar: ((rutas: readonly string[]) => void) | undefined;
  const externo = (opciones.subagenteExterno ?? crearSubagenteExterno)(
    opcionesDeSubagenteExterno({
      ...(opciones.pedirAprobacion === undefined ? {} : { pedirAprobacion: opciones.pedirAprobacion }),
      ficherosDelProyecto: () => ficherosDelProyecto(raiz),
      eventos: eventosExternos,
      alConsumir: (c) => {
        consumoExterno = sumarConsumo(consumoExterno, c);
        avisar();
      },
      modo: {
        sinPreguntar: () => opciones.sinAprobacion?.() === true,
        alAplicarSinPreguntar: (rutas) => apuntarAplicadasSinPreguntar?.(rutas),
      },
    })
  );
  /**
   * Qué motores externos se pueden usar DE VERDAD, preguntado UNA vez al abrir —como deepagents al
   * construir el grafo—: un especialista que el orquestador elige y que revienta en cuanto lo
   * elige es un botón muerto que pulsa el modelo, y se lo cree.
   */
  const motoresDisponibles = new Set<MotorExterno>();
  for (const motor of new Set(cargarAgentes(raiz).agentes.map((a) => a.motor).filter((m) => m !== "modelo"))) {
    if (await externo.disponible(motor as MotorExterno)) motoresDisponibles.add(motor as MotorExterno);
  }
  /** Los hilos de un hijo EXTERNO: su «llamada al modelo» no es una llamada, no se cuenta. */
  const hilosExternos = new Set<string>();
  /** Cuántos hijos externos lanzó el turno en curso, para el contraste con las métricas del motor. */
  let externosDelTurno = 0;

  /**
   * **El raíz es el ORQUESTADOR, de solo lectura y SIN skills** — la regla de deepagents
   * (`xoneAgent.ts`): los subagentes no heredan las skills del orquestador, cada uno recibe
   * las de su `.md`. Lee para orientarse y contestar lo que se contesta mirando; todo lo que
   * escribe o ejecuta lo delega. Los de motor externo, solo si su motor está disponible: el
   * prompt del orquestador y la factoría de hijos salen de ESTA lista, así que no puede ofrecer
   * uno que luego no se monte.
   */
  const especialistas = (): Agente[] =>
    cargarAgentes(raiz).agentes.filter((a) => a.motor === "modelo" || motoresDisponibles.has(a.motor as MotorExterno));
  /**
   * **Las tools PROPIAS, con el MISMO reparto que deepagents** (`xoneAgent.ts`): son las mismas
   * funciones, adaptadas (`toolsPropias.ts`), no una copia.
   * - `xone_navegacion` va a TODOS, el orquestador incluido: medido en deepagents, el
   *   orquestador no delegaba la pregunta de estructura y sin ella se orientaba con once
   *   llamadas de `ls`/`grep`/`read_file`.
   * - `regex_search` a los especialistas.
   * - `copiar_artefacto` solo a quien declara `escribeEn` y con carpeta de artefactos.
   * - La crítica visual y traer de la máquina, solo al ORQUESTADOR y solo con carpeta: es
   *   quien reparte y quien lee la ruta que nombra la persona.
   */
  const ficheros = ficherosDelProyecto(raiz);
  const cargarIndice = opciones.navegacion ?? indiceEnDisco(raiz);
  const cargarEstilos = estilosDeDisco(raiz);
  const navegacion = (): ToolDeLangchain => crearNavegacionXone(cargarIndice, ficheros, cargarEstilos) as unknown as ToolDeLangchain;
  const carpeta = opciones.artefactos;
  const propiasDelRaiz: ToolDeLangchain[] = [
    navegacion(),
    ...(carpeta === undefined
      ? []
      : ([
          crearCriticaVisual({
            leerArtefacto: async (nombre) => readFileSync(join(carpeta, nombre)),
            invocar: invocarVisualConModelos({ paraPapel: (p) => modelos.paraPapel(p) }),
          }),
          crearTraerDeLaMaquina({ carpeta, alEscribir: anotarArtefacto }),
        ] as unknown as ToolDeLangchain[])),
  ];
  const propiasDe = (agente: Agente): ToolDeLangchain[] => [
    crearBusquedaRegex(backend as never) as unknown as ToolDeLangchain,
    navegacion(),
    ...(carpeta !== undefined && (agente.escribeEn ?? []).length > 0
      ? [crearCopiarArtefacto({ raiz, carpetaDeArtefactos: carpeta, perfil: agente }) as unknown as ToolDeLangchain]
      : []),
    // El mismo reparto que deepagents (`xoneAgent.ts`): a quien declara `escribeEn`.
    ...((agente.escribeEn ?? []).length > 0 ? [crearUnirSecciones({ raiz, perfil: agente }) as unknown as ToolDeLangchain] : []),
  ];
  /**
   * **Un cliente de modelo por papel, modelo y esfuerzo, que dura la SESIÓN** —hasta `/modelo`—, y
   * no uno por llamada como era.
   *
   * No es por ahorro, es por el ECO de DeepSeek (`config/ecoDeRazonamiento.ts`): repone el
   * `reasoning_content` que `@langchain/openai` tira, emparejándolo por el id de la tool call, y su
   * memoria vive DENTRO del cliente. Con un cliente nuevo en cada llamada la memoria nacía vacía y el
   * eco no emparejaba nunca. Medido en el cable con DeepSeek real: deepagents devolvía el
   * razonamiento en 7 de 7 mensajes con tool calls, y TrueForge en 0 de 5. Hoy la API lo acepta
   * igual, pero su documentación exige devolverlo, y con esto TrueForge lo hace a nivel HTTP haga lo
   * que haga su contexto —que es justo lo que cambia en 0.3—
   * (`deepseekEnTrueforge.test.ts`).
   */
  const clientes = new Map<string, unknown>();
  const clienteDe = (clave: string, crear: () => unknown): unknown => {
    let cliente = clientes.get(clave);
    if (cliente === undefined) {
      cliente = crear();
      clientes.set(clave, cliente);
    }
    return cliente;
  };
  const llm = modeloParaTrueforge({ modelo: () => clienteDe("papel:trabajo:", () => modelos.paraPapel("trabajo")), senal: () => aborto?.signal });

  /**
   * El hilo de un hijo EXTERNO: un `AgentThread` normal con UNA llamada, cuyo «modelo» es el
   * producto (`modeloExterno.ts`). Sin tools, sin capabilities y sin compactación: el bucle vive
   * dentro de Claude Code, Codex u OpenCode. La petición es la de deepagents (`xoneAgent.ts`), y
   * se compone al DELEGAR —el inventario, fresco—; su vida es la del encargo, y no se persiste
   * nada del producto: la foto del raíz guarda el encargo y la respuesta, nunca un proceso.
   */
  const hijoExterno = (
    agente: Agente,
    params: { request: { name: string; input: string }; threadId: string; parent: unknown }
  ): AgentThread => {
    hilosExternos.add(params.threadId);
    externosDelTurno += 1;
    const motor = agente.motor as MotorExterno;
    return new AgentThread({
      definition: {
        modelClient: modeloExternoParaTrueforge({
          puerto: externo,
          peticion: () => ({
            motor,
            cwd: raiz,
            instrucciones: `${promptDeAgente(agente, repartirSkills(agente, disponibles))}\n\n${inventarioDelProyecto(ficherosDelProyecto(raiz))}`,
            tarea: params.request.input,
            ...(agente.modelo === undefined ? {} : { modelo: agente.modelo }),
            permitirEscritura: !agente.soloLectura,
            agente: agente.nombre,
          }),
          senal: () => aborto?.signal,
        }),
        messages: [{ role: "user", content: params.request.input }],
        iterationLimit: 1,
      } as never,
      threadId: params.threadId,
      title: params.request.name,
      parent: params.parent as never,
      agentInfo: { type: "dynamic", ...params.request } as never,
      tracing: NOOP_AGENT_TRACING,
      logger,
    });
  };

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
    if (agente !== undefined) especialistaDeHilo.set(params.threadId, agente.nombre);
    if (agente !== undefined && agente.motor !== "modelo") return hijoExterno(agente, params);
    const clase = agente === undefined ? "lee" : clasesDeTools(agente);
    // Las piezas por lo que declara su `.md` (`capacidades.ts`); la nota sale de SUS tools.
    const piezas = capacidadesDelEspecialista(agente, params.request.name, {
      backend: backend as never,
      propias: propiasDe,
      conShell: () =>
        montarBackend({
          entorno: entornoDeLaShellDelProyecto(raiz, opciones.artefactos),
          // El MISMO patrón que ya usa `modeloParaTrueforge` un poco más arriba en este
          // fichero: un getter que se reevalúa en cada llamada, así siempre lee el
          // `AbortController` de la RONDA en curso y no uno capturado al construir.
          senal: () => aborto?.signal,
        }) as unknown as {
          execute(c: string): unknown;
          write(ruta: string, contenido: string): unknown;
        },
    });
    const nombres = toolsDe(piezas);
    const nota = notaDeTools(nombres, agente === undefined ? LIMITE_DEL_GENERICO : LIMITES_DE[clase]);
    const instrucciones =
      agente === undefined
        ? `${nota} Contesta con lo que encuentres y dónde.`
        : [promptDeAgente(agente, repartirSkills(agente, disponibles)), "", nota, anuncioDeSkills(agente, catalogo)]
            .filter((l) => l !== undefined)
            .join("\n")
            .trimEnd();
    const papel = agente?.soloLectura === true ? "rapido" : "trabajo";
    const definicionDelHijo = {
      modelClient: modeloParaTrueforge({
        modelo: () =>
          agente?.modelo === undefined
            ? clienteDe(`papel:${papel}:${agente?.esfuerzo ?? ""}`, () => modelos.paraPapel(papel, agente?.esfuerzo))
            : clienteDe(`modelo:${agente.modelo}:${agente.esfuerzo ?? ""}`, () => modelos.paraModelo(agente.modelo!, agente.esfuerzo)),
        senal: () => aborto?.signal,
      }),
      messages: [{ role: "user", content: params.request.input }],
      // Los topes MEDIDOS de deepagents: el conductor más, porque cada paso suyo es un comando.
      iterationLimit: agente?.ejecucion === true ? TOPE_DE_LLAMADAS_DEL_CONDUCTOR : TOPE_DE_LLAMADAS_DEL_ESPECIALISTA,
    };
    return new AgentThread({
      definition: definicionDelHijo as never,
      threadId: params.threadId,
      title: params.request.name,
      parent: params.parent as never,
      agentInfo: { type: "dynamic", ...params.request } as never,
      /**
       * **El prompt del especialista va en el prompt de SISTEMA, por una capability**, y no en
       * su primer mensaje como al principio. Medido en la librería: `buildInstruction` IGNORA el
       * `instruction` de un hijo (`!this.parent`), y lo único que llega a su sistema son los
       * `instructionBuilders`. En el primer mensaje, además, una compactación —que sustituye el
       * contexto entero— se lo llevaría por delante.
       *
       * **Y el hijo NO se compacta, por una medida.** Se activó al mismo umbral que el raíz y la
       * traza lo tumbó («lanza la app en el emulador», MyAllXOne): el `device-controller` llegó a
       * 32.694 a un par de llamadas de terminar, y el resumen de TrueForge —un prompt largo que
       * pide fragmentos de código enteros— costó 26.010 de entrada SIN caché y 5.916 de salida, y
       * las dos llamadas siguientes volvieron a calentar la caché. Un encargo de hijo es corto y va
       * cacheado al 85-95 %: reenviar su contexto sale más barato que resumirlo. El de deepagents
       * acabó a 22.508 sin llegar al umbral.
       */
      capabilities: capabilitiesDe([...piezas, capacidadDeInstrucciones(instrucciones)]) as never,
      tracing: NOOP_AGENT_TRACING,
      logger,
    });
  };

  /**
   * El árbol de hilos de UNA conversación. Se rehace con `nuevoHilo`, al reabrir una sesión
   * —desde la foto guardada— y tras un turno cortado, desde la foto SANEADA del raíz: los hijos
   * que se quedaron esperando no pueden seguir, y con ellos vivos el siguiente mensaje del usuario
   * lo rechazaba la librería («Cannot process user messages while sub agents are running»).
   */
  let raizActual: AgentThread | undefined;
  /** La pregunta del orquestador que espera respuesta: el siguiente mensaje la contesta. */
  let preguntaEnEspera: Pendiente | undefined;
  const nuevoOrquestador = (foto?: FotoDeHilo): AgentThreadOrchestrator => {
    const definicion = {
      modelClient: llm,
      instruction: [promptOrquestador(especialistas()), notaDeDelegacion(especialistas())].filter((l) => l !== "").join("\n\n"),
      // Por TURNO, porque el raíz se rehace desde su foto al final de cada uno (ver `turno`).
      iterationLimit: LIMITE_DE_LLAMADAS_DEL_RAIZ,
    };
    const raizDelArbol = new AgentThread({
      definition: definicion,
      threadId: HILO_RAIZ,
      title: HILO_RAIZ,
      capabilities: [
        // Las piezas del orquestador (`capacidades.ts`): leer, sus tools propias, el presupuesto
        // del paso y la fecha. Lo que necesita su definición —compactar— y delegar van aquí.
        ...capabilitiesDe([
          capacidadDeFicheros({ backend, reglas: permisosDe(PERFIL_DEL_ORQUESTADOR), tools: TOOLS_DE_LECTURA, conAprobacion: false }),
          capacidadDePropias(propiasDelRaiz, backend as never),
          capacidadDeRecortes(backend as never),
          capacidadDeFecha(),
        ]),
        /**
         * **La conversación se RESUME al mismo umbral que deepagents** (`UMBRAL_RESUMEN_TOKENS`):
         * sin esto no se compactaba nunca y cada turno reenviaba la sesión entera. La
         * compactación de TrueForge sustituye el contexto ENTERO por el resumen, y por eso las
         * instrucciones van en el prompt de sistema —aquí `instruction`, en un hijo su
         * capability—, que no se compacta.
         */
        contextCompaction({ definition: definicion as never, compactionThresholdTokens: UMBRAL_RESUMEN_TOKENS }),
        // `ask_user_question`, SOLO en el raíz —la librería tampoco se la da a un hijo—: es el
        // único que tiene a una persona delante.
        askUserQuestion(),
        // `create_sub_agent`: la delegación de TrueForge, un nivel y cinco a la vez como mucho.
        dynamicSubAgents({ sandboxAvailable: false, tracing: NOOP_AGENT_TRACING }),
      ] as never,
      tracing: NOOP_AGENT_TRACING,
      logger,
      ...(foto === undefined
        ? {}
        : {
            context: foto.context as never,
            ...(foto.current_context_usage === undefined ? {} : { currentContextUsage: foto.current_context_usage as never }),
            ...(foto.capability_state == null ? {} : { capabilityState: foto.capability_state as never }),
          }),
    });
    raizActual = raizDelArbol;
    return new AgentThreadOrchestrator({
      agentThreads: new Map([[HILO_RAIZ, raizDelArbol]]),
      createDynamicSubAgentThread: async (params) =>
        crearHijo(params as unknown as { request: { name: string; input: string }; threadId: string; parent: unknown }),
      tracing: NOOP_AGENT_TRACING,
      logger,
    });
  };
  /**
   * Solo se persiste con un id de sesión DADO: es lo que tiene índice donde reanudar. La consola
   * de terminal no lo pasa, la misma regla que el checkpoint de deepagents.
   */
  const persistir = opciones.hilo !== undefined;
  /** El aviso de una memoria que existía y no se entendió: sale en el PRIMER turno y se gasta. */
  let avisoDeMemoria: string | undefined;
  /**
   * La foto de la sesión `id`, si hay y se entiende. Una que no se entiende se APARTA —el guardado
   * de este mismo turno la pisaría— y se DICE en el turno siguiente (`memoriaTrueforge.ts`).
   */
  const fotoDeLaSesion = (id: string): FotoDeHilo | undefined => {
    avisoDeMemoria = undefined;
    if (!persistir) return undefined;
    const lectura = cargarMemoria(raiz, id);
    if (lectura.estado === "incompatible") avisoDeMemoria = textoDeMemoriaDescartada(lectura.motivo, apartarMemoria(raiz, id));
    return lectura.estado === "ok" ? lectura.foto : undefined;
  };
  const fotoInicial = fotoDeLaSesion(hilo);
  let orquestador = nuevoOrquestador(fotoInicial);
  // La pregunta que se quedó sin contestar al cerrar: la respuesta de la persona es para ELLA.
  preguntaEnEspera = preguntaDeLaFoto(fotoInicial);

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
  async function* paso(lote: unknown[], senal: AbortSignal, pendientes: Pendiente[], preguntas: Pendiente[] = []): AsyncGenerator<DomainEvent> {
    for await (const _ of orquestador.send(lote as never)) void _;
    const llamadas = new Map<string, { nombre: string; args: Record<string, unknown> }>();
    // El razonamiento de los especialistas, juntado por hilo hasta que su mensaje se completa.
    const pensamientos: PensamientoPorHilo = new Map();
    const it = orquestador.execute({ signal: senal });
    let r = await it.next();
    while (!r.done) {
      const evento = r.value as { type?: string; thread_id?: string; output?: unknown; tool_call_id?: string; content?: unknown };
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
            // La traza: la MISMA lista blanca que el evento (`detalleDe`, `parametrosDe`), nunca
            // los argumentos crudos.
            diagnostico?.herramienta(
              t.function.name,
              detalleDe(t.function.name, args),
              parametrosDe(t.function.name, args),
              tracker,
              deHilo === HILO_RAIZ ? "orquestador" : "especialista"
            );
          }
        }
      }
      if (evento.type === "tool.response" && evento.tool_call_id !== undefined) {
        // Cuánto METIÓ en el contexto lo que devolvió: los caracteres, nunca el contenido.
        const llamada = llamadas.get(claveDe(deHilo, evento.tool_call_id));
        const chars = typeof evento.content === "string" ? evento.content.length : 0;
        diagnostico?.resultado?.(llamada?.nombre, llamada === undefined ? undefined : detalleDe(llamada.nombre, llamada.args), chars);
      }
      // Un hilo que agotó su tope se ANOTA en la traza, con quién era: el raíz y cualquier hijo.
      const tope = topeAgotadoDe(evento);
      if (tope !== undefined) diagnostico?.corte?.(quienEs.get(deHilo) ?? deHilo, tope);
      const { eventos, uso } = traducirEvento(evento, (h) => especialistaDeHilo.get(h), pensamientos);
      // La «llamada» de un hijo externo es el producto entero: su consumo llega por su propio
      // callback (`externo`), y contarla aquí sumaría una llamada de modelo a ceros por delegación.
      if (uso !== undefined && !hilosExternos.has(deHilo)) {
        // Los tokens de TODOS los hilos se gastaron, así que todos cuentan. La VENTANA es otra
        // pregunta —cuánto ocupa la conversación—, y esa es la del raíz: la de un hijo es la de
        // un encargo que muere con él.
        tracker.input += uso.input;
        tracker.output += uso.output;
        tracker.cache += uso.cache;
        tracker.calls += 1;
        // Y solo de una llamada NORMAL: la de la compactación mide lo de ANTES de resumir.
        if (deHilo === HILO_RAIZ && evento.type === "internal.agent.context.append") tracker.contexto = uso.input;
        // Por ORIGEN, como deepagents: el orquestador y cada especialista por su nombre.
        diagnostico?.modelo(quienEs.get(deHilo) ?? deHilo, {
          input: uso.input,
          output: uso.output,
          cache: uso.cache,
          llamadas: tracker.calls,
          contexto: uso.input,
        });
        avisar();
      }
      yield* eventos;
      while (artefactosPorAnunciar.length > 0) yield { tipo: "artefacto", artefacto: artefactosPorAnunciar.shift()! };
      r = await it.next();
    }
    const resultado = r.value as { required_actions?: { type?: string; thread_id?: string; tool_calls?: { id: string }[] }[] };
    for (const accion of resultado.required_actions ?? []) {
      // Dos interrupciones distintas, y no se mezclan: una APROBACIÓN decide sobre una escritura
      // con su diff; una RESPUESTA es lo que pide `ask_user_question`, que no escribe nada.
      const destino = accion.type === "tool.approval_required" ? pendientes : accion.type === "tool.response_required" ? preguntas : undefined;
      if (destino === undefined) continue;
      const deHilo = accion.thread_id ?? HILO_RAIZ;
      for (const { id } of accion.tool_calls ?? []) {
        const clave = claveDe(deHilo, id);
        const llamada = llamadas.get(clave);
        if (llamada !== undefined) destino.push({ clave, hilo: deHilo, id, ...llamada });
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
      apuntarAplicadasSinPreguntar = (rutas) => void aplicadasSinPreguntar.push(...rutas);
      // Lo que llevaba el tracker al empezar: el contraste con el motor es del TURNO.
      const trackerAlEmpezar = { input: tracker.input, output: tracker.output, cache: tracker.cache, calls: tracker.calls };
      externosDelTurno = 0;
      capturasDelTurno = [];
      /** El encargo de ESTE turno tal cual se pidió, y el mismo con la última pregunta y su
       *  respuesta al lado, que es lo que se juzga y se repara (ver `flujo`). Ausente = no consta. */
      let encargoDelTurno: string | undefined;
      let objetivoDelTurno: string | undefined;
      // Se dice UNA vez: el turno que lo lleva es el primero que corre sin la conversación de antes.
      const memoriaDescartada = avisoDeMemoria;
      avisoDeMemoria = undefined;
      let cortadoPorTope = false;
      let sinResolver = 0;
      // El veredicto del turno, con las MISMAS reglas que deepagents (`verificacion.ts`).
      let veredicto: "verde" | "rojo" | "no-corrio" = "no-corrio";
      let hallazgosDelTurno: HallazgoDelTurno[] = [];
      let preexistentesDelTurno: number | undefined;
      let motivoSinVerificar: string | undefined;
      let escribioProyecto = false;

      /**
       * Las RONDAS de una petición: una pausa termina la ronda y se reanuda con las decisiones.
       * Devuelve si acabó LIMPIA —sin escrituras en la mesa—, que es lo único que se verifica:
       * con algo sin resolver el turno no ha terminado su trabajo, y mirar a medias daría un
       * veredicto sobre algo que no es lo que quedó.
       */
      async function* rondasDe(loteInicial: unknown[], salida: { limpia: boolean }): AsyncGenerator<DomainEvent> {
        let lote = loteInicial;
        let rondas = 0;
        while (true) {
          if (cancelado || cerrada) return;
          aborto = new AbortController();
          const senal = aborto.signal;
          const pendientes: Pendiente[] = [];
          const preguntas: Pendiente[] = [];
          yield* paso(lote, senal, pendientes, preguntas);
          if (pendientes.length === 0) {
            // El orquestador PREGUNTA: el turno acaba aquí con la pregunta a la vista, y lo que la
            // persona escriba después vuelve como la respuesta de esa tool (`turno`, arriba).
            const pregunta = preguntas[0];
            if (pregunta !== undefined) {
              // El encargo CRUDO, no el objetivo con su nota: si no, cada pregunta encadenada
              // arrastraría las notas de las anteriores y el objetivo crecería turno a turno.
              preguntaEnEspera = { ...pregunta, ...(encargoDelTurno === undefined ? {} : { encargo: encargoDelTurno }) };
              yield { tipo: "token", texto: textoDePregunta(pregunta.args) };
              // Y la misma pregunta como DATO, para la piel que pinta un botón por opción.
              const consulta = consultaDe(pregunta.args);
              if (consulta.opciones.length > 0) yield { tipo: "consulta", ...consulta };
            }
            salida.limpia = true;
            return;
          }

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
          lote = pendientes.map((p) => ({ p, d: decisiones.get(p.clave) ?? ({ type: "reject" } as Decision) })).map(({ p, d }) => ({
            type: "user.tool_approval",
            thread_id: p.hilo,
            tool_call_id: p.id,
            approval: d.type === "approve" ? { status: "allow" } : { status: "deny", reason: d.message ?? "rechazado por el usuario" },
          }));
        }
      }

      /**
       * **El verificador, cosido al FINAL del flujo y no después del turno** —la regla de
       * deepagents—: `correrTurno` cierra en cuanto el flujo se agota, así que verificar después
       * pintaría el veredicto fuera del turno. Un rojo se REPARA en el mismo hilo, como mensaje
       * de USUARIO con el objetivo delante (`textoDeReparacion`), hasta `TOPE_REPARACIONES`, y
       * corta antes si un intento deja la MISMA huella de errores.
       */
      async function* flujo(): AsyncGenerator<DomainEvent> {
        // Si el orquestador dejó una pregunta, ESTE mensaje es su respuesta: vuelve a su hilo como
        // `user.tool_response`, y no como un mensaje nuevo que la dejaría sin contestar.
        const enEspera = preguntaEnEspera;
        preguntaEnEspera = undefined;
        // El ENCARGO del turno: lo que se repara y lo que se juzga. En un turno que contesta una
        // pregunta no es lo tecleado —un «2» no es un objetivo—, sino el encargo que la provocó.
        //
        // Y con lo que se preguntó y se contestó al lado. Medido en el navegador: con el encargo
        // a secas, el juez leía solo la respuesta de ESTE turno y concluía que la pregunta que
        // se pidió no se había hecho — se hizo, en el turno anterior, y él no lo veía.
        // Solo la ÚLTIMA pregunta va en la nota: las de antes están en la conversación, y el
        // encargo de una pregunta encadenada es el CRUDO (`rondasDe`), así que no se acumulan.
        encargoDelTurno = enEspera === undefined ? peticion : enEspera.encargo;
        objetivoDelTurno =
          enEspera === undefined || encargoDelTurno === undefined
            ? encargoDelTurno
            : `${encargoDelTurno}\n\n[En un turno anterior el agente preguntó «${consultaDe(enEspera.args).pregunta}» y la persona contestó «${respuestaAPregunta(enEspera.args, peticion)}».]`;
        // Los hechos baratos del proyecto van DELANTE (`core/hechosDelProyecto.ts`), la misma
        // foto y el MISMO cargador que `xone_navegacion`, rehecha en cada turno —la regla de
        // deepagents: en el prompt de sistema envejecería dentro de la sesión—. Solo en la
        // petición ORIGINAL: la respuesta a una pregunta no es un encargo nuevo, y el mensaje de
        // una reparación ya lleva sus hallazgos. Un índice que no carga deja la petición sola.
        const loteInicial: unknown[] =
          enEspera === undefined
            ? [
                {
                  type: EventType.USER_MESSAGE,
                  content: conHechosDelProyecto(peticion, await hechosDelProyectoDe(cargarIndice, ficherosDelProyecto(raiz))),
                },
              ]
            : [{ type: "user.tool_response", thread_id: enEspera.hilo, tool_call_id: enEspera.id, content: respuestaAPregunta(enEspera.args, peticion) }];
        yield* pasadas(loteInicial);
        yield* juzgar();
      }

      /** Lo que el turno CONTESTÓ en su última pasada: es lo que lee el juez. */
      let respuestaDeLaPasada = "";

      /**
       * Las PASADAS del turno: la de la petición y las de reparación. Cada `return` de aquí es un
       * final del turno —verde, sin escribir, sin verificador, bloqueado…— y el juez va DETRÁS de
       * todos (`flujo`); la única salida que no cierra es la que sigue a otra pasada.
       */
      async function* pasadas(loteInicial: unknown[]): AsyncGenerator<DomainEvent> {
        let lote = loteInicial;
        let intento = 0;
        let huellaPrevia: string | undefined;
        let visualYaDisparo = false;
        while (true) {
          if (intento > 0) yield { tipo: "reparacion", intento, tope: TOPE_REPARACIONES };
          const salida = { limpia: false };
          respuestaDeLaPasada = "";
          for await (const evento of rondasDe(lote, salida)) {
            if (evento.tipo === "token") respuestaDeLaPasada += evento.texto;
            yield evento;
          }
          const cambios = cambiosQueSeVerifican(await instantanea.cambios());
          escribioProyecto = cambios.length > 0;
          if (!salida.limpia) {
            if (sinResolver > 0) motivoSinVerificar = "quedaron escrituras sin resolver";
            return;
          }
          veredicto = "no-corrio";
          if (!escribioProyecto) {
            motivoSinVerificar = "el turno no escribió ningún fichero del proyecto";
            return;
          }
          if (opciones.verifier === undefined) {
            motivoSinVerificar = "esta ejecución no tiene verificador";
            return;
          }
          yield { tipo: "fase", fase: "verificando" };
          let informe;
          try {
            informe = await opciones.verifier.verificar(raiz);
          } catch (e) {
            // Que no esté el binario NO es un fallo del proyecto, y se dice como tal.
            motivoSinVerificar = e instanceof Error ? e.message : String(e);
            yield { tipo: "aviso", texto: `⚠ no se pudo verificar: ${motivoSinVerificar}`, severidad: "aviso" };
            return;
          }
          motivoSinVerificar = undefined;
          const { hallazgos, preexistentes, errores } = repartirHallazgos(raiz, informe, cambios.map((c) => c.ruta));
          veredicto = errores === 0 ? "verde" : "rojo";
          hallazgosDelTurno = hallazgos;
          preexistentesDelTurno = preexistentes;
          yield {
            tipo: "verificacion",
            verde: errores === 0,
            errores,
            avisos: hallazgos.length - errores,
            hallazgos,
            ...(preexistentes > 0 ? { preexistentes } : {}),
          };

          /**
           * **El crítico de pantalla**, con las reglas de deepagents (`turnoReal.ts`, junto a
           * `tocaCriticarPantalla`): mira la ÚLTIMA captura que dejó este turno, una vez por
           * turno. Con el simulador en VERDE solo REPORTA —medido allí: una ronda disparada por
           * defectos de otra pantalla se iba a rediseñar lo que nadie pidió—; en ROJO sus
           * observaciones se suman a la reparación que iba a salir igualmente. Que no se pueda
           * preguntar es un aviso, no un rojo.
           */
          let observacionesVisuales: string[] = [];
          if (
            carpeta !== undefined &&
            tocaCriticarPantalla({ hayCritico: opciones.criticaVisual !== undefined, capturas: capturasDelTurno.length, yaDisparo: visualYaDisparo, intento })
          ) {
            visualYaDisparo = true;
            const captura = capturasDelTurno[capturasDelTurno.length - 1]!;
            try {
              const bytes = readFileSync(join(carpeta, captura.nombre));
              const visual = await opciones.criticaVisual!({ base64: bytes.toString("base64"), mime: captura.mime ?? "image/png" }, captura.nombre);
              if (visual.veredicto === "rojo" && visual.observaciones.length > 0) {
                observacionesVisuales = visual.observaciones;
                yield {
                  tipo: "aviso",
                  texto: `⚠ la captura de esta sesión enseña ${visual.observaciones.length} defecto(s) de pantalla`,
                  severidad: "aviso",
                };
              }
            } catch (error) {
              yield { tipo: "aviso", texto: `⚠ no se pudo criticar la pantalla: ${error instanceof Error ? error.name : "error"}`, severidad: "aviso" };
            }
          }

          if (errores === 0) return;
          const huella = huellaDeErrores(hallazgos);
          if (huella === huellaPrevia) {
            yield {
              tipo: "bloqueado",
              motivo: "no-progreso",
              explicacion: `el intento ${intento} dejó los mismos ${errores} error(es) en los mismos sitios`,
            };
            return;
          }
          if (intento >= TOPE_REPARACIONES) {
            yield {
              tipo: "bloqueado",
              motivo: "tope-reparaciones",
              explicacion: `tras ${intento} intento(s) siguen ${errores} error(es); se deja como está para que lo mires`,
            };
            return;
          }
          huellaPrevia = huella;
          intento += 1;
          lote = [{ type: EventType.USER_MESSAGE, content: textoDeReparacion(hallazgos, observacionesVisuales, objetivoDelTurno ?? peticion) }];
        }
      }

      /**
       * **¿Hizo lo que se le pidió?** El juez del turno, con el reparto de deepagents: los HECHOS
       * los mide el código y al modelo solo se le pregunta el juicio (`core/juezDelTurno.ts`). Va
       * DETRÁS de todas las pasadas, así que alcanza cada final del turno —«no escribió nada» es
       * el candidato número uno a no haber cumplido—. Tres casos en que NO se pregunta, y los tres
       * serían ruido: un turno CANCELADO (alguien pulsó Parar; juzgarlo es gastar una llamada
       * contra su decisión), uno que acaba PREGUNTANDO (su «respuesta» es la pregunta, y saldría
       * dudoso siempre), y la respuesta a una pregunta cuyo encargo no consta —una sesión
       * reabierta: el encargo vive en memoria del proceso, no en la foto—. Un juez que falla es
       * un aviso: es una opinión sobre trabajo ya hecho.
       */
      async function* juzgar(): AsyncGenerator<DomainEvent> {
        if (opciones.juezDelTurno === undefined || cancelado || cerrada) return;
        if (preguntaEnEspera !== undefined || objetivoDelTurno === undefined) return;
        try {
          const v = await opciones.juezDelTurno({
            objetivo: objetivoDelTurno,
            respuesta: respuestaDeLaPasada,
            hechos: {
              // Ausente es «no corrió», que no es lo mismo que «salió mal»: el prompt lo dice.
              ...(veredicto === "verde" || veredicto === "rojo" ? { verificador: veredicto } : {}),
              ...(cortadoPorTope ? { escriturasSinResolver: true } : {}),
            },
          });
          const accion = accionDelJuez(v, { hayHumano: false });
          if (accion.tipo !== "nada") yield { tipo: "aviso", texto: `⚠ ${accion.texto}`, severidad: "aviso" };
        } catch (error) {
          yield { tipo: "aviso", texto: `⚠ no se pudo consultar al juez del turno: ${error instanceof Error ? error.name : "error"}`, severidad: "aviso" };
        }
      }

      let bitacora;
      try {
        // El flujo del turno MÁS lo que un hijo externo va haciendo en su proceso: sin esto, sus
        // minutos de trabajo no cruzan hasta que contesta (`core/entrelazar.ts`).
        bitacora = await correrTurno(entrelazar(flujo(), eventosExternos), piel, {
          // Solo si el turno ESCRIBIÓ y aun así no se verificó, y con el motivo: la regla de
          // deepagents — un aviso que salta cuando no ha pasado nada enseña a ignorarlo.
          avisos: (b) => [
            ...(memoriaDescartada === undefined ? [] : [memoriaDescartada]),
            ...(b.corrio("verify") || !escribioProyecto
              ? []
              : [`⚠ el verificador no ha corrido en este turno${motivoSinVerificar === undefined ? "" : ` (${motivoSinVerificar})`}`]),
            ...(aplicadasSinPreguntar.length === 0
              ? []
              : [`⚠ ${aplicadasSinPreguntar.length} escritura(s) aplicadas SIN aprobación: ${aplicadasSinPreguntar.join(", ")} — esta sesión va en modo autónomo`]),
          ],
          desde: t0,
        });
      } finally {
        aborto = undefined;
        /**
         * **El contraste con las métricas del motor**, ANTES de rehacer el raíz: el árbol que se
         * mide es el de este turno, y rehecho ya no lo sería (`metricasTrueforge.ts`). Solo con la
         * traza puesta, y sin poder tumbar nada: es diagnóstico.
         */
        if (diagnostico?.contraste !== undefined) {
          try {
            const motor = metricasDeTrueforge(orquestador.getMetrics() as unknown as Record<string, unknown>);
            const nuestras = {
              entrada: tracker.input - trackerAlEmpezar.input,
              salida: tracker.output - trackerAlEmpezar.output,
              cache: tracker.cache - trackerAlEmpezar.cache,
              llamadas: tracker.calls - trackerAlEmpezar.calls,
            };
            diagnostico.contraste({
              nuestras,
              motor: { ...motor },
              externos: externosDelTurno,
              diferencias: diferenciasDelContraste(nuestras, motor, externosDelTurno),
            });
          } catch {
            // Una métrica que no se pudo leer no es un turno que falló.
          }
        }
        // Lo que un hijo escribiera fuera de un turno no tiene dónde contarse (ver arriba).
        apuntarAplicadasSinPreguntar = undefined;
        /**
         * La foto del raíz, al acabar CADA turno —en el `finally`, como el commit del turno—:
         * saneada, para que las tool calls que el corte dejó sin respuesta no rompan la
         * siguiente llamada. Se guarda si hay sesión que reanudar, y si el turno no acabó limpio
         * se rehace el árbol desde ella. Guardar no puede tumbar un turno ya terminado.
         */
        if (raizActual !== undefined) {
          const foto = fotoSaneada({
            ...(raizActual.toSnapshot() as unknown as FotoDeHilo),
            ...(preguntaEnEspera === undefined
              ? {}
              : {
                  pregunta_pendiente: {
                    hilo: preguntaEnEspera.hilo,
                    id: preguntaEnEspera.id,
                    args: preguntaEnEspera.args,
                    ...(preguntaEnEspera.encargo === undefined ? {} : { encargo: preguntaEnEspera.encargo }),
                  },
                }),
          });
          if (persistir) {
            try {
              guardarMemoria(raiz, hilo, foto);
            } catch {
              // Sin memoria en disco la sesión sigue viva; al reabrirla, `hayMemoria` dirá la verdad.
            }
          }
          /**
           * **El raíz se rehace desde su foto al final de CADA turno**, y no solo tras uno cortado.
           * El contador de llamadas de TrueForge (`metrics.iterations`) vive con el HILO y no se
           * reinicia entre ejecuciones: con el raíz vivo toda la conversación, su tope se agotaba
           * sumando TODOS los turnos y una sesión larga dejaba de contestar aunque cada turno fuera
           * corto. Rehacerlo reinicia el contador y conserva el contexto: el tope pasa a ser por
           * turno, que es lo que promete.
           */
          orquestador = nuevoOrquestador(foto);
        }
      }
      const cambios: Cambio[] = await instantanea.cambios();
      return {
        bitacora,
        cambios,
        cortadoPorTope,
        verificador: veredicto,
        pendientes: sinResolver,
        ...(hallazgosDelTurno.length === 0 ? {} : { hallazgos: hallazgosDelTurno }),
        ...(preexistentesDelTurno === undefined ? {} : { preexistentes: preexistentesDelTurno }),
        ...(motivoSinVerificar === undefined ? {} : { motivoSinVerificar }),
      };
    },
    async cambiarModelos(nuevos: ModelosPort) {
      // El ILLM pide el modelo en cada llamada, así que basta con cambiar a quién se lo pide:
      // el hilo sigue entero.
      modelos = nuevos;
      // Los clientes eran del modelo de antes: el siguiente se construye con el nuevo.
      clientes.clear();
    },
    nuevoHilo(id?: string) {
      hilo = id ?? `tf-${Date.now()}`;
      // Un hilo NUEVO: lo que hubiera guardado con ese id no se pisa ni se carga a medias. Y una
      // pregunta de la conversación de antes no la contesta el primer mensaje de la nueva.
      const foto = fotoDeLaSesion(hilo);
      orquestador = nuevoOrquestador(foto);
      preguntaEnEspera = preguntaDeLaFoto(foto);
      // Y las DOS cuentas vuelven a cero, como en deepagents: lo que gastó la conversación de antes
      // no es de ésta, y sin esto `/nuevo` arrastraba la cifra entera a una sesión vacía.
      tracker.input = 0;
      tracker.output = 0;
      tracker.cache = 0;
      tracker.calls = 0;
      tracker.contexto = 0;
      consumoExterno = SIN_CONSUMO;
      avisar();
    },
    cancelar() {
      cancelado = true;
      aborto?.abort(new Error("turno cancelado por el usuario"));
    },
    consumo(): ConsumoDeSesionPorCuenta {
      return {
        modelo: { entrada: tracker.input, salida: tracker.output, cache: tracker.cache },
        externo: consumoExterno,
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
