import { tool, type StructuredToolInterface } from "@langchain/core/tools";

/**
 * **Una pantalla se juzga en SU tarea del plan.** Medido en la consola con la calculadora (05-11-2026, DeepSeek flash, tarea
 * de fondo): T1 pintaba la pantalla y cerró con el crítico; al encargar T2 (la lógica) el orquestador le añadió «además,
 * cierra los defectos visuales de la 01» con lo que su crítico había visto, y la medida automática exigía otro crítico tras
 * cada captura. T2 pasó ~13 min puliendo píxeles —cuatro críticos y cuatro despliegues— y T3 (la entrada desde el menú) otros
 * tres. De 60 min, ~25 fueron ajuste visual fuera de la tarea de la pantalla.
 *
 * La regla: una MAQUETA que pasó el crítico en una tarea queda JUZGADA cuando se encarga OTRA tarea del plan (no si se
 * arrastra la anterior, que sigue abierta). Contra una maqueta juzgada el crítico no vuelve a correr —contesta que lo que
 * difiera va como observación al cierre— y la medida automática es un dato, sin ronda visual ni crítico que pedir. Otra
 * maqueta (Maset: una pantalla por tarea) tiene su propio bucle.
 */
export interface PantallasJuzgadas {
  /** Se pasó el crítico contra `maqueta` durante la tarea `tarea` (`plan|número`). Sin una de las dos, nada. */
  alCriticar(tarea: string | undefined, maqueta: string | undefined): void;
  /** Se encarga otra tarea del plan: lo criticado en `anterior` queda juzgado, salvo que se ARRASTRE (sigue abierta). */
  alPasar(anterior: string | undefined, arrastrada: boolean): void;
  /** La tarea (`plan|número`) en que se juzgó `maqueta`, o nada si aún no se juzgó. */
  juzgadaEn(maqueta: string | undefined): string | undefined;
}

export function crearPantallasJuzgadas(): PantallasJuzgadas {
  const criticadas = new Map<string, Set<string>>();
  const juzgadas = new Map<string, string>();
  return {
    alCriticar(tarea, maqueta) {
      if (tarea === undefined || maqueta === undefined) return;
      const de = criticadas.get(tarea) ?? new Set<string>();
      de.add(maqueta);
      criticadas.set(tarea, de);
    },
    alPasar(anterior, arrastrada) {
      if (anterior === undefined || arrastrada) return;
      for (const maqueta of criticadas.get(anterior) ?? []) if (!juzgadas.has(maqueta)) juzgadas.set(maqueta, anterior);
    },
    juzgadaEn: (maqueta) => (maqueta === undefined ? undefined : juzgadas.get(maqueta)),
  };
}

/**
 * Qué maqueta de la sesión nombra la `referencia` de un crítico: la misma ruta, o la misma carpeta y fichero (el agente
 * escribe `/diseno/screen.jpg` por `/artefactos/diseno/screen.jpg`). Sin referencia y con UNA maqueta, esa: es la que el
 * crítico usaría (`maquetaDeLaSesion`). Lo que no casa, nada.
 */
export function maquetaDeReferencia(referencia: unknown, maquetas: readonly string[]): string | undefined {
  if (typeof referencia !== "string" || referencia.trim() === "") return maquetas.length === 1 ? maquetas[0] : undefined;
  const r = referencia.trim();
  const exacta = maquetas.find((m) => m === r);
  if (exacta !== undefined) return exacta;
  const cola = (ruta: string): string => ruta.split("/").filter(Boolean).slice(-2).join("/");
  const parecidas = maquetas.filter((m) => cola(m) === cola(r));
  return parecidas.length === 1 ? parecidas[0] : undefined;
}

const comoTarea = (clave: string): string => {
  const [plan, numero] = clave.split("|");
  return `la tarea ${(numero ?? "").padStart(2, "0")} de /planes/${plan ?? ""}/`;
};

export function textoDePantallaJuzgada(maqueta: string, tarea: string): string {
  return (
    `La pantalla de ${maqueta} ya se juzgó en ${comoTarea(tarea)}: no se vuelve a juzgar en otra tarea. Lo que aún difiera ` +
    "de la maqueta NO es trabajo de esta tarea: dilo como OBSERVACIÓN al devolver o en tu cierre, y sigue con lo que pide la tarea."
  );
}

/** La medida automática contra una maqueta ya juzgada: el dato, sin ronda visual ni crítico que pedir. */
export function textoDeMedidaInformativa(opciones: { captura: string; maqueta: string; tarea: string; resumen: string }): string {
  return (
    `[harness] Medida de /artefactos/${opciones.captura} contra ${opciones.maqueta} (DATO, no abre ronda visual): ${opciones.resumen}. ` +
    `Esa pantalla ya se juzgó en ${comoTarea(opciones.tarea)}: no retoques su aspecto si tu tarea no lo pide.`
  );
}

/** El crítico que no vuelve a juzgar una maqueta ya juzgada (`PantallasJuzgadas`). Lo demás pasa igual. */
export function sinJuzgarDosVeces(
  critica: StructuredToolInterface,
  maquetaDe: (args: unknown) => string | undefined,
  pantallas: Pick<PantallasJuzgadas, "juzgadaEn">
): StructuredToolInterface {
  return tool(
    async (args: unknown) => {
      const maqueta = maquetaDe(args);
      const tarea = pantallas.juzgadaEn(maqueta);
      if (maqueta !== undefined && tarea !== undefined) return textoDePantallaJuzgada(maqueta, tarea);
      return critica.invoke(args as never);
    },
    { name: critica.name, description: critica.description, schema: critica.schema as never }
  ) as unknown as StructuredToolInterface;
}
