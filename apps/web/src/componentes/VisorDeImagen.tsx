import { useEffect, useRef, useState, type MouseEvent } from "react";
import { Button, Modal } from "@deepseek-ai/dsh-client-ui-primitives";
import coraza from "./Pregunta.module.css";
import estilos from "./VisorDeImagen.module.css";
import { useUrlDeArtefacto } from "./Artefactos.js";

/**
 * Una captura AMPLIADA, sobre la aplicación: el `Image.Zoom` de assistant-ui, sin su runtime.
 *
 * La miniatura del hilo es para reconocer la pantalla; para LEERLA hacía falta ir a la pestaña
 * Artefactos y perder el sitio en la conversación. Esto la enseña entera ahí mismo y se cierra
 * con `Escape`, con el clic fuera o con «Cerrar», que es volver a donde estabas.
 *
 * - **La misma puerta que las otras ventanas** (`Aprobacion.tsx`, `Pregunta.tsx`): el `Modal`
 *   de las primitivas pone el portal, `role="dialog"` y el `Escape`; el velo que se ve es el de
 *   la coraza, con su propio clic-fuera, porque la máscara del primitivo no se pinta.
 * - **Un `<img>` a la ruta HTTP del artefacto, nunca marcado inyectado**: un `.svg` puede traer
 *   un `<script>`, y en un `<img>` no se ejecuta. La misma regla que la miniatura y Ficheros.
 * - **Sin recortar**: `object-fit: contain` hasta donde quepa. Una captura de móvil es muy
 *   vertical, y recortarla perdería la barra de arriba, que es la que dice qué pantalla es.
 * - **Se pasa de una a otra sin cerrar** (IXCODE-57): con `←`/`→` o con «Anterior»/«Siguiente»,
 *   por las `imagenes` que le den —las de toda la conversación—. En los extremos se para, no da
 *   la vuelta: llegar a la última tiene que notarse. Con una sola no hay ni botones ni contador.
 */
export function VisorDeImagen({
  imagenes,
  inicial = 0,
  alCerrar,
  alAbrirEnArtefactos,
}: {
  imagenes: readonly { ruta: string; nombre: string }[];
  /** La que se abre: su posición en `imagenes`. */
  inicial?: number;
  alCerrar: () => void;
  /** Llevar la que se está viendo a la pestaña Artefactos, que es lo que hacía el clic en la
   *  miniatura. Sin él no se pinta el botón: uno que no lleva a ninguna parte es el botón muerto
   *  de siempre. */
  alAbrirEnArtefactos?: (ruta: string) => void;
}) {
  const [indice, setIndice] = useState(() => Math.min(Math.max(inicial, 0), imagenes.length - 1));
  const { ruta, nombre } = imagenes[indice]!;
  const varias = imagenes.length > 1;
  const hayAnterior = indice > 0;
  const haySiguiente = indice < imagenes.length - 1;
  useEffect(() => {
    if (!varias) return;
    const alTeclear = (evento: KeyboardEvent): void => {
      if (evento.key === "ArrowLeft") setIndice((i) => Math.max(i - 1, 0));
      else if (evento.key === "ArrowRight") setIndice((i) => Math.min(i + 1, imagenes.length - 1));
    };
    document.addEventListener("keydown", alTeclear);
    return () => document.removeEventListener("keydown", alTeclear);
  }, [varias, imagenes.length]);
  // El foco entra en la ventana al abrirse —si no, `Escape` y el tabulador seguirían en la
  // miniatura de detrás— y vuelve a ella al cerrarse, que es donde estaba quien la abrió.
  const cerrar = useRef<HTMLButtonElement>(null);
  const urlDeArtefacto = useUrlDeArtefacto();
  useEffect(() => {
    const antes = document.activeElement as HTMLElement | null;
    cerrar.current?.focus();
    return () => antes?.focus?.();
  }, []);

  return (
    <Modal open onClose={alCerrar} title={nombre} headless className={coraza.capa}>
      <div
        className={coraza.velo}
        onClick={(evento: MouseEvent<HTMLDivElement>) => {
          if (evento.target === evento.currentTarget) alCerrar();
        }}
      >
        <figure className={estilos.visor}>
          <img className={estilos.imagen} src={urlDeArtefacto(ruta)} alt={nombre} />
          <figcaption className={estilos.pie}>
            <span className={estilos.nombre}>{nombre}</span>
            {!varias ? null : (
              <span className={estilos.navegacion}>
                <button
                  type="button"
                  className={coraza.cancelar}
                  disabled={!hayAnterior}
                  onClick={() => setIndice(indice - 1)}
                  aria-label="Anterior"
                  title="Anterior (←)"
                >
                  ‹
                </button>
                <span className={estilos.contador} aria-live="polite">
                  {indice + 1} de {imagenes.length}
                </span>
                <button
                  type="button"
                  className={coraza.cancelar}
                  disabled={!haySiguiente}
                  onClick={() => setIndice(indice + 1)}
                  aria-label="Siguiente"
                  title="Siguiente (→)"
                >
                  ›
                </button>
              </span>
            )}
            <span className={estilos.acciones}>
              {alAbrirEnArtefactos === undefined ? null : (
                <Button type="button" variant="outline" className={coraza.cancelar} onClick={() => alAbrirEnArtefactos(ruta)}>
                  Abrir en Artefactos
                </Button>
              )}
              <a className={`${coraza.cancelar} ${estilos.enlace}`} href={urlDeArtefacto(ruta, true)} download={nombre}>
                Descargar
              </a>
              <button ref={cerrar} type="button" className={coraza.accion} onClick={alCerrar}>
                Cerrar
              </button>
            </span>
          </figcaption>
        </figure>
      </div>
    </Modal>
  );
}
