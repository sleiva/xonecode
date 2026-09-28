import type { CategoriaDeTarea, TareaDelGestor, TransicionDelGestor, VinculoDelCable } from "./tipos.js";

/**
 * El mensaje `gestor` tal como llega por el cable, VALIDADO campo a campo (el molde de
 * `planesDelCable.ts`): lo que el store guarda es esto. Cada campo del mensaje es la respuesta
 * a UNA acción y viaja suelto, así que cada uno se lee por su cuenta y el que no tiene forma
 * se queda fuera — sin llevarse a los demás.
 *
 * **Se copia campo a campo, nunca se reenvía el objeto**: el servidor ya recorta el asignado
 * de Jira a su `displayName`, y esta es la segunda llave. Un `emailAddress` que llegara por
 * error —en la tarea o en un asignado que viniera como objeto— no pasa de aquí: el asignado
 * solo se acepta como TEXTO, y un objeto no se escarba para sacarle el nombre.
 *
 * `transiciones`, `cierre` y `cerrado` son de Task 11 (IXCODE-11): las dos tarjetas de
 * aprobación que escriben en Jira leen su forma de aquí, con la misma disciplina — lo que no
 * tiene forma se descarta entero, nunca a medias.
 */
export interface LecturaDelGestor {
  estado?: { conectores: string[]; vinculo?: VinculoDelCable };
  sitios?: { conector: string; lista: { id: string; nombre: string }[] };
  proyectos?: { sitio: string; lista: { clave: string; nombre: string }[] };
  pendientes?: { cuando: number; texto?: string; mias?: true; lista: TareaDelGestor[] };
  ficha?: { clave: string; descripcion: string };
  borrador?: { clave: string; texto: string };
  transiciones?: { clave: string; para: "empezar" | "cerrar"; lista: TransicionDelGestor[]; propuesta?: string };
  cierre?: { clave: string; comentario: string };
  cerrado?: { clave: string; comento: boolean; transicion?: string; falloDeTransicion?: string };
  error?: { accion: string; motivo: string; clave?: string };
}

const CATEGORIAS: readonly CategoriaDeTarea[] = ["por-hacer", "en-curso", "terminada"];

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const soloTextos = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

export function leerGestorDelCable(mensaje: unknown): LecturaDelGestor {
  if (!esObjeto(mensaje)) return {};
  const estado = leerEstado(mensaje.estado);
  const sitios = leerSitios(mensaje.sitios);
  const proyectos = leerProyectos(mensaje.proyectos);
  const pendientes = leerPendientes(mensaje.pendientes);
  const ficha = leerFicha(mensaje.ficha);
  const borrador = leerBorrador(mensaje.borrador);
  const transiciones = leerTransiciones(mensaje.transiciones);
  const cierre = leerCierre(mensaje.cierre);
  const cerrado = leerCerrado(mensaje.cerrado);
  const error = leerError(mensaje.error);
  return {
    ...(estado === undefined ? {} : { estado }),
    ...(sitios === undefined ? {} : { sitios }),
    ...(proyectos === undefined ? {} : { proyectos }),
    ...(pendientes === undefined ? {} : { pendientes }),
    ...(ficha === undefined ? {} : { ficha }),
    ...(borrador === undefined ? {} : { borrador }),
    ...(transiciones === undefined ? {} : { transiciones }),
    ...(cierre === undefined ? {} : { cierre }),
    ...(cerrado === undefined ? {} : { cerrado }),
    ...(error === undefined ? {} : { error }),
  };
}

function leerVinculo(v: unknown): VinculoDelCable | undefined {
  if (!esObjeto(v)) return undefined;
  if (typeof v.conector !== "string" || typeof v.sitio !== "string" || typeof v.proyecto !== "string") return undefined;
  return {
    conector: v.conector,
    sitio: v.sitio,
    proyecto: v.proyecto,
    ...(typeof v.nombreDelSitio === "string" ? { nombreDelSitio: v.nombreDelSitio } : {}),
  };
}

function leerEstado(v: unknown): LecturaDelGestor["estado"] {
  if (!esObjeto(v) || !Array.isArray(v.conectores)) return undefined;
  // Un vínculo presente pero sin forma NO se lee como «sin vínculo»: esa frase dice que el
  // proyecto no tiene gestor, y sobre un dato ilegible sería una afirmación inventada.
  const vinculo = leerVinculo(v.vinculo);
  if (v.vinculo !== undefined && vinculo === undefined) return undefined;
  return { conectores: soloTextos(v.conectores), ...(vinculo === undefined ? {} : { vinculo }) };
}

