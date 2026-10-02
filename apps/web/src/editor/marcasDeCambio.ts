import { Chunk } from "@codemirror/merge";
import { Text } from "@codemirror/state";
import { normalizarFinesDeLinea } from "../edicion.js";

/**
 * De «lo que había» (la base) y «lo que hay» (el editor) a las marcas del margen: cambiada,
 * nueva y borrado.
 *
 * Los trozos los calcula el motor de diff OFICIAL de CodeMirror (`Chunk.build` de
 * `@codemirror/merge`); lo que es nuestro —y tiene test— es la traducción a marcas y el cambio
 * que deshace un trozo. Vive en `editor/` porque importa CodeMirror, y a `editor/` solo se llega
 * con `import()` (`editor/frontera.test.ts`).
 */

/** Un trozo en LÍNEAS (1-based). Con `lineasB` vacío es un borrado delante de la línea `desdeB`. */
export interface TrozoDeLineas {
  desdeA: number;
  lineasA: readonly string[];
  desdeB: number;
  lineasB: readonly string[];
}

export type ClaseDeMarca = "cambiada" | "nueva";
export interface MarcaDeLinea {
  clase: ClaseDeMarca;
  trozo: number;
}
/** Un borrado va ENTRE líneas: detrás de `trasLinea`, y `0` es antes de la primera. */
export interface MarcaDeBorrado {
  trasLinea: number;
  trozo: number;
}
export interface MarcasDeCambio {
  trozos: readonly TrozoDeLineas[];
  lineas: ReadonlyMap<number, MarcaDeLinea>;
  borrados: readonly MarcaDeBorrado[];
  cuentas: { cambiadas: number; nuevas: number; borradas: number };
}

export const SIN_MARCAS: MarcasDeCambio = { trozos: [], lineas: new Map(), borrados: [], cuentas: { cambiadas: 0, nuevas: 0, borradas: 0 } };

/** Las líneas que cubre `[desde, hasta)`. `hasta` puede pasar en uno del final (ver `Chunk.toA`). */
function lineasEntre(texto: Text, desde: number, hasta: number): string[] {
  if (hasta <= desde) return [];
  const primera = texto.lineAt(desde).number;
  const ultima = texto.lineAt(Math.min(hasta - 1, texto.length)).number;
  const salida: string[] = [];
  for (let n = primera; n <= ultima; n++) salida.push(texto.line(n).text);
  return salida;
}

/**
 * Los trozos de CodeMirror pasados a líneas. Los dos textos se normalizan a «\n» antes: con un
 * fichero en CRLF —o una copia con `autocrlf`— cada línea saldría cambiada.
 */
export function trozosDeLineas(base: string, actual: string): TrozoDeLineas[] {
  const a = Text.of(normalizarFinesDeLinea(base).split("\n"));
  const b = Text.of(normalizarFinesDeLinea(actual).split("\n"));
  return Chunk.build(a, b).map((c) => ({
    desdeA: a.lineAt(Math.min(c.fromA, a.length)).number,
    lineasA: lineasEntre(a, c.fromA, c.toA),
    desdeB: b.lineAt(Math.min(c.fromB, b.length)).number,
    lineasB: lineasEntre(b, c.fromB, c.toB),
  }));
}

/**
 * Un fichero que en la base no existía (`vacio`): todo él es nuevo. Explícito y no un diff contra
 * «»: CodeMirror ve en un texto vacío una línea vacía, y saldría una «cambiada» que no lo es.
 */
export function todoNuevo(actual: string): TrozoDeLineas[] {
  return [{ desdeA: 1, lineasA: [], desdeB: 1, lineasB: normalizarFinesDeLinea(actual).split("\n") }];
}

/**
 * Quita las líneas IGUALES de los dos bordes de un trozo. El diff es de caracteres extendido a
 * líneas, así que borrar la última línea llega como «b\nc» contra «b»: sin recortar, «b» saldría
 * cambiada sin que nada visible haya cambiado. `undefined` si no queda nada.
 */
