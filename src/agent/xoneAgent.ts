import { createDeepAgent, createFilesystemMiddleware } from "deepagents";
import { promptDeAgente, repartirSkills, type Agente } from "../core/agentes.js";
import type { MotorExterno, SubagenteExternoPort } from "../core/ports.js";
import { RunnableLambda } from "@langchain/core/runnables";
import { AIMessage, type BaseMessage } from "@langchain/core/messages";
import { MemorySaver } from "@langchain/langgraph";
import type { BaseCheckpointSaver } from "@langchain/langgraph-checkpoint";
import { backendDeAgente } from "./proyecto.js";
import type { Artefacto } from "../core/artefactos.js";
import { permisosDe, hitlDe, type QuienDecidePermisos } from "./perfiles.js";
import { crearBusquedaRegex } from "./busquedaRegex.js";
import { inventarioDelProyecto } from "./escrituraExterna.js";
import type { DiagnosticoDeTools } from "./diagnosticoDeTools.js";
import { middlewareTextoDeTool } from "./textoDeTool.js";
import { resumenDeContexto } from "./resumenDeContexto.js";
import { createTokenTrackingMiddleware, type TokenTracker } from "../vendor/tokenTracking.js";
import type { SkillsPort, ModelosPort } from "../core/ports.js";

export interface OpcionesDelAgente {
  raiz: string;
  /** Todas las rutas del proyecto, para saber cuáles son vistas aplanadas. */
  ficheros: ReadonlySet<string>;
  /**
   * Los subagentes, ya leídos de disco (`agent/agentesEnDisco.ts`). Entran por parámetro y
   * no se leen aquí por la misma razón que todo lo demás: quien construye el agente no
   * toca el disco, y así un test puede montar los que quiera sin escribir ficheros.
   *
   * Puede venir VACÍO, y entonces el orquestador se queda sin nadie a quien delegar. No se
   * rellena con los de serie a espaldas de nadie: si el usuario borró los cuatro, la
   * consola tiene que decírselo, no fingir que siguen ahí.
   */
  agentes: readonly Agente[];
  /**
   * Quien lanza los agentes de otro producto (Claude Code). Puerto por lo de siempre:
   * `npm test` no puede necesitar un binario instalado, y ni este fichero ni `turnoReal`
   * pueden saber que Claude Code existe — la misma regla que con las tools de CloudStudio.
   */
  subagenteExterno: SubagenteExternoPort;
  modelos: ModelosPort;
  skills: SkillsPort;
  /** `BaseCheckpointSaver` y no `MemorySaver`: desde que hay uno persistente
   *  (`agent/checkpointer.ts`) el tipo tiene que ser el de la interfaz, no el del doble. */
  checkpointer?: BaseCheckpointSaver;
  /** Opcional porque no siempre se viene a contar gasto; sin él la barra de estado enseña 0. */
  tracker?: TokenTracker;
  /** Registro local opt-in de llamadas y uso; nunca llega al modelo. */
  diagnostico?: DiagnosticoDeTools;
  /**
   * Dónde caen los artefactos de la sesión (`/artefactos/` para el agente). Es una carpeta
   * de `.xonecode/`, o sea FUERA del proyecto: ver `core/artefactos.ts`. Ausente = no se
   * monta la carpeta, y entonces un `write_file` a `/artefactos/…` es un fichero más del
   * proyecto — que es lo que pasaba antes de que esto existiera.
   */
  artefactos?: { carpeta: string; alEscribir: (a: Artefacto) => void };
  /**
   * La carpeta de los ADJUNTOS de una tarea (`/adjuntos/` para el agente), de solo lectura.
   * Es de `~/.xonecode/tareas/<id>/`, o sea fuera del proyecto: ver `core/adjuntos.ts`.
   *
   * Ausente = no se monta, que es el caso de toda sesión de persona y de toda tarea sin
   * adjuntos. Entonces esa ruta no es nada, y lo que evita que un `write_file` a
   * `/adjuntos/x` acabe siendo un fichero del proyecto es la denegación incondicional de
   * `permisosDe` (medido: sin ella lo era).
   */
  adjuntos?: string;
}

/**
 * El prompt del orquestador, GENERADO a partir de los subagentes que hay.
 *
 * Era una constante que nombraba a `docs`, `planner`, `dev` y `mockup` a pelo. Desde que los
 * subagentes son ficheros que el usuario escribe y borra, eso se queda mintiendo el primer
 * día: mandarle delegar en `mockup` cuando `mockup` no existe es la misma clase de botón
 * muerto que este repo lleva semanas quitando de la interfaz.
 *
 * Lo que se conserva es lo GENERAL —no tienes tools, delega, encadena con handoff, no
 * afirmes lo que no te han confirmado—, y lo específico sale de la propia lista. La línea
 * del encadenado para diagramas solo se escribe si existen los dos agentes de los que
 * habla: una instrucción sobre un especialista que no está no la puede seguir nadie.
 */
