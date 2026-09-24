import type { HallazgoDelTurno, VeredictoDelTurno } from "./tipos.js";

/** `fichero:línea`, o nada si el hallazgo no dice dónde. */
export function dondeDe(h: HallazgoDelTurno): string | undefined {
  if (h.fichero === undefined) return undefined;
  return h.linea === undefined ? h.fichero : `${h.fichero}:${h.linea}`;
}

/** La marca por severidad, no por color: también se lee en las Trazas y sin tema. */
export function marcaDe(h: HallazgoDelTurno): string {
  return h.severidad === "error" ? "✗" : h.severidad === "warning" ? "△" : "·";
}

/**
 * Un veredicto en líneas de texto, las MISMAS que escribe el terminal (`core/turno.ts`): el
 * tramo de trabajo, las Trazas y la vista de una tarea lo cuentan así. La tarjeta del rojo
 * final es la otra forma, y lee los mismos campos.
 */
export function lineasDeVerificacion(v: VeredictoDelTurno): string[] {
  const lineas = [
    v.verde ? "✓  verificación en verde" : `✗  verificación: ${v.errores} error(es), ${v.avisos} aviso(s)`,
  ];
  for (const h of v.hallazgos ?? []) {
    const donde = dondeDe(h);
    lineas.push(`   ${marcaDe(h)} ${h.code}${donde === undefined ? "" : ` ${donde}`} — ${h.mensaje}`);
  }
  if (v.preexistentes !== undefined && v.preexistentes > 0) {
    lineas.push(`   (y ${v.preexistentes} hallazgo(s) más en ficheros que este turno no tocó)`);
  }
  return lineas;
}
