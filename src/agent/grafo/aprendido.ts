import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import {
  ALCANCES_DE_APRENDIZAJE,
  conAprendizaje,
  FICHERO_DE_APRENDIDO,
  FICHERO_DE_APRENDIDO_DE_XONE,
  interpretarAprendido,
  motivoDeAprendizajeInaceptable,
  motivoDeXoneConDatosDelProyecto,
  nombresDelProyecto,
  NOMBRE_APUNTAR_APRENDIZAJE,
  TOPE_DE_COMO_LO_SE,
  TOPE_DE_TEMA,
  TOPE_DE_TEXTO,
  type Aprendizaje,
} from "../../core/aprendido.js";
import { NOMBRE_CARPETA } from "../config/configEnDisco.js";
import { ficherosDelProyecto } from "../turno/ficherosDelProyecto.js";

export { NOMBRE_APUNTAR_APRENDIZAJE };

/** `.xonecode/aprendido.json` del proyecto (`core/aprendido.ts` tiene el porqué). */
export function rutaDeAprendido(raiz: string): string {
  return join(raiz, NOMBRE_CARPETA, FICHERO_DE_APRENDIDO);
}

/** `~/.xonecode/aprendido-xone.json`: lo de XOne, que vale en todos los proyectos. `casa` se lee en cada llamada, como el resto de la config global. */
export function rutaDeAprendidoDeXone(casa: string = homedir()): string {
  return join(casa, NOMBRE_CARPETA, FICHERO_DE_APRENDIDO_DE_XONE);
}

/** Lo apuntado, o una lista vacía: sin fichero, o roto, no hay nada que poner delante. */
function leerDe(ruta: string): Aprendizaje[] {
  try {
    return interpretarAprendido(readFileSync(ruta, "utf8"));
  } catch {
    return [];
  }
}

export function leerAprendido(raiz: string): Aprendizaje[] {
  return leerDe(rutaDeAprendido(raiz));
}

export function leerAprendidoDeXone(casa?: string): Aprendizaje[] {
  return leerDe(rutaDeAprendidoDeXone(casa));
}

