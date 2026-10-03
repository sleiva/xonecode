import { finDeLineaDe, type FinDeLinea } from "./edicion.js";
import type { FicheroDelProyecto } from "./tipos.js";

/**
 * Qué CLASE de fichero es una ruta, para su icono (`componentes/IconoDeFichero.tsx`) y para la
 * línea de la cabecera de Ficheros. Se decide por la EXTENSIÓN y nada más: el árbol se pinta antes
 * de leer ningún contenido, y un icono que cambiara al llegar el fichero sería un parpadeo.
 *
 * `xml` va aparte de `xne` a propósito: el `.xne` es la fuente de una colección y el `.xml` lo
 * genera XOne Studio y no se toca (CLAUDE.md, «XOne no es desarrollo web»), así que su icono va
 * en gris. El SVG es `imagen` aunque sea texto: se abre como dibujo (`Ficheros.tsx`).
 */
export type TipoDeFichero = "xne" | "js" | "css" | "xml" | "config" | "imagen" | "bd" | "markdown" | "fuente" | "otro";

/** Tabla CERRADA, en un `Map` por lo mismo que `lenguajeDe.ts`: `constructor` no es una extensión. */
const TIPOS = new Map<string, TipoDeFichero>([
  ["xne", "xne"],
  ["js", "js"],
  ["css", "css"],
  ["xml", "xml"],
  ["ini", "config"],
  ["json", "config"],
  ["png", "imagen"],
  ["jpg", "imagen"],
  ["jpeg", "imagen"],
  ["gif", "imagen"],
  ["webp", "imagen"],
  ["svg", "imagen"],
  ["db", "bd"],
  ["sqlite", "bd"],
  ["md", "markdown"],
  ["ttf", "fuente"],
  ["otf", "fuente"],
  ["woff", "fuente"],
  ["woff2", "fuente"],
]);

/** La extensión en minúsculas, o `undefined` si no hay (`Makefile`) o el nombre es oculto (`.gitignore`). */
function extension(ruta: string): string | undefined {
  const nombre = ruta.slice(ruta.lastIndexOf("/") + 1);
  const punto = nombre.lastIndexOf(".");
  return punto <= 0 ? undefined : nombre.slice(punto + 1).toLowerCase();
}

export function tipoDeFichero(ruta: string): TipoDeFichero {
  const ext = extension(ruta);
  return (ext === undefined ? undefined : TIPOS.get(ext)) ?? "otro";
}

/** El nombre legible del lenguaje. Lo que no está es «Texto»: si llegó como texto, eso sí se sabe. */
const LENGUAJES_LEGIBLES = new Map<string, string>([
  ["xne", "XML de XOne"],
  ["xml", "XML"],
  ["svg", "XML"],
  ["js", "JavaScript"],
  ["css", "CSS"],
  ["md", "Markdown"],
  ["json", "JSON"],
  ["ini", "INI"],
  ["html", "HTML"],
]);

/** Las líneas de un texto: la última sin salto cuenta, y un salto final no abre otra. */
function lineas(texto: string): number {
  if (texto === "") return 0;
  const saltos = (texto.match(/\n/g) ?? []).length;
  return texto.endsWith("\n") ? saltos : saltos + 1;
}

/**
 * La línea de debajo de la ruta en la cabecera de Ficheros —«XML de XOne · 214 líneas · UTF-8 · LF»—,
 * con SOLO lo que se sabe del contenido que llegó. Nada se rellena por omisión:
 *   - sin texto (una imagen, un binario) no hay líneas ni finales que contar, solo QUÉ es;
 *   - recortado, la cuenta sería la del trozo, así que no se da;
 *   - sin un solo salto de línea no se afirma LF (`finDeLineaDe("abc")` diría «\n» sin motivo);
 *   - sin `codificacion` del servidor no se supone ninguna.
 * `finDeLinea`, editando: el del fichero, que el editor guarda aparte porque su texto ya va en «\n».
 */
export function metadatosDelFichero(ruta: string, contenido: FicheroDelProyecto | undefined, finDeLinea?: FinDeLinea): string[] {
  if (contenido === undefined || contenido.error !== undefined) return [];
  if (contenido.texto === undefined) return [tipoDeFichero(ruta) === "imagen" || contenido.mime !== undefined ? "Imagen" : "Binario"];
  const ext = extension(ruta);
  const partes = [(ext === undefined ? undefined : LENGUAJES_LEGIBLES.get(ext)) ?? "Texto"];
  if (!contenido.recortado) {
    const n = lineas(contenido.texto);
    partes.push(`${n} ${n === 1 ? "línea" : "líneas"}`);
  }
  if (contenido.codificacion !== undefined) partes.push(contenido.codificacion === "utf-8" ? "UTF-8" : "Latin-1");
  const fin = finDeLinea ?? (contenido.texto.includes("\n") ? finDeLineaDe(contenido.texto) : undefined);
  if (fin !== undefined) partes.push(fin === "\r\n" ? "CRLF" : "LF");
  return partes;
}
