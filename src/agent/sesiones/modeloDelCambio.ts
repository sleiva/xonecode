/**
 * El diff SEMÁNTICO de un `.xne` de Revisión: el modelo de sus colecciones en el «antes» y
 * ahora, comparado por `core/diffDeColecciones.ts`.
 *
 * **Los dos extremos se leen con el MISMO cargador** (`modeloEnDisco`, el de `xone_navegacion`),
 * y por eso el «antes» se reconstruye ENTERO en una carpeta temporal con `git archive` en vez de
 * leer solo ese fichero: el linter resuelve un `.xne` dentro de su proyecto (`app.xml`, lo que
 * incluye, de quién hereda), y un parser de un fichero suelto sería un segundo sitio donde
 * decidir qué es un campo. El «antes» es el MISMO extremo que el parche de Revisión
 * (`antesDelFichero`), así que el bloque y el diff de texto hablan de la misma diferencia.
 *
 * Se paga solo al desplegar un `.xne`, y la carpeta se borra siempre. Nada de esto cruza el
 * cable salvo el resultado, que son nombres del proyecto.
 */
import { execFile } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { diffDeColecciones, type CambiosDeUnaColeccion } from "../../core/diffDeColecciones.js";
import type { ColeccionDeNavegacion } from "../../core/navegacion.js";
import { modeloEnDisco } from "../navegacion/indiceEnDisco.js";
import { ficherosDelProyecto } from "../turno/ficherosDelProyecto.js";
import { antesDelFichero } from "./sesionGit.js";

const ejecutar = promisify(execFile);

/** Las colecciones que un proyecto declara EN ese fichero (ruta relativa). */
async function coleccionesDe(raiz: string, ruta: string): Promise<ColeccionDeNavegacion[]> {
  const modelo = await modeloEnDisco(raiz)(ficherosDelProyecto(raiz));
  const virtual = `/${ruta}`;
  return modelo.colecciones.filter((c) => c.fichero === virtual);
}

/**
 * Los cambios del modelo de un fichero de la sesión, o `undefined` si no hay «antes» que usar
 * (una sesión sin marca) o no se pudo reconstruir. Un fichero que no es `.xne` no tiene modelo
 * que comparar: lista vacía, sin gastar un `git archive`.
 */
export async function modeloDelCambio(raiz: string, sesion: string, ruta: string): Promise<CambiosDeUnaColeccion[] | undefined> {
  if (!ruta.toLowerCase().endsWith(".xne")) return [];
  const antes = await antesDelFichero(raiz, sesion, ruta);
  if (antes === undefined) return undefined;
  const ahora = await coleccionesDe(raiz, ruta);
  if (antes.vacio) return diffDeColecciones([], ahora);

  const temporal = mkdtempSync(join(tmpdir(), "xonecode-antes-"));
  try {
    // Los árboles se escriben desde la raíz del REPO y el proyecto puede colgar de una
    // subcarpeta: se saca solo su prefijo, que queda en la raíz de la carpeta temporal.
    const { stdout } = await ejecutar("git", ["rev-parse", "--show-toplevel", "--show-prefix"], { cwd: raiz });
    const [raizDelRepo = raiz, prefijoCrudo = ""] = stdout.split("\n");
    const prefijo = prefijoCrudo.trim().replace(/\/$/, "");
    const arbol = prefijo === "" ? antes.ref : `${antes.ref}:${prefijo}`;
    const tar = join(temporal, "antes.tar");
    const proyecto = join(temporal, "proyecto");
    // Desde la raíz del REPO y no desde la del proyecto: `git archive` lanzado en una
    // subcarpeta se limita a ella, y sobre un subárbol ya recortado por el prefijo ese filtro
    // se aplica dos veces y el tar sale VACÍO (medido).
    await ejecutar("git", ["archive", "--format=tar", "-o", tar, arbol], { cwd: raizDelRepo.trim() });
    mkdirSync(proyecto);
    await ejecutar("tar", ["-xf", tar, "-C", proyecto]);
    return diffDeColecciones(await coleccionesDe(proyecto, ruta), ahora);
  } catch {
    return undefined;
  } finally {
    rmSync(temporal, { recursive: true, force: true });
  }
}
