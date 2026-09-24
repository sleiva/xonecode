/**
 * La estadística del banco: qué se puede afirmar con N pasadas y qué no.
 *
 * Existe por una lección cara (17-09-2026, `docs/DECISIONES.md`): tres ejecuciones del MISMO
 * prompt con el mismo modelo dieron 10.644, 26.711 y 31.534 tokens de entrada — un factor de
 * tres. **La varianza entre ejecuciones idénticas era mayor que el efecto que se buscaba**, así
 * que una pasada por celda no puede decidir un cambio de prompt, y una media sin su dispersión
 * al lado invita a leer ruido como si fuera señal.
 *
 * De ahí las tres reglas que este módulo impone, y que sus tests fijan:
 *
 * 1. **La media nunca viaja sola**: va con el rango y con la dispersión, siempre.
 * 2. **Una pasada que reventó no se promedia**: se cuenta aparte. Meterla como un cero abarataría
 *    el turno que no llegó a ocurrir, y dejarla fuera en silencio escondería que el cambio rompe.
 * 3. **Una respuesta barata y MALA no es una mejora**, y una que no delegó tampoco es la misma
 *    más barata: es otro comportamiento. Las dos se cuentan y se enseñan junto a la cifra.
 *
 * Código puro y con test por la misma razón que los jueces de `tareas.ts`: una estadística que
 * miente invalida en silencio todo lo que se decida mirándola.
 */

import { costeEfectivo } from "../agent/turno/informeDeTraza.js";

export interface Pasada {
  entrada: number;
  salida: number;
  cache: number;
  llamadas: number;
  ms: number;
  /** Lo que dijo el juez de la pregunta. */
  correcta: boolean;
  /** Si apareció algún especialista, o contestó el orquestador solo. */
  delego: boolean;
  /** Presente solo si la pasada no llegó a terminar. */
  error?: string;
  /**
   * La respuesta, y **solo cuando el juez la suspende**.
   *
   * Es la lección de `--conservar` del corredor de evals: un ✗ que no se puede inspeccionar es
   * un ✗ del que no se aprende, y la primera vez que pasó no había forma de saber si fallaba el
   * agente o el juez —fallaba el juez—. En un ✓ no hay nada que mirar, así que no se guarda:
   * el fichero del banco es para comparar cifras, no un archivo de transcripciones.
   */
  respuesta?: string;
}

export interface Reparto {
  media: number;
  min: number;
  max: number;
  /** `(max − min) / media`, en tanto por uno. Con una pasada es 0 y no significa nada. */
  dispersion: number;
}

export interface ResumenDeCelda {
  modelo: string;
  pregunta: string;
  /** Pasadas que terminaron. Solo estas entran en las medias. */
  validas: number;
  errores: number;
  correctas: number;
  delegadas: number;
  entrada?: Reparto;
  salida?: Reparto;
  llamadas?: Reparto;
  ms?: Reparto;
  /**
   * El coste EFECTIVO de cada pasada (`costeEfectivo`: la caché a un décimo). La entrada a secas
   * basta para comparar un prompt consigo mismo, pero no dos MOTORES: cachean distinto, y la misma
   * entrada puede costar el doble en uno que en otro. Opcional: los bancos guardados antes no lo
   * traen.
   */
  efectivo?: Reparto;
}

function reparto(valores: number[]): Reparto | undefined {
  if (valores.length === 0) return undefined;
  const media = valores.reduce((a, b) => a + b, 0) / valores.length;
  const min = Math.min(...valores);
  const max = Math.max(...valores);
  return { media, min, max, dispersion: media === 0 ? 0 : (max - min) / media };
}

