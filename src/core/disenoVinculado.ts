/**
 * El diseño VINCULADO a un proyecto XOne, en un módulo SIN imports: `config.ts` lo valida y `stitch.ts` lo usa, y
 * importarlo desde `stitch.ts` cerraba el ciclo config → stitch → artefactos → settings → config (`ciclos.test.ts`).
 */

/**
 * El proyecto de Stitch VINCULADO a un proyecto XOne (`config.json#disenoVinculado`): de ahí salen las pantallas que se
 * eligen para una tarea. Decisión suya: el diseño se ELIGE con su miniatura, no se busca por el nombre que escribe la
 * persona — medido en Maset, «Menu Listado Entregas» no era el título de ninguna y la tarea construyó con otra maqueta.
 */
export interface DisenoVinculado {
  /** `projects/<id>` de Stitch. */
  proyecto: string;
  /** Su título, para enseñarlo sin volver a preguntar a Stitch. */
  nombre: string;
}

/** Por qué ese `projects/<id>` no vale, o `undefined`. */
export function motivoDeProyectoDeStitchInaceptable(proyecto: unknown): string | undefined {
  return typeof proyecto === "string" && /^projects\/\d+$/.test(proyecto) ? undefined : "el proyecto de Stitch tiene que ser «projects/<id>»";
}
