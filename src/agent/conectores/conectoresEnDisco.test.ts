import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, readFileSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  leerAnadidos, anadirConector, quitarConector,
  leerOAuth, guardarOAuth, olvidarOAuth,
  rutaDeAnadidos, rutaDeOAuth, ErrorDeFicheroDeConectores,
} from "./conectoresEnDisco.js";

let casa: string;
beforeEach(() => { casa = mkdtempSync(join(tmpdir(), "conectores-")); });

describe("conectores añadidos", () => {
  it("sin fichero no hay ninguno", () => {
    expect(leerAnadidos(casa)).toEqual({ anadidos: [], desconocidos: [] });
  });
  it("añadir y quitar, sin duplicar", () => {
    anadirConector(casa, "jira");
    anadirConector(casa, "jira");
    anadirConector(casa, "deepwiki");
    expect(leerAnadidos(casa).anadidos).toEqual(["jira", "deepwiki"]);
    quitarConector(casa, "jira");
    expect(leerAnadidos(casa).anadidos).toEqual(["deepwiki"]);
  });
  it("un id fuera del catálogo se aparta al leer, no se inventa", () => {
    mkdirSync(join(casa, ".xonecode"), { recursive: true });
    writeFileSync(rutaDeAnadidos(casa), JSON.stringify({ version: 1, anadidos: ["jira", "linear"] }));
    expect(leerAnadidos(casa)).toEqual({ anadidos: ["jira"], desconocidos: ["linear"] });
  });
  it("un fichero ilegible NO se pisa", () => {
    mkdirSync(join(casa, ".xonecode"), { recursive: true });
    writeFileSync(rutaDeAnadidos(casa), "{roto");
    expect(() => anadirConector(casa, "jira")).toThrow(ErrorDeFicheroDeConectores);
    expect(readFileSync(rutaDeAnadidos(casa), "utf8")).toBe("{roto");
    expect(leerAnadidos(casa)).toEqual({ anadidos: [], desconocidos: [], ilegible: true });
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
  it("una versión desconocida NO se pisa", () => {
    mkdirSync(join(casa, ".xonecode"), { recursive: true, mode: 0o700 });
    writeFileSync(rutaDeOAuth(casa), JSON.stringify({ version: 9 }));
    expect(() => guardarOAuth(casa, "jira", {})).toThrow(ErrorDeFicheroDeConectores);
    expect(readFileSync(rutaDeOAuth(casa), "utf8")).toBe(JSON.stringify({ version: 9 }));
  });
});
