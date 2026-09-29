/**
 * El gestor de tareas de un proyecto (IXCODE-11), como PUERTO: el panel del proyecto lista las
 * pendientes, abre una sesión con una, y al empezar y al cerrar escribe en él —siempre el HARNESS,
 * con la aprobación de la persona, nunca el agente—. Lo implementan DOS adaptadores, cada uno por
 * su conector MCP: Jira (`agent/conectores/gestorJira.ts`) y Notion (`gestorNotion.ts`, IXCODE-15);
 * nada fuera de ellos sabe cuál es.
 *
 * Puro: `core/` no importa `@modelcontextprotocol` (`imports.test.ts`).
 */
export type CategoriaDeTarea = "por-hacer" | "en-curso" | "terminada";

export interface Vinculo {
  /** El id del conector (`jira`, `notion`). */
  conector: string;
  /** El sitio del gestor (en Jira, el `cloudId`; en Notion, `SITIO_DE_NOTION`: un espacio por cuenta OAuth). */
  sitio: string;
  /** El proyecto en el gestor: en Jira su clave (`IXCODE`); en Notion la URL `collection://…` del data source. */
  proyecto: string;
}

/** El único «sitio» de Notion: una cuenta OAuth ve UN espacio, y el MCP no expone su nombre (medido). */
export const SITIO_DE_NOTION = "notion";

export interface TareaDelGestor {
  /** Lo que identifica la tarea ante el gestor: en Jira `IXCODE-11`, en Notion el UUID de la página. */
  clave: string;
  /** Lo que se ENSEÑA cuando la clave no está hecha para leerse (Notion: el id corto). Ausente = se enseña `clave`. */
  etiqueta?: string;
  titulo: string;
  estado: string;
  categoria: CategoriaDeTarea;
  /** Solo el nombre visible: el correo y el id de la cuenta no cruzan el cable. */
  asignado?: string;
  /** Para abrirla en el navegador. */
  url?: string;
}

export interface FichaDelGestor extends TareaDelGestor {
  descripcion: string;
}

export interface TransicionDelGestor {
  id: string;
  nombre: string;
  /** El estado al que lleva. */
  destino: string;
  categoria: CategoriaDeTarea;
}

/** Cómo se acota la consulta de pendientes, además del texto. Todo de LECTURA. */
export interface OpcionesDePendientes {
  /** Solo las asignadas a quien tiene la sesión del conector. Ausente o `false`: las de todos. */
  mias?: boolean;
}

/** Un proyecto encontrado por texto (`buscarProyectos`). En Notion `proyecto` es el id de la BASE,
 *  no su data source: el data source se resuelve al ELEGIRLA (`describirProyecto`), no en la lista. */
export interface ProyectoEncontrado {
  proyecto: string;
  nombre: string;
  /** Dónde vive, para distinguir dos bases con el mismo nombre («Hypergraph / Projects & Tasks»). */
  ruta?: string;
}

/** Lo que el adaptador ENTENDIÓ del esquema de un proyecto: qué propiedad es el estado, cuál el título y cuál el asignado. */
export interface EsquemaDelProyecto {
  /** Lo que se guarda al vincular (en Notion, la URL `collection://…` del data source ya resuelto). */
  proyecto: string;
  nombre: string;
  estado: { propiedad: string; opciones: { nombre: string; categoria: CategoriaDeTarea }[] };
  titulo: string;
  /** Ausente = la base no tiene una propiedad de persona, y entonces no hay «asignadas a mí». */
  asignado?: string;
  /** Cuántos data sources tiene la base cuando son VARIOS (se usa el primero, y se dice). */
  fuentes?: number;
}

/** O lo entendido, o por qué esa base no vale como gestor. */
export type DescripcionDelProyecto = { esquema: EsquemaDelProyecto } | { motivo: string };

