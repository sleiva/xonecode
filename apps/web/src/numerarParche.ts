/**
 * El parche unificado de git, línea a línea y con sus DOS números: el del fichero viejo y
 * el del nuevo. Es lo que hace que un diff se pueda leer como un fichero y no como una
 * lista de cambios sueltos.
 *
 * Reglas, todas del formato unificado:
 * - Cada `@@ -a,b +c,d @@` fija viejo = a, nuevo = c. Sin la coma (`-a +c`) vale igual.
 * - Contexto (empieza por espacio) avanza los dos; `+` solo el nuevo; `-` solo el viejo.
 * - `\ No newline at end of file` es una nota: no es línea de nadie y no avanza nada.
 * - La cabecera de git (`diff --git`, `index`, `---`, `+++`) se corta: cuatro líneas de
 *   ruido por fichero que no dicen nada que no diga el nombre de la fila. Se corta en el
 *   primer `@@`, y si no hay ninguno —un binario, un cambio de modo— no se corta nada y
 *   nadie lleva número: eso ES todo lo que git tiene que decir.
 */
export type TipoDeLinea = "tramo" | "contexto" | "mas" | "menos" | "nota";

export interface LineaNumerada {
  tipo: TipoDeLinea;
  viejo?: number;
  nuevo?: number;
  /** El texto SIN el carácter de prefijo del formato (` `, `+`, `-`, `\ `). */
  texto: string;
}

const CABECERA_DE_TRAMO = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

export function numerarParche(texto: string): LineaNumerada[] {
  const lineas = texto.split("\n");
  // El salto final del parche no es una línea vacía de contexto.
  if (lineas.at(-1) === "") lineas.pop();

  const primerTramo = lineas.findIndex((l) => CABECERA_DE_TRAMO.test(l));
  if (primerTramo === -1) return lineas.map((l) => ({ tipo: "contexto", texto: l }));

  let viejo = 0;
  let nuevo = 0;
  const salida: LineaNumerada[] = [];
  for (const linea of lineas.slice(primerTramo)) {
    const tramo = CABECERA_DE_TRAMO.exec(linea);
    if (tramo !== null) {
      viejo = Number(tramo[1]);
      nuevo = Number(tramo[2]);
      salida.push({ tipo: "tramo", texto: linea });
    } else if (linea.startsWith("\\")) {
      salida.push({ tipo: "nota", texto: linea.slice(2) });
    } else if (linea.startsWith("+")) {
      salida.push({ tipo: "mas", nuevo: nuevo++, texto: linea.slice(1) });
    } else if (linea.startsWith("-")) {
      salida.push({ tipo: "menos", viejo: viejo++, texto: linea.slice(1) });
    } else {
      salida.push({ tipo: "contexto", viejo: viejo++, nuevo: nuevo++, texto: linea.slice(1) });
    }
  }
  return salida;
}
