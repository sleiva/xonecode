import { TOPE_DE_SOBRE } from "../index.js";
export const TOPES_POR_OMISION = {
    movilesPorSala: 5,
    bytesPorMensaje: TOPE_DE_SOBRE,
    mensajesPorMinuto: 600,
    mensajesPorMinutoAnfitrion: 6000,
    graciaMs: 300_000,
};
/** Salas en memoria: empareja y enruta. No sabe nada de lo que va dentro de `carga`. */
export class Salas {
    topes;
    ahora;
    nuevoId;
    salas = new Map();
    constructor(topes, ahora = Date.now, nuevoId = () => crypto.randomUUID()) {
        this.topes = topes;
        this.ahora = ahora;
        this.nuevoId = nuevoId;
    }
    /** Todo envío pasa por aquí: un socket roto no puede cortar un bucle ni dejar una sala sin borrar. */
    emitir(enviar, sobre) {
        if (enviar === undefined)
            return;
        try {
            enviar(sobre);
        }
        catch {
            // se ignora: la conexión rota la limpia su propio cierre
        }
    }
    existe(sala) {
        return this.salas.has(sala);
    }
    /**
     * Supuesto: no hay prueba de identidad del anfitrión durante la gracia. El id de sala solo lo
     * conocen el relé y quien tiene la URL de la sesión, que ya controla la sesión por diseño; el
     * cifrado extremo a extremo impide leer o falsificar nada. Lo peor es una denegación de servicio
     * durante la gracia.
     */
    abrir(sala, enviar) {
        const existente = this.salas.get(sala);
        if (existente !== undefined && existente.anfitrion !== undefined) {
            this.emitir(enviar, { t: "error", motivo: "sala-ocupada" });
            return false;
        }
        const s = existente ?? { anfitrion: undefined, caidoDesde: undefined, moviles: new Map() };
        s.anfitrion = enviar;
        s.caidoDesde = undefined;
        this.salas.set(sala, s);
        this.emitir(enviar, { t: "abierta" });
        if (s.moviles.size > 0) {
            this.emitir(enviar, { t: "presencia", moviles: [...s.moviles.keys()] });
            for (const movil of s.moviles.values())
                this.emitir(movil, { t: "anfitrion", conectado: true });
        }
        return true;
    }
    entrar(sala, enviar) {
        const s = this.salas.get(sala);
        if (s === undefined) {
            this.emitir(enviar, { t: "error", motivo: "sala-inexistente" });
            return undefined;
        }
        if (s.moviles.size >= this.topes.movilesPorSala) {
            this.emitir(enviar, { t: "error", motivo: "tope-de-moviles" });
            return undefined;
        }
        const id = this.nuevoId();
        s.moviles.set(id, enviar);
        this.emitir(enviar, { t: "entrada", id });
        this.emitir(enviar, { t: "anfitrion", conectado: s.anfitrion !== undefined });
        this.emitir(s.anfitrion, { t: "presencia", moviles: [...s.moviles.keys()] });
        return id;
    }
    salir(sala, id) {
        const s = this.salas.get(sala);
        if (s === undefined || !s.moviles.delete(id))
            return;
        this.emitir(s.anfitrion, { t: "presencia", moviles: [...s.moviles.keys()] });
    }
    datoDelAnfitrion(sala, para, carga) {
        const s = this.salas.get(sala);
        if (s === undefined)
            return;
        if (para !== undefined) {
            this.emitir(s.moviles.get(para), { t: "dato", carga });
            return;
        }
        for (const movil of s.moviles.values())
            this.emitir(movil, { t: "dato", carga });
    }
    /** Solo de un móvil que SIGUE en la sala: uno de una sala ya cerrada no llega a quien reabra el mismo id. */
    datoDelMovil(sala, id, carga) {
        const s = this.salas.get(sala);
        if (s === undefined || !s.moviles.has(id))
            return;
        this.emitir(s.anfitrion, { t: "dato", de: id, carga });
    }
    /** Solo vale si `enviar` es el anfitrión actual: el cierre tardío de uno viejo no echa al nuevo. */
    anfitrionCaido(sala, enviar) {
        const s = this.salas.get(sala);
        if (s === undefined || s.anfitrion !== enviar)
            return;
        s.anfitrion = undefined;
        s.caidoDesde = this.ahora();
        for (const movil of s.moviles.values())
            this.emitir(movil, { t: "anfitrion", conectado: false });
    }
    /** Cierre pedido por el anfitrión actual; con otro `enviar` no hace nada. */
    cerrar(sala, enviar) {
        const s = this.salas.get(sala);
        if (s === undefined || s.anfitrion !== enviar)
            return;
        this.expulsar(sala, s);
    }
    expulsar(sala, s) {
        for (const movil of s.moviles.values())
            this.emitir(movil, { t: "cerrada" });
        this.salas.delete(sala);
    }
    /** Cierra las salas cuyo anfitrión lleva caído más que la gracia. Se llama periódicamente. */
    barrer() {
        for (const [sala, s] of this.salas) {
            if (s.caidoDesde !== undefined && this.ahora() - s.caidoDesde > this.topes.graciaMs)
                this.expulsar(sala, s);
        }
    }
}
