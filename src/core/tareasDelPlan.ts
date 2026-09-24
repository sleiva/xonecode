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
  /** El markdown de la sección, sin su cabecera: la ficha que se abre al pulsarla. */
  cuerpo: string;
}

export interface TareasDelPlan {
  /** El `# …` del principio, si lo hay. */
  titulo?: string;
  tareas: TareaDelPlan[];
}

const CABECERA_DE_TAREA = /^###\s+(\d{1,3})\s*[—–-]\s*(.+?)\s*$/;
const ESTADO = /^\*\*Estado:\*\*\s*(.+?)\s*$/i;
const BLOQUEADA = /^\*\*Bloqueada por:\*\*\s*(.+?)\s*$/i;
const CASILLA = /^\s*[-*]\s+\[( |x|X)\]\s+/;

/**
 * Los números de tarea que nombra una línea «Bloqueada por». Un rango `01–07` (con guion,
 * raya o «a») se expande con el ancho del primero; «Ninguna» no nombra ninguno.
 */
export function dependenciasDe(linea: string): string[] {
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
    // «Ninguna …» es la forma del formato de decir que puede empezar ya: no nombra tareas aunque
    // la prosa de detrás lleve un número (una ruta, una línea de un fichero).
    const nombra = bloqueadaPorTexto !== undefined && !/^ninguna\b/i.test(bloqueadaPorTexto);
    tareas.push({
      numero: actual.numero,
      titulo: actual.titulo,
      ...(estado === undefined ? {} : { estado }),
      bloqueadaPor: nombra ? dependenciasDe(bloqueadaPorTexto!) : [],
      ...(bloqueadaPorTexto === undefined ? {} : { bloqueadaPorTexto }),
      criterios: { hechos, total },
      cuerpo: actual.lineas.join("\n").trim(),
    });
    actual = undefined;
  };

  for (const l of lineas) {
    const cabecera = CABECERA_DE_TAREA.exec(l);
    if (cabecera !== null) {
      cerrar();
      actual = { numero: cabecera[1]!, titulo: cabecera[2]!, lineas: [] };
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
