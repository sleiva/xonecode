/**
 * El tope de un sobre en BYTES, tal como viaja (el JSON entero del sobre). Quien manda tiene que
 * mantener cada sobre por debajo: la carga va cifrada (AES-GCM) y en base64url, que suman en torno a
 * un 33 % al contenido en claro. Por encima, el relé no contesta con un `error`: cierra el socket con
 * el código 1009 de WebSocket (mensaje demasiado grande).
 */
export const TOPE_DE_SOBRE = 1_000_000;
const MOTIVOS = [
    "version",
    "sala-inexistente",
    "sala-ocupada",
    "tope-de-moviles",
    "ritmo",
    "mensaje-ilegible",
];
const esTexto = (x) => typeof x === "string" && x.length > 0;
/** Lee un sobre de un lado. Lo que no tiene exactamente una forma permitida es `undefined`. */
export function interpretarSobre(texto, lado) {
    let o;
    try {
        const crudo = JSON.parse(texto);
        if (typeof crudo !== "object" || crudo === null || Array.isArray(crudo))
            return undefined;
        o = crudo;
    }
    catch {
        return undefined;
    }
    const r = sobreDe(o, lado);
    return r;
}
function sobreDe(o, lado) {
    if (lado === "anfitrion") {
        if (o.t === "abrir" && esTexto(o.sala) && typeof o.v === "number")
            return { t: "abrir", sala: o.sala, v: o.v };
        if (o.t === "dato" && esTexto(o.carga)) {
            if (o.para === undefined)
                return { t: "dato", carga: o.carga };
            return esTexto(o.para) ? { t: "dato", para: o.para, carga: o.carga } : undefined;
        }
        if (o.t === "cerrar")
            return { t: "cerrar" };
        return undefined;
    }
    if (lado === "movil") {
        if (o.t === "entrar" && esTexto(o.sala) && typeof o.v === "number")
            return { t: "entrar", sala: o.sala, v: o.v };
        if (o.t === "dato" && esTexto(o.carga) && o.para === undefined)
            return { t: "dato", carga: o.carga };
        return undefined;
    }
    if (o.t === "abierta" || o.t === "cerrada")
        return { t: o.t };
    if (o.t === "entrada" && esTexto(o.id))
        return { t: "entrada", id: o.id };
    if (o.t === "presencia" && Array.isArray(o.moviles) && o.moviles.every(esTexto))
        return { t: "presencia", moviles: o.moviles };
    if (o.t === "anfitrion" && typeof o.conectado === "boolean")
        return { t: "anfitrion", conectado: o.conectado };
    if (o.t === "dato" && esTexto(o.carga)) {
        if (o.de === undefined)
            return { t: "dato", carga: o.carga };
        return esTexto(o.de) ? { t: "dato", de: o.de, carga: o.carga } : undefined;
    }
    if (o.t === "error" && typeof o.motivo === "string" && MOTIVOS.includes(o.motivo)) {
        return { t: "error", motivo: o.motivo };
    }
    return undefined;
}
