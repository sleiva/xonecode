import { useEffect, useId, useRef, useState, type MouseEvent } from "react";
import { Button, Modal } from "@deepseek-ai/dsh-client-ui-primitives";
import coraza from "./Pregunta.module.css";
import estilos from "./ConsultaDelAgente.module.css";

/**
 * La pregunta del AGENTE, con sus opciones (`core/actos.ts#consulta`).
 *
 * Es la misma puerta que la decisión de `Pregunta.tsx` —portal, `role="dialog"`, velo
 * centrado—, porque lo que se contesta aquí tiene al otro lado un turno parado esperando. La
 * FORMA de dentro sigue el modo de pregunta del `ToolFallback` de assistant-ui (sin su
 * runtime): opciones grandes que se ELIGEN, un campo para contestar con tus palabras, y un
 * «Responder» que manda lo elegido. Elegir y mandar son dos gestos, así que un clic de más
 * sobre la opción equivocada no contesta por ti.
 *
 * NO es una decisión fail-closed, y eso cambia las salidas:
 *
 * - **Responder MANDA lo elegido como el mensaje siguiente**, con su texto: el motor ya lee
 *   una respuesta escrita (`respuestaAPregunta`), así que no hay canal nuevo — se escribe por
 *   la persona lo que ella habría escrito. La respuesta libre va por el MISMO camino.
 * - **Cerrar NO contesta nada**: Escape, el velo y «Cancelar» solo apartan la ventana. La
 *   pregunta sigue en el chat con sus opciones numeradas y se puede contestar desde el
 *   compositor. Aquí no hay nada que autorizar sin querer, así que no hay dirección segura
 *   que imponer.
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
  // Qué está elegido: el índice de una opción, «otra» (la respuesta libre) o nada todavía.
  const [eleccion, setEleccion] = useState<number | "otra" | undefined>(undefined);
  const [propia, setPropia] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [falloDeEnvio, setFalloDeEnvio] = useState(false);
  // El cerrojo del envío va en un `ref` y no solo en el estado: dos clics del MISMO tick
  // comparten el cierre, y los dos verían `enviando` a false. El segundo mensaje sería el
  // encargo del turno siguiente.
  const enVuelo = useRef(false);
  const montado = useRef(true);
  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);

  const respuesta =
    eleccion === "otra" ? propia.trim() : eleccion === undefined ? "" : (opciones[eleccion] ?? "");

  const responder = (): void => {
    if (enVuelo.current || respuesta === "") return;
    enVuelo.current = true;
    setEnviando(true);
    setFalloDeEnvio(false);
    void Promise.resolve(alElegir(respuesta)).catch(() => {
      enVuelo.current = false;
      if (!montado.current) return;
      setEnviando(false);
      setFalloDeEnvio(true);
    });
  };

  const nombreDelGrupo = useId();

  return (
    <Modal open onClose={alCerrar} title={pregunta} headless className={coraza.capa}>
      <div
        className={coraza.velo}
        onClick={(evento: MouseEvent<HTMLDivElement>) => {
          if (evento.target === evento.currentTarget) alCerrar();
        }}
      >
        <div className={coraza.pregunta}>
          <p className={estilos.cabecera}>
            <span aria-hidden="true" className={estilos.marca}>
              ?
            </span>
            El agente necesita una respuesta
          </p>
          <p className={estilos.enunciado}>{pregunta}</p>
          <div role="radiogroup" aria-label={pregunta} className={estilos.opciones}>
            {opciones.map((opcion, i) => (
              <label key={i} className={estilos.opcion} data-elegida={eleccion === i ? "" : undefined}>
                <input
                  type="radio"
                  name={nombreDelGrupo}
                  className={estilos.radio}
                  checked={eleccion === i}
                  disabled={enviando}
                  onChange={() => setEleccion(i)}
                />
                <span>{opcion}</span>
              </label>
            ))}
            {/* La respuesta LIBRE, que es la otra mitad de lo que la tool ofrece. Escribir en
                el campo la elige: nadie escribe una respuesta para mandar otra. */}
            <label className={`${estilos.opcion} ${estilos.otra}`} data-elegida={eleccion === "otra" ? "" : undefined}>
              <input
                type="radio"
                name={nombreDelGrupo}
                className={estilos.radio}
                checked={eleccion === "otra"}
                disabled={enviando}
                onChange={() => setEleccion("otra")}
                aria-label="Otra respuesta"
              />
              <textarea
                className={estilos.campo}
                rows={2}
                placeholder="O contesta con tus palabras…"
                aria-label="Tu respuesta"
                value={propia}
                disabled={enviando}
                onChange={(e) => {
                  setPropia(e.target.value);
                  setEleccion("otra");
                }}
              />
            </label>
          </div>
          <div className={estilos.decisiones}>
            <Button type="button" variant="outline" className={coraza.cancelar} disabled={enviando} onClick={alCerrar}>
              Cancelar
            </Button>
            <Button
              type="button"
              className={coraza.accion}
              disabled={enviando || respuesta === ""}
              onClick={responder}
            >
              {enviando ? "Enviando…" : "Responder"}
            </Button>
          </div>
          {falloDeEnvio ? (
            <p className={coraza.fallo} role="alert">
              La respuesta no llegó a xonecode: el envío falló. Vuelve a pulsar «Responder» cuando la conexión se recupere.
            </p>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
