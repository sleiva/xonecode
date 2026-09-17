import { describe, it, expect } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strToU8, zipSync } from "fflate";
import {
  SkillsEnDisco,
  instalarSkillDesdeZip,
  RAIZ_SKILLS,
  tokensDe,
  borrarSkill,
  cargarSkills,
  esDeSerie,
  guardarSkill,
  rutaDeSkills,
  rutaGlobalDeSkills,
  skillsMontables,
} from "./skills.js";
import { esDoble } from "../../core/ports.js";

describe("SkillsEnDisco", () => {
  it("NO lleva la marca de doble: son las skills de verdad", () => {
    expect(esDoble(new SkillsEnDisco())).toBe(false);
  });

  it("la raíz por omisión existe y es la de `lab/skills/`", () => {
    // Si esto falla, la ruta relativa se ha roto — y el síntoma sería un catálogo
    // vacío sin ningún error, que es el peor modo de fallo posible.
    expect(existsSync(RAIZ_SKILLS)).toBe(true);
    expect(RAIZ_SKILLS.endsWith("/skills")).toBe(true);
  });

  it("encuentra las seis skills de XOne", () => {
    const nombres = new SkillsEnDisco().catalogo().map((s) => s.nombre);
    expect(nombres).toContain("xone-development");
    expect(nombres).toContain("xone-review");
    expect(nombres.length).toBeGreaterThanOrEqual(6);
  });

  it("cada skill trae descripción y un coste en tokens distinto de cero", () => {
    for (const s of new SkillsEnDisco().catalogo()) {
      expect(s.descripcion.length, s.nombre).toBeGreaterThan(0);
      expect(s.tokens, s.nombre).toBeGreaterThan(0);
    }
  });

  it("cargar() devuelve el SKILL.md entero", () => {
    expect(new SkillsEnDisco().cargar("xone-development")).toContain("XOne");
  });

  it("la guía de diagramas de artifacts-builder remite a archify y saca la salida del proyecto", () => {
    const guia = readFileSync(join(RAIZ_SKILLS, "artifacts-builder", "reference", "diagramas.md"), "utf8");
    expect(guia).toContain("`archify`");
    // `/artefactos/` y no `/artifacts/`: la carpeta de la sesión, que no es del proyecto.
    // Escrito en la raíz, un diagrama acaba en git y en CloudStudio — dentro de la app XOne.
    expect(guia).toContain("/artefactos/<nombre>.html");
    expect(guia).not.toContain("/artifacts/");
    expect(guia).toContain("ni en `/skills`");
  });

  it("artifacts-builder NO dice que sin `publish_artifact` no haya sandbox", () => {
    // Decía literalmente que entregando con `write_file` «`localStorage` no lanza ahí», y
    // desde que la consola ABRE los artefactos eso es falso: el visor los pinta en un iframe
    // sin `allow-same-origin`, así que los tres almacenes lanzan `SecurityError` (medido en el
    // navegador, 2026-09-07). Era la afirmación más cara del fichero, porque el modo de fallo
    // que provoca es SILENCIOSO: la página se ve perfecta y el diagrama no llega a dibujarse.
    // Un test y no un comentario, porque este es el sitio donde el modelo mira de verdad.
    const skill = readFileSync(join(RAIZ_SKILLS, "artifacts-builder", "SKILL.md"), "utf8");
    // La negativa NO puede ser la frase vieja: el párrafo corregido la CITA, para decir qué
    // decía antes y por qué era falso. Se vigila la afirmación que solo la versión falsa
    // hacía como guía —«no lo hace cumplir ningún servidor»— y la que la sustituye.
    expect(skill).not.toContain("nada de lo de\narriba lo hace cumplir ningún servidor");
    expect(skill).toContain("el sandbox lo impone el VISOR de la consola");
    expect(skill).toContain("LANZAN `SecurityError`");
    // Y lo que sí es cierto de este camino: al origen de la consola no se llega, así que
    // hornear los datos dentro sigue siendo obligatorio aunque no lo imponga ningún servidor.
    expect(skill).toContain("Al ORIGEN de la consola no se llega");
  });

  it("el sistema visual reserva el cian de marca para lo que habla de la consola", () => {
    // El cian sale de `marca.css` y es ACENTO: en la consola nunca sostiene una letra. Una
    // fila de carácter que lo pusiera de titular sería el aspecto que ese fichero evita, y
    // usarla para el mockup de una pantalla XOne pintaría la app del color del harness.
    const estilo = readFileSync(join(RAIZ_SKILLS, "artifacts-builder", "reference", "estilo.md"), "utf8");
    expect(estilo).toContain("#00a3e0");
    expect(estilo).toContain("solo si el artefacto habla de la CONSOLA");
    // La tipografía de la consola no se puede cargar desde un artefacto: origen opaco.
    expect(estilo).toContain("no se pueden cargar");
  });

  it("una skill que no existe falla diciendo cuáles hay", () => {
    expect(() => new SkillsEnDisco().cargar("no-existe")).toThrow(/xone-development/);
  });

  it("una raíz de proyecto inexistente no rompe: quedan las de serie", () => {
    // El parámetro es la raíz del PROYECTO, no la de las skills: sin proyecto —o con uno que
    // no tiene carpeta de skills— el catálogo sigue siendo el de serie más el global.
    const nombres = new SkillsEnDisco("/no/existe/nada").catalogo().map((s) => s.nombre);
    expect(nombres).toContain("xone-development");
  });

  it("tokensDe estima por caracteres", () => {
    expect(tokensDe("abcd")).toBe(1);
    expect(tokensDe("")).toBe(0);
  });
});

