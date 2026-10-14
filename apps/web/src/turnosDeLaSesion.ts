import { toolsFallidas } from "./porOrigen.js";
import type { Acto, ConsumoDeTurno, VeredictoDelTurno } from "./tipos.js";

/**
 * Los turnos de una conversación, cortados de sus actos, para el inspector «Turno» del panel.
 *
 * **Un turno empieza en un acto `usuario` y acaba en su `fin`.** Es la misma frontera que usa el
 * chat para repartir duración y coste (`Chat.tsx`, el `fin` se lo queda el último tramo del
 * turno), así que el inspector y el hilo no pueden dar cifras distintas del mismo turno. Lo que
 * llega antes del primer mensaje de la persona no es de ningún turno y no se cuenta.
 *
 * Solo LEE lo que ya viaja: nada de esto pide datos nuevos al servidor. Y conserva la regla de la
 * casa de que **ausente es «no consta»**: un turno sin `fin` no tiene duración, uno de una sesión
 * anterior al consumo no tiene tokens, y ninguno de los dos se rellena con ceros.
 */
export interface TurnoDeLaSesion {
  /** 1, 2, 3… en el orden de la conversación. */
  numero: number;
  /** Índice en `actos` del mensaje que lo abrió. */
  desde: number;
  /** Hora ISO del mensaje de la persona (`cuando`). Ausente = no consta. */
  empezo?: string;
  /** Hora ISO de la ÚLTIMA respuesta del asistente en el turno. Ausente = no consta. */
  acabo?: string;
  /** Sin `fin` todavía: en marcha, o cortado sin cerrar. */
  abierto: boolean;
  /** Del `fin`. Ausente = no consta. */
  ms?: number;
  /** Del `fin`. Ausente = no consta. */
  consumo?: ConsumoDeTurno;
  /** Los pasos con la MISMA regla que la cabecera del tramo de trabajo (`Chat.tsx`): una línea
   *  de tool es un paso, un razonamiento, una fase o un veredicto otro, un artefacto ninguno. */
  pasos: number;
  /** Líneas de tool que fallaron (`detalles[].error`). */
  fallidas: number;
  /** Lo que el harness dijo de PERMISOS en el turno (`sistema` de clase `permiso`), tal cual. */
  permisos: string[];
  /** El ÚLTIMO veredicto del verificador en el turno. Ausente = no corrió (o no consta). */
  veredicto?: VeredictoDelTurno;
}

const PASO_DE_UNA_PIEZA = new Set(["razonamiento", "fase", "verificacion"]);

export function turnosDeLaSesion(actos: readonly Acto[]): TurnoDeLaSesion[] {
  const turnos: TurnoDeLaSesion[] = [];
  let actual: TurnoDeLaSesion | undefined;
  let suyos: Acto[] = [];
  const cerrarFallidas = () => {
    if (actual !== undefined) actual.fallidas = toolsFallidas(suyos);
  };
  actos.forEach((acto, indice) => {
    if (acto.tipo === "usuario") {
      cerrarFallidas();
      actual = {
        numero: turnos.length + 1,
        desde: indice,
        abierto: true,
        pasos: 0,
        fallidas: 0,
        permisos: [],
        ...(acto.cuando === undefined ? {} : { empezo: acto.cuando }),
      };
      suyos = [];
      turnos.push(actual);
      return;
    }
    // Un `fin` cierra el turno: lo que llegue detrás hasta el siguiente mensaje de la persona
    // (una respuesta a un comando, por ejemplo) ya no es de él.
    if (actual === undefined || !actual.abierto) return;
    suyos.push(acto);
    if (acto.tipo === "herramientas") actual.pasos += acto.lineas.length;
    else if (PASO_DE_UNA_PIEZA.has(acto.tipo)) actual.pasos += 1;
    if (acto.tipo === "asistente" && acto.cuando !== undefined) actual.acabo = acto.cuando;
    if (acto.tipo === "sistema" && acto.clase === "permiso") actual.permisos.push(acto.texto);
    if (acto.tipo === "verificacion") {
      const { tipo: _tipo, ...veredicto } = acto;
      actual.veredicto = veredicto;
    }
    if (acto.tipo === "fin") {
      actual.abierto = false;
      actual.ms = acto.ms;
      if (acto.consumo !== undefined) actual.consumo = acto.consumo;
    }
  });
  cerrarFallidas();
  return turnos;
}
