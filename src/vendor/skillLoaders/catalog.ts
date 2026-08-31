/**
 * Descubrimiento de skills propio, independiente del middleware de deepagents.
 *
 * Existe porque el experimento necesita construir el catálogo y el cuerpo del skill
 * por su cuenta: el middleware interno solo sabe hacerlo de una manera (metadatos al
 * prompt + `read_file` para el cuerpo), y lo que se quiere medir es justo qué pasa
 * cuando se hace de otras.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

export interface SkillInfo {
  name: string;
  description: string;
  /** Cuerpo del SKILL.md sin el frontmatter. */
  content: string;
  /** Directorio del skill, para resolver rutas relativas. */
  dir: string;
  /** Ficheros del skill (sin el SKILL.md), relativos al directorio, ordenados. */
  files: string[];
}

export interface Frontmatter {
  name?: string;
  description?: string;
}

/**
 * Frontmatter YAML mínimo: `clave: valor` de una línea entre delimitadores `---`.
 * No se usa un parser de YAML a propósito — los skills reales solo necesitan esto y
 * una dependencia más sería ruido en un experimento sobre coste de contexto.
 */
export function parseFrontmatter(content: string): { data: Frontmatter; body: string } {
  if (!content.startsWith("---")) return { data: {}, body: content };
  const end = content.indexOf("\n---", 3);
  if (end === -1) return { data: {}, body: content };

  const raw = content.slice(3, end);
  const data: Frontmatter = {};
  for (const line of raw.split("\n")) {
    const i = line.indexOf(":");
    if (i === -1) continue;
    const key = line.slice(0, i).trim();
    const value = line.slice(i + 1).trim();
    if (key === "name") data.name = value;
    else if (key === "description") data.description = value;
  }
  // El cuerpo empieza tras la línea de cierre.
  const after = content.indexOf("\n", end + 1);
  return { data, body: after === -1 ? "" : content.slice(after + 1) };
}

/** Ficheros del skill salvo el propio SKILL.md, en rutas relativas con `/`, ordenadas. */
export function listSkillFiles(dir: string, limit = Infinity): string[] {
  const out: string[] = [];
  const walk = (current: string) => {
    let entries: string[];
    try {
      entries = readdirSync(current);
    } catch {
      return;
    }
    for (const entry of entries.sort()) {
      const full = join(current, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (full !== join(dir, "SKILL.md")) out.push(relative(dir, full).split(sep).join("/"));
    }
  };
  walk(dir);
  return out.sort().slice(0, limit);
}

/** Lee un directorio de skill: frontmatter, cuerpo y ficheros. */
export function loadSkill(dir: string, fileLimit = Infinity): SkillInfo {
  const raw = readFileSync(join(dir, "SKILL.md"), "utf-8");
  const { data, body } = parseFrontmatter(raw);
  const fallback = dir.replace(/[/\\]$/, "").split(/[/\\]/).pop() ?? "skill";
  return {
    name: data.name ?? fallback,
    description: data.description ?? "",
    content: body,
    dir,
    files: listSkillFiles(dir, fileLimit),
  };
}
