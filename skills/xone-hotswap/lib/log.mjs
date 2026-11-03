/**
 * El log de la app, COMPACTO: lo que importa entra entero y el ruido repetido una vez, para que cada `xone-log-android
 * --app` no meta miles de caracteres en el contexto de quien lo pide.
 *
 * Medido en las pasadas de la calculadora (03-11-2026): esa orden sola eran 12–17 mil caracteres por llamada, 4–5 veces por
 * pasada, casi todo lo que el aparato metía en el contexto; y entre sus líneas, la misma advertencia del sistema
 * (`W System.err: … Exception`) repetida una y otra vez. Mandarlo a un fichero no servía: el log es justo lo que hay que
 * leer, y abrirlo era otra llamada.
 *
 * - Un AVISO del sistema (nivel W que no es de la app) se agrupa aunque no vaya seguido: es ruido que se repite.
 * - Lo que escribe la APP y los errores (E/F) solo se agrupan si van SEGUIDOS: el orden de «tecla 7, tecla 8, tecla 7» es
 *   información.
 * - Como mucho las últimas `TOPE_DE_LINEAS_DEL_LOG`, diciendo cuántas se omitieron y cómo pedir más.
 */

export const TOPE_DE_LINEAS_DEL_LOG = 80;

/** La línea sin su hora, pid y tid: `11-03 12:10:16.614 30789 31095 W Tag: x` → `W Tag: x`. */
export function sinCabecera(linea) {
  return linea.replace(/^\d\d-\d\d \d\d:\d\d:\d\d\.\d+\s+\d+\s+\d+\s+/, "").replace(/^([VDIWEF])\/([^(]+)\(\s*\d+\):/, "$1/$2:");
}

const esDeLaApp = (l) => /\bXOneJavaScript\s*(\(\s*\d+\))?\s*:/.test(l);
const esAviso = (l) => !esDeLaApp(l) && /^W[\s/]/.test(sinCabecera(l));

export function compactarLog(lineas, tope = TOPE_DE_LINEAS_DEL_LOG) {
  const salida = [];
  const avisos = new Map();
  for (const l of lineas) {
    const clave = sinCabecera(l);
    if (esAviso(l)) {
      const ya = avisos.get(clave);
      if (ya !== undefined) {
        ya.veces += 1;
        continue;
      }
      const fila = { texto: l, veces: 1 };
      avisos.set(clave, fila);
      salida.push(fila);
      continue;
    }
    const ultima = salida[salida.length - 1];
    if (ultima !== undefined && sinCabecera(ultima.texto) === clave) ultima.veces += 1;
    else salida.push({ texto: l, veces: 1 });
  }
  const filas = salida.map((f) => (f.veces > 1 ? `${f.texto}  (×${f.veces})` : f.texto));
  if (filas.length <= tope) return filas;
  const omitidas = filas.length - tope;
  return [`(${omitidas} línea(s) anteriores omitidas; con --lineas N se mira más atrás en el log)`, ...filas.slice(-tope)];
}
