/**
 * Las CAPACIDADES del motor TrueForge: su sistema de plugins (`AgentCapability`), una pieza por
 * responsabilidad —ficheros, tools propias, ejecución, recortes, fecha, instrucciones—.
 *
 * Antes se componían a mano dentro de `abrirSesionTrueforge`, y la nota de «qué tools tienes» de
 * cada hijo se mantenía aparte con una lista escrita: cada tool nueva había que añadirla en dos
 * sitios, y la vez que no se hizo el hijo leía cuatro nombres y veía seis. Aquí **cada pieza
 * declara las tools que añade**, y la nota sale de esa lista (`toolsDe`): hay un solo sitio.
 *
 * Y **qué piezas lleva cada especialista lo decide una función** (`capacidadesDelEspecialista`)
 * sobre lo que declara su `.md`, con la misma partición que deepagents. Es lo que deja probar el
 * reparto sin levantar un hilo.
 */
import { NOOP_AGENT_TRACING, ToolSet, currentDateTime, dynamicSubAgents, openUI } from "./trueforge.js";
import type { Agente } from "../../../core/agentes.js";
import type { DispositivoDeLaSesion } from "../../../core/dispositivoDeSesion.js";
import { permisosDe } from "../../grafo/perfiles.js";
import { NOMBRE_INCORPORAR_ADJUNTO } from "../../../core/adjuntos.js";
import {
  fuenteDeEjecucion,
  fuenteDeFicheros,
  TOOLS_DE_FICHERO,
  TOOLS_DE_LECTURA,
  TOOLS_QUE_ESCRIBEN,
  type BackendDeFicheros,
  type ToolDeFichero,
} from "./toolsDeFichero.js";
import { fuenteDeLangchain, type ToolDeLangchain } from "./toolsPropias.js";
import type { ClaseDeTool, ConectoresDeSesion } from "./toolsDeConectores.js";
import { presupuestoDelPaso, type EscritorDeDesalojo } from "./recortes.js";
import { entregarNotas, type Nota } from "./notas.js";
import type { ControlDeDetencion } from "./detencion.js";

/** Una pieza: la `AgentCapability` que se le da a TrueForge y las tools que añade. */
export interface Capacidad {
  nombre: string;
  tools: readonly string[];
  capability: Record<string, unknown>;
}

/** Las tools que NO piden aprobación: las de lectura, las propias y la shell del conductor. */
export const SIN_APROBACION = { enableTools: ["@all"], disableTools: [], preloadTools: [], requireApprovalForTools: [] };
/** Las que escriben PARAN el turno hasta que alguien decida, como el HITL de deepagents. */
export const CON_APROBACION = { enableTools: ["@all"], disableTools: [], preloadTools: [], requireApprovalForTools: [...TOOLS_QUE_ESCRIBEN] };

/** Las tools de FICHERO sobre nuestro backend, acotadas por `reglas`. */
export function capacidadDeFicheros(opciones: {
  backend: BackendDeFicheros;
  reglas: ReturnType<typeof permisosDe>;
  tools: readonly ToolDeFichero[];
  conAprobacion: boolean;
}): Capacidad {
  return {
    nombre: "ficheros",
    tools: opciones.tools,
    capability: {
      systemToolSets: [
        new ToolSet({
          source: fuenteDeFicheros({ backend: opciones.backend, reglas: opciones.reglas, tools: opciones.tools }) as never,
          selectors: opciones.conAprobacion ? CON_APROBACION : SIN_APROBACION,
          preload: true,
        }),
      ],
    },
  };
}

/**
 * Las tools propias de xonecode (`xone_navegacion`, `regex_search`…), adaptadas.
 *
 * `conAprobacion`: las de ESTE conjunto que paran el turno como `write_file` —hoy solo
 * `incorporar_adjunto`, que escribe el proyecto por su cuenta y tras el «sí» copia ella—. Omitido
 * es «ninguna», que es lo de siempre para las que solo leen.
 */
