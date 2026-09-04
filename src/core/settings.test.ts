import { describe, it, expect } from "vitest";
import { validarSettings, rutaDeWorkspace } from "./settings.js";

describe("validarSettings", () => {
  it("conserva los entornos bien formados, sin avisos", () => {
    const { settings, avisos } = validarSettings({
      entornos: [{ id: "webstudio", nombre: "XOne WebStudio", url: "https://mcp.xonewebstudio.com/mcp" }],
    });
    expect(settings.entornos).toHaveLength(1);
    expect(settings.entornos[0].id).toBe("webstudio");
    expect(avisos).toEqual([]);
  });

  it("descarta en silencio un entorno sin url, en vez de tumbar el arranque", () => {
    const { settings, avisos } = validarSettings({ entornos: [{ id: "roto", nombre: "Roto" }] });
    expect(settings.entornos).toHaveLength(0);
    expect(avisos).toEqual([]);
  });

  it("una clave de API a nivel de fichero deja un AVISO grave y NO lanza: el resto se carga igual", () => {
    const { settings, avisos } = validarSettings({
      entornos: [{ id: "a", nombre: "A", url: "https://a/mcp" }],
      apiKey: "sk-secreta-de-verdad",
    });
    expect(settings.entornos.map((e) => e.id)).toEqual(["a"]);
    expect(avisos).toHaveLength(1);
    expect(avisos[0].severidad).toBe("grave");
    expect(avisos[0].texto).toContain("apiKey");
    expect(avisos[0].texto).not.toContain("sk-secreta-de-verdad");
  });

  it("«key» — el campo EXACTO que usa auth.json — se detecta: es el pegado accidental más plausible", () => {
    const { avisos } = validarSettings({ entornos: [], key: "sk-deberia-fallar" });
    expect(avisos).toHaveLength(1);
    expect(avisos[0].severidad).toBe("grave");
    expect(avisos[0].texto).toContain("key");
    expect(avisos[0].texto).not.toContain("sk-deberia-fallar");
  });

  it("una clave dentro de un entorno deja aviso y el entorno se carga igual, sin el campo", () => {
    const { settings, avisos } = validarSettings({
      entornos: [{ id: "a", nombre: "A", url: "https://x/mcp", token: "t-secreto" }],
    });
    expect(settings.entornos).toHaveLength(1);
    expect(settings.entornos[0]).toEqual({ id: "a", nombre: "A", url: "https://x/mcp" });
    expect(avisos).toHaveLength(1);
    expect(avisos[0].severidad).toBe("grave");
    expect(avisos[0].texto).toContain("token");
    expect(avisos[0].texto).not.toContain("t-secreto");
  });

  it("sin entornos, la lista es vacía y no undefined", () => {
    expect(validarSettings({}).settings.entornos).toEqual([]);
  });

  it("conserva la base del workspace si es una cadena", () => {
    expect(validarSettings({ entornos: [], workspace: "/home/u/xone-projects" }).settings.workspace)
      .toBe("/home/u/xone-projects");
  });

  it("un bruto que no es objeto (null, array, primitivo) da settings vacíos y sin avisos, no un fallo", () => {
    expect(validarSettings(null)).toEqual({ settings: { entornos: [] }, avisos: [] });
    expect(validarSettings([1, 2, 3])).toEqual({ settings: { entornos: [] }, avisos: [] });
    expect(validarSettings("no soy un objeto")).toEqual({ settings: { entornos: [] }, avisos: [] });
  });
});

describe("rutaDeWorkspace", () => {
  it("la base es configurable; la disposición de dentro la fija xonecode", () => {
    expect(rutaDeWorkspace("/home/u/.xonecode", "webstudio", "MinitMT"))
      .toBe("/home/u/.xonecode/webstudio/workspace/MinitMT");
  });

  it("un nombre con separador o .. no puede salirse de la base", () => {
    expect(() => rutaDeWorkspace("/base", "webstudio", "../fuera")).toThrow();
    expect(() => rutaDeWorkspace("/base", "..", "p")).toThrow();
    expect(() => rutaDeWorkspace("/base", "webstudio", "a/b")).toThrow();
  });
});
