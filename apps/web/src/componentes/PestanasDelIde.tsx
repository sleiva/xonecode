import { useEffect, useState } from "react";
import estilos from "./PestanasDelIde.module.css";

/** Una pestaña de sesión: de qué proyecto y qué sesión. Sin `sesion` = la sesión NUEVA de ese proyecto (sin id todavía). */
export interface PestanaDeSesion {
  proyecto: string;
  sesion?: string;
}

/** Cuántas sesiones caben como pestaña; la más antigua sale por la izquierda. */
export const TOPE_DE_PESTANAS = 8;

const mismo = (a: PestanaDeSesion, b: PestanaDeSesion): boolean => a.proyecto === b.proyecto && a.sesion === b.sesion;

/**
 * La lista tras ABRIR una sesión. Si ya está, no se mueve (una pestaña no salta de sitio al volver a ella). Si es la
 * sesión que acaba de recibir su id, SUSTITUYE en su sitio a la «nueva» de su proyecto. Si no, entra al final, y con el
 * tope lleno sale la más antigua.
 */
export function abrirPestana(lista: readonly PestanaDeSesion[], activa: PestanaDeSesion): PestanaDeSesion[] {
  if (lista.some((p) => mismo(p, activa))) return [...lista];
  if (activa.sesion !== undefined) {
    const i = lista.findIndex((p) => p.proyecto === activa.proyecto && p.sesion === undefined);
    if (i >= 0) return lista.map((p, j) => (j === i ? activa : p));
  }
  return [...lista, activa].slice(-TOPE_DE_PESTANAS);
}

/**
 * Las que siguen valiendo: su proyecto está en el entorno, y su sesión existe (una borrada desde «Eliminar» se va). La
 * «nueva» solo vale mientras es la activa: fuera de ella no hay a qué volver. La ACTIVA vale siempre, aunque el índice
 * todavía no la traiga (acaba de nacer).
 */
export function pestanasVigentes(
  lista: readonly PestanaDeSesion[],
  proyectos: readonly { id: string; sesiones?: readonly { id: string }[] }[],
  activa: PestanaDeSesion | undefined
): PestanaDeSesion[] {
  return lista.filter((p) => {
    if (activa !== undefined && mismo(p, activa)) return true;
    if (p.sesion === undefined) return false;
    const proyecto = proyectos.find((x) => x.id === p.proyecto);
    return proyecto?.sesiones?.some((s) => s.id === p.sesion) === true;
  });
}

/**
 * Las PESTAÑAS DE EDITOR del estilo «Consola dev», encima de la columna central: el Escritorio fijo y las sesiones
 * abiertas, cada una con su proyecto y su título (leídos al pintar, no guardados: el título cambia tras el primer
 * mensaje). Pulsar abre por el MISMO camino que la fila de la barra; cerrar no borra nada, solo quita la pestaña, y
 * cerrar la puesta lleva al Escritorio.
 *
 * La lista vive AQUÍ, en memoria: es de esta ventana mientras dure el estilo, no una preferencia que guardar. Se apunta
 * con un efecto sobre la sesión ACTIVA (se abra desde donde se abra: la barra, el tablero, una sesión nueva).
 */
export function PestanasDelIde({
  enEscritorio,
  activa,
  proyectos,
  rotuloDe,
  alIrAlEscritorio,
  alAbrir,
}: {
  enEscritorio: boolean;
  activa: PestanaDeSesion | undefined;
  /** Los del entorno, con sus sesiones: una pestaña cuyo proyecto o sesión ya no está, se va. */
  proyectos: readonly { id: string; sesiones?: readonly { id: string }[] }[];
  rotuloDe: (p: PestanaDeSesion) => { proyecto: string; titulo: string };
  alIrAlEscritorio: () => void;
  alAbrir: (p: PestanaDeSesion) => void;
}) {
  const [lista, setLista] = useState<PestanaDeSesion[]>([]);
  const proyectoActivo = activa?.proyecto;
  const sesionActiva = activa?.sesion;
  useEffect(() => {
    if (proyectoActivo === undefined) return;
    setLista((antes) => abrirPestana(antes, { proyecto: proyectoActivo, ...(sesionActiva === undefined ? {} : { sesion: sesionActiva }) }));
  }, [proyectoActivo, sesionActiva]);
  const pestanas = pestanasVigentes(lista, proyectos, activa);
  const alCerrar = (p: PestanaDeSesion): void => {
    setLista((antes) => antes.filter((x) => !mismo(x, p)));
    if (activa !== undefined && mismo(p, activa)) alIrAlEscritorio();
  };
  return (
    <div className={estilos.tira} role="tablist" aria-label="Pestañas abiertas">
      <button
        type="button"
        role="tab"
        aria-selected={enEscritorio}
        className={estilos.pestana}
        onClick={() => {
          if (!enEscritorio) alIrAlEscritorio();
        }}
      >
        <span className={estilos.titulo}>Escritorio</span>
      </button>
      {pestanas.map((p) => {
        const puesta = activa !== undefined && mismo(p, activa);
        const { proyecto, titulo } = rotuloDe(p);
        return (
          <div key={`${p.proyecto}/${p.sesion ?? ""}`} className={estilos.pestana} data-puesta={puesta ? "" : undefined}>
            <button
              type="button"
              role="tab"
              aria-selected={puesta}
              className={estilos.abrir}
              title={`${proyecto} / ${titulo}`}
              onClick={() => {
                if (!puesta) alAbrir(p);
              }}
            >
              <span className={estilos.proyecto}>{proyecto}</span>
              <span className={estilos.titulo}>{titulo}</span>
            </button>
            <button type="button" className={estilos.cerrar} aria-label={`Cerrar la pestaña ${titulo}`} onClick={() => alCerrar(p)}>
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
