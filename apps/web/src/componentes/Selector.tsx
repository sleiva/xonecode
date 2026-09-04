import { useEffect, useRef, useState } from "react";
import { Button } from "@deepseek-ai/dsh-client-ui-primitives";
import estilos from "./Selector.module.css";

/**
 * El `consola.seleccionar` del servidor: elegir una de varias opciones.
 *
 * Es la tercera espera de humano que no tenía interfaz, y la más alcanzable de las tres:
 * `/modelos` (`cli/consola.ts:546`), `/themes` (`:630`) y `/provider <x>` (`:1025`) caen
 * aquí, y los tres están en el registro `COMANDOS` que el servidor manda por el cable para
 * que el compositor los sugiera. Sin este componente, teclear `/modelos` colgaba la sesión
 * web hasta el plazo.
 *
 * **No hay botón de cancelar**, y es a propósito: cancelar es `undefined` en el servidor y
 * el cable solo sabe llevar `{clase:"eleccion", id}` — mandar una cadena vacía sería un id
 * que no existe, no una cancelación, y quien llamó lo trataría como una elección. Quien
 * abandone se topa con el plazo, que sí responde `undefined`.
 */
export function Selector({
  titulo,
  opciones,
  alElegir,
}: {
  titulo: string;
  opciones: readonly { id: string; etiqueta: string; detalle?: string }[];
  /**
   * Devuelve una promesa si el envío es asíncrono —lo es—. Se ESPERA: retirar el selector
   * con el envío fallido dejaría al usuario creyendo que eligió.
   */
  alElegir: (id: string) => void | Promise<unknown>;
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

  const elegir = (id: string): void => {
    // Dos elecciones en vuelo sacarían DOS resolutores de la cola FIFO del servidor, y la
    // segunda se comería la respuesta del selector siguiente.
    if (enviando) return;
    setEnviando(true);
    setFalloDeEnvio(false);
    void Promise.resolve(alElegir(id)).catch(() => {
      if (!montado.current) return;
      setEnviando(false);
      setFalloDeEnvio(true);
    });
  };

  return (
    <div className={estilos.selector} role="group" aria-label={titulo}>
      <p className={estilos.titulo}>{titulo}</p>
      <ul className={estilos.opciones}>
        {opciones.map((o) => (
          <li key={o.id}>
            <Button
              variant="outline"
              className={estilos.opcion}
              disabled={enviando}
              onClick={() => elegir(o.id)}
            >
              <span className={estilos.etiqueta}>{o.etiqueta}</span>
              {o.detalle !== undefined && o.detalle !== "" ? (
                <span className={estilos.detalle}>{o.detalle}</span>
              ) : null}
            </Button>
          </li>
        ))}
      </ul>
      {falloDeEnvio ? (
        <p className={estilos.fallo} role="alert">
          La elección no llegó a xonecode: el envío falló. Vuelve a elegir cuando la conexión
          se recupere.
        </p>
      ) : null}
    </div>
  );
}
