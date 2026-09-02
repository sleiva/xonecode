import { mkdtempSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  asegurarMemoriaDeProyecto,
  RUTA_MEMORIA_VIRTUAL,
  rutaMemoriaDeProyecto,
} from "./memoriaDeProyecto.js";

describe("memoria de proyecto", () => {
  it("se crea en .xonecode con una plantilla legible por humanos", () => {
    const raiz = mkdtempSync(join(tmpdir(), "xonecode-memoria-"));
    expect(asegurarMemoriaDeProyecto(raiz)).toBe(true);
    const ruta = rutaMemoriaDeProyecto(raiz);
    expect(existsSync(ruta)).toBe(true);
    const texto = readFileSync(ruta, "utf8");
    expect(texto).toContain("# Memoria del proyecto");
    expect(texto).toContain("## Decisiones");
  });

  it("nunca pisa una memoria que ya contiene decisiones del usuario", () => {
    const raiz = mkdtempSync(join(tmpdir(), "xonecode-memoria-"));
    asegurarMemoriaDeProyecto(raiz);
    const ruta = rutaMemoriaDeProyecto(raiz);
    const original = "# Memoria del proyecto\n\n## Decisiones\n\n- El usuario manda.\n";
    writeFileSync(ruta, original);
    expect(asegurarMemoriaDeProyecto(raiz)).toBe(false);
    expect(readFileSync(ruta, "utf8")).toBe(original);
  });

  it("usa una ruta virtual estable, independiente de la raíz real", () => {
    expect(RUTA_MEMORIA_VIRTUAL).toBe("/MEMORIA_PROYECTO.md");
  });
});
