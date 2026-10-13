import { aBase64url, deBase64url } from "./base64url.js";
import { VERSION_DEL_PROTOCOLO } from "./version.js";
const BYTES_DE_NONCE = 12;
const codificar = new TextEncoder();
const decodificar = new TextDecoder();
async function derivar(base, sala, direccion) {
    return crypto.subtle.deriveKey({
        name: "HKDF",
        hash: "SHA-256",
        salt: codificar.encode(`xonecode-remoto/v${VERSION_DEL_PROTOCOLO}/${sala}`),
        info: codificar.encode(direccion),
    }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
/**
 * Crea el canal cifrado de un extremo.
 *
 * La protección contra repetición (secuencia creciente por origen) solo vale DENTRO de una misma
 * instancia de `Canal`: es ella la que recuerda la última secuencia vista de cada origen. Por eso un
 * anfitrión crea UN canal por encendido y lo conserva a través de las reconexiones del WebSocket;
 * nunca crea un `Canal` nuevo al reconectar. Si lo hiciera, el relé podría reenviarle mensajes
 * anteriores de un móvil y el canal nuevo los aceptaría como frescos.
 */
export async function crearCanal(opciones) {
    const bytes = deBase64url(opciones.secreto);
    if (bytes === undefined || bytes.length !== 32)
        throw new Error("secreto inválido");
    const base = await crypto.subtle.importKey("raw", bytes.slice(), "HKDF", false, ["deriveKey"]);
    const envio = opciones.rol === "anfitrion" ? "a2m" : "m2a";
    const recepcion = envio === "a2m" ? "m2a" : "a2m";
    const claveDeEnvio = await derivar(base, opciones.sala, envio);
    const claveDeRecepcion = await derivar(base, opciones.sala, recepcion);
    const aad = (d) => codificar.encode(`v${VERSION_DEL_PROTOCOLO}|${opciones.sala}|${d}`);
    const origen = opciones.origen ?? aBase64url(crypto.getRandomValues(new Uint8Array(12)));
    const nonce = opciones.nonce ?? (() => crypto.getRandomValues(new Uint8Array(BYTES_DE_NONCE)));
    let secuencia = 0;
    const ultimaPorOrigen = new Map();
    return {
        async cifrar(mensaje) {
            secuencia += 1;
            const iv = nonce();
            const claro = codificar.encode(JSON.stringify({ o: origen, s: secuencia, m: mensaje }));
            const cifrado = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad(envio) }, claveDeEnvio, claro));
            const junto = new Uint8Array(iv.length + cifrado.length);
            junto.set(iv, 0);
            junto.set(cifrado, iv.length);
            return aBase64url(junto);
        },
        async descifrar(carga) {
            const junto = deBase64url(carga);
            if (junto === undefined || junto.length <= BYTES_DE_NONCE)
                return undefined;
            let claro;
            try {
                claro = await crypto.subtle.decrypt({ name: "AES-GCM", iv: junto.slice(0, BYTES_DE_NONCE), additionalData: aad(recepcion) }, claveDeRecepcion, junto.slice(BYTES_DE_NONCE));
            }
            catch {
                return undefined;
            }
            let sobre;
            try {
                sobre = JSON.parse(decodificar.decode(claro));
            }
            catch {
                return undefined;
            }
            if (typeof sobre.o !== "string" || typeof sobre.s !== "number")
                return undefined;
            const ultima = ultimaPorOrigen.get(sobre.o) ?? 0;
            if (sobre.s <= ultima)
                return undefined;
            ultimaPorOrigen.set(sobre.o, sobre.s);
            return sobre.m;
        },
    };
}
