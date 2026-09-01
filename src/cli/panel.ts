/**
 * El panel de avisos: el recinto de hasta `tope` líneas grises donde viven las
 * notificaciones de sistema (pausas, avisos deterministas, el tiempo final) MIENTRAS
 * dura, en vez de ir dejando un rastro en el scrollback.
 *
 * La regla que hereda del append-only de la consola, y su excepción a la vez: el panel
 * vive POR ENCIMA del punto de escritura y se repinta en sitio — la única cosa de la
 * piel que escribe por encima de la última línea, acotada a `tope` líneas. Cualquier
 * contenido real la solidifica antes de escribir (la cascada de `stdio.ts`), y del
 * panel solo queda entonces la última línea, como línea gris de siempre.
 *
 * La mecánica es de borrado EXACTO, nunca «borrar hasta el fin de pantalla»: tanto el
 * repintado como el colapso limpian una a una las líneas que sobran, porque debajo del
 * panel puede haber una línea viva (el spinner de fase) que no es suya y no puede
 * comerse. Por lo mismo, cada línea pintada termina en `\n`: el cursor descansa en el
 * punto de escritura, que siempre está DEBAJO del panel.
 */

import type { Escribir } from "./stdio.js";
import type { Tema } from "./tema.js";

/** Cuántas líneas grises vive el panel como máximo antes de reciclar al más viejo. */
export const TOPE_DEL_PANEL = 5;

export class PanelDeAvisos {
  private readonly lineas: string[] = [];
  private pintadas = 0;

  constructor(
    private readonly escribir: Escribir,
    private readonly tema: Tema,
    private readonly tope: number = TOPE_DEL_PANEL
  ) {}

  /** Añade un aviso (reciclando al más viejo si se pasa del tope) y repinta el panel. */
  avisa(texto: string): void {
    this.lineas.push(texto);
    while (this.lineas.length > this.tope) this.lineas.shift();
    const subida = this.pintadas > 0 ? `${this.tema.arriba(this.pintadas)}\r` : "";
    this.pintadas = this.lineas.length;
    this.escribir(subida + this.lineas.map((l) => this.pintar(l)).join(""));
  }

  /**
   * Colapsa el panel: deja SOLO la última línea en el historial — colocada donde
   * empezaba el panel— y limpia las demás. Con el panel vacío no escribe nada.
   */
  solidifica(): void {
    if (this.pintadas === 0) return;
    const ultima = this.lineas[this.lineas.length - 1];
    const total = this.pintadas;
    this.pintadas = 0;
    this.lineas.length = 0;
    // Cada línea que sobra se limpia y se salta: el cursor acaba en el punto de
    // escritura, debajo de donde estaba el panel.
    const sobran = `${this.tema.limpiarLinea}\n`.repeat(total - 1);
    this.escribir(`${this.tema.arriba(total)}\r` + this.pintar(ultima) + sobran);
  }

  /** Una línea del panel: limpia, texto en mudo, y el salto que baja al punto de escritura. */
  private pintar(texto: string): string {
    return `${this.tema.limpiarLinea}${this.tema.mudo}${texto}${this.tema.reset}\n`;
  }
}