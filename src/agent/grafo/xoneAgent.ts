import { createDeepAgent, createFilesystemMiddleware } from "deepagents";
import { MAPA_DEL_PROYECTO, fichaDeAgente, promptDeAgente, repartirSkills, type Agente } from "../../core/agentes.js";
import type { MotorExterno, SubagenteExternoPort } from "../../core/ports.js";
import { RunnableLambda } from "@langchain/core/runnables";
import { AIMessage, type BaseMessage } from "@langchain/core/messages";
import { MemorySaver } from "@langchain/langgraph";
import type { BaseCheckpointSaver } from "@langchain/langgraph-checkpoint";
import { backendDeAgente, entornoDeLaShellDelProyecto } from "./proyecto.js";
import type { Artefacto } from "../../core/artefactos.js";
import { permisosDe, hitlDe, montajeDeFicheros, presupuestoDeLlamadas, puedeEjecutar, type QuienDecidePermisos } from "./perfiles.js";
import { crearBusquedaRegex } from "./busquedaRegex.js";
import { crearNavegacionXone } from "./navegacionXone.js";
import { crearCopiarArtefacto } from "./copiarArtefacto.js";
import { estilosDeDisco, indiceEnDisco, type CargarIndice } from "../navegacion/indiceEnDisco.js";
import type { CargarEstilos } from "../navegacion/estilosEnDisco.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { crearCriticaVisual } from "./criticaVisual.js";
import { crearTraerDeLaMaquina } from "./traerDeLaMaquina.js";
import { invocarVisualConModelos } from "../dispositivos/juezVisual.js";
import { inventarioDelProyecto } from "../subagentes/escrituraExterna.js";
import type { DiagnosticoDeTools } from "../turno/diagnosticoDeTools.js";
import { middlewareTextoDeTool } from "../turno/textoDeTool.js";
import { resumenConEncargo, topeDeLlamadas, topeDeTools, TOPE_DE_TOOLS_DEL_ORQUESTADOR } from "../turno/resumenDeContexto.js";
import { middlewareDeRubrica, type Calificador } from "../turno/rubrica.js";
import { inspectorDePrompt } from "../turno/inspectorDePrompt.js";
import { excluirTools, toolsQueNoUsa } from "./excluirTools.js";
import {
  createTokenTrackingMiddleware,
  type AlContarTokens,
  type TokenTracker,
} from "../../vendor/tokenTracking.js";
import type { SkillsPort, ModelosPort } from "../../core/ports.js";