/** Un proyecto de mentira con su carpeta de skills, en un temporal. */
function proyecto(): string {
  return mkdtempSync(join(tmpdir(), "skills-proy-"));
}

/** Escribe una skill a mano, saltándose `guardarSkill`: así se prueba el LECTOR solo. */
function aMano(carpeta: string, nombre: string, descripcion: string, cuerpo = "x"): string {
  const dir = join(carpeta, nombre);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "SKILL.md"), `---\nname: ${nombre}\ndescription: ${descripcion}\n---\n\n${cuerpo}\n`);
  return dir;
}

describe("cargarSkills", () => {
  it("funde las tres raíces y dice de dónde sale cada una", () => {
    const raiz = proyecto();
    aMano(rutaGlobalDeSkills(), "la-global", "una global");
    aMano(rutaDeSkills(raiz), "la-del-proyecto", "una del proyecto");

    const { skills } = cargarSkills(raiz);
    const porNombre = new Map(skills.map((s) => [s.nombre, s]));
    expect(porNombre.get("archify")?.origen).toBe("serie");
    expect(porNombre.get("la-global")?.origen).toBe("global");
    expect(porNombre.get("la-del-proyecto")?.origen).toBe("proyecto");
  });

  it("una del proyecto tapa a la global del mismo nombre, y eso no es un problema", () => {
    const raiz = proyecto();
    aMano(rutaGlobalDeSkills(), "misma", "la global");
    aMano(rutaDeSkills(raiz), "misma", "la del proyecto");

    const { skills, problemas } = cargarSkills(raiz);
    expect(skills.filter((s) => s.nombre === "misma")).toHaveLength(1);
    expect(skills.find((s) => s.nombre === "misma")?.origen).toBe("proyecto");
    // Tapar es la forma de afinar una skill sin editar donde el `npm install` la pisaría:
    // `problemas` sigue significando solo «este fichero no carga».
    expect(problemas).toEqual([]);
  });

  it("una rota se salta con su motivo, y las demás siguen", () => {
    const raiz = proyecto();
    const dir = join(rutaDeSkills(raiz), "rota");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "SKILL.md"), "sin frontmatter ninguno");
    aMano(rutaDeSkills(raiz), "buena", "esta sí");

    const { skills, problemas } = cargarSkills(raiz);
    expect(skills.map((s) => s.nombre)).toContain("buena");
    expect(skills.map((s) => s.nombre)).not.toContain("rota");
    expect(problemas.join(" ")).toContain("rota");
  });

  it("una carpeta sin SKILL.md se dice, en vez de desaparecer", () => {
    const raiz = proyecto();
    mkdirSync(join(rutaDeSkills(raiz), "vacia"), { recursive: true });
    expect(cargarSkills(raiz).problemas.join(" ")).toContain("vacia");
  });

  it("apunta los ficheros que acompañan al SKILL.md, sin su contenido", () => {
    const raiz = proyecto();
    const dir = aMano(rutaDeSkills(raiz), "con-anexos", "d");
    mkdirSync(join(dir, "reference"), { recursive: true });
    writeFileSync(join(dir, "reference", "guia.md"), "…");

    const skill = cargarSkills(raiz).skills.find((s) => s.nombre === "con-anexos");
    expect(skill?.ficheros).toEqual(["reference/guia.md"]);
  });

  it("sin proyecto abierto quedan las de serie y las globales", () => {
    aMano(rutaGlobalDeSkills(), "solo-global", "d");
    const nombres = cargarSkills().skills.map((s) => s.nombre);
    expect(nombres).toContain("solo-global");
    expect(nombres).toContain("archify");
  });
});

