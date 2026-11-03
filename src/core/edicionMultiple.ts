/**
 * VARIOS cambios a un fichero en UNA llamada de `edit_file` (`edits`), todos o ninguno.
 *
 * Medido en la pasada 9 de la calculadora (03-11-2026): 51 de las 412 llamadas del desarrollador eran un `edit_file`
 * suelto, en rachas de dos a cinco sobre el MISMO fichero, y cada una reenviaba ~100 mil tokens de contexto. Los demás
 * harnesses lo resuelven con una edición de varios trozos (`apply_patch` de Codex y OpenCode, los bloques SEARCH/REPLACE
 * de aider), no pidiendo en el prompt que se agrupe.
 *
 * Cada cambio se busca en el texto que dejó el ANTERIOR, con la misma regla que el `edit` de deepagents
 * (`performStringReplacement`): tiene que estar, y una sola vez salvo `replace_all`. Si uno no encaja, no se aplica
 * ninguno y se dice cuál: medio fichero cambiado sería peor que ninguno. Puro.
 */

export interface CambioDeEdicion {
  viejo: string;
  nuevo: string;
  todas: boolean;
}

/** Cuántos cambios como mucho en una llamada: más que eso es reescribir el fichero, y para eso está otra forma. */
export const TOPE_DE_CAMBIOS_POR_EDICION = 50;

/**
 * Los cambios que pide una llamada: `edits` si viene, o el `old_string`/`new_string` de siempre. Un `edits` mal formado
 * es un motivo, no un intento a medias.
 */
export function cambiosDeLaLlamada(args: Record<string, unknown>): { cambios: CambioDeEdicion[] } | { motivo: string } {
  const edits = args["edits"];
  if (edits === undefined) {
    if (typeof args["old_string"] !== "string" || typeof args["new_string"] !== "string") {
      return { motivo: "edit_file necesita old_string y new_string, o una lista edits: [{old_string, new_string}]." };
    }
    return { cambios: [{ viejo: args["old_string"], nuevo: args["new_string"], todas: args["replace_all"] === true }] };
  }
  if (!Array.isArray(edits) || edits.length === 0) return { motivo: "edits tiene que ser una lista con al menos un cambio {old_string, new_string}." };
  if (edits.length > TOPE_DE_CAMBIOS_POR_EDICION) {
    return { motivo: `Son ${String(edits.length)} cambios en una llamada; como mucho ${String(TOPE_DE_CAMBIOS_POR_EDICION)}. Para tanto, reparte en dos llamadas.` };
  }
  const cambios: CambioDeEdicion[] = [];
  for (const [i, e] of edits.entries()) {
    const c = e as Record<string, unknown> | null;
    if (c === null || typeof c !== "object" || typeof c["old_string"] !== "string" || typeof c["new_string"] !== "string") {
      return { motivo: `El cambio ${String(i + 1)} de edits no tiene old_string y new_string.` };
    }
    cambios.push({ viejo: c["old_string"], nuevo: c["new_string"], todas: c["replace_all"] === true });
  }
  return { cambios };
}

/** Aplica los cambios EN ORDEN, cada uno sobre el resultado del anterior. El primero que no encaja lo para todo. */
export function aplicarCambios(texto: string, cambios: readonly CambioDeEdicion[]): { texto: string; ocurrencias: number } | { motivo: string } {
  let actual = texto;
  let ocurrencias = 0;
  for (const [i, c] of cambios.entries()) {
    const cual = cambios.length === 1 ? "old_string" : `El cambio ${String(i + 1)} de ${String(cambios.length)}`;
    if (c.viejo === "") return { motivo: `${cual}: old_string vacío. No se aplicó ninguno.` };
    const veces = actual.split(c.viejo).length - 1;
    if (veces === 0) {
      return { motivo: `${cual} no encaja: su old_string no está en el fichero${i > 0 ? " (tras aplicar los anteriores)" : ""}. No se aplicó ninguno; corrige ese y vuelve a mandarlos todos.` };
    }
    if (veces > 1 && !c.todas) {
      return { motivo: `${cual}: su old_string aparece ${String(veces)} veces. Dale más contexto o usa replace_all. No se aplicó ninguno.` };
    }
    actual = actual.split(c.viejo).join(c.nuevo);
    ocurrencias += veces;
  }
  return { texto: actual, ocurrencias };
}
