/**
 * La mudanza de una vez de las copias locales que siguen en el reparto VIEJO
 * (`<base>/<entorno>/workspace/<proyecto>`) al de ahora (`<workspace>/<entorno>/<proyecto>`).
 *
 * **No es cosmética, y por eso se hace sola.** `dentroDelWorkspace` es lo que decide si el
 * harness puede commitear al cerrar cada turno, y compara la raíz contra el workspace: con
 * el reparto nuevo, una copia que se quedara en el sitio viejo dejaría de estar dentro y los
 * commits por turno se pararían EN SILENCIO — que es exactamente el fallo mudo que este repo
 * persigue en todas partes. Dejarlas donde están no era una opción; dejarlas y avisar,
 * tampoco, porque el aviso saldría en cada arranque para siempre.
 *
 * La decisión de QUÉ se muda es pura y vive en `core/mudanzaDeWorkspace.ts`. Aquí solo está
 * lo que toca disco: mover, reescribir los dos almacenes con raíces absolutas y CONTARLO.
 */

import { existsSync, mkdirSync, readdirSync, renameSync, rmdirSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import { mudanzasPendientes, rutaMudada, type Mudanza } from "../../core/mudanzaDeWorkspace.js";
import { remapearSinAprobacion } from "./settingsEnDisco.js";
import { remapearRaicesDeTareas } from "../tareas/tareasEnDisco.js";
import { BASURA_DEL_SO } from "../sesiones/gitSync.js";

export interface ResultadoDeMudanza {
  mudadas: number;
  chocadas: number;
}

/** Las CARPETAS que cuelgan de una ruta. Un fichero suelto no es un proyecto, y un
 *  `.DS_Store` es un nombre de segmento tan válido como cualquier otro. */
function carpetasDe(ruta: string): readonly string[] {
  try {
    return readdirSync(ruta, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    return [];
  }
}

/**
 * Retira una carpeta del reparto viejo que ya no pinta nada — y solo si NO queda nada del
 * usuario dentro.
 *
 * `rmdir` no vacía carpetas, así que él solo ya es la garantía. Lo único que se borra antes
 * es la BASURA DEL SO, y de la lista CERRADA que `gitSync.ts` ya mantiene para lo mismo: sin
 * esto, un `.DS_Store` que Finder dejó al mirar la carpeta bastaba para que el husco vacío
 * se quedara en `~/.xonecode` para siempre, que es justo lo que esta mudanza venía a quitar.
 * Medido sobre un caso real: los dos husos tenían uno.
 */
function retirarSiSobra(carpeta: string): void {
  try {
    const dentro = readdirSync(carpeta);
    if (dentro.length > 0 && dentro.every((n) => (BASURA_DEL_SO as readonly string[]).includes(n))) {
      for (const basura of dentro) unlinkSync(join(carpeta, basura));
    }
    rmdirSync(carpeta);
  } catch {
    // No estaba vacía, o no estaba, o no se pudo tocar. En los tres casos no hay nada que
    // hacer: la carpeta vieja de más es un adorno, no un fallo que contar.
  }
}

export function mudarWorkspaceLegado(opciones: {
  /** La casa donde viven `settings.json` y `tareas/indice.json`. Inyectable por los tests. */
  casa?: string;
  /** La base con el reparto viejo: `settings.workspace` si estaba puesto, o `~/.xonecode`. */
  legado: string;
  /** El workspace de ahora. */
  workspace: string;
  entornos: readonly string[];
  /** Al TERMINAL y no al cable: por ahí viajan rutas de la máquina (`sinRutas`). */
  escribir: (texto: string) => void;
  /** Cómo se mueve una copia. Por omisión `renameSync`; entra por parámetro porque el fallo
   *  que importa —EXDEV, un workspace en otro volumen— no se puede provocar en un temporal. */
  mover?: (desde: string, hacia: string) => void;
}): ResultadoDeMudanza {
  const mover = opciones.mover ?? renameSync;
  const { mudanzas, chocadas } = mudanzasPendientes({
    legado: opciones.legado,
    workspace: opciones.workspace,
    entornos: opciones.entornos,
    existe: existsSync,
    listar: carpetasDe,
  });

  if (mudanzas.length === 0 && chocadas.length === 0) return { mudadas: 0, chocadas: 0 };

  // Solo las que SE MOVIERON de verdad reescriben una ruta guardada: apuntar el índice a un
  // sitio donde la carpeta no llegó a estar es peor que no tocarlo.
  const hechas: Mudanza[] = [];
  for (const mudanza of mudanzas) {
    try {
      mkdirSync(dirname(mudanza.hacia), { recursive: true });
      mover(mudanza.desde, mudanza.hacia);
      hechas.push(mudanza);
    } catch (error) {
      const motivo = error instanceof Error ? error.message : String(error);
      opciones.escribir(`no se pudo mudar «${mudanza.proyecto}» (${mudanza.entorno}): ${motivo}\n`);
    }
  }

  if (hechas.length > 0) {
    const traducir = (raiz: string): string | undefined => rutaMudada(raiz, hechas);
    // Un fallo de cualquiera de los dos no puede tumbar el arranque de la consola: las
    // copias ya están mudadas, y lo que queda es un ajuste que se vuelve a poner a mano.
    for (const [que, remapear] of [
      // Las dos toman su raíz por parámetros que NO significan lo mismo: `casa` es el HOME
      // (`rutaSettings` le añade `.xonecode`) y la base de las tareas es ya la carpeta
      // `.xonecode`. Se traduce aquí, a la vista, en vez de fiarse de que los dos nombres
      // que se parecen quieran decir lo mismo.
      ["la cola de tareas", () => remapearRaicesDeTareas(join(opciones.casa ?? homedir(), ".xonecode"), traducir)],
      ["las autorizaciones sin aprobación", () => remapearSinAprobacion(opciones.casa, traducir)],
    ] as const) {
      try {
        remapear();
      } catch (error) {
        const motivo = error instanceof Error ? error.message : String(error);
        opciones.escribir(`las copias se mudaron, pero no se pudo actualizar ${que}: ${motivo}\n`);
      }
    }

    // La carpeta vieja se retira SOLO si quedó vacía, y eso lo garantiza `rmdir` por
    // construcción: nunca vacía nada. Un `notas.txt` del usuario ahí dentro la deja en pie,
    // que es la respuesta correcta.
    for (const entorno of new Set(hechas.map((m) => m.entorno))) {
      for (const carpeta of [join(opciones.legado, entorno, "workspace"), join(opciones.legado, entorno)]) {
        retirarSiSobra(carpeta);
      }
    }

    opciones.escribir(
      `${hechas.length} ${hechas.length === 1 ? "copia local mudada" : "copias locales mudadas"} al workspace: ` +
        `${hechas.map((m) => `${m.proyecto} (${m.entorno})`).join(", ")}\n`
    );
  }

  for (const choque of chocadas) {
    // Callarlo dejaría dos copias del mismo proyecto y a nadie sabiendo cuál mira la consola.
    opciones.escribir(
      `«${choque.proyecto}» (${choque.entorno}) NO se mudó: ya hay una copia en el workspace. ` +
        `La vieja sigue donde estaba y no se ha tocado.\n`
    );
  }

  return { mudadas: hechas.length, chocadas: chocadas.length };
}
