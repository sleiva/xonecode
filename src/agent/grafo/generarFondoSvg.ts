import { tool } from "@langchain/core/tools";
import { z } from "zod";
import {
  ANCHO_DE_PANTALLA_DE_REFERENCIA, generarFondo, INTENSIDADES, medidaEnPixeles, motivoDeNombreDeFondoInaceptable,
  motivoDePeticionInaceptable, nombreDeFicheroDeFondo, NOMBRE_GENERAR_FONDO, PIXELES_POR_P, rutaDeFondo, TIPOS_DE_FONDO,
} from "../../core/fondosSvg.js";
import { recibeBuscarIcono } from "./buscarIcono.js";

export { NOMBRE_GENERAR_FONDO };

/**
 * Generar el fondo SVG de un frame o un botón (degradado, sombra, resplandor), para lo que XOne
 * no trae propio (IXCODE-18). **Pura y sin red**: no hay puerto, siempre está montada donde se
 * reparte. Las plantillas, y por qué no llevan ningún filtro, están en `core/fondosSvg.ts`.
 *
 * **Solo lee**, como `buscar_icono`: el SVG lo escribe `write_file` con su aprobación. Y va a los
 * MISMOS especialistas (`recibeBuscarIcono`, la regla de dato de quien escribe el proyecto), en
 * los dos motores. Los rechazos se DEVUELVEN como texto, nunca se lanzan.
 */
export const recibeGenerarFondo = recibeBuscarIcono;

const ESQUEMA = z.object({
  tipo: z.enum(TIPOS_DE_FONDO).describe(
    "degradado-lineal | degradado-radial | sombra (tarjeta con sombra suave) | glow (resplandor)"
  ),
  nombre: z.string().min(1).max(40).describe("Nombre del fichero: minúsculas, dígitos y _ (sale bg_<nombre>.svg)"),
  ancho: z.union([z.number(), z.string().max(16)]).describe(
    'Ancho del control TAL COMO lo declaras en el XML: "90%", "300p", "120px" o un número (píxeles)'
  ),
  alto: z.union([z.number(), z.string().max(16)]).describe(
    'Alto del control tal como lo declaras: "60p", "120px" o un número (píxeles). El % no vale en el alto'
  ),
  colores: z.array(z.string().max(32)).min(1).max(4).describe(
    "Colores COMO EN XOne: #RRGGBB o #AARRGGBB (alfa PRIMERO, no el #RRGGBBAA de HTML). 2 a 4 en los degradados; 1 en sombra (la tarjeta) y en glow (la luz)"
  ),
  angulo: z.coerce.number().min(0).max(360).optional().describe("Solo degradado-lineal: 0 = izquierda a derecha, 90 = arriba abajo (por omisión)"),
  radio: z.coerce.number().min(0).max(50).optional().describe("Esquina como % del alto: 0 recta, 25 por omisión, 50 píldora"),
  intensidad: z.enum(INTENSIDADES as [string, ...string[]]).optional().describe("Solo sombra: suave | media | fuerte"),
  fondo: z.string().max(32).optional().describe("Solo glow: color de detrás, como en XOne; sin él, transparente"),
});
type Entrada = z.infer<typeof ESQUEMA>;

export function crearGenerarFondoSvg() {
  return tool(
    async (e: Entrada): Promise<string> => {
      try {
        const nombreMal = motivoDeNombreDeFondoInaceptable(e.nombre);
        if (nombreMal !== undefined) return nombreMal;
        const ancho = medidaEnPixeles(e.ancho, "ancho");
        const alto = medidaEnPixeles(e.alto, "alto");
        if ("motivo" in ancho) return ancho.motivo;
        if ("motivo" in alto) return alto.motivo;
        const estimada = [e.ancho, e.alto].some((v) => typeof v === "string" && /[%p]$/i.test(v.trim()) && !/px$/i.test(v.trim()));
        const peticion = {
          tipo: e.tipo,
          ancho: ancho.px,
          alto: alto.px,
          colores: e.colores,
          ...(e.angulo === undefined ? {} : { angulo: e.angulo }),
          ...(e.radio === undefined ? {} : { radio: e.radio }),
          ...(e.intensidad === undefined ? {} : { intensidad: e.intensidad as (typeof INTENSIDADES)[number] }),
          ...(e.fondo === undefined ? {} : { fondo: e.fondo }),
        };
        const motivo = motivoDePeticionInaceptable(peticion);
        if (motivo !== undefined) return motivo;
        const { svg, anchoDelViewBox } = generarFondo(peticion);
        const fichero = nombreDeFicheroDeFondo(e.nombre);
        return [
          `Fondo ${e.tipo} de proporción ${anchoDelViewBox}:100 (la de un control de ${e.ancho}×${e.alto}). ` +
            `Escríbelo TAL CUAL con write_file en ${rutaDeFondo(e.nombre)}. En un FRAME o GRUPO se usa con ` +
            `imgbk="${fichero}"; en un BOTÓN (type="B") con img="${fichero}" (y imgsel para el pulsado): en un botón ` +
            `imgbk se ignora (medido). La esquina va DIBUJADA en el SVG: border-corner-radius no recorta el fondo. ` +
            `Si el control cambia de proporción, la esquina se deforma: genera otro para ese control.` +
            (estimada
              ? ` Las medidas en % y p son una ESTIMACIÓN sobre un aparato de ${ANCHO_DE_PANTALLA_DE_REFERENCIA} px de ancho ` +
                `(1 p ≈ ${PIXELES_POR_P} px): en otro dispositivo la proporción real puede variar un poco.`
              : ""),
          svg,
        ].join("\n");
      } catch (error) {
        return `No se pudo generar: ${error instanceof Error ? error.message : "fallo desconocido"}.`;
      }
    },
    {
      name: NOMBRE_GENERAR_FONDO,
      description:
        "Genera el SVG de fondo de un frame o botón: degradado lineal o radial, tarjeta con sombra o " +
        "resplandor. Los colores van como en XOne (#RRGGBB o #AARRGGBB) y se convierten a SVG. XOne no " +
        "tiene degradados ni desenfoques propios y ignora en silencio los filtros SVG, " +
        "así que esto los dibuja sin filtros. Pasa el ancho y el alto DEL CONTROL que lo lleva: la esquina " +
        "va dibujada y solo sale bien con su proporción. Solo genera: el SVG lo escribes tú con write_file " +
        'en la ruta que te indica. En un frame va con imgbk="bg_x.svg"; en un botón (type="B") con img="bg_x.svg", ' +
        'porque imgbk se ignora en los botones. Nombre a secas, nunca type="WEB".',
      schema: ESQUEMA,
    }
  );
}
