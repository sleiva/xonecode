/**
 * La piel TUI: implementa la interfaz `Piel` de `core/turno.ts` delegando en el store.
 * Es deliberadamente fina — la semántica ya vive en el store — y existe para que el
 * motor no sepa que hay una TUI.
 *
 * `modeloActual` es la única cosa que la piel sabe y el motor no: `Piel.fin` solo trae
 * la duración, y la etiqueta «■ modelo · Ns» del transcript necesita el modelo que corrió
 * el turno. Se lee en el momento del `fin`, y quien monta la TUI (`correrTui.ts`) pasa
 * el cierre que conoce el modelo de trabajo vigente.
 */
import type { Piel } from "../../core/turno.js";
import type { PendienteDeAprobacion } from "../../core/events.js";
import type { crearStore } from "./store.js";

type Store = ReturnType<typeof crearStore>;

export function crearPielTui(store: Store, modeloActual?: () => string): Piel {
  return {
    token: (texto) => store.token(texto),
    cerrarLinea: () => store.cerrarLinea(),
    linea: (texto) => store.linea(texto),
    pausa: (_pendientes: PendienteDeAprobacion[]) => store.pausa(),
    fin: (ms) => store.fin(ms, modeloActual?.()),
    fase: (texto) => store.fase(texto),
    // En TUI el panel de avisos no existe: el repintado es total y el aviso es una
    // línea de sistema más.
    notificacion: (texto) => store.linea(texto, "sistema"),
  };
}
