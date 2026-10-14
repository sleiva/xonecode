import { CARACTERES_DE_FEEDBACK } from "./panorama.js";

/**
 * Qué cruza el puente de la sesión remota, en las dos direcciones. Es la FRONTERA de seguridad
 * del lado de xonecode: lo que no está aquí no sale de la máquina ni entra en la consola, aunque
 * el móvil lo pida. Puro y sin dependencias (`core/`); el paquete del puente (`xonecode-remoto`) tiene
 * su propia validación para la web, pero quien decide aquí es xonecode.
 */

export type EntradaDelMovil =
  | { clase: "prosa"; texto: string; detener?: true }
  | { clase: "decision"; decisiones: Record<string, "approve" | "reject">; consola?: string }
  | { clase: "respuesta"; texto: string }
  | { clase: "feedback"; tarea: string; texto: string }
  | { clase: "continuar"; tarea: string }
  | { clase: "cancelar" }
  /** Ver un artefacto del hilo (una captura): su ruta VIRTUAL, la del acto `artefacto`. Quien lo
   *  sirve vuelve a pasarla por `esRutaDeArtefacto` y el lector la comprueba contra el disco. */
  | { clase: "artefacto"; ruta: string };

const objeto = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const PASAN_TAL_CUAL = new Set(["acto", "sustitucion", "reemision", "aprobacion", "turno", "panorama", "artefacto.trozo", "artefacto.error"]);

/** Lo que se manda al móvil, ya en su forma de salida; `undefined` = no sale. */
export function filtrarSalida(mensaje: unknown): unknown | undefined {
  if (!objeto(mensaje) || typeof mensaje.clase !== "string") return undefined;
  if (PASAN_TAL_CUAL.has(mensaje.clase)) return mensaje;
  if (mensaje.clase === "pregunta") {
    // Con `decision` es la subida a CloudStudio con casillas: se queda en el escritorio (v1).
    return mensaje.decision === undefined && typeof mensaje.texto === "string" ? { clase: "pregunta", texto: mensaje.texto } : undefined;
  }
  if (mensaje.clase === "alta") return estadoDesdeAlta(mensaje);
  return undefined;
}

/** Del alta solo cruzan el NOMBRE del proyecto en foco y el TÍTULO de su sesión: ni entornos, ni rutas, ni workspace. */
function estadoDesdeAlta(alta: Record<string, unknown>): { clase: "remoto.estado"; proyecto?: string; sesion?: string } {
  const proyectos = Array.isArray(alta.proyectos) ? alta.proyectos.filter(objeto) : [];
  const proyecto = proyectos.find((p) => p.id === alta.proyectoActivo);
  const sesiones = proyecto !== undefined && Array.isArray(proyecto.sesiones) ? proyecto.sesiones.filter(objeto) : [];
  const sesion = sesiones.find((s) => s.id === alta.sesionActiva);
  return {
    clase: "remoto.estado",
    ...(typeof proyecto?.nombre === "string" ? { proyecto: proyecto.nombre } : {}),
    ...(typeof sesion?.titulo === "string" && sesion.titulo !== "" ? { sesion: sesion.titulo } : {}),
  };
}

export function validarEntradaDelMovil(m: unknown): EntradaDelMovil | undefined {
  if (!objeto(m)) return undefined;
  switch (m.clase) {
    case "prosa":
      if (typeof m.texto !== "string" || m.adjuntos !== undefined) return undefined;
      if (m.detener === undefined) return { clase: "prosa", texto: m.texto };
      return m.detener === true ? { clase: "prosa", texto: m.texto, detener: true } : undefined;
    case "decision": {
      if (!objeto(m.decisiones)) return undefined;
      const decisiones: Record<string, "approve" | "reject"> = {};
      for (const [id, valor] of Object.entries(m.decisiones)) {
        if (id === "__proto__") continue;
        if (valor !== "approve" && valor !== "reject") return undefined;
        decisiones[id] = valor;
      }
      if (m.consola === undefined) return { clase: "decision", decisiones };
      return typeof m.consola === "string" && m.consola !== "" ? { clase: "decision", decisiones, consola: m.consola } : undefined;
    }
    case "feedback": {
      if (typeof m.tarea !== "string" || m.tarea === "" || typeof m.texto !== "string" || m.texto.trim() === "") return undefined;
      return { clase: "feedback", tarea: m.tarea, texto: m.texto.slice(0, CARACTERES_DE_FEEDBACK) };
    }
    case "continuar":
      return typeof m.tarea === "string" && m.tarea !== "" ? { clase: "continuar", tarea: m.tarea } : undefined;
    case "respuesta":
      return typeof m.texto === "string" && m.seleccion === undefined ? { clase: "respuesta", texto: m.texto } : undefined;
    case "cancelar":
      return { clase: "cancelar" };
    case "artefacto":
      return typeof m.ruta === "string" && m.ruta !== "" && m.ruta.length <= LARGO_DE_RUTA_DE_ARTEFACTO
        ? { clase: "artefacto", ruta: m.ruta }
        : undefined;
    default:
      return undefined;
  }
}

