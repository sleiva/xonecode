/**
 * La GEOMETRÍA de una maqueta, contada para un agente: sus bloques anchos y sus filas de controles, con cada caja en
 * píxeles del PNG y en % de la pantalla. Sale de las cajas de su `code.html` (`agent/dispositivos/cajasDeMaqueta.ts`),
 * no de mirar la imagen.
 *
 * Medido en la prueba de la calculadora (30-10-2026): el orquestador necesitaba las bandas de la maqueta (cabecera,
 * visor, teclado, alto de una tecla y su hueco) y se las encargó al device-controller «recortando con PIL»: 19 llamadas
 * con scripts de píxeles sobre `screen.png`, y medidas aproximadas. Las cajas exactas ya las medía el crítico; faltaba
 * dárselas a quien las pide. Puro.
 */
import type { Caja, MaquetaMedida } from "./geometriaDePantalla.js";

const r1 = (n: number): string => (Math.round(n * 10) / 10).toLocaleString("es-ES");
const pct = (n: number, de: number): string => `${r1((100 * n) / de)} %`;

/** Las filas: elementos cuyas cajas se solapan en vertical van juntos, de arriba abajo y de izquierda a derecha. */
function filasDe(elementos: MaquetaMedida["elementos"]): MaquetaMedida["elementos"][] {
  const orden = [...elementos].sort((a, b) => a.caja.y - b.caja.y || a.caja.x - b.caja.x);
  const filas: { abajo: number; centro: number; els: MaquetaMedida["elementos"] }[] = [];
  for (const e of orden) {
    const centro = e.caja.y + e.caja.alto / 2;
    const fila = filas.find((f) => centro >= f.centro - 6 && centro <= f.centro + 6) ?? filas.find((f) => e.caja.y < f.abajo - 4 && centro < f.abajo);
    if (fila === undefined) filas.push({ abajo: e.caja.y + e.caja.alto, centro, els: [e] });
    else {
      fila.els.push(e);
      fila.abajo = Math.max(fila.abajo, e.caja.y + e.caja.alto);
    }
  }
  return filas.map((f) => f.els.sort((a, b) => a.caja.x - b.caja.x));
}

export function informeDeMaqueta(ruta: string, m: MaquetaMedida, png: { ancho: number; alto: number }): string[] {
  // La medida va en px CSS del viewport; se cuenta en px del PNG, que es lo que se ve al abrir la imagen.
  const k = png.ancho / m.ancho;
  const px = (n: number): string => String(Math.round(n * k));
  const caja = (c: Caja): string =>
    `x ${px(c.x)}–${px(c.x + c.ancho)}, y ${px(c.y)}–${px(c.y + c.alto)} (${px(c.ancho)}×${px(c.alto)} px; ${pct(c.ancho, m.ancho)} del ancho, ${pct(c.alto, m.alto)} del alto)`;
  const lineas = [
    `Maqueta ${ruta}, MEDIDA en su code.html (no a ojo): ${String(png.ancho)}×${String(png.alto)} px. Coordenadas en px del PNG y en % de la pantalla; para el aparato usa los %, o convertir_a_p.`,
  ];
  const bloques = [...(m.bloques ?? [])].sort((a, b) => a.y - b.y);
  if (bloques.length > 0) {
    lineas.push("BLOQUES anchos (fondos de cabecera, visor, paneles):");
    for (const b of bloques) lineas.push(`- ${caja(b)}`);
  }
  const filas = filasDe(m.elementos);
  lineas.push(`FILAS de controles, de arriba abajo (${String(filas.length)}):`);
  filas.forEach((fila, i) => {
    const arriba = Math.min(...fila.map((e) => e.caja.y));
    const abajo = Math.max(...fila.map((e) => e.caja.y + e.caja.alto));
    const huecos = fila.slice(1).map((e, j) => e.caja.x - (fila[j]!.caja.x + fila[j]!.caja.ancho)).filter((h) => h > 0);
    const hueco = huecos.length === 0 ? "" : `; hueco entre ellos ${px(Math.min(...huecos))}–${px(Math.max(...huecos))} px`;
    lineas.push(`${String(i + 1)}. y ${px(arriba)}–${px(abajo)} px (${pct(abajo - arriba, m.alto)} del alto), ${String(fila.length)} elemento(s)${hueco}:`);
    for (const e of fila) {
      const letra = e.cajaDelTexto === undefined ? "" : `; su texto mide ${px(e.cajaDelTexto.alto)} px de alto`;
      lineas.push(`   - «${e.texto}»${e.boton === true ? " (botón)" : ""}: ${caja(e.caja)}${letra}`);
    }
  });
  lineas.push("Un texto como «drag_handle» o «history» en un botón es el NOMBRE de un icono (Material Symbols), no texto que se pinte.");
  return lineas;
}
