/**
 * El lanzador de desarrollo (`bin/xonecode`) debe anclar el tsconfig a la RAIZ del
 * repo, no dejar que tsx lo busque desde el cwd.
 *
 * tsx resuelve `tsconfig.json` desde el directorio de trabajo, así que lanzado desde
 * otro proyecto (el caso de uso normal: `./bin/xonecode` sobre una app XOne real)
 * perdería el `jsx: react-jsx` y la TUI reventaría con «React is not defined» — medido
 * con cwd fuera del repo y un pty (`script -q /dev/null …`). Este test no puede
 * reproducir el pty, pero sí la parte que se puede leer sin TTY: que la invocación de
 * tsx lleva el `--tsconfig` anclado a la misma RAIZ que resuelve el propio guion.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

describe("el lanzador de desarrollo", () => {
  const lanzador = readFileSync(join(RAIZ, "bin", "xonecode"), "utf8");

  it("pasa a tsx el tsconfig anclado a la raíz del repo, no al cwd", () => {
    expect(lanzador).toMatch(/tsx" --tsconfig "\$RAIZ\/tsconfig\.json"/);
  });

  it("el tsconfig del repo declara jsx react-jsx (sin él la TUI no compila)", () => {
    const tsconfig = JSON.parse(readFileSync(join(RAIZ, "tsconfig.json"), "utf8"));
    expect(tsconfig.compilerOptions.jsx).toBe("react-jsx");
  });
});