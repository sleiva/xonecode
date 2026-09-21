import { copyFileSync, existsSync, mkdirSync, realpathSync, statSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { esRutaDeArtefacto, artefactoFueraDeSitio, RUTA_ARTEFACTOS } from "../../core/artefactos.js";
import { puedeEscribirRuta, type QuienDecidePermisos } from "./perfiles.js";

/**
 * Traer un artefacto AL proyecto, que es la única forma sancionada de cruzar ese muro.
 *
 * ## Por qué es una tool y no algo que el agente pueda hacer solo
 *
 * Las tools de fichero son de TEXTO —`write_file` recibe una cadena, y el propio backend
 * declara `write(filePath, content: string)`—, así que un PNG no sobrevive a un
 * `read_file` + `write_file`: se copiaría corrupto y nadie se enteraría hasta abrir el
 * manual. La otra vía sería una shell, y dársela al que documenta es justo lo contrario de
 * lo que lo hace inofensivo. Es el mismo reparto que el PDF: lo hace el harness porque el
 * agente no puede, y concederle la capacidad habría sido peor que el problema.
 *
 * ## Por qué esto NO es un agujero en la guarda de artefactos
 *
 * `artefactoFueraDeSitio` existe para que un artefacto no acabe dentro del proyecto, y esa
 * regla se hizo cuando colarse dentro era SIEMPRE un descuido. Documentar es el primer caso
 * donde meterlo dentro es lo correcto: un manual en `doc/` con sus capturas al lado viaja
 * con el proyecto, entra en git y sube a CloudStudio, que es lo que lo hace un manual y no
 * una salida de usar y tirar.
 *
 * La diferencia entre un agujero y una puerta es que la puerta tiene guarda, y aquí son
 * tres, todas reaplicadas A MANO: **una tool propia no pasa por el middleware de permisos**
 * —ya lo hacen `regex_search` y `xone_navegacion` con `puedeLeerRuta`, y una que ESCRIBE
 * tiene el mismo deber con más consecuencias—. Sin `puedeEscribirRuta`, esto sería
 * exactamente la puerta trasera por la que un agente de solo lectura mete ficheros en el
 * proyecto.
 *
 * ## Las guardas, y por qué cada una
 *
 * 1. **El ORIGEN es un artefacto de verdad** (`esRutaDeArtefacto`, lista BLANCA de forma y
 *    no un `startsWith`): sin esto el «origen» podría ser `/artefactos/../.env`.
 * 2. **El DESTINO lo puede escribir ESTE agente** (`puedeEscribirRuta`), que es lo que hace
 *    que la tool no conceda nada que el perfil no tuviera ya.
 * 3. **El destino no es un sitio equivocado de artefacto** (`artefactoFueraDeSitio`): copiar
 *    a `/artifacts/x.png` sería recrear dentro del proyecto justo lo que esa guarda impide.
 *
 * Y las dos rutas se comprueban **dos veces**, por TEXTO y por `realpath`, como en
 * `arbolDeProyecto.ts` y en las escrituras de los motores externos: en APFS `.ENV` abre
 * `.env`, y un enlace dentro de la raíz puede apuntar fuera. Lo que no se pueda comprobar
 * se deniega.
 */
export const NOMBRE_COPIAR_ARTEFACTO = "copiar_artefacto";

const ESQUEMA = z.object({
  artefacto: z
    .string()
    .describe(
      "El artefacto a copiar: su nombre (`login.png`) o su ruta virtual (`/artefactos/login.png`).",
    ),
  destino: z
    .string()
    .describe(
      "Dónde dejarlo dentro del proyecto, ruta virtual completa con su nombre de fichero"
        + " (`/doc/img/login.png`). Las carpetas que falten se crean.",
    ),
});

export interface DondeCopiar {
  /** La raíz REAL del proyecto en disco. */
  raiz: string;
  /** La carpeta REAL de artefactos de esta sesión. */
  carpetaDeArtefactos: string;
  /** De quién son los permisos que hay que reaplicar. */
  perfil: QuienDecidePermisos;
}

/** `login.png` y `/artefactos/login.png` son lo mismo: se admite lo que el modelo escriba. */
function comoRutaDeArtefacto(entrada: string): string {
  const limpia = entrada.trim();
  return limpia.startsWith(RUTA_ARTEFACTOS) ? limpia : `${RUTA_ARTEFACTOS}${limpia.replace(/^\/+/, "")}`;
}

/** ¿Está `real` dentro de `base`? Por SEGMENTO, que es lo que impide que `/a/bc` pase por `/a/b`. */
function dentroDe(real: string, base: string): boolean {
  const raiz = realpathSync(base);
  return real === raiz || real.startsWith(raiz.endsWith(sep) ? raiz : `${raiz}${sep}`);
}

export function crearCopiarArtefacto(donde: DondeCopiar) {
  return tool(
    async ({ artefacto, destino }: z.infer<typeof ESQUEMA>) => {
      const origenVirtual = comoRutaDeArtefacto(artefacto);
      if (!esRutaDeArtefacto(origenVirtual)) {
        return `«${artefacto}» no es un artefacto de esta sesión. Solo se copia lo que está en ${RUTA_ARTEFACTOS}.`;
      }
      const destinoVirtual = destino.trim().startsWith("/") ? destino.trim() : `/${destino.trim()}`;

      // El destino, contra los permisos de QUIEN llama. Se dice qué carpetas sí, porque un
      // «no puedes» sin la alternativa manda a probar rutas al azar.
      if (!puedeEscribirRuta(donde.perfil, destinoVirtual)) {
        const abiertas = (donde.perfil.escribeEn ?? []).join(", ");
        return (
          `No puedes escribir en «${destinoVirtual}».`
          + (abiertas === "" ? " No tienes ninguna carpeta del proyecto abierta para escribir." : ` Puedes escribir en: ${abiertas}.`)
        );
      }
      const malSitio = artefactoFueraDeSitio(destinoVirtual);
      if (malSitio !== undefined) {
        return `«${destinoVirtual}» no vale como destino: esa carpeta es para artefactos, y esto los SACA de ahí. Elige una carpeta del proyecto, como /doc/img/.`;
      }

      const origenReal = resolve(donde.carpetaDeArtefactos, origenVirtual.slice(RUTA_ARTEFACTOS.length));
      const destinoReal = resolve(donde.raiz, destinoVirtual.replace(/^\/+/, ""));

      if (!existsSync(origenReal) || !statSync(origenReal).isFile()) {
        return `No existe el artefacto «${origenVirtual}». Lista ${RUTA_ARTEFACTOS} para ver cuáles hay.`;
      }
      // La SEGUNDA comprobación, sobre el camino real: el texto ya pasó, pero un enlace
      // simbólico puede salir de la carpeta y el sistema de ficheros puede no distinguir
      // mayúsculas. Lo que no se pueda comprobar se deniega.
      try {
        if (!dentroDe(realpathSync(origenReal), donde.carpetaDeArtefactos)) {
          return `«${origenVirtual}» apunta fuera de la carpeta de artefactos.`;
        }
        const carpetaDestino = dirname(destinoReal);
        mkdirSync(carpetaDestino, { recursive: true });
        if (!dentroDe(realpathSync(carpetaDestino), donde.raiz)) {
          return `«${destinoVirtual}» apunta fuera del proyecto.`;
        }
      } catch (error) {
        return `No se pudo comprobar la ruta: ${error instanceof Error ? error.message : String(error)}`;
      }

      try {
        copyFileSync(origenReal, destinoReal);
      } catch (error) {
        return `No se pudo copiar: ${error instanceof Error ? error.message : String(error)}`;
      }
      const bytes = statSync(destinoReal).size;
      return `Copiado ${origenVirtual} → ${destinoVirtual} (${bytes} bytes). Ya es un fichero del proyecto: entra en git y sube a CloudStudio.`;
    },
    {
      name: NOMBRE_COPIAR_ARTEFACTO,
      description:
        "Copia un artefacto de esta sesión (una captura, un diagrama) a una carpeta del proyecto,"
        + " para que viaje con él. Úsalo cuando el fichero forme parte del entregable —las imágenes"
        + " de un manual, por ejemplo— y no cuando sea una salida de usar y tirar: para eso ya está"
        + " /artefactos/. Copia los BYTES, así que sirve para imágenes; `read_file` no.",
      schema: ESQUEMA,
    },
  );
}

/** Para los tests: la ruta real que le tocaría a un destino virtual. */
export function rutaRealDeDestino(raiz: string, destinoVirtual: string): string {
  return join(raiz, destinoVirtual.replace(/^\/+/, ""));
}
