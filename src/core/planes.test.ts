import { describe, expect, it } from "vitest";
import { esRutaDePlan, motivoDePlanInaceptable, rutaDelPlan, RUTA_PLANES } from "./planes.js";

describe("esRutaDePlan", () => {
  it("acepta lo que es un plan: carpeta con nombre válido y un fichero dentro", () => {
    expect(esRutaDePlan("/planes/favoritos/PLAN.md")).toBe(true);
    expect(esRutaDePlan("/planes/favoritos/adr/0001-donde-guardar.md")).toBe(true);
  });

  /**
   * **Un plan es una CARPETA**: dentro de una sesión puede haber varios, y con ficheros sueltos
   * dos planes a la vez se pisan el nombre.
   */
  it("un fichero suelto en la raíz de /planes/ no es un plan", () => {
    expect(esRutaDePlan("/planes/PLAN.md")).toBe(false);
    expect(esRutaDePlan("/planes/")).toBe(false);
  });

  /**
   * Lo que el modelo escribe es TEXTO y de ahí sale una ruta del disco: lista blanca de forma,
   * nunca un `startsWith`. No se para con un `includes("..")` — también hay contrabarras,
   * segmentos vacíos y el byte nulo.
   */
  it("no se sale de su carpeta por ningún camino", () => {
    const NULO = String.fromCharCode(0);
    for (const mala of [
      "/planes/../secreto.md",
      "/planes/favoritos/../../.env",
      "/planes/favoritos//PLAN.md",
      "/planes/favoritos/sub" + String.fromCharCode(92) + "PLAN.md",
      "/planes/favoritos/PLAN" + NULO + ".md",
      "/planes/Favoritos/PLAN.md",
      "/planes/mi plan/PLAN.md",
      "/artefactos/PLAN.md",
      "/.xonecode/planes/x/PLAN.md",
    ]) {
      expect(esRutaDePlan(mala), mala).toBe(false);
    }
    expect(esRutaDePlan(undefined)).toBe(false);
  });
});

describe("motivoDePlanInaceptable", () => {
  /** La MISMA regla que la de un subagente o una skill: tres reglas serían tres discrepancias. */
  it("acepta un slug y rechaza lo que no lo es, diciendo por qué", () => {
    expect(motivoDePlanInaceptable("favoritos")).toBeUndefined();
    expect(motivoDePlanInaceptable("pantalla-de-favoritos")).toBeUndefined();
    expect(motivoDePlanInaceptable("Favoritos")).toMatch(/minúsculas/);
    expect(motivoDePlanInaceptable("")).toBeDefined();
  });
});

describe("rutaDelPlan", () => {
  it("compone la carpeta con su barra final, que CompositeBackend necesita", () => {
    expect(rutaDelPlan("favoritos")).toBe(`${RUTA_PLANES}favoritos/`);
    expect(rutaDelPlan("favoritos").endsWith("/")).toBe(true);
  });
});

describe("el plan enlaza al analista con el desarrollador", () => {
  /**
   * **Esto es lo que hace que un plan sirva para algo.** Medido antes de arreglarlo: las dos
   * skills existían, el analista las llevaba, y había CERO planes en ocho proyectos — porque
   * nadie podía escribirlos y nadie sabía leerlos. Que las piezas existan no basta: el
   * orquestador reparte leyendo las descripciones, así que si ninguna nombra el plan, el plan
   * no entra en ninguna cadena.
   */
  it("el que analiza dice que lo deja, y el que desarrolla que lo lee y lo marca", async () => {
    const { AGENTES_DE_SERIE } = await import("../agent/subagentes/agentesEnDisco.js");
    const analista = AGENTES_DE_SERIE.find((a) => a.nombre === "analyst-xone")!;
    const dev = AGENTES_DE_SERIE.find((a) => a.nombre === "developer-xone")!;

    expect(analista.descripcion).toContain("/planes/");
    expect(dev.descripcion).toContain("/planes/");
    expect(dev.descripcion).toMatch(/marca ahí/);
  });

  /** Y quien lo consume tiene la regla entera, no solo la mención en su descripción. */
  it("quien escribe el proyecto sabe qué hacer con un plan", async () => {
    const { AGENTES_DE_SERIE } = await import("../agent/subagentes/agentesEnDisco.js");
    for (const nombre of ["developer-xone", "designer-xone"]) {
      const a = AGENTES_DE_SERIE.find((x) => x.nombre === nombre)!;
      expect(a.instrucciones, nombre).toMatch(/\/planes\//);
      // Lo COMPROBADO, no lo escrito: la misma regla que gobierna el resto del harness.
      expect(a.instrucciones, nombre).toMatch(/COMPROBADO/);
    }
  });
});
