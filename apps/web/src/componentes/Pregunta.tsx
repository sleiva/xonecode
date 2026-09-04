import { useEffect, useRef, useState, type FormEvent } from "react";
import { Input, Button } from "@deepseek-ai/dsh-client-ui-primitives";
import estilos from "./Pregunta.module.css";

/**
 * La pregunta de texto libre y la de un secreto: el `consola.preguntar` y el
 * `consola.leerSecreto` del servidor, con un sitio donde contestarlos.
 *
 * Sin esto no había ninguno. El compositor manda TODO como `{clase:"prosa"}`, que entra
 * por la cola de líneas del lazo (`consolaWeb.ts#recibir`), así que una pregunta no se
 * resolvía **ni acertando el texto**: el usuario tecleaba «s», el turno seguía esperando y
 * la «s» se quedaba en la cola como si fuera la petición siguiente. Lo que se manda desde
 * aquí es `{clase:"respuesta"}` (o `{clase:"secreto"}`), que es lo único que despierta a la
 * cola correspondiente.
 *
 * Los comandos que caen aquí hoy: el `[s/N]` que `politicaInteractiva` pone delante de una
 * subida a CloudStudio, `/connect-studio` sin URL, y —por la vía del secreto—
 * `/provider <x>` y el paso de cuenta del alta.
 *
 * **Es UN componente y no dos.** La única diferencia entre las dos preguntas es que el
 * secreto no se enseña, y eso son dos atributos del `<input>`; el mensaje que se manda lo
 * decide quien lo monta, que es donde vive el cable. Dos componentes serían dos sitios
 * donde arreglar el mismo fallo de envío.
 *
 * **El secreto no entra en el estado del cliente**: vive en el `useState` de aquí y sale
 * por `alResponder`. `consolaWeb.ts#leerSecreto` solo anota la PREGUNTA en el transcript, y
 * este componente es el otro extremo de ese trato.
 *
 * Contestar en blanco es una respuesta legítima y no un fallo: es exactamente lo que
 * contesta un readline cerrado, y aguas abajo `interpretAnswer` lo trata como un «no».
 */
export function Pregunta({
  texto,
  oculta = false,
  alResponder,
}: {
  texto: string;
  /** La forma `leerSecreto`: campo de contraseña y sin autocompletado del navegador. */
  oculta?: boolean;
  /**
   * Devuelve una promesa si el envío es asíncrono —lo es: es un `POST`—. Se ESPERA antes de
   * dar la respuesta por entregada: retirar la pregunta con el envío fallido dejaría al
   * usuario creyendo que contestó, mientras el servidor sigue esperando hasta su plazo.
   */
  alResponder: (respuesta: string) => void | Promise<unknown>;
}) {
  const [valor, setValor] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [falloDeEnvio, setFalloDeEnvio] = useState(false);
  const montado = useRef(true);

  // Se pone a `true` en el montaje además de a `false` en la limpieza: `<StrictMode>` monta,
  // desmonta y vuelve a montar en desarrollo, y sin el `true` del montaje el componente se
  // quedaría marcado como desmontado para siempre.
  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);

  const responder = (evento: FormEvent): void => {
    evento.preventDefault();
    // Un segundo envío mientras el primero vuela sacaría DOS resolutores de la cola FIFO
    // del servidor: el segundo se comería la respuesta de la pregunta siguiente.
    if (enviando) return;
    setEnviando(true);
    setFalloDeEnvio(false);
    void Promise.resolve(alResponder(valor)).catch(() => {
      if (!montado.current) return;
      setEnviando(false);
      setFalloDeEnvio(true);
    });
  };

  const id = oculta ? "pregunta-secreto" : "pregunta-respuesta";

  return (
    <form className={estilos.pregunta} onSubmit={responder}>
      <label className={estilos.enunciado} htmlFor={id}>
        {texto}
      </label>
      <div className={estilos.fila}>
        <Input
          id={id}
          className={estilos.envoltorio}
          autoFocus
          type={oculta ? "password" : "text"}
          autoComplete={oculta ? "off" : undefined}
          value={valor}
          onChange={(evento) => setValor(evento.target.value)}
        />
        <Button type="submit" variant="primary" className={estilos.accion} disabled={enviando}>
          Responder
        </Button>
      </div>
      {falloDeEnvio ? (
        <p className={estilos.fallo} role="alert">
          La respuesta no llegó a xonecode: el envío falló. Vuelve a enviarla cuando la
          conexión se recupere.
        </p>
      ) : null}
    </form>
  );
}
