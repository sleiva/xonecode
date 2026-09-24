import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * **`src/` no tiene ciclos de importación**, y esto lo COMPRUEBA en vez de recordarlo.
 *
 * Hubo uno, y costó de ver: `turnoReal.ts` elige el motor e importa a TrueForge, y TrueForge
 * importaba de `turnoReal.ts` el contrato de la sesión, los ficheros del proyecto y las reglas de
 * reparación. Con ESM eso funciona hasta el día en que uno de los dos lee algo del otro al
 * CARGARSE, y entonces lee `undefined` sin un error que lo diga. Se partió en módulos neutrales
 * (`agent/turno/sesionReal.ts`, `ficherosDelProyecto.ts`, `verificacion.ts`) y, medido al
 * hacerlo, era el ÚNICO ciclo de todo `src/` — así que la regla puede ser general.
 *
 * Cuentan los imports de VALOR: un `import type` se borra al compilar y no crea ciclo en
 * ejecución, y un `import()` dinámico es justo la forma legítima de romper uno. Los tests no
 * cuentan: nadie los importa.
 */
const SRC = dirname(fileURLToPath(import.meta.url));

function ficheros(carpeta: string): string[] {
  return readdirSync(carpeta).flatMap((e) => {
    const ruta = join(carpeta, e);
    if (statSync(ruta).isDirectory()) return ficheros(ruta);
    return /\.tsx?$/.test(e) && !/\.test\.tsx?$/.test(e) ? [ruta] : [];
  });
}

/** Los imports de VALOR relativos de un fuente, resueltos a ficheros de la lista. */
function importsDeValor(fuente: string, texto: string, existentes: ReadonlySet<string>): string[] {
  const deps: string[] = [];
  for (const m of texto.matchAll(/^(import|export)\s+([^;]*?)\s+from\s+"(\.[^"]+)"/gms)) {
    const clausula = m[2]!;
    // `import type {…}` / `export type {…}`: se borran al compilar.
    if (/^type\b/.test(clausula)) continue;
    // `import { type A, type B }`: todos los nombres son de tipo, así que tampoco queda nada.
    const nombres = /^\{([\s\S]*)\}$/.exec(clausula.trim())?.[1];
    if (nombres !== undefined && nombres.split(",").every((n) => n.trim() === "" || /^type\s/.test(n.trim()))) continue;
    const base = resolve(dirname(fuente), m[3]!).replace(/\.js$/, "");
    const destino = [`${base}.ts`, `${base}.tsx`].find((c) => existentes.has(c));
    if (destino !== undefined) deps.push(destino);
  }
  return deps;
}

/** Los ciclos (componentes fuertemente conexos de más de un nodo, o un nodo que se importa). */
function ciclosDe(grafo: ReadonlyMap<string, readonly string[]>): string[][] {
  let contador = 0;
  const indice = new Map<string, number>();
  const bajo = new Map<string, number>();
  const pila: string[] = [];
  const enPila = new Set<string>();
  const ciclos: string[][] = [];
  const visitar = (v: string): void => {
    indice.set(v, contador);
    bajo.set(v, contador);
    contador += 1;
    pila.push(v);
    enPila.add(v);
    for (const w of grafo.get(v) ?? []) {
      if (!indice.has(w)) {
        visitar(w);
        bajo.set(v, Math.min(bajo.get(v)!, bajo.get(w)!));
      } else if (enPila.has(w)) bajo.set(v, Math.min(bajo.get(v)!, indice.get(w)!));
    }
    if (bajo.get(v) === indice.get(v)) {
      const componente: string[] = [];
      let w: string;
      do {
        w = pila.pop()!;
        enPila.delete(w);
        componente.push(w);
      } while (w !== v);
      if (componente.length > 1 || (grafo.get(v) ?? []).includes(v)) ciclos.push(componente.sort());
    }
  };
  for (const v of grafo.keys()) if (!indice.has(v)) visitar(v);
  return ciclos;
}

describe("src/ no tiene ciclos de importación", () => {
  it("ninguno, en todo el árbol", () => {
    const todos = ficheros(SRC);
    const existentes = new Set(todos);
    const grafo = new Map(todos.map((f) => [f, importsDeValor(f, readFileSync(f, "utf8"), existentes)]));
    const ciclos = ciclosDe(grafo).map((c) => c.map((f) => relative(SRC, f)));
    expect(ciclos).toEqual([]);
  });

  it("el detector ve el ciclo de siempre, y no cuenta los `import type`", () => {
    const a = "/x/a.ts";
    const b = "/x/b.ts";
    const existentes = new Set([a, b]);
    expect(importsDeValor(a, 'import { f } from "./b.js";', existentes)).toEqual([b]);
    expect(importsDeValor(a, 'import type { T } from "./b.js";', existentes)).toEqual([]);
    expect(importsDeValor(a, 'import { type T, type U } from "./b.js";', existentes)).toEqual([]);
    expect(importsDeValor(a, 'import { type T, f } from "./b.js";', existentes)).toEqual([b]);
    expect(importsDeValor(a, 'import {\n  f,\n  g,\n} from "./b.js";', existentes)).toEqual([b]);
    expect(importsDeValor(a, 'export { f } from "./b.js";', existentes)).toEqual([b]);
    expect(ciclosDe(new Map([[a, [b]], [b, [a]]]))).toEqual([[a, b]]);
    expect(ciclosDe(new Map([[a, [b]], [b, []]]))).toEqual([]);
  });
});
