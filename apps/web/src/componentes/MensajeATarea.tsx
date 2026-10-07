import { useState } from "react";
import { Modal, Button } from "@deepseek-ai/dsh-client-ui-primitives";
import modal from "./NuevaSesion.module.css";
import estilos from "./MensajeATarea.module.css";

/**
 * La conversación abierta es la de una TAREA que espera feedback: el aviso que va encima del compositor.
 *
 * Existe porque escribir en ese chat no le llegaba a la tarea: lo tomaba la consola de la persona como un turno más, con
 * aprobaciones, y la tarea seguía aparcada (lo dijo la persona usándolo).
 */
export function AvisoDeTareaEnEspera({ titulo }: { titulo: string }) {
  return (
    <p className={estilos.aviso} role="note">
      {`Esta conversación es de la tarea «${titulo}», que espera tu feedback. Lo que escribas puedes mandárselo para que siga en segundo plano, o seguir aquí tú.`}
    </p>
  );
}

/**
 * Al ENVIAR desde el chat de esa tarea, se elige a dónde va el mensaje:
 * - «Enviar y continuar la tarea»: el texto va a la tarea como feedback y la tarea arranca (cede el proyecto: se cierra
 *   esta conversación, que queda guardada). Devuelve el motivo si no se pudo.
 * - «Seguir aquí en el chat»: lo de siempre, un turno con la persona delante.
 * Un mensaje con adjuntos solo puede seguir aquí: el feedback de una tarea es texto.
 */
export function ElegirDestinoDelMensaje({
  titulo,
  conAdjuntos,
  alContinuarLaTarea,
  alSeguirAqui,
  alCancelar,
}: {
  titulo: string;
  conAdjuntos: boolean;
  alContinuarLaTarea: () => Promise<string | undefined>;
  alSeguirAqui: () => void;
  alCancelar: () => void;
}) {
  const [enviando, setEnviando] = useState(false);
  const [negativa, setNegativa] = useState<string | undefined>(undefined);
  return (
    <Modal open onClose={alCancelar} title="¿A dónde va este mensaje?" headless className={modal.capa}>
      <div
        className={modal.velo}
        onClick={(evento) => {
          if (evento.target === evento.currentTarget && !enviando) alCancelar();
        }}
      >
        <div className={modal.ventana}>
          <h2 className={modal.titulo}>¿A dónde va este mensaje?</h2>
          <p className={modal.nota}>
            {`Esta conversación es de la tarea «${titulo}». Puedes mandárselo para que siga sola en segundo plano —se cierra esta conversación, que queda guardada, y la ves en vivo desde Tareas— o seguir aquí tú, con cada escritura aprobada.`}
          </p>
          {conAdjuntos ? <p className={modal.nota}>Lleva adjuntos: solo puede seguir aquí, el feedback de una tarea es texto.</p> : null}
          {negativa !== undefined ? (
            <p className={estilos.negativa} role="alert">{`No se pudo: ${negativa}`}</p>
          ) : null}
          <div className={modal.acciones}>
            <Button variant="outline" className={modal.accion} disabled={enviando} onClick={alCancelar}>
              Cancelar
            </Button>
            <Button variant="outline" className={modal.accion} disabled={enviando} onClick={alSeguirAqui}>
              Seguir aquí en el chat
            </Button>
            <Button
              variant="primary"
              className={`${modal.accion} ${modal.principal}`}
              disabled={enviando || conAdjuntos}
              onClick={() => {
                setEnviando(true);
                setNegativa(undefined);
                void alContinuarLaTarea()
                  .catch(() => "el envío falló")
                  .then((motivo) => {
                    setEnviando(false);
                    if (motivo !== undefined) setNegativa(motivo);
                  });
              }}
            >
              {enviando ? "Enviando…" : "Enviar y continuar la tarea"}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
