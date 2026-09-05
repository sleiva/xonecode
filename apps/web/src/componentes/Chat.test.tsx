import { render, cleanup } from "@testing-library/react";
import { afterEach, describe, it, expect } from "vitest";
import { Chat } from "./Chat.js";
import type { Acto } from "../tipos.js";

// Mismo motivo que `Compositor.test.tsx`: sin `globals` en `vitest.config.ts`, un
// segundo `render()` en este fichero deja montado el primero y `container.querySelector`
// del test siguiente vería DOS árboles.
afterEach(cleanup);

const asistente = (texto: string): Acto => ({ tipo: "asistente", texto });

describe("Chat", () => {
  it("renderiza lo básico vía MarkdownText: encabezado, lista e inline code", () => {
    const { container } = render(<Chat actos={[asistente("# Hola\n\n- uno\n- dos\n\n`x`")]} />);
    expect(container.querySelector("h1")?.textContent).toBe("Hola");
    expect(container.querySelectorAll("li")).toHaveLength(2);
    expect(container.querySelector("code")?.textContent).toBe("x");
  });

  /**
   * Las mismas tres cadenas prohibidas que probaba `markdown.test.ts` contra `aHtml`
   * (Task 13), ahora contra el DOM que monta el componente REAL — no contra una promesa
   * de tipo ni contra la salida de una función aislada. `MarkdownText` no tiene sanitizer
   * que pueda tener un agujero: el nodo `html` del árbol se pinta como TEXTO, nunca como
   * `dangerouslySetInnerHTML`, así que lo que hay que comprobar no es que algo se haya
   * limpiado, sino que nunca llegó a construirse.
   */
  describe("el texto lo escribe un modelo, y nada de esto puede volverse HTML activo", () => {
    it("un <script> no monta ningún nodo <script>: sale como texto literal", () => {
      const { container } = render(<Chat actos={[asistente("<script>alert(1)</script>")]} />);
      expect(container.querySelector("script")).toBeNull();
      expect(container.textContent).toContain("<script>alert(1)</script>");
    });

    it("un <img onerror=…> no monta ningún <img>: no hay manejador que disparar", () => {
      const { container } = render(<Chat actos={[asistente('<img src=x onerror="alert(1)">')]} />);
      // Ningún elemento con ese atributo existe EN EL DOM — que la cadena
      // `onerror="alert` aparezca en `innerHTML` no basta como prueba: el texto literal
      // de este mismo test la contiene, ESCAPADA (`&lt;img … onerror="alert(1)"&gt;`),
      // que es justo el resultado correcto. La comprobación tiene que ser sobre el
      // árbol, no sobre una subcadena del serializado.
      expect(container.querySelector("img")).toBeNull();
      expect(container.querySelector("[onerror]")).toBeNull();
      expect(container.textContent).toContain('<img src=x onerror="alert(1)">');
    });

    it("un enlace javascript: no monta ningún <a>: el protocolo no pasa la lista blanca", () => {
      const { container } = render(<Chat actos={[asistente("[pincha](javascript:alert(1))")]} />);
      expect(container.querySelector("a")).toBeNull();
      expect(container.innerHTML).not.toContain("javascript:");
      // El destino se descarta entero (`sanitizeUrl` en `render.js` lo reduce a cadena
      // vacía): lo único que sobrevive es el texto visible del enlace, sin el paréntesis.
      expect(container.textContent).toContain("pincha");
    });

    /**
     * Las tres de arriba pasan por `case "html": return node.value` —una cadena, nunca
     * `dangerouslySetInnerHTML`— y con eso basta para que sean inertes por construcción.
     * Una valla de código es el ÚNICO sitio donde `MarkdownText` SÍ construye HTML de
     * verdad: `CodeBlock` resalta con shiki y lo inserta con `dangerouslySetInnerHTML`
     * (`highlightToHtml`, `lib/index.js`). El lenguaje va como `js` a propósito: resuelve
     * a la gramática TypeScript, que es de las TRES que cargan en el arranque (`LANGS`,
     * `highlight.js`) — cualquier otro lenguaje del `LAZY_GRAMMARS` cargaría por
     * `import()` y en el primer render caería al `<pre><code>` de respaldo sin pasar
     * nunca por shiki, lo que no probaría nada. `.md-code-block` es la única clase que
     * el paquete conserva sin machacar (el resto de sus CSS Modules están vacíos en esta
     * rc — ver `Chat.module.css`): esta aserción deja dicho que el único gancho de estilo
     * de este componente sigue existiendo.
     */
    it("una valla de código con JS no monta ningún <script>: shiki escapa lo que resalta", () => {
      const codigo = "</code><script>alert(1)</script>";
      const { container } = render(<Chat actos={[asistente("```js\n" + codigo + "\n```")]} />);
      expect(container.querySelector("script")).toBeNull();
      expect(container.querySelector(".md-code-block")).not.toBeNull();
      expect(container.textContent).toContain(codigo);
    });
  });

  /**
   * `MarkdownText` apaga el resaltado ENTERO en modo streaming (`lang: undefined` en su
   * `renderCode`): tiene sentido a medio llegar —una valla sin cerrar no se puede
   * colorear— y ninguno después. Dejarlo puesto en el último mensaje lo dejaba gris para
   * siempre, que es lo que se vio en pantalla.
   */
  it("el código sale resaltado cuando el turno YA terminó", () => {
    const actos = [{ tipo: "asistente", texto: "```js\nconst a = 1;\n```" }] as const;
    const { container, rerender } = render(<Chat actos={[...actos]} turnoEnVuelo />);
    // A medio llegar: sin lenguaje, así que sin tokens de shiki.
    expect(container.querySelector("[class*='language-']")).toBeNull();

    rerender(<Chat actos={[...actos]} turnoEnVuelo={false} />);
    // Terminado: el bloque ya declara su lenguaje, que es lo que shiki necesita para pintar.
    expect(container.innerHTML).toMatch(/language-js|shiki/);
  });
});
