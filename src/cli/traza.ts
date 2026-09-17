import { readFileSync } from "node:fs";
import { NOMBRE_TRAZA_TOOLS, rutaTrazaDeTools, VARIABLE_TRAZA_TOOLS } from "../agent/turno/diagnosticoDeTools.js";
import { pintarSesion, resumirTraza } from "../agent/turno/informeDeTraza.js";
import { escribirEnStdout, type Escribir } from "./stdio.js";

/**
 * `xonecode traza [--todas]`: a dónde se fueron los tokens del proyecto del cwd.
 *
 * Lee `.xonecode/traza-tools.jsonl` —lo que dejó una sesión corrida con
 * `XONECODE_TRACE_TOOLS=1`— y lo agrega por origen y por tool. No toca red, ni modelo, ni
 * el proyecto: es un lector.
 *
 * **Por omisión informa de la ÚLTIMA sesión**, que es la que acabas de medir, y DICE cuántas
 * hay en el fichero. El fichero es append-only y una máquina acumula ejecuciones de días:
 * sumarlas todas en una cifra daría un número plausible del turno de ayer más el de ahora.
 *
 * Que no haya traza sale con **70**, no con 0: falta lo que este comando necesita para
 * trabajar y el proyecto no tiene nada que ver — el mismo trato que `verify` le da a un
 * simulador que no está. Un 0 con un informe en blanco se leería como «no gastaste nada».
 */
export async function cmdTraza(
  raiz: string,
  escribir: Escribir = escribirEnStdout,
  opciones: { todas?: boolean } = {}
): Promise<number> {
  const ruta = rutaTrazaDeTools(raiz);
  let crudo: string;
  try {
    crudo = readFileSync(ruta, "utf8");
  } catch {
    escribir(`no hay ${NOMBRE_TRAZA_TOOLS} en este proyecto.\n`);
    escribir(`  Enciéndela y vuelve a correr el turno:  ${VARIABLE_TRAZA_TOOLS}=1 xonecode run --real "<peticion>"\n`);
    return 70; // EX_SOFTWARE: falta lo que hace falta para medir, no falla el proyecto
  }

  const sesiones = resumirTraza(crudo.split("\n"));
  const conLlamadas = sesiones.filter((s) => s.llamadas > 0 || s.tools.length > 0);
  if (conLlamadas.length === 0) {
    escribir(`la traza está ahí, pero sin ninguna llamada al modelo registrada.\n`);
    return 70;
  }

  const aPintar = opciones.todas === true ? conLlamadas : conLlamadas.slice(-1);
  if (opciones.todas !== true && conLlamadas.length > 1) {
    escribir(`${conLlamadas.length} sesiones en la traza; abajo va la última. Con \`--todas\` salen todas.\n\n`);
  }
  for (const sesion of aPintar) {
    for (const linea of pintarSesion(sesion)) escribir(`${linea}\n`);
    escribir("\n");
  }
  return 0;
}
