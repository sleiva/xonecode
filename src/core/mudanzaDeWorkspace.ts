import { posix, win32 } from "node:path";

import { esRutaDeWindows, rutaDeWorkspace } from "./settings.js";

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

/**
 * Los segmentos de una ruta, con la barra invertida de Windows como separador cuando la ruta
 * es de Windows. Con `posix` a secas, `C:\Users\…` era UN segmento y ni la guarda de anidadas
 * ni `rutaMudada` veían nada dentro de nada.
 */
function segmentos(ruta: string): string[] {
  const windows = esRutaDeWindows(ruta);
  const barras = windows ? ruta.replace(/\\/g, "/") : ruta;
  return posix.normalize(barras).replace(/(?<=.)\/+$/, "").split("/");
}

/** Dos segmentos son el mismo: en Windows sin distinguir mayúsculas, como su disco. */
function mismoSegmento(a: string, b: string, windows: boolean): boolean {
  return windows ? a.toLowerCase() === b.toLowerCase() : a === b;
}

/** ¿`prefijo` es la ruta `ruta` o una antepasada suya? Por SEGMENTOS, nunca por texto. */
function empiezaPor(ruta: string[], prefijo: string[], windows: boolean): boolean {
  return prefijo.length <= ruta.length && prefijo.every((seg, i) => mismoSegmento(seg, ruta[i]!, windows));
}

/** ¿Son la misma ruta, o una es antepasada de la otra? Por SEGMENTOS, nunca por texto. */
function unaCuelgaDeLaOtra(a: string, b: string): boolean {
  const windows = esRutaDeWindows(a) || esRutaDeWindows(b);
  const uno = segmentos(a);
  const otro = segmentos(b);
  return empiezaPor(uno, otro, windows) || empiezaPor(otro, uno, windows);
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
  const partes = segmentos(ruta);
  for (const mudanza of mudanzas) {
    const windows = esRutaDeWindows(ruta) || esRutaDeWindows(mudanza.desde);
    const origen = segmentos(mudanza.desde);
    if (!empiezaPor(partes, origen, windows)) continue;
    // Con las reglas del DESTINO: una base de Windows se compone con `\`.
    return (esRutaDeWindows(mudanza.hacia) ? win32 : posix).join(mudanza.hacia, ...partes.slice(origen.length));
  }
  return undefined;
}

/**
 * Una ruta traducida a través de VARIAS mudanzas, en el orden en que ocurrieron: cada tanda
 * es el plan de un cambio de base, y la salida de una es la entrada de la siguiente.
 *
 * Existe porque `rutaMudada` coge la PRIMERA coincidencia, que dentro de UN plan es correcto
 * (sus orígenes no se solapan) y entre varios no: con ir de A a B y volver a A, una lista plana
 * traducía `A/…` a `B/…` —la ida— aunque la vuelta ya había vaciado `B`, y abrir el proyecto
 * abría una carpeta que no existe. Encadenadas, `A/…` va a `B/…` y vuelve a `A/…`.
 */
export function rutaTrasLasMudanzas(ruta: string, tandas: readonly (readonly Mudanza[])[]): string {
  let actual = ruta;
  for (const tanda of tandas) actual = rutaMudada(actual, tanda) ?? actual;
  return actual;
}

/** Lo que el plan de un cambio de base necesita saber del disco. `listar` son CARPETAS. */
export interface FotoDeLaBase {
  existe: (ruta: string) => boolean;
  listar: (ruta: string) => readonly string[];
}

/**
 * Qué copias hay que MUDAR al cambiar el workspace de `desde` a `hacia`, o por qué no se
 * puede — antes de tocar nada.
 *
 * **Se listan las carpetas REALES** `<desde>/<entorno>/<proyecto>`, no los entornos
 * registrados: quitar un entorno de Ajustes no borra sus copias, y una mudanza que solo mirara
 * la lista las dejaría huérfanas en la base vieja. Lo OCULTO no es un proyecto —las lápidas
 * `.<proyecto>.borrando-…` que un borrado a medias deja (`borrarCopiaDeProyecto`) y las
 * carpetas temporales de una mudanza cortada—, y se queda fuera.
 *
 * Tres noes, y todos antes de copiar un byte:
 * - **una base cuelga de la otra** (o son la misma): copiar una carpeta dentro de sí misma no
 *   termina, y al revés la base vieja pasaría a parecer un entorno de la nueva;
 * - **dentro de la casa de xonecode** (`~/.xonecode`), salvo su `workspace` de omisión: ahí
 *   viven `tareas/`, `agentes/` y `auth.json`, y un entorno llamado igual se mezclaría con
 *   ellos;
 * - **un destino que ya existe**: se NIEGA ENTERO, nunca se pisa. En esa carpeta puede haber
 *   otra historia de git y otro checkpoint, y mudar la mitad dejaría el workspace partido.
 */
export function planDeCambioDeBase(
  opciones: { desde: string; hacia: string; casaXonecode: string } & FotoDeLaBase
): { mudanzas: Mudanza[]; motivo?: string } {
  const { desde, hacia, casaXonecode } = opciones;
  if (unaCuelgaDeLaOtra(desde, hacia)) {
    return {
      mudanzas: [],
      motivo: "la carpeta nueva no puede estar dentro de la de ahora, ni al revés: elige una que no cuelgue de la otra",
    };
  }
  const windows = esRutaDeWindows(hacia) || esRutaDeWindows(casaXonecode);
  const nueva = segmentos(hacia);
  const casa = segmentos(casaXonecode);
  const deOmision = segmentos((esRutaDeWindows(casaXonecode) ? win32 : posix).join(casaXonecode, "workspace"));
  if (empiezaPor(nueva, casa, windows) && !empiezaPor(nueva, deOmision, windows)) {
    return {
      mudanzas: [],
      motivo: "esa carpeta es la de la configuración de XOneCode (tareas, agentes, credenciales): elige otra fuera de ella",
    };
  }

  const mudanzas: Mudanza[] = [];
  const ocupadas: string[] = [];
  const separador = esRutaDeWindows(desde) ? win32 : posix;
  for (const entorno of opciones.listar(desde)) {
    if (!esSegmentoLlano(entorno) || entorno.startsWith(".")) continue;
    for (const proyecto of opciones.listar(separador.join(desde, entorno))) {
      if (!esSegmentoLlano(proyecto) || proyecto.startsWith(".")) continue;
      const mudanza = { entorno, proyecto, desde: separador.join(desde, entorno, proyecto), hacia: rutaDeWorkspace(hacia, entorno, proyecto) };
      if (opciones.existe(mudanza.hacia)) ocupadas.push(`${proyecto} (${entorno})`);
      else mudanzas.push(mudanza);
    }
  }
  if (ocupadas.length > 0) {
    return {
      mudanzas: [],
      motivo: `en la carpeta nueva ya hay ${ocupadas.length === 1 ? "una copia" : "copias"} de ${ocupadas.join(", ")}: no se pisa nada, así que no se muda ninguna`,
    };
  }
  return { mudanzas };
}
