import { createDeepAgent, createFilesystemMiddleware } from "deepagents";
import { MemorySaver } from "@langchain/langgraph";
import { backendConSkills, backendDelProyecto, exponerMemoriaDeProyecto, sinVistasAplanadas } from "./proyecto.js";
import { PERFILES, permisosDe, hitlDe } from "./perfiles.js";
import { middlewareTextoDeTool } from "./textoDeTool.js";
import { resumenDeContexto } from "./resumenDeContexto.js";
import { createTokenTrackingMiddleware, type TokenTracker } from "../vendor/tokenTracking.js";
import type { SkillsPort, ModelosPort } from "../core/ports.js";

export interface OpcionesDelAgente {
  raiz: string;
  /** Todas las rutas del proyecto, para saber cuáles son vistas aplanadas. */
  ficheros: ReadonlySet<string>;
  modelos: ModelosPort;
  skills: SkillsPort;
  checkpointer?: MemorySaver;
  /** Opcional porque no siempre se viene a contar gasto; sin él la barra de estado enseña 0. */
  tracker?: TokenTracker;
}

export const PROMPT_ORQUESTADOR = [
  "Eres el orquestador de un harness de desarrollo para la plataforma XOne.",
  "NO tienes herramientas: tu único trabajo es entender la petición y delegar.",
  "Delega en `docs` las preguntas técnicas de la plataforma; en `planner` lo que",
  "exija inspeccionar el proyecto; en `dev` el desarrollo; en `mockup` lo visual.",
  "Para diagramas o esquemas de la app, delega en `mockup`; si deben reflejar el",
  "código real, encarga a `planner` el análisis y usa su resultado antes de dibujar.",
  "Cuando varias tareas sean independientes, delégalas EN EL MISMO mensaje para",
  "que corran a la vez.",
  "No afirmes que un cambio se ha aplicado si no te lo ha confirmado el especialista.",
].join(" ");

/**
 * Indicaciones que el modelo recibe junto a las tools reales de fichero.
 *
 * No crean herramientas ni rebajan permisos: hacen explícito el destino correcto
 * para que una skill no confunda su propia carpeta de instrucciones con la salida.
 */
export const DESCRIPCIONES_FICHEROS = {
  write_file: [
    "Escribe un fichero del proyecto en una ruta absoluta.",
    "Para diagramas, esquemas, arquitecturas y flujos: carga primero la skill `archify`;",
    "no escribas nunca dentro de `/skills`. Si el usuario pide el resultado renderizado,",
    "guárdalo como HTML autocontenido en `/artifacts/<nombre>.html`.",
    "Para dashboards, informes o tablas HTML interactivas carga `artifacts-builder` y usa",
    "también `/artifacts/<nombre>.html`. La ruta `/MEMORIA_PROYECTO.md` es exclusivamente",
    "para hechos confirmados, decisiones y pendientes útiles; no guardes transcripciones ni secretos.",
  ].join(" "),
  edit_file: [
    "Modifica un fichero existente del proyecto en una ruta absoluta.",
    "No modifiques `/skills`: son instrucciones de solo lectura. Para actualizar la memoria",
    "usa solo `/MEMORIA_PROYECTO.md` y conserva su contenido útil.",
  ].join(" "),
  grep: [
    "Busca texto LITERAL (no regex) de forma progresiva para ahorrar contexto.",
    "Primero acota con `path` y `glob`; para localizar candidatos usa",
    "`output_mode=\"files_with_matches\"` o `output_mode=\"count\"`.",
    "Usa `output_mode=\"content\"` solo con un patrón específico y lee después",
    "el fragmento necesario con `read_file` (offset y limit). La búsqueda devuelve",
    "como máximo 100 coincidencias salvo que justifiques subir `max_count`.",
  ].join(" "),
};

/**
 * Presupuesto de las herramientas de ficheros.
 *
 * DeepAgents 1.13 incorpora `max_count` y `output_mode` en `grep`. El valor por
 * defecto de la librería (1.000) sigue siendo demasiado generoso para un agente
 * que explora proyectos XOne: 100 resultados bastan para localizar candidatos y
 * el modelo puede subirlo explícitamente en una búsqueda excepcional.
 *
 * A partir de 6k tokens la salida se conserva bajo `/large_tool_results/` y se
 * sustituye por una referencia paginable. Así una lectura o búsqueda accidental
 * no consume toda la ventana antes de que actúe el resumen de conversación.
 */
