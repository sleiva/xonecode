import { posix } from "node:path";

import { rutaDeWorkspace } from "./settings.js";

/**
 * El literal que vivía en MEDIO del reparto: `<base>/<entorno>/workspace/<proyecto>`.
 *
 * Vive aquí y no en `settings.ts` a propósito: `rutaDeWorkspace` ya no lo compone, y
 * dejarlo allí sería una constante de producción que solo usa la mudanza. Cuando no quede
 * nadie con el reparto viejo en disco, este fichero entero se va de una pieza.
 */
export const CARPETA_DEL_REPARTO_VIEJO = "workspace";

/** Una copia local que está en el reparto viejo, y adónde va en el de ahora. */
export interface Mudanza {
  entorno: string;
  proyecto: string;
  desde: string;
  hacia: string;
}

/**
 * Lo que la parte pura necesita saber del disco, y nada más.
 *
 * `listar` devuelve las CARPETAS que cuelgan de una ruta —no los ficheros—: quien la
 * implementa filtra por tipo de entrada, porque un `.DS_Store` es un nombre de segmento
 * perfectamente válido y aquí no habría forma de distinguirlo de un proyecto.
 */
export interface FotoDelLegado {
  existe: (ruta: string) => boolean;
  listar: (ruta: string) => readonly string[];
}

/** Un segmento que no puede salirse de su carpeta ni inventar niveles. */
function esSegmentoLlano(valor: string): boolean {
  return valor !== "" && valor !== "." && valor !== ".." && !/[/\\]/.test(valor);
}

function normalizar(ruta: string): string {
  return posix.normalize(ruta).replace(/\/+$/, "");
}

/** ¿Son la misma ruta, o una es antepasada de la otra? Por SEGMENTOS, nunca por texto. */
function unaCuelgaDeLaOtra(a: string, b: string): boolean {
  const uno = normalizar(a).split("/");
  const otro = normalizar(b).split("/");
  const corto = uno.length <= otro.length ? uno : otro;
  const largo = corto === uno ? otro : uno;
  return corto.every((seg, i) => largo[i] === seg);
}

/**
 * Qué copias locales siguen en el reparto viejo y adónde van.
 *
 * **Por PROYECTO y no por entorno.** Mover la carpeta `<entorno>/workspace` entera parece
 * más barato, pero no vale en el caso de quien ya tenía `settings.workspace` configurado:
 * ahí el destino (`<workspace>/<entorno>`) es el PADRE del origen, y la mudanza de una
 * pieza sería mover una carpeta encima de sí misma. Proyecto a proyecto funciona en los
 * dos casos con un solo camino.
 *
 * **Un destino que ya existe NUNCA se pisa**, y se cuenta aparte en `chocadas` en vez de
 * callarse: en esa carpeta hay una historia de git, unas sesiones y un checkpoint, y dos
 * copias del mismo proyecto sin que nadie lo diga son peor que una mudanza que no se hizo.
 *
 * Nada de esto toca el disco: quien llama decide, mueve y lo cuenta.
 */
export function mudanzasPendientes(
  opciones: {
    /** La base con el reparto VIEJO: `settings.workspace` si estaba puesto, o `~/.xonecode`. */
    legado: string;
    /** El workspace de ahora: `settings.workspace` si está puesto, o `~/.xonecode/workspace`. */
    workspace: string;
    entornos: readonly string[];
  } & FotoDelLegado
): { mudanzas: Mudanza[]; chocadas: Mudanza[] } {
  const mudanzas: Mudanza[] = [];
  const chocadas: Mudanza[] = [];

  for (const entorno of opciones.entornos) {
    if (!esSegmentoLlano(entorno)) continue;
    const vieja = posix.join(opciones.legado, entorno, CARPETA_DEL_REPARTO_VIEJO);
    if (!opciones.existe(vieja)) continue;

    for (const proyecto of opciones.listar(vieja)) {
      if (!esSegmentoLlano(proyecto)) continue;
      const desde = posix.join(vieja, proyecto);
      const hacia = rutaDeWorkspace(opciones.workspace, entorno, proyecto);
      // El degenerado: un proyecto que se llame «workspace» deja `desde` COLGANDO de
      // `hacia` (`…/webstudio/workspace/workspace` → `…/webstudio/workspace`), o sea una
      // carpeta que se muda encima de su propio padre. No es un choque —contarlo ahí diría
      // que hay dos copias— : es que no hay nada que mudar.
      if (unaCuelgaDeLaOtra(desde, hacia)) continue;
      (opciones.existe(hacia) ? chocadas : mudanzas).push({ entorno, proyecto, desde, hacia });
    }
  }

  return { mudanzas, chocadas };
}

/**
 * Una ruta absoluta ya grabada en disco, traducida al reparto de ahora — o AUSENTE si esta
 * mudanza no la toca.
 *
 * Existe por el almacén que tiene raíces absolutas escritas: `proyecto.raiz` del índice de
 * tareas (`~/.xonecode/tareas/indice.json`). Sin reescribirlas, una tarea pendiente abriría
 * una carpeta que ya no está.
 *
 * Fueron DOS: las claves de `settings.sinAprobacion` también eran rutas, y perderlas dejaba
 * sin aplicar una autorización que el usuario dio por puesta. Ese ajuste se retiró cuando el
 * modo de escritura pasó a vivir en la SESIÓN (`core/modoDeEscritura.ts`) y con él se fue su
 * mudanza; esta función sigue siendo general porque el problema no era suyo.
 *
 * Se compara por SEGMENTOS y no por prefijo de texto, la misma trampa que `dentroDelWorkspace`:
 * `…/AppDemoViejo` empieza por `…/AppDemo` y no tiene nada que ver. Y ausente significa «esto
 * no lo mudé yo», que es distinto de «no cambia»: quien llama necesita saber si tocó la
 * entrada para decidir si reescribe el fichero.
 */
export function rutaMudada(ruta: string, mudanzas: readonly Mudanza[]): string | undefined {
  const partes = normalizar(ruta).split("/");
  for (const mudanza of mudanzas) {
    const origen = normalizar(mudanza.desde).split("/");
    if (partes.length < origen.length) continue;
    if (!origen.every((seg, i) => partes[i] === seg)) continue;
    return posix.join(normalizar(mudanza.hacia), ...partes.slice(origen.length));
  }
  return undefined;
}
