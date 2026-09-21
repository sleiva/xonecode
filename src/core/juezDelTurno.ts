/**
 * ¿El turno CUMPLIÓ lo que se le pidió? Un juez para la pregunta que ningún `if` contesta.
 *
 * ## Por qué hace falta
 *
 * El harness sabe medir muchas cosas del turno —si el verificador quedó verde, qué ficheros
 * cambiaron, si quedaron escrituras sin aprobar— y **ninguna de ellas contesta la pregunta
 * de quien lo encargó**. Un turno puede cerrar con el simulador en verde, tres ficheros
 * tocados y un resumen impecable, y no haber hecho lo que se pedía.
 *
 * Y eso pasa. MEDIDO en turnos reales del usuario, tres veces en la misma sesión:
 * «el especialista se ha vuelto a cortar antes de darme el informe», «las dos tareas que
 * lancé no llegaron a ejecutarse», «la devolución del verificador ha llegado cortada». En
 * los tres el turno cerró y el resumen sonaba a trabajo terminado.
 *
 * ## El reparto: código para lo comprobable, juez para lo difuso
 *
 * Es el mismo de las tareas de fondo (`core/entrega.ts`), y por el mismo motivo: un juez
 * que se equivoque en verde cierra un trabajo a medias sin que nadie lo vea. Así que los
 * HECHOS los mide el código y se le dan hechos —no se le pide que los averigüe—, y lo único
 * que se le pregunta es lo que de verdad es un juicio: si con esos hechos delante el
 * encargo está cumplido.
 *
 * ## Fail-closed, y en la dirección que importa
 *
 * La respuesta peligrosa es «cumplido» cuando no lo está: cierra el turno en falso y quien
 * lo pidió se entera al usar la app. Por eso lo que no se entiende es **`dudoso`** y nunca
 * `cumplido` — igual que `indeterminado` no es verde en el juez de tareas.
 */

/** Qué contesta el juez. `dudoso` es también lo que sale de una respuesta que no se entiende. */
export type Cumplimiento = "cumplido" | "no-cumplido" | "dudoso";

export interface VeredictoDelTurno {
  cumplimiento: Cumplimiento;
  /** Una frase. Es lo que lee la persona, así que dice QUÉ falta, no «no se cumplió». */
  motivo: string;
}

/**
 * Los hechos MEDIDOS que se le ponen delante. Todos opcionales y todos con el mismo
 * contrato: **ausente es «no consta», nunca cero ni falso**. Un turno del que no se pudo
 * medir si escribió no es un turno que no escribió, y el juez tiene que poder distinguirlo
 * — si no, contestaría «no cumplido» sobre una medición que nadie hizo.
 */
export interface HechosDelTurno {
  /** El veredicto del simulador, si corrió. Ausente = no corrió. */
  verificador?: "verde" | "rojo";
  /** Ficheros del proyecto que el turno cambió, en relativo. */
  ficheros?: readonly string[];
  /** Quedaron escrituras que nadie aprobó, o se agotó un tope. */
  escriturasSinResolver?: boolean;
  /** Algún especialista se quedó sin llamadas o sin tools antes de contestar. */
  algunEspecialistaCortado?: boolean;
}

export const PREGUNTA_POR_OMISION =
  "No tengo claro si esto es lo que querías. ¿Lo doy por bueno?";

/** Lo que el juez tiene que contestar, en el mismo formato que el de tareas: JSON y nada más. */
export function promptDelJuezDelTurno(caso: {
  objetivo: string;
  respuesta: string;
  hechos: HechosDelTurno;
}): string {
  const h = caso.hechos;
  const hechos: string[] = [];
  // Cada hecho solo si CONSTA: una línea «verificador: no corrió» y otra «no consta» dicen
  // cosas distintas, y mezclarlas es cómo el juez acaba afirmando lo que nadie midió.
  if (h.verificador !== undefined) hechos.push(`- El simulador de XOne quedó en ${h.verificador.toUpperCase()}.`);
  else hechos.push("- El simulador no llegó a correr, así que no consta que el proyecto esté sano.");
  if (h.ficheros !== undefined) {
    hechos.push(
      h.ficheros.length === 0
        ? "- No se cambió ningún fichero del proyecto."
        : `- Ficheros del proyecto cambiados: ${h.ficheros.join(", ")}.`,
    );
  }
  if (h.escriturasSinResolver === true) {
    hechos.push("- Quedaron escrituras SIN aplicar: nadie las aprobó o se agotó un tope.");
  }
  if (h.algunEspecialistaCortado === true) {
    hechos.push("- Algún especialista se quedó sin presupuesto antes de terminar, así que su parte puede estar a medias.");
  }

  return [
    "Eres el juez de un harness de desarrollo. Decides UNA cosa: si el turno hizo lo que se",
    "le pidió. No revisas estilo, no propones mejoras y no juzgas si el trabajo es bonito.",
    "",
    "LO QUE SE PIDIÓ:",
    caso.objetivo.trim(),
    "",
    "LO QUE EL AGENTE CONTESTÓ:",
    caso.respuesta.trim() === "" ? "(no contestó nada)" : caso.respuesta.trim(),
    "",
    "HECHOS MEDIDOS POR EL HARNESS (no son opinión del agente):",
    ...hechos,
    "",
    "Reglas:",
    "- Que el agente DIGA que lo hizo no es que lo hiciera. Cruza lo que dice con los hechos.",
    "- Hacer MÁS de lo que se pidió no es incumplir: si el encargo está hecho, está cumplido.",
    "- Si el encargo era una pregunta o un análisis, cumplir es haberla contestado; no hace",
    "  falta que haya ficheros cambiados.",
    "- Si no puedes decidirlo con lo que tienes, contesta «dudoso». No adivines.",
    "",
    "Contesta SOLO con este JSON, sin texto alrededor:",
    '{"cumplimiento":"cumplido|no-cumplido|dudoso","motivo":"una frase"}',
    "",
    "El motivo dice QUÉ falta o QUÉ no cuadra, no «no se cumplió». Si está cumplido, una",
    "frase corta de por qué lo das por bueno.",
  ].join("\n");
}

