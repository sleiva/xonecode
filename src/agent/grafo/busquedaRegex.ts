import { tool } from "@langchain/core/tools";
import type { FilesystemBackend } from "deepagents";
import { z } from "zod";
import { puedeLeerRuta } from "./perfiles.js";

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
      name: "regex_search",
      description:
        "Busca una expresión regular JavaScript por LÍNEA en ficheros del proyecto. " +
        "Úsala solo cuando grep literal no baste; acota path y glob, localiza líneas y después usa read_file paginado. " +
        "No ejecuta shell, no admite regex multilínea y omite rutas protegidas y ficheros grandes.",
      schema: ESQUEMA_REGEX,
    }
  );
}
