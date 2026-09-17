import { describe, it, expect } from "vitest";
import {
  escribirSkill,
  fusionarSkills,
  leerSkill,
  motivoDeNombreDeSkillInaceptable,
  tokensDeSkill,
  type SkillCargada,
} from "./skills.js";

const cargada = (nombre: string, origen: SkillCargada["origen"], descripcion = "d"): SkillCargada => ({
  nombre,
  descripcion,
  cuerpo: "c",
  origen,
  tokens: 1,
  ficheros: [],
});

describe("escribirSkill", () => {
  it("compone el frontmatter que deepagents sabe leer", () => {
    const texto = escribirSkill({ nombre: "mia", descripcion: "para X", cuerpo: "Haz esto." });
    expect(texto.startsWith("---\nname: mia\ndescription: para X\n---\n")).toBe(true);
    expect(texto).toContain("Haz esto.");
  });

  it("aplana la descripción a UNA línea", () => {
    // Un salto ahí parte la clave en dos y la segunda mitad se pierde en silencio: el
    // frontmatter es `clave: valor` de una línea, aquí y en deepagents.
    const texto = escribirSkill({ nombre: "mia", descripcion: "una\ndos", cuerpo: "x" });
    expect(texto).toContain("description: una dos");
    expect(leerSkill(texto, "mia", "global")).toEqual({
      skill: expect.objectContaining({ descripcion: "una dos" }),
    });
  });

  it("ida y vuelta: lo que se escribe es lo que se lee", () => {
    const texto = escribirSkill({ nombre: "mia", descripcion: "para X", cuerpo: "Cuerpo\ncon dos líneas." });
    const leida = leerSkill(texto, "mia", "proyecto");
    expect("error" in leida).toBe(false);
    if ("error" in leida) return;
    expect(leida.skill.descripcion).toBe("para X");
    expect(leida.skill.cuerpo).toBe("Cuerpo\ncon dos líneas.");
  });
});

describe("leerSkill", () => {
  it("el nombre sale de la CARPETA, no del frontmatter", () => {
    // Si mandara el `name:`, `rutasDeSkills` apuntaría a una carpeta que no existe: la ruta
    // virtual `/skills/<nombre>/` ya está decidida por dónde vive el fichero.
    const leida = leerSkill("---\nname: otra\ndescription: d\n---\n\nx", "la-de-verdad", "global");
    expect("error" in leida).toBe(false);
    if ("error" in leida) return;
    expect(leida.skill.nombre).toBe("la-de-verdad");
  });

  it("sin description NO se carga, y dice por qué", () => {
    // Es lo que el modelo lee para decidir si le sirve: sin ella está en el catálogo y no la
    // usa nadie nunca, que es peor que no estar.
    const leida = leerSkill("---\nname: mia\n---\n\nx", "mia", "global");
    expect(leida).toEqual({ error: expect.stringContaining("description") });
  });

  it("un fichero sin frontmatter tampoco, y no se inventa una descripción", () => {
    expect(leerSkill("# Solo prosa", "mia", "global")).toEqual({ error: expect.any(String) });
  });

  it("los tokens cuentan el fichero ENTERO, frontmatter incluido", () => {
    const texto = "---\nname: mia\ndescription: d\n---\n\nx";
    const leida = leerSkill(texto, "mia", "global");
    if ("error" in leida) throw new Error("debía cargar");
    expect(leida.skill.tokens).toBe(tokensDeSkill(texto));
  });
});

describe("fusionarSkills", () => {
  it("la última gana: proyecto tapa a global y las dos a la de serie", () => {
    const fundidas = fusionarSkills(
      [cargada("x", "serie", "de serie")],
      [cargada("x", "global", "global")],
      [cargada("x", "proyecto", "del proyecto")]
    );
    expect(fundidas).toHaveLength(1);
    expect(fundidas[0]!.origen).toBe("proyecto");
  });

  it("y sin la del proyecto, gana la global", () => {
    const fundidas = fusionarSkills([cargada("x", "serie")], [cargada("x", "global")]);
    expect(fundidas[0]!.origen).toBe("global");
  });

  it("ordena por nombre: la lista se pinta tal cual", () => {
    const fundidas = fusionarSkills([cargada("z", "serie"), cargada("a", "serie")]);
    expect(fundidas.map((s) => s.nombre)).toEqual(["a", "z"]);
  });
});

