import { createHash } from "node:crypto";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { imagenReferida, type ImagenReferida } from "../../core/referenciasDeImagen.js";
import { esRutaDeLaMaquina, mimeDe, rutaVirtualDe, TOPE_DE_BYTES_DE_IMAGEN } from "./describirImagen.js";
import { NOMBRE_TRAER } from "./traerDeLaMaquina.js";

/**
 * `view_image`: que el MISMO modelo vea una imagen, como el `view_image` de Codex.
 *
 * `describe_image` pide a OTRO modelo que la cuente en texto, y lo que el texto no dice —una fila partida, un recorte— el
 * que trabaja no lo sabe. Medido con Codex sobre la calculadora (04-11-2026): su desarrollador miró 7 capturas él mismo
 * y corrigió lo que veía midiéndolo en la geometría («los botones no caben cuatro por fila… `newline` es salto antes»).
 *
 * En la API de chat el resultado de una tool es TEXTO (por eso `describe_image` es una llamada aparte). Aquí la tool deja
 * una MARCA con el id de la imagen y el adaptador del modelo (`modeloLangchain.ts#aMensajesDeLangchain`) pone la imagen
 * de verdad en un mensaje justo detrás de los resultados de tools —donde Codex la pone en la respuesta de la tool, y donde
 * la pone también la API Responses (`modeloLangchain.ts#aMensajesDeLangchain`, `enLaRespuesta`)—. La
 * conversación guarda solo la marca; la imagen se rehace IGUAL en cada llamada (por su id, del registro), y el prefijo
 * no cambia para la caché.
 */
export const NOMBRE_VER_IMAGEN = "view_image";

/** La marca que deja la tool en su resultado: `⟦imagen:<id>⟧`. */
export const MARCA_DE_IMAGEN = /⟦imagen:([0-9a-f]{16})⟧/g;

export interface ImagenVista {
  base64: string;
  mime: string;
  ruta: string;
}

/** Las imágenes vistas en la sesión, por id (el hash de sus bytes: la misma imagen, el mismo id). */
export function crearImagenesVistas() {
  const vistas = new Map<string, ImagenVista>();
  return {
    guardar(bytes: Buffer, mime: string, ruta: string): string {
      const id = createHash("sha256").update(bytes).digest("hex").slice(0, 16);
      vistas.set(id, { base64: bytes.toString("base64"), mime, ruta });
      return id;
    },
    de: (id: string): ImagenVista | undefined => vistas.get(id),
  };
}
export type ImagenesVistas = ReturnType<typeof crearImagenesVistas>;

const Entrada = z.object({ path: z.string().describe("La ruta de la imagen: /artefactos/captura-….png, /diseno/screen.png, /adjuntos/…") });

export function crearVerImagen(deps: {
  leer: (imagen: ImagenReferida) => Promise<Buffer>;
  vistas: ImagenesVistas;
  carpetas?: { raiz: string; adjuntos?: string; artefactos?: string };
}) {
  return tool(
    async ({ path }: z.infer<typeof Entrada>) => {
      let virtual = path.trim();
      if (esRutaDeLaMaquina(virtual, deps.carpetas)) {
        const traducida = deps.carpetas === undefined ? undefined : rutaVirtualDe(virtual, deps.carpetas);
        if (traducida === undefined) return `Esa ruta está fuera del proyecto y de esta sesión: tráela antes con ${NOMBRE_TRAER} y pásame su ruta en /artefactos/.`;
        virtual = traducida;
      }
      const imagen = imagenReferida(virtual);
      if (typeof imagen === "string") return imagen;
      let bytes: Buffer;
      try {
        bytes = await deps.leer(imagen);
      } catch (error) {
        const code = (error as { code?: unknown }).code;
        return `No se pudo leer ${virtual}${typeof code === "string" ? ` (${code})` : ""}: comprueba la ruta con ls.`;
      }
      if (bytes.length > TOPE_DE_BYTES_DE_IMAGEN) return `${virtual} es demasiado grande para verla.`;
      const id = deps.vistas.guardar(bytes, mimeDe(imagen.nombre), virtual);
      return `⟦imagen:${id}⟧ ${virtual} va justo debajo: mírala tú. Lo que quieras MEDIR (posición, tamaño), mídelo en su geometría, no a ojo.`;
    },
    {
      name: NOMBRE_VER_IMAGEN,
      description:
        "Te pone DELANTE una imagen PNG o JPEG —una captura del aparato, la maqueta— para que la veas tú mismo, en esta " +
        "conversación. Úsala para mirar lo que acabas de capturar con `xone-probar --captura`.",
      schema: Entrada,
    }
  );
}
