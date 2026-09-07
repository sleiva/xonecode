/**
 * Extensión → lenguaje del resaltador. Tabla CERRADA: lo que no está se pinta plano. Un
 * `Map` y no un objeto, porque la extensión sale de un nombre de fichero y `constructor`
 * resolvería una propiedad heredada. Los `.xne` son XML: es lo que son.
 */
const LENGUAJES = new Map<string, string>([
  ["xne", "xml"],
  ["xml", "xml"],
  ["js", "javascript"],
  ["css", "css"],
  ["ini", "ini"],
  ["json", "json"],
  ["md", "markdown"],
  // La FUENTE de un SVG, que la pestaña Ficheros deja ver con el interruptor Vista/Fuente:
  // es XML, igual que un `.xne`. El dibujo lo pinta un `<img>`, no esto.
  ["svg", "xml"],
]);

export function lenguajeDe(ruta: string): string | undefined {
  const nombre = ruta.slice(ruta.lastIndexOf("/") + 1);
  const punto = nombre.lastIndexOf(".");
  if (punto <= 0) return undefined;
  return LENGUAJES.get(nombre.slice(punto + 1).toLowerCase());
}
