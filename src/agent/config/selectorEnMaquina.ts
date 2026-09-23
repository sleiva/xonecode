/**
 * Abrir el selector de carpeta NATIVO de esta máquina. La regla de QUÉ comando y cómo se lee
 * su respuesta es pura y vive en `core/selectorDeCarpeta.ts`; aquí solo está lanzarlo.
 */

import { execFile, spawn } from "node:child_process";

import {
  carpetaDeLaSalida,
  comandoDelSelector,
  comandoParaAbrirCarpeta,
  TOPE_DEL_SELECTOR_MS,
  type ComandoDeSelector,
} from "../../core/selectorDeCarpeta.js";

/** ¿Hay selector en este sistema? Es lo que decide si se OFRECE el botón: un botón que no
 *  hace nada es peor que no tenerlo, y el campo de texto ya resuelve el caso. */
export function haySelectorDeCarpeta(plataforma: string = process.platform): boolean {
  return comandoDelSelector(plataforma) !== undefined;
}

/**
 * La carpeta que la persona elija, o AUSENTE.
 *
 * **Ausente lo cubre todo lo que no es una elección**: cancelar, que el comando no esté, que
 * falle, o que se agote el tope. No se distinguen a propósito — `osascript` sale con código 1
 * tanto si cierras el diálogo como si revienta, así que afirmar cuál de las dos fue sería
 * inventarlo. Lo que la pantalla necesita saber es si hay carpeta nueva, y eso sí se sabe.
 *
 * **Nunca LANZA.** Esto cuelga de un mensaje del cable, y una excepción aquí subiría por el
 * manejador de la petición.
 */
export async function elegirCarpetaEnMaquina(opciones?: {
  desde?: string;
  plataforma?: string;
  lanzar?: (comando: ComandoDeSelector) => Promise<string>;
}): Promise<string | undefined> {
  const comando = comandoDelSelector(opciones?.plataforma ?? process.platform, opciones?.desde);
  if (comando === undefined) return undefined;
  const lanzar = opciones?.lanzar ?? lanzarDeVerdad;
  try {
    return carpetaDeLaSalida(await lanzar(comando));
  } catch {
    // Cancelar sale por aquí (código 1), igual que un fallo de verdad. Ver arriba.
    return undefined;
  }
}

/**
 * Abre, en el explorador de ficheros de ESTA máquina, la carpeta que contiene `ruta`.
 *
 * Accesorio, como `abrirEnSistema` al arrancar la web: nunca lanza, no espera respuesta ni
 * mira el código de salida —`explorer.exe` sale con uno no-cero también cuando funciona—, y
 * `detached`+`unref` para no dejar el proceso padre esperando a una ventana del sistema.
 */
export function abrirCarpetaDelSistema(ruta: string, plataforma: string = process.platform): void {
  const comando = comandoParaAbrirCarpeta(plataforma, ruta);
  const proceso = spawn(comando.programa, [...comando.argumentos], { detached: true, stdio: "ignore" });
  proceso.on("error", () => {});
  proceso.unref();
}

function lanzarDeVerdad(comando: ComandoDeSelector): Promise<string> {
  return new Promise((resolver, rechazar) => {
    execFile(
      comando.programa,
      [...comando.argumentos],
      // `timeout` mata el proceso al vencer: un diálogo que nadie cierra no puede dejar un
      // proceso vivo para siempre. `windowsHide` no pinta en los dos sistemas que esto
      // soporta, pero tampoco estorba.
      { timeout: TOPE_DEL_SELECTOR_MS, windowsHide: true },
      (error, salida) => (error === null ? resolver(salida) : rechazar(error))
    );
  });
}
