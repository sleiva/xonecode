import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { afterEach, describe, it, expect, vi } from "vitest";
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

describe("Chat: lo que la revisión de interfaz vio en vivo", () => {
  it("un dólar en la prosa se pinta como dólar, no como fórmula — asentado y en streaming", () => {
    // Medido: «$http … $ui» salía como «*httpparapeticionesyelobjeto*ui». El renderizador
    // lee el dólar simple como TeX y no se puede apagar; se escapa antes de dárselo.
    const texto = "en XOne se usa $http para peticiones y el objeto $ui no existe";
    for (const enVuelo of [false, true]) {
      cleanup();
      const { container } = render(<Chat actos={[asistente(texto)]} turnoEnVuelo={enVuelo} />);
      expect(container.querySelector(".katex, math")).toBeNull();
      expect(container.textContent).toContain("se usa $http para peticiones y el objeto $ui no existe");
    }
  });

  it("dentro de una valla el dólar ya era literal y sigue sin barra delante", () => {
    const { container } = render(<Chat actos={[asistente("```js\nvar r = $http.get(u);\n```")]} />);
    expect(container.querySelector("pre")?.textContent).toContain("$http.get(u)");
    expect(container.querySelector("pre")?.textContent).not.toContain("\\$");
  });

  it("una sesión reabierta lo DICE arriba: el agente no la recuerda", () => {
    render(<Chat actos={[asistente("hola")]} historica />);
    expect(screen.getByRole("note").textContent).toMatch(/reabierta/);
    expect(screen.getByRole("note").textContent).toMatch(/no la recuerda/);
  });

  it("sin la marca no hay aviso: afirmarlo de una sesión viva sería mentir", () => {
    render(<Chat actos={[asistente("hola")]} />);
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("mientras el turno corre, el pulso dice cuántos segundos lleva", () => {
    const actos: Acto[] = [
      { tipo: "usuario", texto: "haz algo" },
      { tipo: "herramientas", lineas: ["→ lee /app.xml"] },
    ];
    render(<Chat actos={actos} turnoEnVuelo segundosEnVuelo={42} />);
    expect(screen.getByText(/Trabajando… · 42 s/)).toBeTruthy();
  });
});

describe("Chat: la sesión nueva no es un vacío", () => {
  it("sin actos dice dónde estás, qué pedir y con qué modelo", () => {
    render(<Chat actos={[]} proyecto="AppDemo" modelo="gemini/gemini-flash-latest" />);
    const bloque = screen.getByRole("region", { name: /sesión nueva/ });
    expect(bloque.textContent).toMatch(/Sesión nueva en AppDemo/);
    expect(bloque.textContent).toMatch(/aprobación antes de escribir/);
    expect(bloque.textContent).toMatch(/gemini\/gemini-flash-latest/);
  });

  it("con el primer acto se va, y en una relectura no aparece", () => {
    render(<Chat actos={[asistente("hola")]} proyecto="AppDemo" />);
    expect(screen.queryByRole("region", { name: /sesión nueva/ })).toBeNull();
    cleanup();
    render(<Chat actos={[]} historica proyecto="AppDemo" />);
    expect(screen.queryByRole("region", { name: /sesión nueva/ })).toBeNull();
  });
});

describe("Chat: el artefacto", () => {
  const artefacto = {
    tipo: "artefacto" as const,
    ruta: "/artefactos/flujo.html",
    nombre: "flujo.html",
    bytes: 43_008,
  };

  it("se ve, con su nombre y su peso, y dice que no es del proyecto", () => {
    // No es decoración: es la ÚNICA escritura del turno que no pasó por la aprobación
    // humana, así que si no se viera sería una escritura muda.
    render(<Chat actos={[artefacto]} />);
    expect(screen.getByText("flujo.html")).toBeTruthy();
    expect(screen.getByText("42 KB")).toBeTruthy();
    expect(screen.getByText(/No es un fichero del proyecto/i)).toBeTruthy();
  });

  it("con sesión dice la ruta DEL PROYECTO; sin ella, la virtual y no una inventada", () => {
    // La ruta de la máquina no viaja nunca —el cable puede ir por un túnel—, así que la del
    // proyecto se compone aquí con el id de la sesión. Y el id puede faltar: no existe hasta
    // que se vuelca el primer acto.
    const { unmount } = render(<Chat actos={[artefacto]} sesion="s-1" />);
    expect(screen.getByText(".xonecode/sesiones/s-1/artefactos/flujo.html")).toBeTruthy();
    unmount();

    render(<Chat actos={[artefacto]} />);
    expect(screen.getByText("/artefactos/flujo.html")).toBeTruthy();
  });

  it("el nombre ABRE el artefacto, y sin manejador se queda como rótulo", () => {
    const abrir = vi.fn();
    const { unmount } = render(<Chat actos={[artefacto]} alAbrirArtefacto={abrir} />);
    fireEvent.click(screen.getByRole("button", { name: "flujo.html" }));
    expect(abrir).toHaveBeenCalledWith("/artefactos/flujo.html");
    // Y la frase que decía que no se podía abrir se fue con esto.
    expect(screen.queryByText(/todavía no se abre/i)).toBeNull();
    unmount();

    // Un botón que no lleva a ninguna parte es el botón muerto de siempre.
    render(<Chat actos={[artefacto]} />);
    expect(screen.queryByRole("button", { name: "flujo.html" })).toBeNull();
    expect(screen.getByText("flujo.html")).toBeTruthy();
  });

  it("no se pliega con el trabajo del agente: no es paisaje del pulso", () => {
    // Un `fin` pliega el tramo de razonamiento/tools. El artefacto queda fuera de ese
    // tramo, así que sigue a la vista cuando el turno termina.
    render(<Chat actos={[{ tipo: "herramientas", lineas: ["→ lee x"] }, artefacto, { tipo: "fin", ms: 10 }]} />);
    expect(screen.getByText("flujo.html")).toBeTruthy();
  });
});

describe("Chat: el proyecto que escribe sin preguntar", () => {
  it("lo DICE arriba, y dice cómo deshacerlo", () => {
    // La decisión se tomó una vez en `settings.json`, quizá hace meses. Quien se sienta hoy
    // tiene que saberlo ANTES de pedir nada, no después con los ficheros ya cambiados.
    render(<Chat actos={[]} sinAprobacion />);
    expect(screen.getByText(/sin pedirte aprobación/i)).toBeTruthy();
    expect(screen.getByText("/aprobacion humana")).toBeTruthy();
  });

  it("y no lo dice cuando no es cierto", () => {
    render(<Chat actos={[]} />);
    expect(screen.queryByText(/sin pedirte aprobación/i)).toBeNull();
  });
});

describe("Chat: el trabajo que ya había sin commitear", () => {
  it("lo dice arriba y NOMBRA los ficheros", () => {
    // Un contador a secas no deja saber si eso es tuyo, de otra sesión o de una tarea, que
    // es lo único que hace accionable el aviso.
    render(<Chat actos={[]} trabajoAlAbrir={{ ficheros: ["app.xml", "js/Clientes.js"], total: 2 }} />);
    expect(screen.getByText("app.xml")).toBeTruthy();
    expect(screen.getByText("js/Clientes.js")).toBeTruthy();
  });

  it("habla en PASADO: es una foto del instante en que se abrió", () => {
    // La medida no se repite en los reanuncios, a propósito — así no puede contar como
    // ajeno lo que esta sesión acabe de escribir. Un presente («hay cambios») sería falso
    // en cuanto alguien commitea, y el aviso seguiría ahí.
    render(<Chat actos={[]} trabajoAlAbrir={{ ficheros: ["app.xml"], total: 1 }} />);
    expect(screen.getByText(/cuando abriste/i)).toBeTruthy();
  });

  it("cuando hay más de los que caben, lo DICE en vez de dar la lista por entera", () => {
    render(<Chat actos={[]} trabajoAlAbrir={{ ficheros: ["a.xne", "b.xne"], total: 30 }} />);
    expect(screen.getByText(/28 más/)).toBeTruthy();
  });

  it("y no dice nada cuando no hay nada que decir", () => {
    render(<Chat actos={[]} />);
    expect(screen.queryByText(/cuando abriste/i)).toBeNull();
  });
});

describe("Chat: lo que dice la consola", () => {
  it("un acto de sistema se VE, y no se pliega con el trabajo del agente", () => {
    // Vivía solo en Trazas. Por ahí pasan la respuesta a un comando que el usuario acaba de
    // teclear y los avisos de honestidad — y un aviso que solo está en la pestaña de
    // depurar el harness es exactamente el aviso que nadie lee.
    render(
      <Chat
        actos={[
          { tipo: "usuario", texto: "/aprobacion" },
          { tipo: "sistema", texto: "humana: cada escritura pide aprobación con su diff delante" },
          { tipo: "fin", ms: 10 },
        ]}
      />
    );
    expect(screen.getByText(/cada escritura pide aprobación/)).toBeTruthy();
  });

  it("y el aviso de honestidad de una escritura sin aprobar también", () => {
    render(<Chat actos={[{ tipo: "sistema", texto: "⚠ 1 escritura(s) aplicadas SIN aprobación: /Clientes.xne" }]} />);
    expect(screen.getByText(/SIN aprobación: \/Clientes.xne/)).toBeTruthy();
  });
});
