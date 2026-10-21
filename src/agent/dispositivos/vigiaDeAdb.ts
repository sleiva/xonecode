/**
 * El VIGÍA de lo que se enchufa y se desenchufa: `adb track-devices`, el canal de AVISOS del
 * propio demonio de adb.
 *
 * **No es un sondeo**, y por eso no rompe la regla de «la foto de la máquina no se refresca
 * sola» (`apps/web/src/medirAlVolver.ts`): es UNA conexión que se queda callada hasta que la lista
 * de aparatos cambia —un USB que entra o sale, un emulador que arranca o se apaga, un «no
 * autorizado» que pasa a «device»—. Lo que dispara la medida sigue siendo un acto de la persona:
 * enchufar el móvil. Sin cambios no se lanza ningún proceso.
 *
 * El protocolo (medido en la máquina de desarrollo): bloques `HHHH<carga>`, la longitud en cuatro
 * cifras hexadecimales y la carga una línea `serie\testado` por aparato. El PRIMER bloque es la lista
 * de ahora y no es un cambio. En Windows la salida llega con `\r\n` y la longitud solo cuenta el
 * `\n`, así que los `\r` se quitan antes de partir.
 *
 * **Si adb se muere, se vuelve a lanzar** con espera creciente (`REINTENTOS_DEL_VIGIA_MS`): el
 * vigía sale en cuanto alguien reinicia el demonio (`adb kill-server`, los scripts de hotswap). Sin
 * adb en la máquina se reintenta igual, al ritmo más lento: se puede instalar desde Ajustes.
 * **Límite declarado**: iOS no tiene equivalente aquí; un iPhone que se enchufa se ve al volver a la
 * ventana o con «Refrescar».
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { type AjustesDeDispositivos, seMira } from "../../core/settings.js";
import { localizadorDeAndroid } from "./dispositivosEnMaquina.js";

/** Cuánto se espera tras un aviso antes de medir: enchufar suelta varios (`offline` → `unauthorized` → `device`). */
export const PAUSA_DEL_VIGIA_MS = 800;
/** Las esperas antes de relanzar un vigía que murió; la última se repite. */
export const REINTENTOS_DEL_VIGIA_MS = [2_000, 5_000, 15_000, 60_000] as const;

/** Lo mínimo de un proceso hijo que el vigía usa: así un test lo dobla sin lanzar nada. */
export interface ProcesoDelVigia {
  stdout: { on(evento: "data", oyente: (trozo: Buffer | string) => void): unknown } | null;
  on(evento: "exit" | "error", oyente: () => void): unknown;
  kill(): unknown;
}

export interface DependenciasDelVigia {
  /** Dónde está adb AHORA, o nada. Se pregunta en cada arranque: puede instalarse después. */
  adb?: () => string | undefined;
  /** Los ajustes de destino, leídos en cada arranque (por omisión `{}`, «se miran todos»). */
  ajustes?: () => AjustesDeDispositivos;
  lanzar?: (binario: string, args: string[]) => ProcesoDelVigia;
  programar?: (fn: () => void, ms: number) => unknown;
  cancelar?: (temporizador: unknown) => void;
}

/**
 * Parte lo que va llegando en bloques completos. Devuelve los bloques y lo que sobra (un bloque a
 * medias). Lo que no empieza por cuatro cifras hexadecimales no es el protocolo: se toma ENTERO
 * como un bloque, para que un adb que cambie el formato siga avisando en vez de callarse.
 */
export function partirBloques(pendiente: string): { bloques: string[]; resto: string } {
  const bloques: string[] = [];
  let resto = pendiente.replace(/\r/g, "");
  while (resto.length >= 4) {
    const cabecera = resto.slice(0, 4);
    if (!/^[0-9a-fA-F]{4}$/.test(cabecera)) {
      bloques.push(resto);
      return { bloques, resto: "" };
    }
    const largo = Number.parseInt(cabecera, 16);
    if (resto.length < 4 + largo) break;
    bloques.push(resto.slice(4, 4 + largo));
    resto = resto.slice(4 + largo);
  }
  return { bloques, resto };
}

