/**
 * El nombre con el que se SUBE un adjunto: un segmento llano, derivado del que trae el
 * fichero.
 *
 * **Esto CONVIERTE, no valida**, y la diferencia es lo que hace que no sea una segunda copia
 * peligrosa de la regla del servidor. Quien decide si un nombre vale es
 * `core/adjuntos.ts#nombreDeAdjuntoAceptable`, dos veces —en la ruta de subida y dentro del
 * puerto de disco—; esto solo intenta dejar el nombre en una forma que aquella acepte. Si
 * divergieran, la subida falla A LA VISTA (403 con su motivo en la fila del fichero), que es
 * la dirección correcta: nunca se cuela nada.
 *
 * Vive aquí y no se importa de `src/` porque `src/web/frontera.test.ts` prohíbe compartir
 * módulo entre el cliente y el host — la misma situación declarada que la copia de
 * `urlDeMcpAceptable` del cliente.
 *
 * **Y hace falta de verdad, no es celo**: medido, una captura de macOS se llama
 * «Screenshot 2026-09-08 at 17.03.12.png», con espacios. Sin esta conversión el caso más
 * común de todos —arrastrar una captura— daría 403 y la ventana no serviría para nada.
 */

/** Tope del nombre. De él se compone un nombre de fichero en disco, y 255 es el límite de
 *  muchos sistemas contando la extensión; 120 deja sitio de sobra y sigue siendo legible. */
const TOPE = 120;

export function nombreDeAdjuntoSeguro(nombre: string): string | undefined {
  // El ÚLTIMO segmento y nada más: un `<input>` con carpetas da rutas relativas, y una
  // barra (de las dos) no puede acabar formando parte del nombre que se manda.
  const hoja = nombre.split(/[\\/]+/).at(-1) ?? "";
  // Lo que no es ASCII llano pasa a `_`. No se BORRA: borrarlo pegaría palabras («diseño
  // ñu» → «diseonu») y dos ficheros distintos podrían acabar con el mismo nombre.
  const llano = hoja.replace(/[^A-Za-z0-9._-]/g, "_");
  // `.` y `..` no son nombres, y una cadena vacía tampoco. No se inventa uno: eso
  // esconderia que el fichero elegido no se puede nombrar aquí. Un `...` sí es un nombre
  // (raro, pero un segmento llano y contenido), y el servidor lo acepta: no se toca.
  if (llano === "" || llano === "." || llano === "..") return undefined;
  return acotado(llano);
}

/**
 * Acota el nombre CONSERVANDO la extensión.
 *
 * Cortar por el final se la llevaría, y de la extensión sale el mime (`mimeDeAdjunto`): un
 * `.png` recortado a secas dejaría al agente y al visor sin saber de qué es el fichero.
 */
function acotado(nombre: string): string {
  if (nombre.length <= TOPE) return nombre;
  const punto = nombre.lastIndexOf(".");
  // Una «extensión» de más de 12 caracteres no es una extensión: es un nombre con puntos.
  const extension = punto > 0 && nombre.length - punto <= 12 ? nombre.slice(punto) : "";
  return nombre.slice(0, TOPE - extension.length) + extension;
}
