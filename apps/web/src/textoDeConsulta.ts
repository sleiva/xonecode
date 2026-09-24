/**
 * El TEXTO con el que el servidor escribe una pregunta del agente en su respuesta
 * (`agent/motores/trueforge/sesionTrueforge.ts#textoDePregunta`): la pregunta, sus opciones
 * numeradas y «Contesta con el número…». Ahí hace falta —es lo que ven la TUI y el terminal, que
 * no pintan tarjeta—; en el chat web, con la tarjeta DENTRO del hilo, es la misma pregunta dos
 * veces seguidas.
 *
 * Por eso se QUITA AL PINTAR, y solo si el mensaje TERMINA exactamente con ese texto recompuesto
 * de los datos de la consulta: no se adivina nada del texto, se reconstruye lo que escribimos
 * nosotros. El `.jsonl` no se toca, y el test del host (`textoDeConsulta.contrato.test.ts`)
 * compara esta copia con la de verdad: la frontera no deja importarla, y una copia que diverja
 * se limitaría a no quitar nada —el lado seguro—, pero el test lo dice antes.
 */
export function textoDeConsulta(pregunta: string, opciones: readonly string[]): string {
  return [
    "\n\n" + pregunta.trim(),
    ...(opciones.length === 0 ? [] : ["", ...opciones.map((o, i) => `${i + 1}. ${o}`), "", "Contesta con el número o con tus palabras."]),
  ].join("\n");
}

/** El mensaje sin la pregunta repetida al final; tal cual si no termina exactamente con ella. */
export function sinTextoDeConsulta(texto: string, pregunta: string, opciones: readonly string[]): string {
  const sufijo = textoDeConsulta(pregunta, opciones);
  return texto.endsWith(sufijo) ? texto.slice(0, texto.length - sufijo.length).trimEnd() : texto;
}