describe("skillsMontables", () => {
  it("solo las del usuario: las de serie ya las cubre la raíz entera", () => {
    const raiz = proyecto();
    aMano(rutaGlobalDeSkills(), "mia", "d");
    const nombres = skillsMontables(raiz).map((m) => m.nombre);
    expect(nombres).toContain("mia");
    expect(nombres).not.toContain("archify");
  });

  it("y con el mismo nombre en las dos carpetas, monta la del PROYECTO", () => {
    const raiz = proyecto();
    aMano(rutaGlobalDeSkills(), "misma", "d");
    const delProyecto = aMano(rutaDeSkills(raiz), "misma", "d");
    expect(skillsMontables(raiz).find((m) => m.nombre === "misma")?.dir).toBe(delProyecto);
  });
});

describe("guardarSkill", () => {
  it("escribe el SKILL.md y la deja cargable", () => {
    const raiz = proyecto();
    expect(guardarSkill(raiz, { nombre: "mia", descripcion: "para X", cuerpo: "Haz esto." })).toEqual({ ok: true });
    const skill = cargarSkills(raiz).skills.find((s) => s.nombre === "mia");
    expect(skill?.descripcion).toBe("para X");
    expect(skill?.cuerpo).toBe("Haz esto.");
  });

  it("un nombre de una de SERIE es un NO, y ofrece el camino", () => {
    // Editar una de serie no se puede —vive en el paquete y el `npm install` se la lleva—,
    // así que lo que hay es copiarla. El motivo lo DICE.
    const resultado = guardarSkill(proyecto(), { nombre: "archify", descripcion: "d", cuerpo: "x" });
    expect(resultado).toEqual({ error: expect.stringContaining("cópiala") });
  });

  it("un destino que ya existe es un NO, sea de quien sea", () => {
    const raiz = proyecto();
    guardarSkill(raiz, { nombre: "mia", descripcion: "d", cuerpo: "x" });
    expect(guardarSkill(raiz, { nombre: "mia", descripcion: "otra", cuerpo: "y" })).toEqual({
      error: expect.stringContaining("ya hay"),
    });
  });

  it("editar la misma NO es un destino que existe", () => {
    const raiz = proyecto();
    guardarSkill(raiz, { nombre: "mia", descripcion: "d", cuerpo: "x" });
    expect(guardarSkill(raiz, { nombre: "mia", descripcion: "d2", cuerpo: "y" }, "mia")).toEqual({ ok: true });
    expect(cargarSkills(raiz).skills.find((s) => s.nombre === "mia")?.descripcion).toBe("d2");
  });

  it("renombrar MUEVE: deja UNA carpeta y no dos con el mismo cuerpo", () => {
    const raiz = proyecto();
    guardarSkill(raiz, { nombre: "vieja", descripcion: "d", cuerpo: "x" });
    expect(guardarSkill(raiz, { nombre: "nueva", descripcion: "d", cuerpo: "x" }, "vieja")).toEqual({ ok: true });
    const nombres = cargarSkills(raiz).skills.map((s) => s.nombre);
    expect(nombres).toContain("nueva");
    expect(nombres).not.toContain("vieja");
  });

  it("renombrar CONSERVA los ficheros que acompañaban", () => {
    // `renameSync` y luego escribir, no escribir y luego borrar: con lo segundo, los anexos
    // se quedaban en la carpeta vieja o se perdían con ella.
    const raiz = proyecto();
    guardarSkill(raiz, { nombre: "vieja", descripcion: "d", cuerpo: "x" });
    mkdirSync(join(rutaDeSkills(raiz), "vieja", "reference"), { recursive: true });
    writeFileSync(join(rutaDeSkills(raiz), "vieja", "reference", "g.md"), "…");
    guardarSkill(raiz, { nombre: "nueva", descripcion: "d", cuerpo: "x" }, "vieja");
    expect(cargarSkills(raiz).skills.find((s) => s.nombre === "nueva")?.ficheros).toEqual(["reference/g.md"]);
  });

  it("un nombre con separadores no sale de la carpeta", () => {
    const raiz = proyecto();
    expect(guardarSkill(raiz, { nombre: "../fuera", descripcion: "d", cuerpo: "x" })).toEqual({
      error: expect.any(String),
    });
    expect(existsSync(join(raiz, "..", "fuera"))).toBe(false);
  });
});

