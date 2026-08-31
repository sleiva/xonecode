/**
 * Tests de `crearProyecto.ts`: el esqueleto de `core/esqueleto.ts` escrito en
 * un directorio temporal, que es lo más parecido a «la carpeta del usuario»
 * sin tocar ninguna carpeta real.
 */

import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crearProyecto } from "./crearProyecto.js";
import type { DatosDelProyecto } from "../core/esqueleto.js";

const DATOS: DatosDelProyecto = {
  nombre: "GestionClientes",
  titulo: "Gestión de Clientes",
  orientacion: "portrait",
  login: false,
};

const limpias: string[] = [];
afterEach(() => {
  for (const ruta of limpias) rmSync(ruta, { recursive: true, force: true });
  limpias.length = 0;
});

/** Una raíz fresca que se borra al final del test. */
function raizFresca(): string {
  const ruta = mkdtempSync(join(tmpdir(), "xonecode-crear-"));
  limpias.push(ruta);
  return ruta;
}

describe("crearProyecto", () => {
  it("escribe los ficheros del esqueleto y las carpetas del runtime", () => {
    const raiz = raizFresca();
    crearProyecto(raiz, DATOS);

    for (const fichero of ["app.xml", "app.ini", "mappings.xne", "EntradaApp.xne"]) {
      expect(existsSync(join(raiz, fichero)), fichero).toBe(true);
    }
    for (const carpeta of ["bd", "icons", "files"]) {
      expect(existsSync(join(raiz, carpeta)), carpeta).toBe(true);
    }
  });

  it("no pisa un fichero que ya existiera: lo salta y lo dice", () => {
    const raiz = raizFresca();
    writeFileSync(join(raiz, "default.css"), "/* css del usuario */");

    const informe = crearProyecto(raiz, DATOS);

    expect(readFileSync(join(raiz, "default.css"), "utf8")).toBe("/* css del usuario */");
    expect(informe.saltados).toEqual(["default.css"]);
    expect(informe.creados).not.toContain("default.css");
  });

  it("no falla si una carpeta del runtime ya existe", () => {
    const raiz = raizFresca();
    mkdirSync(join(raiz, "bd"));
    expect(() => crearProyecto(raiz, DATOS)).not.toThrow();
  });

  it("el informe dice qué se creó y qué se saltó", () => {
    const raiz = raizFresca();
    writeFileSync(join(raiz, "app.ini"), "Name=Previo");

    const informe = crearProyecto(raiz, DATOS);

    expect(informe.creados).toContain("app.xml");
    expect(informe.creados).not.toContain("app.ini");
    expect(informe.saltados).toEqual(["app.ini"]);
    expect(informe.carpetas).toEqual(["bd", "icons", "files"]);
  });
});