export function capacidadDePropias(
  tools: readonly ToolDeLangchain[],
  backend: EscritorDeDesalojo,
  conAprobacion: readonly string[] = []
): Capacidad {
  return {
    nombre: "propias",
    tools: tools.map((t) => t.name),
    capability: {
      systemToolSets: [
        new ToolSet({
          source: fuenteDeLangchain(tools, backend) as never,
          selectors: { ...SIN_APROBACION, requireApprovalForTools: [...conAprobacion] },
          preload: true,
        }),
      ],
    },
  };
}

/**
 * Las tools de los conectores MCP del proyecto, de UNA clase (`toolsDeConectores.ts`): las de
 * lectura sin aprobación, y el resto con aprobación TODAS (`@all`), porque lo que el servidor no
 * declara de lectura escribe en la cuenta de la persona. `tools` va vacío: sus nombres salen de la
 * red al primer `listTools`, no al montar.
 */
export function capacidadDeConectores(conectores: ConectoresDeSesion, clase: ClaseDeTool, backend: EscritorDeDesalojo): Capacidad {
  return {
    nombre: `conectores-${clase}`,
    tools: [],
    capability: {
      systemToolSets: [
        new ToolSet({
          source: conectores.fuente(clase, backend) as never,
          selectors: { ...SIN_APROBACION, requireApprovalForTools: clase === "lectura" ? [] : ["@all"] },
          preload: true,
        }),
      ],
    },
  };
}

/** `execute`: la shell del que la declara en su `.md`, y de nadie más. */
export function capacidadDeEjecucion(
  conShell: { execute(c: string): unknown; write(ruta: string, contenido: string): unknown },
  dispositivo?: () => DispositivoDeLaSesion | undefined
): Capacidad {
  return {
    nombre: "ejecucion",
    tools: ["execute"],
    capability: {
      systemToolSets: [new ToolSet({ source: fuenteDeEjecucion(conShell, dispositivo) as never, selectors: SIN_APROBACION, preload: true })],
    },
  };
}

/**
 * El presupuesto de un PASO entero (`recortes.ts#recortarPaso`), que el recorte por resultado no
 * ve: varias respuestas en paralelo que caben solas pero no juntas. No añade tools.
 */
export function capacidadDeRecortes(backend: EscritorDeDesalojo): Capacidad {
  return { nombre: "recortes", tools: [], capability: { toolResponseProcessors: [presupuestoDelPaso(backend)] } };
}

/**
 * Entrega lo que la sesión le deba a ESTE hilo mientras trabaja (IXCODE-4), por
 * `preLLMProcessors` —corre antes de CADA llamada al modelo, en la raíz y en cada hijo por
 * igual (`AgentThread.js:733-740`)—. No añade tools. `Nota`/`pendientesPara`/`marcarEntregada`
 * viven en `notas.ts`, sin importar tipos internos de la librería: ni
 * `PreLLMAgentContextProcessor` ni `AgentContextProcessorAppendContext` se reexportan desde su
 * punto de entrada público.
 *
 * La orden de DETENER (`detencion.ts`) va por el MISMO procesador y no por otro: es la única
 * pieza que corre antes de CADA llamada de cada hilo, y el control necesita contar las del raíz
 * para saber de qué plan nació cada hijo.
 */
