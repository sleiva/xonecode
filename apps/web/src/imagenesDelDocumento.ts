/**
 * La ruta que sirve una imagen del proyecto, COPIADA del host (`core/imagenesDeDocumento.ts`
 * `#RUTA_IMAGEN_DEL_PROYECTO`) porque la frontera prohíbe compartir módulo; el test la ata al texto.
 */
export const RUTA_IMAGEN_DEL_PROYECTO = "/imagen-del-proyecto";

/**
 * La vista de un markdown lista para el visor: cada enlace a la ruta de imágenes, con el ORIGEN de
 * la página delante. Hace falta porque `MarkdownText` solo pinta imágenes con URL `http(s)`
 * ABSOLUTA —una ruta relativa se queda en su texto alternativo—, y el origen solo lo sabe el
 * navegador: por un túnel no es el del servidor.
 */
export function vistaParaElVisor(vista: string, origen: string): string {
  return vista.split(`](${RUTA_IMAGEN_DEL_PROYECTO}?`).join(`](${origen}${RUTA_IMAGEN_DEL_PROYECTO}?`);
}
