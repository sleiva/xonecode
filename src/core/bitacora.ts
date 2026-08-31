/**
 * La bitácora de UN turno. Se construye al empezarlo y muere con él.
 *
 * El alcance es la mitad del valor: una bitácora de proceso haría que los avisos de
 * honestidad («el verificador es de pega») salieran en todos los turnos posteriores al
 * primero, incluido un «cuéntame un chiste» que no verificó nada. Un aviso que salta
 * cuando no ha pasado nada enseña al usuario a ignorarlo, que es lo contrario de lo que
 * se compra con él.
 *
 * Por eso `corrio()` pregunta por lo que ha pasado AHORA, y nunca se le pregunta al objeto
 * de dependencias, que vive en el proceso entero.
 */
export class Bitacora {
  private readonly lineas: string[] = [];

  /** `nodo` es la clave que luego consulta `corrio()`; `detalle` es para el humano. */
  anota(nodo: string, detalle = ""): void {
    this.lineas.push(detalle ? `${nodo}: ${detalle}` : `${nodo}:`);
  }

  /** ¿Ha corrido este nodo en ESTE turno? */
  corrio(nodo: string): boolean {
    return this.lineas.some((l) => l.startsWith(`${nodo}:`));
  }

  get todo(): readonly string[] {
    return this.lineas;
  }

  get vacia(): boolean {
    return this.lineas.length === 0;
  }
}