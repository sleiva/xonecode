/**
 * Qué cruza el puente de la sesión remota, en las dos direcciones. Es la FRONTERA de seguridad
 * del lado de xonecode: lo que no está aquí no sale de la máquina ni entra en la consola, aunque
 * el móvil lo pida. Puro y sin dependencias (`core/`); el paquete `@xone/xonecode-remoto` tiene
 * su propia validación para la web, pero quien decide aquí es xonecode.
 */

export type EntradaDelMovil =
  | { clase: "prosa"; texto: string; detener?: true }
  | { clase: "decision"; decisiones: Record<string, "approve" | "reject"> }
  | { clase: "respuesta"; texto: string }
  | { clase: "cancelar" };

const objeto = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const PASAN_TAL_CUAL = new Set(["acto", "sustitucion", "reemision", "aprobacion", "turno"]);

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
        if (valor !== "approve" && valor !== "reject") return undefined;
        decisiones[id] = valor;
      }
      return { clase: "decision", decisiones };
    }
    case "respuesta":
      return typeof m.texto === "string" && m.seleccion === undefined ? { clase: "respuesta", texto: m.texto } : undefined;
    case "cancelar":
      return { clase: "cancelar" };
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
