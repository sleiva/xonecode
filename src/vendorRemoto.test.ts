import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { raizDelPaquete } from "./agent/raizDelPaquete.js";
import { NOMBRE_DEL_PAQUETE } from "./agent/remoto/puenteWebSocket.js";

/**
 * La copia VENDORIZADA del paquete de la sesión remota (`npm run remoto:traer`) es el artefacto que viaja en el npm de
 * xonecode: sin ella el puente no carga y la sesión remota se queda apagada sin error. Se comprueba lo que la hace
 * utilizable, no su contenido.
 */
const raiz = raizDelPaquete();
const copia = join(raiz, "vendor", "xonecode-remoto");
const leer = (...r: string[]) => JSON.parse(readFileSync(join(copia, ...r), "utf8")) as Record<string, unknown>;

describe("la copia vendorizada del paquete remoto", () => {
  it("lleva el nombre que el puente importa", () => {
    expect(leer("package.json").name).toBe(NOMBRE_DEL_PAQUETE);
  });

  it("sus exports `.` y `./servidor` apuntan a ficheros que existen", () => {
    const exportaciones = leer("package.json").exports as Record<string, { import: string; types: string }>;
    for (const clave of [".", "./servidor"]) {
      expect(exportaciones[clave], clave).toBeDefined();
      for (const f of [exportaciones[clave]!.import, exportaciones[clave]!.types]) {
        expect(existsSync(join(copia, f)), f).toBe(true);
      }
    }
  });

  it("lleva la web móvil", () => {
    expect(existsSync(join(copia, "web", "index.html"))).toBe(true);
  });

  it("dice de qué commit de xonecode-server salió", () => {
    expect(leer("origen.json").commit).toMatch(/^[0-9a-f]{40}$/);
  });

  it("xonecode lo declara por `file:` y lo empaqueta", () => {
    const p = JSON.parse(readFileSync(join(raiz, "package.json"), "utf8")) as {
      dependencies: Record<string, string>;
      bundleDependencies?: string[];
    };
    expect(p.dependencies[NOMBRE_DEL_PAQUETE]).toBe("file:vendor/xonecode-remoto");
    expect(p.bundleDependencies).toContain(NOMBRE_DEL_PAQUETE);
  });
});
