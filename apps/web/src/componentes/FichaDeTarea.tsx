import { useRef, useState, type ReactNode } from "react";
import { MarkdownText } from "@deepseek-ai/dsh-client-ui-primitives";
import type { TareaDelCable } from "../tipos.js";
import { selloDeFecha } from "../selloDeFecha.js";
import { protegerDolares } from "../protegerDolares.js";
import { ETIQUETAS_DE_CODIGO } from "../etiquetasDeCodigo.js";
import { ListaDePantallas } from "./DisenoDelProyecto.js";
import { CifrasAcabadas, CifrasEnMarcha } from "./TareasDelProyecto.js";
import { guardarAnchoFicha, leerAnchoFicha } from "../preferencias.js";
import estilos from "./FichaDeTarea.module.css";

export const ANCHO_FICHA_POR_OMISION = 360;
export const ANCHO_FICHA_MINIMO = 280;
/** Lo que se le deja como mínimo a la conversación al ensanchar la ficha. */
export const ANCHO_MINIMO_DE_LA_CONVERSACION = 420;

/** El ancho de la ficha, acotado: ni más estrecha que su mínimo, ni tanto que la conversación baje del suyo. Pura. */
export function acotarAnchoDeFicha(px: number, anchoDelReparto?: number): number {
  if (!Number.isFinite(px)) return ANCHO_FICHA_POR_OMISION;
  const techo =
    anchoDelReparto === undefined || !Number.isFinite(anchoDelReparto)
      ? Number.POSITIVE_INFINITY
      : Math.max(ANCHO_FICHA_MINIMO, anchoDelReparto - ANCHO_MINIMO_DE_LA_CONVERSACION);
  return Math.round(Math.min(Math.max(px, ANCHO_FICHA_MINIMO), techo));
}

/**
 * La conversación a la izquierda y la ficha a la derecha, con un tirador entre las dos para ENSANCHAR la ficha (petición
 * suya: «que pueda crecer de ancho»). Es un `separator` enfocable, como los de la maqueta: se arrastra con el puntero y se
 * mueve con las flechas; el ancho se recuerda en este navegador (`preferencias.ts`).
 */
export function ConFicha({ ficha, children }: { ficha: ReactNode; children: ReactNode }) {
  const [ancho, setAncho] = useState(() => acotarAnchoDeFicha(leerAnchoFicha() ?? ANCHO_FICHA_POR_OMISION));
  const [arrastrando, setArrastrando] = useState(false);
  const reparto = useRef<HTMLDivElement | null>(null);
  const pedir = (px: number, terminado: boolean): void => {
    const acotado = acotarAnchoDeFicha(px, reparto.current?.getBoundingClientRect().width || undefined);
    setAncho(acotado);
    if (terminado) guardarAnchoFicha(acotado);
  };
  // La ficha va pegada al borde DERECHO: su ancho es lo que va del puntero a ese borde.
  const desdeElPuntero = (clientX: number, terminado: boolean): void => {
    const caja = reparto.current?.getBoundingClientRect();
    if (caja !== undefined) pedir(caja.right - clientX, terminado);
  };
  return (
    <div className={estilos.conFicha}>
      <div ref={reparto} className={estilos.reparto} style={{ "--ancho-ficha": `${ancho}px` } as React.CSSProperties}>
        <div className={estilos.conversacion}>{children}</div>
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Ancho de la ficha"
          aria-valuenow={ancho}
          aria-valuemin={ANCHO_FICHA_MINIMO}
          tabIndex={0}
          className={estilos.tirador}
          data-arrastrando={arrastrando ? "" : undefined}
          onPointerDown={(e) => {
            if (e.button > 0) return;
            e.preventDefault();
            setArrastrando(true);
            try {
              e.currentTarget.setPointerCapture?.(e.pointerId);
            } catch {
              // Sin captura: el arrastre sigue mientras el puntero no salga de la tira.
            }
          }}
          onPointerMove={(e) => {
            if (arrastrando) desdeElPuntero(e.clientX, false);
          }}
          onPointerUp={(e) => {
            if (!arrastrando) return;
            setArrastrando(false);
            desdeElPuntero(e.clientX, true);
          }}
          onPointerCancel={() => {
            setArrastrando(false);
            guardarAnchoFicha(ancho);
          }}
          onKeyDown={(e) => {
            // La flecha IZQUIERDA ensancha: el tirador se mueve hacia ese lado.
            const paso = e.shiftKey ? 64 : 16;
            if (e.key === "ArrowLeft") pedir(ancho + paso, true);
            else if (e.key === "ArrowRight") pedir(ancho - paso, true);
            else return;
            e.preventDefault();
          }}
          onDoubleClick={() => pedir(ANCHO_FICHA_POR_OMISION, true)}
        />
        {ficha}
      </div>
    </div>
  );
}

