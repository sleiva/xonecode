import { tool } from "@langchain/core/tools";
import type { FilesystemBackend } from "deepagents";
import { z } from "zod";
import { puedeLeerRuta } from "./perfiles.js";

/**
 * El nombre de esta tool, en UN sitio.
 *
 * Existe porque `xone_navegacion` manda aquí cuando no sabe contestar, y una sugerencia que
 * nombre una tool que ya no se llama así manda al modelo a llamar a algo que no existe —
 * gasta un viaje y devuelve un error. Es la lección del token `HANDOFF DE ANÁLISIS`: lo que se
 * nombra desde otro sitio no se escribe dos veces.
 */
export const NOMBRE_BUSQUEDA_REGEX = "regex_search";

/** Los ficheros donde vive lo que se puede nombrar una colección: el XML y los scripts. */
const GLOB_DE_FUENTES = "**/*.{xne,xml,js}";

/** Escapa lo que en una regex significaría otra cosa. Un nombre XOne no suele traerlo, pero
 *  una sugerencia que no se puede ejecutar es peor que ninguna. */
const comoLiteral = (texto: string): string => texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * La llamada EXACTA a `regex_search` que busca un término como texto, lista para copiar.
 *
 * Se devuelve la llamada entera y no un consejo en prosa («busca con regex_search») por lo
 * mismo que `porQueNo` dice la ruta buena en vez de solo negarse: un modelo al que se le dice
 * qué hacer sin decirle cómo se inventa los argumentos, y aquí inventarlos cuesta un viaje y
 * un error de esquema. Se comprueba contra el esquema REAL de la tool en su test.
 */
export function llamadaDeBusqueda(termino: string, glob: string = GLOB_DE_FUENTES): string {
  return `${NOMBRE_BUSQUEDA_REGEX} ${JSON.stringify({ pattern: patronDe(termino), glob })}`;
}

/**
 * El patrón para buscar un término como texto.
 *
 * **`\b` solo cuando los extremos son carácter de palabra**, y esto NO es cosmético: `\b` es
 * una frontera entre palabra y no-palabra, así que `\bcoll name=\b` no casa nunca — el `=`
 * final ya no es palabra y la frontera cae donde no hay nada que delimitar. Un nombre de
 * colección sí la quiere (`\bClientes\b` no encuentra `ClientesViejos`); un fragmento con
 * signos, no. Salió de un test que ejecutó la sugerencia.
 */
function patronDe(termino: string): string {
  const literal = comoLiteral(termino);
  const abre = /^\w/.test(termino) ? "\\b" : "";
  const cierra = /\w$/.test(termino) ? "\\b" : "";
  return `${abre}${literal}${cierra}`;
}

/** Límites defensivos: la regex es una ayuda de localización, no un lector masivo. */
export const LIMITES_REGEX = {
  archivos: 50,
  bytesPorArchivo: 256 * 1024,
  coincidencias: 100,
  caracteresPorLinea: 1_000,
} as const;

const ESQUEMA_REGEX = z.object({
  pattern: z.string().min(1).max(256).describe("Expresión regular JavaScript aplicada línea a línea"),
  path: z.string().min(1).default("/").describe("Directorio virtual desde el que buscar"),
  glob: z
    .string()
    .min(1)
    .max(200)
    .default("**/*.{js,xne,xml,css}")
    .describe("Glob que limita los ficheros candidatos"),
  flags: z.string().regex(/^[imu]*$/).default("m").describe("Flags de regex permitidos: i, m, u"),
  max_count: z.coerce
    .number()
    .int()
    .positive()
    .max(LIMITES_REGEX.coincidencias)
    .default(30)
    .describe("Máximo de líneas coincidentes a devolver (hasta 100)"),
});

type BackendDeBusqueda = Pick<FilesystemBackend, "glob" | "readRaw">;
type EntradaRegex = z.infer<typeof ESQUEMA_REGEX>;

/**
 * Búsqueda regex confinada al backend virtual del proyecto.
 *
 * DeepAgents ofrece `grep` literal, que es preferible para la mayoría de
 * búsquedas y usa ripgrep. Esta tool cubre patrones estructurales de XOne/ES5
 * (funciones, atributos y eventos) sin conceder `execute` ni usar una shell.
 * La coincidencia es por línea, como grep: no sirve para regex multilínea.
 */
export function crearBusquedaRegex(backend: BackendDeBusqueda) {
  return tool(
    async (entrada: EntradaRegex) => {
      let regex: RegExp;
      try {
        regex = new RegExp(entrada.pattern, entrada.flags);
      } catch (error) {
        return `Regex inválida: ${error instanceof Error ? error.message : String(error)}`;
      }

      const listado = await backend.glob(entrada.glob, entrada.path);
      if (listado.error) return `No se pudo listar candidatos: ${listado.error}`;

      const candidatos = (listado.files ?? [])
        .filter((fichero) => !fichero.is_dir && puedeLeerRuta(fichero.path))
        .filter((fichero) => fichero.size === undefined || fichero.size <= LIMITES_REGEX.bytesPorArchivo)
        .slice(0, LIMITES_REGEX.archivos);
      const lineas: string[] = [];

      for (const fichero of candidatos) {
        if (lineas.length >= entrada.max_count) break;
        const leido = await backend.readRaw(fichero.path);
        if (leido.error || !leido.data || typeof leido.data.content !== "string") continue;

        for (const [indice, linea] of leido.data.content.split(/\r?\n/).entries()) {
          // Una regex con flag global no está permitida por el esquema; aun así se
          // reinicia por línea para que futuras ampliaciones no introduzcan estado.
          regex.lastIndex = 0;
          if (!regex.test(linea)) continue;
          const texto = linea.length > LIMITES_REGEX.caracteresPorLinea
            ? `${linea.slice(0, LIMITES_REGEX.caracteresPorLinea)}…`
            : linea;
          lineas.push(`${fichero.path}:${indice + 1}: ${texto}`);
          if (lineas.length >= entrada.max_count) break;
        }
      }

      const avisos: string[] = [];
      if ((listado.files ?? []).length > LIMITES_REGEX.archivos) {
        avisos.push(`se revisaron solo los primeros ${LIMITES_REGEX.archivos} ficheros; acota path o glob`);
      }
      if (lineas.length >= entrada.max_count) {
        avisos.push(`se alcanzó max_count=${entrada.max_count}; afina el patrón o la ruta`);
      }
      if (lineas.length === 0) return `No se encontraron coincidencias.${avisos.length ? ` Nota: ${avisos.join("; ")}.` : ""}`;
      return `${lineas.join("\n")}${avisos.length ? `\n\nNota: ${avisos.join("; ")}.` : ""}`;
    },
    {
      name: NOMBRE_BUSQUEDA_REGEX,
      description:
        "Busca una expresión regular JavaScript por LÍNEA en ficheros del proyecto. " +
        "Úsala solo cuando grep literal no baste; acota path y glob, localiza líneas y después usa read_file paginado. " +
        "No ejecuta shell, no admite regex multilínea y omite rutas protegidas y ficheros grandes.",
      schema: ESQUEMA_REGEX,
    }
  );
}
