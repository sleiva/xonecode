/**
 * La política de ruido: una línea por RACHA de la misma tool, no por llamada.
 *
 * Es del TURNO: se construye al empezar el turno y muere con él. Un colapsador de proceso
 * contaría las llamadas de todos los turnos juntos.
 *
 * Devuelve una LISTA de líneas, nunca una cadena con dos pegadas: cuando una racha se
 * cierra Y otra tool arranca en el mismo evento —el caso normal de "tres read_file y luego
 * un glob"— hay DOS cosas que decir, y quien pinta escribe tantas líneas como haya.
 */

export interface EventoTool {
  nombre: string;
  /** Vacío si fue bien. Un error nunca se colapsa. */
  error?: string;
}

export class Colapsador {
  private nombre = "";
  private cuenta = 0;

  /** Las líneas que toca escribir por este evento, EN ORDEN. 0, 1 o 2. */
  lineas(evento: EventoTool): string[] {
    const salida: string[] = [];

    if (evento.error) {
      // Cierra la racha en curso y canta el error aparte, sin colapsar.
      const pendiente = this.cerrarRacha();
      if (pendiente) salida.push(pendiente);
      salida.push(`✗ ${evento.nombre}: ${evento.error}`);
      return salida;
    }

    if (evento.nombre === this.nombre) {
      this.cuenta++;
      return salida; // misma racha: calla
    }

    const pendiente = this.cerrarRacha();
    if (pendiente) salida.push(pendiente);
    this.nombre = evento.nombre;
    this.cuenta = 1;
    salida.push(`🔧 ${evento.nombre}`);
    return salida;
  }

  /** La cuenta de la última racha. Se llama al terminar el turno, incluso si reventó. */
  cierre(): string | null {
    return this.cerrarRacha();
  }

  private cerrarRacha(): string | null {
    // Una racha de 1 ya se anunció al abrirla: repetirla como "×1" es ruido.
    const linea = this.cuenta > 1 ? `🔧 ${this.nombre} ×${this.cuenta}` : null;
    this.nombre = "";
    this.cuenta = 0;
    return linea;
  }
}