import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import {
  claveDeEstilo, estilosLegibles, LIMITES_DE_BUSQUEDA_DE_FUENTES, motivoDeFamiliaInaceptable, motivoDePesoInaceptable,
  nombreDeFicheroDeFuente, NOMBRE_BUSCAR_FUENTE, NOMBRE_TRAER_FUENTE, type Peso, PESOS, recibeFuentes, rutaDeFuente,
} from "../../core/fuentes.js";
import type { FuentesPort } from "../../core/ports.js";
import { motivoDeDestino, motivoDeDestinoEnDisco } from "./incorporarAdjunto.js";
import type { QuienDecidePermisos } from "./perfiles.js";

export { NOMBRE_BUSCAR_FUENTE, NOMBRE_TRAER_FUENTE, recibeFuentes };

/**
 * Traer una fuente de Google Fonts a `fonts/`, para que una pantalla use la tipografía de su
 * maqueta (las de Stitch declaran `fontFamily`) y no la del sistema. Dos tools, porque solo UNA
 * escribe:
 *
 * - **`buscar_fuente`**, de LECTURA: qué familias encajan, con sus estilos y el nombre de fichero
 *   de cada uno. Sin aprobación.
 * - **`traer_fuente`**, que ESCRIBE un binario en el proyecto, y por eso pasa por la APROBACIÓN por
 *   su NOMBRE (`capacidades.ts`), con su tarjeta de `[fichero binario]` (`interrupts.ts#cambioDe`).
 *   Un `.ttf` no sobrevive a `write_file` (es texto), así que es el harness quien escribe los
 *   bytes, como `incorporar_adjunto`.
 *
 * ## El destino lo decide el CÓDIGO
 *
 * `file_path` está en la entrada porque es la clave que leen la tarjeta, `seDetieneEn` y el modo
 * autónomo al anotar la ruta; pero solo vale EXACTAMENTE `rutaDeFuente(familia, peso, cursiva)`.
 * Así el nombre sigue la convención de Google (`Inter-Bold.ttf`) que la skill documenta para
 * `fontname`, y la guarda de texto se reduce a comparar con él. Las del DISCO (enlaces, fuera de
 * la raíz) y el permiso del perfil se reaplican a mano con las MISMAS funciones de
 * `incorporar_adjunto`: una tool propia no pasa por el middleware de permisos.
 *
 * ## Los rechazos se DEVUELVEN, nunca se lanzan
 *
 * Sin red, la tool lo DICE y no escribe nada. Lo que se descarga ya llega comprobado por el puerto
 * (firma TrueType, tope de tamaño, host de Google).
 *
 * **Límite declarado**: solo TrueForge; la fuente llega al aparato DESPLEGANDO entero (la recarga
 * en caliente no lleva `fonts/`), y la respuesta lo dice.
 */

const ESQUEMA_BUSCAR = z.object({
  consulta: z.string().min(1).max(64).describe("El nombre de la familia o parte de él, como lo trae la maqueta (Inter, Roboto Mono)."),
  limite: z.coerce.number().int().min(1).max(LIMITES_DE_BUSQUEDA_DE_FUENTES.maximo).optional()
    .describe(`Por omisión ${LIMITES_DE_BUSQUEDA_DE_FUENTES.porOmision}.`),
});

const ESQUEMA_TRAER = z.object({
  familia: z.string().min(1).max(64).describe("El nombre EXACTO de la familia, como lo devuelve buscar_fuente."),
  peso: z.coerce.number().int().describe("100 a 900: 400 es el normal, 700 la negrita."),
  cursiva: z.boolean().optional().describe("Cursiva. Por omisión, no."),
  file_path: z.string().describe("La ruta que te dio buscar_fuente para ese estilo (/fonts/Inter-Bold.ttf). Pide aprobación."),
});