/** Escritura atómica y 0600 (lo del proyecto puede llevar una contraseña; lo de XOne no debería, pero no se puede comprobar). */
function escribirEn(ruta: string, lista: readonly Aprendizaje[]): void {
  mkdirSync(join(ruta, ".."), { recursive: true });
  const temporal = `${ruta}.${process.pid}.tmp`;
  writeFileSync(temporal, `${JSON.stringify(lista, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  renameSync(temporal, ruta);
}

function apuntarEn(ruta: string, nuevo: Aprendizaje): Aprendizaje[] {
  const lista = conAprendizaje(leerDe(ruta), nuevo);
  escribirEn(ruta, lista);
  return lista;
}

/** La lista ENTERA, para el panel (editar, borrar, mover): la decide `core/aprendido.ts`, aquí solo se escribe. */
export function escribirAprendido(raiz: string, lista: readonly Aprendizaje[]): void {
  escribirEn(rutaDeAprendido(raiz), lista);
}

export function escribirAprendidoDeXone(lista: readonly Aprendizaje[], casa?: string): void {
  escribirEn(rutaDeAprendidoDeXone(casa), lista);
}

/** Apunta uno en el proyecto, sustituyendo el del mismo tema. */
export function apuntarAprendizaje(raiz: string, nuevo: Aprendizaje): Aprendizaje[] {
  return apuntarEn(rutaDeAprendido(raiz), nuevo);
}

/** Apunta uno de XOne, para todos los proyectos. */
export function apuntarAprendizajeDeXone(nuevo: Aprendizaje, casa?: string): Aprendizaje[] {
  return apuntarEn(rutaDeAprendidoDeXone(casa), nuevo);
}

const ESQUEMA = z.object({
  tema: z.string().describe(`De qué va, corto y siempre igual para lo mismo (máximo ${TOPE_DE_TEMA}): «cómo entrar en la app», «llegar al menú de albaranes»`),
  texto: z.string().describe(`Lo aprendido, concreto y corto (máximo ${TOPE_DE_TEXTO}): «usuario 08006, sin contraseña; pulsar Entrar»`),
  como_lo_se: z
    .string()
    .describe(`Cómo lo COMPROBASTE (máximo ${TOPE_DE_COMO_LO_SE}): «entré en el emulador con él», «está en usuarios.xne». Si no lo comprobaste, no lo apuntes`),
  alcance: z
    .enum(ALCANCES_DE_APRENDIZAJE as unknown as ["proyecto", "xone"])
    .describe(
      "«proyecto»: un hecho de ESTE proyecto (su usuario, cómo llegar a una pantalla suya). «xone»: cómo se comporta XOne en " +
        "cualquier app (un atributo, algo que exige desplegar); lo leen los encargos de TODOS los proyectos, así que nunca " +
        "usuarios, claves ni nombres de este"
    ),
  sensible: z
    .boolean()
    .optional()
    .describe("true si lleva un usuario, una clave o un token: el panel de la persona lo enseña oculto hasta que lo pida"),
});

/**
 * `apuntar_aprendizaje`: escribe lo aprendido para los encargos siguientes. **Sin aprobación**: no es un fichero de la
 * app —vive en `.xonecode/`, que no sube ni entra en los commits— sino memoria del agente, como un plan. El mismo tema se
 * sustituye. Un rechazo se DEVUELVE, nunca se lanza.
 */
export function crearApuntarAprendizaje(donde: { raiz: string; quien: string; ahora?: () => Date; casa?: string }) {
  return tool(
    async ({ tema, texto, como_lo_se: comoLoSe, alcance, sensible }: z.infer<typeof ESQUEMA>) => {
      const motivo = motivoDeAprendizajeInaceptable({ tema, texto, comoLoSe });
      if (motivo !== undefined) return `No se apunta: ${motivo}.`;
      // Lo de XOne cruza de un proyecto a otro: si nombra algo de ESTE, no es de XOne (`motivoDeXoneConDatosDelProyecto`).
      if (alcance === "xone") {
        const ajeno = motivoDeXoneConDatosDelProyecto({ tema, texto, comoLoSe }, nombresDelProyecto(basename(donde.raiz), ficherosDelProyecto(donde.raiz)));
        if (ajeno !== undefined) return `No se apunta como XOne: ${ajeno}.`;
      }
      const nuevo: Aprendizaje = {
        tema,
        texto,
        comoLoSe,
        cuando: (donde.ahora?.() ?? new Date()).toISOString(),
        quien: donde.quien,
        ...(sensible === undefined ? {} : { sensible }),
      };
      try {
        if (alcance === "xone") {
          const lista = apuntarAprendizajeDeXone(nuevo, donde.casa);
          return `Apuntado «${tema.trim()}» como de XOne: los encargos de TODOS los proyectos lo tendrán delante (${lista.length} cosa(s) aprendida(s) de XOne).`;
        }
        const lista = apuntarAprendizaje(donde.raiz, nuevo);
        return `Apuntado «${tema.trim()}». Los encargos siguientes lo tendrán delante (${lista.length} cosa(s) aprendida(s) en el proyecto).`;
      } catch (error) {
        return `No se pudo apuntar: ${(error as NodeJS.ErrnoException).code ?? "error de disco"}.`;
      }
    },
    {
      name: NOMBRE_APUNTAR_APRENDIZAJE,
      description:
        "Apunta algo aprendido que otro encargo va a necesitar: del PROYECTO (cómo entrar en la app con su usuario y clave, " +
        "qué pulsar para llegar a una pantalla, una trampa suya) o de XONE, que vale en cualquier app. El harness se lo pone " +
        "delante a los encargos siguientes: lo del proyecto, en este; lo de XOne, en todos. Solo lo COMPROBADO, diciendo " +
        "cómo: lo supuesto no se apunta. El mismo tema se sustituye: úsalo también para corregir algo que ya no es cierto.",
      schema: ESQUEMA,
    }
  );
}
