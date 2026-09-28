/**
 * El gestor de tareas de un proyecto (IXCODE-11), como PUERTO: el panel del proyecto lista las
 * pendientes, abre una sesión con una, y al empezar y al cerrar escribe en él —siempre el HARNESS,
 * con la aprobación de la persona, nunca el agente—. Hoy lo implementa un solo adaptador, Jira por
 * su conector MCP (`agent/conectores/gestorJira.ts`); nada fuera de él sabe que es Jira.
 *
 * Puro: `core/` no importa `@modelcontextprotocol` (`imports.test.ts`).
 */
export type CategoriaDeTarea = "por-hacer" | "en-curso" | "terminada";

export interface Vinculo {
  /** El id del conector (`jira`). */
  conector: string;
  /** El sitio del gestor (en Jira, el `cloudId`). */
  sitio: string;
  /** La clave del proyecto en el gestor (`IXCODE`). */
  proyecto: string;
}

export interface TareaDelGestor {
  clave: string;
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

export interface GestorDeTareasPort {
  sitios(): Promise<{ id: string; nombre: string; url?: string }[]>;
  proyectos(sitio: string): Promise<{ clave: string; nombre: string }[]>;
  pendientes(v: Vinculo, texto?: string): Promise<TareaDelGestor[]>;
  ficha(v: Vinculo, clave: string): Promise<FichaDelGestor>;
  transiciones(v: Vinculo, clave: string): Promise<TransicionDelGestor[]>;
  transicionar(v: Vinculo, clave: string, transicion: string): Promise<void>;
  comentar(v: Vinculo, clave: string, texto: string): Promise<void>;
}

/** Una clave de proyecto de Jira: MAYÚSCULAS, dígitos y `_`, empezando por letra. Entra en una JQL. */
export function motivoDeClaveDeProyecto(clave: string): string | undefined {
  return /^[A-Z][A-Z0-9_]+$/.test(clave) ? undefined : `«${clave}» no es una clave de proyecto (mayúsculas, dígitos y _, empezando por letra)`;
}

/** Una cadena JQL entre comillas dobles: se escapan la barra y la comilla. */
function cadenaJql(texto: string): string {
  return `"${texto.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** Las pendientes: categoría distinta de terminada, lo último tocado arriba. */
export function jqlDePendientes(v: Pick<Vinculo, "proyecto">, texto?: string): string {
  const filtro = texto === undefined || texto.trim() === "" ? "" : ` AND text ~ ${cadenaJql(texto.trim())}`;
  return `project = ${cadenaJql(v.proyecto)} AND statusCategory != Done${filtro} ORDER BY updated DESC`;
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
