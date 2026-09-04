/**
 * La piel web: la MISMA `Piel` de `core/turno.ts` que implementan stdio y la TUI, con el
 * transcript como destino en vez de stdout.
 *
 * Es casi la lógica del store de la TUI (`cli/tui/store.ts`) —tokens a colchón, fases en
 * cascada, tools agrupadas—, y eso es a propósito: lo que la TUI pinta es lo que la web
 * recibe, byte por byte del mismo evento. No hay un segundo formato ni un canal crudo.
 * No importa de `cli/tui/`: la frontera que `cli/tui/frontera.test.ts` vigila mantiene ink
 * y react DENTRO de `cli/tui/` —para que pipes y `npm test` corran sin TTY—, y nada de fuera
 * puede depender de ese directorio sin arriesgarse a arrastrarlos. Por eso la lógica
 * compartida —`Acto`, `conLineaDeTool`— vive en `core/actos.ts`, no en el store, y las dos
 * pieles la importan de ahí.
 *
 * Ningún acto lleva argumentos de tool NI diff: las líneas de `herramientas` llegan ya
 * resumidas por `agent/resumenDeTool.ts` (lista blanca de ruta/patrón por nombre de tool,
 * nunca contenido), y `pausa` solo copia `origen` y `descripcion` del pendiente — el
 * `PendienteDeAprobacion` no trae más, y el diff en sí viaja únicamente en el mensaje de
 * aprobación (`transporte.ts`, clase `aprobacion`), nunca por este canal de actos.
 */
import type { Piel } from "../../core/turno.js";
import type { Acto } from "../../core/actos.js";
import { conLineaDeTool } from "../../core/actos.js";
import type { PendienteDeAprobacion } from "../../core/events.js";

export interface PielWeb {
  piel: Piel;
  /** La lista de actos, para el transporte y para la persistencia. */
  actos: () => readonly Acto[];
  /**
   * Se llama con cada acto nuevo: es por donde el transporte lo emite. También se
   * llama cuando el último acto es un `herramientas` que se ACTUALIZA en vez de crecer
   * —el cierre de una racha sustituyendo su apertura, la misma regla de `conLineaDeTool`—:
   * sin ese aviso, un transporte que solo escuchara altas mostraría para siempre la línea
   * de apertura de la racha. Un consumidor que reciba dos `herramientas` seguidos
   * sustituye el último por el nuevo; cualquier otro tipo se añade.
   */
  alActo: (escucha: (acto: Acto) => void) => void;
}

export function crearPielWeb(): PielWeb {
  const lista: Acto[] = [];
  let colchon = "";
  let faseActiva: { texto: string; t0: number } | undefined;
  const escuchas: ((acto: Acto) => void)[] = [];

  const notificar = (acto: Acto): void => {
    for (const escucha of escuchas) escucha(acto);
  };

  const empujar = (acto: Acto): void => {
    lista.push(acto);
    notificar(acto);
  };

  /**
   * Cualquier acto que no sea otra `fase` cierra la fase viva con su duración —la
   * cascada del store (`cli/tui/store.ts#cerrarFase`), reproducida aquí porque la web
   * no puede importar de `cli/tui/`. `fase` en sí NO pasa por aquí: dos `fase()`
   * seguidas sustituyen la activa sin dejar rastro de la anterior, igual que el store.
   */
  const cerrarFase = (): void => {
    if (faseActiva === undefined) return;
    const { texto, t0 } = faseActiva;
    faseActiva = undefined;
    empujar({ tipo: "fase", texto, ms: Math.max(0, Date.now() - t0) });
  };

  const piel: Piel = {
    token(texto) {
      // A DIFERENCIA del store de la TUI (`cli/tui/store.ts:74-87`), aquí NO se parte por
      // `\n`: la TUI pinta líneas en un terminal y necesita una por fila, pero la web
      // renderiza markdown, donde un párrafo entero —con sus saltos internos, sus listas
      // y sus bloques de código— tiene que llegar de una pieza para que se pueda parsear.
      // Partirlo daría un acto por línea y el markdown se rompería en trozos sueltos.
      colchon += texto;
    },

    cerrarLinea() {
      if (colchon === "") return;
      cerrarFase();
      empujar({ tipo: "asistente", texto: colchon });
      colchon = "";
    },

    linea(texto) {
      // La comprobación de fusión va ANTES de cerrar la fase, no después: con una fase
      // viva el grupo no se completa (el acto de fase se intercala primero), igual que
      // en el store — si no, una racha que arranca justo tras `fase()` se fusionaría con
      // el grupo de ANTES de la fase, borrando la frontera que el usuario vio pasar.
      const ultimo = lista.at(-1);
      if (ultimo?.tipo === "herramientas" && faseActiva === undefined) {
        const grupo: Acto = { tipo: "herramientas", lineas: conLineaDeTool(ultimo.lineas, texto) };
        lista[lista.length - 1] = grupo;
        notificar(grupo);
        return;
      }
      cerrarFase();
      empujar({ tipo: "herramientas", lineas: [texto] });
    },

    pausa(pendientes: PendienteDeAprobacion[]) {
      cerrarFase();
      // Una línea por pendiente, origen y descripción y NADA más: ni el fichero, ni el
      // diff — eso viaja solo en el mensaje de aprobación (`transporte.ts`).
      const texto = pendientes.map((p) => `${p.origen}: ${p.descripcion}`).join("\n");
      empujar({ tipo: "sistema", texto });
    },

    fin(ms) {
      cerrarFase();
      empujar({ tipo: "fin", ms });
    },

    fase(texto) {
      // Sustituye la activa sin emitir acto por ella: igual que el store, dos `fase()`
      // seguidas sin nada de por medio pierden la duración de la primera a propósito —
      // es una fase que no llegó a contar nada.
      faseActiva = { texto, t0: Date.now() };
    },

    notificacion(texto) {
      cerrarFase();
      empujar({ tipo: "sistema", texto });
    },
  };

  return {
    piel,
    actos: () => lista,
    alActo: (escucha) => {
      escuchas.push(escucha);
    },
  };
}
