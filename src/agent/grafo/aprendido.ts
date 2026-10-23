import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import {
  conAprendizaje,
  FICHERO_DE_APRENDIDO,
  interpretarAprendido,
  motivoDeAprendizajeInaceptable,
  NOMBRE_APUNTAR_APRENDIZAJE,
  TOPE_DE_COMO_LO_SE,
  TOPE_DE_TEMA,
  TOPE_DE_TEXTO,
  type Aprendizaje,
} from "../../core/aprendido.js";
import { NOMBRE_CARPETA } from "../config/configEnDisco.js";

export { NOMBRE_APUNTAR_APRENDIZAJE };

/** `.xonecode/aprendido.json` del proyecto (`core/aprendido.ts` tiene el porqué). */
export function rutaDeAprendido(raiz: string): string {
  return join(raiz, NOMBRE_CARPETA, FICHERO_DE_APRENDIDO);
}

/** Lo apuntado, o una lista vacía: sin fichero, o roto, no hay nada que poner delante. */
export function leerAprendido(raiz: string): Aprendizaje[] {
  try {
    return interpretarAprendido(readFileSync(rutaDeAprendido(raiz), "utf8"));
  } catch {
    return [];
  }
}

/** Apunta uno, sustituyendo el del mismo tema. Escritura atómica y 0600: puede llevar una contraseña. */
export function apuntarAprendizaje(raiz: string, nuevo: Aprendizaje): Aprendizaje[] {
  const lista = conAprendizaje(leerAprendido(raiz), nuevo);
  const destino = rutaDeAprendido(raiz);
  mkdirSync(join(raiz, NOMBRE_CARPETA), { recursive: true });
  const temporal = `${destino}.${process.pid}.tmp`;
  writeFileSync(temporal, `${JSON.stringify(lista, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  renameSync(temporal, destino);
  return lista;
}

const ESQUEMA = z.object({
  tema: z.string().describe(`De qué va, corto y siempre igual para lo mismo (máximo ${TOPE_DE_TEMA}): «cómo entrar en la app», «llegar al menú de albaranes»`),
  texto: z.string().describe(`Lo aprendido, concreto y corto (máximo ${TOPE_DE_TEXTO}): «usuario 08006, sin contraseña; pulsar Entrar»`),
  como_lo_se: z
    .string()
    .describe(`Cómo lo COMPROBASTE (máximo ${TOPE_DE_COMO_LO_SE}): «entré en el emulador con él», «está en usuarios.xne». Si no lo comprobaste, no lo apuntes`),
});

/**
 * `apuntar_aprendizaje`: escribe lo aprendido para los encargos siguientes. **Sin aprobación**: no es un fichero de la
 * app —vive en `.xonecode/`, que no sube ni entra en los commits— sino memoria del agente, como un plan. El mismo tema se
 * sustituye. Un rechazo se DEVUELVE, nunca se lanza.
 */
export function crearApuntarAprendizaje(donde: { raiz: string; quien: string; ahora?: () => Date }) {
  return tool(
    async ({ tema, texto, como_lo_se: comoLoSe }: z.infer<typeof ESQUEMA>) => {
      const motivo = motivoDeAprendizajeInaceptable({ tema, texto, comoLoSe });
      if (motivo !== undefined) return `No se apunta: ${motivo}.`;
      try {
        const lista = apuntarAprendizaje(donde.raiz, { tema, texto, comoLoSe, cuando: (donde.ahora?.() ?? new Date()).toISOString(), quien: donde.quien });
        return `Apuntado «${tema.trim()}». Los encargos siguientes lo tendrán delante (${lista.length} cosa(s) aprendida(s) en el proyecto).`;
      } catch (error) {
        return `No se pudo apuntar: ${(error as NodeJS.ErrnoException).code ?? "error de disco"}.`;
      }
    },
    {
      name: NOMBRE_APUNTAR_APRENDIZAJE,
      description:
        "Apunta algo aprendido del proyecto o del aparato que otro encargo va a necesitar (cómo entrar en la app con su usuario " +
        "y clave, qué pulsar para llegar a una pantalla, una trampa). El harness se lo pone delante a los encargos siguientes. " +
        "Solo lo COMPROBADO, diciendo cómo: lo supuesto no se apunta. El mismo tema se sustituye: úsalo también para " +
        "corregir algo que ya no es cierto.",
      schema: ESQUEMA,
    }
  );
}