export interface OpcionesDelAgente {
  raiz: string;
  /** Todas las rutas del proyecto, para saber cuáles son vistas aplanadas. */
  ficheros: ReadonlySet<string>;
  /**
   * Se avisa en cada llamada al modelo, DESPUÉS de que el tracker se actualice.
   *
   * No lleva el uso dentro a propósito: quien escucha tiene el tracker —es él quien lo
   * pasó— y dos fuentes para el mismo número son dos números que divergen.
   */
  alContarTokens?: () => void;
  /**
   * Los subagentes, ya leídos de disco (`agent/subagentes/agentesEnDisco.ts`). Entran por parámetro y
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
  /**
   * De dónde sale el índice de navegación XOne. Ausente = el real, leyendo el proyecto con
   * `xone-linter`. Entra por aquí para que un test pueda doblarlo sin proyecto en disco.
   */
  navegacion?: CargarIndice;
  /** El resolvedor de estilos. Ausente, el de disco sobre `raiz`. Doblable como el índice. */
  estilos?: CargarEstilos;
  /**
   * Quién juzga si lo hecho cumple la rúbrica del encargo, si es que hay rúbrica.
   *
   * Ausente = no se monta el bucle, y ese es el caso normal. El middleware además no hace nada
   * sin rúbrica en el estado, así que hay dos puertas y las dos son datos: quien no lo use no
   * paga ni una llamada. Entra por parámetro porque llama a un modelo, y el invariante de
   * `npm test` es que nada de eso haga falta para probar el harness.
   */
  calificador?: Calificador;
  /** `BaseCheckpointSaver` y no `MemorySaver`: desde que hay uno persistente
   *  (`agent/sesiones/checkpointer.ts`) el tipo tiene que ser el de la interfaz, no el del doble. */
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
    // El mapa lo ve él TAMBIÉN, y no solo los especialistas: desde que contesta lo que puede
    // en vez de delegarlo todo, es quien más lo necesita.
    MAPA_DEL_PROYECTO,
    // Decía «NO tienes herramientas», y era falso: tiene las seis de fichero. Ahora son de
    // SOLO LECTURA (`PERFIL_DEL_ORQUESTADOR`), así que la frase dice lo que de verdad puede.
    //
    // Y decía «tu único trabajo es delegar», que era falso por el otro lado y CARO: medido con
    // el banco (`docs/bancos/2026-09-17-base.json`), la misma pregunta de estructura costaba
    // 9.462 tokens contestada aquí y 38.198 delegada, con la MISMA respuesta buena. Delegar es
    // un viaje entero de ida y vuelta con el prompt de un especialista detrás, así que para lo
    // que se resuelve con un `grep` no compra nada. La regla es explícita en las dos
    // direcciones porque «puedes leer» a secas no le quitaba la orden de delegar siempre.
    "NO tienes herramientas para MODIFICAR nada, pero SÍ para LEER y BUSCAR.",
    "Si la pregunta se contesta mirando el proyecto —dónde se declara algo, qué colecciones hay,",
    "qué valor tiene un atributo, qué fichero incluye a cuál—, CONTÉSTALA TÚ: busca con `grep` y",
    "lee lo justo. Delegar cuesta varias veces más y no la contesta mejor.",
    "Delega cuando haya que ESCRIBIR ficheros (tú no puedes), cuando el encargo tenga varios",
    "pasos, o cuando haga falta el criterio de un especialista.",
    agentes.length === 0
      ? "AVISO: ahora mismo no hay ningún especialista dado de alta, así que no puedes delegar en nadie. Dilo en vez de intentar resolverlo tú."
      : `Los especialistas disponibles son: ${agentes.map((a) => a.nombre).join(", ")}. La ficha de cada uno —qué sabe hacer y qué devuelve— va en la descripción de \`task\`; léela antes de elegir.`,
    /**
     * **Que puede ENCADENARLOS, y que la cadena la compone él.**
     *
     * Hasta aquí solo había reglas de secuencia escritas a mano —los diagramas y la del
     * aparato—, o sea que cualquier encargo que no encajara en esas dos se resolvía con una
     * sola delegación. Esto no añade una tercera regla: le dice la FORMA (entender → hacer →
     * comprobar) y le deja montar la cadena con las fichas que ya tiene, que es lo que hace
     * que un especialista nuevo del usuario entre solo en el reparto.
     */
    "Un encargo grande no es UNA delegación: móntalo como una cadena, y la cadena la eliges tú",
    "leyendo las fichas — primero quien ENTIENDE (los que solo leen), luego quien HACE (los que",
    "escriben) y al final quien COMPRUEBA (los que alcanzan la máquina o el aparato). Salta las",
    "etapas que no hagan falta y no inventes las que no tengas: si nadie puede comprobar algo,",
    "dilo en vez de darlo por bueno.",
    hay("analyst-xone") && hay("designer-xone")
      ? "Para diagramas o esquemas de la app, delega en `designer-xone`; si deben reflejar el código real, encarga PRIMERO el análisis a `analyst-xone` y usa su resultado antes de dibujar."
      : "",
    /**
     * **La cadena de un DESARROLLO, que era la que faltaba por nombre.**
     *
     * Había dos reglas nombradas —los diagramas y el aparato— y para «cambia el proyecto»
     * solo la forma abstracta de arriba. Medido en las sesiones reales del usuario: de 68
     * delegaciones, `analyst-xone` salió UNA vez, y NINGÚN proyecto tiene un solo plan en
     * `.xonecode/planes/`. El turno de «crear una opción nueva en el drawer» empezó
     * directamente en `developer-xone` y acabó en diez delegaciones dando tumbos entre
     * escribir y probar.
     *
     * No es que el reparto esté mal escrito: es que aquí compiten dos reglas medidas que
     * empujan al revés —«contéstala tú, delegar cuesta más» y los hechos del proyecto ya
     * precargados en la petición, que le dan la sensación de estar orientado— y la cadena
     * abstracta pierde contra las dos concretas. Lo que funciona en este prompt son las
     * reglas con NOMBRE, así que ésta también lo tiene.
     *
     * **Y lo de preguntar no es cortesía.** El spec builder es una entrevista, y un
     * subagente no tiene a quién entrevistar: el único con una persona delante es este
     * turno. Sin esta frase, la salida del analista ante una decisión abierta es
     * inventarla.
     */
    hay("analyst-xone") && hay("developer-xone")
      ? "Si el encargo va a CAMBIAR el proyecto y no es un retoque de una línea, son DOS pasos y en este orden: `analyst-xone` averigua primero —dile QUÉ hay que averiguar y PARA QUÉ— y su `HANDOFF DE ANÁLISIS` va DENTRO del encargo a `developer-xone`, que así no redescubre nada. Si el desarrollo son varios pasos o no cabe en un turno, pídele además el PLAN: lo deja en `/planes/<nombre>/` y te dice el nombre, y ese nombre es lo que le pasas al que desarrolla. Y si el plan vuelve con decisiones PENDIENTES, pregúntaselas al usuario antes de mandar a escribir: el analista no tiene a quién preguntar y tú sí."
      : "",
    /**
     * **Lo que se puede MEDIR no se pregunta**, y esto salió de una sesión en vivo.
     *
     * El encargo era «arregla el error que me pasa al arrancar la app». El orquestador miró
     * los ficheros, no lo encontró, y **paró a preguntarle a la persona cuándo pasaba** — con
     * un emulador delante, la app desplegada y un conductor capaz de lanzarla y leer el log,
     * que es donde XOne escribe la excepción con su fichero, su línea y su columna. La
     * persona contestó «al entrar», que es exactamente lo que el aparato habría dicho solo.
     *
     * El modo autónomo NO cubre esto: gobierna las ESCRITURAS —si se aplican sin aprobación—
     * y una pregunta no es una escritura. Así que un turno «autónomo» se queda parado
     * igualmente, y quien lo dejó corriendo se lo encuentra esperando.
     *
     * La frontera es qué clase de cosa es lo que falta: un HECHO del proyecto o del aparato se
     * va a buscar; una DECISIÓN o una preferencia, que solo vive en la cabeza de quien
     * encarga, se pregunta. Por eso esta regla no contradice la del plan con decisiones
     * pendientes de arriba: aquélla habla de lo segundo.
     */
    "Lo que puedas AVERIGUAR, no lo preguntes. Si lo que te falta se puede medir —qué error da al arrancar, en qué pantalla pasa, qué valor tiene un campo— vas y lo mides: `device-controller` lanza la app y trae el log, que es donde XOne escribe la excepción con su fichero y su línea. Preguntar a la persona es para lo que SOLO ella sabe: qué quiere, una decisión de negocio, una credencial. Y ojo, que el modo autónomo no te salva de esto: gobierna si una escritura se aplica sola, no si paras a preguntar — un turno que nadie está mirando se queda ahí.",
    /**
     * **Escribir y PROBARLO EN UN APARATO son dos encargos, y el segundo necesita un
     * destino.** Sin esta regla, «crea una pantalla y pruébala» se leía como una sola `task`
     * al desarrollador — que no tiene `execute`, así que «probar» se quedaba en que dijera
     * que lo había hecho, que es justo lo que su prompt le prohíbe afirmar.
     *
     * Y lo que se le pide al conductor no es «prueba»: es a DÓNDE tiene que llegar. Medido
     * sobre un proyecto real, la ruta existe y el harness la sabe
     * (`xone_navegacion referencias Calculadora` → `EntradaApp.MAP_BT_CALCULADORA_DR`), pero
     * el conductor no la busca si nadie le dice qué pantalla importa.
     *
     * Nombra a dos especialistas a pelo, igual que la regla de los diagramas: al renombrarlos
     * hay que cambiarlo aquí o la regla se queda escrita y muerta.
     *
     * **Y lo que saque el crítico se corrige SOLO si sirve al encargo.** Esta frase decía
     * «lo que salga de todo eso vuelve a `developer-xone` para corregir», sin condición, y
     * eso es una orden: MEDIDO en un turno real, se pidió «arregla el error al ejecutar la
     * app», se arregló —faltaba un `;`—, y el crítico vio cuatro textos recortados en otra
     * pantalla, rotos desde antes. El turno se fue a rediseñar el menú porque aquí se lo
     * mandamos.
     *
     * Es el hermano del objetivo que ya viaja en `textoDeReparacion`, y hacía falta
     * arreglar los DOS: aquél cubre el bucle de reparación del harness, y éste el camino en
     * el que el orquestador invoca la tool por su cuenta. Arreglar uno solo dejaba el otro
     * abierto — y así fue: con el primero puesto, el turno volvió a irse por el segundo.
     *
     * El objetivo es lo que separa trabajo de ruido: el mismo «BASICOS PLUS se corta» es
     * ruido si el encargo era arrancar la app y es EL trabajo si el encargo era arreglar
     * los fallos visuales. Por eso se decide contra el encargo y no contra el fichero.
     */
    hay("developer-xone") && hay("device-controller")
      ? "Si el encargo incluye PROBARLO en un móvil o emulador, son DOS pasos y en este orden: `developer-xone` escribe, y luego `device-controller` lo despliega y lo comprueba. Dile SIEMPRE a qué pantalla o colección tiene que llegar, no solo «pruébalo». Si la persona nombra un fichero SUYO por su ruta absoluta (`/Users/...`, `/tmp/...`), NO está en el proyecto y no hace falta delegar en nadie para leerlo: tráetelo con `traer_de_la_maquina`, que lo copia a `/artefactos/` y te dice con qué nombre queda; a partir de ahí se abre como cualquier artefacto, y si es un `.zip` quien tenga shell lo descomprime ahí mismo. Si tienes `xone_critica_visual`, pásale la captura que deje: ve fallos de pintado que ninguna comprobación estática detecta, y si te pide otra pantalla, encárgasela al conductor y vuelve. Y si el encargo traía un DISEÑO o una MAQUETA, pásasela SIEMPRE en `referencia`: sin ella su verde solo dice que nada está roto, no que la pantalla se parezca a lo que te pidieron. De lo que saque, MANDA A CORREGIR solo lo que sirva al encargo que te hicieron: un defecto que ya estaba ahí y que tu cambio no ha causado NO se arregla, se CUENTA en tu respuesta para que lo decida quien te encargó el trabajo. Y no des por buena una pantalla que nadie ha mirado."
      : "",
    "Los especialistas no comparten el transcript: al encadenarlos, incluye en la descripción",
    "de la siguiente `task` un bloque `HANDOFF DE ANÁLISIS` compacto con los hechos verificados,",
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
/**
 * **`read_file` NO está aquí, y es deliberado.**
 *
 * Una descripción propia REEMPLAZA la de la librería, no se suma a ella, así que la nuestra
 * —que solo hablaba de coste— borraba tres cosas que deepagents ya dice y que no son nuestras
 * de decir: que la salida lleva una cabecera de formato **que no hay que reinyectar al
 * editar** (eso es CORRECCIÓN, no ahorro), que conviene pedir varias lecturas en una misma
 * respuesta, y que un resultado grande se descarga a `/large_tool_results/` y se pagina desde
 * ahí. Medido al comparar dos parches suyos: entre `1.13.2` y `1.13.5` ese formato CAMBIÓ
 * —de prefijos de número de línea a una cabecera `@@ … @@`— y con él la advertencia. Una copia
 * nuestra habría quedado describiendo un formato que ya no existe, sin un error que leer.
 *
 * La regla: lo que describe la TOOL es de la librería y se actualiza con ella; lo que decimos
 * nosotros es cómo QUEREMOS usarla, y eso vive en el prompt del especialista
 * (`core/agentes.ts#promptDeAgente`), donde no compite con nada.
 */
export const DESCRIPCIONES_FICHEROS = {
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
    "Usa `output_mode=\"content\"` solo con un patrón específico: devuelve la ruta y el NÚMERO",
    "DE LÍNEA de cada coincidencia, así que lee después con `read_file` ALREDEDOR de esa línea",
    "(`offset` = línea menos 5), nunca desde el principio del fichero. La búsqueda devuelve",
    "como máximo 100 coincidencias salvo que justifiques subir `max_count`.",
    "Varias búsquedas independientes van en el MISMO mensaje, igual que las lecturas.",
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
 * `agent/grafo/proyecto.ts#backendConDescargas`), y hasta el 10-09-2026 no: la escribe la librería
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
/** El inspector, o nada: `inspectorDePrompt` devuelve `undefined` si no se ha pedido. */
function inspector(raiz: string, origen: string): ReturnType<typeof inspectorDePrompt>[] {
  const mw = inspectorDePrompt(raiz, origen);
  return mw === undefined ? [] : [mw];
}

export async function construirAgente(opciones: OpcionesDelAgente): Promise<unknown> {
  // Las cuatro capas y su orden están en `backendDeAgente`, que vive en `proyecto.ts` para
  // poder PROBARSE: aquí no había forma, porque `construirAgente` se simula en todos los
  // tests que lo tocan y el cableado se quedaba sin nadie mirándolo.
  /**
   * El cargador del índice de navegación, con la RAÍZ ya fijada.
   *
   * Entra por opción para poder doblarse en un test, y con su omisión real puesta aquí —no en
   * el llamador— por el patrón de fallo de siempre: compuesto arriba, en un cierre que todos
   * los tests simulan, el cableado quedaría escrito y sin probar. `xoneAgent.navegacion.test.ts`
   * lo mira desde fuera.
   *
   * La raíz NO entra por parámetro de la tool: si el modelo pudiera decir sobre qué carpeta
   * pregunta, esto sería una tool que lee cualquier sitio de la máquina.
   */
  const cargarIndice: CargarIndice = opciones.navegacion ?? indiceEnDisco(opciones.raiz);
  /**
   * El resolvedor de ESTILOS, que va con la misma tool y por el mismo camino.
   *
   * Entra por parámetro como el índice, y ausente deja la operación `estilos` diciendo que no
   * está montada — en vez de fallar dentro. Un test que doble la navegación no tiene por qué
   * saber de esto.
   */
  const cargarEstilos = opciones.estilos ?? estilosDeDisco(opciones.raiz);

  const comunes = {
    raiz: opciones.raiz,
    ficheros: opciones.ficheros,
    ...(opciones.artefactos === undefined ? {} : { artefactos: opciones.artefactos }),
    ...(opciones.adjuntos === undefined ? {} : { adjuntos: opciones.adjuntos }),
  };
  const backend = backendDeAgente(comunes);

  /**
   * El backend CON shell, y solo si alguien lo va a usar.
   *
   * Se construye aparte porque es otra cadena entera: la base ejecuta, y eso cambia lo que
   * la librería registra (`execute`) y lo que se le puede pasar (`permissions` lanza junto a
   * un backend ejecutable). Que sea `undefined` cuando nadie declara `ejecucion` no es una
   * optimización: es lo que hace que el caso normal sea, byte a byte, el de antes.
   */
  const conShell = opciones.agentes.some((a) => puedeEjecutar(a))
    ? backendDeAgente({
        ...comunes,
        ejecucion: {
          entorno: entornoDeLaShellDelProyecto(opciones.raiz, opciones.artefactos?.carpeta),
        },
      })
    : undefined;

  // Si no hay tracker, no se añade el middleware: es opcional a propósito arriba.
  const middlewareTracker = (origen: string) =>
    opciones.tracker
      ? [
          createTokenTrackingMiddleware(
            opciones.tracker,
            alContarDelTracker(origen, opciones.diagnostico, opciones.alContarTokens)
          ),
        ]
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
      description: fichaDeAgente(agente),
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
           * guardas de ruta (`agent/subagentes/escrituraExterna.ts`). Un agente de solo lectura no
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
    .map((perfil) => {
    // Una vez por perfil: con qué backend ve los ficheros, con qué permisos y con qué tools.
    const ficheros = montajeDeFicheros(perfil, {
      normal: backend,
      ...(conShell === undefined ? {} : { conShell }),
    });
    const presupuesto = presupuestoDeLlamadas(perfil);
    return {
    name: perfil.nombre,
    description: fichaDeAgente(perfil),
    systemPrompt: promptDeAgente(perfil, repartirSkills(perfil, catalogoDeSkills)),
    // Los subagentes no heredan las skills del orquestador. Se entregan como fuentes
    // directas para mantener cada perfil limitado a su catálogo declarado.
    skills: rutasDeSkills(perfil, catalogoDeSkills),
    // `tools` solo lleva tools PROPIAS. Pasarle los NOMBRES de las de fichero las sustituía
    // por cadenas, dejando al especialista sin ninguna capacidad real. Las de fichero las
    // monta el middleware; regex_search es una tool real y confinada al mismo backend.
    /**
     * Las dos tools propias, y contestan preguntas DISTINTAS: `regex_search` busca TEXTO y
     * `xone_navegacion` contesta sobre el modelo ya resuelto. Un `mapcol` encuentra su
     * colección aunque el nombre salga en otros veinte sitios, y el inventario cuesta 141
     * tokens donde leer los `.xne` cuesta 18.000 (medido sobre un proyecto real).
     *
     * A los CINCO especialistas y no a unos pocos: los cinco trabajan sobre un proyecto XOne
     * y la pregunta que esto abarata —«qué hay aquí»— se la hacen todos. El esquema es de una
     * operación enumerada y un nombre, que es poco en cada llamada. El orquestador la lleva
     * TAMBIÉN, y eso lo decidió una medida que tumbó lo contrario: ver su propio `tools` más
     * abajo.
     */
    tools: [
      crearBusquedaRegex(ficheros.backend),
      crearNavegacionXone(cargarIndice, opciones.ficheros, cargarEstilos),
      /**
       * Traer un artefacto al proyecto, y **solo a quien tenga dónde dejarlo**.
       *
       * Se monta condicionada porque una tool que siempre contesta «no puedes escribir en
       * ningún sitio» es un botón muerto en el prompt de cuatro de los cinco especialistas:
       * gasta esquema en cada llamada y le ofrece al modelo un camino que no existe. Quien
       * declara `escribeEn` en su `.md` —hoy el que documenta— es el único que puede usarla.
       *
       * Y la carpeta de artefactos tiene que estar montada: sin ella no hay origen del que
       * copiar. Las dos condiciones son de DATO, no de configuración.
       */
      ...(opciones.artefactos !== undefined && (perfil.escribeEn ?? []).length > 0
        ? [crearCopiarArtefacto({
            raiz: opciones.raiz,
            carpetaDeArtefactos: opciones.artefactos.carpeta,
            perfil,
          })]
        : []),
    ],
    //
    // Las tools de fichero las monta el `FilesystemMiddleware` a partir del backend, y
    // quien las acota por NOMBRE es su propia opción `tools` (con la restricción de que
    // `read_file` tiene que estar siempre). Aquí el solo-lectura se impone con
    // `permissions`, que la librería aplica sobre `ls`, `read_file`, `write_file`,
    // `edit_file`, `glob` y `grep` — o sea, sobre todas las que importan.
    /**
     * **Ausente para quien EJECUTA**, y por la misma razón que en el middleware: deepagents
     * lanza `ConfigurationError` al combinar `permissions` con un backend ejecutable. Dejarlo
     * aquí «por si acaso» no añadiría una barrera, tumbaría la construcción del agente.
     */
    ...(ficheros.permissions === undefined ? {} : { permissions: ficheros.permissions }),
    interruptOn: hitlDe(perfil),
    // En CADA especialista, no solo en el orquestador: son ellos los que llaman a las
    // tools de fichero, así que es su siguiente llamada al modelo la que reventaba.
    // El nombre coincide con el middleware por defecto de DeepAgents y lo sustituye: así
    // aplica tanto al especialista como al orquestador.
    middleware: [
      createFilesystemMiddleware({
        // Quién se lleva la shell, con qué permisos y con qué tools lo decide una función
        // pura y probada (`perfiles.ts#montajeDeFicheros`), no un `if` aquí dentro.
        ...ficheros,
        customToolDescriptions: DESCRIPCIONES_FICHEROS,
        ...OPCIONES_BUSQUEDA_FICHEROS,
      }),
      // El tope es del ESPECIALISTA y no del orquestador: el que contesta al usuario no
      // puede quedarse a medias, y el que hace un encargo acotado sí debe. Ver
      // `resumenDeContexto.ts#topeDeLlamadas`.
      // El corte se ANOTA con el nombre de ESTE perfil: sin origen, saber que hubo un corte no
      // dice a quién le pasó, que es justo lo que hace falta para calibrar el presupuesto.
      // Y el presupuesto lo decide el PERFIL (`perfiles.ts#presupuestoDeLlamadas`): quien
      // conduce un aparato avanza en un bucle de acto→observa y no se acota como una
      // consulta. Con el 15 para todos, el conductor se re-delegaba siete veces en el mismo
      // turno — el mismo gasto, partido en siete arranques sin memoria entre ellos.
      topeDeLlamadas(presupuesto, () => opciones.diagnostico?.corte?.(perfil.nombre, presupuesto)),
      // Y el de TOOLS, que es el que acota lo que se ACUMULA: 43 resultados en el contexto
      // hicieron que la última llamada costara ocho veces la primera.
      topeDeTools(),
      // Los DOS, y en su orden, que es lo que `resumenConEncargo` garantiza: el resumen
      // se lleva el encargo por delante al cruzar el umbral, y el segundo lo devuelve.
      // Sobre el backend del PERFIL: quien tiene shell descarga en SU cadena, que es la que
      // tiene montadas `/large_tool_results/` y `/conversation_history/` con su misma raíz.
      ...resumenConEncargo(ficheros.backend),
      middlewareTextoDeTool(),
      ...middlewareTracker(perfil.nombre),
      // El ÚLTIMO, y por eso ve la petición ya pasada por todos los de arriba: el resumen, la
      // devolución del encargo y la conversión de los `ToolMessage`. Puesto delante enseñaría
      // lo que otros van a cambiar después, que es la mentira de un inspector.
      ...inspector(opciones.raiz, perfil.nombre),
    ],
    // El modelo que fije el agente en su fichero, y si no lo fija, el del papel que le
    // toca por lo que hace: `rapido` para el que solo lee, `trabajo` para el que escribe.
    // Fijarlo es la excepción y no la norma — un agente con modelo escrito se queda ahí
    // aunque el usuario cambie el suyo con `/modelo`, que es justo lo que quiere quien
    // escribe «este revisor corre con Claude» y no lo que quiere nadie más.
    // Y el ESFUERZO del perfil, que gana sobre el de la sesión: quien escribe «este
    // consultor piensa poco» lo dice de ESE especialista, no de la conversación. Ausente
    // deja pasar el de la sesión, que es lo que `Modelos` resuelve por dentro.
    model:
      perfil.modelo === undefined
        ? opciones.modelos.paraPapel(perfil.soloLectura ? "rapido" : "trabajo", perfil.esfuerzo)
        : opciones.modelos.paraModelo(perfil.modelo, perfil.esfuerzo),
    };
  });

  return createDeepAgent({
    model: opciones.modelos.paraPapel("rapido"),
    systemPrompt: promptOrquestador(opciones.agentes),
    backend,
    /**
     * **El orquestador SÍ la lleva, y eso lo decidió una medida que tumbó lo contrario.**
     *
     * La primera versión se la dio solo a los especialistas con el argumento de que el
     * orquestador delega. Medido sobre un proyecto real con la pregunta que motivó la tool
     * —«¿cuántas colecciones tiene mi proyecto?»—: **no delegó**. La contestó él, con `ls`,
     * `glob`, `grep` y `read_file`, en once llamadas y ~88k tokens, y la tool no llegó a
     * estar disponible porque vivía en los subagentes. O sea que el razonamiento era bueno y
     * el comportamiento otro, que es justo lo que este repo prefiere medir antes que suponer.
     *
     * No le abre nada: es de LECTURA y el orquestador ya lee (`permisosDe` le deja
     * `read`/`ls`/`glob`/`grep` y le deniega el disco entero para escribir). Lo que cambia es
     * el precio de orientarse. Su esquema viaja en cada llamada suya —y eso no es gratis,
     * `excluirTools` existe por eso—, pero es una operación enumerada y un nombre frente a
     * las once llamadas que sustituye.
     */
    /**
     * **Y la crítica visual va SOLO aquí, y solo si hay carpeta de artefactos.**
     *
     * Aquí porque es quien reparte: el crítico pide pantallas por nombre y el único que puede
     * ir a por ellas es el conductor, así que el que tiene que oír la petición es el que
     * delega. Dársela al conductor sería que el que trabaja se puntúe solo — lo que
     * `juezDeTarea` prohíbe por escrito y lo que su propio prompt le prohíbe afirmar.
     *
     * Y solo con carpeta porque sin ella no hay ninguna captura que mirar: una tool cuyo
     * único final posible es «no encuentro nada» es el botón muerto de siempre, y encima
     * cobrando su esquema en cada llamada.
     */
    tools: [
      crearNavegacionXone(cargarIndice, opciones.ficheros, cargarEstilos),
      ...(opciones.artefactos === undefined
        ? []
        : [
            crearCriticaVisual({
              leerArtefacto: async (nombre) =>
                readFileSync(join(opciones.artefactos!.carpeta, nombre)),
              invocar: invocarVisualConModelos(opciones.modelos),
            }),
            /**
             * Traer al área de trabajo un fichero que la PERSONA nombró por su ruta.
             *
             * Va con el orquestador porque es QUIEN LEE ese mensaje: la ruta llega en el
             * encargo, y sin esto la resolvía dentro del proyecto, recibía un ENOENT que
             * decía «no existe» sobre un fichero que sí existe, y se iba a delegar en el
             * único especialista con shell para que lo copiara.
             */
            crearTraerDeLaMaquina({
              carpeta: opciones.artefactos.carpeta,
              alEscribir: opciones.artefactos.alEscribir,
            }),
          ]),
    ],
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
      // Los DOS, y en su orden, que es lo que `resumenConEncargo` garantiza: el resumen
      // se lleva el encargo por delante al cruzar el umbral, y el segundo lo devuelve.
      ...resumenConEncargo(backend),
      // Los esquemas de las tools que NO puede usar son el 25 % de su cabecera, y la cabecera
      // es el 87 % de cada llamada (`inspectorDePrompt`). `permissions` acota el permiso; el
      // esquema viaja igual, así que esto lo quita del prompt Y sigue rechazando la llamada.
      // La frontera sigue siendo `permisosDe`: ver `excluirTools.ts`.
      excluirTools(toolsQueNoUsa(PERFIL_DEL_ORQUESTADOR)),
      // Un GUARDA contra desbocamiento, no una economía: con `continue` no le corta la
      // respuesta, solo deja de darle tools. Está por encima de todo lo medido a propósito —
      // ver `TOPE_DE_TOOLS_DEL_ORQUESTADOR`—, y no lleva tope de LLAMADAS porque el que
      // contesta al usuario no puede quedarse a medias.
      topeDeTools(TOPE_DE_TOOLS_DEL_ORQUESTADOR),
      middlewareTextoDeTool(),
      /**
       * El bucle de rúbrica, y va en el ORQUESTADOR y no en los especialistas.
       *
       * Es quien cierra el encargo de la persona; un especialista contesta a quien le delegó,
       * que es otra pregunta. Y el gancho es `afterAgent`, que en un especialista ni siquiera
       * corre cuando lo corta su tope (medido: el `jumpTo: "end"` cortocircuita lo posterior),
       * así que allí el bucle sería mudo justo en el caso que más importa.
       *
       * Sin `calificador` no se monta, y montado sin rúbrica no hace nada.
       */
      ...(opciones.calificador === undefined
        ? []
        : [middlewareDeRubrica({ calificar: opciones.calificador })]),
      ...middlewareTracker("orquestador"),
      ...inspector(opciones.raiz, "orquestador"),
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

/**
 * Lo que se hace cada vez que el tracker cuenta: avisar a los DOS que lo esperan.
 *
 * **Extraída y exportada porque uno de los dos se cayó**, y en verde: el callback nació
 * llamando solo al diagnóstico, así que el aviso de consumo tenía un único disparador —el
 * de un agente EXTERNO— y una sesión normal subía sus tokens en silencio. Medido en la
 * pantalla del usuario: el contador de la web no apareció nunca. Con la composición dentro
 * de `construirAgente`, que todos sus tests doblan, no había dónde cazarlo.
 *
 * `alContarTokens` no lleva el uso dentro a propósito: quien escucha tiene el tracker —es
 * él quien lo pasó— y dos fuentes para el mismo número son dos números que divergen.
 */
export function alContarDelTracker(
  origen: string,
  diagnostico?: DiagnosticoDeTools,
  alContarTokens?: () => void
): AlContarTokens {
  return (uso) => {
    diagnostico?.modelo(origen, uso);
    alContarTokens?.();
  };
}
