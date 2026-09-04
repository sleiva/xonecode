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
 * **Cancelar es una salida de primera clase**, como en el terminal —sus selectores
 * preguntan «número (Enter cancela)»—, y por eso hay botón Y tecla Escape. Sin ella, quien
 * abriera `/modelos` solo podría elegir algo o esperar a que venciera el plazo, y elegir un
 * modelo por no poder salirse es peor que no haber preguntado. Cancelar viaja por la MISMA
 * clase `eleccion`, sin `id`: el servidor lo traduce a `undefined` en un solo sitio y el
 * contrato del cable no crece. Una cadena vacía NO valdría — es un id que no existe, no una
 * cancelación.
 */
export function Selector({
  titulo,
  opciones,
  alElegir,
  anidado = false,
}: {
  titulo: string;
  opciones: readonly { id: string; etiqueta: string; detalle?: string }[];
  /**
   * `undefined` es CANCELAR. Es un solo manejador y no dos porque las dos salidas comparten
   * todo lo que importa —el candado de envío en vuelo, la espera y el aviso de fallo—, y
   * partirlas sería tener que acordarse de arreglar el mismo fallo dos veces.
   *
   * Devuelve una promesa si el envío es asíncrono —lo es—. Se ESPERA: retirar el selector
   * con el envío fallido dejaría al usuario creyendo que eligió.
   */
  alElegir: (id: string | undefined) => void | Promise<unknown>;
  /**
   * `true` cuando este selector vive DENTRO de `TarjetaDeAlta` (el paso de cuenta del
   * alta): quita el borde y el fondo propios —los pone la tarjeta— para que se lea como
   * el mismo marco y no como dos cajas concéntricas con una costura entre medias.
   * `false` (omisión) es mitad de conversación (`/modelos`, `/provider`, aprobaciones),
   * donde SÍ hace falta la tarjeta entera: flota solo sobre el transcript.
   */
  anidado?: boolean;
}) {
  const [enviando, setEnviando] = useState(false);
  const [falloDeEnvio, setFalloDeEnvio] = useState(false);
  const montado = useRef(true);
  // El `elegir` más reciente, para que el listener de Escape se registre UNA vez y no
  // dependa de un `enviando` que cambia: reregistrarlo en cada render es cómo se pierde una
  // pulsación entre el `removeEventListener` y el siguiente `add`.
  const cancelar = useRef<() => void>(() => {});

  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);

  const elegir = (id: string | undefined): void => {
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

  // Escape cancela, igual que el botón. El listener va en `document` como el de `Modal`:
  // aquí no hay foco que atrapar —son botones sueltos dentro del flujo de la página—, y una
  // tecla que solo funcionase con el foco puesto no sería una salida de verdad.
  useEffect(() => {
    const alPulsar = (evento: KeyboardEvent): void => {
      if (evento.key === "Escape") cancelar.current();
    };
    document.addEventListener("keydown", alPulsar);
    return () => document.removeEventListener("keydown", alPulsar);
  }, []);

  cancelar.current = () => elegir(undefined);

  return (
    <div className={estilos.selector} data-anidado={anidado ? "" : undefined} role="group" aria-label={titulo}>
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
      <div className={estilos.acciones}>
        <Button
          variant="outline"
          className={estilos.cancelar}
          disabled={enviando}
          onClick={() => elegir(undefined)}
        >
          Cancelar
        </Button>
      </div>
      {falloDeEnvio ? (
        <p className={estilos.fallo} role="alert">
          La elección no llegó a xonecode: el envío falló. Vuelve a elegir cuando la conexión
          se recupere.
        </p>
      ) : null}
    </div>
  );
}