/** Lo que se puede decir de una celda (un modelo × una pregunta) con las pasadas que haya. */
export function resumirCelda(modelo: string, pregunta: string, pasadas: readonly Pasada[]): ResumenDeCelda {
  const validas = pasadas.filter((p) => p.error === undefined);
  return {
    modelo,
    pregunta,
    validas: validas.length,
    errores: pasadas.length - validas.length,
    correctas: validas.filter((p) => p.correcta).length,
    delegadas: validas.filter((p) => p.delego).length,
    ...(reparto(validas.map((p) => p.entrada)) === undefined ? {} : { entrada: reparto(validas.map((p) => p.entrada))! }),
    ...(reparto(validas.map((p) => p.salida)) === undefined ? {} : { salida: reparto(validas.map((p) => p.salida))! }),
    ...(reparto(validas.map((p) => p.llamadas)) === undefined ? {} : { llamadas: reparto(validas.map((p) => p.llamadas))! }),
    ...(reparto(validas.map((p) => p.ms)) === undefined ? {} : { ms: reparto(validas.map((p) => p.ms))! }),
    ...(validas.length === 0
      ? {}
      : { efectivo: reparto(validas.map((p) => costeEfectivo({ input: p.entrada, output: p.salida, cache: p.cache })))! }),
  };
}

/**
 * **Si la dispersión pasa de aquí, la celda no decide nada** y se dice en la tabla.
 *
 * Un tercio es generoso a propósito: el caso que lo motivó rondaba el 0,8, y por debajo de este
 * umbral una diferencia de dos celdas todavía puede ser ruido — por eso el aviso no afirma que
 * la celda sea buena, solo marca las que con seguridad no sirven.
 */
export const DISPERSION_QUE_NO_DECIDE = 1 / 3;

const cifra = (n: number): string => Math.round(n).toLocaleString("es-ES");

/**
 * Una línea por celda. **La media siempre con su rango**, y las banderas de lo que
 * invalidaría la comparación: pasadas que reventaron, respuestas incorrectas, y pasadas que no
 * delegaron cuando otras sí.
 */
export function pintarCelda(r: ResumenDeCelda): string[] {
  const lineas: string[] = [];
  const cabecera = `${r.pregunta} · ${r.modelo}`;
  if (r.entrada === undefined) {
    lineas.push(`  ${cabecera}: ninguna pasada terminó (${r.errores} error(es))`);
    return lineas;
  }

  lineas.push(
    `  ${cabecera}` +
      `\n      entrada  ${cifra(r.entrada.media)}  (${cifra(r.entrada.min)}–${cifra(r.entrada.max)}, ±${Math.round(100 * r.entrada.dispersion)}%)` +
      `\n      llamadas ${r.llamadas === undefined ? "?" : cifra(r.llamadas.media)}` +
      `   salida ${r.salida === undefined ? "?" : cifra(r.salida.media)}` +
      `   efectivo ${r.efectivo === undefined ? "?" : `≈${cifra(r.efectivo.media)}`}` +
      `   ${r.ms === undefined ? "" : `${(r.ms.media / 1000).toFixed(1)}s`}`
  );

  const avisos: string[] = [];
  if (r.correctas < r.validas) avisos.push(`${r.validas - r.correctas} respuesta(s) INCORRECTAS`);
  // Una pasada que no delega no es la misma más barata: es otro camino. Mezclarlas en una
  // media da una cifra que no describe a ninguno de los dos.
  if (r.delegadas > 0 && r.delegadas < r.validas) avisos.push(`${r.validas - r.delegadas} sin delegar (otro camino)`);
  if (r.errores > 0) avisos.push(`${r.errores} pasada(s) reventaron, fuera de la media`);
  if (r.entrada.dispersion > DISPERSION_QUE_NO_DECIDE) avisos.push("dispersión alta: esta celda NO decide nada");
  if (avisos.length > 0) lineas.push(`      ⚠ ${avisos.join(" · ")}`);
  return lineas;
}

/**
 * La comparación de dos bancos, que es para lo que existe todo esto.
 *
 * **Devuelve la diferencia Y si se puede afirmar**: con los rangos solapados no se puede decir
 * que un cambio haya mejorado nada, por mucho que las medias difieran. Es exactamente el error
 * que se cometió el día que se escribió esto.
 */
