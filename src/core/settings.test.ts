import { describe, it, expect } from "vitest";
import { validarSettings, rutaDeWorkspace, SettingsConCredencial } from "./settings.js";

describe("validarSettings", () => {
  it("conserva los entornos bien formados", () => {
    const s = validarSettings({
      entornos: [{ id: "webstudio", nombre: "XOne WebStudio", url: "https://mcp.xonewebstudio.com/mcp" }],
    });
    expect(s.entornos).toHaveLength(1);
    expect(s.entornos[0].id).toBe("webstudio");
  });

  it("descarta en silencio un entorno sin url, en vez de tumbar el arranque", () => {
    const s = validarSettings({ entornos: [{ id: "roto", nombre: "Roto" }] });
    expect(s.entornos).toHaveLength(0);
  });

  it("RECHAZA una clave de API: las credenciales van solo en auth.json", () => {
    expect(() => validarSettings({ entornos: [], apiKey: "sk-…" })).toThrow(SettingsConCredencial);
    expect(() => validarSettings({ entornos: [{ id: "a", nombre: "A", url: "https://x/mcp", token: "t" }] }))
      .toThrow(SettingsConCredencial);
  });

  it("sin entornos, la lista es vacía y no undefined", () => {
    expect(validarSettings({}).entornos).toEqual([]);
  });

  it("conserva la base del workspace si es una cadena", () => {
    expect(validarSettings({ entornos: [], workspace: "/home/u/xone-projects" }).workspace)
      .toBe("/home/u/xone-projects");
  });

  it("un bruto que no es objeto (null, array, primitivo) da settings vacíos, no un fallo", () => {
    expect(validarSettings(null)).toEqual({ entornos: [] });
    expect(validarSettings([1, 2, 3])).toEqual({ entornos: [] });
    expect(validarSettings("no soy un objeto")).toEqual({ entornos: [] });
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