/**
 * El JSON del juez → veredicto. Lo que no se entiende es `dudoso`.
 *
 * Se busca el objeto dentro del texto en vez de exigir un JSON limpio: un modelo que
 * envuelve su respuesta en ``` o le pone una frase delante ha contestado igual, y tirar ese
 * veredicto por la envoltura sería perder la respuesta por su presentación.
 */
export function veredictoDelTurnoDeTexto(texto: string): VeredictoDelTurno {
  const objeto = objetoDelTexto(texto);
  const crudo = objeto?.["cumplimiento"];
  const motivo = typeof objeto?.["motivo"] === "string" ? (objeto["motivo"] as string).trim() : "";
  if (crudo === "cumplido" || crudo === "no-cumplido" || crudo === "dudoso") {
    return {
      cumplimiento: crudo,
      motivo: motivo === "" ? "el juez no dio motivo" : motivo,
    };
  }
  return {
    cumplimiento: "dudoso",
    motivo: motivo === "" ? "no se entendió lo que contestó el juez" : motivo,
  };
}

function objetoDelTexto(texto: string): Record<string, unknown> | undefined {
  const abre = texto.indexOf("{");
  const cierra = texto.lastIndexOf("}");
  if (abre < 0 || cierra <= abre) return undefined;
  try {
    const valor: unknown = JSON.parse(texto.slice(abre, cierra + 1));
    return typeof valor === "object" && valor !== null && !Array.isArray(valor)
      ? (valor as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

/** Qué hace el harness con el veredicto. Puro: decidirlo aquí es lo que lo hace probable. */
export type AccionDelJuez =
  | { tipo: "nada" }
  | { tipo: "aviso"; texto: string }
  | { tipo: "preguntar"; texto: string };

/**
 * Del veredicto a lo que se hace, y las tres salidas no son intercambiables.
 *
 * - **Cumplido → NADA.** Ni una línea. Un juez que felicita en cada turno es ruido, y el
 *   ruido es cómo un aviso deja de leerse — la misma razón por la que los avisos de
 *   honestidad tienen alcance de turno y no salen cuando no ha pasado nada.
 * - **No cumplido → AVISO.** No se pregunta: no hay nada que decidir, hay algo que decir.
 *   Quien lo lea ya está delante del turno y sabe qué hacer.
 * - **Dudoso → PREGUNTAR**, si hay alguien a quien preguntar. Es la mitad que pidió el
 *   usuario y la que un `if` no puede dar: el juez no sabe, y el que sabe está ahí.
 *
 * **Sin humano, la duda se degrada a AVISO y no a silencio.** En una tarea de fondo no hay
 * a quién preguntar —`consolaDeTarea` aparca en vez de contestar por nadie—, y tragarse la
 * duda ahí sería cerrar en falso justo donde nadie está mirando.
 */
export function accionDelJuez(
  veredicto: VeredictoDelTurno,
  opciones: { hayHumano: boolean },
): AccionDelJuez {
  if (veredicto.cumplimiento === "cumplido") return { tipo: "nada" };
  if (veredicto.cumplimiento === "no-cumplido") {
    return { tipo: "aviso", texto: `no parece que esto cumpla lo que pediste: ${veredicto.motivo}` };
  }
  const texto = `no está claro si esto cumple lo que pediste: ${veredicto.motivo}`;
  return opciones.hayHumano ? { tipo: "preguntar", texto } : { tipo: "aviso", texto };
}
