/**
 * El estado de presentación de la TUI, SIN React.
 *
 * Los componentes solo pintan; la semántica (qué cierra una fase, cuándo una línea
 * confirmada es definitiva) vive aquí y se prueba sin montar nada. Es el mismo pacto
 * que la piel stdio —tokens a colchón, cascada de fases— pero el destino es el estado,
 * no stdout: en TUI el repintado es total y no hay append-only que respetar.
 */

/** Un acto del transcript: lo que ya no cambia y se pinta por su tipo. */
export type Acto =
  | { tipo: "usuario"; texto: string }
  | { tipo: "asistente"; texto: string }
  | { tipo: "tool"; texto: string }
  | { tipo: "sistema"; texto: string }
  | { tipo: "fase"; texto: string; ms: number }
  | { tipo: "fin"; ms: number }
  | { tipo: "error"; texto: string };

export interface EstadoDeTui {
  actos: Acto[];
  /** El streaming en curso: la frase a medio confirmar. */
  colchon: string;
  faseActiva?: { texto: string; t0: number };
  aprobacionPendiente: boolean;
}

/** Los actos que son solo texto: los que admite `linea`. `fase` y `fin` llevan `ms` y el store los construye solo. */
type ActoDeTexto = Extract<Acto, { texto: string }>;

export interface OpcionesDelStore {
  /** Costura de test del reloj: la duración de una fase no puede dormir el test. */
  ahora?: () => number;
}

export function crearStore(opciones: OpcionesDelStore = {}) {
  const ahora = opciones.ahora ?? Date.now;
  let estado: EstadoDeTui = { actos: [], colchon: "", aprobacionPendiente: false };
  const suscriptores: (() => void)[] = [];

  const mutar = (cambio: Partial<EstadoDeTui>): void => {
    estado = { ...estado, ...cambio };
    for (const s of suscriptores) s();
  };

  /** La cascada, versión TUI: cualquier acto cierra la fase viva con su duración. */
  const cerrarFase = (): Acto[] => {
    if (estado.faseActiva === undefined) return [];
    const { texto, t0 } = estado.faseActiva;
    mutar({ faseActiva: undefined });
    return [{ tipo: "fase", texto, ms: Math.max(0, ahora() - t0) }];
  };

  const aniadir = (nuevos: Acto[]): void => {
    if (nuevos.length === 0) return;
    mutar({ actos: [...estado.actos, ...cerrarFase(), ...nuevos] });
  };

  return {
    estado: (): EstadoDeTui => estado,

    suscribir(suscriptor: () => void): void {
      suscriptores.push(suscriptor);
    },

    token(texto: string): void {
      let colchon = estado.colchon + texto;
      const confirmados: Acto[] = [];
      for (;;) {
        const salto = colchon.indexOf("\n");
        if (salto === -1) break;
        confirmados.push({ tipo: "asistente", texto: colchon.slice(0, salto) });
        colchon = colchon.slice(salto + 1);
      }
      mutar({
        colchon,
        ...(confirmados.length > 0 ? { actos: [...estado.actos, ...cerrarFase(), ...confirmados] } : {}),
      });
    },

    cerrarLinea(): void {
      if (estado.colchon === "") return;
      aniadir([{ tipo: "asistente", texto: estado.colchon }]);
      mutar({ colchon: "" });
    },

    /** Línea de sistema/tool/aviso: acto inmediato, texto ya finalizado. */
    linea(texto: string, tipo: ActoDeTexto["tipo"] = "tool"): void {
      aniadir([{ tipo, texto } as ActoDeTexto]);
    },

    /** Lo que el humano escribió: acto inmediato, llega entero de una vez. */
    usuario(texto: string): void {
      aniadir([{ tipo: "usuario", texto }]);
    },

    /** Un fallo del motor: acto inmediato, con su propio tipo para que se pinte en rojo. */
    error(texto: string): void {
      aniadir([{ tipo: "error", texto }]);
    },

    fase(texto: string): void {
      mutar({ faseActiva: { texto, t0: ahora() } });
    },

    pausa(): void {
      mutar({ aprobacionPendiente: true });
    },

    fin(ms: number): void {
      aniadir([{ tipo: "fin", ms }]);
    },
  };
}