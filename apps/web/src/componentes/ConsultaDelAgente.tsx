import { useEffect, useRef, useState, type MouseEvent } from "react";
import { Button, Modal } from "@deepseek-ai/dsh-client-ui-primitives";
import coraza from "./Pregunta.module.css";
import estilos from "./ConsultaDelAgente.module.css";

/**
 * La pregunta del AGENTE, con un botón por opción (`core/actos.ts#consulta`).
 *
 * Es la misma puerta que la decisión de `Pregunta.tsx` —portal, `role="dialog"`, velo
 * centrado—, porque lo que se contesta aquí tiene al otro lado un turno parado esperando. Pero
 * NO es una decisión fail-closed, y eso cambia las salidas:
 *
 * - **Pulsar una opción la MANDA como el mensaje siguiente**, con su texto: el motor ya lee
 *   una respuesta escrita (`respuestaAPregunta`), así que el botón no inventa un canal nuevo,
 *   escribe por la persona lo que ella habría escrito.
 * - **Cerrar NO contesta nada**: Escape, el velo y «Responder escribiendo» solo apartan la
 *   ventana. La pregunta sigue en el chat con sus opciones numeradas, y la persona puede
 *   contestar con sus palabras —que es la mitad de lo que la tool ofrece—. Aquí no hay nada
 *   que autorizar sin querer, así que no hay dirección segura que imponer.
 *
 * Lo pendiente lo decide el HILO (`consultaPendiente.ts`), no este componente: por eso la
 * ventana vuelve al reabrir una sesión que se quedó esperando.
 */
export function ConsultaDelAgente({
  pregunta,
  opciones,
  alElegir,
  alCerrar,
}: {
  pregunta: string;
  opciones: readonly string[];
  /** Se ESPERA: retirar la ventana con el envío fallido dejaría creer que se contestó. */
  alElegir: (opcion: string) => void | Promise<unknown>;
  alCerrar: () => void;
}) {
  const [enviando, setEnviando] = useState(false);
  const [falloDeEnvio, setFalloDeEnvio] = useState(false);
  const montado = useRef(true);
  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);

  // Un segundo clic mientras el primero vuela mandaría DOS mensajes: el segundo sería el
  // encargo del turno siguiente.
  const elegir = (opcion: string): void => {
    if (enviando) return;
    setEnviando(true);
    setFalloDeEnvio(false);
    void Promise.resolve(alElegir(opcion)).catch(() => {
      if (!montado.current) return;
      setEnviando(false);
      setFalloDeEnvio(true);
    });
  };

  return (
    <Modal open onClose={alCerrar} title={pregunta} headless className={coraza.capa}>
      <div
        className={coraza.velo}
        onClick={(evento: MouseEvent<HTMLDivElement>) => {
          if (evento.target === evento.currentTarget) alCerrar();
        }}
      >
        <div className={coraza.pregunta}>
          <p className={coraza.titulo}>{pregunta}</p>
          <div className={estilos.opciones}>
            {opciones.map((opcion, i) => (
              <Button
                key={i}
                type="button"
                variant="outline"
                className={`${coraza.cancelar} ${estilos.opcion}`}
                disabled={enviando}
                onClick={() => elegir(opcion)}
              >
                {opcion}
              </Button>
            ))}
          </div>
          <div className={coraza.decisiones}>
            <Button type="button" variant="outline" className={coraza.cancelar} disabled={enviando} onClick={alCerrar}>
              Responder escribiendo
            </Button>
          </div>
          {falloDeEnvio ? (
            <p className={coraza.fallo} role="alert">
              La respuesta no llegó a xonecode: el envío falló. Vuelve a elegirla cuando la conexión se recupere.
            </p>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
