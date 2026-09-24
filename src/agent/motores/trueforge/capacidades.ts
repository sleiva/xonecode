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
import { NOOP_AGENT_TRACING, ToolSet, currentDateTime, openUI } from "./trueforge.js";
import type { Agente } from "../../../core/agentes.js";
import { permisosDe } from "../../grafo/perfiles.js";
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
import { presupuestoDelPaso, type EscritorDeDesalojo } from "./recortes.js";

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

/** Las tools propias de xonecode (`xone_navegacion`, `regex_search`…), adaptadas. */
export function capacidadDePropias(tools: readonly ToolDeLangchain[], backend: EscritorDeDesalojo): Capacidad {
  return {
    nombre: "propias",
    tools: tools.map((t) => t.name),
    capability: {
      systemToolSets: [new ToolSet({ source: fuenteDeLangchain(tools, backend) as never, selectors: SIN_APROBACION, preload: true })],
    },
  };
}

/** `execute`: la shell del que la declara en su `.md`, y de nadie más. */
export function capacidadDeEjecucion(conShell: { execute(c: string): unknown; write(ruta: string, contenido: string): unknown }): Capacidad {
  return {
    nombre: "ejecucion",
    tools: ["execute"],
    capability: { systemToolSets: [new ToolSet({ source: fuenteDeEjecucion(conShell) as never, selectors: SIN_APROBACION, preload: true })] },
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
 * `get_current_datetime` de la librería: la fecha en UTC, para que «hoy» o «hace tres días» no se
 * lo invente el modelo. No da la zona horaria local, y no se le atribuye.
 */
export function capacidadDeFecha(): Capacidad {
  return { nombre: "fecha", tools: ["get_current_datetime"], capability: currentDateTime({ tracing: NOOP_AGENT_TRACING }) as never };
}

/**
 * Lo que OpenUI tiene que saber de ESTE harness, y que su prompt no dice.
 *
 * El prompt de la librería (`openUI()`) enseña el lenguaje y su catálogo; no sabe que aquí la
 * respuesta de un especialista la lee el orquestador, que el visor no tiene red, ni lo que salió
 * de MEDIR (24-09-2026, `deepseek-flash`, tres encargos × tres pasadas contra el HTML de
 * `artifacts-builder`): el mismo artefacto con 3-14 veces menos salida, pero una pestaña que se
 * abría en la última escondiendo los errores, un gráfico que apilaba la caché con la entrada y un
 * `Card(...)` con los argumentos corridos. Cada regla de aquí es uno de esos fallos.
 */
export const REGLAS_DE_OPENUI = [
  "OpenUI en xonecode: úsalo para TABLAS, INFORMES y PANELES DE DATOS. Para diagramas, o para una pieza con análisis o estilo propios, sigue con `artifacts-builder` (HTML).",
  "- Antes de escribir OpenUI, llama a `get_openui_instructions`. El programa NO va en tu respuesta —la lee el orquestador, no una persona—: escríbelo con `write_file` en `/artefactos/<nombre>.openui` (con su valla ```openui o sin ella). Así se anuncia y se ve en la pestaña Artefactos.",
  "- Hornea los datos LITERALES en el programa: aquí no hay `Query()` ni `Mutation()`, y las acciones (`@ToAssistant`, `@OpenUrl`, botones) no hacen nada.",
  "- Sin imágenes de fuera: el visor no tiene red y no se verían.",
  "- `Tabs` solo para vistas ALTERNATIVAS de lo mismo, nunca para lo principal: el visor abre en la ÚLTIMA pestaña, y lo que pongas en las otras no se ve al abrir.",
  "- Los argumentos son POSICIONALES: repasa el orden de cada llamada. Uno corrido desplaza a todos y el programa se pinta a medias.",
  "- No inventes categorías que los datos no traen (una colección «huérfana» o «aislada» porque no tiene referencias: el índice no ve todas las formas de usarla). Y no sumes ni apiles magnitudes que se contienen: la caché de tokens va DENTRO de la entrada.",
].join("\n");

/**
 * OpenUI para quien hace ARTEFACTOS: la tool de la librería que carga sus instrucciones BAJO
 * DEMANDA (unos 5.000 tokens que no viajan en cada llamada) y, al lado, nuestras reglas.
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

/** Lo que el backend y las tools de la sesión ponen para montar a un especialista. */
export interface DependenciasDelEspecialista {
  backend: BackendDeFicheros & EscritorDeDesalojo;
  /** Las tools propias que le tocan a ESTE agente (el reparto vive en la sesión). */
  propias: (agente: Agente) => readonly ToolDeLangchain[];
  /** El backend CON shell, montado solo para quien ejecuta. */
  conShell: () => { execute(c: string): unknown; write(ruta: string, contenido: string): unknown };
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
    ...(propias.length > 0 ? [capacidadDePropias(propias, deps.backend)] : []),
    ...(clase === "ejecuta" ? [capacidadDeEjecucion(deps.conShell())] : []),
    capacidadDeRecortes(deps.backend),
    capacidadDeFecha(),
    // OpenUI va con `artifacts-builder`: lo lleva quien hace artefactos, y solo en nuestro motor
    // —un hijo externo no pasa por estas capabilities—.
    ...(agente.skills.includes("artifacts-builder") ? [capacidadDeOpenui()] : []),
  ];
}
