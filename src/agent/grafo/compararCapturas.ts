import { tool } from "@langchain/core/tools";
import { z } from "zod";
import {
  esRutaDeArtefacto,
  mimeDeArtefacto,
  nombreDeArtefacto,
  rutaRelativaDeArtefacto,
} from "../../core/artefactos.js";
import { compararPantallas, informeDeComparacion } from "../../core/compararCapturas.js";
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
    .describe("La ruta virtual, bajo /artefactos/, de la MAQUETA o diseño con el que se compara"),
  captura: z
    .string()
    .describe("La ruta virtual, bajo /artefactos/, de la captura de la pantalla real (mejor la nativa y COMPLETA)"),
});
type Entrada = z.infer<typeof Entrada>;

export interface DependenciasDeComparacion {
  /** Los bytes de un artefacto, por su ruta RELATIVA. Quien la monta sabe dónde está la carpeta. */
  leerArtefacto: (nombre: string) => Promise<Buffer>;
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

async function abrir(ruta: string, deps: DependenciasDeComparacion) {
  const nombre = nombreDeArtefacto(ruta);
  let bytes: Buffer;
  try {
    bytes = await deps.leerArtefacto(rutaRelativaDeArtefacto(ruta));
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
      const problema = comprobar(entrada.referencia, "la referencia") ?? comprobar(entrada.captura, "una captura");
      if (problema !== undefined) return problema;
      const ref = await abrir(entrada.referencia, deps);
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
        "MIDE si una captura de pantalla tiene la misma estructura que una maqueta, con números y sin " +
        "opinar: qué franjas del alto y del ancho tienen contenido en cada una y hasta dónde llega. Caza " +
        "lo grande —una banda vacía, un teclado que ocupa un tercio— y es determinista. NO ve texto " +
        "cortado, estilo ni colores: para eso está xone_critica_visual. Úsala cuando el encargo traiga un " +
        "diseño, con la captura nativa completa, y antes de dar la pantalla por parecida. Las dos " +
        "rutas van bajo /artefactos/.",
      schema: Entrada,
    }
  );
}
