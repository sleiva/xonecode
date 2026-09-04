/**
 * Markdown a HTML, saneado.
 *
 * El texto lo escribe un MODELO. `marked` no sanea —lo dice su propia documentación— y un
 * modelo puede emitir `<img onerror=…>` sin ninguna mala intención. La página tiene la
 * cookie de sesión del servidor local, así que insertar HTML sin sanear sería regalar la
 * consola entera. Los dos pasos son obligatorios y en este orden.
 */
import { marked } from "marked";
import DOMPurify from "dompurify";

export function aHtml(markdown: string): string {
  return DOMPurify.sanitize(marked.parse(markdown, { async: false }) as string);
}
