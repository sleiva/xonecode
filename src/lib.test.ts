/**
 * La fachada `xonecode/lib`: expone la API de servidor y no arrastra la TUI ni la web.
 *
 * El recorrido de imports es el de `cli/tui/frontera.test.ts` llevado al grafo: no basta mirar
 * el fichero de entrada, porque ink podría llegar por un import de segundo o tercer nivel.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as lib from "./lib.js";

const AQUI = dirname(fileURLToPath(import.meta.url));
const PROHIBIDOS = /^(ink|react|react-dom|vite)(\/|$)/;

/**
 * Especificadores de los imports ESTÁTICOS de VALOR de un fuente: `import … from`, `export … from`
 * e `import "x"`. Se saltan `import type`/`export type` (no existen en runtime) y los `import()`
 * dinámicos (no se cargan al importar el módulo, que es justo lo que se garantiza).
 */
export function importsEstaticosDeValor(fuente: string): string[] {
  const sinComentarios = fuente.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const salida: string[] = [];
  // Con cláusula: `import … from "x"` / `export … from "x"` (puede ocupar varias líneas; la
  // cláusula no lleva comillas ni `;`, así que `export const c = "react"` no casa).
  const conClausula = /^[ \t]*(?:import|export)\b([^"';]*?)\bfrom\s*(["'])([^"']+)\2/gm;
  for (const m of sinComentarios.matchAll(conClausula)) {
    if (/^\s*type\b/.test(m[1] ?? "")) continue;
    salida.push(m[3]!);
  }
  // Efectos laterales: `import "x";` carga el módulo igual sin cláusula.
  for (const m of sinComentarios.matchAll(/^[ \t]*import\s*(["'])([^"']+)\1/gm)) salida.push(m[2]!);
  return salida;
}

/** `./x.js` → `./x.ts` o `./x.tsx`; el que exista. */
function resolverRelativo(desde: string, especificador: string): string | undefined {
  const base = resolve(dirname(desde), especificador);
  const candidatos = base.endsWith(".js")
    ? [base.slice(0, -3) + ".ts", base.slice(0, -3) + ".tsx"]
    : [base + ".ts", base + ".tsx", join(base, "index.ts")];
  return candidatos.find((c) => existsSync(c));
}

/** Paquetes prohibidos que alcanza `entrada` por imports estáticos de valor, con el camino. */
export function prohibidosAlcanzables(entrada: string): string[] {
  const vistos = new Set<string>();
  const hallazgos: string[] = [];
  const pendientes = [entrada];
  while (pendientes.length > 0) {
    const fichero = pendientes.pop()!;
    if (vistos.has(fichero)) continue;
    vistos.add(fichero);
    for (const esp of importsEstaticosDeValor(readFileSync(fichero, "utf8"))) {
      if (esp.startsWith(".")) {
        const destino = resolverRelativo(fichero, esp);
        if (destino) pendientes.push(destino);
      } else if (PROHIBIDOS.test(esp)) {
        hallazgos.push(`${fichero} -> ${esp}`);
      }
    }
  }
  return hallazgos;
}

describe("xonecode/lib", () => {
  it("expone la API de servidor", () => {
    for (const nombre of [
      "conectarStudioDeServidor", "ClientCredentialsProvider", "clienteCloudStudio", "crearRama",
      "descargarProyecto", "prepararRepo", "vaciarCopia", "cambiosPendientes", "subir",
      "ejecutarTareaAutonoma", "Modelos", "VARIABLES_POR_PROVEEDOR", "TOPE_DE_RONDAS_DE_TAREA",
    ]) {
      expect(lib, nombre).toHaveProperty(nombre);
    }
  });

  it("el recorrido ve imports de valor y se salta los de tipo y los dinámicos", () => {
    const fuente = [
      `import { a } from "./a.js";`,
      `import type { T } from "ink";`,
      `export type { U } from "react";`,
      `export { b } from "./b.js";`,
      `import "./efecto.js";`,
      `const x = import("vite");`,
      `export const c = "react";`,
    ].join("\n");
    expect(importsEstaticosDeValor(fuente)).toEqual(["./a.js", "./b.js", "./efecto.js"]);
  });

  it("el recorrido PUEDE fallar: una entrada que llega a ink se detecta", () => {
    // Un fichero real de la TUI importa ink; si el recorrido no lo viera, el test de abajo
    // sería verde siempre.
    const tui = join(AQUI, "cli", "tui", "app.tsx");
    expect(prohibidosAlcanzables(tui).length).toBeGreaterThan(0);
  });

  it("no alcanza ink, react, react-dom ni vite por imports estáticos", () => {
    expect(prohibidosAlcanzables(join(AQUI, "lib.ts"))).toEqual([]);
  });
});
