import type { FormaDeArtefacto } from "./componentes/IconosDelVisor.js";

/**
 * Qué TIPO de artefacto es, para su tarjeta del chat: el rótulo que se lee («HTML», «OpenUI»)
 * y el dibujo que lo acompaña. Sale de la EXTENSIÓN, que es como el servidor ya decide el mime
 * de un artefacto (`core/artefactos.ts`); el `mime` del acto es opcional porque las sesiones
 * viejas no lo traen, así que no puede ser lo que decida.
 *
 * Lo que no se reconoce dice su extensión en mayúsculas —la verdad que se tiene— y, sin
 * extensión, «Fichero». Nunca un tipo adivinado.
 */
export function tipoDeArtefacto(nombre: string): { etiqueta: string; forma: FormaDeArtefacto } {
  const punto = nombre.lastIndexOf(".");
  const ext = punto > 0 ? nombre.slice(punto + 1).toLowerCase() : "";
  switch (ext) {
    case "html":
    case "htm":
      return { etiqueta: "HTML", forma: "pagina" };
    case "openui":
      return { etiqueta: "OpenUI", forma: "panel" };
    case "md":
      return { etiqueta: "Markdown", forma: "texto" };
    case "txt":
      return { etiqueta: "Texto", forma: "texto" };
    case "json":
    case "csv":
      return { etiqueta: ext.toUpperCase(), forma: "texto" };
    case "svg":
      return { etiqueta: "SVG", forma: "imagen" };
    case "png":
    case "jpg":
    case "jpeg":
    case "gif":
    case "webp":
      return { etiqueta: "Imagen", forma: "imagen" };
    case "":
      return { etiqueta: "Fichero", forma: "fichero" };
    default:
      return { etiqueta: ext.toUpperCase(), forma: "fichero" };
  }
}