export function comparar(
  antes: ResumenDeCelda,
  ahora: ResumenDeCelda,
  /** Qué se compara. `entrada` es lo de siempre; `efectivo`, lo que hace falta entre motores. */
  campo: "entrada" | "efectivo" = "entrada"
): { diferencia?: number; concluyente: boolean; motivo: string } {
  const a = antes[campo];
  const b = ahora[campo];
  if (a === undefined || b === undefined) {
    return { concluyente: false, motivo: "falta alguna medida" };
  }
  const diferencia = (b.media - a.media) / a.media;
  if (ahora.correctas < ahora.validas) return { diferencia, concluyente: false, motivo: "hay respuestas incorrectas" };
  // Con UNA pasada el «rango» es un punto, y dos puntos solo se tocan si son idénticos: todo
  // salía concluyente, un 0 % incluido (medido en la primera tirada entre motores).
  if (antes.validas < 2 || ahora.validas < 2) return { diferencia, concluyente: false, motivo: "con una sola pasada no hay rango" };
  const solapan = b.min <= a.max && a.min <= b.max;
  if (solapan) return { diferencia, concluyente: false, motivo: "los rangos se solapan: puede ser ruido" };
  return { diferencia, concluyente: true, motivo: diferencia < 0 ? "baja, y los rangos no se tocan" : "sube, y los rangos no se tocan" };
}

/** Una celda del banco con el motor que la corrió. */
export interface CeldaConMotor {
  motor: string;
  resumen: ResumenDeCelda;
}

/**
 * **Los motores, comparados celda a celda** (misma pregunta, mismo modelo), contra el primero de la
 * lista, que hace de base. Con las MISMAS reglas que comparar dos bancos —`comparar()`, que se niega a
 * concluir con los rangos solapados o con respuestas incorrectas—, y por DOS campos: la entrada, que
 * es lo que se envía, y el efectivo, que es lo que cuesta. Dicen cosas distintas entre motores
 * porque cachean distinto, así que se enseñan los dos y no se elige uno.
 *
 * Y se marca lo que invalida la comparación aunque las cifras salgan: que un motor delegue y el
 * otro no es otro camino, no el mismo más barato — la regla de `pintarCelda`.
 */
export function compararMotores(celdas: readonly CeldaConMotor[], base: string): string[] {
  const lineas: string[] = [];
  const pct = (d: number | undefined): string => (d === undefined ? "?" : `${d > 0 ? "+" : ""}${Math.round(100 * d)}%`);
  for (const b of celdas.filter((c) => c.motor === base)) {
    for (const otra of celdas.filter((c) => c.motor !== base && c.resumen.pregunta === b.resumen.pregunta && c.resumen.modelo === b.resumen.modelo)) {
      const e = comparar(b.resumen, otra.resumen, "entrada");
      const f = comparar(b.resumen, otra.resumen, "efectivo");
      const llam = (r: ResumenDeCelda): string => (r.llamadas === undefined ? "?" : cifra(r.llamadas.media));
      lineas.push(`  ${b.resumen.pregunta} · ${b.resumen.modelo}: ${otra.motor} frente a ${base}`);
      lineas.push(`      entrada  ${pct(e.diferencia)} — ${e.concluyente ? "CONCLUYENTE" : "no concluyente"}, ${e.motivo}`);
      lineas.push(`      efectivo ${pct(f.diferencia)} — ${f.concluyente ? "CONCLUYENTE" : "no concluyente"}, ${f.motivo}`);
      lineas.push(
        `      llamadas ${llam(b.resumen)} → ${llam(otra.resumen)} · correctas ${b.resumen.correctas}/${b.resumen.validas} → ${otra.resumen.correctas}/${otra.resumen.validas}`
      );
      const delegaBase = b.resumen.delegadas > 0;
      const delegaOtra = otra.resumen.delegadas > 0;
      if (delegaBase !== delegaOtra) {
        lineas.push(`      ⚠ ${delegaBase ? base : otra.motor} delegó y ${delegaBase ? otra.motor : base} no: otro camino, no el mismo más barato`);
      }
    }
  }
  return lineas;
}
