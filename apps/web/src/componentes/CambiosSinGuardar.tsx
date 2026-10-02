import { Modal, Button } from "@deepseek-ai/dsh-client-ui-primitives";
import clsx from "clsx";
import estilos from "./NuevaSesion.module.css";
import propios from "./AccionDeSesion.module.css";

/**
 * La pregunta antes de perder lo que se editó en la pestaña Ficheros: un diálogo de VERDAD y no un
 * `confirm`, que el navegador pinta con su cromo, bloquea la página entera y no se puede probar.
 * La misma coraza que `BorrarCopiaLocal` (`NuevaSesion.module.css`) y el mismo botón rojo, porque es
 * la misma clase de acto: lo descartado no vuelve.
 *
 * La salida SEGURA es la de por omisión: `Escape` y el clic en el velo son «Seguir editando».
 */
export function CambiosSinGuardar({ ruta, alDescartar, alSeguir }: { ruta: string; alDescartar: () => void; alSeguir: () => void }) {
  return (
    <Modal open onClose={alSeguir} title="Cambios sin guardar" headless className={estilos.capa}>
      <div
        className={estilos.velo}
        onClick={(evento) => {
          if (evento.target === evento.currentTarget) alSeguir();
        }}
      >
        <div className={estilos.ventana} role="alertdialog" aria-label="Cambios sin guardar">
          <h2 className={estilos.titulo}>Cambios sin guardar</h2>
          <p className={estilos.nota}>
            «{ruta}» tiene cambios que no has guardado. Si sigues, se pierden.
          </p>
          <div className={estilos.acciones}>
            <Button variant="outline" className={estilos.accion} onClick={alSeguir}>
              Seguir editando
            </Button>
            <Button variant="primary" className={clsx(estilos.accion, estilos.principal, propios.destructiva)} onClick={alDescartar}>
              Descartar cambios
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