/** La lista de un bloque, ordenada: el mismo conjunto en otro orden no es un cambio. */
function normalizar(bloque: string): string {
  return bloque
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "")
    .sort()
    .join("\n");
}

/**
 * El adb que vigila: el MISMO que usa la medida (`detectarDispositivos`). Con los dos destinos de
 * Android apagados en Ajustes no hay ninguno: apagar un destino deja de lanzar procesos. **Límite**:
 * un vigía ya en marcha no se para al apagarlos; lo que dispara es una medida, que sí los respeta.
 */
export function adbDelVigia(ajustes: AjustesDeDispositivos): string | undefined {
  if (!seMira(ajustes, "android") && !seMira(ajustes, "androidEmulador")) return undefined;
  const propia = ajustes.rutaAdb?.trim();
  if (propia !== undefined && propia !== "") return existsSync(propia) ? propia : undefined;
  return localizadorDeAndroid({ plataforma: process.platform, entorno: process.env, home: homedir(), existe: existsSync }).enSdk(
    "adb",
    "platform-tools"
  );
}

/**
 * Arranca el vigía. `alCambiar` se llama, agrupado por `PAUSA_DEL_VIGIA_MS`, cada vez que la lista
 * de aparatos de adb deja de ser la de antes. `parar` mata el proceso y no deja nada programado.
 */
export function vigilarDispositivosAndroid(alCambiar: () => void, deps: DependenciasDelVigia = {}): { parar: () => void } {
  const adb = deps.adb ?? (() => adbDelVigia(deps.ajustes?.() ?? {}));
  const lanzar = deps.lanzar ?? ((binario, args) => spawn(binario, args, { stdio: ["ignore", "pipe", "ignore"], windowsHide: true }));
  const programar = deps.programar ?? ((fn, ms) => setTimeout(fn, ms));
  const cancelar = deps.cancelar ?? ((t) => clearTimeout(t as ReturnType<typeof setTimeout>));

  let parado = false;
  let proceso: ProcesoDelVigia | undefined;
  let fallos = 0;
  let reintento: unknown;
  let pausa: unknown;
  // La última lista vista, de TODAS las vidas del vigía: un adb que se relanza vuelve a contar la
  // lista de ahora, y si es la misma no es un cambio.
  let ultima: string | undefined;

  const avisar = (): void => {
    if (pausa !== undefined) cancelar(pausa);
    pausa = programar(() => {
      pausa = undefined;
      if (!parado) alCambiar();
    }, PAUSA_DEL_VIGIA_MS);
  };

  const reprogramar = (): void => {
    if (parado) return;
    const ms = REINTENTOS_DEL_VIGIA_MS[Math.min(fallos, REINTENTOS_DEL_VIGIA_MS.length - 1)]!;
    fallos += 1;
    reintento = programar(() => {
      reintento = undefined;
      arrancar();
    }, ms);
  };

  const arrancar = (): void => {
    if (parado) return;
    const binario = adb();
    if (binario === undefined) {
      reprogramar();
      return;
    }
    let pendiente = "";
    let muerto = false;
    const morir = (): void => {
      if (muerto) return;
      muerto = true;
      proceso = undefined;
      reprogramar();
    };
    try {
      proceso = lanzar(binario, ["track-devices"]);
    } catch {
      morir();
      return;
    }
    proceso.on("error", morir);
    proceso.on("exit", morir);
    proceso.stdout?.on("data", (trozo) => {
      const { bloques, resto } = partirBloques(pendiente + trozo.toString());
      pendiente = resto;
      for (const bloque of bloques) {
        // Un bloque leído es un vigía vivo: la próxima muerte vuelve a esperar poco.
        fallos = 0;
        const lista = normalizar(bloque);
        if (ultima !== undefined && lista !== ultima) avisar();
        ultima = lista;
      }
    });
  };

  arrancar();
  return {
    parar: () => {
      parado = true;
      if (pausa !== undefined) cancelar(pausa);
      if (reintento !== undefined) cancelar(reintento);
      try {
        proceso?.kill();
      } catch {
        // Ya estaba muerto: no hay nada que parar.
      }
      proceso = undefined;
    },
  };
}
