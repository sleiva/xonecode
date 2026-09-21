/**
 * Publicar un plan: sacarlo del estado de trabajo y meterlo en el proyecto.
 *
 * El porqué del reparto está en `core/planes.ts`. Aquí solo vive lo que toca disco, y las
 * tres reglas que no pueden salir de un prompt:
 *
 * - **El destino lo DERIVA el código** del nombre del plan (`rutaPublicaDelPlan`), nunca se
 *   recibe. Con un destino por parámetro esto sería una forma de escribir cualquier fichero
 *   del proyecto saltándose la aprobación — la misma trampa que `rutaDePdf` evita.
 * - **No se sigue un enlace simbólico** (`lstat`): un enlace dentro de la carpeta del plan
 *   apuntando fuera copiaría lo que hubiera al otro lado, y el `realpath` del ORIGEN no basta
 *   porque lo que se recorre son sus hijos. El mismo cuidado que el árbol de la pestaña
 *   Ficheros.
 * - **Se comprueba que lo copiado cae DENTRO de la carpeta publicada**, sobre el camino ya
 *   compuesto. Es barato y cierra el hueco que dejaría un nombre de fichero raro.
 */
import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import {
  CARPETA_DE_PLANES,
  motivoDePlanInaceptable,
  rutaPublicaDelPlan,
} from "../core/planes.js";

export interface PlanPublicado {
  /** Relativa a la raíz, que es como se enseña y como entra en git. */
  ruta: string;
  /** Qué se copió, por nombre relativo a la carpeta del plan. */
  ficheros: string[];
}

/** ¿`hijo` cae dentro de `padre`? Por SEGMENTO, nunca por `startsWith` de texto. */
function dentro(padre: string, hijo: string): boolean {
  const rel = relative(padre, hijo);
  return rel !== "" && !rel.startsWith("..") && !rel.startsWith(`..${sep}`) && !resolve(hijo).includes("\0");
}

/**
 * Los ficheros de una carpeta, recorriendo subcarpetas y **sin pasar por un enlace**.
 *
 * Devuelve rutas relativas a `raiz`. Un enlace —a fichero o a carpeta— se salta y se cuenta
 * como no copiado: lo que se publica es lo que el plan tiene dentro, no lo que apunta a otro
 * sitio del disco.
 */
function ficherosDe(raiz: string, dentroDe = ""): string[] {
  const salida: string[] = [];
  for (const entrada of readdirSync(join(raiz, dentroDe), { withFileTypes: true })) {
    const rel = dentroDe === "" ? entrada.name : join(dentroDe, entrada.name);
    // `withFileTypes` ya distingue el enlace sin resolverlo, y aun así se comprueba con
    // `lstat` en el caso de carpeta: es la barrera, no una optimización.
    if (entrada.isSymbolicLink()) continue;
    if (entrada.isDirectory()) {
      if (!lstatSync(join(raiz, rel)).isDirectory()) continue;
      salida.push(...ficherosDe(raiz, rel));
      continue;
    }
    if (entrada.isFile()) salida.push(rel);
  }
  return salida;
}

/**
 * Copia `<raiz>/.xonecode/planes/<nombre>` a `<raiz>/doc/planes/<nombre>`.
 *
 * Devuelve `{error}` en vez de lanzar, como las guardas del backend: el llamador es un
 * comando de consola y lo que tiene que hacer con un no es decirlo, no reventar.
 */
export function publicarPlan(opciones: { raiz: string; nombre: string }): PlanPublicado | { error: string } {
  const { raiz, nombre } = opciones;
  const motivo = motivoDePlanInaceptable(nombre);
  if (motivo !== undefined) return { error: `«${nombre}» no vale como nombre de plan: ${motivo}` };

  const origen = join(raiz, CARPETA_DE_PLANES, nombre);
  if (!existsSync(origen) || !statSync(origen).isDirectory()) {
    return { error: `no hay ningún plan «${nombre}». Mira cuáles hay con /plan` };
  }

  const relativaPublica = rutaPublicaDelPlan(nombre);
  // No puede pasar —el nombre ya se validó arriba—, pero componer una ruta con un
  // `undefined` es exactamente cómo esto se convertiría en otra cosa.
  if (relativaPublica === undefined) return { error: `«${nombre}» no vale como nombre de plan` };
  const destino = join(raiz, relativaPublica);

  const ficheros = ficherosDe(origen);
  if (ficheros.length === 0) return { error: `el plan «${nombre}» está vacío: no hay nada que publicar` };

  mkdirSync(destino, { recursive: true });
  for (const fichero of ficheros) {
    const desde = join(origen, fichero);
    const hasta = join(destino, fichero);
    // La comprobación final, sobre el camino YA compuesto y en los dos lados.
    if (!dentro(origen, desde) || !dentro(destino, hasta)) {
      return { error: `«${fichero}» se sale de la carpeta del plan, así que no se publica nada` };
    }
    mkdirSync(join(hasta, ".."), { recursive: true });
    cpSync(desde, hasta, { dereference: false });
  }
  return { ruta: relativaPublica, ficheros };
}

/** Los planes que hay en el proyecto, por nombre. Vacío si nadie ha planificado. */
export function planesDelProyecto(raiz: string): string[] {
  const carpeta = join(raiz, CARPETA_DE_PLANES);
  if (!existsSync(carpeta)) return [];
  return readdirSync(carpeta, { withFileTypes: true })
    .filter((e) => e.isDirectory() && motivoDePlanInaceptable(e.name) === undefined)
    .map((e) => e.name)
    .sort();
}