/**
 * La FICHA de una tarea, a la derecha de su conversación mientras se lee (IXCODE-68, opción A de su lienzo «Tarea en
 * curso»): todo lo de la tarea a la vista sin buscarlo —título, ticket, cuándo empezó, cuánto lleva y cuánto ha gastado,
 * lo que se pidió, el encargo ampliado, el diseño y los adjuntos—. Lo que no consta no se pinta: ni una cifra a cero ni
 * una sección vacía. El encargo nace abierto (es lo que se viene a ver) y plegado se DESMONTA.
 */
export function FichaDeTarea({ tarea: t }: { tarea: TareaDelCable }) {
  const [encargoAbierto, setEncargoAbierto] = useState(true);
  const empezo = t.empezada === undefined ? undefined : selloDeFecha(t.empezada);
  const igual = t.peticion.trim() === t.encargo.trim();
  const md = (texto: string) => <MarkdownText text={protegerDolares(texto)} codeLabels={ETIQUETAS_DE_CODIGO} />;
  const pantallas = t.pantallasDeStitch ?? [];
  return (
    <aside className={estilos.ficha} aria-label="Ficha de la tarea">
      <div className={estilos.cabecera}>
        <span className={estilos.rotulo}>Tarea</span>
        <span className={estilos.titulo}>{t.titulo}</span>
        {t.ticket === undefined && empezo === undefined ? null : (
          <div className={estilos.datos}>
            {t.ticket === undefined ? null : <span className={estilos.ticket}>{t.ticket.clave}</span>}
            {empezo === undefined ? null : <span>{`Empezó ${empezo}`}</span>}
          </div>
        )}
      </div>

      {t.estado === "en-proceso" && t.empezada !== undefined ? (
        <CifrasEnMarcha empezada={t.empezada} gasto={t.gastoEnCurso} />
      ) : (
        // Acabada: las MISMAS cifras grandes, con lo que tardó trabajando y lo que gastó (cada una solo si consta).
        <CifrasAcabadas trabajo={t.trabajo} gasto={t.gasto} />
      )}

      {igual ? null : (
        <section className={estilos.seccion} aria-label="Lo que se pidió">
          <h3 className={estilos.rotulo}>Lo que se pidió</h3>
          <div className={estilos.texto}>{md(t.peticion)}</div>
        </section>
      )}

      <section className={estilos.seccion} aria-label="Encargo">
        <button type="button" className={estilos.plegable} aria-expanded={encargoAbierto} onClick={() => setEncargoAbierto(!encargoAbierto)}>
          <span aria-hidden="true">{encargoAbierto ? "▾" : "▸"}</span> {igual ? "Encargo" : "Encargo ampliado"}
        </button>
        {encargoAbierto ? <div className={estilos.encargo}>{md(t.encargo)}</div> : null}
      </section>

      {pantallas.length === 0 ? null : (
        <section className={estilos.seccion} aria-label="Diseño">
          <h3 className={estilos.rotulo}>Diseño</h3>
          {pantallas[0]!.proyecto === undefined ? null : <p className={estilos.texto}>{`Del proyecto de Stitch «${pantallas[0]!.proyecto}»`}</p>}
          <ListaDePantallas pantallas={pantallas} />
        </section>
      )}

      {t.adjuntos.length === 0 ? null : (
        <section className={estilos.seccion} aria-label="Adjuntos">
          <h3 className={estilos.rotulo}>Adjuntos</h3>
          <ul className={estilos.adjuntos}>
            {t.adjuntos.map((a) => (
              <li key={a.nombre}>{a.nombre}</li>
            ))}
          </ul>
        </section>
      )}
    </aside>
  );
}
