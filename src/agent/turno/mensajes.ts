/**
 * Decide si un trozo de `messages` se pinta, y si abre una línea nueva.
 *
 * Dos cosas distintas que el modo `messages` mezcla:
 *  - los TROZOS del LLM, que comparten el `id` del run;
 *  - los mensajes ENTEROS que un nodo añade al estado, con id propio.
 *
 * Un id ya visto y completo es una reemisión: se descarta. Un id distinto del que está
 * abierto es un mensaje nuevo, y quien pinta tiene que cerrar la línea anterior.
 */
export interface Decision {
  pintar: boolean;
  /** Cierra la línea abierta antes de pintar: es otro mensaje, no un trozo más. */
  cierraLinea: boolean;
}

export class Mensajes {
  private abierto: string | undefined;
  private readonly cerrados = new Set<string>();

  /** `texto` vacío o `undefined` no pinta: Gemini manda trozos finales sin texto. */
  trozo(id: string | undefined, texto: string | undefined): Decision {
    if (!texto) return { pintar: false, cierraLinea: false };
    if (id !== undefined && this.cerrados.has(id)) {
      return { pintar: false, cierraLinea: false }; // reemisión del mensaje entero
    }
    const cierraLinea = this.abierto !== undefined && id !== this.abierto;
    if (cierraLinea) this.cerrados.add(this.abierto!);
    this.abierto = id;
    return { pintar: true, cierraLinea };
  }

  /** Fin del turno: lo abierto se da por cerrado. */
  fin(): void {
    if (this.abierto !== undefined) this.cerrados.add(this.abierto);
    this.abierto = undefined;
  }
}