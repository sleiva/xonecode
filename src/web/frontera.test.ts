/**
 * La frontera del cliente web: react, react-dom, vite y el DOM viven SOLO en `apps/web/`.
 *
 * Misma regla y mismo motivo que `cli/tui/frontera.test.ts` con ink: el host tiene que
 * poder correr sin navegador y sin build, y `npm test` sin TTY. Un import de react-dom en
 * `src/` rompería las dos cosas a la vez.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
// cli/tui/ es la única carpeta de src/ donde react vive de verdad (por Ink), y esa
// exención ya la razona y vigila `cli/tui/frontera.test.ts`. Pero "react vive aquí" no
// es lo mismo que "cualquier cosa vale aquí": un import de apps/web/ dentro de cli/tui/
// es tan ilegal como en cualquier otro rincón de src/, y hasta esta corrección
// `fuentesDeSrc` saltaba la carpeta entera para las DOS comprobaciones, no solo para la
// de react. Medido: con esa exclusión de más, un `import … from "../../../apps/web/…"`
// metido en `cli/tui/app.tsx` dejaba el test en verde. CASA_TUI limita la exención al
// sitio exacto donde está justificada.
const CASA_TUI = join(RAIZ, "src", "cli", "tui") + sep;
const esDeTui = (ruta: string) => ruta.startsWith(CASA_TUI);

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
      // "tui" NO se salta aquí (a diferencia de la primera versión de este fichero):
      // sus ficheros tienen que entrar en la lista para que el check de apps/web/ los
      // vea. La exención de react-dom/vite se aplica más abajo, por fichero, con
      // `esDeTui` — no recortando la lista entera desde la raíz.
      if (nombre === "__oro__" || nombre === "node_modules" || nombre === "dist") continue;
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

  it("CASA_TUI distingue las dos exenciones: react-dom/vite sí, apps/web/ no", () => {
    // La prueba directa de F1: un fichero de cli/tui/ está exento de la comprobación de
    // react-dom/vite (ahí vive Ink, y esa frontera la vigila `cli/tui/frontera.test.ts`),
    // pero NO de la de apps/web/ — nada justifica que el cliente web entre por ahí. Se
    // prueba la función de clasificación directamente, sin tocar disco, para que el caso
    // quede fijado aunque el árbol real de cli/tui/ nunca llegue a tener la violación.
    const rutaTui = join(CASA_TUI, "app.tsx");
    const conReactDom = 'import { createRoot } from "react-dom/client";';
    const conCliente = 'import { App } from "../../../apps/web/src/App.js";';

    expect(esDeTui(rutaTui)).toBe(true);
    expect(importaciones(conReactDom).filter(esProhibido)).toEqual(["react-dom/client"]);
    expect(importaciones(conCliente).filter(esDeCliente)).toEqual(["../../../apps/web/src/App.js"]);
  });

  const ficheros = fuentesDeSrc(join(RAIZ, "src"));

  it("hay ficheros que revisar (si no, el test no prueba nada)", () => {
    expect(ficheros.length).toBeGreaterThan(20);
  });

  it("hay ficheros de cli/tui/ en la lista (si no, F1 podría volver sin que se note)", () => {
    expect(ficheros.some(esDeTui)).toBe(true);
  });

  it("react-dom y vite no entran en src/, salvo cli/tui/ donde vive Ink", () => {
    const culpables: string[] = [];
    for (const f of ficheros) {
      if (esDeTui(f)) continue;
      const modulos = importaciones(readFileSync(f, "utf8")).filter(esProhibido);
      if (modulos.length > 0) culpables.push(`${f} -> ${modulos.join(", ")}`);
    }
    expect(culpables).toEqual([]);
  });

  it("src/ no importa nada de apps/web/ — cli/tui/ incluido, sin excepción", () => {
    const culpables: string[] = [];
    for (const f of ficheros) {
      const modulos = importaciones(readFileSync(f, "utf8")).filter(esDeCliente);
      if (modulos.length > 0) culpables.push(`${f} -> ${modulos.join(", ")}`);
    }
    expect(culpables).toEqual([]);
  });
});
