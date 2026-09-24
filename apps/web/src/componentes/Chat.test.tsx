import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { Chat, MS_DEL_AVISO_AUTONOMO, peticionDeCorreccion } from "./Chat.js";
import { Transcript } from "./Transcript.js";
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

  it("«Trabajo del agente» dice QUIÉN pidió cada tanda, en orden y solo cuando cambia", () => {
    const dev = { rol: "especialista", nombre: "developer-xone" } as const;
    const { container } = render(
      <Chat
        actos={[
          { tipo: "usuario", texto: "añade un campo" },
          {
            tipo: "herramientas",
            lineas: ["⊙ delega en developer-xone", "→ lee /app.xml", "← edita /clientes.xne"],
            detalles: [
              { nombre: "task", origen: { rol: "orquestador" } },
              { nombre: "read_file", origen: dev },
              { nombre: "edit_file", origen: dev },
            ],
          },
          { tipo: "razonamiento", texto: "sigo" },
          // El mismo especialista tras un razonamiento: no se repite el rótulo.
          { tipo: "herramientas", lineas: ["→ lee /menu.xne"], detalles: [{ nombre: "read_file", origen: dev }] },
          { tipo: "fin", ms: 10 },
        ]}
      />
    );
    const rotulos = [...container.querySelectorAll("details p")]
      .map((p) => p.textContent)
      .filter((t) => t === "orquestador" || t === "developer-xone");
    expect(rotulos).toEqual(["orquestador", "developer-xone"]);
    // Y las líneas siguen todas, en su orden.
    expect([...container.querySelectorAll("details li")].map((li) => li.textContent)).toEqual([
      "⊙ delega en developer-xone",
      "→ lee /app.xml",
      "← edita /clientes.xne",
      "→ lee /menu.xne",
    ]);
  });

  it("la memoria pedida en el turno se dice en su PRIMER tramo, con quién, y no en los demás", () => {
    const { container } = render(
      <Chat
        actos={[
          { tipo: "usuario", texto: "sigue" },
          { tipo: "herramientas", lineas: ["→ lee /MEMORIA_PROYECTO.md"] },
          asistente("Miro el proyecto."),
          { tipo: "herramientas", lineas: ["→ lee /app.xml"] },
          { tipo: "fin", ms: 10, memoria: { por: [{ rol: "orquestador" }, { rol: "especialista", nombre: "developer-xone" }] } },
        ]}
      />
    );
    const tramos = [...container.querySelectorAll("details")];
    expect(tramos).toHaveLength(2);
    expect(tramos[0]!.textContent).toContain("Memoria del proyecto · pedida por orquestador, developer-xone");
    expect(tramos[1]!.textContent).not.toContain("Memoria del proyecto");
  });

  it("sin el campo no hay línea de memoria: un turno que no la pidió no dice nada de ella", () => {
    const { container } = render(
      <Chat actos={[{ tipo: "usuario", texto: "x" }, { tipo: "herramientas", lineas: ["→ lee /a"] }, { tipo: "fin", ms: 1 }]} />
    );
    expect(container.textContent).not.toContain("Memoria del proyecto");
  });

  it("sin origen que conste —una sesión anterior— no se inventa ningún rótulo", () => {
    const { container } = render(
      <Chat actos={[{ tipo: "usuario", texto: "x" }, { tipo: "herramientas", lineas: ["→ lee /a"] }, { tipo: "fin", ms: 1 }]} />
    );
    expect(container.querySelectorAll("details p")).toHaveLength(0);
    expect(container.querySelector("details li")?.textContent).toBe("→ lee /a");
  });

  it("mientras el turno corre, el pulso dice cuántos segundos lleva", () => {
    const actos: Acto[] = [
      { tipo: "usuario", texto: "haz algo" },
      { tipo: "herramientas", lineas: ["→ lee /app.xml"] },
    ];
    render(<Chat actos={actos} turnoEnVuelo segundosEnVuelo={42} />);
    expect(screen.getByText(/Trabajando… · 42 s/)).toBeTruthy();
  });

  it("y DICE en qué paso está, que es lo que el total no contesta", () => {
    // Medido con un turno de más de nueve minutos delante: «Trabajando… · 650 s» no
    // distingue un agente que avanza de uno colgado. Las líneas se emiten cuando una tool va
    // a EMPEZAR, así que la última es literalmente lo que está haciendo.
    render(
      <Chat
        actos={[
          { tipo: "usuario", texto: "documenta el proyecto" },
          { tipo: "herramientas", lineas: ["→ lee ×20 — /app.xml", "⊙ Skill xonecode:archify"] },
        ]}
        turnoEnVuelo
        segundosEnVuelo={650}
      />
    );
    // En el SUMMARY, que es lo que se ve con el pulso PLEGADO: desplegarlo para saber qué
    // está haciendo es justo lo que sobra cuando un turno se alarga.
    const resumen = document.querySelector("summary")!;
    expect(resumen.textContent).toMatch(/Skill xonecode:archify/);
    expect(resumen.textContent).toMatch(/650 s/);
  });

  it("si lo último es RAZONAMIENTO dice «Pensando…», no la tool de antes", () => {
    // Sin esto, un modelo que pensaba después de leer salía como «→ lee /app.xml · 40 s», que
    // se lee como una lectura colgada.
    render(
      <Chat
        actos={[
          { tipo: "usuario", texto: "haz algo" },
          { tipo: "herramientas", lineas: ["→ lee /app.xml"] },
          { tipo: "razonamiento", texto: "La colección de login está en…" },
        ]}
        turnoEnVuelo
        segundosEnVuelo={50}
      />
    );
    const resumen = document.querySelector("summary")!;
    expect(resumen.textContent).toMatch(/Pensando…/u);
    expect(resumen.textContent).not.toMatch(/lee \/app\.xml/u);
  });

  it("y vuelve a la tool en cuanto llega otra: pensar no se queda pegado", () => {
    render(
      <Chat
        actos={[
          { tipo: "usuario", texto: "haz algo" },
          { tipo: "razonamiento", texto: "Primero leo el app.xml" },
          { tipo: "herramientas", lineas: ["→ lee /app.xml"] },
        ]}
        turnoEnVuelo
        segundosEnVuelo={5}
      />
    );
    const resumen = document.querySelector("summary")!;
    expect(resumen.textContent).toMatch(/lee \/app\.xml/u);
    expect(resumen.textContent).not.toMatch(/Pensando/u);
  });

  it("y el paso se olvida al llegar el mensaje siguiente: no es de este turno", () => {
    // Sin esto, un turno nuevo abriría enseñando el último paso del anterior.
    render(
      <Chat
        actos={[
          { tipo: "herramientas", lineas: ["⊙ Skill de antes"] },
          { tipo: "usuario", texto: "otra cosa" },
        ]}
        turnoEnVuelo
        segundosEnVuelo={3}
      />
    );
    const resumen = [...document.querySelectorAll("summary")].at(-1)!;
    expect(resumen.textContent).not.toMatch(/Skill de antes/);
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

  it("NO manda a teclear «/»: en el navegador no hay comandos que abrir", () => {
    // Aquí decía «Escribe `/` para ver los comandos». Dejó de ser cierto cuando los comandos
    // se fueron de esta piel —una prosa que empezara por «/» ejecutaba una orden—, y una
    // bienvenida que manda a pulsar una tecla muerta es peor que una que no la nombra.
    render(<Chat actos={[]} proyecto="AppDemo" modelo="gemini/gemini-flash-latest" />);
    expect(screen.getByRole("region", { name: /sesión nueva/ }).textContent).not.toMatch(/comandos/i);
  });

  it("sin modelo consta, la frase que lo nombra se va con él y no deja un hueco", () => {
    // El párrafo existía para SOSTENER esa frase; sin modelo no queda nada que decir, y un
    // `<p>` vacío es una línea en blanco que se lee como algo que no cargó.
    const { container } = render(<Chat actos={[]} proyecto="AppDemo" />);
    const bloque = container.querySelector('[aria-label="sesión nueva"]');
    expect(bloque?.textContent).toMatch(/aprobación antes de escribir/);
    expect(bloque?.textContent).not.toMatch(/Trabajará con/);
    expect(bloque?.querySelectorAll("p") ?? []).toHaveLength(1);
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
    const { container } = render(<Chat actos={[artefacto]} />);
    expect(screen.getByText("flujo.html")).toBeTruthy();
    expect(screen.getByText("42 KB")).toBeTruthy();
    // La REGLA —que no es del proyecto— se dice una vez por tarjeta y no se PINTA: medido,
    // eran 18 px idénticos en las dieciséis tarjetas de una conversación real, y una frase
    // repetida enseña a no leerla. Sigue estando donde se consulta.
    expect(container.textContent).not.toContain("No es un fichero del proyecto");
    expect(container.querySelector("[title*='no entra en git']")).toBeTruthy();
  });

  it("con sesión COPIA la ruta DEL PROYECTO; sin ella, la virtual y no una inventada", () => {
    // La ruta de la máquina no viaja nunca —el cable puede ir por un túnel—, así que la del
    // proyecto se compone aquí con el id de la sesión. Y el id puede faltar: no existe hasta
    // que se vuelca el primer acto.
    //
    // Ya no se PINTA —eran 36 px con el uuid partido en dos líneas, de una tarjeta cuyo dato
    // son 23— pero sigue siendo lo que el botón copia, que es para lo que se usaba: leerla no
    // le hace falta a nadie, pegarla en un terminal sí. La garantía se mudó de sitio, no se
    // quitó: sin este test, el botón podría acabar copiando la virtual sin que nada avisara.
    const copiado: string[] = [];
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: (t: string) => { copiado.push(t); return Promise.resolve(); } },
    });

    const { unmount } = render(<Chat actos={[artefacto]} sesion="s-1" />);
    expect(screen.queryByText(".xonecode/sesiones/s-1/artefactos/flujo.html")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Copiar la ruta del artefacto" }));
    expect(copiado).toEqual([".xonecode/sesiones/s-1/artefactos/flujo.html"]);
    unmount();

    render(<Chat actos={[artefacto]} />);
    fireEvent.click(screen.getByRole("button", { name: "Copiar la ruta del artefacto" }));
    expect(copiado[1]).toBe("/artefactos/flujo.html");
  });

  it("la tarjeta ENTERA abre el artefacto, y sin manejador se queda como rótulo", () => {
    const abrir = vi.fn();
    const { unmount } = render(<Chat actos={[artefacto]} alAbrirArtefacto={abrir} />);
    // Dice qué es por su extensión, y lo dice escrito: el dibujo es aria-hidden.
    expect(screen.getByText(/^HTML ·/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Abrir flujo.html" }));
    expect(abrir).toHaveBeenCalledWith("/artefactos/flujo.html");
    // Y la frase que decía que no se podía abrir se fue con esto.
    expect(screen.queryByText(/todavía no se abre/i)).toBeNull();
    unmount();

    // Un botón que no lleva a ninguna parte es el botón muerto de siempre.
    render(<Chat actos={[artefacto]} />);
    expect(screen.queryByRole("button", { name: "Abrir flujo.html" })).toBeNull();
    expect(screen.getByText("flujo.html")).toBeTruthy();
  });

  it("no se pliega con el trabajo del agente: no es paisaje del pulso", () => {
    // Un `fin` pliega el tramo de razonamiento/tools. El artefacto queda fuera de ese
    // tramo, así que sigue a la vista cuando el turno termina.
    render(<Chat actos={[{ tipo: "herramientas", lineas: ["→ lee x"] }, artefacto, { tipo: "fin", ms: 10 }]} />);
    expect(screen.getByText("flujo.html")).toBeTruthy();
  });

  /**
   * **Una IMAGEN se enseña, no se nombra.**
   *
   * Una captura es lo único del hilo que se entiende de un vistazo sin abrir nada, y estaba
   * saliendo como un renglón con su nombre —`captura-1790061246909.jpg`— que no dice nada de
   * lo que hay dentro. En una sesión de aparato son seis o siete por turno: seis renglones
   * con un timestamp cada uno.
   *
   * Van en una FILA de miniaturas y sin texto, y el clic sigue llevando a la pestaña
   * Artefactos, que es donde se miran de verdad. Lo que NO es imagen se queda con su tarjeta
   * de una línea: de un `.json` no hay nada que previsualizar.
   */
  it("una captura sale como MINIATURA en fila, sin texto, y sigue abriendo la pestaña", () => {
    const abrir = vi.fn();
    const captura: Acto = {
      tipo: "artefacto",
      ruta: "/artefactos/captura-9.jpg",
      nombre: "captura-9.jpg",
      bytes: 52_000,
      mime: "image/jpeg",
    };
    const volcado: Acto = {
      tipo: "artefacto",
      ruta: "/artefactos/respuesta-status-9.json",
      nombre: "respuesta-status-9.json",
      bytes: 8_000,
      mime: "application/json",
    };
    const { container } = render(
      <Chat actos={[captura, volcado, { tipo: "fin", ms: 10 }]} alAbrirArtefacto={abrir} />
    );

    // La imagen se PINTA, y por la ruta HTTP del artefacto — nunca marcado inyectado.
    const img = container.querySelector("img");
    expect(img).toBeTruthy();
    expect(img!.getAttribute("src")).toBe("/artefacto?n=captura-9.jpg");
    // Sin texto: su nombre no se pinta, pero SÍ es su nombre accesible, que es lo que la
    // convierte en un control y no en un adorno.
    expect(container.textContent).not.toContain("captura-9.jpg");
    const boton = screen.getByRole("button", { name: /captura-9\.jpg/u });
    fireEvent.click(boton);
    expect(abrir).toHaveBeenCalledWith("/artefactos/captura-9.jpg");

    // Y lo que no es imagen conserva su tarjeta con el nombre: de un `.json` no hay
    // previsualización que enseñar.
    expect(screen.getByText("respuesta-status-9.json")).toBeTruthy();
    expect(container.querySelectorAll("img")).toHaveLength(1);
  });

  /**
   * **Y NO parte el tramo de trabajo, que es lo que lo volvía ilegible.**
   *
   * Medido en el navegador sobre una sesión real de `device-controller`: la secuencia de
   * actos era `P5 A P5 A P8 A P1 A P2`, o sea cinco tarjetas alternando con cinco bloques
   * «Trabajo del agente», cuatro de ellos de uno o dos pasos. En una pantalla de 1.353 px
   * cabían seis tarjetas, ocho tramos y UN párrafo del asistente.
   *
   * La causa es la misma que el test de la sincronización fija por el otro lado: un acto que
   * no es de pulso CIERRA el tramo abierto. Pero un artefacto no es conversación — es lo que
   * PRODUJO el trabajo que está dentro del tramo, así que pertenece a él.
   *
   * Lo que este test fija son las tres cosas a la vez, porque cualquiera de ellas sola sería
   * un arreglo peor: UN solo desplegable, las tarjetas VISIBLES (plegarlas dentro sería
   * esconder la captura que el agente acaba de sacar) y EN ORDEN antes de la respuesta, que
   * es lo que `turnoReal.ts` decidió cuando las sacó del montón del final.
   */
  it("cinco artefactos entre pasos dan UN tramo, no cinco: las tarjetas no lo parten", () => {
    const paso = (n: number): Acto => ({
      tipo: "herramientas",
      lineas: Array.from({ length: n }, (_, i) => `→ lee f${i}`),
    });
    const art = (n: number): Acto => ({
      tipo: "artefacto",
      ruta: `/artefactos/captura-${n}.jpg`,
      nombre: `captura-${n}.jpg`,
      bytes: 1024,
      mime: "image/jpeg",
    });
    const { container } = render(
      <Chat
        actos={[
          { tipo: "usuario", texto: "mira la pantalla" },
          paso(5), art(1), paso(5), art(2), paso(8), art(3), paso(1), art(4), paso(2), art(5),
          asistente("Ya está."),
          { tipo: "fin", ms: 1000 },
        ]}
      />
    );

    // UN desplegable, no cinco.
    expect(container.querySelectorAll("details")).toHaveLength(1);
    // Y cuenta los PASOS, no las tarjetas: un artefacto no es un paso que el agente diera,
    // es lo que un paso produjo. Contarlo inflaría la cabecera en +5.
    expect(screen.getByText(/Trabajo del agente · 21 pasos/u)).toBeTruthy();
    // Las cinco siguen a la VISTA y en ORDEN. Son imágenes, así que se leen por su `alt`:
    // el nombre ya no se pinta como texto (ver el test de la miniatura), pero el orden en
    // que se produjeron es lo que esto fija.
    expect([...container.querySelectorAll("img")].map((i) => i.getAttribute("alt"))).toEqual([
      "captura-1.jpg",
      "captura-2.jpg",
      "captura-3.jpg",
      "captura-4.jpg",
      "captura-5.jpg",
    ]);
    // Y antes de la respuesta, que es lo que decidió `turnoReal.ts` al sacarlas del montón
    // del final: una captura suelta no dice nada, una captura antes del párrafo que la
    // explica sí.
    const cuerpo = [...container.querySelectorAll("img, p")];
    const ultima = cuerpo.findIndex((e) => e.getAttribute("alt") === "captura-5.jpg");
    const respuesta = cuerpo.findIndex((e) => (e.textContent ?? "").includes("Ya está."));
    expect(ultima).toBeGreaterThanOrEqual(0);
    expect(ultima).toBeLessThan(respuesta);
    // Y ninguna está DENTRO del desplegable, que es donde nadie las vería.
    expect(container.querySelector("details")!.querySelector("img")).toBeNull();
  });
});

