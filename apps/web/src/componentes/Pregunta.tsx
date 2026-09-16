import { Fragment, useEffect, useRef, useState, type FormEvent } from "react";
import { Input, Button } from "@deepseek-ai/dsh-client-ui-primitives";
import type { DecisionDeConsola } from "../tipos.js";
import estilos from "./Pregunta.module.css";

/*
 * Las dos caras de una decisión, tal como las lee `interpretAnswer` (`vendor/hitl.ts`): `"s"`
 * autoriza y CUALQUIER otra cosa rechaza. No es vocabulario de esta piel —`"n"` explícito en
 * vez de la cadena vacía porque aquí no hay campo del que salga vacío—, y por eso los botones
 * no inventan nada: mandan las dos respuestas que el servidor ya sabe interpretar.
 */
const SI = "s";
const NO = "n";

/**
 * La pregunta de texto libre, la del secreto y la de una DECISIÓN: el `consola.preguntar`
 * y el `consola.leerSecreto` del servidor, con un sitio donde contestarlos.
 *
 * Sin esto no había ninguno. El compositor manda TODO como `{clase:"prosa"}`, que entra
 * por la cola de líneas del lazo (`consolaWeb.ts#recibir`), así que una pregunta no se
 * resolvía **ni acertando el texto**: el usuario tecleaba «s», el turno seguía esperando y
 * la «s» se quedaba en la cola como si fuera la petición siguiente. Lo que se manda desde
 * aquí es `{clase:"respuesta"}` (o `{clase:"secreto"}`), que es lo único que despierta a la
 * cola correspondiente.
 *
 * Los comandos que caen aquí hoy: la decisión de una subida a CloudStudio —el
 * «¿Subir a CloudStudio?» que `politicaInteractiva` formula sin pista de tecleo, porque en
 * el terminal esa pista la añade la piel que tiene el teclado—, `/connect-studio` sin URL,
 * y —por la vía del secreto— `/provider <x>` y el paso de cuenta del alta.
 *
 * **Es UN componente y no tres.** La diferencia entre las dos preguntas de texto es que el
 * secreto no se enseña, y eso son dos atributos del `<input>`; la tercera no se contesta
 * escribiendo, y eso es `decision`. El mensaje que se manda lo decide quien lo monta, que
 * es donde vive el cable. Tres componentes serían tres sitios donde arreglar el mismo fallo
 * de envío.
 *
 * **Y la decisión se DICE, no se adivina** (`DecisionDeConsola`): con `decision` puesta la
 * tarjeta enseña el plan —lo que se va a subir, que es lo que hace falta tener delante para
 * contestar— y ofrece Aceptar/Cancelar sin campo de texto. Leer el `[s/N]` del enunciado
 * para decidir esto era la otra forma, y es peor por lo mismo que en todas partes: es
 * SINTAXIS, y el día que el prompt se reescriba la tarjeta ofrecería un editor para una
 * decisión —o dos botones sobre una pregunta abierta— sin un solo error que lo delate. Por
 * eso el enunciado llega sin la pista: aquí no hay nada que teclear, y enseñar «[s/N]»
 * delante de dos botones manda a escribir donde no hay dónde.
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
  anidado = false,
  decision,
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
  /**
   * `true` dentro de `TarjetaDeAlta` (la clave de API del paso de cuenta): sin borde ni
   * fondo propio, para no anidar dos cajas iguales — ver `Selector.tsx`, mismo motivo y
   * mismo nombre de prop. `false` (omisión) es mitad de conversación, donde sí hace
   * falta la tarjeta entera.
   */
  anidado?: boolean;
  /**
   * La FORMA de la respuesta, cuando es sí o no. Presente, la tarjeta no tiene campo: pinta
   * `lineas` y dos botones. Ausente, pregunta de texto libre, que es lo de siempre.
   */
  decision?: DecisionDeConsola;
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

  /**
   * El envío, común a las tres formas: un segundo envío mientras el primero vuela sacaría
   * DOS resolutores de la cola FIFO del servidor, y el segundo se comería la respuesta de
   * la pregunta siguiente.
   */
  const responder = (respuesta: string): void => {
    if (enviando) return;
    setEnviando(true);
    setFalloDeEnvio(false);
    void Promise.resolve(alResponder(respuesta)).catch(() => {
      if (!montado.current) return;
      setEnviando(false);
      setFalloDeEnvio(true);
    });
  };

  const fallo = falloDeEnvio ? (
    <p className={estilos.fallo} role="alert">
      La respuesta no llegó a xonecode: el envío falló. Vuelve a enviarla cuando la
      conexión se recupere.
    </p>
  ) : null;

  if (decision !== undefined) {
    // El enunciado va ARRIBA y como título, con el plan debajo: la tarjeta se lee como un
    // aviso —qué se pregunta, y qué se decide— y no como un formulario, donde el rótulo se
    // pega a su campo. Y no lleva `<form>`: sin campo no hay envío por Enter, y **eso es
    // deliberado** — en el terminal el Enter a secas tampoco aprueba esta pregunta.
    //
    // Las líneas van en un `<pre>` —el plan se lee en columna, signo y ruta, y ahí los
    // espacios cuentan— pero **una por `<span>`**, cada una con su `data-cambio`: es lo que
    // permite colorear lo que se añade y lo que se borra. El `cambio` viaja como DATO; leer
    // el `+`/`~`/`-` del texto sería leer sintaxis, y el día que cambie la sangría un
    // borrado saldría en verde sin que nada avise. Los saltos de línea van como nodos de
    // texto entre los `span`, así que el contenido del `<pre>` sigue siendo el plan entero,
    // carácter a carácter, igual que antes de partirlo.
    //
    // Se acota su alto con scroll en vez de empujar los botones fuera de la tarjeta: lo
    // único que no puede quedarse sin ver es la acción.
    return (
      <div className={estilos.pregunta} data-anidado={anidado ? "" : undefined}>
        <p className={estilos.titulo}>{texto}</p>
        <pre className={estilos.plan}>
          {decision.lineas.map((linea, i) => (
            <Fragment key={i}>
              {i > 0 ? "\n" : null}
              <span data-cambio={linea.cambio}>{linea.texto}</span>
            </Fragment>
          ))}
        </pre>
        <div className={estilos.decisiones}>
          <Button
            type="button"
            variant="primary"
            className={estilos.accion}
            disabled={enviando}
            onClick={() => responder(SI)}
          >
            Aceptar
          </Button>
          <Button
            type="button"
            variant="outline"
            className={estilos.cancelar}
            disabled={enviando}
            onClick={() => responder(NO)}
          >
            Cancelar
          </Button>
        </div>
        {fallo}
      </div>
    );
  }

  const id = oculta ? "pregunta-secreto" : "pregunta-respuesta";

  return (
    <form
      className={estilos.pregunta}
      data-anidado={anidado ? "" : undefined}
      onSubmit={(evento: FormEvent) => {
        evento.preventDefault();
        responder(valor);
      }}
    >
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
        {/*
          Relleno cuando la pregunta flota sola sobre el transcript —ahí es LA acción de la
          pantalla— y de contorno cuando va anidada dentro de una fila de ajustes, donde
          tiene al lado a «Cambiar clave» y «Eliminar»: un botón relleno entre dos de
          contorno se lee como si fuera otra cosa, y desde el rediseño el relleno primario
          es casi blanco en oscuro, que sobre la fila cantaba todavía más.
        */}
        <Button
          type="submit"
          variant={anidado ? "outline" : "primary"}
          className={estilos.accion}
          disabled={enviando}
        >
          Aceptar
        </Button>
      </div>
      {fallo}
    </form>
  );
}