/**
 * Quién es el orquestador a efectos de permisos: SOLO LECTURA.
 *
 * Es un `QuienDecidePermisos` y no un `Agente` porque el orquestador no es un especialista
 * —no se puede dar de alta, ni borrar, ni editar desde Ajustes—, pero sus tools de fichero
 * son las mismas y tienen que pasar por la misma función. Ver dónde se usa, en
 * `construirAgente`, para el agujero que esto cierra.
 */
export const PERFIL_DEL_ORQUESTADOR: QuienDecidePermisos = { nombre: "orquestador", soloLectura: true };

export function promptOrquestador(agentes: readonly Agente[]): string {
  const hay = (n: string): boolean => agentes.some((a) => a.nombre === n);
  return [
    "Eres el orquestador de un harness de desarrollo para la plataforma XOne.",
    // Decía «NO tienes herramientas», y era falso: tiene las seis de fichero. Ahora son de
    // SOLO LECTURA (`PERFIL_DEL_ORQUESTADOR`), así que la frase dice lo que de verdad puede.
    "NO tienes herramientas para MODIFICAR nada: tu único trabajo es entender la petición y delegar.",
    agentes.length === 0
      ? "AVISO: ahora mismo no hay ningún especialista dado de alta, así que no puedes delegar en nadie. Dilo en vez de intentar resolverlo tú."
      : `Los especialistas disponibles son: ${agentes.map((a) => a.nombre).join(", ")}. Elige por su descripción.`,
    hay("planner") && hay("mockup")
      ? "Para diagramas o esquemas de la app, delega en `mockup`; si deben reflejar el código real, encarga PRIMERO el análisis a `planner` y usa su resultado antes de dibujar."
      : "",
    "Los especialistas no comparten el transcript: al encadenarlos, incluye en la descripción",
    "de la siguiente `task` un bloque `HANDOFF DE PLANNER` compacto con los hechos verificados,",
    "rutas/evidencias y lagunas. No pidas al siguiente especialista redescubrir esos hechos.",
    "Cuando varias tareas sean independientes, delégalas EN EL MISMO mensaje para",
    "que corran a la vez.",
    "No afirmes que un cambio se ha aplicado si no te lo ha confirmado el especialista.",
  ]
    .filter((l) => l !== "")
    .join(" ");
}

/**
 * Indicaciones que el modelo recibe junto a las tools reales de fichero.
 *
 * No crean herramientas ni rebajan permisos: hacen explícito el destino correcto
 * para que una skill no confunda su propia carpeta de instrucciones con la salida.
 */
