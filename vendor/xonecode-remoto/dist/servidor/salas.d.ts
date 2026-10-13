import { type SobreDelServidor } from "../index.js";
export interface Topes {
    movilesPorSala: number;
    bytesPorMensaje: number;
    /** Ritmo sostenido de un MÓVIL (y de toda conexión antes de su primer mensaje). */
    mensajesPorMinuto: number;
    /**
     * Ritmo sostenido de un ANFITRIÓN. xonecode manda una `sustitucion` cada 80 ms mientras el modelo
     * escribe (unas 750 por minuto, hasta el doble con razonamiento): con el tope del móvil se cortaría.
     */
    mensajesPorMinutoAnfitrion: number;
    graciaMs: number;
}
export declare const TOPES_POR_OMISION: Topes;
type Enviar = (sobre: SobreDelServidor) => void;
/** Salas en memoria: empareja y enruta. No sabe nada de lo que va dentro de `carga`. */
export declare class Salas {
    private readonly topes;
    private readonly ahora;
    private readonly nuevoId;
    private readonly salas;
    constructor(topes: Topes, ahora?: () => number, nuevoId?: () => string);
    /** Todo envío pasa por aquí: un socket roto no puede cortar un bucle ni dejar una sala sin borrar. */
    private emitir;
    existe(sala: string): boolean;
    /**
     * Supuesto: no hay prueba de identidad del anfitrión durante la gracia. El id de sala solo lo
     * conocen el relé y quien tiene la URL de la sesión, que ya controla la sesión por diseño; el
     * cifrado extremo a extremo impide leer o falsificar nada. Lo peor es una denegación de servicio
     * durante la gracia.
     */
    abrir(sala: string, enviar: Enviar): boolean;
    entrar(sala: string, enviar: Enviar): string | undefined;
    salir(sala: string, id: string): void;
    datoDelAnfitrion(sala: string, para: string | undefined, carga: string): void;
    /** Solo de un móvil que SIGUE en la sala: uno de una sala ya cerrada no llega a quien reabra el mismo id. */
    datoDelMovil(sala: string, id: string, carga: string): void;
    /** Solo vale si `enviar` es el anfitrión actual: el cierre tardío de uno viejo no echa al nuevo. */
    anfitrionCaido(sala: string, enviar: Enviar): void;
    /** Cierre pedido por el anfitrión actual; con otro `enviar` no hace nada. */
    cerrar(sala: string, enviar: Enviar): void;
    private expulsar;
    /** Cierra las salas cuyo anfitrión lleva caído más que la gracia. Se llama periódicamente. */
    barrer(): void;
}
export {};
