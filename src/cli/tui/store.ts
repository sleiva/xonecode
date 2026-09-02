/**
 * El estado de presentación de la TUI, SIN React.
 *
 * Los componentes solo pintan; la semántica (qué cierra una fase, cuándo una línea
 * confirmada es definitiva) vive aquí y se prueba sin montar nada. Es el mismo pacto
 * que la piel stdio —tokens a colchón, cascada de fases— pero el destino es el estado,
 * no stdout: en TUI el repintado es total y no hay append-only que respetar.
 */

import type { PropsDelModal } from "./aprobarTui.js";

/** Un acto del transcript: lo que ya no cambia y se pinta por su tipo. */
export type Acto =
  | { tipo: "usuario"; texto: string }
  | { tipo: "asistente"; texto: string }
  /**
   * Las líneas de tool CONSECUTIVAS de un turno, en un solo acto: son paisaje, y el
   * transcript enseña solo las últimas. Una línea del asistente (o de sistema) cierra el
   * grupo; la siguiente tool abre otro.
   */
  | { tipo: "herramientas"; lineas: string[] }
  | { tipo: "sistema"; texto: string }
  | { tipo: "fase"; texto: string; ms: number }
  /** El cierre del turno: duración y, si la piel lo sabe, el modelo que lo corrió. */
  | { tipo: "fin"; ms: number; modelo?: string }
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
/** Lo que `linea` acepta: los de texto y «tool», que no es un acto sino una línea del grupo `herramientas`. */
type TipoDeLinea = ActoDeTexto["tipo"] | "tool";

/**
 * Una línea de cierre de racha del colapsador del motor (`core/notify.ts`): «→ lee ×3 — …».
 * Devuelve su prefijo icono+verbo («→ lee»), o undefined si no es un cierre.
 */
function prefijoDeCierre(linea: string): string | undefined {
  const m = /^(\S+ \S+) ×\d+/.exec(linea);
  return m?.[1];
}

/**
 * Añadir una línea de tool al grupo: si es el cierre de la racha cuya apertura es la
 * última línea, la SUSTITUYE. El colapsador escribe apertura y cierre porque stdio solo
 * añade; aquí se repinta, y dos líneas para la misma racha son ruido. Pura.
 */
export function conLineaDeTool(lineas: readonly string[], linea: string): string[] {
  const prefijo = prefijoDeCierre(linea);
  const ultima = lineas.at(-1);
  if (prefijo !== undefined && ultima !== undefined && (ultima === prefijo || ultima.startsWith(`${prefijo} `))) {
    return [...lineas.slice(0, -1), linea];
  }
  return [...lineas, linea];
}

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

  /** La baja de un suscriptor, tolerante a doble llamada (React puede repetir el cleanup). */
  const baja = (suscriptor: () => void): (() => void) => {
    const indice = suscriptores.lastIndexOf(suscriptor);
    if (indice !== -1) suscriptores.splice(indice, 1);
    return () => baja(suscriptor);
  };

  return {
    estado: (): EstadoDeTui => estado,

    /** Devuelve la función de desuscripción: el cleanup del useEffect es su llamador natural. */
    suscribir(suscriptor: () => void): () => void {
      suscriptores.push(suscriptor);
      return () => baja(suscriptor);
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

    /**
     * Línea de sistema/tool/aviso: acto inmediato, texto ya finalizado. Una de tool se
     * une al grupo `herramientas` que esté al final (o abre uno); las demás son actos.
     */
    linea(texto: string, tipo: TipoDeLinea = "tool"): void {
      if (tipo !== "tool") {
        aniadir([{ tipo, texto } as ActoDeTexto]);
        return;
      }
      const ultimo = estado.actos.at(-1);
      // Con una fase viva, `aniadir` intercala el acto de fase: el grupo empieza después.
      if (ultimo?.tipo === "herramientas" && estado.faseActiva === undefined) {
        const grupo: Acto = { tipo: "herramientas", lineas: conLineaDeTool(ultimo.lineas, texto) };
        mutar({ actos: [...estado.actos.slice(0, -1), grupo] });
        return;
      }
      aniadir([{ tipo: "herramientas", lineas: [texto] }]);
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

    /**
     * El rearme: `pausa` solo sube a true, y el modal que la cerró es quien sabe que
     * ya no hay nada pendiente — si no baja, la TUI se queda «en pausa» para siempre
     * tras la primera aprobación.
     */
    rearmar(): void {
      mutar({ aprobacionPendiente: false });
    },

    /**
     * El cierre del turno. `modelo` es el que lo corrió, capturado por quien llama EN
     * este momento (no en el render): un /modelo posterior no debe reetiquetar turnos
     * ya cerrados. Sin modelo no se escribe la clave, para que los actos viejos y los
     * tests que los comparan con `toEqual` no cambien.
     */
    fin(ms: number, modelo?: string): void {
      aniadir([modelo === undefined ? { tipo: "fin", ms } : { tipo: "fin", ms, modelo }]);
    },
  };
}

/**
 * Lo que la TUI muestra además del transcript y que TAMBIÉN cambia mientras corre:
 * si hay un turno en curso, una pregunta de consola viva (crear proyecto, la clave
 * de /provider) o un modal de aprobación montado. Vive en su propia ranura y no en
 * `EstadoDeTui` porque es estado de MONTAJE (quién tiene el teclado), no contenido
 * del transcript.
 */
export type VistaDeTui = {
  /** Hay un turno corriendo: Ctrl-C lo cancela, pero la Entrada sigue disponible para encolar. */
  ocupado: boolean;
  /** Peticiones confirmadas que esperan a que acabe el turno activo. */
  enCola: string[];
  /**
   * La pregunta de `consola.preguntar`/`leerSecreto` sin resolver. Mientras vive,
   * la app la pinta EN LUGAR de la Entrada (un solo teclado a la vez). `oculto`
   * pinta asteriscos: es la clave de `/provider`.
   */
  pregunta: { texto: string; oculto: boolean; responder: (respuesta: string) => void } | null;
  /** El modal de aprobación montado, con las props que `pedirDecisionesTui` dejó. */
  modal: PropsDelModal | null;
};

/** Un trocito observable de la vista: lo que `App` consume con `useSincronizado`. */
export interface Ranura<T extends object> {
  ver(): T;
  mutar(cambio: Partial<T>): void;
  suscribir(f: () => void): () => void;
}

export function crearRanura<T extends object>(inicial: T): Ranura<T> {
  let valor = inicial;
  const suscriptores: (() => void)[] = [];
  return {
    ver: () => valor,
    mutar(cambio: Partial<T>): void {
      valor = { ...valor, ...cambio };
      for (const s of suscriptores) s();
    },
    /** Devuelve la baja, igual que el store: el cleanup del useEffect es su llamador natural. */
    suscribir(f: () => void): () => void {
      suscriptores.push(f);
      return () => {
        const indice = suscriptores.lastIndexOf(f);
        if (indice !== -1) suscriptores.splice(indice, 1);
      };
    },
  };
}

export function vistaInicial(): VistaDeTui {
  return { ocupado: false, enCola: [], pregunta: null, modal: null };
}