export function capacidadDeNotas(
  notas: Nota[],
  opciones: {
    detencion?: ControlDeDetencion;
    /** El nombre con que el raíz conoce a un hijo, para decirle a QUIÉN se le pasó una nota. */
    nombreDe?: (threadId: string) => string;
    hiloRaiz?: string;
  } = {}
): Capacidad {
  const { detencion } = opciones;
  const hiloRaiz = opciones.hiloRaiz ?? "main";
  return {
    nombre: "notas",
    tools: [],
    capability: {
      preLLMProcessors: [
        {
          async *processPreLLM(execution: { threadId: string }) {
            // Sin control no se sabe cuántos hijos hay: se toma como el caso simple, uno.
            const textos = entregarNotas(notas, execution.threadId, {
              hiloRaiz,
              hijosVivos: detencion?.hijosVivos() ?? 1,
              nombreDe: opciones.nombreDe ?? ((h) => h),
            });
            const orden = detencion?.antesDeLlamar(execution.threadId);
            if (orden !== undefined) textos.push(orden);
            if (textos.length === 0) return;
            yield {
              type: "internal.agent.context.append",
              context: [{ role: "user", content: textos.join("\n\n") }],
              output: [],
            };
          },
        },
      ],
    },
  };
}

/**
 * `get_current_datetime` de la librería: la fecha en UTC, para que «hoy» o «hace tres días» no se
 * lo invente el modelo. No da la zona horaria local, y no se le atribuye.
 */
export function capacidadDeFecha(): Capacidad {
  return { nombre: "fecha", tools: ["get_current_datetime"], capability: currentDateTime({ tracing: NOOP_AGENT_TRACING }) as never };
}

/**
 * Lo que OpenUI tiene que saber de ESTE harness, y que su prompt no dice. Va en CÓDIGO —en el
 * prompt de quien tiene la skill `openui-builder`— porque vale para cualquier usuario y el modelo
 * no siempre abre un `SKILL.md` (la lección medida de `artifacts-builder`, ver `agentesEnDisco.ts`):
 * el prompt de la librería le pide que emita el bloque en su RESPUESTA, y la de un especialista
 * la lee el orquestador. Y «elige UNO» porque se midió lo contrario: un turno real escribió el
 * mismo panel en `.html` y en `.openui`, pagando el caro además del barato. Lo demás —cuándo usarlo
 * y cómo no fallar— vive en la skill, que el usuario puede copiar y editar como cualquier otra.
 */
export const REGLAS_DE_OPENUI = [
  "OpenUI en xonecode: el programa NO va en tu respuesta —la lee el orquestador, no una persona—. Escríbelo con `write_file` en `/artefactos/<nombre>.openui` (con su valla ```openui o sin ella); así se anuncia y se ve en la pestaña Artefactos.",
  "- Se ve en un iframe SIN RED: hornea los datos literales (no hay `Query()` ni `Mutation()`), sin imágenes de fuera, y las acciones no hacen nada.",
  "- Elige UNO: o este `.openui` o un HTML de `artifacts-builder`, nunca el mismo artefacto en los dos formatos.",
  "- Cuándo usarlo y los fallos que evitar: la skill `openui-builder`.",
].join("\n");

/** El nombre de la skill que TRAE OpenUI: quien la tiene recibe la tool que la skill necesita. */
export { SKILL_DE_OPENUI } from "../../../core/agentes.js";
import { SKILL_DE_OPENUI } from "../../../core/agentes.js";

/**
 * OpenUI para quien tiene la skill `openui-builder`: la tool de la librería que carga sus
 * instrucciones BAJO DEMANDA (unos 5.000 tokens que no viajan en cada llamada) y, al lado, las
 * reglas del harness. **La skill explica y esto monta lo que la skill necesita**, igual que un
 * builder del usuario: lo decide la skill que declara su `.md`, no el nombre de otra skill.
 */
export function capacidadDeOpenui(): Capacidad {
  const base = openUI({ preload: false, tracing: NOOP_AGENT_TRACING }) as {
    systemToolSets?: unknown[];
    instructionBuilders?: unknown[];
  };
  return {
    nombre: "openui",
    tools: ["get_openui_instructions"],
    capability: {
      ...base,
      instructionBuilders: [
        ...(base.instructionBuilders ?? []),
        (b: { addSection(tag: string, contenido: string, escapar?: boolean): unknown }) => void b.addSection("openui-en-xonecode", REGLAS_DE_OPENUI, true),
      ],
    },
  };
}

