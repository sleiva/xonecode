/**
 * La MAQUETA tal como se le enseña al modelo de visión: si es pequeña, ampliada (`core/ampliarImagen.ts`).
 *
 * El ancho mínimo es el que Stitch DECLARA para sus pantallas de móvil (`get_screen` → `width: 780`) aunque la imagen
 * que guarda mida 390: es el tamaño al que se diseñó. Medido en Maset (Incidencias): con la de 390 px, la crítica no
 * vio la píldora rosa pálida del motivo y la dio «sin fondo». Solo la maqueta: la captura del aparato ya viene a
 * tamaño real. Lo que no se puede leer o ampliar se manda como estaba: es un dato de más, no una condición.
 */
import { PNG } from "pngjs";
import { ampliarImagen } from "../../core/ampliarImagen.js";
import { decodificarImagen } from "./decodificarImagen.js";

/** Por debajo de este ancho, la maqueta se amplía antes de enseñársela al modelo. */
export const ANCHO_MINIMO_DE_MAQUETA = 780;

export function maquetaParaElModelo(maqueta: { base64: string; mime: string }): { base64: string; mime: string } {
  try {
    const img = decodificarImagen(Buffer.from(maqueta.base64, "base64"));
    if (img.ancho >= ANCHO_MINIMO_DE_MAQUETA) return maqueta;
    const ampliada = ampliarImagen(img, Math.ceil(ANCHO_MINIMO_DE_MAQUETA / img.ancho));
    const png = new PNG({ width: ampliada.ancho, height: ampliada.alto });
    png.data = Buffer.from(ampliada.datos);
    return { base64: PNG.sync.write(png).toString("base64"), mime: "image/png" };
  } catch {
    return maqueta;
  }
}