/**
 * Lo máximo que se manda al móvil en UN mensaje, en bytes de su JSON. El relé cierra la conexión
 * si el sobre pasa de `TOPE_DE_SOBRE` (1_000_000) y base64 + AES-GCM lo engordan ~33 %, así que
 * se queda por debajo de ese tope dividido entre ~1,4. Pasarse no da un error legible: da un cierre.
 */
export const TOPE_DE_SALIDA_BYTES = 700_000;

const bytesDe = (m: unknown): number => new TextEncoder().encode(JSON.stringify(m)).length;

/**
 * Hace caber un mensaje de salida en el tope. Una `reemision` se recorta quitando los actos más
 * VIEJOS (lo reciente es lo que el móvil necesita ver); cualquier otro que no quepa devuelve
 * `undefined` y quien llama lo anota, porque partir una aprobación o un diff lo falsearía.
 */
export function ajustarATope(mensaje: unknown, tope: number = TOPE_DE_SALIDA_BYTES): unknown | undefined {
  if (bytesDe(mensaje) <= tope) return mensaje;
  if (objeto(mensaje) && mensaje.clase === "panorama") return ajustarPanorama(mensaje, tope);
  if (!objeto(mensaje) || mensaje.clase !== "reemision" || !Array.isArray(mensaje.actos)) return undefined;
  const actos = mensaje.actos;
  if (bytesDe({ ...mensaje, actos: [] }) > tope) return undefined;
  // Búsqueda binaria del mayor sufijo que cabe (el tamaño crece con el número de actos).
  let desde = 0;
  let hasta = actos.length; // `hasta` actos descartados: cabe seguro (0 actos ya cabe)
  while (desde < hasta) {
    const medio = (desde + hasta) >> 1;
    if (bytesDe({ ...mensaje, actos: actos.slice(medio) }) <= tope) hasta = medio;
    else desde = medio + 1;
  }
  return { ...mensaje, actos: actos.slice(hasta) };
}

/** Un panorama que no cabe: primero fuera los diffs (con `recortada`), luego las tareas terminadas; si ni así, no sale. */
function ajustarPanorama(p: Record<string, unknown>, tope: number): unknown | undefined {
  const consolas = Array.isArray(p.consolas) ? p.consolas : [];
  const sinDiffs = {
    ...p,
    consolas: consolas.map((c) =>
      objeto(c) && objeto(c.aprobacion) ? { ...c, aprobacion: { ...c.aprobacion, diffs: {}, recortada: true } } : c,
    ),
  };
  if (bytesDe(sinDiffs) <= tope) return sinDiffs;
  const tareas = Array.isArray(p.tareas) ? p.tareas : [];
  const sinTerminadas = { ...sinDiffs, tareas: tareas.filter((t) => !(objeto(t) && t.estado === "terminada")) };
  return bytesDe(sinTerminadas) <= tope ? sinTerminadas : undefined;
}

/** Una ruta de artefacto más larga que esto no es de un artefacto: se descarta sin mirar más. */
const LARGO_DE_RUTA_DE_ARTEFACTO = 300;

/**
 * Los artefactos que el móvil puede VER: imágenes, que son lo que pide quien sigue un turno desde el
 * teléfono (las capturas del aparato). Un HTML o un `.openui` no: en el escritorio se sirven dentro de un
 * iframe con dos capas de sandbox, y en la web móvil no hay con qué aislarlos.
 */
export const MIMES_DE_ARTEFACTO_AL_MOVIL: ReadonlySet<string> = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

/** Lo máximo que se manda de UN artefacto al móvil, en bytes del fichero: una captura cabe de sobra. */
export const TOPE_DE_ARTEFACTO_AL_MOVIL = 6_000_000;

/** Caracteres de base64 por trozo: con su sobre JSON queda por debajo de `TOPE_DE_SALIDA_BYTES`. */
export const CARACTERES_POR_TROZO = 450_000;

export type MensajeDeArtefactoAlMovil =
  | { clase: "artefacto.trozo"; ruta: string; mime: string; indice: number; total: number; datos: string }
  | { clase: "artefacto.error"; ruta: string; motivo: string };

/**
 * Un artefacto partido en los mensajes que cruzan el puente: base64 en trozos que caben en el tope de
 * salida (una captura pasa de él entera), en ORDEN —el canal cifrado los manda en cola, en el orden de
 * llamada— y numerados para que el móvil los junte y sepa cuándo tiene todos.
 */
export function trozosDeArtefacto(ruta: string, mime: string, datos: Uint8Array): MensajeDeArtefactoAlMovil[] {
  const base64 = Buffer.from(datos).toString("base64");
  const total = Math.max(1, Math.ceil(base64.length / CARACTERES_POR_TROZO));
  const trozos: MensajeDeArtefactoAlMovil[] = [];
  for (let indice = 0; indice < total; indice++) {
    trozos.push({
      clase: "artefacto.trozo",
      ruta,
      mime,
      indice,
      total,
      datos: base64.slice(indice * CARACTERES_POR_TROZO, (indice + 1) * CARACTERES_POR_TROZO),
    });
  }
  return trozos;
}