function leerSitios(v: unknown): LecturaDelGestor["sitios"] {
  if (!esObjeto(v) || typeof v.conector !== "string" || !Array.isArray(v.lista)) return undefined;
  const lista = v.lista.flatMap((s): { id: string; nombre: string }[] =>
    esObjeto(s) && typeof s.id === "string" && typeof s.nombre === "string" ? [{ id: s.id, nombre: s.nombre }] : []
  );
  return { conector: v.conector, lista };
}

function leerProyectos(v: unknown): LecturaDelGestor["proyectos"] {
  if (!esObjeto(v) || typeof v.sitio !== "string" || !Array.isArray(v.lista)) return undefined;
  const lista = v.lista.flatMap((p): { clave: string; nombre: string }[] =>
    esObjeto(p) && typeof p.clave === "string" && typeof p.nombre === "string" ? [{ clave: p.clave, nombre: p.nombre }] : []
  );
  return { sitio: v.sitio, lista };
}

function leerTarea(t: unknown): TareaDelGestor[] {
  if (!esObjeto(t)) return [];
  if (typeof t.clave !== "string" || typeof t.titulo !== "string" || typeof t.estado !== "string") return [];
  if (!CATEGORIAS.includes(t.categoria as CategoriaDeTarea)) return [];
  return [
    {
      clave: t.clave,
      titulo: t.titulo,
      estado: t.estado,
      categoria: t.categoria as CategoriaDeTarea,
      // Solo como texto: un objeto (la forma de Jira, con su correo dentro) se descarta entero.
      ...(typeof t.asignado === "string" ? { asignado: t.asignado } : {}),
      // Solo un enlace web: es lo que se pinta en un `href`, y un `javascript:` ahí se ejecuta.
      ...(typeof t.url === "string" && /^https?:\/\//i.test(t.url) ? { url: t.url } : {}),
    },
  ];
}

function leerPendientes(v: unknown): LecturaDelGestor["pendientes"] {
  if (!esObjeto(v) || typeof v.cuando !== "number" || !Array.isArray(v.lista)) return undefined;
  return {
    cuando: v.cuando,
    ...(typeof v.texto === "string" ? { texto: v.texto } : {}),
    // Solo el `true` literal: es lo que dice que la lista es la de «asignadas a mí», y sin él
    // el panel pinta el asignado de cada fila.
    ...(v.mias === true ? { mias: true as const } : {}),
    lista: v.lista.flatMap(leerTarea),
  };
}

/** La descripción de una tarea: la clave y el texto, y nada más de la ficha. */
function leerFicha(v: unknown): LecturaDelGestor["ficha"] {
  if (!esObjeto(v) || typeof v.clave !== "string" || typeof v.descripcion !== "string") return undefined;
  return { clave: v.clave, descripcion: v.descripcion };
}

function leerBorrador(v: unknown): LecturaDelGestor["borrador"] {
  if (!esObjeto(v) || typeof v.clave !== "string" || typeof v.texto !== "string") return undefined;
  return { clave: v.clave, texto: v.texto };
}

function leerTransicion(t: unknown): TransicionDelGestor[] {
  if (!esObjeto(t)) return [];
  if (typeof t.id !== "string" || typeof t.nombre !== "string" || typeof t.destino !== "string") return [];
  if (!CATEGORIAS.includes(t.categoria as CategoriaDeTarea)) return [];
  return [{ id: t.id, nombre: t.nombre, destino: t.destino, categoria: t.categoria as CategoriaDeTarea }];
}

function leerTransiciones(v: unknown): LecturaDelGestor["transiciones"] {
  if (!esObjeto(v) || typeof v.clave !== "string" || (v.para !== "empezar" && v.para !== "cerrar") || !Array.isArray(v.lista)) {
    return undefined;
  }
  return {
    clave: v.clave,
    para: v.para,
    lista: v.lista.flatMap(leerTransicion),
    ...(typeof v.propuesta === "string" ? { propuesta: v.propuesta } : {}),
  };
}

function leerCierre(v: unknown): LecturaDelGestor["cierre"] {
  if (!esObjeto(v) || typeof v.clave !== "string" || typeof v.comentario !== "string") return undefined;
  return { clave: v.clave, comentario: v.comentario };
}

function leerCerrado(v: unknown): LecturaDelGestor["cerrado"] {
  if (!esObjeto(v) || typeof v.clave !== "string" || typeof v.comento !== "boolean") return undefined;
  return {
    clave: v.clave,
    comento: v.comento,
    ...(typeof v.transicion === "string" ? { transicion: v.transicion } : {}),
    ...(typeof v.falloDeTransicion === "string" ? { falloDeTransicion: v.falloDeTransicion } : {}),
  };
}

function leerError(v: unknown): LecturaDelGestor["error"] {
  if (!esObjeto(v) || typeof v.accion !== "string" || typeof v.motivo !== "string") return undefined;
  return { accion: v.accion, motivo: v.motivo, ...(typeof v.clave === "string" ? { clave: v.clave } : {}) };
}
