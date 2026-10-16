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

/**
 * El MISMO comando, lanzado con `node` y la ruta del script: lo que hace falta en Windows, donde un script sin extensión
 * no se ejecuta por su nombre. Se llama SOLO con un comando que `motivoDeComandoExternoInaceptable` ya admitió, así que
 * la forma es «nombre args» y los argumentos no llevan nada que la shell interprete; la ruta la pone el código, con `/`
 * (el Bash de Claude Code en Windows es Git Bash) y entre comillas simples. `undefined` si el script no tiene ruta o si
 * la ruta trae una comilla simple: antes que componer un escape, no se ejecuta.
 */
export function comandoConNode(
  comando: string,
  rutas: Readonly<Record<string, string>>,
  /**
   * El Node con que se lanza: la ruta ABSOLUTA del que corre xonecode (`process.execPath`), no `node` a secas. Medido en
   * Windows: en el Git Bash del hijo `node` no estaba en el PATH («node: command not found»). Ausente = `node`.
   */
  node?: string
): string | undefined {
  const partes = palabras(comando.trim());
  if (partes === undefined || partes.length === 0) return undefined;
  const [programa, ...argumentos] = partes;
  const ruta = programa === undefined ? undefined : rutas[programa];
  if (ruta === undefined || ruta.includes("'") || (node !== undefined && node.includes("'"))) return undefined;
  const lanzador = node === undefined ? "node" : `'${node.replace(/\\/g, "/")}'`;
  return [`${lanzador} '${ruta.replace(/\\/g, "/")}'`, ...argumentos].join(" ");
}

/** El script de `xone-development` que pasa un `.xne` de 8 bits a UTF-8 (`skills/xone-development/lib/aUtf8.mjs`). */
export const SCRIPT_A_UTF8 = "xone-a-utf8";

/**
 * Qué hacer con un `.xne` en ISO-8859-15 o windows-1252, que las tools de Claude Code no saben escribir. Medido:
 * 2.1.301 lo rechaza ANTES del hook y de `canUseTool` (xonecode no puede escribirlo por él), y 2.1.263/2.1.280
 * escribían UTF-8 dentro de un fichero que declara ISO-8859-15, rompiendo cada tilde sin aviso. Y todos lo LEEN con
 * «�». Decisión suya: que lo convierta él a UTF-8, y se le dice aquí. Solo si el script está entre los suyos.
 */
export const TEXTO_DE_A_UTF8 =
  `FICHEROS QUE NO SON UTF-8: si un \`.xne\` declara \`encoding="iso-8859-15"\` (o \`windows-1252\`), o \`Read\` te enseña «�» ` +
  `donde va una tilde, NO lo edites así: tus \`Write\`/\`Edit\` solo escriben UTF-8 y o se niegan o lo rompen. Antes de ` +
  `tocarlo, conviértelo con \`${SCRIPT_A_UTF8} <ruta relativa>\` (p. ej. \`${SCRIPT_A_UTF8} EntryPoint.xne\`): pasa el ` +
  `fichero a UTF-8 sin perder ningún carácter y cambia su prólogo a \`encoding="UTF-8"\`. Después vuelve a leerlo con ` +
  `\`Read\` y escribe las tildes tal cual (á, Ó, ñ), nunca «�» ni referencias \`&#211;\`. Di en tu resumen qué ficheros convertiste.`;

/**
 * Lo que se le DICE al hijo de su shell, sacado de lo que de verdad se le concede. Sin esto lo descubría a base de
 * denegaciones: medido en una tarea de Maset, el desarrollador en Claude Code (con «Ejecuta comandos» marcado y skills
 * sin ningún script) probó `Bash` y concluyó que «solo admite un script que el sandbox también rechaza». Sin ejecución
 * concedida no se dice nada: el SDK ya le enseña `Bash`, y el hook la deniega con su motivo.
 */
export function textoDeLaShellExterna(scripts: readonly string[] | undefined): string | undefined {
  if (scripts === undefined) return undefined;
  if (scripts.length === 0) {
    return "SHELL: no tienes ninguna. Tu `.md` concede ejecutar comandos, pero solo los scripts de tus skills, y ninguna trae scripts: no intentes `Bash`.";
  }
  return (
    `SHELL: \`Bash\` solo para estos scripts de tus skills, uno por llamada, por su NOMBRE y sin ruta: ${scripts.map((s) => `\`${s}\``).join(", ")}. ` +
    "Argumentos sueltos o entre comillas simples; nada de `;`, `|`, `>`, `$`, comillas dobles ni segundo plano. Cualquier otro comando se deniega. " +
    // Medido en Windows: un encargo decía «ya está medido» y el hijo contestó «no tengo shell» sin probarla.
    `Antes de decir que no tienes shell o que no puedes probar, PRUÉBALA (\`${scripts[0]} --help\`); si falla, copia el error EXACTO en tu respuesta.` +
    (scripts.includes(SCRIPT_A_UTF8) ? `\n${TEXTO_DE_A_UTF8}` : "")
  );
}
