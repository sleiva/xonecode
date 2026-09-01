import type { Tema } from "./tema.js";
import type { Escribir } from "./stdio.js";

/**
 * El spinner de fase: `⠋ planificando (12s)` animando LA ÚLTIMA línea.
 *
 * En una consola que no repinta, solo la última línea escrita se puede volver a
 * pintar (con `\r`), y solo mientras nadie más escriba: eso es exactamente una fase
 * del agente, que llena los segundos en que no pasa nada visible. La disciplina de
 * «una sola línea al fondo» es la cascada: **cualquier otra escritura termina el
 * spinner primero**, y el historial no se toca — la fase queda como línea estática,
 * igual que ha salido siempre.
 *
 * Sin TTY (tema sin color) no hay nada que animar: la misma línea estática de
 * siempre, y ningún temporizador.
 */

const CUADROS = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const;

/** Los segundos que lleva la fase: vacío hasta que cumple el primer segundo. */
export function sufijoDeTiempo(ms: number): string {
  const s = Math.floor(ms / 1000);
  return s > 0 ? ` (${s}s)` : "";
}

export class AnimadorDeFase {
  private cuadro = 0;
  private texto = "";
  private t0 = 0;
  private temporizador: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly escribir: Escribir,
    private readonly tema: Tema,
    /** Cómo de seguido repinta el fotograma. Entra por parámetro para los tests. */
    private readonly intervalo = 120,
    /** El reloj, inyectado por la misma razón: un test mueve el tiempo, no lo espera. */
    private readonly reloj: () => number = Date.now
  ) {}

  activo(): boolean {
    return this.texto !== "";
  }

  /**
   * Empieza a animar una fase. Sin color es la línea estática de siempre y no arranca
   * nada; con color, la fase anterior (si la había) queda como línea estática.
   */
  empieza(texto: string): void {
    if (this.tema.borrar === "") {
      this.escribir(`  ·  ${texto}\n`);
      return;
    }
    this.termina();
    this.texto = texto;
    this.t0 = this.reloj();
    this.cuadro = 0;
    this.pinta();
    this.temporizador = setInterval(() => this.pinta(), this.intervalo);
    // Un spinner olvidado no puede colgar el proceso: el temporizador no mantiene el
    // bucle de eventos vivo por sí solo.
    this.temporizador.unref();
  }

  /**
   * Repinta el fotograma. Público a propósito: el `setInterval` llama aquí, y los
   * tests también — sin esperar 120 ms de verdad.
   */
  pinta(): void {
    if (!this.activo()) return;
    // Se pinta el cuadro y DESPUÉS se avanza: el primer fotograma es el ⠋, no el
    // segundo — la fase que empieza no debería llegar ya movida.
    this.escribir(
      `\r  ${this.tema.mudo}${CUADROS[this.cuadro]} ${this.texto}` +
        `${sufijoDeTiempo(this.reloj() - this.t0)}${this.tema.reset}`
    );
    this.cuadro = (this.cuadro + 1) % CUADROS.length;
  }

  /**
   * Deja la fase como línea estática en el historial y para el reloj. Sin fase activa
   * no escribe nada: la cascada lo llama antes de CUALQUIER otra escritura.
   */
  termina(): void {
    if (!this.activo()) return;
    if (this.temporizador !== undefined) clearInterval(this.temporizador);
    // El borrado limpia lo que el fotograma animado dejara escrito más allá de la
    // línea estática: «(12s)» es más largo que el punto de la línea definitiva.
    this.escribir(`\r${this.tema.borrar}  ·  ${this.texto}\n`);
    this.texto = "";
  }
}