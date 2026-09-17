import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buscarRaizDelPaquete, raizDelPaquete } from "./raizDelPaquete.js";

describe("la raíz del paquete no depende de la profundidad", () => {
  it("es la carpeta con el package.json, no la de partida", () => {
    const base = mkdtempSync(join(tmpdir(), "raiz-"));
    writeFileSync(join(base, "package.json"), "{}", "utf8");
    const hondo = join(base, "src", "agent", "grafo");
    mkdirSync(hondo, { recursive: true });
    expect(buscarRaizDelPaquete(hondo)).toBe(base);
  });

  /**
   * El test que muere con la regla: es exactamente lo que rompía el `resolve(…, "..", "..")`.
   * Dos profundidades distintas bajo la misma raíz tienen que dar el MISMO valor.
   */
  it("da lo mismo desde dos profundidades distintas", () => {
    const base = mkdtempSync(join(tmpdir(), "raiz-"));
    writeFileSync(join(base, "package.json"), "{}", "utf8");
    const dos = join(base, "src", "agent");
    const tres = join(base, "src", "agent", "grafo");
    mkdirSync(tres, { recursive: true });
    expect(buscarRaizDelPaquete(dos)).toBe(buscarRaizDelPaquete(tres));
  });

  it("se para en la PRIMERA hacia arriba, que es la del paquete", () => {
    const fuera = mkdtempSync(join(tmpdir(), "raiz-"));
    writeFileSync(join(fuera, "package.json"), "{}", "utf8");
    const dentro = join(fuera, "node_modules", "xonecode");
    mkdirSync(join(dentro, "dist", "agent"), { recursive: true });
    writeFileSync(join(dentro, "package.json"), "{}", "utf8");
    expect(buscarRaizDelPaquete(join(dentro, "dist", "agent"))).toBe(dentro);
  });

  it("sin ninguna devuelve undefined, y el envoltorio LANZA", () => {
    // Un temporal recién creado no tiene `package.json` por encima en ninguna de las dos
    // plataformas donde esto corre; si algún día lo tuviera, este test se pondría rojo en vez
    // de callarse, que es lo que se pide de él.
    const pelado = mkdtempSync(join(tmpdir(), "raiz-"));
    expect(buscarRaizDelPaquete(pelado)).toBeUndefined();
    expect(() => raizDelPaquete(pelado)).toThrow(/inservible/);
  });

  it("desde este módulo encuentra la raíz de xonecode: la que tiene skills/", () => {
    expect(buscarRaizDelPaquete(raizDelPaquete())).toBe(raizDelPaquete());
  });
});
