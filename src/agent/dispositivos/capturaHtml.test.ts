import { describe, it, expect } from "vitest";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * La regla de `xone-captura-html` (IXCODE-8), que vive en la skill y no en `src/`: la usa un
 * SCRIPT del `device-controller`. Se importa del disco como la de `dispositivoDeSesion.test.ts`.
 *
 * Lo que fija: que la captura NO depende de que Chrome termine —medido, con un perfil nuevo
 * escribe el PNG y no sale—, que Chrome se mata SIEMPRE, y que nunca usa el perfil real.
 */
type Hijo = { pid: number };
type Lib = {
  TOPE_DE_CAPTURA_MS: number;
  argumentosDeCaptura(o: { html: string; png: string; perfil: string; ancho?: number; alto?: number }): string[];
  esperarFicheroEstable(o: {
    ruta: string;
    topeMs?: number;
    cadaMs?: number;
    tamano?: (r: string) => number;
    dormir?: (ms: number) => Promise<void>;
    ahora?: () => number;
  }): Promise<number | undefined>;
  capturarHtml(o: {
    html: string;
    png: string;
    navegador?: string;
    buscarNavegador?: () => string | undefined;
    lanzar?: (navegador: string, args: string[]) => Hijo;
    matar?: (hijo: Hijo) => void;
    esperar?: (o: { ruta: string; topeMs: number }) => Promise<number | undefined>;
    topeMs?: number;
  }): Promise<{ bytes: number } | { error: string }>;
};
const lib = (): Promise<Lib> =>
  import(pathToFileURL(resolve(__dirname, "../../../skills/xone-hotswap/lib/capturaHtml.mjs")).href);

/** Un reloj de pega: cada `dormir` avanza el tiempo en vez de esperarlo. */
function reloj() {
  let t = 0;
  return { ahora: () => t, dormir: async (ms: number) => void (t += ms) };
}

describe("xone-captura-html: capturar sin depender de que Chrome termine (IXCODE-8)", () => {
  it("espera a que el PNG exista con un tamaño que YA NO CAMBIA", async () => {
    const { esperarFicheroEstable } = await lib();
    const lecturas = [-1, -1, 0, 100, 200, 200];
    const r = reloj();
    const bytes = await esperarFicheroEstable({ ruta: "x.png", tamano: () => lecturas.shift() ?? 200, ...r });
    expect(bytes).toBe(200);
  });

  it("si el PNG no aparece, se rinde en su tope y no antes", async () => {
    const { esperarFicheroEstable } = await lib();
    const r = reloj();
    const bytes = await esperarFicheroEstable({ ruta: "x.png", tamano: () => -1, topeMs: 5000, cadaMs: 200, ...r });
    expect(bytes).toBeUndefined();
    expect(r.ahora()).toBeGreaterThanOrEqual(5000);
  });

  it("con captura, MATA a Chrome igual —no sale solo— y borra su perfil temporal", async () => {
    const { capturarHtml } = await lib();
    const dir = mkdtempSync(join(tmpdir(), "xc-captura-"));
    const html = join(dir, "d.html");
    writeFileSync(html, "<h1>hola</h1>");
    const matados: Hijo[] = [];
    let argumentos: string[] = [];
    const r = await capturarHtml({
      html,
      png: join(dir, "d.png"),
      navegador: "/chrome",
      lanzar: (_n, args) => ((argumentos = args), { pid: 42 }),
      matar: (h) => void matados.push(h),
      esperar: async () => 1234,
    });
    expect(r).toEqual({ bytes: 1234 });
    expect(matados).toEqual([{ pid: 42 }]);
    const perfil = argumentos.find((a) => a.startsWith("--user-data-dir="))!.slice("--user-data-dir=".length);
    expect(perfil.startsWith(tmpdir())).toBe(true);
    expect(existsSync(perfil)).toBe(false);
  });

  it("sin captura en el tope: error LEGIBLE, y Chrome muerto igualmente", async () => {
    const { capturarHtml } = await lib();
    const dir = mkdtempSync(join(tmpdir(), "xc-captura-"));
    const html = join(dir, "d.html");
    writeFileSync(html, "<h1>hola</h1>");
    const matados: Hijo[] = [];
    const r = await capturarHtml({
      html,
      png: join(dir, "d.png"),
      navegador: "/chrome",
      lanzar: () => ({ pid: 7 }),
      matar: (h) => void matados.push(h),
      esperar: async () => undefined,
      topeMs: 30_000,
    });
    expect("error" in r && r.error).toMatch(/30 s/);
    expect(matados).toEqual([{ pid: 7 }]);
  });

  it("una captura de ANTES se borra antes de lanzar: no se toma por la nueva", async () => {
    const { capturarHtml } = await lib();
    const dir = mkdtempSync(join(tmpdir(), "xc-captura-"));
    const html = join(dir, "d.html");
    const png = join(dir, "d.png");
    writeFileSync(html, "<h1>hola</h1>");
    writeFileSync(png, "vieja");
    let habiaVieja: boolean | undefined;
    await capturarHtml({
      html,
      png,
      navegador: "/chrome",
      lanzar: () => ((habiaVieja = existsSync(png)), { pid: 1 }),
      matar: () => {},
      esperar: async () => undefined,
    });
    expect(habiaVieja).toBe(false);
  });

  it("sin navegador o sin HTML no lanza nada y lo dice", async () => {
    const { capturarHtml } = await lib();
    let lanzado = false;
    const lanzar = () => ((lanzado = true), { pid: 1 });
    const sinNavegador = await capturarHtml({ html: "/no/existe.html", png: "/tmp/x.png", buscarNavegador: () => undefined, lanzar });
    expect("error" in sinNavegador && sinNavegador.error).toMatch(/Chrome/);
    const sinHtml = await capturarHtml({ html: "/no/existe.html", png: "/tmp/x.png", navegador: "/chrome", lanzar });
    expect("error" in sinHtml && sinHtml.error).toMatch(/no existe/);
    expect(lanzado).toBe(false);
  });

  it("los argumentos: headless a secas (ni `old` ni `new`), perfil propio y la página como file://", async () => {
    const { argumentosDeCaptura } = await lib();
    const args = argumentosDeCaptura({ html: "/a/d.html", png: "/a/d.png", perfil: "/tmp/p" });
    expect(args).toContain("--headless");
    expect(args.some((a) => a.startsWith("--headless="))).toBe(false);
    expect(args).toContain("--user-data-dir=/tmp/p");
    expect(args).toContain("--screenshot=/a/d.png");
    expect(args.at(-1)).toBe("file:///a/d.html");
  });
});