describe("motivoDeNombreDeSkillInaceptable", () => {
  it("es LA MISMA regla que la de un subagente: un slug", () => {
    // Dos reglas para el mismo tipo de nombre es donde divergen. El nombre de una skill es
    // un segmento de ruta Y lo que un subagente declara en su `.md`.
    expect(motivoDeNombreDeSkillInaceptable("mi-skill")).toBeUndefined();
    expect(motivoDeNombreDeSkillInaceptable("Mi Skill")).toBeDefined();
    expect(motivoDeNombreDeSkillInaceptable("../fuera")).toBeDefined();
  });
});

describe("el frontmatter se conserva", () => {
  const CON_EXTRAS = [
    "---",
    "name: archify",
    "description: hace diagramas",
    "license: MIT",
    "metadata:",
    '  version: "2.17"',
    "  author: tt-a1i",
    "---",
    "",
    "CUERPO",
  ].join("\n");

  it("`leerSkill` lo devuelve CRUDO, y eso es lo que la ficha enseña", () => {
    // `description` no es lo único que puede haber ahí, y una ventana que solo la enseñe
    // haría creer que eso es todo lo que el fichero dice.
    const leida = leerSkill(CON_EXTRAS, "archify", "serie");
    if ("error" in leida) throw new Error("debía cargar");
    expect(leida.skill.frontmatter).toBe(
      'name: archify\ndescription: hace diagramas\nlicense: MIT\nmetadata:\n  version: "2.17"\n  author: tt-a1i'
    );
  });

  it("guardar NO borra las claves que no entendemos, ni un bloque anidado entero", () => {
    // La pérdida muda de siempre, y encima sobre un fichero que el usuario escribió él:
    // abrir la ventana y pulsar Guardar le vaciaba el `license` y el `metadata`.
    const leida = leerSkill(CON_EXTRAS, "archify", "serie");
    if ("error" in leida) throw new Error("debía cargar");
    const reescrita = escribirSkill({ ...leida.skill, descripcion: "otra cosa" });

    expect(reescrita).toContain("license: MIT");
    expect(reescrita).toContain("metadata:");
    expect(reescrita).toContain('  version: "2.17"');
    expect(reescrita).toContain("  author: tt-a1i");
    // Y `name`/`description` se reescriben UNA vez, no se duplican con los de antes.
    expect(reescrita.match(/^description:/gm)).toHaveLength(1);
    expect(reescrita.match(/^name:/gm)).toHaveLength(1);
    expect(reescrita).toContain("description: otra cosa");
    expect(reescrita).not.toContain("hace diagramas");
  });

  it("y una descripción de VARIAS líneas no arrastra las claves de abajo", () => {
    // Las líneas indentadas van con la clave que las abre: así se salta un bloque anidado
    // entero sin entender YAML. La prueba es que saltar `description` no se coma `license`.
    const conBloque = "---\nname: x\ndescription: |\n  una\n  dos\nlicense: MIT\n---\n\nC";
    const leida = leerSkill(conBloque, "x", "global");
    // Sin `description` legible en una línea no se carga, que es la regla de siempre.
    expect("error" in leida).toBe(false);
    if ("error" in leida) return;
    const reescrita = escribirSkill({ ...leida.skill, descripcion: "plana" });
    expect(reescrita).toContain("license: MIT");
    expect(reescrita).not.toContain("  una");
  });

  it("una skill NUEVA (sin frontmatter previo) sale con el mínimo", () => {
    const texto = escribirSkill({ nombre: "mia", descripcion: "d", cuerpo: "x" });
    expect(texto).toBe("---\nname: mia\ndescription: d\n---\n\nx");
  });
});
