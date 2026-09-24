import { useEffect, useRef } from "react";
import { CodeBlock } from "@deepseek-ai/dsh-client-ui-primitives";
import { extractoDeLinea } from "../extractoDeLinea.js";
import estilos from "./Visor.module.css";

/**
 * El contenido de un fichero, de solo lectura, con el MISMO resaltador que las vallas de
 * código del chat: `CodeBlock` del paquete de deepseek, que monta shiki con un tema de
 * variables CSS (`estilos/shiki.css`). Un segundo resaltador con su propio tema pintaría el
 * visor de otro color que el chat.
 *
 * Los números de línea no los da el componente: los pone la hoja de este fichero con un
 * contador CSS sobre los `<span class="line">` que shiki emite, uno por línea. Con una
 * gramática que no está cargada todavía —xml, css, ini y markdown se cargan la primera vez
 * que se piden— el primer render sale plano y sin números, y `CodeBlock` se vuelve a pintar
 * solo cuando la gramática llega. Un lenguaje desconocido se queda plano y sin números:
 * el marcado plano es un solo `<code>` y no hay dónde contar.
 */
export function Visor({ texto, lenguaje, linea }: { texto: string; lenguaje?: string; linea?: number }) {
  const caja = useRef<HTMLDivElement>(null);
  const extracto = linea === undefined ? undefined : extractoDeLinea(texto, linea);

  /**
   * Con `linea`, además del extracto, el visor intenta ir a ella y marcarla — y es un INTENTO.
   * Depende de los `span.line` de shiki, que solo existen con la gramática cargada, así que se
   * vuelve a aplicar cada vez que `CodeBlock` repinta (el primer render puede salir plano) y, sin
   * líneas, no hace nada: el extracto de arriba ya contestó.
   */
  useEffect(() => {
    const nodo = caja.current;
    if (nodo === null || linea === undefined || extracto === undefined) return;
    let movido = false;
    const aplicar = (): void => {
      const lineas = nodo.querySelectorAll<HTMLElement>(".line");
      const suya = lineas[linea - 1];
      for (const l of nodo.querySelectorAll<HTMLElement>(".line[data-marcada]")) if (l !== suya) delete l.dataset.marcada;
      if (suya === undefined) return;
      suya.dataset.marcada = "";
      if (!movido && typeof suya.scrollIntoView === "function") {
        suya.scrollIntoView({ block: "center" });
        movido = true;
      }
    };
    aplicar();
    if (typeof MutationObserver === "undefined") return;
    const observador = new MutationObserver(aplicar);
    observador.observe(nodo, { childList: true, subtree: true });
    return () => observador.disconnect();
    // `extracto` sale de `texto` y `linea`: con esos dos basta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto, linea]);

  return (
    <div className={estilos.visor} ref={caja}>
      {linea === undefined ? null : extracto === undefined ? (
        // El hallazgo nombraba una línea que el fichero ya no tiene: cambió desde entonces.
        <p className={estilos.aviso}>{`El fichero ya no tiene línea ${linea}: ha cambiado desde el hallazgo.`}</p>
      ) : (
        <div className={estilos.extracto} aria-label={`Línea ${linea}`}>
          {extracto.lineas.map((l) => (
            <div key={l.numero} className={estilos.lineaDelExtracto} data-marcada={l.marcada ? "" : undefined}>
              <span className={estilos.numero}>{l.numero}</span>
              <span>{l.texto}</span>
            </div>
          ))}
        </div>
      )}
      <CodeBlock code={texto} lang={lenguaje} copyLabel="Copiar" copiedLabel="Copiado" className={estilos.bloque} />
    </div>
  );
}
