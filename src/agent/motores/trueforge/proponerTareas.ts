import { tool } from "@langchain/core/tools";
import { z } from "zod";
import {
  motivoDePropuestaInaceptable,
  NOMBRE_PROPONER_TAREAS,
  TOPE_DE_TAREAS_PROPUESTAS,
  type PropuestaDeTareas,
} from "../../../core/repartoDeEncargo.js";

export { NOMBRE_PROPONER_TAREAS };

/**
 * El orquestador PROPONE repartir un encargo grande en tareas de fondo que corren en orden
 * (`core/repartoDeEncargo.ts`, plan `docs/superpowers/plans/2026-10-06-tareas-encadenadas.md`).
 *
 * **No crea ninguna tarea.** Crear una tarea es la autorización para que escriba sin preguntar (CLAUDE.md § tareas), y
 * esa la da la persona al pulsar «Encolar en orden» en la tarjeta, también en modo autónomo. La tool valida, entrega la
 * propuesta a la sesión (`proponer`, que la anuncia como evento `propuesta-de-tareas`) y devuelve un texto que le dice
 * al agente que termine el turno. Un rechazo se DEVUELVE, nunca se lanza: una excepción se lleva el turno.
 *
 * Solo la recibe el RAÍZ y solo en una sesión de persona de la web, que es la que tiene la cola de tareas
 * (`AbrirSesionTrueforge.puedeProponerTareas`): una tarea de fondo que propusiera tareas encadenaría trabajo sin nadie.
 */
const Esquema = z.object({
  motivo: z.string().describe("Por qué no cabe en un turno. Se le enseña a la persona encima de las tareas."),
  tareas: z
    .array(
      z.object({
        titulo: z.string().describe("Corto, para la lista: «Ventana Entradas/Salidas»."),
        peticion: z
          .string()
          .describe(
            "El encargo de ESA tarea, AUTOSUFICIENTE: la tarea no verá esta conversación. Qué pantalla, de dónde salen los datos, " +
              "cómo se navega, qué queda fuera, el criterio de aceptación y el plan (/planes/…) si lo hay."
          ),
        adjuntos: z
          .array(z.string())
          .optional()
          .describe("Los adjuntos de ESTA conversación (sus diseños) que necesita esta tarea, por nombre (/adjuntos/x.zip): se le copiarán."),
      })
    )
    .min(2)
    .max(TOPE_DE_TAREAS_PROPUESTAS)
    .describe(`De 2 a ${TOPE_DE_TAREAS_PROPUESTAS} tareas, EN EL ORDEN en que tienen que correr: cada una empieza cuando termina la anterior.`),
});

export function crearProponerTareas(proponer: (p: PropuestaDeTareas) => void) {
  return tool(
    async (p: z.infer<typeof Esquema>): Promise<string> => {
      const propuesta: PropuestaDeTareas = {
        motivo: p.motivo,
        tareas: p.tareas.map((t) => ({ titulo: t.titulo, peticion: t.peticion, ...(t.adjuntos === undefined ? {} : { adjuntos: t.adjuntos }) })),
      };
      const motivo = motivoDePropuestaInaceptable(propuesta);
      if (motivo !== undefined) return `No se propone: ${motivo}. Corrígelo y vuelve a llamarla, o hazlo en este turno si cabe.`;
      proponer(propuesta);
      return (
        `Propuesta enviada a la persona: ${propuesta.tareas.length} tareas en orden. NO las hagas en este turno: ella revisa cada ` +
        "encargo y decide si se encolan, si las descarta o si te pide hacerlo aquí, en la conversación (entonces te llegará como " +
        "un mensaje suyo). Termina el turno diciéndoselo en una frase."
      );
    },
    {
      name: NOMBRE_PROPONER_TAREAS,
      description:
        "Propone a la persona repartir un encargo GRANDE (varias pantallas o entregables independientes que no caben en un turno) " +
        "en tareas de fondo que corren EN ORDEN, cada una con sus diseños adjuntos. No crea nada: la persona revisa cada tarea y " +
        "decide si se encolan. Antes de usarla, pregunta con ask_user_question lo que te falte para que cada tarea sea autosuficiente.",
      schema: Esquema,
    }
  );
}

/**
 * Lo que el raíz sabe de `proponer_tareas`, solo cuando la tiene. Preguntar ANTES es petición de la persona: la tarea no
 * verá esta conversación, así que lo que falte en su encargo lo adivinaría.
 */
export const REPARTIR_EN_TAREAS = [
  "REPARTIR UN ENCARGO GRANDE EN TAREAS DE FONDO:",
  `- Si el encargo son varias pantallas o entregables independientes (por ejemplo, diseñar dos ventanas), o el plan del analista no cabe en un turno, no lo hagas todo aquí: propón repartirlo con ${NOMBRE_PROPONER_TAREAS}, una tarea por entregable y en el orden en que tienen que correr.`,
  "- ANTES de proponer, pregunta con ask_user_question lo que te falte para que cada tarea sea autosuficiente: qué diseño o adjunto va con cada una, de dónde salen los datos, cómo se navega entre pantallas y qué queda fuera. No preguntes lo que ya está en la conversación o en el proyecto.",
  "- Cada petición se escribe para alguien que NO ha visto esta conversación: qué hacer, con qué datos, el criterio de aceptación y el plan (/planes/…) si lo hay. Pon en `adjuntos` los diseños de /adjuntos/ que necesita ESA tarea.",
  "- No lo uses para lo que cabe en un turno. Y tras proponer no hagas las tareas: la persona decide si se encolan.",
].join("\n");
