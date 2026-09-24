import { useEffect, useRef, type MouseEvent } from "react";
import { Button, Modal } from "@deepseek-ai/dsh-client-ui-primitives";
import coraza from "./Pregunta.module.css";
import estilos from "./VisorDeImagen.module.css";
import { urlDeArtefacto } from "./Artefactos.js";

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
 */
export function VisorDeImagen({
  ruta,
  nombre,
  alCerrar,
  alAbrirEnArtefactos,
}: {
  ruta: string;
  nombre: string;
  alCerrar: () => void;
  /** Llevarla a la pestaña Artefactos, que es lo que hacía el clic en la miniatura. Sin él
   *  no se pinta el botón: uno que no lleva a ninguna parte es el botón muerto de siempre. */
  alAbrirEnArtefactos?: () => void;
}) {
  // El foco entra en la ventana al abrirse —si no, `Escape` y el tabulador seguirían en la
  // miniatura de detrás— y vuelve a ella al cerrarse, que es donde estaba quien la abrió.
  const cerrar = useRef<HTMLButtonElement>(null);
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
            <span className={estilos.acciones}>
              {alAbrirEnArtefactos === undefined ? null : (
                <Button type="button" variant="outline" className={coraza.cancelar} onClick={alAbrirEnArtefactos}>
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
