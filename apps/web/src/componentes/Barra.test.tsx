import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

const AQUI = dirname(fileURLToPath(import.meta.url));
const modulos = readdirSync(AQUI).filter((f) => f.endsWith(".module.css"));

/**
 * Palabras clave de color de CSS Color Module Level 4 (los 147 nombres extendidos, más
 * `transparent` y `currentcolor`) — una lista CERRADA, no «lo que se me ocurra»: es la
 * única barrera que hace cumplir «ningún color literal», y una lista abierta es una
 * barrera con un agujero del tamaño de la próxima palabra que a alguien se le olvide.
 */
const PALABRAS_CLAVE_DE_COLOR = [
  "aliceblue", "antiquewhite", "aqua", "aquamarine", "azure", "beige", "bisque", "black",
  "blanchedalmond", "blue", "blueviolet", "brown", "burlywood", "cadetblue", "chartreuse",
  "chocolate", "coral", "cornflowerblue", "cornsilk", "crimson", "cyan", "darkblue",
  "darkcyan", "darkgoldenrod", "darkgray", "darkgreen", "darkgrey", "darkkhaki",
  "darkmagenta", "darkolivegreen", "darkorange", "darkorchid", "darkred", "darksalmon",
  "darkseagreen", "darkslateblue", "darkslategray", "darkslategrey", "darkturquoise",
  "darkviolet", "deeppink", "deepskyblue", "dimgray", "dimgrey", "dodgerblue", "firebrick",
  "floralwhite", "forestgreen", "fuchsia", "gainsboro", "ghostwhite", "gold", "goldenrod",
  "gray", "green", "greenyellow", "grey", "honeydew", "hotpink", "indianred", "indigo",
  "ivory", "khaki", "lavender", "lavenderblush", "lawngreen", "lemonchiffon", "lightblue",
  "lightcoral", "lightcyan", "lightgoldenrodyellow", "lightgray", "lightgreen",
  "lightgrey", "lightpink", "lightsalmon", "lightseagreen", "lightskyblue",
  "lightslategray", "lightslategrey", "lightsteelblue", "lightyellow", "lime",
  "limegreen", "linen", "magenta", "maroon", "mediumaquamarine", "mediumblue",
  "mediumorchid", "mediumpurple", "mediumseagreen", "mediumslateblue",
  "mediumspringgreen", "mediumturquoise", "mediumvioletred", "midnightblue", "mintcream",
  "mistyrose", "moccasin", "navajowhite", "navy", "oldlace", "olive", "olivedrab",
  "orange", "orangered", "orchid", "palegoldenrod", "palegreen", "paleturquoise",
  "palevioletred", "papayawhip", "peachpuff", "peru", "pink", "plum", "powderblue",
  "purple", "rebeccapurple", "red", "rosybrown", "royalblue", "saddlebrown", "salmon",
  "sandybrown", "seagreen", "seashell", "sienna", "silver", "skyblue", "slateblue",
  "slategray", "slategrey", "snow", "springgreen", "steelblue", "tan", "teal", "thistle",
  "tomato", "turquoise", "violet", "wheat", "white", "whitesmoke", "yellow",
  "yellowgreen", "transparent", "currentcolor",
];

const PATRON_DE_PALABRA_CLAVE = new RegExp(`\\b(${PALABRAS_CLAVE_DE_COLOR.join("|")})\\b`, "i");

/**
 * ¿El CSS trae un color-keyword en el VALOR de una declaración?
 *
 * Medido: `\bred\b` a secas caza también `white-space` en el NOMBRE de la propiedad
 * (`\bwhite\b` calza contra «white» dentro de «white-space», porque el guion es límite
 * de palabra) y `transparent` dentro de un COMENTARIO explicando por qué el CSS usa
 * `none` en su lugar — ninguno de los dos es un color literal de verdad. Por eso esto
 * primero quita los comentarios, luego se queda solo con el contenido de los bloques
 * `{ … }` (nunca el selector, que es donde vive `:hover`), y dentro de cada declaración
 * mira solo el lado derecho de los `:` — nunca el nombre de la propiedad — y quita solo
 * el TOKEN del custom-property (`--dsw-alias-…`, nunca `var(…)` entero) antes de buscar,
 * para que un alias como `--dsw-alias-label-primary` no pueda arrastrar una palabra
 * clave por casualidad de su propio nombre. Quitar el `var(…)` ENTERO —tentativa
 * anterior— se llevaba también el FALLBACK: `var(--dsw-alias-que-no-existe, red)` colaría
 * limpio, y ese es justo el momento en que un color literal se cuela de verdad: cuando el
 * alias no existe. Dejando el fallback en pie, esta versión sí lo caza.
 */
function tieneColorLiteral(css: string): boolean {
  const sinComentarios = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const bloques = sinComentarios.match(/\{[^{}]*\}/g) ?? [];
  return bloques.some((bloque) =>
    bloque
      .slice(1, -1)
      .split(";")
      .some((declaracion) => {
        const dosPuntos = declaracion.indexOf(":");
        if (dosPuntos === -1) return false;
        const valor = declaracion.slice(dosPuntos + 1).replace(/--[\w-]+/g, "");
        return PATRON_DE_PALABRA_CLAVE.test(valor);
      })
  );
}

describe("disciplina de estilos (heredada de deepseek)", () => {
  it("hay módulos que revisar", () => {
    expect(modulos.length).toBeGreaterThan(0);
  });

  it("ningún componente escribe un color literal: solo alias semánticos", () => {
    for (const m of modulos) {
      const css = readFileSync(join(AQUI, m), "utf8");
      expect(css, m).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(css, m).not.toMatch(/\b(rgb|rgba|hsl|hsla)\s*\(/);
      expect(tieneColorLiteral(css), m).toBe(false);
    }
  });

  it("ningún componente decide el tema: eso es del dueño del tema", () => {
    for (const m of modulos) {
      const css = readFileSync(join(AQUI, m), "utf8");
      expect(css, m).not.toMatch(/prefers-color-scheme/);
      expect(css, m).not.toMatch(/\[data-theme/);
    }
  });

  it("el detector de color-keyword SÍ dispara: si esto no cazara, el test de arriba no probaría nada", () => {
    expect(tieneColorLiteral(".x { color: red; }")).toBe(true);
    expect(tieneColorLiteral(".x { background: transparent; }")).toBe(true);
  });

  it("dispara también dentro del FALLBACK de un var(): es justo ahí donde se cuela un color de verdad, cuando el alias no existe", () => {
    expect(tieneColorLiteral(".x { color: var(--dsw-alias-que-no-existe, red); }")).toBe(true);
  });

  it("el detector NO dispara con falsos positivos ya medidos en este repo: una propiedad con «white» en el nombre y un comentario con «transparent»", () => {
    expect(tieneColorLiteral(".x { white-space: nowrap; }")).toBe(false);
    expect(tieneColorLiteral("/* dice transparent aquí dentro */\n.x { background: none; }")).toBe(false);
  });

  it("el detector no confunde un alias con la palabra que lleva dentro: ningún --dsw-alias-* real contiene una keyword de color como palabra suelta", () => {
    expect(tieneColorLiteral(".x { color: var(--dsw-alias-label-primary); }")).toBe(false);
  });
});
