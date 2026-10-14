/**
 * El contenido cifrado: un SUBCONJUNTO en lista blanca del cable de la consola web de xonecode.
 * Las formas copian las de xonecode (`apps/web/src/tipos.ts`): si cambian allí, cambia aquí y
 * sube `VERSION_DEL_PROTOCOLO`.
 */
const objeto = (x) => typeof x === "object" && x !== null && !Array.isArray(x);
const texto = (x) => typeof x === "string";
const noVacio = (x) => texto(x) && x.length > 0;
const esActo = (x) => objeto(x) && texto(x.tipo);
/** Los tipos de artefacto que la web móvil enseña: imágenes (la misma lista que el anfitrión). */
export const MIMES_DE_ARTEFACTO = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
export function validarDelMovil(m) {
    if (!objeto(m))
        return undefined;
    switch (m.clase) {
        case "prosa":
            if (!texto(m.texto) || m.adjuntos !== undefined)
                return undefined;
            if (m.detener === undefined)
                return { clase: "prosa", texto: m.texto };
            return m.detener === true ? { clase: "prosa", texto: m.texto, detener: true } : undefined;
        case "decision": {
            if (!objeto(m.decisiones))
                return undefined;
            const decisiones = {};
            for (const [id, valor] of Object.entries(m.decisiones)) {
                if (id === "__proto__")
                    continue;
                if (valor !== "approve" && valor !== "reject")
                    return undefined;
                decisiones[id] = valor;
            }
            if (m.consola === undefined)
                return { clase: "decision", decisiones };
            return noVacio(m.consola) ? { clase: "decision", decisiones, consola: m.consola } : undefined;
        }
        case "respuesta":
            return texto(m.texto) && m.seleccion === undefined ? { clase: "respuesta", texto: m.texto } : undefined;
        case "cancelar":
            return { clase: "cancelar" };
        case "feedback":
            return noVacio(m.tarea) && texto(m.texto) && m.texto.trim() !== "" ? { clase: "feedback", tarea: m.tarea, texto: m.texto } : undefined;
        case "continuar":
            return noVacio(m.tarea) ? { clase: "continuar", tarea: m.tarea } : undefined;
        case "artefacto":
            return noVacio(m.ruta) && m.ruta.length <= 300 ? { clase: "artefacto", ruta: m.ruta } : undefined;
        default:
            return undefined;
    }
}
/** Pendientes, ficheros y diffs de una aprobación: la validación es UNA, la del mensaje `aprobacion` y la de cada consola del panorama. */
function validarAprobacion(m) {
    // Un anfitrión autenticado es de fiar en el CONTENIDO, no en la FORMA: se valida y se reconstruye.
    if (!Array.isArray(m.pendientes) || !objeto(m.ficheros) || !objeto(m.diffs))
        return undefined;
    const pendientes = [];
    for (const p of m.pendientes) {
        if (!objeto(p) || !texto(p.id) || !texto(p.origen) || !texto(p.descripcion))
            return undefined;
        if (!Array.isArray(p.decisionesPermitidas) || !p.decisionesPermitidas.every(texto))
            return undefined;
        pendientes.push({
            id: p.id,
            origen: p.origen,
            descripcion: p.descripcion,
            decisionesPermitidas: [...p.decisionesPermitidas],
            ...(p.remota === true ? { remota: true } : {}),
        });
    }
    const ficheros = {};
    for (const [k, v] of Object.entries(m.ficheros)) {
        if (!texto(v))
            return undefined;
        ficheros[k] = v;
    }
    const diffs = {};
    for (const [k, v] of Object.entries(m.diffs)) {
        if (!Array.isArray(v))
            return undefined;
        const lineas = [];
        for (const l of v) {
            if (!objeto(l) || !texto(l.texto))
                return undefined;
            if (l.tipo !== "igual" && l.tipo !== "anadido" && l.tipo !== "quitado")
                return undefined;
            lineas.push({ tipo: l.tipo, texto: l.texto });
        }
        diffs[k] = lineas;
    }
    return { pendientes, ficheros, diffs };
}
const ESTADOS_DE_CONSOLA = ["trabajando", "esperando-aprobacion", "esperando-respuesta", "parada"];
const ESTADOS_DE_TAREA = ["nuevo", "en-proceso", "requiere-atencion", "terminada"];
/** Un campo de texto OPCIONAL: ausente vale, presente tiene que ser texto. `false` = forma mala. */
const opcional = (x) => x === undefined || texto(x);
function validarConsola(c) {
    if (!objeto(c) || !texto(c.id) || !texto(c.proyecto) || typeof c.foco !== "boolean")
        return undefined;
    if (!texto(c.estado) || !ESTADOS_DE_CONSOLA.includes(c.estado))
        return undefined;
    if (!opcional(c.sesion) || !opcional(c.ultimaActividad))
        return undefined;
    let aprobacion;
    if (c.aprobacion !== undefined) {
        if (!objeto(c.aprobacion))
            return undefined;
        const a = validarAprobacion(c.aprobacion);
        if (!a)
            return undefined;
        if (c.aprobacion.recortada !== undefined && c.aprobacion.recortada !== true)
            return undefined;
        aprobacion = { ...a, ...(c.aprobacion.recortada === true ? { recortada: true } : {}) };
    }
    return {
        id: c.id,
        proyecto: c.proyecto,
        ...(texto(c.sesion) ? { sesion: c.sesion } : {}),
        foco: c.foco,
        estado: c.estado,
        ...(texto(c.ultimaActividad) ? { ultimaActividad: c.ultimaActividad } : {}),
        ...(aprobacion ? { aprobacion } : {}),
    };
}
function validarTarea(t) {
    if (!objeto(t) || !texto(t.id) || !texto(t.titulo) || !texto(t.proyecto) || !texto(t.creada))
        return undefined;
    if (!texto(t.estado) || !ESTADOS_DE_TAREA.includes(t.estado))
        return undefined;
    if (!opcional(t.tras) || !opcional(t.motivo) || !opcional(t.acabada))
        return undefined;
    return {
        id: t.id,
        titulo: t.titulo,
        proyecto: t.proyecto,
        estado: t.estado,
        ...(texto(t.tras) ? { tras: t.tras } : {}),
        ...(texto(t.motivo) ? { motivo: t.motivo } : {}),
        creada: t.creada,
        ...(texto(t.acabada) ? { acabada: t.acabada } : {}),
    };
}
export function validarDelAnfitrion(m) {
    if (!objeto(m))
        return undefined;
    switch (m.clase) {
        // El contenido de los actos pasa tal cual lo mandó el anfitrión, a propósito: la interfaz lo pinta como texto.
        case "acto":
        case "sustitucion":
            return esActo(m.acto) ? { clase: m.clase, acto: m.acto } : undefined;
        case "reemision":
            return Array.isArray(m.actos) && m.actos.every(esActo) ? { clase: "reemision", actos: m.actos } : undefined;
        case "aprobacion": {
            const a = validarAprobacion(m);
            return a ? { clase: "aprobacion", ...a } : undefined;
        }
        case "pregunta":
            // El móvil solo contesta TEXTO: una pregunta con forma de decisión (plan, casillas, selector) no se le reenvía.
            if (m.decision !== undefined || m.seleccionable !== undefined || m.selector !== undefined)
                return undefined;
            return texto(m.texto) ? { clase: "pregunta", texto: m.texto } : undefined;
        case "turno":
            if (typeof m.activo !== "boolean")
                return undefined;
            return m.detenible === true ? { clase: "turno", activo: m.activo, detenible: true } : { clase: "turno", activo: m.activo };
        case "remoto.estado":
            return {
                clase: "remoto.estado",
                ...(texto(m.proyecto) ? { proyecto: m.proyecto } : {}),
                ...(texto(m.sesion) ? { sesion: m.sesion } : {}),
            };
        case "artefacto.trozo": {
            const entero = (x) => typeof x === "number" && Number.isInteger(x) && x >= 0;
            if (!noVacio(m.ruta) || !texto(m.datos) || !entero(m.indice) || !entero(m.total) || m.indice >= m.total)
                return undefined;
            // Solo imágenes: lo que se pinta con este trozo es un `<img>`, nunca un documento.
            if (!texto(m.mime) || !MIMES_DE_ARTEFACTO.has(m.mime))
                return undefined;
            return { clase: "artefacto.trozo", ruta: m.ruta, mime: m.mime, indice: m.indice, total: m.total, datos: m.datos };
        }
        case "artefacto.error":
            return noVacio(m.ruta) && texto(m.motivo) ? { clase: "artefacto.error", ruta: m.ruta, motivo: m.motivo } : undefined;
        case "panorama": {
            if (!Array.isArray(m.consolas) || !Array.isArray(m.tareas))
                return undefined;
            if (typeof m.esperando !== "number" || !Number.isFinite(m.esperando) || m.esperando < 0)
                return undefined;
            const consolas = [];
            for (const c of m.consolas) {
                const v = validarConsola(c);
                if (!v)
                    return undefined;
                consolas.push(v);
            }
            const tareas = [];
            for (const t of m.tareas) {
                const v = validarTarea(t);
                if (!v)
                    return undefined;
                tareas.push(v);
            }
            return { clase: "panorama", consolas, tareas, esperando: m.esperando };
        }
        default:
            return undefined;
    }
}
