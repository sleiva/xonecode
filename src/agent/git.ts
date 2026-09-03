/**
 * Lo que `instantanea.ts` (la foto del ANTES por turno) y `gitSync.ts` (el libro de
 * cuentas de la subida a CloudStudio) necesitan de git y no depende de para qué lo usa
 * cada uno. Estaba copiado en los dos ficheros y ya había DIVERGIDO — este módulo es la
 * única fuente de esa lógica de aquí en adelante.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Las tres clases de cambio que le importan a xonecode. No hay una cuarta. */
export type ClaseDeCambio = "nuevo" | "modificado" | "borrado";

/**
 * Índice de git propio y temporal, para poder construir un árbol (`git add` + `write-tree`
 * o `commit-tree`) sin pasar por el índice de verdad.
 *
 * Existe porque el usuario puede tener trabajo a medias en SU staging cuando xonecode
 * necesita fotografiar el árbol (al empezar un turno, o al hacer un `/sync`) — tocárselo
 * sería imperdonable: perdería la frontera entre lo que él decidió `add`-ear y lo que no.
 * Un índice aparte, en un directorio temporal que se limpia al terminar, dejar hacer todo
 * esto sin que el índice real se entere de que existió.
 *
 * `etiqueta` solo distingue el prefijo del directorio temporal entre llamadores (útil para
 * reconocer de quién es un directorio huérfano si algo no limpia bien); no cambia el
 * comportamiento.
 */
export function indicePrivado(etiqueta: string): { ruta: string; limpiar: () => void } {
  const dir = mkdtempSync(join(tmpdir(), `xonecode-${etiqueta}-`));
  return { ruta: join(dir, "git.index"), limpiar: () => rmSync(dir, { recursive: true, force: true }) };
}

/**
 * Traduce la marca de una línea de `git diff --name-status` (la primera letra: `A`, `M`,
 * `D`, `R100`, …) a una de las tres clases de `Cambio`/`CambioLocal`.
 *
 * Esto es la parte que había divergido: `gitSync.ts` mapeaba `T` (cambio de tipo, p.ej.
 * fichero → symlink) a `modificado` pero DESCARTABA en silencio cualquier marca que no
 * reconociera; `instantanea.ts` no mapeaba `T` pero usaba `?? "modificado"` como omisión
 * para lo desconocido. La regla unificada, pensada por caso de uso y no promediada:
 *
 * - `A` es alta limpia (`nuevo`) y `D` es baja limpia (`borrado`): son las dos únicas
 *   marcas que hay que distinguir de un cambio de contenido, porque de ellas depende el
 *   candado de `planDeSubida` (solo se borra lo que se descargó) y el alta/baja del plan.
 * - CUALQUIER OTRA MARCA —`M`, `R`, `C`, `T`, o una que git añada mañana y que hoy no
 *   conocemos— se trata como `modificado`. Para `instantanea.ts` (la foto del ANTES: solo
 *   alimenta el deshacer y el diff que lee el modelo) tratar de más como "cambiado" cuesta,
 *   como mucho, una línea de diff rara. Para `gitSync.ts` (el plan de subida) la alternativa
 *   —descartar la línea, que es lo que hacía antes— es el peor fallo posible: una marca
 *   perdida es un fichero que ni sube ni se borra en CloudStudio, y nada avisa de ello. Entre
 *   "invisible por defecto" y "visible por defecto", esto último es lo seguro en los dos
 *   sitios, así que gana en los dos. `T` en concreto sigue el mismo criterio: es un cambio
 *   de contenido (el fichero pasó de ser una cosa a ser otra), no un alta ni una baja.
 */
export function claseDeCambio(marca: string): ClaseDeCambio {
  const letra = marca.charAt(0);
  if (letra === "A") return "nuevo";
  if (letra === "D") return "borrado";
  return "modificado";
}
