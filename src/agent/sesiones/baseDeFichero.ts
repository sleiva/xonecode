/**
 * La BASE contra la que el editor de la pestaña Ficheros pinta sus marcas: el fichero como estaba
 * al abrir la sesión (`refs/xonecode/sesion/<id>`, la foto de `sesionGit.ts#fotoDeApertura`) o en
 * el último commit (`HEAD`). El cálculo de trozos lo hace el cliente; aquí solo se trae el texto.
 *
 * Tres respuestas, y son tres cosas distintas: `texto` (había una versión), `vacio` (en esa base el
 * fichero no existía: todo él es nuevo) y `sinBase` con el motivo (no hay con qué comparar). Fundir
 * la tercera en un texto vacío pintaría el fichero entero de verde, que es afirmar algo falso.
 *
 * Las guardas de ruta son las de leer (`resolverEnProyecto`) y se pasan ANTES de tocar git: una
 * ruta que la pestaña no enseña tampoco sale de un commit viejo. Y a git se le da la ruta REAL
 * relativa (`relativa`), no la tecleada, con `./` delante para que se resuelva desde la carpeta
 * del proyecto aunque este cuelgue de un repo mayor (`instantanea.ts` sostiene ese caso).
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolverEnProyecto, TOPE_DE_FICHERO } from "../grafo/arbolDeProyecto.js";
import { refDeSesion } from "./sesionGit.js";
import { decodificarWindows1252, esUtf8Valido } from "../../core/codificacion.js";

const ejecutar = promisify(execFile);

export type BaseDeComparacion = "sesion" | "commit";

export interface BaseLeida {
  ruta: string;
  base: BaseDeComparacion;
  texto?: string;
  vacio?: true;
  sinBase?: string;
}

export async function baseDeFichero(
  raiz: string,
  sesion: string | undefined,
  ruta: string,
  base: BaseDeComparacion
): Promise<BaseLeida> {
  const sin = (motivo: string): BaseLeida => ({ ruta, base, sinBase: motivo });
  const resuelta = await resolverEnProyecto(raiz, ruta);
  if ("error" in resuelta) return sin(resuelta.error);
  if (!(await enUnRepositorio(raiz))) return sin("el proyecto no está en un repositorio git");

  let revision: string;
  if (base === "sesion") {
    // El mismo texto que `modeloDelCambio` usa para lo mismo: sin sesión no hay «antes».
    if (sesion === undefined) return sin("la sesión todavía no ha empezado");
    const ref = refDeSesion(sesion);
    if (ref === undefined || !(await existeArbol(raiz, ref))) {
      return sin("esta sesión no tiene foto de su inicio: se abrió sin git usable");
    }
    revision = ref;
  } else {
    if (!(await existeArbol(raiz, "HEAD"))) return sin("el repositorio todavía no tiene ningún commit");
    revision = "HEAD";
  }

  const objeto = `${revision}:./${resuelta.relativa}`;
  try {
    await ejecutar("git", ["cat-file", "-e", objeto], { cwd: raiz });
  } catch {
    return { ruta, base, vacio: true };
  }
  let salida: Buffer;
  try {
    // `cat-file blob` y no `show`: el contenido crudo del blob, sin textconv ni filtros. El
    // `maxBuffer` un poco por encima del tope: lo que lo pasa no se compara (ver abajo).
    const r = await ejecutar("git", ["cat-file", "blob", objeto], { cwd: raiz, encoding: "buffer", maxBuffer: TOPE_DE_FICHERO + 1024 });
    salida = r.stdout;
  } catch {
    return sin("git no pudo leer esa versión del fichero, o pasa del tope que se compara");
  }
  if (salida.length > TOPE_DE_FICHERO) return sin("esa versión del fichero pasa del tope que se compara");
  // Estricto, y quitando el BOM igual que la lectura (`TextDecoder` por omisión): la base y el
  // texto del editor tienen que haberse decodificado igual o la primera línea saldría cambiada.
  // Por lo mismo, lo que no es UTF-8 se decodifica con el MISMO windows-1252 que la lectura
  // (`core/codificacion.ts`): un `.xne` latin1 se edita, y sin base no tendría marcas.
  if (esUtf8Valido(salida)) return { ruta, base, texto: new TextDecoder("utf-8").decode(salida) };
  return { ruta, base, texto: decodificarWindows1252(salida) };
}

async function enUnRepositorio(raiz: string): Promise<boolean> {
  try {
    await ejecutar("git", ["rev-parse", "--is-inside-work-tree"], { cwd: raiz });
    return true;
  } catch {
    return false;
  }
}

/** `^{tree}` porque la ref de una sesión apunta a un ÁRBOL y la de `HEAD` a un commit: vale para los dos. */
async function existeArbol(raiz: string, revision: string): Promise<boolean> {
  try {
    await ejecutar("git", ["rev-parse", "--verify", "--quiet", `${revision}^{tree}`], { cwd: raiz });
    return true;
  } catch {
    return false;
  }
}
