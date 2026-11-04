/**
 * **Dónde va lo que sale de una prueba cuando NO hay un harness que lo diga.**
 *
 * El harness pone `XONECODE_ARTEFACTOS` (lo que se enseña: capturas) y `XONECODE_HOTSWAP` (el andamio: árboles,
 * volcados). Sin ellas —el terminal, o las skills en OTRO harness— `--captura` fallaba. Medido con Codex sobre la
 * calculadora (04-11-2026): el desarrollador perdió dos viajes en averiguarlo y acabó poniéndolas a mano.
 *
 * Por omisión van a `.xonecode/` del proyecto si el `cwd` ES un proyecto XOne (tiene `app.xml`): es la carpeta
 * que el harness ya reserva para lo suyo, y nunca la raíz del proyecto, que es el fallo que estas variables
 * existen para no cometer. Fuera de un proyecto, a una carpeta temporal. Y entonces la salida nombra la ruta
 * REAL, porque las virtuales (`/artefactos/`, `/hotswap/`) solo existen dentro del harness.
 */
import { existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** La marca de que las carpetas las puso este módulo y no un harness. */
export const RUTAS_REALES = "XONECODE_RUTAS_REALES";

/** Las variables que faltan, con su valor por omisión. Puro (salvo mirar si hay `app.xml`). */
export function carpetasPorOmision(entorno = process.env, cwd = process.cwd()) {
  if (entorno.XONECODE_ARTEFACTOS !== undefined) return {};
  const base = existsSync(join(cwd, "app.xml")) ? join(cwd, ".xonecode") : join(tmpdir(), "xone-hotswap");
  return {
    XONECODE_ARTEFACTOS: join(base, "artefactos"),
    ...(entorno.XONECODE_HOTSWAP === undefined ? { XONECODE_HOTSWAP: join(base, "hotswap") } : {}),
    [RUTAS_REALES]: "1",
  };
}

/** Las pone en `entorno` (y crea las carpetas): los scripts hijos las heredan. */
export function ponerCarpetasPorOmision(entorno = process.env, cwd = process.cwd()) {
  const faltan = carpetasPorOmision(entorno, cwd);
  for (const clave of ["XONECODE_ARTEFACTOS", "XONECODE_HOTSWAP"]) if (faltan[clave] !== undefined) mkdirSync(faltan[clave], { recursive: true });
  Object.assign(entorno, faltan);
  return faltan;
}

/** La ruta con la que se vuelve a abrir lo guardado en `cual`: la virtual del harness o, sin él, la real. */
export function rutaParaAbrir(cual, entorno = process.env) {
  if (entorno[RUTAS_REALES] !== "1") return `/${cual}/`;
  return `${cual === "artefactos" ? entorno.XONECODE_ARTEFACTOS : entorno.XONECODE_HOTSWAP}/`;
}
