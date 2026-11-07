import type { ReactNode } from "react";
import estilos from "./MarcoDelIde.module.css";

/**
 * La DISPOSICIÓN del estilo «Consola dev»: la consola de siempre (`Maqueta`) metida en un marco de IDE, con una barra
 * de ACTIVIDAD a la izquierda y una barra de ESTADO abajo. Sin el estilo puesto (`activo` falso) devuelve a su hijo tal
 * cual: ningún otro estilo paga un nodo de más.
 *
 * Dos reglas:
 * - **Solo acciones y datos que ya existen**: cada botón de la actividad llama a un manejador que la cabecera ya tenía
 *   (escritorio, barra, panel, ajustes), y la barra de estado pinta solo lo que consta. Un control sin dato detrás no
 *   se pinta: el botón del panel, sin sesión, no sale.
 * - **No duplica la cabecera, la acompaña**: la de arriba sigue siendo la que dice dónde estás; esto es el marco.
 */
export function MarcoDelIde({ activo, actividad, estado, children }: { activo: boolean; actividad: ReactNode; estado: ReactNode; children: ReactNode }) {
  if (!activo) return <>{children}</>;
  return (
    <div className={estilos.ide}>
      <div className={estilos.fila}>
        {actividad}
        <div className={estilos.centro}>{children}</div>
      </div>
      {estado}
    </div>
  );
}

const ICONOS = {
  escritorio: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  explorador: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
  panel: "M4 4h16v16H4zM15 4v16",
  ajustes:
    "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1",
} as const;

function Icono({ d }: { d: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

/** La barra de actividad: las vistas a las que se salta y los dos paneles que se abren o cierran. */
export function BarraDeActividad({
  enEscritorio,
  alIrAlEscritorio,
  barraVisible,
  alAlternarBarra,
  panelAbierto,
  alAlternarPanel,
  alAbrirAjustes,
}: {
  enEscritorio: boolean;
  alIrAlEscritorio: () => void;
  barraVisible: boolean;
  alAlternarBarra: () => void;
  /** Ausente = no hay panel que abrir (sin sesión): el botón no sale. */
  panelAbierto?: boolean;
  alAlternarPanel?: () => void;
  alAbrirAjustes: () => void;
}) {
  return (
    <nav className={estilos.actividad} aria-label="Actividad">
      <button
        type="button"
        className={estilos.boton}
        aria-label="Escritorio"
        title="Escritorio"
        aria-current={enEscritorio ? "page" : undefined}
        onClick={() => {
          if (!enEscritorio) alIrAlEscritorio();
        }}
      >
        <Icono d={ICONOS.escritorio} />
      </button>
      <button type="button" className={estilos.boton} aria-label="Explorador" title="Explorador" aria-pressed={barraVisible} onClick={alAlternarBarra}>
        <Icono d={ICONOS.explorador} />
      </button>
      {panelAbierto === undefined || alAlternarPanel === undefined ? null : (
        <button type="button" className={estilos.boton} aria-label="Panel" title="Panel" aria-pressed={panelAbierto} onClick={alAlternarPanel}>
          <Icono d={ICONOS.panel} />
        </button>
      )}
      <span className={estilos.hueco} />
      <button type="button" className={estilos.boton} aria-label="Ajustes" title="Ajustes" onClick={alAbrirAjustes}>
        <Icono d={ICONOS.ajustes} />
      </button>
    </nav>
  );
}

/** La barra de estado: lo que la consola SABE ahora, en una línea. Lo que no consta no se pinta. */
export function BarraDeEstadoDelIde({
  conectado,
  entorno,
  proyecto,
  modo,
  modelo,
  version,
}: {
  conectado: boolean;
  entorno?: string;
  proyecto?: string;
  modo?: string;
  modelo?: string;
  version?: string;
}) {
  return (
    <footer className={estilos.estado} aria-label="Estado">
      <span className={estilos.pieza} data-conectado={conectado ? "" : undefined}>
        <span className={estilos.punto} aria-hidden="true" />
        {entorno ?? (conectado ? "conectado" : "sin conexión")}
      </span>
      {proyecto === undefined ? null : <span className={estilos.pieza}>{proyecto}</span>}
      <span className={estilos.hueco} />
      {modelo === undefined ? null : <span className={estilos.pieza}>{modelo}</span>}
      {modo === undefined ? null : <span className={estilos.pieza}>{modo}</span>}
      {version === undefined ? null : <span className={estilos.pieza}>{version}</span>}
    </footer>
  );
}
