import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { NOMBRES_DE_SEMILLA } from "./temas.js";

const AQUI = dirname(fileURLToPath(import.meta.url));
const ESTILOS = join(AQUI, "..", "estilos");

/** Todas las hojas del cliente, `estilos/` y `src/` enteros. */
function hojasDelCliente(): string[] {
  const salida: string[] = [];
  const recorrer = (dir: string): void => {
    for (const nombre of readdirSync(dir)) {
      const ruta = join(dir, nombre);
      if (statSync(ruta).isDirectory()) recorrer(ruta);
      else if (nombre.endsWith(".css")) salida.push(ruta);
    }
  };
  recorrer(ESTILOS);
  recorrer(AQUI);
  return salida;
}

function sinComentarios(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/** Los alias USADOS sin fallback: `var(--dsw-alias-x)`. Uno con fallback (`font-mono`) no se cuenta. */
function aliasUsados(css: string): Set<string> {
  const usados = new Set<string>();
  for (const m of sinComentarios(css).matchAll(/var\(\s*--dsw-alias-([a-z0-9-]+)\s*\)/g)) usados.add(m[1]!);
  return usados;
}

function aliasDefinidos(css: string): Set<string> {
  const definidos = new Set<string>();
  for (const m of sinComentarios(css).matchAll(/--dsw-alias-([a-z0-9-]+)\s*:/g)) definidos.add(m[1]!);
  return definidos;
}

/**
 * Un alias que no existe no da error: resuelve a nada, y el borde no se pinta, el fondo sale
 * transparente y la letra se hereda. Es el fallo mudo contra el que este cliente escribe sus
 * tests de estilo. Se mira aquí y no en `Barra.test.tsx` porque aquello es sobre LITERALES.
 */
describe("los alias que usa el cliente existen", () => {
  it("todo var(--dsw-alias-…) sin fallback está definido en alguna hoja", () => {
    const hojas = hojasDelCliente().map((r) => ({ ruta: r, css: readFileSync(r, "utf8") }));
    const definidos = new Set<string>();
    for (const h of hojas) for (const a of aliasDefinidos(h.css)) definidos.add(a);
    const faltan: string[] = [];
    for (const h of hojas) {
      for (const a of aliasUsados(h.css)) if (!definidos.has(a)) faltan.push(`${a} (${h.ruta.split("apps/web/")[1]})`);
    }
    expect(faltan).toEqual([]);
  });
});

const PUENTE = (): string => sinComentarios(readFileSync(join(ESTILOS, "temas.css"), "utf8"));
const declarados = (prefijo: string, css: string): Set<string> =>
  new Set([...css.matchAll(new RegExp(`--${prefijo}([a-z0-9-]+)\\s*:`, "g"))].map((m) => m[1]!));

/**
 * Un tema que deja un alias sin redefinir lo pinta con el color de XOneCode, sin avisar: un
 * borde navy en Dracula, un fondo blanco en One Dark. Por eso no basta con «se ve bien»: el
 * puente tiene que cubrir CADA alias que la interfaz usa, y uno nuevo que alguien use mañana
 * da rojo aquí.
 */
describe("el puente de temas", () => {
  it("redefine cada alias --dsw-alias-* que usa el cliente", () => {
    const enElPuente = declarados("dsw-alias-", PUENTE());
    const faltan = new Set<string>();
    for (const ruta of hojasDelCliente()) {
      if (ruta.endsWith("temas.css")) continue;
      for (const a of aliasUsados(readFileSync(ruta, "utf8"))) if (!enElPuente.has(a)) faltan.add(a);
    }
    expect([...faltan].sort()).toEqual([]);
  });

  it("redefine cada --dsw-specific-* que usa el cliente (el fondo de la barra lateral, por ejemplo)", () => {
    const enElPuente = declarados("dsw-specific-", PUENTE());
    const faltan = new Set<string>();
    let alias = 0;
    for (const ruta of hojasDelCliente()) {
      if (ruta.endsWith("temas.css")) continue;
      const css = readFileSync(ruta, "utf8");
      alias += aliasUsados(css).size;
      for (const m of sinComentarios(css).matchAll(/var\(\s*--dsw-specific-([a-z0-9-]+)\s*\)/g)) {
        if (!enElPuente.has(m[1]!)) faltan.add(m[1]!);
      }
    }
    // Guarda contra el vacío: si el recorrido no encuentra hojas, «no falta nada» no prueba nada.
    expect(alias).toBeGreaterThan(0);
    expect([...faltan].sort()).toEqual([]);
  });

  it("redefine cada --xonecode-* que usa el cliente, salvo las excepciones declaradas", () => {
    // Un `--xonecode-*` con color que el puente no toca se queda con el valor de XOneCode
    // dentro de un tema: la misma trampa muda que los alias, con otro prefijo.
    const EXCEPCIONES: Record<string, string> = {
      "gasto-": "validados con dataviz contra el fondo de cada modo: no se puentean (límite declarado)",
      "splash-": "presentación de marca, ajena al tema",
      "barra-placa": "la placa del símbolo es blanca siempre, resuelve en :root",
      angulo: "un ángulo de degradado, no es un color",
      "icono-copiar": "una máscara SVG, no es un color",
    };
    const excepcion = (n: string): boolean =>
      Object.keys(EXCEPCIONES).some((k) => (k.endsWith("-") ? n.startsWith(k) : n === k));
    const enElPuente = declarados("xonecode-", PUENTE());
    const faltan = new Set<string>();
    let vistos = 0;
    for (const ruta of hojasDelCliente()) {
      if (ruta.endsWith("temas.css")) continue;
      for (const m of sinComentarios(readFileSync(ruta, "utf8")).matchAll(/var\(\s*--xonecode-([a-z0-9-]+)\s*\)/g)) {
        vistos++;
        if (!enElPuente.has(m[1]!) && !excepcion(m[1]!)) faltan.add(m[1]!);
      }
    }
    expect(vistos).toBeGreaterThan(0);
    expect([...faltan].sort()).toEqual([]);
  });

  it("redefine el resaltado de código entero", () => {
    const shiki = declarados("shiki-", sinComentarios(readFileSync(join(ESTILOS, "shiki.css"), "utf8")));
    const enElPuente = declarados("shiki-", PUENTE());
    expect([...shiki].filter((v) => !enElPuente.has(v))).toEqual([]);
  });

  it("no lleva colores literales: solo semillas, color-mix y transparent", () => {
    const css = PUENTE();
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(css).not.toMatch(/\b(rgb|rgba|hsl|hsla)\s*\(/);
    const palabras = css.replace(/--[\w-]+/g, "").match(/\b[a-z]+\b/g) ?? [];
    const colores = palabras.filter((p) => ["white", "black", "red", "green", "blue", "gray", "grey", "currentcolor"].includes(p));
    expect(colores).toEqual([]);
  });

  it("solo usa semillas que existen", () => {
    const usadas = new Set([...PUENTE().matchAll(/var\(--tema-([a-zA-Z0-9]+)\)/g)].map((m) => m[1]!));
    const nombres = new Set<string>(NOMBRES_DE_SEMILLA);
    expect([...usadas].filter((u) => !nombres.has(u))).toEqual([]);
  });
});
