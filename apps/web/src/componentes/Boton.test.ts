import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

const AQUI = dirname(fileURLToPath(import.meta.url));
const modulos = readdirSync(AQUI).filter((f) => f.endsWith(".module.css") && f !== "Boton.module.css");

/**
 * `composes` no fusiona declaraciones: aplica DOS clases CSS separadas al elemento, y cuál
 * gana una propiedad que las dos declaran lo decide el ORDEN en el bundle final de Vite —
 * que depende del grafo de imports y NO está garantizado entre ficheros. Medido: `.peligro`
 * llevaba un `padding` propio en `Ajustes.module.css` desde `bc17749` creyendo que ganaba
 * —y ganaba, en ESE build— hasta que centralizar otros cinco botones más cambió el orden
 * del bundle y la regla empezó a perder en silencio. jsdom no lo caza: no mide
 * `getComputedStyle` de un build real, así que este test no prueba el resultado visual,
 * prueba la CAUSA — que ningún consumidor redeclare una propiedad que su rol de
 * `Boton.module.css` ya decide. El tamaño se compone (`secundario grande`), nunca se
 * redeclara.
 */
const PROPIEDADES_PROHIBIDAS = [
  "padding",
  "font-size",
  "font-weight",
  "border",
  "border-color",
  "border-width",
  "border-style",
  "background",
  "background-color",
  "color",
];

const PATRON_COMPOSES = /composes:\s*([\w\s]+?)\s*from\s*["']\.\/Boton\.module\.css["']/;

/** Los bloques `selector { … }` de una hoja, con su selector. */
function bloquesConSelector(css: string): { selector: string; cuerpo: string }[] {
  const sinComentarios = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const bloques: { selector: string; cuerpo: string }[] = [];
  for (const m of sinComentarios.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    bloques.push({ selector: m[1]!.trim(), cuerpo: m[2]! });
  }
  return bloques;
}

/** Los nombres de propiedad declarados en un cuerpo de regla (lado IZQUIERDO de cada `:`). */
function propiedadesDeclaradas(cuerpo: string): string[] {
  return cuerpo
    .split(";")
    .map((d) => d.split(":")[0]?.trim().toLowerCase())
    .filter((p): p is string => Boolean(p));
}

describe("Boton.module.css: composes sin redeclarar", () => {
  it("ningún consumidor redeclara una propiedad que su rol ya decide", () => {
    for (const m of modulos) {
      const css = readFileSync(join(AQUI, m), "utf8");
      for (const { selector, cuerpo } of bloquesConSelector(css)) {
        const composesMatch = cuerpo.match(PATRON_COMPOSES);
        if (composesMatch === null) continue;
        const declaradas = propiedadesDeclaradas(cuerpo);
        const conflicto = declaradas.filter((p) => PROPIEDADES_PROHIBIDAS.includes(p));
        expect(
          conflicto,
          `${m} — «${selector}» compone «${composesMatch[1]}» de Boton.module.css Y redeclara ` +
            `${conflicto.join(", ")}: quién gana depende del orden del bundle, no está garantizado. ` +
            `Añade un tamaño con \`grande\` en el propio \`composes\`, o quítalo si el rol ya sirve.`
        ).toEqual([]);
      }
    }
  });

  it("el detector SÍ dispara: si esto no cazara, el test de arriba no probaría nada", () => {
    const css = `.x {\n  composes: secundario from "./Boton.module.css";\n  padding: 4px 10px;\n}\n`;
    const [{ selector, cuerpo }] = bloquesConSelector(css);
    const composesMatch = cuerpo.match(PATRON_COMPOSES);
    expect(composesMatch).not.toBeNull();
    expect(propiedadesDeclaradas(cuerpo)).toContain("padding");
    expect(selector).toBe(".x");
  });
});
