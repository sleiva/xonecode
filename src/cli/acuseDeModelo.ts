/**
 * El acuse de `/modelo` — la frase tiene UN solo hogar.
 *
 * `consola.ts` la escribe y `tui/correrTui.ts` la re-parsea para actualizar la
 * sidebar (el eco de `escribir` es la única costura que tienen los manejadores de
 * consola para avisar de un cambio en caliente). Antes eran dos copias — el literal
 * y un regex escrito a mano — sin nada que probara que decían lo mismo: si alguien
 * retocaba la frase, la sidebar dejaba de enterarse sin que ningún test fallara.
 * Escribir y leer viven aquí, y el test de ida y vuelta ata el par.
 */

import { PAPELES } from "../core/modelos.js";
import type { Papel } from "../core/ports.js";

/** El acuse de un cambio de modelo: el papel ausente es «los tres papeles a la vez». */
export function acuseDeModelo(papel: Papel | undefined, modelo: string): string {
  return papel === undefined
    ? `modelo (los tres papeles): ${modelo}\n`
    : `modelo ${papel}: ${modelo}\n`;
}

const LOS_TRES = /^modelo \(los tres papeles\): (.+)\n$/;
const UN_PAPEL = new RegExp(`^modelo (${PAPELES.join("|")}): (.+)\\n$`);

/** El acuse parseado: `{ modelo }` si cambiaron los tres, `{ papel, modelo }` si cambió uno. */
export function modeloDeAcuse(
  texto: string
): { papel?: Papel; modelo: string } | undefined {
  const tres = LOS_TRES.exec(texto);
  if (tres) return { modelo: tres[1]! };
  const uno = UN_PAPEL.exec(texto);
  if (uno) return { papel: uno[1] as Papel, modelo: uno[2]! };
  return undefined;
}