export interface GestorDeTareasPort {
  sitios(): Promise<{ id: string; nombre: string; url?: string }[]>;
  proyectos(sitio: string): Promise<{ clave: string; nombre: string }[]>;
  /**
   * Buscar proyectos por texto (IXCODE-15). Opcional: Jira no lo implementa —sus proyectos se eligen
   * de la lista de `proyectos(sitio)`—, y quien no lo tiene contesta con un motivo, no con una lista vacía.
   */
  buscarProyectos?(texto: string): Promise<ProyectoEncontrado[]>;
  /**
   * Lo que se entiende del esquema de un proyecto (`v.proyecto` puede ser lo que dio `buscarProyectos`
   * o lo ya vinculado). Opcional: quien lo tiene, `vincular` lo usa para comprobar que el proyecto vale
   * ANTES de escribir; quien no (Jira), comprueba contra `proyectos(sitio)` como siempre.
   */
  describirProyecto?(v: Vinculo): Promise<DescripcionDelProyecto>;
  /** Si «asignadas a mí» tiene sentido para este vínculo. No lanza: lo que no se sabe es `false`. */
  admiteMias(v: Vinculo): Promise<boolean>;
  /** `opciones.mias`: solo las asignadas a quien tiene la sesión del conector (en Jira, `currentUser()`). */
  pendientes(v: Vinculo, texto?: string, opciones?: OpcionesDePendientes): Promise<TareaDelGestor[]>;
  ficha(v: Vinculo, clave: string): Promise<FichaDelGestor>;
  transiciones(v: Vinculo, clave: string): Promise<TransicionDelGestor[]>;
  transicionar(v: Vinculo, clave: string, transicion: string): Promise<void>;
  comentar(v: Vinculo, clave: string, texto: string): Promise<void>;
}

/** Una clave de proyecto de Jira: MAYÚSCULAS, dígitos y `_`, empezando por letra. Entra en una JQL. */
export function motivoDeClaveDeProyecto(clave: string): string | undefined {
  return /^[A-Z][A-Z0-9_]+$/.test(clave) ? undefined : `«${clave}» no es una clave de proyecto (mayúsculas, dígitos y _, empezando por letra)`;
}

/**
 * Lo que se ENSEÑA de una clave que no está hecha para leerse (IXCODE-15): el UUID de una página
 * de Notion (con o sin guiones) se enseña por sus 8 primeros caracteres; cualquier otra clave (la
 * de Jira, `IXCODE-11`) no tiene etiqueta y se enseña tal cual. UNA regla: el adaptador la usa para
 * `TareaDelGestor.etiqueta`, y el cliente la REDECLARA para las claves que cruzan sin fila (el
 * `ticket` de una sesión, `cierre.clave`, `transiciones.clave`).
 */
export function etiquetaDeClave(clave: string): string | undefined {
  const sinGuiones = clave.toLowerCase().replace(/-/g, "");
  return /^[0-9a-f]{32}$/.test(sinGuiones) ? sinGuiones.slice(0, 8) : undefined;
}

/** Un UUID con guiones, en minúsculas: la forma de los ids de Notion (medido). */
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/** Un data source de Notion: `collection://<uuid>`. Es lo que se guarda como `proyecto` del vínculo. */
export function motivoDeFuenteDeNotion(proyecto: string): string | undefined {
  return new RegExp(`^collection://${UUID}$`).test(proyecto) ? undefined : "no es un data source de Notion (collection://…)";
}

/**
 * La regla de qué `proyecto` vale, SEGÚN el conector (IXCODE-15): la clave de Jira entra en una JQL,
 * la URL de Notion en un `notion-fetch` y como tabla de un SQL. Un conector que no es un gestor
 * conocido no tiene regla que lo acepte. Única, para `config.ts#validar`, `vincular` y los adaptadores.
 */
export function motivoDeProyectoInaceptable(conector: string, proyecto: string): string | undefined {
  if (conector === "jira") return motivoDeClaveDeProyecto(proyecto);
  if (conector === "notion") return motivoDeFuenteDeNotion(proyecto);
  return `«${conector}» no es un gestor de tareas`;
}

/**
 * La descripción de la regla, SIN el valor: para un aviso de `config.ts`, que nunca lleva la
 * entrada (ni siquiera a través del motivo de otra función, que la interpola).
 */