describe("borrarSkill", () => {
  it("se lleva la carpeta entera, anexos incluidos", () => {
    const raiz = proyecto();
    const dir = aMano(rutaDeSkills(raiz), "mia", "d");
    mkdirSync(join(dir, "reference"), { recursive: true });
    expect(borrarSkill(raiz, "mia")).toBe(true);
    expect(existsSync(dir)).toBe(false);
  });

  it("borrar una que no está es `false`, no una excepción", () => {
    expect(borrarSkill(proyecto(), "no-esta")).toBe(false);
  });

  it("un nombre con separadores no borra nada de fuera", () => {
    expect(borrarSkill(proyecto(), "../..")).toBe(false);
  });
});

describe("esDeSerie", () => {
  it("se pregunta al DISCO, no a una lista escrita a mano", () => {
    expect(esDeSerie("archify")).toBe(true);
    expect(esDeSerie("la-mia")).toBe(false);
    expect(esDeSerie("../..")).toBe(false);
  });
});

describe("SkillsEnDisco con las del usuario", () => {
  it("el catálogo del AGENTE las incluye: si no, `repartirSkills` diría que faltan", () => {
    const raiz = proyecto();
    guardarSkill(raiz, { nombre: "mia", descripcion: "d", cuerpo: "x" });
    expect(new SkillsEnDisco(raiz).catalogo().map((s) => s.nombre)).toContain("mia");
  });

  it("NO cachea: una skill guardada con la consola abierta alcanza al turno siguiente", () => {
    // Es la misma medida que `cargarAgentes` releyéndose en cada construcción del agente.
    // Con caché, quien la escribió creería que su cambio no se aplicó.
    const raiz = proyecto();
    const puerto = new SkillsEnDisco(raiz);
    expect(puerto.catalogo().map((s) => s.nombre)).not.toContain("tardia");
    guardarSkill(raiz, { nombre: "tardia", descripcion: "d", cuerpo: "x" });
    expect(puerto.catalogo().map((s) => s.nombre)).toContain("tardia");
  });

  it("`cargar` da la del proyecto antes que la global y la de serie", () => {
    const raiz = proyecto();
    aMano(rutaGlobalDeSkills(), "archify", "d", "GLOBAL");
    aMano(rutaDeSkills(raiz), "archify", "d", "DEL PROYECTO");
    expect(new SkillsEnDisco(raiz).cargar("archify")).toContain("DEL PROYECTO");
  });

  it("y `cargar` no sale de las tres carpetas", () => {
    expect(() => new SkillsEnDisco().cargar("../../etc/passwd")).toThrow(/no vale/);
  });
});

