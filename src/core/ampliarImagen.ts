/**
 * Ampliar una imagen RGBA por un factor entero, con interpolación BILINEAL.
 *
 * Para la MAQUETA que se le enseña al modelo de visión (`agent/dispositivos/maquetaParaElModelo.ts`): Stitch guarda
 * algunas pantallas a 390 px de ancho, y a ese tamaño el modelo no veía lo tenue. Medido en Maset (Incidencias): la
 * píldora rosa pálida de «Ausente 1er pase» salió «sin fondo» en la crítica, el orquestador mandó quitarla y la
 * pantalla se alejó de la maqueta. Ampliar no añade información, pero da más píxeles a cada detalle, que es lo que
 * el modelo mira. Bilineal y no vecino más próximo: los bordes antialiasados de un texto salen escalonados con lo
 * segundo, y eso sí es información falsa.
 */
import type { ImagenRgba } from "./compararCapturas.js";

export function ampliarImagen(img: ImagenRgba, factor: number): ImagenRgba {
  const f = Math.max(1, Math.floor(factor));
  if (f === 1) return img;
  const ancho = img.ancho * f;
  const alto = img.alto * f;
  const datos = new Uint8ClampedArray(ancho * alto * 4);
  const origen = img.datos;
  const px = (x: number, y: number, c: number) => origen[(y * img.ancho + x) * 4 + c]!;
  for (let y = 0; y < alto; y++) {
    // El centro del píxel destino, en coordenadas del origen.
    const sy = Math.min(img.alto - 1, Math.max(0, (y + 0.5) / f - 0.5));
    const y0 = Math.floor(sy);
    const y1 = Math.min(img.alto - 1, y0 + 1);
    const ty = sy - y0;
    for (let x = 0; x < ancho; x++) {
      const sx = Math.min(img.ancho - 1, Math.max(0, (x + 0.5) / f - 0.5));
      const x0 = Math.floor(sx);
      const x1 = Math.min(img.ancho - 1, x0 + 1);
      const tx = sx - x0;
      const i = (y * ancho + x) * 4;
      for (let c = 0; c < 4; c++) {
        const arriba = px(x0, y0, c) * (1 - tx) + px(x1, y0, c) * tx;
        const abajo = px(x0, y1, c) * (1 - tx) + px(x1, y1, c) * tx;
        datos[i + c] = Math.round(arriba * (1 - ty) + abajo * ty);
      }
    }
  }
  return { ancho, alto, datos };
}
