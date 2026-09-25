import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, readFileSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  leerConectores, anadirConector, quitarConector,
  guardarDefinicion, olvidarDefinicion,
  leerOAuth, guardarOAuth, olvidarOAuth,
  rutaDeAnadidos, rutaDeOAuth, ErrorDeFicheroDeConectores,
} from "./conectoresEnDisco.js";

let casa: string;
beforeEach(() => { casa = mkdtempSync(join(tmpdir(), "conectores-")); });

describe("conectores añadidos", () => {
  it("sin fichero no hay ninguno", () => {
    expect(leerConectores(casa)).toEqual({ anadidos: [], desconocidos: [], definiciones: {} });
  });
  it("añadir y quitar, sin duplicar", () => {
    anadirConector(casa, "jira");
    anadirConector(casa, "jira");
    anadirConector(casa, "deepwiki");
    expect(leerConectores(casa).anadidos).toEqual(["jira", "deepwiki"]);
    quitarConector(casa, "jira");
    expect(leerConectores(casa).anadidos).toEqual(["deepwiki"]);
  });
  it("un id fuera del catálogo se aparta al leer, no se inventa", () => {
    mkdirSync(join(casa, ".xonecode"), { recursive: true });
    writeFileSync(rutaDeAnadidos(casa), JSON.stringify({ version: 1, anadidos: ["jira", "linear"] }));
    expect(leerConectores(casa)).toEqual({ anadidos: ["jira"], desconocidos: ["linear"], definiciones: {} });
  });
  it("un fichero ilegible NO se pisa", () => {
    mkdirSync(join(casa, ".xonecode"), { recursive: true });
    writeFileSync(rutaDeAnadidos(casa), "{roto");
    expect(() => anadirConector(casa, "jira")).toThrow(ErrorDeFicheroDeConectores);
    expect(readFileSync(rutaDeAnadidos(casa), "utf8")).toBe("{roto");
    expect(leerConectores(casa)).toEqual({ anadidos: [], desconocidos: [], definiciones: {}, ilegible: true });
  });
});

describe("definiciones de un conector propio", () => {
  const def = {
    nombre: "Mi servidor",
    descripcion: "Lo que hace",
    url: "https://mcp.ejemplo.com/mcp",
    autenticacion: "api-key" as const,
  };

  it("ida y vuelta, y el id sale VIVO solo por tenerla", () => {
    // La pregunta es una sola para las dos familias: un `custom:` no está en el catálogo, así
    // que lo que lo salva de `desconocidos` es exactamente su definición.
    guardarDefinicion(casa, "custom:mi-servidor", def);
    anadirConector(casa, "custom:mi-servidor");
    const leido = leerConectores(casa);
    expect(leido.anadidos).toEqual(["custom:mi-servidor"]);
    expect(leido.desconocidos).toEqual([]);
    expect(leido.definiciones["custom:mi-servidor"]).toEqual(def);
  });

  it("sin definición, un `custom:` vuelve a ser desconocido", () => {
    // Una entrada muerta de verdad: el id está escrito pero nadie sabe qué servidor es. Se DICE
    // en vez de callarla, que es lo único que deja arreglarla.
    anadirConector(casa, "custom:fantasma");
    expect(leerConectores(casa)).toMatchObject({ anadidos: [], desconocidos: ["custom:fantasma"] });
  });

  it("una escritura de añadidos NO pisa las definiciones", () => {
    guardarDefinicion(casa, "custom:mi-servidor", def);
    anadirConector(casa, "jira");
    quitarConector(casa, "jira");
    expect(leerConectores(casa).definiciones["custom:mi-servidor"]).toEqual(def);
  });

  it("olvidar una definición la quita del fichero, y deja las demás", () => {
    guardarDefinicion(casa, "custom:uno", def);
    guardarDefinicion(casa, "custom:dos", { ...def, nombre: "Otro" });
    olvidarDefinicion(casa, "custom:uno");
    expect(Object.keys(leerConectores(casa).definiciones)).toEqual(["custom:dos"]);
  });

  it("una entrada a medias NO se carga, y la escritura la conserva", () => {
    // Se filtra la LECTURA, no la fusión: quitarla al escribir sería destruir lo que había, y la
    // basura de un fichero editado a mano tiene que sobrevivir a una escritura nuestra.
    mkdirSync(join(casa, ".xonecode"), { recursive: true });
    writeFileSync(rutaDeAnadidos(casa), JSON.stringify({
      version: 1,
      anadidos: ["custom:a-medias"],
      definiciones: { "custom:a-medias": { nombre: "Solo el nombre" }, "jira": def },
    }));
    expect(leerConectores(casa).definiciones).toEqual({});
    anadirConector(casa, "deepwiki");
    expect(JSON.parse(readFileSync(rutaDeAnadidos(casa), "utf8")).definiciones).toEqual({
      "custom:a-medias": { nombre: "Solo el nombre" }, "jira": def,
    });
  });

  it("una clave que no es un id nuestro no se lee", () => {
    // De ahí sale una clave de directorio y, sobre todo, un id que ningún `resolver` conoce: un
    // fichero editado a mano no puede fabricar conectores.
    mkdirSync(join(casa, ".xonecode"), { recursive: true });
    writeFileSync(rutaDeAnadidos(casa), JSON.stringify({ version: 1, definiciones: { "../../fuera": def } }));
    expect(leerConectores(casa).definiciones).toEqual({});
  });
});

describe("estado OAuth", () => {
  it("cada conector toca SOLO lo suyo, y el fichero es 0600", () => {
    guardarOAuth(casa, "jira", { tokens: { access_token: "a", token_type: "Bearer" } });
    guardarOAuth(casa, "notion", { codeVerifier: "v" });
    expect(leerOAuth(casa, "jira").tokens?.access_token).toBe("a");
    expect(leerOAuth(casa, "notion").codeVerifier).toBe("v");
    expect(statSync(rutaDeOAuth(casa)).mode & 0o777).toBe(0o600);
    expect(statSync(join(casa, ".xonecode")).mode & 0o777).toBe(0o700);
    olvidarOAuth(casa, "jira");
    expect(leerOAuth(casa, "jira")).toEqual({});
    expect(leerOAuth(casa, "notion").codeVerifier).toBe("v");
  });
  it("la clave de un `api-key` vive en el MISMO fichero, y también a 0600", () => {
    // Un solo fichero por conector: son la misma pregunta («con qué se autentica») y el mismo
    // ciclo de vida (nace al conectar, muere al desconectar y al quitar).
    guardarOAuth(casa, "custom:mi-servidor", { clave: "sk-abc" });
    expect(leerOAuth(casa, "custom:mi-servidor").clave).toBe("sk-abc");
    expect(statSync(rutaDeOAuth(casa)).mode & 0o777).toBe(0o600);
  });
  it("una versión desconocida NO se pisa", () => {
    mkdirSync(join(casa, ".xonecode"), { recursive: true, mode: 0o700 });
    writeFileSync(rutaDeOAuth(casa), JSON.stringify({ version: 9 }));
    expect(() => guardarOAuth(casa, "jira", {})).toThrow(ErrorDeFicheroDeConectores);
    expect(readFileSync(rutaDeOAuth(casa), "utf8")).toBe(JSON.stringify({ version: 9 }));
  });
});
