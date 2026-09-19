import { createMiddleware } from "langchain";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { z } from "zod";
import {
  avisoDeNoSatisfecho,
  esTerminal,
  mensajeDeRevision,
  TOPE_DE_VUELTAS,
  type Calificacion,
  type EstadoDeRubrica,
} from "../../core/rubrica.js";

/**
 * Quién juzga. **Un PUERTO y no un modelo construido dentro**, que es la diferencia con el
 * original de Python: así el bucle entero se prueba sin red y sin clave, que es el invariante
 * que sostiene el diseño de este repo. Quien lo implemente con un modelo de verdad vive fuera.
 *
 * Recibe el transcript tal cual y la rúbrica. Devolver es obligatorio: si no puede juzgar, que
 * lance — el bucle distingue «no cumple» de «no se pudo juzgar», y son dos cosas distintas.
 */
export type Calificador = (
  mensajes: readonly unknown[],
  rubrica: string,
) => Promise<Calificacion>;

const ESTADO_DE_RUBRICA = z.object({
  /** La rúbrica de ESTE encargo. Sin ella el middleware no hace nada. */
  rubrica: z.string().optional(),
  vueltasDeRubrica: z.number().default(0),
  estadoDeRubrica: z.string().optional(),
});

/**
 * El bucle de rúbrica, portado del `RubricMiddleware` de deepagents (que está en su SDK de
 * Python y no en el de JS).
 *
 * En la parada natural del agente —el modelo contesta sin pedir más tools— se juzga lo hecho
 * contra la rúbrica. `necesita-revision` mete el comentario como mensaje y **salta de vuelta al
 * modelo** (`jumpTo: "model"`, que el langchain de JS admite desde `afterAgent`); cualquier otro
 * veredicto cierra.
 *
 * **Sin rúbrica no hace NADA**, igual que el original, y por eso se puede montar siempre: un
 * turno normal no paga ni una llamada. Lo que decide si hay bucle es el dato, no una bandera.
 *
 * **Y a diferencia del original, un final no satisfecho SE DICE**: allí el estado vive en un
 * campo privado y la última respuesta sigue siendo la del modelo —que puede estar afirmando que
 * terminó—. Aquí se apila el aviso, que es la misma regla que hizo falta en el tope de llamadas.
 *
 * `alEvaluar` existe para que el harness pueda enseñarlo donde una persona lo vea: un mensaje
 * apilado llega al transcript, pero no a la pantalla.
 */
export function middlewareDeRubrica(opciones: {
  calificar: Calificador;
  tope?: number;
  alEvaluar?: (estado: EstadoDeRubrica, vuelta: number) => void;
}): ReturnType<typeof createMiddleware> {
  const tope = opciones.tope ?? TOPE_DE_VUELTAS;
  return createMiddleware({
    name: "RubricaMiddleware",
    stateSchema: ESTADO_DE_RUBRICA,
    afterAgent: {
      canJumpTo: ["model"],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      hook: async (state: any) => {
        const rubrica = typeof state?.rubrica === "string" ? state.rubrica.trim() : "";
        if (rubrica === "") return undefined;
        // Un estado ya terminal significa que este turno ya se juzgó y se cerró. Sin esta
        // guarda, volver a pasar por aquí reabriría un bucle que ya había decidido.
        const previo = state?.estadoDeRubrica as EstadoDeRubrica | undefined;
        if (previo !== undefined && esTerminal(previo)) return undefined;

        const vuelta = (state?.vueltasDeRubrica ?? 0) + 1;
        if (vuelta > tope) return cerrar("tope-de-vueltas", vuelta - 1, opciones.alEvaluar);

        let calificacion: Calificacion;
        try {
          calificacion = await opciones.calificar(state?.messages ?? [], rubrica);
        } catch {
          // Que el calificador no conteste es fallo del ENTORNO, no del trabajo. Se distingue
          // a propósito de `fallido`, que culpa a la rúbrica: mezclarlos manda a arreglar lo
          // que no estaba roto.
          return cerrar("error-del-calificador", vuelta, opciones.alEvaluar);
        }

        opciones.alEvaluar?.(calificacion.veredicto, vuelta);
        if (calificacion.veredicto === "satisfecho") {
          return { vueltasDeRubrica: vuelta, estadoDeRubrica: "satisfecho" };
        }
        if (calificacion.veredicto === "fallido") {
          return {
            vueltasDeRubrica: vuelta,
            estadoDeRubrica: "fallido",
            messages: [new AIMessage(avisoDeNoSatisfecho("fallido", calificacion.comentario) ?? "")],
          };
        }
        return {
          vueltasDeRubrica: vuelta,
          estadoDeRubrica: "necesita-revision",
          messages: [new HumanMessage(mensajeDeRevision(calificacion.comentario, vuelta, tope))],
          jumpTo: "model",
        };
      },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any) as ReturnType<typeof createMiddleware>;
}

/** Cierra el bucle diciéndolo: un final no satisfecho que se calla es el fallo del original. */
function cerrar(
  estado: EstadoDeRubrica,
  vuelta: number,
  alEvaluar?: (estado: EstadoDeRubrica, vuelta: number) => void,
): Record<string, unknown> {
  alEvaluar?.(estado, vuelta);
  return {
    vueltasDeRubrica: vuelta,
    estadoDeRubrica: estado,
    messages: [new AIMessage(avisoDeNoSatisfecho(estado) ?? "")],
  };
}
