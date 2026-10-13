import { type Topes } from "./salas.js";
export interface OpcionesDelServidor {
    puerto: number;
    /** Dirección de escucha; por omisión solo loopback. */
    host?: string;
    /** La web móvil; por omisión la que viaja en el paquete (`web/`, relativa a este módulo). */
    carpetaWeb?: string;
    topes?: Topes;
    /** Periodo del barrido y del ping de latido; por omisión 10 s. */
    latidoMs?: number;
    /** Plazo para el primer `abrir`/`entrar` válido; por omisión `PLAZO_PRIMER_MENSAJE_MS`. */
    plazoPrimerMensajeMs?: number;
    /** El reloj (ms) del ritmo y de la gracia de las salas; por omisión `Date.now`. Solo para los tests. */
    ahora?: () => number;
}
/**
 * Un cubo de fichas por conexión: cabe un minuto de ritmo y se rellena a ese ritmo, sin ventanas
 * fijas que dejen pasar el doble a caballo del cambio de minuto. El tope lo da el papel de la
 * conexión en cada mensaje, así que al pasar a anfitrión se rellena a su ritmo.
 */
export declare function crearCubo(ahora: () => number, inicial: number): {
    /** Gasta una ficha si la hay; `false` es que se ha pasado del ritmo. */
    gastar(porMinuto: number): boolean;
};
export declare const PLAZO_PRIMER_MENSAJE_MS = 10000;
export interface ServidorEnMarcha {
    urlHttp: string;
    urlWs: string;
    cerrar(): Promise<void>;
}
export declare function arrancarServidor(opciones: OpcionesDelServidor): Promise<ServidorEnMarcha>;