/**
 * Las instrucciones de un HIJO en su prompt de SISTEMA. La librería IGNORA el `instruction` de un
 * hijo (`buildInstruction`, `!this.parent`): a su sistema solo llegan los `instructionBuilders`.
 * En el primer mensaje, una compactación —que sustituye el contexto entero— se las llevaría.
 */
export function capacidadDeInstrucciones(texto: string): Capacidad {
  return {
    nombre: "instrucciones",
    tools: [],
    capability: {
      instructionBuilders: [(b: { addSection(tag: string, contenido: string, escapar?: boolean): unknown }) => void b.addSection("especialista", texto, true)],
    },
  };
}

/** Las tools que suman unas piezas, en orden: de aquí sale la nota del hijo. */
export function toolsDe(capacidades: readonly Capacidad[]): string[] {
  return capacidades.flatMap((c) => [...c.tools]);
}

/** Las `AgentCapability` que recibe TrueForge. */
export function capabilitiesDe(capacidades: readonly Capacidad[]): Record<string, unknown>[] {
  return capacidades.map((c) => c.capability);
}

/**
 * Qué CLASE de especialista es, por lo que declara su `.md` — la partición de deepagents
 * (`perfiles.ts#toolsDe` y `montajeDeFicheros`):
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

/**
 * `create_sub_agent` para un HIJO: la misma delegación que tiene el raíz, dada a quien su `.md` declara que puede
 * llamar a otro (`llama`). La librería crea el nieto igual que cualquier hijo y su respuesta vuelve a quien lo
 * llamó. El nombre no se restringe aquí —el esquema de la tool es un texto libre—: lo hace la fábrica de hijos de la
 * sesión, que no concede a quien no está en su lista.
 */
export function capacidadDeSubagentes(): Capacidad {
  return {
    nombre: "subagentes",
    tools: ["create_sub_agent"],
    capability: dynamicSubAgents({ sandboxAvailable: false, tracing: NOOP_AGENT_TRACING }) as unknown as Record<string, unknown>,
  };
}

/**
 * Avisa a quien lleva un LAZO (escribir, comprobar, corregir) de cuántas comprobaciones lleva, por
 * `preLLMProcessors`: al llegar a cada umbral se le añade UN mensaje de usuario, y no otro más hasta el siguiente.
 *
 * Existe porque «tres vueltas» estaba solo en el prompt del desarrollador y una pasada real hizo seis llamadas al
 * conductor: un texto no es un contador. Y el aviso no dice «para», dice «cambia de procedimiento»: repetir la
 * misma familia de fallo con otra reescritura completa es lo que se vio (un control que falta, y al arreglarlo,
 * otro), y lo que hay que hacer es aislar la causa, no cortar. No añade tools.
 */
export function capacidadDeAvisoDeVueltas(opciones: {
  vueltasDe: (hilo: string) => number;
  umbrales: readonly number[];
  texto: (vueltas: number) => string;
}): Capacidad {
  const avisados = new Map<string, Set<number>>();
  return {
    nombre: "vueltas",
    tools: [],
    capability: {
      preLLMProcessors: [
        {
          async *processPreLLM(execution: { threadId: string }) {
            const n = opciones.vueltasDe(execution.threadId);
            const ya = avisados.get(execution.threadId) ?? new Set<number>();
            const toca = [...opciones.umbrales].filter((u) => n >= u && !ya.has(u));
            if (toca.length === 0) return;
            for (const u of toca) ya.add(u);
            avisados.set(execution.threadId, ya);
            yield { type: "internal.agent.context.append", context: [{ role: "user", content: opciones.texto(n) }], output: [] };
          },
        },
      ],
    },
  };
}

