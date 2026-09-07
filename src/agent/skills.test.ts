import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { SkillsEnDisco, RAIZ_SKILLS, tokensDe } from "./skills.js";
import { esDoble } from "../core/ports.js";

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

  it("una raíz inexistente da catálogo vacío, no una excepción", () => {
    expect(new SkillsEnDisco("/no/existe/nada").catalogo()).toEqual([]);
  });

  it("tokensDe estima por caracteres", () => {
    expect(tokensDe("abcd")).toBe(1);
    expect(tokensDe("")).toBe(0);
  });
});