export const DESCRIPCIONES_FICHEROS = {
  read_file: [
    "Lee únicamente el fragmento de un fichero necesario para responder.",
    "Indica siempre `offset` y `limit`; para el reconocimiento inicial usa",
    "`offset=0, limit=50`. No releas la misma ruta y el mismo rango: usa la",
    "evidencia ya obtenida o una página distinta solo si hace falta.",
  ].join(" "),
  write_file: [
    "Escribe un fichero del proyecto en una ruta absoluta.",
    "Para diagramas, esquemas, arquitecturas y flujos: carga primero la skill `archify`;",
    "no escribas nunca dentro de `/skills`. Si el usuario pide el resultado renderizado,",
    "guárdalo como HTML autocontenido en `/artefactos/<nombre>.html`.",
    "Para dashboards, informes o tablas HTML interactivas carga `artifacts-builder` y usa",
    "también `/artefactos/<nombre>.html`. `/artefactos/` NO es del proyecto: es la carpeta de",
    "esta sesión, no pasa por aprobación, no entra en git y no sube a CloudStudio — un HTML",
    "escrito fuera de ella acaba dentro de la app XOne del usuario. La ruta",
    "`/MEMORIA_PROYECTO.md` es exclusivamente",
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
 *
 * **Esa carpeta se monta FUERA del proyecto** (`core/descargas.ts`,
 * `agent/proyecto.ts#backendConDescargas`), y hasta el 10-09-2026 no: la escribe la librería
 * llamando al backend directamente, esa ruta no estaba montada en ninguna parte y caía en el
 * `FilesystemBackend` de la raíz. Medido en el AppDemo real del usuario, 26 KB de salida
 * cruda de una tool dentro de la app XOne y commiteados. Bajar este tope no era el arreglo:
 * el desalojo es la función, el fallo era el sitio.
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
  // Las cuatro capas y su orden están en `backendDeAgente`, que vive en `proyecto.ts` para
  // poder PROBARSE: aquí no había forma, porque `construirAgente` se simula en todos los
  // tests que lo tocan y el cableado se quedaba sin nadie mirándolo.
  const backend = backendDeAgente({
    raiz: opciones.raiz,
    ficheros: opciones.ficheros,
    ...(opciones.artefactos === undefined ? {} : { artefactos: opciones.artefactos }),
    ...(opciones.adjuntos === undefined ? {} : { adjuntos: opciones.adjuntos }),
  });

  // Si no hay tracker, no se añade el middleware: es opcional a propósito arriba.
  const middlewareTracker = (origen: string) =>
    opciones.tracker
      ? [createTokenTrackingMiddleware(opciones.tracker, (uso) => opciones.diagnostico?.modelo(origen, uso))]
      : [];

  // El catálogo, una vez por construcción y no una por agente: `catalogo()` es un puerto y
  // llamarlo N veces para preguntarle lo mismo es trabajo por nada.
  const catalogoDeSkills = new Set(opciones.skills.catalogo().map((s) => s.nombre));

  /**
   * Los que corren FUERA: Claude Code y compañía.
   *
   * Entran como `CompiledSubAgent` —`{name, description, runnable}`, que deepagents acepta
   * junto a los normales— y no como `SubAgent`: eso último es modelo + prompt + tools, y
   * aquí no hay modelo nuestro que poner. Con esto los tres motores llegan al orquestador
   * por el MISMO `task`, y él no tiene que saber de qué está hecho cada especialista.
   *
   * Se pregunta si el motor está DISPONIBLE antes de montarlo. Un especialista que el
   * orquestador puede elegir y que revienta en cuanto lo elige es un botón muerto dentro del
   * grafo: peor que uno de interfaz, porque el que lo pulsa es el modelo y se lo cree.
   */
  const externos = [];
  for (const agente of opciones.agentes.filter((a) => a.motor !== "modelo")) {
    const motor = agente.motor as MotorExterno;
    if (!(await opciones.subagenteExterno.disponible(motor))) continue;
    externos.push({
      name: agente.nombre,
      description: agente.descripcion,
      runnable: RunnableLambda.from(async (entrada: { messages?: BaseMessage[] }) => {
        // La tarea es el último mensaje que le pasa el orquestador. El hijo no comparte
        // transcript —es un proceso aparte, con su propia sesión—, así que lo que no venga
        // en esa descripción no existe para él: es la misma regla del handoff que el prompt
        // del orquestador ya impone entre especialistas.
        const ultimo = entrada.messages?.at(-1);
        const tarea = typeof ultimo?.content === "string" ? ultimo.content : String(ultimo?.content ?? "");
        const texto = await opciones.subagenteExterno.correr({
          motor,
          cwd: opciones.raiz,
          /**
           * Sus instrucciones MÁS el inventario del proyecto. Ese añadido no es un lujo: un
           * hijo de Claude Code no tiene ninguna herramienta para listar carpetas —medido—,
           * así que sin él lee a ciegas nombres inventados y concluye que el proyecto está
           * vacío. Se le dice lo que el harness ya sabe, que es el patrón de `/adjuntos/`.
           */
          instrucciones: `${promptDeAgente(agente, repartirSkills(agente, catalogoDeSkills))}\n\n${inventarioDelProyecto(opciones.ficheros)}`,
          tarea,
          // El modelo del producto que pida su `.md`, si pide alguno. Ausente = el que el
          // agente externo use por su cuenta, que es lo de siempre.
          ...(agente.modelo === undefined ? {} : { modelo: agente.modelo }),
          /**
           * Lo que diga su `.md`, y nada más. Es la PRIMERA de dos puertas: con esto en
           * cierto, cada escritura pasa además por la política de la sesión y por las
           * guardas de ruta (`agent/escrituraExterna.ts`). Un agente de solo lectura no
           * llega a preguntar.
           */
          permitirEscritura: !agente.soloLectura,
          // Para poder decir QUIÉN pide la escritura en la petición de aprobación: la tool
          // es la misma para todos los especialistas, así que sin esto el diff diría
          // «alguien quiere escribir». Es el papel del `[dev]` que `hitlDe` mete en la
          // descripción de un interrupt del grafo.
          agente: agente.nombre,
        });
        return { messages: [new AIMessage(texto)] };
      }),
    });
  }

  const subagentes = opciones.agentes
    .filter((a) => a.motor === "modelo")
    .map((perfil) => ({
    name: perfil.nombre,
    description: perfil.descripcion,
    systemPrompt: promptDeAgente(perfil, repartirSkills(perfil, catalogoDeSkills)),
    // Los subagentes no heredan las skills del orquestador. Se entregan como fuentes
    // directas para mantener cada perfil limitado a su catálogo declarado.
    skills: rutasDeSkills(perfil, catalogoDeSkills),
    // `tools` solo lleva tools PROPIAS. Pasarle los NOMBRES de las de fichero las sustituía
    // por cadenas, dejando al especialista sin ninguna capacidad real. Las de fichero las
    // monta el middleware; regex_search es una tool real y confinada al mismo backend.
    tools: [crearBusquedaRegex(backend)],
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
      ...middlewareTracker(perfil.nombre),
    ],
    // El modelo que fije el agente en su fichero, y si no lo fija, el del papel que le
    // toca por lo que hace: `rapido` para el que solo lee, `trabajo` para el que escribe.
    // Fijarlo es la excepción y no la norma — un agente con modelo escrito se queda ahí
    // aunque el usuario cambie el suyo con `/modelo`, que es justo lo que quiere quien
    // escribe «este revisor corre con Claude» y no lo que quiere nadie más.
    model:
      perfil.modelo === undefined
        ? opciones.modelos.paraPapel(perfil.soloLectura ? "rapido" : "trabajo")
        : opciones.modelos.paraModelo(perfil.modelo),
  }));

  return createDeepAgent({
    model: opciones.modelos.paraPapel("rapido"),
    systemPrompt: promptOrquestador(opciones.agentes),
    backend,
    interruptOn: hitlDe(PERFIL_DEL_ORQUESTADOR),
    checkpointer: opciones.checkpointer ?? new MemorySaver(),
    // El contenido de los `ToolMessage` va como TEXTO al modelo. Sin esto, un turno real
    // revienta tras 8-10 tools con «Non string tool message content is not supported» —
    // y no es de langchain ni de deepagents, sino de `@langchain/ollama` (ver
    // `textoDeTool.ts`). Medido con dos modelos, nube y local.
    middleware: [
      createFilesystemMiddleware({
        backend,
        /**
         * EL ORQUESTADOR VA DE SOLO LECTURA, que es lo que su propio prompt afirma.
         *
         * Esto faltaba, y fue un agujero declarado durante toda una tanda: `permissions`
         * solo lo recibían los subagentes, así que las seis tools de fichero de aquí
         * corrían sin ninguna de las denegaciones estructurales. Medido: contestaba
         * «Successfully wrote» a `/.env`, a `/skills/pwn.txt` —que aterrizaba en la
         * carpeta `skills/` de ESTE repo, o sea en las instrucciones del propio harness—
         * y, desde los adjuntos, en `~/.xonecode/tareas/<id>/adjuntos/`, fuera del
         * proyecto. Lo único que lo tapaba era el prompt, que es exactamente lo que este
         * repo no acepta como barrera. Y el HITL tampoco alcanzaba: `hitlDe` se monta por
         * subagente, así que una escritura de aquí no pasaba por ninguna aprobación.
         *
         * **Se le ponen permisos en vez de quitarle las tools**, que era la otra opción
         * sobre la mesa, y el motivo es el comentario de abajo: este middleware SUSTITUYE
         * al de por omisión de deepagents porque comparte nombre. Quitarlo podría
         * reinstalar el suyo —sin permisos— y reabrir el agujero por accidente; ponerle
         * `permissions` no puede.
         *
         * `soloLectura: true` añade `deny write /**`, así que el orquestador conserva
         * `read`/`ls`/`glob`/`grep` para orientarse y no puede tocar el disco por ninguna
         * ruta. `interruptOn` va por espejo con la rama de los subagentes: `hitlDe`
         * devuelve `{}` para un perfil de solo lectura —no hay nada que aprobar—, y
         * escribirlo aquí es lo que hace que las dos ramas se lean iguales.
         */
        permissions: permisosDe(PERFIL_DEL_ORQUESTADOR),
        customToolDescriptions: DESCRIPCIONES_FICHEROS,
        ...OPCIONES_BUSQUEDA_FICHEROS,
      }),
      resumenDeContexto(backend),
      middlewareTextoDeTool(),
      ...middlewareTracker("orquestador"),
    ],
    subagents: [
      ...subagentes,
      ...externos,
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
 * Rutas virtuales que SkillsMiddleware carga de forma progresiva para un agente.
 *
 * Recibe el AGENTE y no su nombre: antes buscaba el perfil en `PERFILES`, y con subagentes
 * escritos por el usuario ese `Record` no tiene su entrada — `perfil.skills` habría
 * reventado con «cannot read properties of undefined» en cuanto alguien creara el primero.
 *
 * Solo las que EXISTEN. Una ruta a una skill que no está haría que el middleware fallara al
 * montarla; que falte se dice en el prompt (`promptDeAgente`), que es donde se puede leer.
 */
export function rutasDeSkills(agente: Agente, disponibles: ReadonlySet<string>): string[] {
  return agente.skills.filter((skill) => disponibles.has(skill)).map((skill) => `/skills/${skill}/`);
}