describe("Chat: la sincronización", () => {
  /**
   * **Ni una línea, y sin romper el tramo del agente.**
   *
   * Una operación de CloudStudio volcaba aquí sus nueve renglones de consola —medido en la
   * pantalla que él mandó—, y el hilo es la conversación: eso se cuenta en el registro de la
   * banda de Revisión. Lo que este test fija no es solo que no se pinte, sino **por dónde**
   * deja de pintarse: si el acto cayera en la rama de conversación cerraría el tramo de pulso
   * abierto y el trabajo de un mismo turno saldría partido en dos bloques desplegables. Por eso
   * va con `continue` en el recorrido y no con el `return null` del render, y por eso aquí se
   * cuentan los `<details>`.
   */
  it("no pinta nada, y no parte el tramo de trabajo del agente", () => {
    const { container } = render(
      <Chat
        actos={[
          { tipo: "herramientas", lineas: ["→ lee app/Clientes.xne"] },
          {
            tipo: "sincronizacion",
            accion: "subir",
            cuando: "2026-09-16T14:32:11.000Z",
            lineas: [
              "SUBIDA A CLOUDSTUDIO — 1 operación",
              "  + app/Clientes.xne",
              "  → APROBADO",
              "subidos 1, fallaron 0",
            ],
          },
          { tipo: "herramientas", lineas: ["→ escribe app/Clientes.xne"] },
          { tipo: "fin", ms: 1200 },
        ]}
      />
    );

    // Ni el plan, ni el veredicto, ni el recuento.
    expect(screen.queryByText(/SUBIDA A CLOUDSTUDIO/)).toBeNull();
    expect(screen.queryByText(/APROBADO/)).toBeNull();
    expect(screen.queryByText(/subidos 1, fallaron 0/)).toBeNull();

    // Y el trabajo sigue siendo UN tramo: las dos líneas de tool dentro del mismo bloque.
    expect(container.querySelectorAll("details")).toHaveLength(1);
    expect(screen.getByText("→ lee app/Clientes.xne")).toBeTruthy();
    expect(screen.getByText("→ escribe app/Clientes.xne")).toBeTruthy();
  });
});

