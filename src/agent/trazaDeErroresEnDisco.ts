/**
 * El sumidero de `core/trazaDeErrores.ts`, escribiendo en el proyecto.
 *
 * La misma pieza que `agent/turno/diagnosticoDeTools.ts` y con el mismo trato: la única
 * palanca de este módulo es la variable de entorno, y deja un `.jsonl` dentro de `.xonecode/`
 * —que está denegada al agente, no sube a CloudStudio y no entra en git—. Que esa variable
 * valga "1" por OMISIÓN mientras dure esta etapa de pruebas es una decisión de
 * `Settings.depurar`, resuelta fuera de aquí por `agent/turno/depuracion.ts`.
 *
 * Append-only y sin buffer: lo que esto tiene que sobrevivir es justamente un proceso que se
 * queda colgado, y un buffer que se vuelca al cerrar no se vuelca nunca si nadie cierra.
 */
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  ponerSumideroDeErrores,
  type SumideroDeErrores,
} from "../core/trazaDeErrores.js";

export const VARIABLE_TRAZA_ERRORES = "XONECODE_TRACE_ERRORES";
export const NOMBRE_TRAZA_ERRORES = "traza-errores.jsonl";

export function rutaTrazaDeErrores(raiz: string): string {
  return join(raiz, ".xonecode", NOMBRE_TRAZA_ERRORES);
}

/**
 * Enciende la traza si la variable está puesta, y devuelve cómo apagarla.
 *
 * Devuelve `undefined` cuando NO se enciende, que es el caso normal: así quien la llama puede
 * decir si está puesta sin volver a mirar el entorno.
 */
export function encenderTrazaDeErrores(
  raiz: string,
  entorno: NodeJS.ProcessEnv = process.env,
  escribir: (ruta: string, linea: string) => void = escribirLinea,
): (() => void) | undefined {
  if (entorno[VARIABLE_TRAZA_ERRORES] !== "1") {
    // El sumidero es GLOBAL (core/trazaDeErrores.ts) y esto se llama UNA vez por sesión: sin
    // apagarlo aquí, una sesión sin depurar seguiría escribiendo sus hitos en el `raiz` de la
    // ANTERIOR que sí la tenía encendida — y la casilla de Ajustes no apagaría nada de verdad
    // mientras el proceso siguiera vivo.
    ponerSumideroDeErrores(undefined);
    return undefined;
  }
  const ruta = rutaTrazaDeErrores(raiz);
  const sumidero: SumideroDeErrores = (anotado) => {
    escribir(ruta, `${JSON.stringify({ v: 1, at: new Date().toISOString(), ...anotado })}\n`);
  };
  ponerSumideroDeErrores(sumidero);
  return () => ponerSumideroDeErrores(undefined);
}

function escribirLinea(ruta: string, linea: string): void {
  try {
    mkdirSync(dirname(ruta), { recursive: true, mode: 0o700 });
    appendFileSync(ruta, linea, "utf8");
  } catch {
    // Si no se puede ni escribir el diagnóstico, se calla: es el último sitio donde tiene
    // sentido insistir, y anotar el fallo de anotar sería una recursión.
  }
}
