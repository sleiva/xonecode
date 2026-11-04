/**
 * **Dos `<prop>` con el mismo `name` en una colección**: XOne no avisa y una pisa a la otra, un bug mudo. Puro.
 *
 * Lo comprobó a mano el desarrollador de Codex sobre la calculadora (`rg -o 'name="…"' | sort | uniq -d`) antes de
 * probar; aquí va detrás de cada escritura, con la validación (`validarFicheroXone.ts#validacionDeTexto`). Medido en
 * MyAllXOne: ningún `.xne` real repite una prop salvo dentro de un comentario, así que los comentarios no cuentan.
 */
export interface PropRepetida {
  nombre: string;
  linea: number;
  primera: number;
}

const lineaDe = (texto: string, i: number): number => texto.slice(0, i).split("\n").length;

export function propRepetida(texto: string): PropRepetida | undefined {
  // Los comentarios se quedan con su largo (espacios y saltos), para que las líneas sigan cuadrando.
  const limpio = texto.replace(/<!--[\s\S]*?-->/g, (c) => c.replace(/[^\n]/g, " "));
  // Cada colección es su propio espacio de nombres.
  const colecciones = [...limpio.matchAll(/<coll\b[\s\S]*?(?=<coll\b|$)/g)];
  for (const c of colecciones.length > 0 ? colecciones : [Object.assign([limpio], { index: 0 })]) {
    const vistos = new Map<string, number>();
    for (const m of c[0].matchAll(/<prop\b[^>]*?\sname="([^"]+)"/g)) {
      const i = (c.index ?? 0) + (m.index ?? 0);
      const antes = vistos.get(m[1]!);
      if (antes !== undefined) return { nombre: m[1]!, linea: lineaDe(texto, i), primera: lineaDe(texto, antes) };
      vistos.set(m[1]!, i);
    }
  }
  return undefined;
}
