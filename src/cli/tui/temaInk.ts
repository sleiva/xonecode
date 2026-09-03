/**
 * El vocabulario de color de la TUI: las MISMAS claves semánticas que `cli/tema.ts`
 * (`exito`, `grave`, `mudo`…), traducidas a la paleta de la TUI. La piel stdio pide
 * ANSI a tema.ts y la TUI pide hex a aquí — un solo significado, dos renderizadores.
 * Paleta dark-first con los azules de XOne (medidos en el CSS de xone.es: navy #00396f,
 * azul #47abd6, cian #2ac4ea).
 *
 * Los tokens de CONTROL de tema.ts (`reset`, `borrar`, `limpiarLinea`, `arriba`)
 * se reflejan como no-ops: Ink compone spans y gestiona el cursor, así que aquí no
 * hay nada que emitir — pero la clave existe, para que el test de espejo que recorre
 * `Object.keys(crearTema(true))` pruebe que ningún token nuevo de tema.ts se olvida.
 */
import type { IdTema } from "../tema.js";

export type TemaInk = {
  texto: string;
  mudo: string;
  negrita: string;
  exito: string;
  aviso: string;
  grave: string;
  anadido: string;
  quitado: string;
  /** El `▏` del cursor. El cian de xone.es (#2ac4ea), del mismo tono frío que `acento`. */
  prompt: string;
  /** No-op: Ink abre y cierra sus spans solos; un reset ANSI dentro de un span lo rompería. */
  reset: string;
  /** No-ops de control: el render de Ink repinta; ni borra líneas ni mueve el cursor. */
  borrar: string;
  limpiarLinea: string;
  arriba: () => string;
  /** El azul claro de xone.es: cabeceras de sidebar, viñetas, el ■ del fin, el logotipo. */
  acento: string;
  /** Reservado: token de maqueta SIN consumidor hoy — el test de espejo lo lista. */
  borde: string;
  /**
   * El fondo de la tarjeta de la Entrada, pintado fila a fila en cada `Text` (Ink 5.2.1
   * no da fondo a `Box`). El gris de OpenCode (`backgroundElement`, darkStep3) sobre su
   * terminal `#0a0a0a`: un escalón visible, no un matiz.
   */
  fondoInput: string;
  /** Fondo casi negro para una petición pendiente: se aparta de la conversación activa. */
  fondoCola: string;
  /**
   * Superficie de la sidebar: un azul pizarra separado del transcript para que el
   * contexto se lea como panel, no como una continuación de la conversación.
   */
  fondoSidebar: string;
  /**
   * El navy dominante de xone.es. SOLO para barras y bordes: como color de texto sobre
   * un terminal oscuro es casi invisible, y un color de marca que no se lee no es marca.
   */
  marca: string;
  /**
   * El único tono cálido de la paleta: la línea «+ fase: Ns» se distingue del texto mudo
   * sin competir con el acento azul. No es color XOne; es un token de TUI declarado.
   */
  fase: string;
  /**
   * Un gris por debajo de `mudo`: las líneas de herramientas son paisaje y tienen que
   * leerse como tal, más apagadas que los avisos y que el detalle de una fase.
   */
  tenue: string;
};

const XONE: TemaInk = {
  texto: "#d4d4d8",
  mudo: "#71717a",
  negrita: "#ffffff",
  exito: "#4ade80",
  aviso: "#fbbf24",
  grave: "#f87171",
  anadido: "#4ade80",
  quitado: "#f87171",
  prompt: "#2ac4ea",
  reset: "",
  borrar: "",
  limpiarLinea: "",
  arriba: (): string => "",
  acento: "#47abd6",
  borde: "#27272a",
  fondoInput: "#1e1e1e",
  fondoCola: "#090909",
  fondoSidebar: "#162331",
  marca: "#00396f",
  fase: "#e0a458",
  tenue: "#52525b",
};

const PALETAS: Record<IdTema, TemaInk> = {
  xone: XONE,
  clear: {
    ...XONE,
    texto: "#f1f5f9",
    mudo: "#94a3b8",
    exito: "#86efac",
    aviso: "#fde68a",
    grave: "#fca5a5",
    anadido: "#86efac",
    quitado: "#fca5a5",
    prompt: "#e0f2fe",
    acento: "#7dd3fc",
    borde: "#334155",
    fondoInput: "#111827",
    fondoCola: "#020617",
    fondoSidebar: "#1e293b",
    marca: "#0f2742",
    fase: "#f8fafc",
    tenue: "#64748b",
  },
  midnight: {
    ...XONE,
    texto: "#dbeafe",
    mudo: "#7182a0",
    exito: "#5eead4",
    aviso: "#facc15",
    grave: "#fb7185",
    anadido: "#5eead4",
    quitado: "#fb7185",
    prompt: "#38bdf8",
    acento: "#60a5fa",
    borde: "#1e3a5f",
    fondoInput: "#0b1220",
    fondoCola: "#020617",
    fondoSidebar: "#0d1b32",
    marca: "#172554",
    fase: "#38bdf8",
    tenue: "#475569",
  },
  graphite: {
    ...XONE,
    texto: "#e5e7eb",
    mudo: "#9ca3af",
    exito: "#86efac",
    aviso: "#fcd34d",
    grave: "#fca5a5",
    anadido: "#86efac",
    quitado: "#fca5a5",
    prompt: "#d1d5db",
    acento: "#cbd5e1",
    borde: "#3f3f46",
    fondoInput: "#18181b",
    fondoCola: "#09090b",
    fondoSidebar: "#202024",
    marca: "#27272a",
    fase: "#e4e4e7",
    tenue: "#71717a",
  },
  ember: {
    ...XONE,
    texto: "#f5f1e8",
    mudo: "#a8a29e",
    exito: "#a3e635",
    aviso: "#fbbf24",
    grave: "#fb7185",
    anadido: "#a3e635",
    quitado: "#fb7185",
    prompt: "#fcd34d",
    acento: "#f59e0b",
    borde: "#44403c",
    fondoInput: "#1c1917",
    fondoCola: "#0c0a09",
    fondoSidebar: "#29211d",
    marca: "#78350f",
    fase: "#fb923c",
    tenue: "#78716c",
  },
};

let idActivo: IdTema = "xone";

/** Identidad estable: los componentes importan este objeto y React se repinta al cambiar la ranura de vista. */
export const temaInk: TemaInk = { ...XONE };

export function aplicarTemaInk(id: IdTema): void {
  idActivo = id;
  Object.assign(temaInk, PALETAS[id]);
}

export function temaInkActivo(): IdTema {
  return idActivo;
}
