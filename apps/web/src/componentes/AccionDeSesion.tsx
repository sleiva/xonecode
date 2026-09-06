import { useState } from "react";
import { Modal, Button } from "@deepseek-ai/dsh-client-ui-primitives";
import clsx from "clsx";
import estilos from "./NuevaSesion.module.css";
import propios from "./AccionDeSesion.module.css";

/** Lo que se ha elegido en el «…» de una sesión, y sobre qué sesión. */
export interface AccionPendiente {
  proyecto: string;
  sesion: string;
  titulo: string;
  accion: "renombrar" | "borrar";
}

/**
 * La ventana que confirma lo que se eligió en el menú de una sesión.
 *
 * Las dos acciones pasan por aquí, y por motivos distintos:
 *
 * - **Eliminar** es irreversible y no hay papelera: se borra el `.jsonl`, la entrada del
 *   índice y la marca de git de la sesión. Un menú que borra al primer clic es cómo se
 *   pierde una conversación de una tarde por un clic de más en una fila de 34 píxeles. Por
 *   eso además se DICE lo que se lleva por delante, y se dice si es la que está abierta:
 *   entonces la consola se cierra y vuelves al escritorio, que no es evidente.
 * - **Renombrar** no confirma nada, pide un dato: sin campo no hay nombre que poner. Va
 *   prerrellenado con el actual porque casi siempre se retoca, no se escribe de cero.
 *
 * Reutiliza la coraza de `NuevaSesion.module.css` —capa, velo, ventana, acciones— en vez de
 * copiarla: es el mismo modal, y dos copias del mismo velo es cómo se acaba con dos velos
 * distintos. Lo propio de aquí es sólo lo que esta ventana añade.
 */
export function AccionDeSesion({
  pendiente,
  esLaAbierta,
  alConfirmar,
  alCerrar,
}: {
  pendiente: AccionPendiente;
  /** Es la sesión que se está mirando. Solo cambia lo que se AVISA, no lo que se hace. */
  esLaAbierta: boolean;
  /** El título solo viaja al renombrar. */
  alConfirmar: (titulo?: string) => void;
  alCerrar: () => void;
}) {
  const [titulo, setTitulo] = useState(pendiente.titulo);
  const borrando = pendiente.accion === "borrar";
  // Un nombre en blanco se rechaza en el servidor (devolvería la sesión al título
  // automático y el siguiente turno la rebautizaría), así que aquí ni se ofrece mandarlo.
  const puedeConfirmar = borrando || titulo.trim() !== "";

  return (
    <Modal
      open
      onClose={alCerrar}
      title={borrando ? "Eliminar sesión" : "Renombrar sesión"}
      headless
      className={estilos.capa}
    >
      <div
        className={estilos.velo}
        onClick={(evento) => {
          if (evento.target === evento.currentTarget) alCerrar();
        }}
      >
        <div className={estilos.ventana}>
          <h2 className={estilos.titulo}>{borrando ? "Eliminar sesión" : "Renombrar sesión"}</h2>
          {borrando ? (
            <>
              <p className={estilos.nota}>
                Se borra «{pendiente.titulo}» entera: la conversación guardada y la lista de
                ficheros que tocó. No hay papelera.
              </p>
              {esLaAbierta ? (
                <p className={estilos.nota}>
                  Es la que estás mirando ahora, así que la consola se cerrará y volverás al
                  escritorio.
                </p>
              ) : null}
            </>
          ) : (
            <>
              <label className={estilos.etiqueta} htmlFor="accion-sesion-titulo">
                Nombre
              </label>
              <input
                id="accion-sesion-titulo"
                className={estilos.campo}
                value={titulo}
                autoFocus
                onChange={(e) => setTitulo(e.target.value)}
                // Enter confirma, que es lo que hace un campo único en un diálogo. Escape lo
                // cierra por el `Modal`, igual que en el resto de ventanas.
                onKeyDown={(e) => {
                  if (e.key === "Enter" && puedeConfirmar) alConfirmar(titulo);
                }}
              />
            </>
          )}
          <div className={estilos.acciones}>
            <Button variant="outline" className={estilos.accion} onClick={alCerrar}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              className={clsx(estilos.accion, estilos.principal, borrando && propios.destructiva)}
              disabled={!puedeConfirmar}
              onClick={() => alConfirmar(borrando ? undefined : titulo)}
            >
              {borrando ? "Eliminar" : "Guardar"}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
