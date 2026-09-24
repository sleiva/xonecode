import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@deepseek-ai/dsh-client-ui-primitives";
import coraza from "./Pregunta.module.css";
import estilos from "./ConsultaDelAgente.module.css";

/**
 * La pregunta del AGENTE, con sus opciones (`core/actos.ts#consulta`), DENTRO del hilo.
 *
 * **En el chat y no en un diálogo.** Fue un modal —la misma puerta que la decisión de
 * `Pregunta.tsx`— y tapaba justo lo que hay que leer para contestar: el mensaje del agente que
 * explica la pregunta. Una decisión fail-closed necesita esa puerta porque sus botones la
 * provocan desde otra banda; esta es el FINAL del turno, así que su sitio es el final del hilo,
 * en la posición de su acto. Por lo mismo ya no hay «Cancelar»: no hay nada que apartar, y el
 * compositor sigue ahí para contestar con tus palabras.
 *
 * La FORMA sigue el modo de pregunta del `ToolFallback` de assistant-ui (sin su runtime):
 * opciones grandes que se ELIGEN, un campo para contestar con tus palabras, y un «Responder»
 * que manda lo elegido. Elegir y mandar son dos gestos, así que un clic de más sobre la opción
 * equivocada no contesta por ti.
 *
 * - **Responder MANDA lo elegido como el mensaje siguiente**, con su texto: el motor ya lee una
 *   respuesta escrita (`respuestaAPregunta`), así que no hay canal nuevo.
 * - **Sin `alElegir` es el REGISTRO de una pregunta ya contestada**: la pregunta, sus opciones y
 *   lo que se contestó, sin controles. El texto repetido del mensaje se quita al pintar
 *   (`textoDeConsulta.ts`), así que esta tarjeta es donde la pregunta sigue constando.
 *
 * Lo pendiente lo decide el HILO (`consultaPendiente.ts`), no este componente: por eso vuelve al
 * reabrir una sesión que se quedó esperando.
 */
export function ConsultaDelAgente({
  pregunta,
  opciones,
  alElegir,
  respondida,
}: {
  pregunta: string;
  opciones: readonly string[];
  /** Se ESPERA: dar la pregunta por contestada con el envío fallido dejaría creer que se contestó.
   *  Ausente = ya no se puede contestar aquí (contestada, o sin cable). */
  alElegir?: (opcion: string) => void | Promise<unknown>;
  /** Lo que se contestó, si consta: el mensaje de la persona que vino detrás. */
  respondida?: string;
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
  const nombreDelGrupo = useId();

  if (alElegir === undefined) {
    const elegida = respondida === undefined ? -1 : opciones.indexOf(respondida.trim());
    return (
      <section className={estilos.tarjeta} aria-label={`Pregunta del agente: ${pregunta}`}>
        <p className={estilos.cabecera}>
          <span aria-hidden="true" className={estilos.marca}>
            ?
          </span>
          {respondida === undefined ? "Pregunta del agente" : "Pregunta del agente · contestada"}
        </p>
        <p className={estilos.enunciado}>{pregunta}</p>
        <ul className={estilos.registro}>
          {opciones.map((opcion, i) => (
            <li key={i} data-elegida={i === elegida ? "" : undefined}>
              {opcion}
            </li>
          ))}
        </ul>
        {respondida !== undefined && elegida === -1 ? (
          <p className={estilos.respuestaPropia}>{`Contestaste: ${respondida}`}</p>
        ) : null}
      </section>
    );
  }

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

  return (
    <section className={estilos.tarjeta} aria-label={pregunta}>
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
        {/* La respuesta LIBRE, que es la otra mitad de lo que la tool ofrece. Escribir en el
            campo la elige: nadie escribe una respuesta para mandar otra. */}
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
        <Button type="button" className={coraza.accion} disabled={enviando || respuesta === ""} onClick={responder}>
          {enviando ? "Enviando…" : "Responder"}
        </Button>
      </div>
      {falloDeEnvio ? (
        <p className={coraza.fallo} role="alert">
          La respuesta no llegó a xonecode: el envío falló. Vuelve a pulsar «Responder» cuando la conexión se recupere.
        </p>
      ) : null}
    </section>
  );
}
