import { copyFileSync, existsSync, mkdirSync, realpathSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { mimeDeArtefacto, RUTA_ARTEFACTOS, type Artefacto } from "../../core/artefactos.js";
import { motivoDeTraidaInaceptable, nombreParaTraer, TOPE_DE_TRAIDA } from "../../core/traerDeLaMaquina.js";

/**
 * Traer al área de trabajo un fichero que la PERSONA ha nombrado por su ruta.
 *
 * ## El caso, medido
 *
 * «Usa el diseño de `/Users/…/Downloads/stitch_calculadora.zip`». Esa ruta no es del proyecto,
 * y las tools de fichero van confinadas a su raíz, así que el agente no podía abrirla: la
 * resolvía DENTRO del proyecto, recibía un ENOENT que decía «no existe» sobre un fichero que
 * sí existe, concluía que estaba enjaulado y se iba a delegar en el único especialista con
 * shell para que lo copiara. Dieciocho pasos y un `unzip` para un fichero que le acababan de
 * nombrar.
 *
 * ## Por qué COPIAR y no montar el disco
 *
 * La primera versión montaba la máquina entera bajo `/disco/`, de solo lectura. **Rompió un
 * turno de producción**: con `/` dentro del `CompositeBackend`, toda operación recursiva sin
 * ruta lo recorre — un `grep` sobre el PROYECTO tardaba 30 segundos y moría con
 * `EPERM … scandir '/Volumes/com.apple.TimeMachine.localsnapshots'`.
 *
 * Y al mirarlo se vio que montar era más de lo que hacía falta. Lo que se necesita no es
 * navegar el disco: es **traerse un fichero concreto**. Copiar tiene tres ventajas que el
 * montaje no puede dar: no hay nada recursivo que se descontrole, lo traído queda en el área
 * de trabajo —donde se ANUNCIA y se puede volver a leer—, y un BINARIO sobrevive: un `.zip` o
 * un `.png` no aguantan un `read_file` + `write_file`, que son de TEXTO. Es el mismo reparto
 * que `copiar_artefacto` y que el PDF: lo hace el harness porque el agente no puede.
 *
 * ## Las guardas
 *
 * 1. **Lo que se acepta es una lista BLANCA de forma** (`core/traerDeLaMaquina.ts`): una ruta
 *    absoluta de verdad, y nada del propio harness —`auth.json` guarda las claves en claro y
 *    cualquier `.xonecode/` lleva la conversación entera—.
 * 2. **El DESTINO no se recibe**: lo deriva el código dentro de la carpeta de artefactos. Con
 *    un destino por parámetro esto sería una forma de escribir donde se quisiera.
 * 3. **Tope de tamaño**, porque el área de trabajo no es un almacén y un fichero enorme se
 *    copia igual de callado que uno pequeño.
 * 4. Y la ruta se comprueba **dos veces**, por TEXTO y por `realpath`, como en
 *    `arbolDeProyecto.ts`: un enlace puede apuntar a otro sitio.
 */
export const NOMBRE_TRAER = "traer_de_la_maquina";

const Entrada = z.object({
  ruta: z
    .string()
    .describe(
      "La ruta ABSOLUTA del fichero en la máquina, tal y como la escribió la persona " +
        "(por ejemplo /Users/alguien/Downloads/diseno.zip). Se copia a /artefactos/ y se " +
        "trabaja desde ahí.",
    ),
});
type Entrada = z.infer<typeof Entrada>;

export interface DependenciasDeTraida {
  /** La carpeta de artefactos de la sesión. Sin ella no hay dónde dejarlo. */
  carpeta?: string;
  /**
   * Para ANUNCIARLO, con el mismo evento que una escritura de artefacto.
   *
   * No es cosmético: lo traído cae en una carpeta que se escribe SIN aprobación, y la regla de
   * este repo es que lo que nadie aprueba no puede ser además mudo. Sin esto, el fichero
   * existiría en el disco y no existiría para nadie.
   */
  alEscribir?: (a: Artefacto) => void;
}

export function crearTraerDeLaMaquina(deps: DependenciasDeTraida) {
  return tool(
    async (entrada: Entrada) => {
      if (deps.carpeta === undefined) {
        return "Esta sesión no tiene carpeta de artefactos, así que no hay dónde dejarlo.";
      }
      const motivo = motivoDeTraidaInaceptable(entrada.ruta);
      if (motivo !== undefined) return motivo;

      // Dos veces, por TEXTO y por el camino REAL: un enlace puede apuntar a otro sitio.
      let real: string;
      try {
        real = realpathSync(entrada.ruta);
      } catch (error) {
        // De un error de Node solo el NOMBRE: su mensaje lleva la ruta absoluta.
        return `No pude abrir «${entrada.ruta}» (${error instanceof Error ? error.name : "error"}).`;
      }
      const motivoReal = motivoDeTraidaInaceptable(real);
      if (motivoReal !== undefined) return motivoReal;

      let bytes: number;
      try {
        const info = statSync(real);
        if (!info.isFile()) return `«${entrada.ruta}» no es un fichero.`;
        bytes = info.size;
      } catch (error) {
        return `No pude mirar «${entrada.ruta}» (${error instanceof Error ? error.name : "error"}).`;
      }
      if (bytes > TOPE_DE_TRAIDA) {
        return (
          `«${basename(real)}» ocupa ${Math.round(bytes / 1024 / 1024)} MB y el tope son ` +
          `${Math.round(TOPE_DE_TRAIDA / 1024 / 1024)} MB. El área de trabajo no es un almacén: ` +
          "si de verdad hace falta ese fichero entero, dilo y que lo decida quien te lo encargó."
        );
      }

      const nombre = nombreParaTraer(real);
      const destino = join(deps.carpeta, nombre);
      try {
        mkdirSync(deps.carpeta, { recursive: true });
        if (existsSync(destino)) return `Ya está traído: ${RUTA_ARTEFACTOS}${nombre}`;
        copyFileSync(real, destino);
      } catch (error) {
        return `No pude copiarlo (${error instanceof Error ? error.name : "error"}).`;
      }
      const mime = mimeDeArtefacto(nombre);
      deps.alEscribir?.({
        ruta: `${RUTA_ARTEFACTOS}${nombre}`,
        nombre,
        ...(mime === undefined ? {} : { mime }),
        bytes,
      });
      return (
        `Copiado a ${RUTA_ARTEFACTOS}${nombre} (${bytes} bytes). Ábrelo por esa ruta. ` +
        "Si es un `.zip`, quien tenga shell puede descomprimirlo ahí mismo."
      );
    },
    {
      name: NOMBRE_TRAER,
      description:
        "Copia al área de trabajo un fichero que la persona haya nombrado por su ruta " +
        "absoluta de la máquina (/Users/..., /tmp/...). Esas rutas NO son del proyecto y no " +
        "se pueden abrir directamente; con esto quedan en /artefactos/ y se leen desde ahí. " +
        "Sirve también para binarios (.zip, .png), que no sobreviven a un read_file.",
      schema: Entrada,
    },
  );
}
