/** La forma de un id de sala: 16 bytes aleatorios en base64url. La comprueban la URL y el relé. */
export declare const FORMA_DE_SALA: RegExp;
export interface Credenciales {
    sala: string;
    secreto: string;
}
export declare function generarCredenciales(): Credenciales;
/** `https://<host>/r/<sala>#<secreto>`: el secreto en el FRAGMENTO, que el navegador nunca envía. */
export declare function urlDeSesion(baseHttp: string, sala: string, secreto: string): string;
export declare function leerUrlDeSesion(href: string): Credenciales | undefined;
/** La base http(s) que sirve la web, a partir de la dirección ws(s) del puente. */
export declare function baseHttpDe(servidorWs: string): string;