export function recortarTrozo(t: TrozoDeLineas): TrozoDeLineas | undefined {
  let desdeA = t.desdeA;
  let desdeB = t.desdeB;
  const a = [...t.lineasA];
  const b = [...t.lineasB];
  while (a.length > 0 && b.length > 0 && a[0] === b[0]) {
    a.shift();
    b.shift();
    desdeA += 1;
    desdeB += 1;
  }
  while (a.length > 0 && b.length > 0 && a[a.length - 1] === b[b.length - 1]) {
    a.pop();
    b.pop();
  }
  if (a.length === 0 && b.length === 0) return undefined;
  return { desdeA, lineasA: a, desdeB, lineasB: b };
}

/**
 * Las marcas de unos trozos. En un trozo con líneas a los dos lados, las primeras se emparejan
 * (cambiadas), las que sobran del actual son nuevas y las que faltan, un borrado debajo: así las
 * cuentas cuadran con la diferencia de líneas entre los dos textos.
 */
export function marcasDeCambio(brutos: readonly TrozoDeLineas[]): MarcasDeCambio {
  const trozos = brutos.map(recortarTrozo).filter((t): t is TrozoDeLineas => t !== undefined);
  const lineas = new Map<number, MarcaDeLinea>();
  const borrados: MarcaDeBorrado[] = [];
  const cuentas = { cambiadas: 0, nuevas: 0, borradas: 0 };
  trozos.forEach((t, trozo) => {
    const comunes = Math.min(t.lineasA.length, t.lineasB.length);
    for (let k = 0; k < t.lineasB.length; k++) {
      lineas.set(t.desdeB + k, { clase: k < comunes ? "cambiada" : "nueva", trozo });
    }
    cuentas.cambiadas += comunes;
    cuentas.nuevas += t.lineasB.length - comunes;
    if (t.lineasA.length > t.lineasB.length) {
      borrados.push({ trasLinea: t.desdeB + t.lineasB.length - 1, trozo });
      cuentas.borradas += t.lineasA.length - comunes;
    }
  });
  return { trozos, lineas, borrados, cuentas };
}

/** El trozo al que pertenece una línea pulsada en el margen: el suyo, o el borrado que lleva encima. */
export function trozoDeLaLinea(m: MarcasDeCambio, linea: number): number | undefined {
  const propia = m.lineas.get(linea);
  if (propia !== undefined) return propia.trozo;
  return m.borrados.find((b) => Math.max(b.trasLinea, 1) === linea)?.trozo;
}

/**
 * El cambio que devuelve SOLO ese trozo al texto de la base, en posiciones del documento unido con
 * «\n» (`actual` son sus líneas, `Text.toJSON()`). Es una edición más: se deshace con Cmd/Ctrl+Z y
 * hay que guardar.
 */
export function cambioDeDeshacer(actual: readonly string[], t: TrozoDeLineas): { desde: number; hasta: number; insertar: string } {
  let inicio = 0;
  for (let i = 0; i < t.desdeB - 1 && i < actual.length; i++) inicio += actual[i]!.length + 1;
  const total = actual.reduce((n, l) => n + l.length, 0) + Math.max(actual.length - 1, 0);
  const antes = t.lineasA.join("\n");
  if (t.lineasB.length > 0) {
    const fin = inicio + t.lineasB.join("\n").length;
    if (t.lineasA.length > 0) return { desde: inicio, hasta: fin, insertar: antes };
    // Líneas nuevas: se van con UN salto, el de detrás si lo hay y si no el de delante.
    if (fin < total) return { desde: inicio, hasta: fin + 1, insertar: "" };
    return { desde: Math.max(inicio - 1, 0), hasta: fin, insertar: "" };
  }
  if (t.desdeB <= actual.length) return { desde: inicio, hasta: inicio, insertar: `${antes}\n` };
  return { desde: total, hasta: total, insertar: `\n${antes}` };
}
