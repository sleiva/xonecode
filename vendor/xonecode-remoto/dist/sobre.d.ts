/**
 * El tope de un sobre en BYTES, tal como viaja (el JSON entero del sobre). Quien manda tiene que
 * mantener cada sobre por debajo: la carga va cifrada (AES-GCM) y en base64url, que suman en torno a
 * un 33 % al contenido en claro. Por encima, el relé no contesta con un `error`: cierra el socket con
 * el código 1009 de WebSocket (mensaje demasiado grande).
 */
export declare const TOPE_DE_SOBRE = 1000000;
export type MotivoDeError = "version" | "sala-inexistente" | "sala-ocupada" | "tope-de-moviles" | "ritmo" | "mensaje-ilegible";
export type SobreDelAnfitrion = {
    t: "abrir";
    sala: string;
    v: number;
} | {
    t: "dato";
    para?: string;
    carga: string;
} | {
    t: "cerrar";
};
export type SobreDelMovil = {
    t: "entrar";
    sala: string;
    v: number;
} | {
    t: "dato";
    carga: string;
};
export type SobreDelServidor = {
    t: "abierta";
} | {
    t: "entrada";
    id: string;
} | {
    t: "presencia";
    moviles: string[];
} | {
    t: "anfitrion";
    conectado: boolean;
} | {
    t: "dato";
    de?: string;
    carga: string;
} | {
    t: "error";
    motivo: MotivoDeError;
} | {
    t: "cerrada";
};
type Lado = "anfitrion" | "movil" | "servidor";
type SobreDe<L extends Lado> = L extends "anfitrion" ? SobreDelAnfitrion : L extends "movil" ? SobreDelMovil : SobreDelServidor;
/** Lee un sobre de un lado. Lo que no tiene exactamente una forma permitida es `undefined`. */
export declare function interpretarSobre<L extends Lado>(texto: string, lado: L): SobreDe<L> | undefined;
export {};