/** Lo que el backend y las tools de la sesión ponen para montar a un especialista. */
export interface DependenciasDelEspecialista {
  backend: BackendDeFicheros & EscritorDeDesalojo;
  /** Las tools propias que le tocan a ESTE agente (el reparto vive en la sesión). */
  propias: (agente: Agente) => readonly ToolDeLangchain[];
  /** El backend CON shell, montado solo para quien ejecuta. */
  conShell: () => { execute(c: string): unknown; write(ruta: string, contenido: string): unknown };
  /** El aparato de la sesión para la guarda del `execute` (IXCODE-32). Ausente = ninguno elegido. */
  dispositivo?: () => DispositivoDeLaSesion | undefined;
  /** La cola de notas de la SESIÓN, ya envuelta: la misma instancia para todos los hijos. */
  notas: Capacidad;
  /** ¿Puede ESTE agente llamar a otros? Lo decide la sesión (su `.md` y el interruptor); ausente es que no. */
  puedeLlamar?: (agente: Agente) => boolean;
  /** El aviso de vueltas de ESTE agente, si lleva un lazo. Ausente es que no lo lleva. */
  vueltas?: (agente: Agente) => Capacidad | undefined;
  /** Lo que escribieron los hijos que ESTE agente llame (`informesDeHijos.ts`): solo para quien puede llamar. */
  informes?: Capacidad;
  /** Las tools de los conectores MCP que le tocan a ESTE agente (el reparto vive en la sesión). */
  conectores?: (agente: Agente) => readonly Capacidad[];
}

/**
 * Las piezas de un especialista —o del hijo genérico, si el nombre no es de ninguno—, sin sus
 * instrucciones: esas se escriben con la lista de tools que salga de aquí.
 */
export function capacidadesDelEspecialista(
  agente: Agente | undefined,
  nombrePedido: string,
  deps: DependenciasDelEspecialista
): Capacidad[] {
  // Un nombre inventado da un hijo de SOLO LECTURA sin shell: no tumba el turno ni se lleva la escritura.
  if (agente === undefined) {
    return [
      capacidadDeFicheros({ backend: deps.backend, reglas: permisosDe({ nombre: nombrePedido, soloLectura: true }), tools: TOOLS_DE_LECTURA, conAprobacion: false }),
      capacidadDeRecortes(deps.backend),
      capacidadDeFecha(),
      deps.notas,
    ];
  }
  const clase = clasesDeTools(agente);
  const reglas = permisosDe(agente);
  const propias = deps.propias(agente);
  return [
    capacidadDeFicheros({
      backend: deps.backend,
      reglas,
      tools: clase === "ejecuta" ? TOOLS_DE_LECTURA : TOOLS_DE_FICHERO,
      conAprobacion: clase === "escribe",
    }),
    // `incorporar_adjunto` ESCRIBE el proyecto: si está entre las propias, pide aprobación como
    // `write_file` (el HITL de deepagents la tiene por NOMBRE, `perfiles.ts#hitlDe`). Sin esto la
    // tool copiaría en cuanto el modelo la pidiera.
    ...(propias.length > 0
      ? [capacidadDePropias(propias, deps.backend, propias.some((t) => t.name === NOMBRE_INCORPORAR_ADJUNTO) ? [NOMBRE_INCORPORAR_ADJUNTO] : [])]
      : []),
    ...(clase === "ejecuta" ? [capacidadDeEjecucion(deps.conShell(), deps.dispositivo)] : []),
    ...(deps.conectores?.(agente) ?? []),
    ...(deps.puedeLlamar?.(agente) === true ? [capacidadDeSubagentes(), ...(deps.informes === undefined ? [] : [deps.informes])] : []),
    ...(deps.vueltas?.(agente) === undefined ? [] : [deps.vueltas(agente)!]),
    capacidadDeRecortes(deps.backend),
    capacidadDeFecha(),
    deps.notas,
    // OpenUI lo trae su skill: quien la declara recibe la tool. Solo en nuestro motor —un hijo
    // externo no pasa por estas capabilities, y la skill le dice que sin la tool no lo use—.
    ...(agente.skills.includes(SKILL_DE_OPENUI) ? [capacidadDeOpenui()] : []),
  ];
}
