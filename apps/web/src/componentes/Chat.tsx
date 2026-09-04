import type { Acto } from "../tipos.js";
import { MarkdownText, type MarkdownCodeLabels } from "@deepseek-ai/dsh-client-ui-primitives";
import estilos from "./Chat.module.css";

/**
 * La vista de lectura: cada turno de USUARIO o ASISTENTE como un globo, con el del
 * asistente renderizado por `MarkdownText` (`@deepseek-ai/dsh-client-ui-primitives`) en
 * vez de `marked` + `DOMPurify` (Task 13). No es «parsear y luego sanear»: su propio
 * tipo la documenta como «Untrusted assistant-Markdown renderer» y su política es que el
 * HTML crudo se pinta como TEXTO LITERAL — nunca entra al DOM (verificado leyendo su
 * `render.js` compilado: el nodo `html` del árbol devuelve `node.value`, una cadena, no
 * `dangerouslySetInnerHTML`) — así que no hay sanitizer cuyo agujero pueda fallar, porque
 * no se construye HTML a partir del texto del modelo. `Chat.test.tsx` prueba justo eso
 * contra el DOM real, no contra la promesa del tipo.
 *
 * `streaming` va siempre a `false`, y no es el valor por omisión sin pensar: `pielWeb.ts`
 * (servidor) acumula cada `token()` en un colchón y solo empuja UN acto `asistente`
 * completo al cerrar la línea — no existe hoy ninguna `sustitucion` que vaya rellenando
 * ese acto pedazo a pedazo, a diferencia de la racha de `herramientas`. Para cuando este
 * componente ve el acto, ya está entero: pasar `streaming={true}` le diría a
 * `MarkdownText` que deje sin resaltar vallas de código y TeX a la espera de un
 * «finalize swap» que aquí nunca llega, así que sería una regresión, no una posibilidad.
 * El día que `pielWeb` emita el acto por trozos, este valor pasa a derivarse de si el
 * acto es el último Y el turno sigue vivo.
 *
 * `codeLabels` va en español porque el paquete es «zero-cordis» y no puede leer el
 * locale de la app: sin esto, el botón de copiar de cada valla de código saldría en
 * chino, que es el valor por omisión documentado en su propio README.
 *
 * El texto del USUARIO se pinta tal cual, sin pasar por `MarkdownText`: son sus propias
 * palabras, no hay nada que interpretar como markdown.
 *
 * Los actos que no son de conversación (`herramientas`, `sistema`, `fase`, `fin`,
 * `error`) no pintan burbuja aquí — son la razón de ser de la Trayectoria, la otra
 * pestaña. Mezclarlos en el Chat sería la misma cosa que ese componente evita:
 * enseñar detalle técnico donde el usuario solo quiere leer la conversación.
 */
const ETIQUETAS_DE_CODIGO: MarkdownCodeLabels = { copyLabel: "Copiar", copiedLabel: "Copiado" };

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
            <div key={indice} className={`${estilos.globo} ${estilos.asistente}`}>
              <MarkdownText text={acto.texto} streaming={false} codeLabels={ETIQUETAS_DE_CODIGO} />
            </div>
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
