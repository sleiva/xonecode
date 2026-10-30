import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { informeDeMaqueta } from "../../core/informeDeMaqueta.js";
import { imagenReferida, type ImagenReferida } from "../../core/referenciasDeImagen.js";
import type { MaquetaMedida } from "../../core/geometriaDePantalla.js";

export const NOMBRE_MEDIR_MAQUETA = "medir_maqueta";

export interface DependenciasDeMedirMaqueta {
  /** Los bytes de la maqueta, de donde esté (`lectorDeReferencias.ts`): proyecto, `/adjuntos/` o `/artefactos/`. */
  leer: (imagen: ImagenReferida) => Promise<Buffer>;
  /** Las cajas de su `code.html`, si lo trae: `undefined` = no hay HTML; `{motivo}` = lo hay y no se pudo medir. */
  cajas: (imagen: ImagenReferida, bytes: Buffer) => Promise<MaquetaMedida | { motivo: string } | undefined>;
  /** Ancho y alto del PNG/JPEG. */
  medidas: (bytes: Buffer) => { ancho: number; alto: number } | undefined;
}

/**
 * `medir_maqueta`: la geometría EXACTA de una maqueta con `code.html` (la de Stitch), para planificar o escribir una
 * pantalla sin medirla a ojo. Medido en la prueba de la calculadora: sin esto el orquestador encargó al device-controller
 * medir las bandas «recortando con PIL», 19 llamadas. Nunca lanza: lo que no se puede medir se DICE.
 */
export function crearMedirMaqueta(deps: DependenciasDeMedirMaqueta) {
  return tool(
    async ({ maqueta }: { maqueta: string }): Promise<string> => {
      const imagen = imagenReferida(maqueta);
      if (typeof imagen === "string") return `No se mide: ${imagen}.`;
      if (!/\.(png|jpe?g)$/i.test(imagen.nombre)) return `No se mide: ${maqueta} no es un PNG ni un JPEG.`;
      let bytes: Buffer;
      try {
        bytes = await deps.leer(imagen);
      } catch (error) {
        // El mensaje de Node lleva la ruta absoluta: solo su código.
        return `No se pudo abrir ${maqueta}: ${(error as { code?: string }).code ?? "error"}.`;
      }
      const png = deps.medidas(bytes);
      if (png === undefined) return `No se mide: ${maqueta} no se deja leer como imagen.`;
      let medida: MaquetaMedida | { motivo: string } | undefined;
      try {
        medida = await deps.cajas(imagen, bytes);
      } catch {
        medida = { motivo: "no se pudo abrir su code.html" };
      }
      if (medida === undefined) {
        return `${maqueta} es solo una imagen (${String(png.ancho)}×${String(png.alto)} px), sin code.html al lado: no hay cajas que medir. Mírala con describe_image; no midas píxeles con scripts.`;
      }
      if ("motivo" in medida) return `No se pudo medir ${maqueta}: ${medida.motivo}. Mírala con describe_image.`;
      return informeDeMaqueta(maqueta, medida, png).join("\n");
    },
    {
      name: NOMBRE_MEDIR_MAQUETA,
      description:
        "MIDE la geometría de una maqueta que trae su code.html (la de Stitch, en /diseno/ o /adjuntos/): sus bloques " +
        "(cabecera, visor, paneles) y sus filas de controles, cada uno con su caja en px del PNG y en % de la pantalla, el " +
        "hueco entre controles y el alto de su texto. Exacto y en segundos: úsala ANTES de encargar o hacer mediciones de la " +
        "maqueta a mano (nada de scripts de píxeles ni de PIL). No compara con el aparato: para eso, comparar_capturas.",
      schema: z.object({
        maqueta: z.string().describe("La ruta virtual del PNG de la maqueta, p. ej. /diseno/screen.png. Su code.html va al lado."),
      }),
    }
  );
}
