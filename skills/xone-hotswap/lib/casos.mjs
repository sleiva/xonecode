/**
 * VARIOS CASOS en una orden de `xone-hotswap`, separados por `---`: cada caso se lee solo al acabar, y lo que sale es lo
 * que CAMBIÓ respecto a la pantalla de antes del primero.
 *
 * Medido en tres pasadas de la calculadora (03-11-2026): el desarrollador probó caso a caso, una orden por caso —26, 17 y
 * 68 órdenes de pulsar—, cada una un viaje de unos 100 mil tokens. La receta de antes (un `js` con su etiqueta detrás de
 * cada caso) era más larga de escribir que un caso por orden, y no la siguió nunca. Con `---` escribir varios casos es
 * más CORTO que repetir la orden, y la salida no repite los treinta textos fijos de la pantalla en cada caso.
 */

/** La variable con la que `xone-probar` pide la salida de casos aunque haya UNO solo. */
export const COMO_CASOS = "XONE_HOTSWAP_COMO_CASOS";

/** El separador de casos; `--` sigue separando comandos dentro de uno. */
export const SEPARADOR_DE_CASOS = "---";

/** Parte los argumentos por `---`. Sin separador, un solo caso. Los casos vacíos se van. */
export function partirEnCasos(args) {
  const casos = [[]];
  for (const a of args) {
    if (a === SEPARADOR_DE_CASOS) casos.push([]);
    else casos[casos.length - 1].push(a);
  }
  return casos.filter((c) => c.length > 0);
}

/** Lo que se pulsó en un caso, corto: `AC 7 MUL 8 EQ` sale de `click name=MAP_K_AC … click name=MAP_K_EQ`. */
export function pasosDelCaso(comandos) {
  const nombres = comandos.map((c) => (typeof c.name === "string" ? c.name : c.command)).filter((n) => typeof n === "string");
  const comun = prefijoComun(nombres.filter((n) => n.includes("_")));
  return nombres.map((n) => (comun !== "" && n.startsWith(comun) && n.length > comun.length ? n.slice(comun.length) : n)).join(" ");
}

/** El prefijo hasta el último `_` que comparten TODOS: `MAP_K_7` y `MAP_K_EQ` → `MAP_K_`. Con uno solo, hasta su último `_`. */
function prefijoComun(nombres) {
  if (nombres.length === 0) return "";
  let comun = nombres[0];
  for (const n of nombres.slice(1)) {
    let i = 0;
    while (i < comun.length && i < n.length && comun[i] === n[i]) i += 1;
    comun = comun.slice(0, i);
  }
  const corte = comun.lastIndexOf("_");
  return corte < 0 ? "" : comun.slice(0, corte + 1);
}

/**
 * Lo que cambió entre dos lecturas, contando REPETIDOS: tras teclear 9, el «9» del visor sale aunque la tecla «9» ya
 * estuviera. `nuevos` en el orden de la pantalla; `quitados`, lo que estaba y ya no.
 */
export function diferenciaDeTextos(base, ahora) {
  const quedan = new Map();
  for (const t of base) quedan.set(t, (quedan.get(t) ?? 0) + 1);
  const nuevos = [];
  for (const t of ahora) {
    const n = quedan.get(t) ?? 0;
    if (n > 0) quedan.set(t, n - 1);
    else nuevos.push(t);
  }
  const quitados = [];
  for (const [t, n] of quedan) for (let i = 0; i < n; i += 1) quitados.push(t);
  return { nuevos, quitados };
}