export function formaDeProyecto(conector: string): string {
  if (conector === "jira") return "una clave de proyecto válida (mayúsculas, dígitos y _, empezando por letra)";
  if (conector === "notion") return "un data source de Notion (collection://…)";
  return "de un gestor de tareas conocido (jira o notion)";
}

/**
 * Lo que `describir` acepta de Notion: el id de una BASE (con o sin guiones, como sale de
 * `notion-search` o de una URL) o un data source ya resuelto. Entra en un `notion-fetch`, no en SQL.
 */
export function motivoDeReferenciaDeNotion(ref: string): string | undefined {
  const r = ref.toLowerCase();
  if (new RegExp(`^${UUID}$`).test(r) || /^[0-9a-f]{32}$/.test(r) || motivoDeFuenteDeNotion(r) === undefined) return undefined;
  return "no es una base de Notion (su id) ni un data source (collection://…)";
}

/** Un identificador de SQLite entre comillas dobles: la comilla de dentro se DOBLA. */
function identificadorSql(nombre: string): string {
  return `"${nombre.replace(/"/g, '""')}"`;
}

/** El texto de un `LIKE … ESCAPE '\\'`: la barra, `%` y `_` se escapan para que cuenten como letras. */
function literalDeLike(texto: string): string {
  return texto.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Cuántas pendientes se piden a Notion de una vez: el mismo tope que en Jira (`PENDIENTES_POR_CONSULTA`). */
export const PENDIENTES_DE_NOTION = 100;

/**
 * El SQL de las pendientes de un data source de Notion (IXCODE-15), con `params` para `?`: NUNCA
 * se interpola un texto de la persona. Los nombres de propiedad vienen del ESQUEMA de Notion (no
 * del cliente), pero son identificadores y no parámetros, así que se citan con la comilla doblada.
 *
 * - Pendiente = estado fuera de los del grupo `complete`, O sin estado (en SQL, `NULL NOT IN (…)`
 *   no es cierto, y una tarea recién creada sin estado desaparecería). Sin opciones `complete`,
 *   no hay cláusula: `IN ()` no es SQL.
 * - `texto`: sobre el título, `LIKE ? ESCAPE '\\'` (medido: el SQLite de Notion acepta ESCAPE).
 * - `yo`: el id de quien tiene la sesión; la columna de persona es un JSON `["user://…"]` (medido).
 * - `ORDER BY createdTime DESC`: la tabla que expone el MCP no trae la última edición (medido).
 */
export function sqlDePendientes(
  esquema: Pick<EsquemaDelProyecto, "proyecto" | "estado" | "titulo" | "asignado">,
  texto?: string,
  opciones: { yo?: string } = {},
): { query: string; params: string[] } {
  const estado = identificadorSql(esquema.estado.propiedad);
  const titulo = identificadorSql(esquema.titulo);
  const cerradas = esquema.estado.opciones.filter((o) => o.categoria === "terminada").map((o) => o.nombre);
  const columnas = ["id", "url", estado, titulo, ...(esquema.asignado === undefined ? [] : [identificadorSql(esquema.asignado)])];
  const donde: string[] = [];
  const params: string[] = [];
  if (cerradas.length > 0) {
    donde.push(`(${estado} IS NULL OR ${estado} NOT IN (${cerradas.map(() => "?").join(", ")}))`);
    params.push(...cerradas);
  }
  if (opciones.yo !== undefined) {
    if (esquema.asignado === undefined) throw new Error("esta base no tiene una propiedad de persona");
    donde.push(`${identificadorSql(esquema.asignado)} LIKE ? ESCAPE '\\'`);
    params.push(`%${literalDeLike(`user://${opciones.yo}`)}%`);
  }
  const t = texto?.trim() ?? "";
  if (t !== "") {
    donde.push(`${titulo} LIKE ? ESCAPE '\\'`);
    params.push(`%${literalDeLike(t)}%`);
  }
  const where = donde.length === 0 ? "" : ` WHERE ${donde.join(" AND ")}`;
  return {
    query: `SELECT ${columnas.join(", ")} FROM ${identificadorSql(esquema.proyecto)}${where} ORDER BY createdTime DESC LIMIT ${PENDIENTES_DE_NOTION}`,
    params,
  };
}

/** La categoría de un GRUPO de estado de Notion: `current`/`future` (y lo desconocido), por hacer. */
export function categoriaDeGrupoDeNotion(grupo: string): CategoriaDeTarea {
  if (grupo === "in_progress") return "en-curso";
  if (grupo === "complete") return "terminada";
  return "por-hacer";
}

/** Una cadena JQL entre comillas dobles: se escapan la barra y la comilla. */
function cadenaJql(texto: string): string {
  return `"${texto.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * Las pendientes: categoría distinta de terminada, lo último tocado arriba. Con `mias`, solo las
 * asignadas a quien tiene la sesión del conector: `currentUser()` es una FUNCIÓN de la JQL, no un
 * texto que venga del cliente, así que no hay nada que escapar — el cliente solo dice sí o no.
 */
export function jqlDePendientes(v: Pick<Vinculo, "proyecto">, texto?: string, opciones: OpcionesDePendientes = {}): string {
  const mias = opciones.mias === true ? " AND assignee = currentUser()" : "";
  const filtro = texto === undefined || texto.trim() === "" ? "" : ` AND text ~ ${cadenaJql(texto.trim())}`;
  return `project = ${cadenaJql(v.proyecto)} AND statusCategory != Done${mias}${filtro} ORDER BY updated DESC`;
}

/** La categoría de estado del gestor (en Jira, `statusCategory.key`). Lo que no se conoce, por hacer. */
export function categoriaDeEstado(clave: string | undefined): CategoriaDeTarea {
  if (clave === "indeterminate") return "en-curso";
  if (clave === "done") return "terminada";
  return "por-hacer";
}

/**
 * La transición que se PROPONE en la tarjeta (la persona puede elegir otra o ninguna). Al empezar,
 * la que lleva a EN CURSO; al cerrar, PROBAR si existe —es el flujo de IXCODE: PROBLEMA → EN CURSO →
 * PROBAR → PREPROD → TERMINADO—, y si no, la primera que termina.
 */
export function transicionPropuesta(ts: readonly TransicionDelGestor[], para: "empezar" | "cerrar"): TransicionDelGestor | undefined {
  if (para === "empezar") return ts.find((t) => /^en curso$/i.test(t.destino)) ?? ts.find((t) => t.categoria === "en-curso");
  return ts.find((t) => /^probar$/i.test(t.destino) || /^probar$/i.test(t.nombre)) ?? ts.find((t) => t.categoria === "terminada");
}

/**
 * Lo que hace falta para escribir el comentario de cierre de una tarea (Task 9, IXCODE-11): lo que
 * `datosDeCierre` (`web/servidor/datosDeCierre.ts`) reúne del disco —ficheros y commits de la
 * sesión, el último veredicto del verificador, y la última respuesta del asistente— más un `plan`
 * que hoy nadie compone (ver el comentario de cabecera de `datosDeCierre.ts`). El FORMATO es puro
 * y vive aquí; una tarea posterior lo manda a Jira con `GestorDeTareasPort.comentar`, tras
 * aprobación de la persona.
 */
export interface DatosDeCierre {
  ficheros: { ruta: string; clase: "nuevo" | "modificado" | "borrado" }[];
  commits: string[];
  /** Ausente = el verificador no corrió en la última ronda: NUNCA se pinta «verde» sin esto. */
  veredicto?: { verde: boolean; errores: number; avisos: number };
  plan?: string;
  resumen?: string;
  /**
   * Qué tan de fiar es la lista de `ficheros`, la MISMA distinción que `CambiosDeSesion.via`
   * de `agent/sesiones/sesionGit.ts` (redeclarada aquí: `core/` no importa `agent/`). Ausente
   * mantiene el comportamiento de antes de este campo —la lista tal cual, como si fuera `git`—
   * para no romper a quien ya llamaba a `comentarioDeCierre` sin saberlo.
   *
   * **Por qué esto no es cosmético**: `sin-marca` es una lista VACÍA que NO significa «no
   * tocaste nada» (`sesionGit.ts#desdeLaApertura`), y `desde-apertura` es el árbol de ahora
   * contra la foto de apertura —lo normal para un proyecto FUERA del workspace, donde
   * `commitDeTurno` no commitea nunca— y explícitamente NO es atribución: puede llevar lo que
   * escribió otra sesión o una tarea de fondo mientras esta estaba abierta. Publicar esa lista
   * en Jira como «lo que hizo esta sesión» sin decir cuál de las tres es sería la misma mentira
   * que el comentario de cabecera de `sesionGit.ts` describe para la pestaña Revisión.
   */
  atribucion?: "git" | "desde-apertura" | "sin-marca";
}

/** Cuánto del resumen entra en el comentario: un ticket no es el sitio del transcript entero. */
const TOPE_DEL_RESUMEN_DE_CIERRE = 1500;

/**
 * El texto del comentario de cierre, en markdown, con lo que el harness sabe de la sesión.
 * Cuatro secciones fijas —«Qué cambió», «Verificación», y «Plan»/«Resumen» solo si hay algo que
 * decir— y una firma, para que quien lea el ticket sepa que lo escribió el harness y no una
 * persona a mano.
 */
export function comentarioDeCierre(datos: DatosDeCierre): string {
  const secciones = [
    seccionQueCambio(datos.ficheros, datos.commits, datos.atribucion),
    seccionVerificacion(datos.veredicto),
  ];
  if (datos.plan !== undefined && datos.plan.trim() !== "") secciones.push(`## Plan\n\n${datos.plan.trim()}`);
  if (datos.resumen !== undefined && datos.resumen.trim() !== "") {
    const recortado = datos.resumen.trim();
    const texto =
      recortado.length > TOPE_DEL_RESUMEN_DE_CIERRE ? `${recortado.slice(0, TOPE_DEL_RESUMEN_DE_CIERRE)}…` : recortado;
    secciones.push(`## Resumen\n\n${texto}`);
  }
  secciones.push("— escrito por xonecode");
  return secciones.join("\n\n");
}

/**
 * «Qué cambió», con la fiabilidad de la lista dicha antes de la lista — nunca deducida de si
 * está vacía o no. `sin-marca` no enseña ninguna lista (no habría qué enseñar: `sesionGit.ts`
 * la devuelve siempre vacía en ese caso); `desde-apertura` la enseña con el aviso de que no es
 * atribución; ausente y `git` se comportan igual que antes de que este campo existiera.
 */
function seccionQueCambio(
  ficheros: DatosDeCierre["ficheros"],
  commits: readonly string[],
  atribucion: DatosDeCierre["atribucion"]
): string {
  if (atribucion === "sin-marca") return "## Qué cambió\n\nNo se pudo comprobar qué cambió.";
  const aviso =
    atribucion === "desde-apertura"
      ? "Cambios en la copia desde que se abrió la sesión (sin confirmar que sean todos de esta sesión):\n\n"
      : "";
  const lista = ficheros.length === 0 ? "_(sin ficheros)_" : ficheros.map((f) => `- \`${f.ruta}\` (${f.clase})`).join("\n");
  const linea = commits.length === 0 ? "" : `\n\nCommits: ${commits.map((c) => `\`${c.slice(0, 7)}\``).join(", ")}`;
  return `## Qué cambió\n\n${aviso}${lista}${linea}`;
}

function seccionVerificacion(veredicto: DatosDeCierre["veredicto"]): string {
  if (veredicto === undefined) return "## Verificación\n\nno corrió";
  if (veredicto.verde) return "## Verificación\n\nverde";
  // Formato literal del criterio de aceptación: «en rojo: N errores», sin singular especial.
  return `## Verificación\n\nen rojo: ${veredicto.errores} errores`;
}
