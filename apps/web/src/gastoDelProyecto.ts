import { abreviar } from "./cifras.js";
import { desglosarConsumo, type CuentaDeTokens } from "./consumoPintable.js";
import { ordenarPorUltimoTurno } from "./componentes/Barra.js";
import type { ConsumoDeTurno } from "./tipos.js";

/**
 * El gasto de un proyecto, en TOKENS, para el gráfico de su resumen.
 *
 * Puro y con test: es la agregación que decide qué se afirma, y una regla que solo vive dentro
 * de un componente es de las que este repo llama «escritas y no probadas». El cliente no puede
 * importar `core/actos.ts` (la frontera lo prohíbe), así que la suma por cuenta se hace aquí.
 *
 * Tres reglas:
 *
 * - **Las dos cuentas NO se suman.** `modelo` (el grafo) y `externo` (un agente externo) van en
 *   dos series. Y cada una se desglosa CON SU convención —la del grafo trae la caché dentro de
 *   su entrada, las externas no—, pasándole a `desglosarConsumo` la otra a cero: así «nueva» es
 *   lo mismo en las dos, y la misma regla que ya usa el contador.
 * - **La caché va aparte**, como en el contador: es lo releído, no texto nuevo.
 * - **El total dice sobre cuántas sesiones está hecho.** Una sesión sin `consumo` no aporta ni
 *   barra ni cero —ausente es «no consta»—, y se CUENTA: la siembra de acumulados tiene tope por
 *   pasada, y un total de las que sí constan presentado como el del proyecto sería una cifra
 *   plausible y falsa.
 */

/** Cuántas sesiones pinta el gráfico: las más recientes con gasto que conste. */
export const SESIONES_EN_EL_GASTO = 10;

const CERO: CuentaDeTokens = { entrada: 0, salida: 0, cache: 0 };

/** Lo que una cuenta aporta: texto nuevo + salida (lo que se puede acotar) y la caché aparte. */
export interface GastoDeUnaCuenta {
  tokens: number;
  cache: number;
}

export interface BarraDeGasto {
  id: string;
  titulo: string;
  ultimoTurno?: string;
  modelo: GastoDeUnaCuenta;
  externo: GastoDeUnaCuenta;
  /** Su turno está EN CURSO: la barra crece mientras trabaja. Ausente = no. */
  enCurso?: true;
}

export interface GastoDelProyecto {
  /** De más ANTIGUA a más nueva, que es como se lee de izquierda a derecha. */
  barras: BarraDeGasto[];
  /** Por cuenta, sobre TODAS las sesiones con gasto que conste, no solo las del gráfico. */
  total: { modelo: GastoDeUnaCuenta; externo: GastoDeUnaCuenta };
  /** Cuántas sesiones entran en el total. */
  conGasto: number;
  /** Cuántas no tienen gasto que conste, y por tanto NO están en el total. */
  sinGasto: number;
  /** Si alguna sesión tiene gasto de agente externo: si no, esa serie ni se pinta. */
  hayExterno: boolean;
  /** Cuántas sesiones tienen un turno EN CURSO con gasto: su parte ya está en el total y crece mientras trabaja. */
  enCurso: number;
}

function deUnaCuenta(cuenta: "modelo" | "externo", consumo: ConsumoDeTurno): GastoDeUnaCuenta {
  const d =
    cuenta === "modelo" ? desglosarConsumo(consumo.modelo, CERO) : desglosarConsumo(CERO, consumo.externo);
  return { tokens: d.nueva + d.salida, cache: d.cache };
}

const sumar = (a: GastoDeUnaCuenta, b: GastoDeUnaCuenta): GastoDeUnaCuenta => ({
  tokens: a.tokens + b.tokens,
  cache: a.cache + b.cache,
});

