import type { Acto } from "../tipos.js";
import { aHtml } from "../markdown.js";
import estilos from "./Chat.module.css";

/**
 * La vista de lectura: cada turno de USUARIO o ASISTENTE como un globo, con el del
 * asistente renderizado como markdown —encabezados, listas, `código`, bloques y
 * tablas— y saneado por `aHtml` antes de entrar al DOM (`markdown.ts` documenta por
 * qué el saneado es obligatorio: el texto lo escribe un modelo).
 *
 * El texto del USUARIO se pinta tal cual, sin pasar por `aHtml`: son sus propias
 * palabras, no hay nada que interpretar como markdown, y evitarlo evita también
 * sanear dos veces lo mismo sin necesidad.
 *
 * Los actos que no son de conversación (`herramientas`, `sistema`, `fase`, `fin`,
 * `error`) no pintan burbuja aquí — son la razón de ser de la Trayectoria, la otra
 * pestaña. Mezclarlos en el Chat sería la misma cosa que ese componente evita:
 * enseñar detalle técnico donde el usuario solo quiere leer la conversación.
 */
export function Chat({ actos }: { actos: readonly Acto[] }) {
  return (
    <div className={estilos.chat}>
      {actos.map((acto, indice) => {
        if (acto.tipo === "usuario") {
          return (
            <p key={indice} className={`${estilos.globo} ${estilos.usuario}`}>
              {acto.texto}
            </p>
          );
        }
        if (acto.tipo === "asistente") {
          return (
            <div
              key={indice}
              className={`${estilos.globo} ${estilos.asistente}`}
              // El HTML ya pasó por `aHtml` (marked + DOMPurify): es el único sitio de
              // este componente donde entra HTML, y entra ya saneado.
              dangerouslySetInnerHTML={{ __html: aHtml(acto.texto) }}
            />
          );
        }
        if (acto.tipo === "error") {
          return (
            <p key={indice} className={`${estilos.globo} ${estilos.error}`}>
              {acto.texto}
            </p>
          );
        }
        return null;
      })}
    </div>
  );
}
