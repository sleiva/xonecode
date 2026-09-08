import { resolve, sep } from "node:path";

/**
 * La ruta REAL de una ruta VIRTUAL del backend del agente, o `undefined` si se sale del
 * proyecto.
 *
 * El backend del agente es un `FilesystemBackend` con `virtualMode: true`, así que lo que el
 * modelo escribe —y lo que llega en los argumentos de un `interrupt`— viene ROOTEADO en el
 * proyecto: `/app.xne`, `/artefactos/x.html`. Es la forma que usan las descripciones de las
 * tools, las skills y el predicado `seDetieneEn`.
 *
 * Y ahí estaba la trampa, medida: `resolve(raiz, "/app.xne")` devuelve `/app.xne`, porque una
 * ruta absoluta DESCARTA la base. Quien leyera el disco así con la forma rooteada no
 * encontraba nada — con la relativa sí, que es por lo que pasó desapercibido: el test que lo
 * cubría usaba `"app.xne"` sin barra. En el ANTES del diff de una aprobación eso significaba
 * un fichero existente enseñado como si fuera NUEVO, con sus líneas quitadas invisibles. Es
 * el peor sitio posible para una media verdad: el diff de la aprobación es el único momento
 * en que alguien ve lo que el agente va a escribir antes de que exista.
 *
 * Las dos formas se aceptan —la relativa y la rooteada— porque las dos funcionan contra el
 * backend y por tanto las dos pueden llegar. Los separadores se normalizan antes de resolver:
 * en POSIX `resolve` trata «\» como un carácter más del nombre, la misma lección que ya pagó
 * `leerFicheroDeProyecto`.
 *
 * La contención se comprueba porque `..` sí puede salir del proyecto, y de aquí sale una
 * lectura de disco: sin ella, el contenido de un fichero de FUERA acabaría en la pantalla de
 * la aprobación. Es lexical y no `realpath` —esta función es pura y no toca disco—, así que
 * quien necesite además cerrar los enlaces simbólicos recomprueba después, como hace
 * `arbolDeProyecto.ts`.
 */
export function rutaRealDeVirtual(raiz: string, virtual: string): string | undefined {
  const normal = virtual.split(/[\\/]/).filter((s) => s.length > 0).join("/");
  if (normal.length === 0) return undefined;
  const real = resolve(raiz, normal);
  // Se exige estar DEBAJO, no «dentro o ser»: la raíz misma no es un fichero que leer, y un
  // «.» o un «/» resuelven a ella. Devolverla haría que el llamante intentara leer un
  // directorio y se llevara un `EISDIR` donde esperaba texto.
  const dentro = resolve(raiz);
  const prefijo = dentro.endsWith(sep) ? dentro : dentro + sep;
  return real.startsWith(prefijo) ? real : undefined;
}
