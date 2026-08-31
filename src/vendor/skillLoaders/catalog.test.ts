import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseFrontmatter, listSkillFiles, loadSkill } from "./catalog.js";

function skillDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "skill-"));
  writeFileSync(
    join(dir, "SKILL.md"),
    "---\nname: demo\ndescription: Un skill de prueba\n---\n\n# Demo\n\ncuerpo\n"
  );
  mkdirSync(join(dir, "topics"));
  writeFileSync(join(dir, "topics", "02-b.md"), "b");
  writeFileSync(join(dir, "topics", "01-a.md"), "a");
  return dir;
}

describe("parseFrontmatter", () => {
  it("extrae name y description y devuelve el cuerpo sin frontmatter", () => {
    const { data, body } = parseFrontmatter("---\nname: x\ndescription: y z\n---\ncuerpo\n");
    expect(data).toEqual({ name: "x", description: "y z" });
    expect(body).toBe("cuerpo\n");
  });

  it("sin frontmatter devuelve el contenido intacto", () => {
    const { data, body } = parseFrontmatter("# hola\n");
    expect(data).toEqual({});
    expect(body).toBe("# hola\n");
  });

  it("ignora claves que no son name ni description", () => {
    const { data } = parseFrontmatter("---\nname: x\nversion: 44\n---\n");
    expect(data).toEqual({ name: "x" });
  });
});

describe("listSkillFiles", () => {
  it("lista los ficheros del skill menos el SKILL.md, ordenados y con / como separador", () => {
    expect(listSkillFiles(skillDir())).toEqual(["topics/01-a.md", "topics/02-b.md"]);
  });

  it("respeta el límite", () => {
    expect(listSkillFiles(skillDir(), 1)).toEqual(["topics/01-a.md"]);
  });
});

describe("loadSkill", () => {
  it("compone nombre, descripción, cuerpo y ficheros", () => {
    const s = loadSkill(skillDir());
    expect(s.name).toBe("demo");
    expect(s.description).toBe("Un skill de prueba");
    expect(s.content).toContain("# Demo");
    expect(s.content).not.toContain("description:");
    expect(s.files).toHaveLength(2);
  });
});
