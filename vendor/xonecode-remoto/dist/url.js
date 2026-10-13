import { aBase64url } from "./base64url.js";
const BYTES_DE_SALA = 16;
const BYTES_DE_SECRETO = 32;
/** La forma de un id de sala: 16 bytes aleatorios en base64url. La comprueban la URL y el relé. */
export const FORMA_DE_SALA = /^[A-Za-z0-9_-]{22}$/;
const SECRETO = /^[A-Za-z0-9_-]{43}$/;
export function generarCredenciales() {
    const sala = crypto.getRandomValues(new Uint8Array(BYTES_DE_SALA));
    const secreto = crypto.getRandomValues(new Uint8Array(BYTES_DE_SECRETO));
    return { sala: aBase64url(sala), secreto: aBase64url(secreto) };
}
/** `https://<host>/r/<sala>#<secreto>`: el secreto en el FRAGMENTO, que el navegador nunca envía. */
export function urlDeSesion(baseHttp, sala, secreto) {
    return `${baseHttp.replace(/\/+$/, "")}/r/${sala}#${secreto}`;
}
export function leerUrlDeSesion(href) {
    let url;
    try {
        url = new URL(href);
    }
    catch {
        return undefined;
    }
    const sala = /^\/r\/([^/]+)\/?$/.exec(url.pathname)?.[1];
    const secreto = url.hash.replace(/^#/, "");
    if (sala === undefined || !FORMA_DE_SALA.test(sala) || !SECRETO.test(secreto))
        return undefined;
    return { sala, secreto };
}
/** La base http(s) que sirve la web, a partir de la dirección ws(s) del puente. */
export function baseHttpDe(servidorWs) {
    const url = new URL(servidorWs);
    const protocolo = url.protocol === "wss:" ? "https:" : "http:";
    return `${protocolo}//${url.host}`;
}
