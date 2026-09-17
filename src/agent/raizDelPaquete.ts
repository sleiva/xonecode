/**
 * La raíz del PAQUETE, buscada hacia arriba en vez de contada con `..`.
 *
 * **Por qué existe, y no es higiene.** `RAIZ_SKILLS` (`agent/grafo/skills.ts`) y la raíz de
 * `agent/config/versionEnDisco.ts` se calculaban con `resolve(dirname(...), "..", "..")`: correcto
 * mientras esos dos ficheros vivieran exactamente a dos niveles de la raíz, y **falso en
 * silencio** en cuanto uno se mueve a una subcarpeta. Ese fallo no lo caza `tsc` ni ningún
 * test de tipos: el catálogo de skills sale VACÍO y el modelo se queda sin conocimiento sin
 * que nadie vea un error. Lo mismo en `dist/`, donde `package.json` declara `skills` en la
 * raíz del paquete.
 *
 * Buscar `package.json` hacia arriba quita la dependencia de la profundidad: el resultado es
 * el mismo desde `src/agent/`, desde `src/agent/grafo/` y desde `dist/agent/grafo/`, y
 * también desde `node_modules/xonecode/dist/…` cuando el paquete está instalado. Un fichero
 * puede cambiar de carpeta sin que nadie tenga que acordarse de recontar los puntos.
 *
 * Se resuelve contra ESTE módulo y nunca contra el cwd: el cwd es el proyecto del cliente, así
 * que un `./skills` relativo apuntaría a la app del usuario.
 *
 * **Y no encontrarla LANZA.** Es la regla de «fallar ruidoso, nunca degradar en silencio»: un
 * paquete sin `package.json` por encima está roto, y toda ruta derivada de una raíz adivinada
 * sería falsa. Devolver un valor por omisión aquí es justo el bug mudo que este módulo existe
 * para cerrar.
 */
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** La carpeta de ESTE módulo. El punto de partida por omisión de la búsqueda. */
const AQUI = dirname(fileURLToPath(import.meta.url));

/**
 * Sube desde `desde` hasta la primera carpeta con un `package.json`, o `undefined`.
 *
 * Separada de `raizDelPaquete` para poder probar las dos ramas: sin esto, el caso «no hay
 * ninguna» solo se podría provocar moviendo el repo.
 */
export function buscarRaizDelPaquete(desde: string): string | undefined {
  let actual = resolve(desde);
  // La condición de parada es la raíz del sistema, donde `dirname` devuelve su propio valor.
  for (;;) {
    if (existsSync(resolve(actual, "package.json"))) return actual;
    const padre = dirname(actual);
    if (padre === actual) return undefined;
    actual = padre;
  }
}

/** La raíz del paquete. Lanza si no la hay: ver la cabecera. */
export function raizDelPaquete(desde: string = AQUI): string {
  const raiz = buscarRaizDelPaquete(desde);
  if (raiz === undefined) {
    throw new Error(
      `instalación de xonecode inservible: no hay ningún package.json por encima de ${desde}`
    );
  }
  return raiz;
}
