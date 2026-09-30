/**
 * Qué `Bash` se le deja correr a un agente EXTERNO (Claude Code) que declara `ejecucion: true`.
 *
 * En los motores externos la shell está cerrada: lo que el hijo ejecuta va directo a la máquina,
 * sin nuestras guardas. La excepción es ESTRECHA a propósito: una sola llamada a uno de los
 * scripts de las skills que el agente declara (`xone-hotswap`, `xone-log-android`…), por su
 * NOMBRE, con argumentos que la shell no puede reinterpretar. Todo lo demás se deniega.
 *
 * La gramática sale de cómo se llaman de verdad (`skills/xone-hotswap/SKILL.md`): palabras
 * sueltas (`--app MiApp`, `name=MAP_BT_ACEPTAR`, `--`, nombres de fichero) y, para un texto con
 * espacios, comillas SIMPLES —dentro de ellas la shell no expande nada—. Se rechaza lo demás:
 * comillas dobles, `$`, backticks, `\`, comodines, `~`, `{}`, `#`, redirecciones, tuberías,
 * encadenados, saltos de línea y una asignación `VAR=` delante.
 */

/**
 * Un argumento: palabra suelta, con como mucho UN tramo entre comillas simples al final
 * (`--texto='hola mundo'`, `'dos palabras'`). Dentro de las comillas simples la shell no expande
 * nada; fuera, solo caracteres que no interpreta.
 */
const ARGUMENTO = /^[A-Za-z0-9_./:=,@%+-]*(?:'[^'\n\r]*')?$/;

/** Parte el comando en argumentos por los espacios de FUERA de las comillas, o `undefined` si una no cierra. */
function palabras(comando: string): string[] | undefined {
  const salida: string[] = [];
  let actual = "";
  let enComillas = false;
  for (const c of comando) {
    if (c === "'") enComillas = !enComillas;
    if (c === " " && !enComillas) {
      if (actual !== "") salida.push(actual);
      actual = "";
      continue;
    }
    actual += c;
  }
  if (enComillas) return undefined;
  if (actual !== "") salida.push(actual);
  return salida;
}

/**
 * El motivo por el que ese comando NO se deja correr, o `undefined` si se deja. `scripts` son los
 * nombres (sin ruta) de los ejecutables de las skills del agente. El motivo dice la forma que sí
 * vale: sin eso el modelo reintenta con `./scripts/…` o con la ruta de la variable.
 */
export function motivoDeComandoExternoInaceptable(comando: string, scripts: readonly string[]): string | undefined {
  const forma =
    `Solo puedes correr UNO de tus scripts, por su nombre y sin ruta (${scripts.join(", ")}), ` +
    "con argumentos sueltos o entre comillas simples: nada de ;, &&, |, >, $, comillas dobles ni rutas al script.";
  if (scripts.length === 0) return "este agente no tiene scripts que correr";
  const limpio = comando.trim();
  if (limpio === "" || /[\n\r\t]/.test(limpio)) return forma;
  const partes = palabras(limpio);
  if (partes === undefined || partes.length === 0) return forma;
  const [programa, ...argumentos] = partes;
  if (programa === undefined || !/^[A-Za-z0-9_-]+$/.test(programa) || !scripts.includes(programa)) {
    return `«${programa ?? ""}» no es uno de tus scripts. ${forma}`;
  }
  for (const a of argumentos) {
    if (a === "" || !ARGUMENTO.test(a)) return `El argumento «${a}» no se admite. ${forma}`;
  }
  return undefined;
}
