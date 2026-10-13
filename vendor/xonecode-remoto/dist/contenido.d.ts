/**
 * El contenido cifrado: un SUBCONJUNTO en lista blanca del cable de la consola web de xonecode.
 * Las formas copian las de xonecode (`apps/web/src/tipos.ts`): si cambian allí, cambia aquí y
 * sube `VERSION_DEL_PROTOCOLO`.
 */
export type LineaDeDiff = {
    tipo: "igual" | "anadido" | "quitado";
    texto: string;
};
export type Acto = {
    tipo: "usuario";
    texto: string;
    cuando?: string;
} | {
    tipo: "asistente";
    texto: string;
    cuando?: string;
} | {
    tipo: "sistema";
    texto: string;
    clase?: string;
} | {
    tipo: "herramientas";
    lineas: string[];
} | {
    tipo: "consulta";
    pregunta: string;
    opciones: string[];
} | {
    tipo: string;
    [campo: string]: unknown;
};
export interface PendienteDeAprobacion {
    id: string;
    origen: string;
    descripcion: string;
    decisionesPermitidas: string[];
    remota?: true;
}
export type EstadoDeConsola = "trabajando" | "esperando-aprobacion" | "esperando-respuesta" | "parada";
export type EstadoDeTarea = "nuevo" | "en-proceso" | "requiere-atencion" | "terminada";
export interface AprobacionDeConsola {
    pendientes: PendienteDeAprobacion[];
    ficheros: Record<string, string>;
    diffs: Record<string, LineaDeDiff[]>;
    recortada?: true;
}
export interface ConsolaDelPanorama {
    id: string;
    proyecto: string;
    sesion?: string;
    foco: boolean;
    estado: EstadoDeConsola;
    ultimaActividad?: string;
    aprobacion?: AprobacionDeConsola;
}
export interface TareaDelPanorama {
    id: string;
    titulo: string;
    proyecto: string;
    estado: EstadoDeTarea;
    tras?: string;
    motivo?: string;
    creada: string;
    acabada?: string;
}
export type MensajeDelAnfitrion = {
    clase: "acto";
    acto: Acto;
} | {
    clase: "sustitucion";
    acto: Acto;
} | {
    clase: "reemision";
    actos: Acto[];
} | {
    clase: "aprobacion";
    pendientes: PendienteDeAprobacion[];
    ficheros: Record<string, string>;
    diffs: Record<string, LineaDeDiff[]>;
} | {
    clase: "pregunta";
    texto: string;
} | {
    clase: "turno";
    activo: boolean;
    detenible?: true;
} | {
    clase: "remoto.estado";
    proyecto?: string;
    sesion?: string;
} | {
    clase: "panorama";
    consolas: ConsolaDelPanorama[];
    tareas: TareaDelPanorama[];
    esperando: number;
};
export type Decision = "approve" | "reject";
export type MensajeDelMovil = {
    clase: "prosa";
    texto: string;
    detener?: true;
} | {
    clase: "decision";
    decisiones: Record<string, Decision>;
    consola?: string;
} | {
    clase: "respuesta";
    texto: string;
} | {
    clase: "cancelar";
} | {
    clase: "feedback";
    tarea: string;
    texto: string;
} | {
    clase: "continuar";
    tarea: string;
};
export declare function validarDelMovil(m: unknown): MensajeDelMovil | undefined;
export declare function validarDelAnfitrion(m: unknown): MensajeDelAnfitrion | undefined;
