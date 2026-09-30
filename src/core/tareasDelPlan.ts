/**
 * Lo que un `TASKS.md` dice de sus tareas, leído como DATO para la pestaña Planes.
 *
 * El formato lo fija la skill `xone-plan-builder` (`references/TASKS-FORMAT.md`): una sección
 * `### NN — Título` por tarea, con `**Bloqueada por:**` y casillas `- [ ]` de criterios, más el
 * `**Estado:**` que el prompt del desarrollador le pide actualizar (`agentesEnDisco.ts`).
 *
 * **Es lo que el plan DICE, no lo que se midió**: el estado y las casillas las marca el modelo.
 * Por eso quien lo pinta lo rotula «según el plan», y por eso este lector es conservador:
 *
 * - Una dependencia solo se reconoce cuando es un NÚMERO de tarea (`02`, `02, 04`) o un RANGO
 *   (`01–07`); el resto de la línea se conserva como texto tal cual, que es donde el analista
 *   escribe cosas como «requiere ejecución externa». Inventarle una estructura a esa prosa
 *   sería afirmar algo que el plan no dice.
 * - El estado se DEVUELVE como está escrito; no se normaliza a un enum. Un «bloqueada», un
 *   «en curso» o un «hecha» son palabras del plan, y traducirlas sería decidir por él.
 * - Un fichero sin ninguna sección con forma de tarea no es un plan vacío: `tareas` va vacío y
 *   quien lo pinta enseña el texto entero.
 * - La cabecera se reconoce también en la forma que el modelo escribe a veces fuera del formato,
 *   `## T1 — Título` (nivel 2, prefijo `T`): visto en un plan real que la pestaña pintaba como
 *   «sin tareas» con siete dentro. El número se conserva TAL CUAL (`T1`), porque es lo que
 *   citan sus «Bloqueada por». Con ese prefijo solo cuenta como dependencia un número que lo
 *   lleve: «T2 (resuelta la PENDIENTE 3)» es T2, no T2 y 3.
 */

export interface TareaDelPlan {
  /** El número tal como aparece (`01`), que es lo que citan las dependencias. */
  numero: string;
  titulo: string;
  /** El `**Estado:**` tal cual, o ausente si la tarea no lo lleva. */
  estado?: string;
  /** Las tareas que la bloquean, reconocidas como números (rangos ya expandidos). */
  bloqueadaPor: string[];
  /** La línea «Bloqueada por» entera, para enseñarla cuando lleva algo más que números. */
  bloqueadaPorTexto?: string;
  criterios: { hechos: number; total: number };
  /** Por dónde va, CALCULADO del estado y las casillas (`progresoDeTarea`). */
  progreso: ProgresoDeTarea;
  /** El markdown de la sección, sin su cabecera: la ficha que se abre al pulsarla. */
  cuerpo: string;
}

/**
 * Las cuatro palabras con que se escribe `**Estado:**` (`xone-plan-builder`, `TASKS-FORMAT.md`):
 * quien desarrolla pone `implementada` al escribir el código y `hecha` cuando lo comprobó.
 */
export const ESTADOS_DE_TAREA = ["pendiente", "en curso", "implementada", "hecha"] as const;
export type EstadoDeTarea = (typeof ESTADOS_DE_TAREA)[number];

/**
 * Por dónde va una tarea, que es lo que la pestaña resume.
 *
 * - `finalizada`: TODAS sus casillas marcadas —cada una es un criterio COMPROBADO—, o `hecha`
 *   sin casillas que marcar.
 * - `implementada`: el código está (`implementada` o `hecha`) pero le falta comprobar algo.
 * - `en-curso` y `pendiente`: lo que dice su estado; un estado que no se reconoce cuenta como
 *   pendiente, porque afirmar avance que el plan no dice sería peor que quedarse corto.
 */
export type ProgresoDeTarea = "pendiente" | "en-curso" | "implementada" | "finalizada";

/**
 * El estado del plan como una de las cuatro palabras, mirando solo cómo EMPIEZA: un plan real
 * escribe «implementada — sin verificar en la app» o «pendiente — **NO hecha**», y lo que
 * cuenta es la primera palabra, no la prosa de detrás (que tiene un «hecha» dentro).
 */
