import { createDeepAgent } from "deepagents";
import { MemorySaver } from "@langchain/langgraph";
import { backendDelProyecto, sinVistasAplanadas } from "./proyecto.js";
import { PERFILES, permisosDe, hitlDe } from "./perfiles.js";
import { middlewareTextoDeTool } from "./textoDeTool.js";
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
  "Cuando varias tareas sean independientes, delégalas EN EL MISMO mensaje para",
  "que corran a la vez.",
  "No afirmes que un cambio se ha aplicado si no te lo ha confirmado el especialista.",
].join(" ");

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
  const backend = sinVistasAplanadas(backendDelProyecto(opciones.raiz), opciones.ficheros);

  // Si no hay tracker, no se añade el middleware: es opcional a propósito arriba.
  const middlewareTracker = opciones.tracker ? [createTokenTrackingMiddleware(opciones.tracker)] : [];

  const subagentes = Object.values(PERFILES).map((perfil) => ({
    name: perfil.nombre,
    description: perfil.descripcion,
    systemPrompt: promptDe(perfil.nombre, opciones.skills),
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
    middleware: [middlewareTextoDeTool(), ...middlewareTracker],
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
    middleware: [middlewareTextoDeTool(), ...middlewareTracker],
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
    suyas.length ? `Tus skills: ${suyas.join(", ")}. Cárgalas antes de responder.` : "",
    // Patrón 4: un doble nunca se disfraza. Si falta una skill, se dice — no se calla.
    faltan.length ? `AVISO: te faltan estas skills y no las tienes: ${faltan.join(", ")}.` : "",
    perfil.soloLectura ? "No modificas nada." : "Tus escrituras requieren aprobación humana. Si te la rechazan, no insistas: explica qué pretendías y por qué.",
  ]
    .filter(Boolean)
    .join("\n");
}