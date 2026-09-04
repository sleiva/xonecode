/**
 * La frontera del cliente web: react, react-dom, vite y el DOM viven SOLO en `apps/web/`.
 *
 * Misma regla y mismo motivo que `cli/tui/frontera.test.ts` con ink: el host tiene que
 * poder correr sin navegador y sin build, y `npm test` sin TTY. Un import de react-dom en
 * `src/` rompería las dos cosas a la vez.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

// Mismo detector que `cli/tui/frontera.test.ts`, y por el mismo motivo: un `from "…"`
// a secas se pierde la forma de efectos laterales (`import "react-dom/client";`, que
// carga el módulo igual sin cláusula from) y la dinámica (`import("vite")`). El brief
// original de esta tarea solo miraba `from`; se amplía aquí a las tres formas para que
// la frontera no tenga un punto ciego que la hermana de `cli/tui/` ya sabía cubrir.
function importaciones(fuente: string): string[] {
  const encontradas: string[] = [];
  const linea = /(from\s*|import\s*\(\s*|^\s*import\s*)(["'])([^"']*)\2/gm;
  for (const m of fuente.matchAll(linea)) encontradas.push(m[3]);
  return encontradas;
}

const esProhibido = (modulo: string) => /^(react-dom|vite|@vitejs\/)/.test(modulo);
const esDeCliente = (modulo: string) => modulo.includes("apps/web/");

function fuentesDeSrc(carpeta: string): string[] {
  const salida: string[] = [];
  for (const nombre of readdirSync(carpeta)) {
    const ruta = join(carpeta, nombre);
    if (statSync(ruta).isDirectory()) {
      if (nombre === "__oro__" || nombre === "node_modules" || nombre === "dist" || nombre === "tui") continue;
      salida.push(...fuentesDeSrc(ruta));
    } else if (!/\.test\.tsx?$/.test(nombre) && /\.tsx?$/.test(nombre)) {
      salida.push(ruta);
    }
  }
  return salida;
}

describe("frontera del cliente web", () => {
  it("el detector ve las tres formas de import, no solo `from`", () => {
    // Prueba tomada de `cli/tui/frontera.test.ts`: si el detector solo mirase `from`,
    // un `import "react-dom/client";` de efectos laterales colaría sin que el test lo viera.
    expect(importaciones(`import "react-dom/client";\nimport('vite');\nfrom "clsx"`)).toEqual([
      "react-dom/client",
      "vite",
      "clsx",
    ]);
    expect(importaciones(`// import "react-dom/client";\nconst x = "vite";\n`)).toEqual([]);
  });

  const ficheros = fuentesDeSrc(join(RAIZ, "src"));

  it("hay ficheros que revisar (si no, el test no prueba nada)", () => {
    expect(ficheros.length).toBeGreaterThan(20);
  });

  it("react-dom y vite no entran en src/", () => {
    const culpables: string[] = [];
    for (const f of ficheros) {
      const modulos = importaciones(readFileSync(f, "utf8")).filter(esProhibido);
      if (modulos.length > 0) culpables.push(`${f} -> ${modulos.join(", ")}`);
    }
    expect(culpables).toEqual([]);
  });

  it("src/ no importa nada de apps/web/", () => {
    const culpables: string[] = [];
    for (const f of ficheros) {
      const modulos = importaciones(readFileSync(f, "utf8")).filter(esDeCliente);
      if (modulos.length > 0) culpables.push(`${f} -> ${modulos.join(", ")}`);
    }
    expect(culpables).toEqual([]);
  });
});
