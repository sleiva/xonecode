/**
 * Tests del panel de avisos: el recinto de hasta 5 líneas grises que se RECICLA en
 * sitio en vez de acumularse en el scrollback.
 *
 * La mecánica que este fichero clava en bytes:
 *
 * - Pintar una línea es `limpiarLinea` + texto en mudo + `\n`. El `\n` final deja el
 *   cursor en el punto de escritura, DEBAJO del panel — por eso el panel puede convivir
 *   con el spinner (que vive en esa línea) sin borrarlo nunca.
 * - Repintar es subir N líneas (donde N es lo que había pintado ANTES) y reescribir.
 *   Si el panel encoge (no pasa por `avisa`, solo al solidificar), se limpian las
 *   líneas que sobran UNA A UNA y no con «borrar hasta fin de pantalla»: el borrado
 *   exacto no puede comerse la línea del spinner que vive debajo.
 * - `solidifica` deja SOLO la última línea en el historial, colocada donde empezaba el
 *   panel, y deja el panel vacío: el siguiente aviso arranca de cero.
 */

import { describe, it, expect } from "vitest";
import { crearTema, type Tema } from "./tema.js";
import { PanelDeAvisos } from "./panel.js";
import type { Escribir } from "./stdio.js";

const CON: Tema = crearTema(true);

/** Una línea pintada del panel: limpia, texto en mudo, y el salto que baja al punto de escritura. */
const linea = (texto: string): string =>
  `${CON.limpiarLinea}${CON.mudo}${texto}${CON.reset}\n`;

function acumulador(): { textos: string[]; escribir: Escribir } {
  const textos: string[] = [];
  return { textos, escribir: (t) => textos.push(t) };
}

describe("PanelDeAvisos", () => {
  it("el primer aviso se pinta sin subir el cursor: una línea gris y el cursor debajo", () => {
    const { textos, escribir } = acumulador();
    const panel = new PanelDeAvisos(escribir, CON);
    panel.avisa("turno pausado: 1 aprobación(es) pendiente(s)");
    expect(textos).toEqual([linea("turno pausado: 1 aprobación(es) pendiente(s)")]);
  });

  it("un segundo aviso repinta EN SITIO: sube lo pintado antes y reescribe el panel entero", () => {
    const { textos, escribir } = acumulador();
    const panel = new PanelDeAvisos(escribir, CON);
    panel.avisa("primera");
    panel.avisa("segunda");
    expect(textos[1]).toBe(`${CON.arriba(1)}\r${linea("primera")}${linea("segunda")}`);
  });

  it("recicla: al pasar el tope, sale el más viejo — el panel nunca pasa de N líneas", () => {
    const { textos, escribir } = acumulador();
    const panel = new PanelDeAvisos(escribir, CON, 2);
    panel.avisa("a");
    panel.avisa("b");
    panel.avisa("c");
    expect(textos[2]).toBe(`${CON.arriba(2)}\r${linea("b")}${linea("c")}`);
  });

  it("solidifica deja SOLO la última línea en el historial y vacía el panel", () => {
    const { textos, escribir } = acumulador();
    const panel = new PanelDeAvisos(escribir, CON);
    panel.avisa("a");
    panel.avisa("b");
    panel.solidifica();
    expect(textos[2]).toBe(
      `${CON.arriba(2)}\r${linea("b")}${CON.limpiarLinea}\n`
    );
    // Y el panel queda vacío: el siguiente aviso arranca de cero, sin subir el cursor.
    panel.avisa("nuevo");
    expect(textos[3]).toBe(linea("nuevo"));
  });

  it("solidifica con tres líneas borra las dos que sobran, una a una", () => {
    const { textos, escribir } = acumulador();
    const panel = new PanelDeAvisos(escribir, CON);
    panel.avisa("a");
    panel.avisa("b");
    panel.avisa("c");
    panel.solidifica();
    expect(textos[3]).toBe(
      `${CON.arriba(3)}\r${linea("c")}${CON.limpiarLinea}\n${CON.limpiarLinea}\n`
    );
  });

  it("solidifica con el panel vacío no escribe nada", () => {
    const { textos, escribir } = acumulador();
    const panel = new PanelDeAvisos(escribir, CON);
    panel.solidifica();
    expect(textos).toEqual([]);
  });
});