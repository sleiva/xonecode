import { tool, type StructuredToolInterface } from "@langchain/core/tools";

/**
 * **El crítico visual del ORQUESTADOR, una vez por tarea del plan.** Medido en la pasada 18 de la calculadora
 * (04-11-2026): con las tres tareas hechas y probadas, cada crítica nueva del raíz abría otra vuelta del desarrollador
 * —las líneas del display, una verificación aparte, el tono de naranja de una tecla— y fueron los últimos 14 minutos.
 * La primera crítica de una tarea pasa; la segunda contesta que lo que quede va como observación al cerrar.
 *
 * `tareaActual` es la última tarea del plan que se le encargó a alguien (`plan|número`); sin tarea, no se limita.
 */
export function unaCriticaPorTarea(critica: StructuredToolInterface, tareaActual: () => string | undefined): StructuredToolInterface {
  const criticadas = new Set<string>();
  return tool(
    async (args: unknown) => {
      const tarea = tareaActual();
      if (tarea !== undefined && criticadas.has(tarea)) return textoDeCriticaRepetida(tarea);
      if (tarea !== undefined) criticadas.add(tarea);
      return critica.invoke(args as never);
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
