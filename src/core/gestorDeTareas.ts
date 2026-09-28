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
