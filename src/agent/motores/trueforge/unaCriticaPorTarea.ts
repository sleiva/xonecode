import { tool, type StructuredToolInterface } from "@langchain/core/tools";
import { INICIO_DE_UN_VEREDICTO } from "../../grafo/criticaVisual.js";

/**
 * **El crítico visual del ORQUESTADOR, una vez por tarea del plan.** Medido en la pasada 18 de la calculadora
 * (04-11-2026): con las tres tareas hechas y probadas, cada crítica nueva del raíz abría otra vuelta del desarrollador
 * —las líneas del display, una verificación aparte, el tono de naranja de una tecla— y fueron los últimos 14 minutos.
 * La primera crítica de una tarea pasa; la segunda contesta que lo que quede va como observación al cerrar. Solo gasta la
 * de su tarea una crítica que DEVOLVIÓ veredicto: una que falló (la captura no se abre) no ha juzgado nada.
 *
 * `tareaActual` es la última tarea del plan que se le encargó a alguien (`plan|número`); sin tarea, no se limita.
 *
 * **Y la del DESARROLLADOR que prueba él mismo, con el MISMO cupo** (`criticadas` compartido): la pasa él ANTES de devolver
 * y arregla ahí lo rojo con una recarga; la del orquestador ya no abre otra vuelta. Medido en la calculadora (05-11-2026,
 * 0689dc23): sin crítico en su bucle devolvió la T1 con los operadores de otro color, el crítico del orquestador dio rojo y
 * la vuelta entera para arreglarlo fueron 10,4 minutos.
 */
export function unaCriticaPorTarea(
  critica: StructuredToolInterface,
  tareaActual: () => string | undefined,
  /** Sin maqueta no hay contra qué comparar: el crítico no corre y lo revisa el juez del cierre. */
  hayMaqueta: () => boolean = () => true,
  opciones: { criticadas?: Set<string>; repetida?: (tarea: string) => string } = {}
): StructuredToolInterface {
  const criticadas = opciones.criticadas ?? new Set<string>();
  const repetida = opciones.repetida ?? textoDeCriticaRepetida;
  return tool(
    async (args: unknown) => {
      if (!hayMaqueta()) return TEXTO_SIN_MAQUETA;
      const tarea = tareaActual();
      if (tarea !== undefined && criticadas.has(tarea)) return repetida(tarea);
      const salida: unknown = await critica.invoke(args as never);
      const texto = typeof salida === "string" ? salida : String((salida as { content?: unknown } | undefined)?.content ?? "");
      if (tarea !== undefined && texto.startsWith(INICIO_DE_UN_VEREDICTO)) criticadas.add(tarea);
      return salida;
    },
    { name: critica.name, description: critica.description, schema: critica.schema as never }
  ) as unknown as StructuredToolInterface;
}

export function textoDeCriticaRepetida(tarea: string): string {
  const [plan, numero] = tarea.split("|");
  return (
    `La tarea ${numero ?? ""} de /planes/${plan ?? ""}/ ya pasó su crítica visual en este turno: UNA por tarea. Lo que ` +
    "aún difiera de la maqueta no abre otra vuelta del desarrollador: dilo como OBSERVACIÓN en tu cierre y sigue con la " +
    "siguiente tarea, o cierra si no quedan."
  );
}

/** Para el desarrollador: su crítica de la tarea ya está gastada (la suya o la del orquestador). */
export function textoDeCriticaRepetidaDelDesarrollador(tarea: string): string {
  const [plan, numero] = tarea.split("|");
  return (
    `La tarea ${numero ?? ""} de /planes/${plan ?? ""}/ ya pasó su crítica visual: UNA por tarea. Arregla lo que señaló en ROJO, ` +
    "compruébalo con tu captura y `view_image`, y DEVUELVE diciendo qué quedó de lo que dijo: no hay otra crítica."
  );
}

export const TEXTO_SIN_MAQUETA =
  "Este trabajo no parte de una maqueta: no hay crítica visual (no hay contra qué comparar). Lo revisa el juez al cerrar; " +
  "sigue con el trabajo o cierra.";
