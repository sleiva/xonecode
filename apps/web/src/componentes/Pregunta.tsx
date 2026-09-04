import { useState, type FormEvent } from "react";
import { Input, Button } from "@deepseek-ai/dsh-client-ui-primitives";
import estilos from "./Pregunta.module.css";

/**
 * La pregunta de texto libre: el `consola.preguntar` del servidor, con un sitio donde
 * contestarla.
 *
 * Sin esto no había ninguno. El compositor manda TODO como `{clase:"prosa"}`, que entra
 * por la cola de líneas del lazo (`consolaWeb.ts#recibir`), así que una pregunta no se
 * resolvía **ni acertando el texto**: el usuario tecleaba «s», el turno seguía esperando y
 * la «s» se quedaba en la cola como si fuera la petición siguiente. Y como `preguntar` no
 * tenía plazo —`aprobacionesTui` sí lo tenía—, la sesión web se quedaba colgada ahí para
 * siempre. Lo que se manda desde aquí es `{clase:"respuesta"}`, que es lo único que
 * despierta a `esperandoTexto`.
 *
 * Los dos comandos que caen aquí hoy: el `[s/N]` que `politicaInteractiva` pone delante de
 * una subida a CloudStudio, y `/connect-studio` sin URL.
 *
 * Contestar en blanco es una respuesta legítima y no un fallo: es exactamente lo que
 * contesta un readline cerrado, y aguas abajo `interpretAnswer` lo trata como un «no».
 */
export function Pregunta({
  texto,
  alResponder,
}: {
  texto: string;
  alResponder: (respuesta: string) => void;
}) {
  const [valor, setValor] = useState("");

  const responder = (evento: FormEvent): void => {
    evento.preventDefault();
    alResponder(valor);
  };

  return (
    <form className={estilos.pregunta} onSubmit={responder}>
      <label className={estilos.enunciado} htmlFor="pregunta-respuesta">
        {texto}
      </label>
      <div className={estilos.fila}>
        <Input
          id="pregunta-respuesta"
          className={estilos.envoltorio}
          autoFocus
          value={valor}
          onChange={(evento) => setValor(evento.target.value)}
        />
        <Button type="submit" variant="primary" className={estilos.accion}>
          Responder
        </Button>
      </div>
    </form>
  );
}
