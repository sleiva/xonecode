import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

import { carpetaDelPluginDeSkills, manifiestoDelPluginDeSkills, montarPluginDeSkills } from "./pluginDeSkills.js";

let casa: string;
let raiz: string;

/** Una skill del PROYECTO, que es la única raíz que un test puede plantar sin tocar ni el
 *  paquete instalado ni la casa de quien corre el suite. */
function skillDeProyecto(nombre: string): string {
  const dir = join(raiz, ".xonecode", "skills", nombre);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "SKILL.md"), `---\nname: ${nombre}\ndescription: la de ${nombre}\n---\n\ncuerpo\n`);
  return dir;
}

beforeEach(() => {
  casa = mkdtempSync(join(tmpdir(), "xonecode-plugin-"));
  raiz = mkdtempSync(join(tmpdir(), "xonecode-proy-"));
});

describe("el manifiesto", () => {
  it("apunta sus skills a la SUBCARPETA, no a una raíz suelta", () => {
    // La carpeta de montaje FUNDE las tres raíces con la precedencia de `cargarSkills`; una
    // ruta suelta solo podría apuntar a una de ellas.
    const m = JSON.parse(manifiestoDelPluginDeSkills());
    expect(m.skills).toBe("./skills/");
  });

  it("y su nombre es el que acaba prefijando cada skill", () => {
    // Claude Code las nombra `<plugin>:<skill>`, así que este nombre es dato del producto.
    expect(JSON.parse(manifiestoDelPluginDeSkills()).name).toBe("xonecode");
  });
});

describe("montarPluginDeSkills", () => {
  it("deja el manifiesto y un ENLACE por skill, nunca una copia", () => {
    // Las de serie pesan megas y esto se monta en cada arranque de un subagente externo.
    const dir = skillDeProyecto("mi-skill");
    const carpeta = montarPluginDeSkills({ casa, raiz });

    expect(carpeta).toBe(carpetaDelPluginDeSkills(casa));
    expect(existsSync(join(carpeta!, ".claude-plugin", "plugin.json"))).toBe(true);
    const enlace = join(carpeta!, "skills", "mi-skill");
    expect(lstatSync(enlace).isSymbolicLink()).toBe(true);
    expect(readFileSync(join(enlace, "SKILL.md"), "utf8")).toContain("la de mi-skill");
    expect(dir).toContain("mi-skill");
  });

  it("la carpeta se RECREA: una skill borrada deja de anunciarse", () => {
    // Sin recrear, quedaría un enlace roto anunciando una skill que ya no está — el ajuste
    // viejo que sobrevive a su dueño.
    skillDeProyecto("se-va");
    montarPluginDeSkills({ casa, raiz });
    expect(readdirSync(join(carpetaDelPluginDeSkills(casa), "skills"))).toContain("se-va");

    // Otro proyecto, sin esa skill: al remontar no puede quedar rastro del anterior.
    const otra = mkdtempSync(join(tmpdir(), "xonecode-proy2-"));
    raiz = otra;
    skillDeProyecto("la-nueva");
    montarPluginDeSkills({ casa, raiz: otra });
    const montadas = readdirSync(join(carpetaDelPluginDeSkills(casa), "skills"));
    expect(montadas).toContain("la-nueva");
    expect(montadas).not.toContain("se-va");
  });

  it("un fallo al montar NO tumba el turno: devuelve ausente y el hijo arranca sin plugin", () => {
    // Esto cuelga del arranque de un subagente, y escribir en la casa del usuario puede
    // fallar por mil motivos que no son culpa del trabajo que se está haciendo.
    const fichero = join(casa, "estorbo");
    mkdirSync(casa, { recursive: true });
    writeFileSync(fichero, "no soy una carpeta");
    expect(montarPluginDeSkills({ casa: fichero, raiz })).toBeUndefined();
  });
});
