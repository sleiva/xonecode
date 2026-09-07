import type { MarkdownCodeLabels } from "@deepseek-ai/dsh-client-ui-primitives";

/**
 * Las etiquetas del botón de copiar de las vallas de código, en español.
 *
 * En español porque el paquete es «zero-cordis» y no puede leer el locale de la app: sin
 * esto, el botón sale en chino, que es el valor por omisión que documenta su propio README.
 *
 * Vive aquí y no en cada componente porque lo piden DOS —el chat y el `.md` renderizado de
 * la pestaña Ficheros—, y dos copias de la misma pareja de palabras es cómo se acaba con
 * una que dice «Copiado» y otra «Copiada».
 */
export const ETIQUETAS_DE_CODIGO: MarkdownCodeLabels = { copyLabel: "Copiar", copiedLabel: "Copiado" };
