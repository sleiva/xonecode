import { desglosarConsumo, type CuentaDeTokens } from "./consumoPintable.js";
import type { GastoDeLaSemana } from "./tipos.js";

/**
 * El gasto de la semana de VARIOS proyectos, junto, para el Escritorio. En TOKENS (sin tabla de precios no hay euros
 * que no sean inventados). Puro y con test, por la regla de siempre: lo que decide qué se afirma no vive dentro de un
 * componente.
 *
 * Las mismas reglas que el gasto del proyecto (`gastoDelProyecto.ts`): cada cuenta se desglosa con SU convención
 * (`desglosarConsumo`) y **las dos no se suman** —`modelo` (el grafo) y `externo` (un agente externo) van por
 * separado—; «tokens» es texto nuevo + salida, y la caché va aparte.
 */

const CERO: CuentaDeTokens = { entrada: 0, salida: 0, cache: 0 };

export interface DiaDelGasto {
  dia: string;
  /** Tokens del grafo (nuevos + salida) ese día, de todos los proyectos. */
  modelo: number;
  /** Lo mismo, de agentes externos. */
  externo: number;
}

export interface GastoJunto {
  dias: DiaDelGasto[];
  /** Por cuenta, la semana entera. */
  total: { modelo: number; externo: number };
  /** El de hoy (el último día). */
  hoy: { modelo: number; externo: number };
  /** Por proyecto, de más a menos (cuenta del grafo + externa, solo para ORDENAR y repartir el porcentaje). */
  porProyecto: { proyecto: string; modelo: number; externo: number }[];
  /** Turnos que no se pudieron repartir por día, sumados de todos. */
  sinHora: number;
}

const tokensDe = (cuenta: "modelo" | "externo", c: CuentaDeTokens): number => {
  const d = cuenta === "modelo" ? desglosarConsumo(c, CERO) : desglosarConsumo(CERO, c);
  return d.nueva + d.salida;
};

/** Junta los gastos por proyecto. `undefined` si ninguno trae días: lo que no consta no se pinta. */
export function juntarGastoDeLaSemana(porProyecto: Readonly<Record<string, Partial<GastoDeLaSemana>>>): GastoJunto | undefined {
  const conDias = Object.entries(porProyecto).filter(([, g]) => Array.isArray(g.dias) && g.dias.length > 0) as [string, GastoDeLaSemana][];
  if (conDias.length === 0) return undefined;
  const dias = new Map<string, DiaDelGasto>();
  const proyectos: GastoJunto["porProyecto"] = [];
  let sinHora = 0;
  for (const [proyecto, g] of conDias) {
    let m = 0;
    let e = 0;
    for (const d of g.dias) {
      const dm = tokensDe("modelo", d.modelo);
      const de = tokensDe("externo", d.externo);
      const fila = dias.get(d.dia) ?? { dia: d.dia, modelo: 0, externo: 0 };
      fila.modelo += dm;
      fila.externo += de;
      dias.set(d.dia, fila);
      m += dm;
      e += de;
    }
    sinHora += g.sinHora ?? 0;
    proyectos.push({ proyecto, modelo: m, externo: e });
  }
  const ordenados = [...dias.values()].sort((a, b) => a.dia.localeCompare(b.dia));
  const ultimo = ordenados.at(-1) ?? { modelo: 0, externo: 0 };
  return {
    dias: ordenados,
    total: { modelo: ordenados.reduce((n, d) => n + d.modelo, 0), externo: ordenados.reduce((n, d) => n + d.externo, 0) },
    hoy: { modelo: ultimo.modelo, externo: ultimo.externo },
    porProyecto: proyectos.filter((p) => p.modelo + p.externo > 0).sort((a, b) => b.modelo + b.externo - (a.modelo + a.externo)),
    sinHora,
  };
}