describe("instalarSkillDesdeZip", () => {
  /** Un zip de verdad, hecho con la misma librería que lo abre. */
  const zipDe = (entradas: Record<string, string>): Uint8Array =>
    zipSync(Object.fromEntries(Object.entries(entradas).map(([k, v]) => [k, strToU8(v)])));

  const SKILL_MD = "---\nname: mia\ndescription: la mía\n---\n\nCUERPO\n";

  it("instala la carpeta entera, con sus anexos, y la deja cargable", () => {
    const raiz = proyecto();
    const zip = zipDe({
      "mi-skill/SKILL.md": SKILL_MD,
      "mi-skill/reference/guia.md": "una guía",
    });
    expect(instalarSkillDesdeZip(raiz, zip, "descarga(2).zip")).toEqual({ ok: true, nombre: "mi-skill" });

    const skill = cargarSkills(raiz).skills.find((s) => s.nombre === "mi-skill");
    expect(skill?.descripcion).toBe("la mía");
    expect(skill?.ficheros).toEqual(["reference/guia.md"]);
    expect(readFileSync(join(rutaDeSkills(raiz), "mi-skill", "reference", "guia.md"), "utf8")).toBe("una guía");
  });

  it("sin carpeta dentro, el nombre sale del fichero que subió la persona", () => {
    const raiz = proyecto();
    expect(instalarSkillDesdeZip(raiz, zipDe({ "SKILL.md": SKILL_MD }), "otra-skill.zip")).toEqual({
      ok: true,
      nombre: "otra-skill",
    });
    expect(existsSync(join(rutaDeSkills(raiz), "otra-skill", "SKILL.md"))).toBe(true);
  });

  it("un zip slip NO escribe NADA, ni siquiera lo bueno que traía", () => {
    // Fail-closed, y comprobado sobre el disco: se descomprime entero y se decide ANTES de
    // escribir, así que un fallo a medias —media skill puesta— no puede pasar.
    const raiz = proyecto();
    const zip = zipDe({ "mi-skill/SKILL.md": SKILL_MD, "../fuera.md": "pwn" });
    expect(instalarSkillDesdeZip(raiz, zip, "x.zip")).toEqual({ error: expect.any(String) });
    expect(existsSync(join(rutaDeSkills(raiz), "mi-skill"))).toBe(false);
    expect(existsSync(join(raiz, "..", "fuera.md"))).toBe(false);
  });

  it("no deja instalar encima de una de SERIE", () => {
    const raiz = proyecto();
    const zip = zipDe({ "archify/SKILL.md": SKILL_MD });
    expect(instalarSkillDesdeZip(raiz, zip, "archify.zip")).toEqual({
      error: expect.stringContaining("trae xonecode"),
    });
  });

  it("ni encima de una tuya: reemplazar es borrar y volver a instalar", () => {
    const raiz = proyecto();
    guardarSkill(raiz, { nombre: "mi-skill", descripcion: "la de antes", cuerpo: "x" });
    const zip = zipDe({ "mi-skill/SKILL.md": SKILL_MD });
    expect(instalarSkillDesdeZip(raiz, zip, "mi-skill.zip")).toEqual({
      error: expect.stringContaining("ya hay"),
    });
    // Y la de antes sigue intacta: un «no» no puede haber tocado nada.
    expect(cargarSkills(raiz).skills.find((s) => s.nombre === "mi-skill")?.descripcion).toBe("la de antes");
  });

  it("algo que no es un zip se dice, no revienta", () => {
    expect(instalarSkillDesdeZip(proyecto(), strToU8("esto no es un zip"), "x.zip")).toEqual({
      error: expect.stringContaining("zip"),
    });
  });

  it("un zip sin SKILL.md tampoco se instala", () => {
    const raiz = proyecto();
    const zip = zipDe({ "mi-skill/README.md": "solo un readme" });
    expect(instalarSkillDesdeZip(raiz, zip, "mi-skill.zip")).toEqual({
      error: expect.stringContaining("SKILL.md"),
    });
    expect(existsSync(join(rutaDeSkills(raiz), "mi-skill"))).toBe(false);
  });
});