/** Las dos medidas de una sesión juntas: lo acumulado y lo del turno EN CURSO (que el `fin` suelta, así que no se repite). */
function sumarConsumos(a: ConsumoDeTurno | undefined, b: ConsumoDeTurno | undefined): ConsumoDeTurno | undefined {
  if (a === undefined) return b;
  if (b === undefined) return a;
  const cuenta = (x: CuentaDeTokens, y: CuentaDeTokens): CuentaDeTokens => ({ entrada: x.entrada + y.entrada, salida: x.salida + y.salida, cache: x.cache + y.cache });
  return { modelo: cuenta(a.modelo, b.modelo), externo: cuenta(a.externo, b.externo) };
}

export function gastoDelProyecto(
  sesiones: readonly { id: string; titulo: string; ultimoTurno?: string; consumo?: ConsumoDeTurno; consumoEnCurso?: ConsumoDeTurno }[]
): GastoDelProyecto {
  // Lo del turno EN CURSO se suma (petición suya, 21-10-2026): una tarea es un turno largo y no constaba hasta el `fin`.
  const conConsumo = sesiones
    .map((s) => ({ ...s, consumo: sumarConsumos(s.consumo, s.consumoEnCurso), enCurso: s.consumoEnCurso !== undefined }))
    .filter((s): s is typeof s & { consumo: ConsumoDeTurno } => s.consumo !== undefined);
  const vacio = { tokens: 0, cache: 0 };
  const total = conConsumo.reduce(
    (acc, s) => ({
      modelo: sumar(acc.modelo, deUnaCuenta("modelo", s.consumo)),
      externo: sumar(acc.externo, deUnaCuenta("externo", s.consumo)),
    }),
    { modelo: vacio, externo: vacio }
  );
  // Las más recientes primero para ELEGIR, y luego al revés para PINTAR.
  const barras = ordenarPorUltimoTurno(conConsumo)
    .slice(0, SESIONES_EN_EL_GASTO)
    .reverse()
    .map((s) => ({
      id: s.id,
      titulo: s.titulo,
      ...(s.ultimoTurno === undefined ? {} : { ultimoTurno: s.ultimoTurno }),
      modelo: deUnaCuenta("modelo", s.consumo),
      externo: deUnaCuenta("externo", s.consumo),
      ...(s.enCurso ? { enCurso: true as const } : {}),
    }));
  return {
    barras,
    total,
    conGasto: conConsumo.length,
    sinGasto: sesiones.length - conConsumo.length,
    hayExterno: conConsumo.some((s) => deUnaCuenta("externo", s.consumo).tokens > 0),
    enCurso: conConsumo.filter((s) => s.enCurso).length,
  };
}

/**
 * El gasto de UNA tarea en una línea (Finalizadas; petición suya, 21-10-2026: que el resumen final diga cuánto gastó). Con
 * la MISMA convención que el gráfico (`deUnaCuenta`): las dos cuentas no se suman, y la del agente externo solo sale si
 * gastó algo.
 */
export function textoDelGastoDeTarea(gasto: ConsumoDeTurno): string {
  const m = deUnaCuenta("modelo", gasto);
  const e = deUnaCuenta("externo", gasto);
  return [
    `${abreviar(m.tokens)} tokens`,
    ...(m.cache > 0 ? [`${abreviar(m.cache)} de caché`] : []),
    ...(e.tokens > 0 ? [`agente externo ${abreviar(e.tokens)} tokens`] : []),
  ].join(" · ");
}

/**
 * El gasto de una tarea en la LÍNEA plegada de Finalizadas (petición suya, 21-10-2026: «los tokens consumidos en las
 * tareas finalizadas», a la vista sin desplegar): solo los tokens, sin la caché, que va en el desplegado. Las dos cuentas
 * no se suman; la externa solo si gastó algo.
 */
export function textoCortoDelGastoDeTarea(gasto: ConsumoDeTurno): string {
  const m = deUnaCuenta("modelo", gasto);
  const e = deUnaCuenta("externo", gasto);
  return [`${abreviar(m.tokens)} tokens`, ...(e.tokens > 0 ? [`ext. ${abreviar(e.tokens)}`] : [])].join(" · ");
}
