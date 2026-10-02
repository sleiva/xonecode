import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

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
