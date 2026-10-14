import type { Acto } from "./tipos.js";

/**
 * Cuántos PASOS dio el agente en estos actos. UNA regla para todos los sitios que lo dicen —la
 * cabecera del bloque del agente, la línea del tramo de trabajo, el inspector «Turno» y la barra
 * de estado—: antes cada uno contaba a su manera, y en el mismo turno la cabecera decía «7 pasos» y
 * la barra «4» (medido en pantalla).
 *
 * **Un paso es una LLAMADA a una herramienta.** Una racha colapsada («Leyó 6 veces») son seis, si
 * el dato trae las `veces`; una sesión de antes de que viajaran cuenta su línea como una, que es lo
 * que se sabe. Lo que no es una llamada no es un paso: el razonamiento es lo que el modelo pensó
 * (y se pinta plegado aparte), una fase es tiempo del motor, un veredicto es del verificador y un
 * artefacto es lo que un paso PRODUJO.
 *
 * Una línea de herramientas sin tool (de plan o de tarea) sí cuenta una: se pinta en el raíl como
 * cualquier otra, y un raíl con tres filas que dijera «2 pasos» sería la cifra que no cuadra.
 */
export function pasosDe(actos: readonly Acto[]): number {
  let n = 0;
  for (const a of actos) {
    if (a.tipo !== "herramientas") continue;
    a.lineas.forEach((_, i) => {
      const veces = a.detalles?.[i]?.veces;
      n += veces !== undefined && veces > 1 ? veces : 1;
    });
  }
  return n;
}
