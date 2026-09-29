import { tool } from "@langchain/core/tools";
import { z } from "zod";
import {
  esRutaDeArtefacto,
  mimeDeArtefacto,
  nombreDeArtefacto,
  rutaRelativaDeArtefacto,
} from "../../core/artefactos.js";
import { compararPantallas, informeDeComparacion } from "../../core/compararCapturas.js";
import { imagenReferida, type ImagenReferida } from "../../core/referenciasDeImagen.js";
import { decodificarImagen } from "../dispositivos/decodificarImagen.js";

export const NOMBRE_COMPARAR_CAPTURAS = "comparar_capturas";

/**
 * `comparar_capturas`: MEDIR si una pantalla tiene la estructura de una maqueta (IXCODE-18).
 *
 * **Es la otra mitad de `xone_critica_visual`, no su sustituta.** El crítico tiene visión y
 * opina —forma, texto cortado, estilo— pero es un modelo: se equivoca, y un agente puede
 * descartarlo como «no fiable» (pasó, con el crítico acertado). Esto no opina: **mide**. Dónde
 * hay contenido, hasta dónde llega, qué franjas difieren de la referencia. Determinista, sin
 * modelo y sin necesitar visión (`core/compararCapturas.ts` tiene el porqué y los límites).
 *
 * Va con el orquestador, como el crítico, y con las MISMAS guardas: las dos rutas bajo
 * `/artefactos/` (lista BLANCA de forma) y se comprueban las dos ANTES de abrir ninguna. Solo
 * lee de la carpeta de artefactos de la sesión, no toca el aparato y no escribe nada.
 *
 * **Todo rechazo se DEVUELVE como texto**: una excepción se lleva el turno.
 */
const Entrada = z.object({
  referencia: z
    .string()
    .describe(
      "La ruta virtual de la MAQUETA o diseño con el que se compara: bajo /artefactos/, bajo /adjuntos/ (lo que " +
        "adjuntó la persona) o un PNG/JPEG del proyecto (/diseno/screen.png)"
    ),
  captura: z
    .string()
    .describe("La ruta virtual, bajo /artefactos/, de la captura de la pantalla real (mejor la nativa y COMPLETA)"),
});
type Entrada = z.infer<typeof Entrada>;

export interface DependenciasDeComparacion {
  /** Los bytes de un artefacto, por su ruta RELATIVA. Quien la monta sabe dónde está la carpeta. */
  leerArtefacto: (nombre: string) => Promise<Buffer>;
  /**
   * Lee una MAQUETA de donde esté (`core/referenciasDeImagen.ts`). Ausente, la referencia solo puede
   * venir de `/artefactos/`, que es lo que hacía antes y lo que sigue haciendo el motor legacy.
   */
  leerReferencia?: (imagen: ImagenReferida) => Promise<Buffer>;
}

function comprobar(ruta: string, que: string): string | undefined {
  if (!esRutaDeArtefacto(ruta)) {
    return `«${ruta}» no es ${que} de esta sesión. Solo puedo comparar lo que hay bajo /artefactos/.`;
  }
  const mime = mimeDeArtefacto(nombreDeArtefacto(ruta));
  if (mime !== "image/png" && mime !== "image/jpeg") {
    return `«${nombreDeArtefacto(ruta)}» no es un PNG ni un JPEG, así que no hay nada que medir.`;
  }
  return undefined;
}

/** Comprueba la ruta de la referencia; con lector propio vale también /adjuntos/ y el proyecto. */
function comprobarReferencia(ruta: string, deps: DependenciasDeComparacion): string | undefined {
  if (deps.leerReferencia === undefined) return comprobar(ruta, "la referencia");
  const r = imagenReferida(ruta);
  return typeof r === "string" ? r : undefined;
}

async function abrir(ruta: string, deps: DependenciasDeComparacion, comoReferencia = false) {
  const nombre = nombreDeArtefacto(ruta);
  let bytes: Buffer;
  try {
    const imagen = comoReferencia && deps.leerReferencia !== undefined ? imagenReferida(ruta) : undefined;
    bytes =
      typeof imagen === "object" && deps.leerReferencia !== undefined
        ? await deps.leerReferencia(imagen)
        : await deps.leerArtefacto(rutaRelativaDeArtefacto(ruta));
  } catch (error) {
    // El mensaje de un error de Node lleva la RUTA ABSOLUTA y esto va al modelo: solo su `code`.
    const codigo = (error as { code?: unknown }).code;
    return `No pude abrir «${nombre}» (${typeof codigo === "string" ? codigo : "error de lectura"}).`;
  }
  try {
    return decodificarImagen(bytes);
  } catch (error) {
    // Estos mensajes son NUESTROS (`decodificarImagen.ts`): sin ruta y sin trozos del fichero.
    return `No pude usar «${nombre}»: ${error instanceof Error ? error.message : "no se pudo decodificar"}.`;
  }
}

export function crearCompararCapturas(deps: DependenciasDeComparacion) {
  return tool(
    async (entrada: Entrada): Promise<string> => {
      // Las DOS comprobadas antes de abrir ninguna: una ruta mal escrita no puede descubrirse
      // después de haber leído la otra.
      const problema = comprobarReferencia(entrada.referencia, deps) ?? comprobar(entrada.captura, "una captura");
      if (problema !== undefined) return problema;
      const ref = await abrir(entrada.referencia, deps, true);
      if (typeof ref === "string") return ref;
      const cap = await abrir(entrada.captura, deps);
      if (typeof cap === "string") return cap;
      try {
        return informeDeComparacion(compararPantallas(ref, cap)).join("\n");
      } catch (error) {
        return `No se pudo medir: ${error instanceof Error ? error.message : "fallo desconocido"}.`;
      }
    },
    {
      name: NOMBRE_COMPARAR_CAPTURAS,
      description:
        "MIDE si una captura de pantalla tiene la misma estructura que una maqueta (la de /diseno/, /adjuntos/ o " +
        "/artefactos/), con números y sin " +
        "opinar: qué franjas del alto y del ancho tienen contenido en cada una y hasta dónde llega. Caza " +
        "lo grande —una banda vacía, un teclado que ocupa un tercio— y es determinista. NO ve texto " +
        "cortado, estilo ni colores: para eso está xone_critica_visual. Úsala cuando el encargo traiga un " +
        "diseño, con la captura nativa completa, y antes de dar la pantalla por parecida. La captura va bajo " +
        "/artefactos/.",
      schema: Entrada,
    }
  );
}
