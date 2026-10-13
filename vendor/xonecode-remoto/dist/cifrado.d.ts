export type Rol = "anfitrion" | "movil";
export interface OpcionesDeCanal {
    secreto: string;
    sala: string;
    rol: Rol;
    /** Id del emisor, fijo por instancia: las secuencias se comprueban POR ORIGEN. Por omisión, aleatorio. */
    origen?: string;
    /** Solo para los vectores de prueba. */
    nonce?: () => Uint8Array<ArrayBuffer>;
}
export interface Canal {
    cifrar(mensaje: unknown): Promise<string>;
    /** `undefined` si no se puede descifrar, no es de esta sala/dirección o no sube la secuencia de su origen. */
    descifrar(carga: string): Promise<unknown | undefined>;
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
export declare function crearCanal(opciones: OpcionesDeCanal): Promise<Canal>;
