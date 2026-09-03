import { describe, it, expect } from "vitest";
import { writeFileSync, readdirSync } from "node:fs";
import { claseDeCambio, indicePrivado } from "./git.js";

describe("claseDeCambio", () => {
  it("A es alta y D es baja: son las que decide el candado de planDeSubida", () => {
    expect(claseDeCambio("A")).toBe("nuevo");
    expect(claseDeCambio("D")).toBe("borrado");
  });

  it("M, R con puntuación de similitud, C y T cuentan como modificado", () => {
    // `R100`/`C100` es el formato real de una línea `--name-status` con detección de
    // similitud: la clase se decide por la PRIMERA letra, el resto es el porcentaje.
    expect(claseDeCambio("M")).toBe("modificado");
    expect(claseDeCambio("R100")).toBe("modificado");
    expect(claseDeCambio("C075")).toBe("modificado");
    expect(claseDeCambio("T")).toBe("modificado");
  });

  it("una marca desconocida NUNCA se pierde: cae en modificado, no se descarta", () => {
    // Esta es la regla que antes divergía: `gitSync.ts` descartaba en silencio cualquier
    // marca fuera de su mapa (con el riesgo, en el plan de subida, de un fichero que no
    // sube ni se borra sin ningún aviso); `instantanea.ts` ya usaba `modificado` como
    // omisión. Se unifica hacia la opción segura en los dos sitios: visible por defecto.
    expect(claseDeCambio("U")).toBe("modificado");
    expect(claseDeCambio("X")).toBe("modificado");
    expect(claseDeCambio("B")).toBe("modificado");
  });
});

describe("indicePrivado", () => {
  it("da una ruta de índice en un directorio propio, y limpiar() lo borra", () => {
    const idx = indicePrivado("prueba");
    expect(idx.ruta).toContain("xonecode-prueba-");
    writeFileSync(idx.ruta, ""); // el índice no existe hasta que algo lo crea
    idx.limpiar();
    expect(() => readdirSync(idx.ruta)).toThrow();
  });

  it("dos llamadas dan directorios distintos: dos sesiones no se pisan", () => {
    const a = indicePrivado("x");
    const b = indicePrivado("x");
    expect(a.ruta).not.toBe(b.ruta);
    a.limpiar();
    b.limpiar();
  });
});