describe("Chat: la sesión que escribe sin preguntar", () => {
  it("lo DICE arriba, y manda a la PASTILLA y no a un comando", () => {
    // Quien se sienta hoy tiene que saberlo ANTES de pedir nada, no después con los
    // ficheros ya cambiados. Y en el navegador «/» es prosa: mandarle a teclear
    // `/aprobacion` sería mandarle a un camino que aquí no existe.
    const { container } = render(<Chat actos={[]} sinAprobacion />);
    expect(screen.getByText(/modo autónomo/i)).toBeTruthy();
    expect(screen.getByText(/supervisado/i)).toBeTruthy();
    expect(container.textContent).toContain("pastilla");
    expect(container.textContent).not.toContain("/aprobacion");
  });

  it("dice también lo que el modo NO concede: la subida sigue preguntando", () => {
    // El modo gobierna las escrituras LOCALES. Callarlo dejaría creer que también se sube
    // solo, que es la confusión que más caro sale en un proyecto conectado.
    const { container } = render(<Chat actos={[]} sinAprobacion />);
    expect(container.textContent).toContain("CloudStudio");
  });

  it("y no lo dice cuando no es cierto", () => {
    render(<Chat actos={[]} />);
    expect(screen.queryByText(/modo autónomo/i)).toBeNull();
  });

  /**
   * Pedido por él: el aviso se quedaba fijo arriba durante toda la sesión. Se retira al
   * pulsarlo, con su «×» o solo a los veinte segundos — y el modo se sigue leyendo en el
   * conmutador de la caja, que es donde ese dato vive siempre.
   */
  it("se retira al pulsarlo", () => {
    render(<Chat actos={[]} sinAprobacion />);
    fireEvent.click(screen.getByText(/modo autónomo/i));
    expect(screen.queryByText(/modo autónomo/i)).toBeNull();
  });

  it("y con su «×»", () => {
    render(<Chat actos={[]} sinAprobacion />);
    fireEvent.click(screen.getByRole("button", { name: "Cerrar el aviso" }));
    expect(screen.queryByText(/modo autónomo/i)).toBeNull();
  });

  it("y solo, pasado el plazo", () => {
    vi.useFakeTimers();
    try {
      render(<Chat actos={[]} sinAprobacion />);
      act(() => vi.advanceTimersByTime(MS_DEL_AVISO_AUTONOMO - 1));
      expect(screen.getByText(/modo autónomo/i)).toBeTruthy();
      act(() => vi.advanceTimersByTime(1));
      expect(screen.queryByText(/modo autónomo/i)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("volver a autónomo después de supervisado lo ENSEÑA otra vez", () => {
    const { rerender } = render(<Chat actos={[]} sinAprobacion />);
    fireEvent.click(screen.getByRole("button", { name: "Cerrar el aviso" }));
    rerender(<Chat actos={[]} />);
    rerender(<Chat actos={[]} sinAprobacion />);
    expect(screen.getByText(/modo autónomo/i)).toBeTruthy();
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

/**
 * El coste por MENSAJE, que es el nivel que faltaba entre el contador de la conversación y lo
 * que gasta la sesión.
 *
 * Estos tres casos se midieron en pantalla, y el segundo es un fallo de verdad: la cifra que
 * se veía junto a un turno era la de OTRO turno. El contador del compositor cuadraba —el total
 * siempre estuvo bien—, así que nada avisaba; lo que mentía era la atribución.
 */
describe("Chat: lo que costó cada turno", () => {
  const fin = (ms: number, entrada?: number, salida?: number, cache = 0): Acto => ({
    tipo: "fin",
    ms,
    ...(entrada === undefined
      ? {}
      : {
          consumo: {
            modelo: { entrada, salida: salida ?? 0, cache },
            externo: { entrada: 0, salida: 0, cache: 0 },
          },
        }),
  });
  const herramientas = (linea: string): Acto => ({ tipo: "herramientas", lineas: [linea] });
  /** El texto visible de la línea de cierre, sin los espacios que separan los trozos. */
  const cierres = (container: HTMLElement) =>
    [...container.querySelectorAll("summary, p")].map((n) => n.textContent ?? "").filter((t) => /[↑↓]/.test(t));

  it("un turno sin ningún acto de trabajo cuelga su coste de su propio cierre", () => {
    // Sin tramo no había dónde ponerlo, y el gasto de una pregunta contestada a pelo se
    // perdía: la respuesta salía sin decir lo que costó, que es justo lo que se pregunta.
    const { container } = render(
      <Chat actos={[{ tipo: "usuario", texto: "¿qué es XOne?" }, asistente("Una plataforma."), fin(2600, 2200, 5)]} />
    );
    expect(cierres(container).join(" ")).toContain("2.6s");
    expect(cierres(container).join(" ")).toContain("2,2k");
    expect(cierres(container).join(" ")).toContain("5");
  });

  it("y el turno siguiente, si tampoco tiene trabajo, NO le roba la cifra al anterior", () => {
    // El fallo medido: un `fin` cerraba el último tramo de la lista ENTERA, así que la línea
    // del turno con herramientas acabó enseñando la duración y el coste del turno siguiente.
    const { container } = render(
      <Chat
        actos={[
          { tipo: "usuario", texto: "lee el README" },
          herramientas("→ lista /"),
          asistente("README.md"),
          fin(2575, 8786, 24),
          { tipo: "usuario", texto: "di adiós" },
          asistente("Adiós."),
          fin(5854, 3388, 4),
        ]}
      />
    );
    const linea = container.querySelector("summary")?.textContent ?? "";
    // El turno del `read_file` conserva LO SUYO…
    expect(linea).toContain("2.6s");
    expect(linea).toContain("8,8k");
    // …y el de después lleva lo suyo, en su propia línea.
    expect(cierres(container).join(" ")).toContain("5.9s");
    expect(cierres(container).join(" ")).toContain("3,4k");
  });

  it("un turno sin consumo no añade una línea: ausente es «no consta»", () => {
    // Los `fin` de las sesiones escritas antes de esto, y los turnos de un comando, que no
    // llaman a ningún modelo. Una cifra de cero ahí sería la medida que nadie hizo.
    const { container } = render(
      <Chat actos={[{ tipo: "usuario", texto: "/ayuda" }, { tipo: "sistema", texto: "los comandos" }, fin(40)]} />
    );
    expect(cierres(container)).toEqual([]);
  });

  it("lo que quedó abierto cuando llega un mensaje nuevo se cierra, pero SIN cifras", () => {
    // Un turno que nunca cerró —el proceso murió a media respuesta— no midió su duración ni su
    // gasto. Heredar los del turno siguiente es lo que se arregló; heredarlos del anterior
    // sería el mismo error al revés, así que se queda sin ellos y se dice lo que sí consta.
    const { container } = render(
      <Chat
        actos={[herramientas("→ lista /"), { tipo: "usuario", texto: "otra cosa" }, asistente("Vale."), fin(100, 10, 1)]}
      />
    );
    const linea = container.querySelector("summary")?.textContent ?? "";
    expect(linea).toContain("1 paso");
    expect(linea).not.toContain("0.1s");
    expect(linea).not.toContain("↑");
  });
});

/**
 * **El AIRE del hilo, y por qué esto se comprueba leyendo la HOJA.**
 *
 * jsdom no hace layout ni cascada, así que un test de píxeles aquí sería una promesa: las
 * cifras salieron del navegador y ahí se vuelven a mirar. Lo que este bloque sí puede fijar
 * es que las dos reglas **existen y están puestas donde tienen que estar** — que es
 * exactamente la forma de fallo de esta arquitectura en versión de CSS: una regla escrita en
 * una hoja que nadie enlaza se queda escrita y muerta, con todo en verde.
 *
 * Es el mismo molde que `Barra.test.tsx` usa para las consultas de contenedor.
 */
describe("el aire del hilo", () => {
  // La misma forma que `Barra.test.tsx`: `import.meta.url` no es `file:` bajo vitest.
  const hoja = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "Chat.module.css"), "utf8");

  it("la jerarquía del hueco se declara con la VARIABLE de la hoja copiada, no con un margen nuestro", () => {
    // `ChatView.module.css` pone `margin-top: var(--dsh-chat-flow-gap, 16px)` al HIJO, así
    // que la variable se resuelve en cada acto. Un margen propio tendría que ganarle a una
    // especificidad de (0,7,0), y ese es el camino por el que esto se rompe en silencio.
    expect(hoja).toMatch(/\.flujo\s*\{[^}]*--dsh-chat-flow-gap/u);
    expect(hoja).toMatch(/\.inicioDeTurno\s*\{[^}]*--dsh-chat-flow-gap/u);
    // Y el de un turno nuevo es MAYOR que el de dentro del turno, que es toda la jerarquía.
    const valor = (clase: string) =>
      Number(
        new RegExp(`\\.${clase}\\s*\\{[^}]*--dsh-chat-flow-gap:\\s*(\\d+)px`, "u").exec(hoja)?.[1] ?? "0"
      );
    expect(valor("inicioDeTurno")).toBeGreaterThan(valor("flujo"));
  });

  it("y el acto del USUARIO es quien la lleva, porque es lo que ABRE un turno", () => {
    const { container } = render(
      <Chat actos={[{ tipo: "usuario", texto: "hola" }, asistente("qué tal")]} />
    );
    const usuario = container.querySelector('[class*="usuario"]');
    expect(usuario?.className).toMatch(/inicioDeTurno/u);
    // Y el del asistente NO: dentro de un turno el hueco es el corto.
    expect(container.querySelector('[class*="asistente"]')?.className).not.toMatch(/inicioDeTurno/u);
  });

  it("el primer y el último bloque de un mensaje no llevan margen: contra el relleno es aire doble", () => {
    // Medido: 878 px en una conversación de 31 mensajes, y 28 de los 92 px de uno de una
    // línea. Por hijo DIRECTO, para no alcanzar el primer párrafo de una cita o de un `li`,
    // que sí lo quieren.
    expect(hoja).toMatch(/\.asistente\s*>\s*:first-child\s*>\s*:first-child\s*\{\s*margin-top:\s*0/u);
    expect(hoja).toMatch(/\.asistente\s*>\s*:first-child\s*>\s*:last-child\s*\{\s*margin-bottom:\s*0/u);
  });
});

/**
 * **Lo que el HARNESS dice sobre el turno se pliega; lo que te CONTESTA, no.**
 *
 * Los actos de sistema eran un cajón con cuatro orígenes: la respuesta a un comando, el
 * enunciado de una pregunta, los avisos de honestidad y la lista de escrituras autorizadas
 * sin preguntar. Al final de un turno salían cuatro renglones grises seguidos, dos de ellos
 * contradictorios entre sí, y tres «developer-xone: quiere escribir un fichero del proyecto»
 * repetidos — medido en pantalla.
 *
 * La línea no se traza por el texto sino por la CLASE, que viaja con el acto: la misma regla
 * que la forma de una pregunta. Y lo que queda FUERA del plegable es lo que contesta a algo
 * que la persona acaba de pulsar: plegar un «hecho: …» sería no contestarle.
 */
describe("Chat: lo que dice el harness", () => {
  const aviso = (texto: string): Acto => ({ tipo: "sistema", texto, clase: "aviso" });
  const permiso = (texto: string): Acto => ({ tipo: "sistema", texto, clase: "permiso" });

  it("los avisos consecutivos se pliegan bajo «Verificaciones», y el resumen DICE cuántos", () => {
    const { container } = render(
      <Chat actos={[asistente("ya está"), aviso("no cumple lo que pediste"), aviso("5 defectos de pantalla")]} />
    );
    const d = container.querySelector("details");
    expect(d).toBeTruthy();
    // El resumen dice QUÉ hay dentro, no solo cuántos: que existan avisos no puede quedar
    // escondido — es lo único que el aparato de honestidad existe para hacer visible.
    expect(d!.querySelector("summary")!.textContent).toMatch(/Verificaciones · 2 avisos/u);
    expect(d!.textContent).toContain("no cumple lo que pediste");
    expect(d!.textContent).toContain("5 defectos de pantalla");
  });

  it("y los permisos bajo «Permisos», con su propio tramo: son dos preguntas distintas", () => {
    const { container } = render(
      <Chat
        actos={[
          permiso("developer-xone: quiere escribir un fichero del proyecto"),
          permiso("developer-xone: quiere modificar un fichero del proyecto"),
          aviso("no cumple lo que pediste"),
        ]}
      />
    );
    const resumenes = [...container.querySelectorAll("summary")].map((s) => s.textContent);
    expect(resumenes).toEqual([
      expect.stringMatching(/Permisos · 2 escrituras/u),
      expect.stringMatching(/Verificaciones · 1 aviso\b/u),
    ]);
  });

  it("el resumen de contexto se pliega en su propio tramo y se lee como MARKDOWN", () => {
    const { container } = render(
      <Chat
        actos={[
          { tipo: "sistema", texto: "## Qué se hace\n\n- crear `Calculadora.xne`", clase: "resumen" },
          aviso("MAP_COLOR5 sin_markdown"),
        ]}
      />
    );
    const detalles = [...container.querySelectorAll("details")];
    expect(detalles[0]!.querySelector("summary")!.textContent).toMatch(/Resumen del contexto · 1 resumen\b/u);
    // Markdown de verdad: un título y código en línea, no el texto con sus almohadillas.
    expect(detalles[0]!.querySelector("h2")?.textContent).toBe("Qué se hace");
    expect(detalles[0]!.querySelector("code")?.textContent).toBe("Calculadora.xne");
    // Y un aviso NO pasa por markdown: los guiones bajos se quedan como están.
    expect(detalles[1]!.textContent).toContain("MAP_COLOR5 sin_markdown");
    expect(detalles[1]!.querySelector("em")).toBeNull();
  });

  it("uno solo se dice en SINGULAR: un plural mentido es una cifra que nadie midió", () => {
    const { container } = render(<Chat actos={[permiso("developer-xone: quiere escribir")]} />);
    expect(container.querySelector("summary")!.textContent).toMatch(/Permisos · 1 escritura\b/u);
  });

  it("una respuesta a un COMANDO no se pliega: es el acuse de algo que acabas de pulsar", () => {
    const { container } = render(
      <Chat
        actos={[
          { tipo: "sistema", texto: "hecho: cada escritura vuelve a pedir aprobación." },
          aviso("no cumple lo que pediste"),
        ]}
      />
    );
    // El «hecho:» está a la vista y FUERA de cualquier desplegable.
    expect(screen.getByText(/hecho: cada escritura/u)).toBeTruthy();
    expect(container.querySelector("details")!.textContent).not.toContain("hecho:");
  });

  it("una clase DESCONOCIDA no tumba el render: se trata como suelta", () => {
    // El acto llega por el CABLE, de otro proceso que puede tener otra versión —«nada de lo
    // que llega por el cable puede darse por bien formado»—, y el store solo valida el
    // `tipo`. Sin esta guarda, un host más nuevo con una clase que este cliente no conoce
    // dejaba `CLASES_DE_SISTEMA[clase]` en `undefined` y el destructuring LANZABA, o sea que
    // se llevaba el transcript entero por delante. El lado conservador es enseñarlo suelto.
    const raro = { tipo: "sistema", texto: "de una versión más nueva", clase: "fantasma" } as unknown as Acto;
    const { container } = render(<Chat actos={[raro]} />);
    expect(screen.getByText("de una versión más nueva")).toBeTruthy();
    expect(container.querySelector("details")).toBeNull();
  });

  it("y un acto de una sesión ANTERIOR, sin clase, se pinta como siempre", () => {
    // `clase` es opcional a propósito: el `.jsonl` de una conversación guardada antes de que
    // el campo existiera no lo trae, y ausente significa «suelto», no «sin clasificar».
    const { container } = render(<Chat actos={[{ tipo: "sistema", texto: "esfuerzo: high" }]} />);
    expect(container.querySelector("details")).toBeNull();
    expect(screen.getByText("esfuerzo: high")).toBeTruthy();
  });
});

/**
 * **El tramo de trabajo: cuál está en curso, y cómo se abre.**
 *
 * Los tres defectos salieron de una pantalla con un turno EN VUELO delante.
 */
describe("Chat: el tramo de trabajo", () => {
  const paso = (t: string): Acto => ({ tipo: "herramientas", lineas: [t] });

  it("solo el ÚLTIMO tramo del turno está trabajando: los de antes ya cerraron", () => {
    // MEDIDO en pantalla: tres tramos seguidos decían LO MISMO —«Trabajando… · 1397 s ·
    // busca function calc · 17 s»—, porque el paso y el cronómetro se calculan una vez para
    // la lista ENTERA y los pintaba cualquier tramo sin terminar. Pero un tramo que un
    // mensaje del asistente ya cerró no está trabajando: lo que quedan por delante son sus
    // pasos, no el paso de ahora.
    const { container } = render(
      <Chat
        actos={[
          { tipo: "usuario", texto: "haz algo" },
          paso("→ lee a"),
          asistente("voy por aquí"),
          paso("→ lee b"),
        ]}
        turnoEnVuelo
        segundosEnVuelo={1397}
      />
    );
    const resumenes = [...container.querySelectorAll("summary")].map((s) => s.textContent ?? "");
    expect(resumenes).toHaveLength(2);
    expect(resumenes[0]).toMatch(/Trabajo del agente · 1 paso/u);
    expect(resumenes[0]).not.toMatch(/Trabajando/u);
    // Y el de ahora sí, con el cronómetro del turno.
    expect(resumenes[1]).toMatch(/Trabajando… · 1397 s/u);
  });

  it("y nace PLEGADO también con el turno en vuelo: la línea ya dice en qué paso está", () => {
    // Antes se abría mientras el turno corría, «porque es lo único que se ve mientras
    // trabaja». Dejó de ser cierto cuando el resumen empezó a llevar el paso actual y su
    // cronómetro: eso es lo que se ve con el pulso PLEGADO, y un tramo abierto de cuarenta
    // pasos empuja la respuesta fuera de la pantalla.
    const { container } = render(<Chat actos={[paso("→ lee a")]} turnoEnVuelo />);
    expect(container.querySelector("details")!.hasAttribute("open")).toBe(false);
  });

  it("al desplegarlo, el andamio va en una ventana con scroll y no crece sin fin", () => {
    // jsdom no hace layout, así que lo que se fija aquí es que el contenedor ES un scroller
    // —tiene su clase— y que la hoja le pone tope y desbordamiento. La altura se midió en el
    // navegador; ver el comentario de la hoja.
    const { container } = render(
      <Chat actos={Array.from({ length: 40 }, (_, i) => paso(`→ lee f${i}`))} />
    );
    const detalle = container.querySelector("details > div");
    expect(detalle?.className).toMatch(/detalleDePulso/u);
    const hoja = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "Chat.module.css"), "utf8");
    expect(hoja).toMatch(/\.detalleDePulso\s*\{[^}]*max-height/u);
    expect(hoja).toMatch(/\.detalleDePulso\s*\{[^}]*overflow-y:\s*auto/u);
  });
});

describe("el rojo con el que TERMINA un turno", () => {
  const rojo = (errores = 1): Acto => ({
    tipo: "verificacion",
    verde: false,
    errores,
    avisos: 0,
    hallazgos: [
      { code: "E1", severidad: "error", mensaje: "falta el campo", fichero: "app/Clientes.xne", linea: 12 },
      { code: "E9", severidad: "error", mensaje: "sin sitio" },
    ],
    preexistentes: 3,
  });
  const verde: Acto = { tipo: "verificacion", verde: true, errores: 0, avisos: 0 };
  const usuario: Acto = { tipo: "usuario", texto: "añade un campo" };
  const fin: Acto = { tipo: "fin", ms: 10 };

  it("sale FUERA del plegado, con sus hallazgos, y los botones abren y piden", () => {
    const alAbrirFichero = vi.fn();
    const alPedirCorreccion = vi.fn();
    render(
      <Chat actos={[usuario, rojo(), fin]} alAbrirFichero={alAbrirFichero} alPedirCorreccion={alPedirCorreccion} />
    );
    const tarjeta = screen.getByRole("region", { name: "Verificación en rojo" });
    expect(tarjeta.closest("details")).toBeNull();
    expect(tarjeta.textContent).toContain("app/Clientes.xne:12");
    expect(tarjeta.textContent).toContain("3 hallazgos más en ficheros que este turno no tocó");
    // Botones solo en el hallazgo con fichero: uno de cada.
    const abrir = screen.getAllByRole("button", { name: "Abrir" });
    expect(abrir).toHaveLength(1);
    fireEvent.click(abrir[0]!);
    expect(alAbrirFichero).toHaveBeenCalledWith("app/Clientes.xne", 12);
    fireEvent.click(screen.getByRole("button", { name: "Pedir corrección" }));
    expect(alPedirCorreccion).toHaveBeenCalledWith("Corrige E1 en app/Clientes.xne:12: falta el campo");
  });

  it("un rojo que una reparación dejó en VERDE no se ofrece: ya no es lo que queda", () => {
    render(<Chat actos={[usuario, rojo(), { tipo: "herramientas", lineas: ["← edita x"] }, verde, fin]} />);
    expect(screen.queryByRole("region", { name: "Verificación en rojo" })).toBeNull();
  });

  it("con el turno EN VUELO tampoco: lo decide el `fin`, que detrás puede venir la reparación", () => {
    render(<Chat actos={[usuario, rojo()]} turnoEnVuelo />);
    expect(screen.queryByRole("region", { name: "Verificación en rojo" })).toBeNull();
  });

  it("dentro del tramo el veredicto se sigue contando en líneas, como antes", () => {
    const { container } = render(<Chat actos={[usuario, rojo(), fin]} />);
    const lineas = [...container.querySelectorAll("details li")].map((li) => li.textContent);
    expect(lineas[0]).toBe("✗  verificación: 1 error(es), 0 aviso(s)");
  });

  it("sin manejadores no hay botones muertos", () => {
    render(<Chat actos={[usuario, rojo(), fin]} />);
    expect(screen.queryByRole("button", { name: "Abrir" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Pedir corrección" })).toBeNull();
  });

  it("`Transcript` los REENVÍA: son opcionales y un reenvío olvidado no lo caza `tsc`", () => {
    const alAbrirFichero = vi.fn();
    const alPedirCorreccion = vi.fn();
    render(<Transcript actos={[usuario, rojo(), fin]} alAbrirFichero={alAbrirFichero} alPedirCorreccion={alPedirCorreccion} />);
    fireEvent.click(screen.getByRole("button", { name: "Abrir" }));
    fireEvent.click(screen.getByRole("button", { name: "Pedir corrección" }));
    expect(alAbrirFichero).toHaveBeenCalledTimes(1);
    expect(alPedirCorreccion).toHaveBeenCalledTimes(1);
  });

  it("la petición dice qué, dónde y lo que dijo el simulador", () => {
    expect(peticionDeCorreccion({ code: "E9", severidad: "error", mensaje: "sin sitio" })).toBe("Corrige E9: sin sitio");
  });
});

describe("un artefacto editado varias veces", () => {
  const art = (bytes: number): Acto => ({ tipo: "artefacto", ruta: "/artefactos/flujo.html", nombre: "flujo.html", bytes, mime: "text/html" });
  const edita: Acto = { tipo: "herramientas", lineas: ["← edita /artefactos/flujo.html"] };

  it("tiene UNA tarjeta, en su último anuncio, aunque cada edición se anuncie", () => {
    // Medido en pantalla: ocho ediciones del mismo HTML dejaban ocho tarjetas iguales.
    const { container } = render(
      <Chat
        actos={[{ tipo: "usuario", texto: "haz el diagrama" }, art(10), edita, art(20), edita, art(46_000), { tipo: "fin", ms: 1 }]}
        alAbrirArtefacto={() => {}}
      />
    );
    const tarjetas = [...container.querySelectorAll("button")].filter((b) => b.getAttribute("aria-label") === "Abrir flujo.html");
    expect(tarjetas).toHaveLength(1);
    // La que queda es la del último anuncio: la que dice el tamaño de ahora.
    expect(container.textContent).toContain("45 KB");
  });

  it("dos artefactos distintos siguen siendo dos tarjetas", () => {
    const otro: Acto = { tipo: "artefacto", ruta: "/artefactos/otro.html", nombre: "otro.html", bytes: 10, mime: "text/html" };
    const { container } = render(
      <Chat actos={[{ tipo: "usuario", texto: "x" }, art(10), otro, { tipo: "fin", ms: 1 }]} alAbrirArtefacto={() => {}} />
    );
    const nombres = [...container.querySelectorAll("button")]
      .map((b) => b.getAttribute("aria-label")?.replace(/^Abrir /, ""))
      .filter((t) => t?.endsWith(".html"));
    expect(nombres).toEqual(["flujo.html", "otro.html"]);
  });
});

describe("Chat: lo que falló en el trabajo del agente", () => {
  it("se cuenta en la línea plegada y se marca en su paso, por el DATO y no por el ✗ del texto", () => {
    const { container } = render(
      <Chat
        actos={[
          {
            tipo: "herramientas",
            lineas: ["→ lee /a.xne", "✗ lee /b.xne: no existe", "✗ esto solo parece un fallo"],
            detalles: [{ nombre: "read_file" }, { nombre: "read_file", error: "no existe" }, {}],
          },
          { tipo: "fin", ms: 10 },
        ]}
      />
    );
    expect(screen.getByText(/Trabajo del agente · 3 pasos/u).textContent).toContain("· 1 falló");
    const marcados = [...container.querySelectorAll("li[data-fallo]")].map((li) => li.textContent);
    expect(marcados).toEqual(["✗ lee /b.xne: no existe"]);
  });

  it("sin fallos no dice nada de fallos", () => {
    render(<Chat actos={[{ tipo: "herramientas", lineas: ["→ lee /a.xne"], detalles: [{}] }, { tipo: "fin", ms: 10 }]} />);
    expect(screen.getByText(/Trabajo del agente · 1 paso/u).textContent).not.toMatch(/fall/u);
  });
});

describe("Chat: quién pensó", () => {
  it("el razonamiento de un especialista lleva su rótulo, y la tool suya de detrás no lo repite", () => {
    const { container } = render(
      <Chat
        actos={[
          { tipo: "razonamiento", texto: "Delego.", origen: { rol: "orquestador" } },
          { tipo: "razonamiento", texto: "Leo el app.", origen: { rol: "especialista", nombre: "developer-xone" } },
          {
            tipo: "herramientas",
            lineas: ["→ lee /app.xml"],
            detalles: [{ nombre: "read_file", origen: { rol: "especialista", nombre: "developer-xone" } }],
          },
          { tipo: "fin", ms: 10 },
        ]}
      />
    );
    const rotulos = [...container.querySelectorAll("details p")]
      .map((p) => p.textContent)
      .filter((t) => t === "orquestador" || t === "developer-xone");
    expect(rotulos).toEqual(["orquestador", "developer-xone"]);
  });
});

