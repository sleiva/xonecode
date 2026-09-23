import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { falloLegible, registroDeFallo, type RegistroDeFallo } from "../../core/fallos.js";

export const NOMBRE_REGISTRO_DE_FALLOS = "fallos.jsonl";

/**
 * Cómo se NOMBRA el registro ante quien acaba de ver el error: relativo a la raíz del
 * proyecto. La ruta absoluta lleva el nombre de la cuenta del sistema y viajaba por el cable
 * dentro del aviso («Queda apuntado en /Users/…»), y ninguna ruta de la máquina viaja por
 * ahí; además era la línea que, sin partir, sacaba la barra de scroll horizontal del chat.
 */
export const RUTA_VISIBLE_DE_FALLOS = `.xonecode/${NOMBRE_REGISTRO_DE_FALLOS}`;

/** Dónde queda, para poder decírselo a quien acaba de ver el error. */
export function rutaDeFallos(raiz: string): string {
  return join(raiz, ".xonecode", NOMBRE_REGISTRO_DE_FALLOS);
}

export interface RegistroDeFallos {
  /** Apunta el fallo y devuelve el texto pegable, o `undefined` si no se pudo escribir. */
  anotar(fallo: {
    error: unknown;
    peticion?: string;
    modelos?: Record<string, string>;
    pasos?: readonly string[];
  }): { ruta: string; legible: string } | undefined;
}

/**
 * El registro de fallos de un proyecto. **Siempre encendido, y ésa es la decisión.**
 *
 * La traza de tools es opt-in (`XONECODE_TRACE_TOOLS`) y tiene sentido: se enciende cuando
 * vas a MEDIR. Esto es lo contrario — un fallo no se planea, y el problema de una bandera
 * es exactamente que cuando pasó no estaba puesta. Toda la investigación de hoy se hizo
 * sobre lo que se pudo pegar del chat, con el error truncado y sin saber ni el modelo.
 *
 * Se puede permitir estar siempre porque solo escribe cuando algo revienta y lo que
 * escribe cabe en una pantalla: ni prompts, ni argumentos, ni contenido de ficheros (ver
 * `core/fallos.ts`). Un turno normal no toca este fichero.
 *
 * Síncrono y con el fallo tragado, como la traza: anotar un error no puede provocar otro,
 * y un `appendFileSync` de trescientos bytes que se pierde si el proceso muere sería justo
 * el caso en el que hacía falta.
 */
export function crearRegistroDeFallos(raiz: string): RegistroDeFallos {
  return {
    anotar: (fallo) => {
      let registro: RegistroDeFallo;
      try {
        registro = registroDeFallo(fallo);
      } catch {
        // Ni siquiera componer el registro puede tumbar nada: si el error es tan raro que
        // no se deja describir, se pierde el registro y no el turno.
        return undefined;
      }
      const ruta = rutaDeFallos(raiz);
      try {
        mkdirSync(join(raiz, ".xonecode"), { recursive: true });
        appendFileSync(ruta, `${JSON.stringify(registro)}\n`, "utf8");
      } catch {
        // Sin disco donde escribir sigue habiendo algo que enseñar: el texto se devuelve
        // igual. Lo que se pierde es la copia, no la información.
        return { ruta, legible: falloLegible(registro) };
      }
      return { ruta, legible: falloLegible(registro) };
    },
  };
}
