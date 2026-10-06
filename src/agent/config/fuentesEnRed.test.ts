import { describe, expect, it } from "vitest";
import { fuentesEnRed } from "./fuentesEnRed.js";

const CATALOGO = JSON.stringify({
  familyMetadataList: [
    { family: "Inter", category: "Sans Serif", popularity: 5, fonts: { "400": {}, "700": {} } },
    { family: "Roboto Mono", category: "Monospace", popularity: 20, fonts: { "400": {} } },
  ],
});
const TTF = new Uint8Array([0, 1, 0, 0, ...new Array(20).fill(7)]);
const CSS = (url: string): string => `@font-face { src: url(${url}) format('truetype'); }`;
const GSTATIC = "https://fonts.gstatic.com/s/inter/v20/x.ttf";

/** Un `fetch` doblado por URL: sin red. */
function red(rutas: Record<string, () => Response>) {
  const vistas: string[] = [];
  const llamar = (async (url: string | URL | Request) => {
    const u = String(url);
    vistas.push(u);
    const clave = Object.keys(rutas).find((k) => u.startsWith(k));
    if (clave === undefined) throw new TypeError("fetch failed");
    return rutas[clave]!();
  }) as typeof fetch;
  return { llamar, vistas };
}

describe("fuentesEnRed (con fetch doblado: sin red)", () => {
  it("busca en el catálogo y lo pide UNA vez por puerto", async () => {
    const { llamar, vistas } = red({ "https://fonts.google.com/metadata/fonts": () => new Response(CATALOGO) });
    const f = fuentesEnRed(llamar);
    expect((await f.buscar("inter", 5)).map((x) => x.familia)).toEqual(["Inter"]);
    expect(await f.familia("Roboto Mono")).toEqual({ familia: "Roboto Mono", categoria: "Monospace", estilos: ["400"] });
    expect(await f.familia("Nope")).toBeUndefined();
    expect(vistas).toHaveLength(1);
  });

  it("tolera el prefijo anti-XSSI de antes", async () => {
    const { llamar } = red({ "https://fonts.google.com/metadata/fonts": () => new Response(`)]}'\n${CATALOGO}`) });
    expect(await fuentesEnRed(llamar).buscar("inter", 5)).toHaveLength(1);
  });

  it("un fallo del catálogo NO se guarda: la siguiente vuelve a pedirlo", async () => {
    let veces = 0;
    const llamar = (async () => {
      veces += 1;
      return veces === 1 ? new Response("oops", { status: 503 }) : new Response(CATALOGO);
    }) as typeof fetch;
    const f = fuentesEnRed(llamar);
    await expect(f.buscar("inter", 5)).rejects.toThrow("503");
    expect(await f.buscar("inter", 5)).toHaveLength(1);
  });

  it("trae el .ttf: css2 con el eje y luego el fichero de gstatic", async () => {
    const { llamar, vistas } = red({
      "https://fonts.googleapis.com/css2": () => new Response(CSS(GSTATIC)),
      [GSTATIC]: () => new Response(TTF),
    });
    const bytes = await fuentesEnRed(llamar).ttf("Inter", 700, false);
    expect(Array.from(bytes)).toEqual(Array.from(TTF));
    expect(vistas[0]).toBe("https://fonts.googleapis.com/css2?family=Inter:wght@700");
    expect(vistas[1]).toBe(GSTATIC);
  });

  it("un .ttf en otro host NO se pide", async () => {
    const { llamar, vistas } = red({ "https://fonts.googleapis.com/css2": () => new Response(CSS("https://evil.example/x.ttf")) });
    await expect(fuentesEnRed(llamar).ttf("Inter", 700, false)).rejects.toThrow("no devolvió un .ttf");
    expect(vistas).toHaveLength(1);
  });

  it("lo que no es TrueType se rechaza", async () => {
    const { llamar } = red({
      "https://fonts.googleapis.com/css2": () => new Response(CSS(GSTATIC)),
      [GSTATIC]: () => new Response("<html>no</html>"),
    });
    await expect(fuentesEnRed(llamar).ttf("Inter", 700, false)).rejects.toThrow("TrueType");
  });

  it("un tamaño declarado por encima del tope se rechaza sin leer el cuerpo", async () => {
    const { llamar } = red({
      "https://fonts.googleapis.com/css2": () => new Response(CSS(GSTATIC)),
      [GSTATIC]: () => new Response(TTF, { headers: { "content-length": String(50 * 1024 * 1024) } }),
    });
    await expect(fuentesEnRed(llamar).ttf("Inter", 700, false)).rejects.toThrow("tope");
  });

  it("un 400 (peso que no existe) dice el código y no la URL", async () => {
    const { llamar } = red({ "https://fonts.googleapis.com/css2": () => new Response("bad", { status: 400 }) });
    const p = fuentesEnRed(llamar).ttf("Inter", 900, false);
    await expect(p).rejects.toThrow("Google Fonts contestó 400");
    await expect(fuentesEnRed(llamar).ttf("Inter", 900, false)).rejects.not.toThrow(/googleapis/);
  });

  it("sin red lo dice, sin filtrar el error de fondo", async () => {
    const { llamar } = red({});
    await expect(fuentesEnRed(llamar).buscar("inter", 5)).rejects.toThrow("no hay red o Google Fonts no responde");
  });
});