export function estadoReconocido(estado: string | undefined): EstadoDeTarea | undefined {
  if (estado === undefined) return undefined;
  const limpio = estado.replace(/[*_`]/g, "").trim().toLowerCase();
  return ESTADOS_DE_TAREA.find((e) => limpio === e || new RegExp(`^${e}\\b`).test(limpio));
}

export function progresoDeTarea(estado: string | undefined, criterios: { hechos: number; total: number }): ProgresoDeTarea {
  if (criterios.total > 0 && criterios.hechos === criterios.total) return "finalizada";
  const reconocido = estadoReconocido(estado);
  if (reconocido === "hecha" && criterios.total === 0) return "finalizada";
  if (reconocido === "hecha" || reconocido === "implementada") return "implementada";
  if (reconocido === "en curso") return "en-curso";
  return "pendiente";
}

export interface TareasDelPlan {
  /** El `# …` del principio, si lo hay. */
  titulo?: string;
  tareas: TareaDelPlan[];
}

const CABECERA_DE_TAREA = /^#{2,3}\s+(T?\d{1,3})\s*[—–-]\s*(.+?)\s*$/;
/**
 * `## Tarea 1: Título`, `#### T1. Título`: el mismo encabezado con otra puntuación. Se exige la palabra
 * «Tarea» o el prefijo `T`: un `## 2. Orden de ejecución` no es una tarea.
 */
const CABECERA_FLEXIBLE = /^#{2,4}\s+(?:(?:tarea|task)\s+(T?\d{1,3})|(T\d{1,3}))\s*[—–:.)-]\s*(.+?)\s*$/i;
/**
 * `- **T1 — Título.** Bloqueada por: ninguna.`: la tarea como VIÑETA con el título en negrita, que es
 * como un analista escribió un plan real (`## Cortes verticales` con siete `- **T1 — …**`) y la
 * pestaña Planes dijo «no tiene ninguna sección con forma de tarea». Solo del 1 en adelante: un
 * `- **T0** — Nada que refactorizar` es la declaración de que NO hay tarea.
 */
const CABECERA_EN_VINETA = /^\s{0,3}[-*]\s+\*\*(T?[1-9]\d{0,2})\s*[—–:.)-]\s*(.+?)\*\*\s*(.*)$/;

/**
 * Si una línea abre una tarea, en cualquiera de las formas que se han visto, y lo que sobra en esa
 * MISMA línea (en la forma de viñeta, `Bloqueada por: …` suele ir ahí). El formato de la skill
 * (`### 01 — Título`) manda; las otras son tolerancia, no un segundo formato.
 */
export function cabeceraDeTarea(l: string): { numero: string; titulo: string; resto?: string } | undefined {
  const a = CABECERA_DE_TAREA.exec(l);
  if (a !== null) return { numero: a[1]!, titulo: a[2]!.trim() };
  const f = CABECERA_FLEXIBLE.exec(l);
  if (f !== null) return { numero: (f[1] ?? f[2])!, titulo: f[3]!.trim() };
  const v = CABECERA_EN_VINETA.exec(l);
  if (v === null) return undefined;
  const titulo = v[2]!.replace(/[\s.:]+$/, "").trim();
  const resto = (v[3] ?? "").trim();
  return { numero: v[1]!, titulo, ...(resto === "" ? {} : { resto }) };
}
/** «Ninguna …» o «nada»: la forma de decir que puede empezar ya. */
export const SIN_DEPENDENCIAS = /^(ninguna|nada)\b/i;
const ESTADO = /^\s*(?:[-*]\s+)?\*\*Estado:\*\*\s*(.+?)\s*$/i;
const BLOQUEADA = /^\s*(?:[-*]\s+)?\*\*Bloqueada por:\*\*\s*(.+?)\s*$/i;
/** La misma información en línea: `Bloqueada por: T1.` */
const BLOQUEADA_EN_LINEA = /^\s*bloqueada por:\s*(.+?)\s*$/i;
const CASILLA = /^\s*[-*]\s+\[( |x|X)\]\s+/;

/**
 * Los números de tarea que nombra una línea «Bloqueada por». Un rango `01–07` (con guion,
 * raya o «a») se expande con el ancho del primero; «Ninguna» no nombra ninguno.
 */
export function dependenciasDe(linea: string, conPrefijo = /\bT\d/.test(linea)): string[] {
  if (conPrefijo) return dependenciasConPrefijo(linea);
  const salida: string[] = [];
  const rango = /\b(\d{1,3})\s*(?:[–—-]|\ba\b)\s*(\d{1,3})\b/g;
  let resto = linea;
  for (const m of linea.matchAll(rango)) {
    const desde = Number(m[1]);
    const hasta = Number(m[2]);
    if (hasta >= desde && hasta - desde < 100) {
      for (let n = desde; n <= hasta; n++) salida.push(String(n).padStart(m[1]!.length, "0"));
    }
    resto = resto.replace(m[0], " ");
  }
  for (const m of resto.matchAll(/\b(\d{1,3})\b/g)) salida.push(m[1]!);
  return [...new Set(salida)];
}

/** Las de un plan que numera `T1`, `T2`…: solo los números con prefijo, y `T1–T3` como rango. */
function dependenciasConPrefijo(linea: string): string[] {
  const salida: string[] = [];
  let resto = linea;
  for (const m of linea.matchAll(/\bT(\d{1,3})\s*(?:[–—-]|\ba\b)\s*T(\d{1,3})\b/g)) {
    const desde = Number(m[1]);
    const hasta = Number(m[2]);
    if (hasta >= desde && hasta - desde < 100) for (let n = desde; n <= hasta; n++) salida.push(`T${n}`);
    resto = resto.replace(m[0], " ");
  }
  for (const m of resto.matchAll(/\bT(\d{1,3})\b/g)) salida.push(`T${m[1]!}`);
  return [...new Set(salida)];
}

export function leerTareasDelPlan(texto: string): TareasDelPlan {
  const lineas = texto.replace(/\r\n/g, "\n").split("\n");
  const titulo = lineas.find((l) => /^#\s+/.test(l))?.replace(/^#\s+/, "").trim();
  const tareas: TareaDelPlan[] = [];
  let actual: { numero: string; titulo: string; lineas: string[] } | undefined;

  const cerrar = (): void => {
    if (actual === undefined) return;
    let estado: string | undefined;
    let bloqueadaPorTexto: string | undefined;
    let hechos = 0;
    let total = 0;
    for (const l of actual.lineas) {
      const e = ESTADO.exec(l);
      if (e !== null && estado === undefined) estado = e[1]!;
      const b = BLOQUEADA.exec(l);
      if (b !== null && bloqueadaPorTexto === undefined) bloqueadaPorTexto = b[1]!;
      const c = CASILLA.exec(l);
      if (c !== null) {
        total++;
        if (c[1] !== " ") hechos++;
      }
    }
    // «Ninguna …» (o «nada») es la forma del formato de decir que puede empezar ya: no nombra tareas aunque
    // la prosa de detrás lleve un número (una ruta, una línea de un fichero).
    const nombra = bloqueadaPorTexto !== undefined && !SIN_DEPENDENCIAS.test(bloqueadaPorTexto);
    tareas.push({
      numero: actual.numero,
      titulo: actual.titulo,
      ...(estado === undefined ? {} : { estado }),
      // La numeración la fija la TAREA: en un plan de `T1`, «PENDIENTE 5» no es la tarea 5.
      bloqueadaPor: nombra ? dependenciasDe(bloqueadaPorTexto!, actual.numero.startsWith("T")) : [],
      ...(bloqueadaPorTexto === undefined ? {} : { bloqueadaPorTexto }),
      criterios: { hechos, total },
      progreso: progresoDeTarea(estado, { hechos, total }),
      cuerpo: actual.lineas.join("\n").trim(),
    });
    actual = undefined;
  };

  for (const l of lineas) {
    const cabecera = cabeceraDeTarea(l);
    if (cabecera !== undefined) {
      cerrar();
      const enLinea = cabecera.resto === undefined ? undefined : BLOQUEADA_EN_LINEA.exec(cabecera.resto);
      actual = {
        numero: cabecera.numero,
        titulo: cabecera.titulo,
        lineas: enLinea === null || enLinea === undefined ? [] : [`**Bloqueada por:** ${enLinea[1]!}`],
      };
      continue;
    }
    // Otra sección de nivel 2 (`## Orden de ejecución`, `## Hitos`) cierra la tarea en curso:
    // no es parte de su ficha.
    if (/^##\s+/.test(l)) {
      cerrar();
      continue;
    }
    actual?.lineas.push(l);
  }
  cerrar();
  return { ...(titulo === undefined || titulo === "" ? {} : { titulo }), tareas };
}

/** La ruta del `TASKS.md` de un plan: `/planes/<slug>/TASKS.md`. */
export const RUTA_DE_TASKS = /^\/planes\/[^/]+\/TASKS\.md$/;

/**
 * Por qué NO vale un `TASKS.md` que se va a escribir entero, o `undefined` si vale: tiene que reconocerse al menos una
 * tarea, y CADA tarea tiene que traer sus criterios como casillas `- [ ]`.
 *
 * Existe por una medida: en cinco pasadas de la misma calculadora el analista escribió las casillas en tres y en dos
 * (calc10, calc13) no, con los criterios como viñetas sueltas. Sin casillas, quien comprueba en el aparato no puede marcar
 * nada (`marcarCriterios` solo cambia `- [ ]`), el plan no dice por dónde va y la pestaña Planes no enseña progreso. El
 * prompt ya pedía el formato; era texto. Se aplica al ESCRIBIR el fichero entero, no al editarlo: un plan viejo sin
 * casillas se puede seguir anotando.
 */
export function motivoDeTasksInaceptable(texto: string): string | undefined {
  const { tareas } = leerTareasDelPlan(texto);
  const formato =
    "Cada tarea va como `### 01 — Título` y sus criterios de aceptación, uno por línea, como casillas `- [ ] criterio comprobable`: " +
    "son las que se marcan `- [x]` al comprobarlas en el aparato.";
  if (tareas.length === 0) return `No reconozco ninguna tarea en este TASKS.md. ${formato}`;
  const sin = tareas.filter((t) => t.criterios.total === 0).map((t) => t.numero);
  if (sin.length === 0) return undefined;
  const lista = sin.length > 8 ? `${sin.slice(0, 8).join(", ")} y ${sin.length - 8} más` : sin.join(", ");
  return `El TASKS.md no se ha escrito: ${sin.length === tareas.length ? "ninguna tarea trae" : `las tareas ${lista} no traen`} sus criterios como casillas. ${formato} Reescríbelo con ellas.`;
}

/**
 * Marca como COMPROBADOS unos criterios de una tarea: cambia sus `- [ ]` a `- [x]`, contando las
 * casillas de la sección de 1 en adelante, en el orden en que aparecen.
 *
 * Es lo que usa quien COMPRUEBA en el aparato (`marcar_criterios_del_plan`) y no puede escribir
 * ficheros: por eso toca SOLO las casillas de UNA tarea, y nada más del fichero cambia. Un número
 * que no existe se rechaza entero —marcar la mitad dejaría al modelo creyendo que marcó todo—.
 */
export function marcarCriterios(
  texto: string,
  numero: string,
  criterios: readonly number[]
): { texto: string; marcados: number[]; yaEstaban: number[] } | { error: string } {
  const saltos = texto.includes("\r\n") ? "\r\n" : "\n";
  const lineas = texto.split(/\r?\n/);
  const inicio = lineas.findIndex((l) => cabeceraDeTarea(l)?.numero === numero);
  if (inicio === -1) return { error: `No hay ninguna tarea «${numero}» en el TASKS.md.` };
  const casillas: number[] = [];
  for (let i = inicio + 1; i < lineas.length && !/^##/.test(lineas[i]!) && cabeceraDeTarea(lineas[i]!) === undefined; i++) {
    if (CASILLA.test(lineas[i]!)) casillas.push(i);
  }
  const fuera = criterios.filter((n) => !Number.isInteger(n) || n < 1 || n > casillas.length);
  if (fuera.length > 0) {
    return { error: `La tarea ${numero} tiene ${casillas.length} criterio(s); no existe el ${fuera.join(", ")}.` };
  }
  const marcados: number[] = [];
  const yaEstaban: number[] = [];
  for (const n of [...new Set(criterios)].sort((a, b) => a - b)) {
    const i = casillas[n - 1]!;
    const c = CASILLA.exec(lineas[i]!)!;
    if (c[1] !== " ") {
      yaEstaban.push(n);
      continue;
    }
    lineas[i] = lineas[i]!.replace(/\[ \]/, "[x]");
    marcados.push(n);
  }
  return { texto: lineas.join(saltos), marcados, yaEstaban };
}
