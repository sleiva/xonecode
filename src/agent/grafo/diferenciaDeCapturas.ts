import { tool } from "@langchain/core/tools";
import { z } from "zod";
import {
  esRutaDeArtefacto,
  mimeDeArtefacto,
  nombreDeArtefacto,
  rutaRelativaDeArtefacto,
} from "../../core/artefactos.js";
import { informeDeCambio, medirCambio } from "../../core/compararCapturas.js";
import { decodificarImagen } from "../dispositivos/decodificarImagen.js";

export const NOMBRE_DIFERENCIA_DE_CAPTURAS = "diferencia_de_capturas";

/**
 * `diferencia_de_capturas`: ¿CAMBIÓ una zona de la pantalla entre dos capturas? (IXCODE-18)
 *
 * Es lo que el conductor escribía a mano en cada pasada de la calculadora: 46 scripts de Python con
 * PIL y 31 `md5`. Y un `md5` no contesta la pregunta buena: uno igual dice que TODA la imagen es
 * igual, y uno distinto puede ser un cursor parpadeando. Aquí se pide la zona que debía cambiar.
 *
 * **Va al conductor y no al orquestador**: mide las capturas que el conductor acaba de tomar, para
 * saber si su toque tuvo efecto — es comprobar una ACCIÓN, no juzgar una pantalla. El juicio
 * sigue siendo del crítico (`xone_critica_visual`) y de `comparar_capturas`.
 *
 * Mismas guardas que las otras dos tools de capturas: las dos rutas bajo `/artefactos/` (lista
 * BLANCA de forma), comprobadas las dos ANTES de abrir ninguna. Solo lee, no escribe nada, y todo
 * rechazo se DEVUELVE como texto.
 */
const Region = z.object({
  x: z.number().describe("Esquina izquierda, de 0 a 1 (fracción del ancho de la imagen)"),
  y: z.number().describe("Esquina de arriba, de 0 a 1 (fracción del alto de la imagen)"),
  ancho: z.number().describe("Ancho de la zona, fracción del ancho de la imagen"),
  alto: z.number().describe("Alto de la zona, fracción del alto de la imagen"),
});
const Entrada = z.object({
  antes: z.string().describe("Ruta virtual, bajo /artefactos/, de la captura de ANTES"),
  despues: z.string().describe("Ruta virtual, bajo /artefactos/, de la captura de DESPUÉS (del mismo aparato: mismo tamaño)"),
  zona: Region.optional().describe("La zona que debía cambiar, en fracciones de la imagen. Sin ella se mide la imagen entera"),
});
type Entrada = z.infer<typeof Entrada>;

export interface DependenciasDeDiferencia {
  leerArtefacto: (nombre: string) => Promise<Buffer>;
}

function comprobar(ruta: string, que: string): string | undefined {
  if (!esRutaDeArtefacto(ruta)) {
    return `«${ruta}» no es ${que} de esta sesión. Solo puedo medir lo que hay bajo /artefactos/.`;
  }
  const mime = mimeDeArtefacto(nombreDeArtefacto(ruta));
  if (mime !== "image/png" && mime !== "image/jpeg") {
    return `«${nombreDeArtefacto(ruta)}» no es un PNG ni un JPEG, así que no hay nada que medir.`;
  }
  return undefined;
}

async function abrir(ruta: string, deps: DependenciasDeDiferencia) {
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
    return `No pude usar «${nombre}»: ${error instanceof Error ? error.message : "no se pudo decodificar"}.`;
  }
}

export function crearDiferenciaDeCapturas(deps: DependenciasDeDiferencia) {
  return tool(
    async (entrada: Entrada): Promise<string> => {
      const problema = comprobar(entrada.antes, "la captura de antes") ?? comprobar(entrada.despues, "la captura de después");
      if (problema !== undefined) return problema;
      const a = await abrir(entrada.antes, deps);
      if (typeof a === "string") return a;
      const d = await abrir(entrada.despues, deps);
      if (typeof d === "string") return d;
      try {
        return informeDeCambio(medirCambio(a, d, entrada.zona)).join("\n");
      } catch (error) {
        return `No se pudo medir: ${error instanceof Error ? error.message : "fallo desconocido"}.`;
      }
    },
    {
      name: NOMBRE_DIFERENCIA_DE_CAPTURAS,
      description:
        "Dice si una ZONA de la pantalla CAMBIÓ entre dos capturas de la misma app, con el porcentaje de píxeles " +
        "distintos y dónde. Úsala tras un toque para comprobar que lo pintado cambió, en vez de comparar con md5 o " +
        "escribir un script: un md5 igual solo dice que TODA la imagen es igual. La zona va en fracciones de la imagen " +
        "(0 a 1). Si dice IGUAL no lo des por «captura cacheada»: toma otra a los 500 ms. getText no vale para esto, " +
        "porque devuelve el valor del campo y no lo pintado. Las dos rutas van bajo /artefactos/.",
      schema: Entrada,
    }
  );
}