export const OPCIONES_BUSQUEDA_FICHEROS = {
  grepMaxCount: 100,
  toolTokenLimitBeforeEvict: 6_000,
} as const;

/**
 * El agente real.
 *
 * Cuatro decisiones que no son negociables, y las cuatro están medidas o impuestas por la
 * librería (ver `DISENO.md` §14.3 y el patrón de `runtime.ts`):
 *
 * 1. **El backend va confinado** (`virtualMode: true`) y envuelto para que las vistas
 *    aplanadas no existan.
 * 2. **El orquestador no recibe ninguna tool.** Si las tuviera haría el trabajo él mismo y
 *    se comería el catálogo entero en su prompt.
 * 3. **Se ocupa el nombre `general-purpose`** para eliminar el destino que la librería
 *    añade sola: sin capacidad XOne, sus respuestas serían inventadas. Está medido que
 *    ocupar el nombre lo sustituye en el catálogo (`agent/generalPurpose.test.ts`).
 * 4. **El HITL va en las tools de fichero**, que en la v1 son las que escriben.
 */
export async function construirAgente(opciones: OpcionesDelAgente): Promise<unknown> {
  const backend = backendConSkills(
    sinVistasAplanadas(exponerMemoriaDeProyecto(backendDelProyecto(opciones.raiz)), opciones.ficheros)
  );

  // Si no hay tracker, no se añade el middleware: es opcional a propósito arriba.
  const middlewareTracker = opciones.tracker ? [createTokenTrackingMiddleware(opciones.tracker)] : [];

  const subagentes = Object.values(PERFILES).map((perfil) => ({
    name: perfil.nombre,
    description: perfil.descripcion,
    systemPrompt: promptDe(perfil.nombre, opciones.skills),
    // Los subagentes no heredan las skills del orquestador. Se entregan como fuentes
    // directas para mantener cada perfil limitado a su catálogo declarado.
    skills: rutasDeSkills(perfil.nombre, opciones.skills),
    // **NO se pasa `tools`.** Era un bug: `SubAgent.tools` es `StructuredTool[]` —objetos,
    // para tools PROPIAS— y pasarle los NOMBRES de las de fichero las sustituía por
    // cadenas, dejando al especialista sin ninguna capacidad real. Compilaba (por el
    // `as any` de `createDeepAgent`) y reventaba al ejecutar.
    //
    // Las tools de fichero las monta el `FilesystemMiddleware` a partir del backend, y
    // quien las acota por NOMBRE es su propia opción `tools` (con la restricción de que
    // `read_file` tiene que estar siempre). Aquí el solo-lectura se impone con
    // `permissions`, que la librería aplica sobre `ls`, `read_file`, `write_file`,
    // `edit_file`, `glob` y `grep` — o sea, sobre todas las que importan.
    permissions: permisosDe(perfil),
    interruptOn: hitlDe(perfil),
    // En CADA especialista, no solo en el orquestador: son ellos los que llaman a las
    // tools de fichero, así que es su siguiente llamada al modelo la que reventaba.
    // El nombre coincide con el middleware por defecto de DeepAgents y lo sustituye: así
    // aplica tanto al especialista como al orquestador.
    middleware: [
      createFilesystemMiddleware({
        backend,
        permissions: permisosDe(perfil),
        customToolDescriptions: DESCRIPCIONES_FICHEROS,
        ...OPCIONES_BUSQUEDA_FICHEROS,
      }),
      resumenDeContexto(backend),
      middlewareTextoDeTool(),
      ...middlewareTracker,
    ],
    model: opciones.modelos.paraPapel(perfil.soloLectura ? "rapido" : "trabajo"),
  }));

  return createDeepAgent({
    model: opciones.modelos.paraPapel("rapido"),
    systemPrompt: PROMPT_ORQUESTADOR,
    backend,
    checkpointer: opciones.checkpointer ?? new MemorySaver(),
    // El contenido de los `ToolMessage` va como TEXTO al modelo. Sin esto, un turno real
    // revienta tras 8-10 tools con «Non string tool message content is not supported» —
    // y no es de langchain ni de deepagents, sino de `@langchain/ollama` (ver
    // `textoDeTool.ts`). Medido con dos modelos, nube y local.
    middleware: [
      createFilesystemMiddleware({
        backend,
        customToolDescriptions: DESCRIPCIONES_FICHEROS,
        ...OPCIONES_BUSQUEDA_FICHEROS,
      }),
      resumenDeContexto(backend),
      middlewareTextoDeTool(),
      ...middlewareTracker,
    ],
    subagents: [
      ...subagentes,
      {
        name: "general-purpose",
        description: "NO USAR. No tiene ninguna capacidad de XOne, así que cualquier respuesta sobre el proyecto o la plataforma sería inventada.",
        systemPrompt: "No tienes ninguna herramienta. Responde SIEMPRE que la tarea debe delegarse a docs, planner, dev o mockup.",
        tools: [],
      },
    ],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

/**
 * El prompt de un especialista, con sus skills dentro.
 *
 * Provisional a propósito: los prompts pasan a ficheros `.md` en la fase 9, y hasta
 * entonces vivir aquí es mejor que vivir repartidos.
 */
export function promptDe(nombre: string, skills: SkillsPort): string {
  const perfil = PERFILES[nombre as keyof typeof PERFILES];
  const disponibles = new Set(skills.catalogo().map((s) => s.nombre));
  const suyas = perfil.skills.filter((s) => disponibles.has(s));
  const faltan = perfil.skills.filter((s) => !disponibles.has(s));

  return [
    perfil.descripcion,
    "",
    "REGLAS DE XONE, no negociables:",
    "- No es desarrollo web: no existen DOM, React, Vue, ni `async/await` en el runtime.",
    "- La fuente de una colección es su `.xne`. Los `.xml` los genera Studio y no se tocan.",
    "- No inventes atributos XML, funciones ni propiedades CSS: XOne ignora lo desconocido",
    "  en silencio, así que un invento no da error — da un bug mudo.",
    "",
    "SKILLS VISUALES:",
    "- REGLA DE PRIORIDAD: para un diagrama, esquema, arquitectura, flujo, secuencia, datos o estados,",
    "  usa solamente `archify`. No cargues ni uses `artifacts-builder` como sustituto.",
    "- Solo si, ADEMÁS del diagrama, el usuario pide un contenedor HTML interactivo, usa `artifacts-builder`",
    "  después de decidir el diagrama con `archify`. Guárdalo en `/artifacts/<nombre>.html`; no escribas",
    "  jamás dentro de `/skills` ni menciones una tool que no tienes.",
    "- Si te piden un dashboard, informe, tabla o artefacto HTML interactivo, carga primero `artifacts-builder`.",
    "- Apóyate en el código real antes de dibujar: no inventes nombres, componentes ni flujos.",
    "",
    nombre === "docs"
      ? ""
      : "Para una tarea sobre este proyecto, lee una sola vez `/MEMORIA_PROYECTO.md` antes de inspeccionarlo. " +
        "No la uses para preguntas generales de plataforma.",
    perfil.soloLectura || nombre === "docs"
      ? ""
      : "Al terminar trabajo relevante, actualiza esa memoria solo con hechos comprobados, decisiones aprobadas " +
        "o pendientes útiles. Nunca copies transcripciones, salidas de tools, secretos ni ficheros completos.",
    "",
    suyas.length ? `Tus skills: ${suyas.join(", ")}. Cárgalas antes de responder.` : "",
    // Patrón 4: un doble nunca se disfraza. Si falta una skill, se dice — no se calla.
    faltan.length ? `AVISO: te faltan estas skills y no las tienes: ${faltan.join(", ")}.` : "",
    perfil.soloLectura ? "No modificas nada." : "Tus escrituras requieren aprobación humana. Si te la rechazan, no insistas: explica qué pretendías y por qué.",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Rutas virtuales que SkillsMiddleware carga de forma progresiva para un perfil. */
export function rutasDeSkills(nombre: string, skills: SkillsPort): string[] {
  const perfil = PERFILES[nombre as keyof typeof PERFILES];
  const disponibles = new Set(skills.catalogo().map((s) => s.nombre));
  return perfil.skills.filter((skill) => disponibles.has(skill)).map((skill) => `/skills/${skill}/`);
}
