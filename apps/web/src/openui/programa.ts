/**
 * El PROGRAMA de un fichero `.openui`: su contenido sin la valla ` ```openui `.
 *
 * El prompt de OpenUI de TrueForge le pide al modelo que lo valle, y nuestra nota le pide que lo
 * escriba en un fichero; un modelo puede hacer las dos cosas, o solo una. Aceptar las dos formas
 * aquí es más barato que discutirlo en el prompt. Si hay VARIOS bloques se toma el primero: un
 * artefacto es un documento, no una conversación.
 */
export function programaDeOpenui(texto: string): string {
  const valla = /```openui[^\n]*\n([\s\S]*?)```/.exec(texto);
  return (valla === null ? texto : valla[1]!).trim();
}
