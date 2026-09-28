import { describe, expect, it } from "vitest";
import { CSP_DE_OPENUI, documentoDeOpenui, esArtefactoOpenui } from "./visorOpenui.js";

describe("documentoDeOpenui", () => {
  const visor = { js: "console.log('visor')", css: "body{color:red}" };

  /**
   * El tema lo decide XOneCode, no el sistema. Medido: con el Mac en oscuro y XOneCode en claro,
   * el visor —dentro de un iframe que no ve el tema de la consola— cargaba los textos del oscuro
   * de OpenUI (su `@media(prefers-color-scheme:dark)`) sobre un fondo blanco, y las tablas salían
   * casi invisibles. Y la vía estándar no sirve: `color-scheme` en el `<iframe>` NO cambia el
   * `prefers-color-scheme` de dentro (medido en Chrome 154).
   */
  describe("el tema del visor", () => {
    const conOscuro = { js: "", css: "a{color:#000}@media(prefers-color-scheme:dark){:root{--openui-foreground:#fff}}b{c:d}" };

    it("en CLARO el bloque del oscuro no aplica NUNCA, aunque el sistema esté en oscuro", () => {
      const doc = documentoDeOpenui("root = A", conOscuro, "x", "claro");
      expect(doc).toContain("@media not all{:root{--openui-foreground:#fff}}");
      expect(doc).not.toContain("prefers-color-scheme");
    });

    it("en OSCURO aplica SIEMPRE, aunque el sistema esté en claro", () => {
      const doc = documentoDeOpenui("root = A", conOscuro, "x", "oscuro");
      expect(doc).toContain("@media all{:root{--openui-foreground:#fff}}");
      expect(doc).not.toContain("prefers-color-scheme");
    });

    it("también con la forma sin minificar (`@media (prefers-color-scheme: dark)`)", () => {
      const doc = documentoDeOpenui("root = A", { js: "", css: "@media (prefers-color-scheme: dark) {x{y:z}}" }, "x", "claro");
      expect(doc).toContain("@media not all {x{y:z}}");
    });

    it("sin tema, el CSS queda tal cual (sigue al sistema, lo de antes)", () => {
      expect(documentoDeOpenui("root = A", conOscuro, "x")).toContain("@media(prefers-color-scheme:dark)");
    });

    it("el fondo sale del TEMA de OpenUI, no de un blanco a fuego que choca con el oscuro", () => {
      const doc = documentoDeOpenui("root = A", conOscuro, "x", "oscuro");
      expect(doc).toContain("background:var(--openui-background");
      expect(doc).not.toMatch(/body\{[^}]*background:#fff/);
    });
  });

  it("mete el visor y el programa dentro: el iframe no puede pedir nada al servidor", () => {
    const doc = documentoDeOpenui('root = Stack([t])\nt = TextContent("hola")', visor, "panel");
    expect(doc).toContain("<script>console.log('visor')</script>");
    expect(doc).toContain("<style>body{color:red}</style>");
    expect(doc).not.toMatch(/<script[^>]+src=|<link[^>]+href=/);
    const json = /<script type="application\/json" id="xonecode-programa">([\s\S]*?)<\/script>/.exec(doc)![1]!;
    expect(JSON.parse(json)).toBe('root = Stack([t])\nt = TextContent("hola")');
  });

  it("un programa con `</script>` no se sale de su sitio ni se ejecuta", () => {
    const doc = documentoDeOpenui('t = TextContent("</script><script>alert(1)</script>")', visor, "x");
    // Solo el script del visor es ejecutable; el programa va escapado dentro del JSON.
    expect(doc.match(/<script>/g)).toHaveLength(1);
    expect(doc).not.toContain("<script>alert(1)");
  });

  it("un visor que contuviera `</script>` o `</style>` tampoco rompe el documento", () => {
    const doc = documentoDeOpenui("root = A", { js: 'var s="</script>"', css: 'a::after{content:"</style>"}' }, "x");
    expect(doc).toContain('var s="<\\/script>"');
    expect(doc).toContain('content:"<\\/style>"');
  });

  it("el título se escapa", () => {
    expect(documentoDeOpenui("root = A", visor, '<b>"x"</b>')).toContain("<title>&lt;b&gt;&quot;x&quot;&lt;/b&gt;</title>");
  });
});

describe("la CSP de un .openui", () => {
  it("es un artefacto aislado Y sin red: nada sale de la máquina al pintarlo", () => {
    expect(CSP_DE_OPENUI).toContain("sandbox allow-scripts");
    expect(CSP_DE_OPENUI).toContain("default-src 'none'");
    expect(CSP_DE_OPENUI).toContain("connect-src 'none'");
    expect(CSP_DE_OPENUI).toContain("img-src data:");
    expect(CSP_DE_OPENUI).not.toMatch(/https?:|\*/);
  });

  it("se reconoce por la extensión", () => {
    expect(esArtefactoOpenui("panel.openui")).toBe(true);
    expect(esArtefactoOpenui("PANEL.OPENUI")).toBe(true);
    expect(esArtefactoOpenui("panel.html")).toBe(false);
  });
});
