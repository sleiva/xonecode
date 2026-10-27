/**
 * Los scripts de `xone-granja` son los MISMOS de `xone-hotswap`: cada uno reenvía al suyo, con sus argumentos, su
 * carpeta de trabajo y su entorno, y sale con su código. Quien sabe hablar con la granja es `xone-hotswap` (detecta el
 * canal de la sesión, `lib/dispositivo.mjs#canalDeGranja`, y va a la copia sin adb); aquí no hay una segunda copia de
 * esa lógica que pudiera divergir. Esta skill existe para que el agente de un proyecto con la granja vea UNA forma de
 * probar, la que vale allí (`core/granja.ts#skillsSegunOrigen`).
 *
 * Fuera de `scripts/` a propósito: esa carpeta va al PATH y cada fichero suyo es un comando.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

export function reenviar(nombre) {
  // `import.meta.dirname` es la carpeta REAL (Node resuelve el enlace del plugin de Claude Code), así que la hermana
  // `xone-hotswap` está al lado también cuando la skill llega montada por un enlace.
  const destino = join(import.meta.dirname, "..", "..", "xone-hotswap", "scripts", nombre);
  if (!existsSync(destino)) {
    console.error(`xone-granja: falta ${nombre} de la skill xone-hotswap, que es quien habla con la granja. Reinstala xonecode.`);
    process.exit(1);
  }
  const r = spawnSync(process.execPath, [destino, ...process.argv.slice(2)], { stdio: "inherit" });
  if (r.error !== undefined) {
    console.error(`xone-granja: no se pudo lanzar ${nombre} (${r.error.code ?? r.error.message})`);
    process.exit(1);
  }
  process.exit(r.status ?? 1);
}