export function crearBuscarFuente(fuentes: FuentesPort) {
  return tool(
    async ({ consulta, limite }: z.infer<typeof ESQUEMA_BUSCAR>): Promise<string> => {
      try {
        const familias = await fuentes.buscar(consulta, limite ?? LIMITES_DE_BUSQUEDA_DE_FUENTES.porOmision);
        if (familias.length === 0) return `Ninguna familia de Google Fonts para «${consulta}». Prueba con menos palabras.`;
        return [
          `${familias.length} familias para «${consulta}»:`,
          ...familias.map((f) => {
            const rectos = f.estilos.filter((e) => !e.endsWith("i"));
            const clave = f.estilos.includes("400") ? "400" : (rectos[0] ?? f.estilos[0]!);
            const ejemplo = Number(clave.replace("i", "")) as Peso;
            const cursiva = clave.endsWith("i");
            return `- ${f.familia} (${f.categoria}): pesos ${estilosLegibles(f.estilos)}. Fichero del ${ejemplo}${cursiva ? " cursiva" : ""}: ${rutaDeFuente(f.familia, ejemplo, cursiva)} (los demás estilos, igual: -Bold, -Medium, -Italic…)`;
          }),
          `Siguiente paso: ${NOMBRE_TRAER_FUENTE} con la familia, el peso y su file_path, UNO por estilo que use la pantalla.`,
        ].join("\n");
      } catch (error) {
        return `No se pudo buscar: ${causa(error)}. No inventes el fichero: dilo, y la pantalla sigue con la fuente del sistema.`;
      }
    },
    {
      name: NOMBRE_BUSCAR_FUENTE,
      description:
        "Busca una familia en Google Fonts y dice qué pesos tiene y cómo se llamaría cada fichero en fonts/. Úsala " +
        "cuando la maqueta declare una tipografía (fontFamily). Solo LEE; para traer el fichero, " + NOMBRE_TRAER_FUENTE + ".",
      schema: ESQUEMA_BUSCAR,
    }
  );
}

export interface DondeTraerFuente {
  /** La raíz REAL del proyecto en disco. */
  raiz: string;
  /** De quién son los permisos que hay que reaplicar. */
  perfil: QuienDecidePermisos;
}

export function crearTraerFuente(fuentes: FuentesPort, donde: DondeTraerFuente) {
  return tool(
    async ({ familia, peso, cursiva, file_path }: z.infer<typeof ESQUEMA_TRAER>): Promise<string> => {
      const enCursiva = cursiva === true;
      const problema = motivoDeFamiliaInaceptable(familia) ?? motivoDePesoInaceptable(peso);
      if (problema !== undefined) return `${problema}.`;
      const elPeso = peso as Peso;
      const destino = rutaDeFuente(familia, elPeso, enCursiva);
      const pedido = file_path.trim().startsWith("/") ? file_path.trim() : `/${file_path.trim()}`;
      if (pedido !== destino) {
        return `El fichero de ${familia} ${peso}${enCursiva ? " cursiva" : ""} es ${destino}, no «${file_path}»: vuelve a llamar con ese file_path.`;
      }
      const porTexto = motivoDeDestino(donde.perfil, destino);
      if (porTexto !== undefined) return porTexto;
      const porDisco = motivoDeDestinoEnDisco(donde, destino);
      if (porDisco !== undefined) return porDisco;

      let bytes: Uint8Array;
      try {
        const f = await fuentes.familia(familia);
        if (f === undefined) return `Google Fonts no tiene la familia «${familia}». Búscala con ${NOMBRE_BUSCAR_FUENTE}: el nombre va exacto.`;
        if (!f.estilos.includes(claveDeEstilo(elPeso, enCursiva))) {
          return `${familia} no tiene ${peso}${enCursiva ? " cursiva" : ""}: tiene ${estilosLegibles(f.estilos)}. Usa el más cercano.`;
        }
        bytes = await fuentes.ttf(familia, elPeso, enCursiva);
      } catch (error) {
        return `No se pudo traer la fuente: ${causa(error)}. No se ha escrito nada; la pantalla sigue con la fuente del sistema.`;
      }

      try {
        const real = resolve(donde.raiz, destino.slice(1));
        mkdirSync(dirname(real), { recursive: true });
        writeFileSync(real, bytes, { mode: 0o644 });
      } catch (error) {
        const code = (error as { code?: unknown } | null)?.code;
        return `No se pudo escribir ${destino} (${typeof code === "string" ? code : "error"}).`;
      }
      const nombre = nombreDeFicheroDeFuente(familia, elPeso, enCursiva);
      return [
        `Escrito ${destino} (${bytes.length} bytes). En el CSS: fontname: ${nombre}; (el nombre a secas: XOne lo busca en fonts/).`,
        "Para verla en el aparato hay que DESPLEGAR la app entera: la recarga en caliente no lleva fonts/, y un fontname que el",
        "aparato no tiene saca un diálogo de error y el control no se pinta.",
      ].join(" ");
    },
    {
      name: NOMBRE_TRAER_FUENTE,
      description:
        "Trae el .ttf de UN estilo (familia + peso + cursiva) de Google Fonts a fonts/ del proyecto, para usarlo con " +
        "fontname en el CSS. El nombre del fichero lo da " + NOMBRE_BUSCAR_FUENTE + ". Escribe un binario y pasa por la " +
        `aprobación de la persona. Pesos: ${PESOS.join(", ")}.`,
      schema: ESQUEMA_TRAER,
    }
  );
}

function causa(error: unknown): string {
  return error instanceof Error ? error.message : "fallo desconocido";
}
