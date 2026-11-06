import type { Acto, ConsumoDeTurno } from "../../core/actos.js";

/**
 * El gasto de un proyecto en los ÚLTIMOS SIETE DÍAS, día a día, para el Escritorio (la «C» del lienzo, fase del
 * gasto). En TOKENS, como todo el gasto de xonecode: no hay tabla de precios y un euro sin ella sería inventado
 * (decisión suya, 06-11-2026).
 *
 * Sale de los turnos GUARDADOS (`fin.consumo` de cada conversación), no del acumulado del índice: el acumulado no dice
 * cuándo se gastó. Un `fin` no lleva hora; la suya es la del último acto con `cuando` que lo precede —el mensaje de
 * la persona o el principio de la respuesta, los dos del mismo turno—. Un turno sin ninguna hora delante (una
 * conversación de antes de IXCODE-24) no se reparte: se CUENTA en `sinHora`, para que el total no se presente como
 * el de la semana entera sin serlo.
 *
 * Las dos cuentas (`modelo`, `externo`) se suman cada una por su lado y viajan separadas: cada una tiene su
 * convención de caché, y juntarlas es cosa de quien pinta (`consumoPintable.ts#desglosarConsumo`).
 */

/** Cuántos días mira: hoy y los seis anteriores. */
export const DIAS_DEL_GASTO = 7;

export interface CuentaDelDia {
  entrada: number;
  salida: number;
  cache: number;
}

export interface GastoDelDia {
  /** El día, `AAAA-MM-DD` en la hora LOCAL del servidor. */
  dia: string;
  modelo: CuentaDelDia;
  externo: CuentaDelDia;
  /** Cuántos turnos con consumo cayeron ese día. */
  turnos: number;
}

export interface GastoDeLaSemana {
  /** Siempre `DIAS_DEL_GASTO` entradas, de la más ANTIGUA a hoy: un día sin turnos va a cero, porque ese cero sí
   *  está medido (se miraron sus conversaciones y no gastaron). */
  dias: GastoDelDia[];
  /** Turnos con consumo pero sin hora a la que atribuirlos: no están en `dias`. */
  sinHora: number;
}

const cero = (): CuentaDelDia => ({ entrada: 0, salida: 0, cache: 0 });

/** `AAAA-MM-DD` local de un instante. */
export function diaLocal(t: Date): string {
  const dos = (n: number) => String(n).padStart(2, "0");
  return `${t.getFullYear()}-${dos(t.getMonth() + 1)}-${dos(t.getDate())}`;
}

/** Los días de la ventana, de hace seis días a hoy. */
export function diasDeLaVentana(ahora: Date): string[] {
  return Array.from({ length: DIAS_DEL_GASTO }, (_, i) => {
    const d = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() - (DIAS_DEL_GASTO - 1 - i));
    return diaLocal(d);
  });
}

/**
 * Reparte por día los `fin` de un conjunto de conversaciones. Puro: recibe los actos ya leídos.
 */
export function gastoDeLaSemana(conversaciones: readonly (readonly Acto[])[], ahora: Date): GastoDeLaSemana {
  const ventana = diasDeLaVentana(ahora);
  const porDia = new Map<string, GastoDelDia>(ventana.map((dia) => [dia, { dia, modelo: cero(), externo: cero(), turnos: 0 }]));
  let sinHora = 0;
  for (const actos of conversaciones) {
    let hora: string | undefined;
    for (const a of actos) {
      if ((a.tipo === "usuario" || a.tipo === "asistente") && a.cuando !== undefined) hora = a.cuando;
      if (a.tipo !== "fin" || a.consumo === undefined) continue;
      const t = hora === undefined ? Number.NaN : Date.parse(hora);
      if (Number.isNaN(t)) {
        sinHora++;
        continue;
      }
      const dia = porDia.get(diaLocal(new Date(t)));
      if (dia === undefined) continue; // fuera de la ventana: ni cuenta ni falta
      sumar(dia.modelo, a.consumo.modelo);
      sumar(dia.externo, a.consumo.externo);
      dia.turnos++;
    }
  }
  return { dias: ventana.map((d) => porDia.get(d)!), sinHora };
}

function sumar(a: CuentaDelDia, b: ConsumoDeTurno["modelo"]): void {
  a.entrada += b.entrada;
  a.salida += b.salida;
  a.cache += b.cache;
}
