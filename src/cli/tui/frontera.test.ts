/**
 * La frontera de la TUI: ink y react viven SOLO aquí dentro.
 *
 * La piel stdio y todo el resto de la consola no pueden saber que existe una TUI —
 * igual que `core/imports.test.ts` prohíbe langchain en `core/`. Una TUI es una piel
 * más; si un import de ink se cuela fuera de `cli/tui/`, el fallback de pipes deja de
 * serlo (y `npm test` dejaría de poder correr sin TTY).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

// Este fichero vive en src/cli/tui/, así que tres niveles arriba está la raíz del repo.
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const CASA_TUI = join(RAIZ, "src", "cli", "tui") + sep;

/**
 * Todos los .ts/.tsx de `src/`, excluyendo lo que no es código de producción:
 * los propios tests (este incluido, que cita los paquetes para prohibirlos),
 * el oro (salida del simulador) y residuos de build o dependencias anidadas.
 */
function ficherosDeFuente(carpeta: string): string[] {
  const salida: string[] = [];
  for (const nombre of readdirSync(carpeta)) {
    const ruta = join(carpeta, nombre);
    if (statSync(ruta).isDirectory()) {
      if (nombre === "__oro__" || nombre === "node_modules" || nombre === "dist") continue;
      salida.push(...ficherosDeFuente(ruta));
    } else if (/\.test\.tsx?$/.test(nombre)) {
      continue;
    } else if (nombre.endsWith(".ts") || nombre.endsWith(".tsx")) {
      salida.push(ruta);
    }
  }
  return salida;
}

// `from "ink"`, `from 'react/…'`, `from "ink-testing-library"`, con cualquier
// profundidad de subruta — pero no un paquete que solo CONTENGA la palabra
// (`preact` no es react). Y también la forma dinámica, `import("react")`, y la de
// efectos laterales, `import "ink";` — que carga la librería igual sin cláusula from.
function importacionesTui(fuente: string): string[] {
  const encontradas: string[] = [];
  const linea = /(from\s*|import\s*\(\s*|^\s*import\s*)(["'])([^"']*)\2/gm;
  for (const m of fuente.matchAll(linea)) {
    const modulo = m[3];
    if (/^(ink|react|ink-testing-library)(\/|$)/.test(modulo)) encontradas.push(modulo);
  }
  return encontradas;
}

describe("la frontera de cli/tui/", () => {
  it("el detector ve también la forma de efectos laterales: import \"ink\";", () => {
    // `import "ink";` sin cláusula `from` carga la librería igual — el guardián la
    // tiene que ver, o un import así colaría ink fuera de cli/tui/ sin ser visto.
    expect(importacionesTui(`import "ink";\nimport 'react/jsx-runtime.js';\n`)).toEqual([
      "ink",
      "react/jsx-runtime.js",
    ]);
    // Y no ve sombras: un comentario o un módulo que solo CONTIENE la palabra.
    expect(importacionesTui(`// import "ink";\nconst x = "preact";\n`)).toEqual([]);
  });

  const ficheros = ficherosDeFuente(join(RAIZ, "src"));

  it("hay ficheros que revisar (si no, este test no prueba nada)", () => {
    expect(ficheros.length).toBeGreaterThan(0);
  });

  it("ink y react solo se importan bajo cli/tui/", () => {
    const culpables: string[] = [];
    for (const ruta of ficheros) {
      if (ruta.startsWith(CASA_TUI)) continue;
      const modulos = importacionesTui(readFileSync(ruta, "utf8"));
      if (modulos.length > 0) culpables.push(`${ruta} -> ${modulos.join(", ")}`);
    }
    expect(culpables, `imports de TUI fuera de cli/tui/: ${culpables.join("; ")}`).toEqual([]);
  });
});