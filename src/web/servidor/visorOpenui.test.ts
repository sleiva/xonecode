import { describe, expect, it } from "vitest";
import { CSP_DE_OPENUI, documentoDeOpenui, esArtefactoOpenui } from "./visorOpenui.js";

describe("documentoDeOpenui", () => {
  const visor = { js: "console.log('visor')", css: "body{color:red}" };

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
