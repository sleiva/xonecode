import { CodeBlock } from "@deepseek-ai/dsh-client-ui-primitives";
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
export function Visor({ texto, lenguaje }: { texto: string; lenguaje?: string }) {
  return (
    <div className={estilos.visor}>
      <CodeBlock code={texto} lang={lenguaje} copyLabel="Copiar" copiedLabel="Copiado" className={estilos.bloque} />
    </div>
  );
}
