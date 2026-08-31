import { readdirSync, existsSync, readFileSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseFrontmatter } from "../vendor/skillLoaders/catalog.js";
import type { SkillInfo, SkillsPort } from "../core/ports.js";

/**
 * Dónde viven las skills.
 *
 * Dos niveles arriba, y sirve igual desde `src/` (con tsx) que desde `dist/`: los dos
 * cuelgan de la raíz del repo, así que `../../skills` acierta en ambos.
 *
 * Se resuelve contra ESTE módulo y no contra el cwd: en la v1 el cwd es el proyecto del
 * cliente, así que un `./skills` relativo apuntaría al proyecto del usuario y el catálogo
 * saldría vacío sin que nadie supiera por qué.
 */
export const RAIZ_SKILLS = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "skills");

/** Estimación de coste. 4 caracteres por token es la regla de servilleta de siempre. */
export const tokensDe = (texto: string): number => Math.ceil(texto.length / 4);

/**
 * Las skills en disco. NO lleva la marca de doble: son las de verdad.
 *
 * El catálogo se lee UNA vez y se cachea: son seis ficheros que no cambian a mitad de
 * turno, y releerlos por cada consulta convierte el catálogo en E/S dentro del lazo.
 */
export class SkillsEnDisco implements SkillsPort {
  private cache: SkillInfo[] | null = null;

  constructor(private readonly raiz: string = RAIZ_SKILLS) {}

  catalogo(): SkillInfo[] {
    if (this.cache) return this.cache;
    if (!existsSync(this.raiz)) return (this.cache = []);

    const salida: SkillInfo[] = [];
    for (const entrada of readdirSync(this.raiz)) {
      const skillMd = join(this.raiz, entrada, "SKILL.md");
      if (!existsSync(skillMd)) continue;
      try {
        const bruto = readFileSync(skillMd, "utf8");
        const { data } = parseFrontmatter(bruto);
        salida.push({
          nombre: data.name ?? entrada,
          descripcion: data.description ?? "",
          tokens: tokensDe(bruto),
        });
      } catch {
        // Una skill ilegible no puede tumbar el catálogo entero: se queda fuera y las
        // demás siguen. Que falte se ve en `xonecode skills`, que las cuenta.
      }
    }
    return (this.cache = salida.sort((a, b) => a.nombre.localeCompare(b.nombre)));
  }

  cargar(nombre: string): string {
    const skillMd = join(this.raiz, nombre, "SKILL.md");
    if (!existsSync(skillMd)) {
      const hay = this.catalogo().map((s) => s.nombre).join(", ");
      throw new Error(`no hay skill «${nombre}». Las que hay: ${hay || "(ninguna)"}`);
    }
    return readFileSync(skillMd, "utf8");
  }
}