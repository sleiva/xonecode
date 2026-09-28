import { lstatSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join, sep } from "node:path";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { CARPETA_DE_PLANES, motivoDePlanInaceptable, RUTA_PLANES } from "../../core/planes.js";
import { marcarCriterios } from "../../core/tareasDelPlan.js";

/**
 * Marcar en el plan lo que se COMPROBÓ en el aparato.
 *
 * ## Por qué existe
 *
 * Un criterio de un `TASKS.md` dice cosas como «pulsarla abre la pantalla nueva», y quien lo
 * comprueba es el `device-controller`, en el emulador. Pero ese agente no tiene `write_file` ni
 * `edit_file` —ejecuta, y el camino normal de tocar ficheros es el del desarrollador—, y el
 * orquestador es de solo lectura: medido en una sesión real, el conductor comprobó en el
 * emulador la entrada del drawer, la lista y el detalle, y el plan siguió con todas las casillas
 * a cero. Lo verificado no volvía nunca al plan.
 *
 * ## Por qué una tool y no `edit_file`
 *
 * Porque lo que se le concede es EXACTAMENTE marcar casillas, y eso lo decide el código:
 * `marcarCriterios` (`core/tareasDelPlan.ts`) solo cambia `- [ ]` a `- [x]` en la sección de UNA
 * tarea. Un `edit_file` le abriría el fichero entero —y en deepagents, a quien ejecuta no se le
 * pueden pasar `permissions` junto a su backend con shell—.
 *
 * ## Las guardas
 *
 * - El nombre del plan es un SLUG (`motivoDePlanInaceptable`): es un segmento de ruta, y sin esto
 *   `../..` saldría de la carpeta de planes.
 * - Ni la carpeta ni el fichero pueden ser un enlace (`lstat`), y el camino REAL tiene que seguir
 *   dentro de `.xonecode/planes/`: lo mismo que `planesEnDisco.ts` al leer.
 * - No crea nada: sin `TASKS.md` no hay criterios que marcar.
 *
 * **Límite declarado**: escribe directo al disco, sin la cola de `escriturasEnSerie`. Un
 * `edit_file` del desarrollador sobre el MISMO `TASKS.md` a la vez podría pisar la marca.
 */
export const NOMBRE_MARCAR_CRITERIOS = "marcar_criterios_del_plan";

const ESQUEMA = z.object({
  plan: z.string().describe(`El nombre del plan: la carpeta de ${RUTA_PLANES} (\`buscador-hoteles\`).`),
  tarea: z.string().describe("El número de la tarea TAL CUAL aparece en su cabecera: `01`, `T3`."),
  criterios: z
    .array(z.number().int())
    .min(1)
    .describe("Qué criterios COMPROBASTE, contando las casillas `- [ ]` de esa tarea de 1 en adelante, en su orden."),
});

function dentroDe(real: string, base: string): boolean {
  return real === base || real.startsWith(base.endsWith(sep) ? base : `${base}${sep}`);
}

export function crearMarcarCriteriosDelPlan(donde: { raiz: string }) {
  return tool(
    async ({ plan, tarea, criterios }: z.infer<typeof ESQUEMA>) => {
      const nombre = plan.trim().replace(/^\/?planes\//, "").replace(/\/+$/, "");
      const motivo = motivoDePlanInaceptable(nombre);
      if (motivo !== undefined) return `«${plan}» no es el nombre de un plan: ${motivo}`;
      const carpetaDePlanes = join(donde.raiz, CARPETA_DE_PLANES);
      const fichero = join(carpetaDePlanes, nombre, "TASKS.md");
      try {
        if (!lstatSync(join(carpetaDePlanes, nombre)).isDirectory() || !lstatSync(fichero).isFile()) {
          return `El plan «${nombre}» no tiene un TASKS.md que marcar.`;
        }
        if (!dentroDe(realpathSync(fichero), realpathSync(carpetaDePlanes))) {
          return `El TASKS.md de «${nombre}» apunta fuera de la carpeta de planes.`;
        }
      } catch {
        return `No existe el plan «${nombre}», o no tiene TASKS.md. Mira ${RUTA_PLANES} para ver cuáles hay.`;
      }
      const resultado = marcarCriterios(readFileSync(fichero, "utf8"), tarea.trim(), criterios);
      if ("error" in resultado) return resultado.error;
      if (resultado.marcados.length > 0) writeFileSync(fichero, resultado.texto);
      return (
        `${RUTA_PLANES}${nombre}/TASKS.md, tarea ${tarea.trim()}: ` +
        (resultado.marcados.length > 0 ? `marcados ${resultado.marcados.join(", ")}` : "nada nuevo que marcar") +
        (resultado.yaEstaban.length > 0 ? `; ya estaban marcados ${resultado.yaEstaban.join(", ")}` : "") +
        "."
      );
    },
    {
      name: NOMBRE_MARCAR_CRITERIOS,
      description:
        "Marca como COMPROBADOS criterios de una tarea de un plan (`/planes/<nombre>/TASKS.md`): pone `- [x]` en sus casillas. " +
        "Úsala SOLO con lo que acabas de verificar en el aparato —no por lo que alguien dijo que hizo—, y dale los números de " +
        "las casillas de esa tarea en su orden (lee antes el TASKS.md). No cambia nada más del fichero.",
      schema: ESQUEMA,
    }
  );
}
