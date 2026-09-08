import { useState } from "react";
import { TRANSICIONES, type TareaDelCable } from "../tipos.js";
import estilos from "./AccionesDeTarea.module.css";

/**
 * Las acciones de una tarea, UNA sola pieza para el kanban del escritorio
 * (`Kanban.tsx`) y la lista del proyecto (`TareasDelProyecto.tsx`).
 *
 * **De dónde sale.** Antes cada vista tenía su propia mitad: la lista ofrecía
 * `reintentar`/`terminar` y no feedback, el kanban ofrecía feedback y no
 * `reintentar`/`terminar` — así que una tarea bloqueada solo se desbloqueaba desde UNA de
 * las dos pantallas, y quien estuviera en la otra no tenía camino. No se arregla
 * duplicando las cuatro acciones en dos sitios —es como las dos copias divergieron la
 * primera vez—: se arregla con esta pieza, el mismo patrón que `Arbol.tsx` entre Ficheros
 * y Revisión.
 *
 * **Qué se ofrece, derivado de `TRANSICIONES` y no de lo que las pantallas hacían antes.**
 * `core/tareas.ts` es explícito: «las dos salidas de una tarea aparcada: reintentar, o
 * darla por buena a mano» — es decir, reintentar y terminar son manuales SOLO desde
 * `requiere-atencion`, porque el CORREDOR es dueño de las transiciones que salen de
 * `nuevo` y de `en-proceso` (arrancarla, acabarla solo). La comprobación contra
 * `TRANSICIONES["requiere-atencion"]` no es decoración: si esa tabla cambiara mañana, el
 * botón se apagaría solo en vez de quedarse ofreciendo una transición que `conEstado`
 * rechazaría. El feedback comparte la misma condición que reintentar porque
 * `core/tareas.ts#conFeedback` también deja la tarea en `nuevo`.
 *
 * **Descartar es la excepción**, y por diseño: «Descartar BORRA y no comprueba el
 * estado —no hay "cancelada" en `core/tareas.ts`— ni siquiera si está `en-proceso`»
 * (`web/servidor/arranque.ts#atenderAccionDeTarea`). Antes la lista lo restringía a
 * `estado !== "en-proceso"`, una regla que la propia pantalla se inventó y que el
 * servidor nunca aplicó: se retira aquí, porque un control que promete menos de lo que
 * el servidor de verdad hace es la misma mentira que uno que promete de más.
 *
 * **`conectado` apaga lo que manda algo al servidor y lo DICE**, la regla de `Barra` y
 * `Escritorio`: un botón vivo sin cable se pulsa, no pasa nada, y no hay forma de saber si
 * falló el botón o el servidor. El aviso vive dentro del propio grupo — no en cada
 * botón por separado, que sería el mismo aviso repetido cuatro veces sin decir nada
 * distinto cada vez.
 */
export function AccionesDeTarea({
  tarea: t,
  conectado,
  alReintentar,
  alDescartar,
  alTerminar,
  alEnviarFeedback,
}: {
  tarea: TareaDelCable;
  /** Si el cable está vivo. Ausente = se asume conectado — es lo que vale hoy para quien
   *  aún no lo sabe, y las dos vistas ya lo pasan de verdad desde `estado.conectado`. */
  conectado?: boolean;
  /** `requiere-atencion → nuevo`: devuelve una tarea aparcada a la cola. Ausente = no se
   *  ofrece. */
  alReintentar?: (id: string) => void;
  /** Borra la tarea. No comprueba el estado, a propósito. Ausente = no se ofrece. */
  alDescartar?: (id: string) => void;
  /** `requiere-atencion → terminada`: la persona da el trabajo por bueno sin reintentar.
   *  Ausente = no se ofrece. */
  alTerminar?: (id: string) => void;
  /** «Se edita la tarea y se agrega el feedback del usuario»: la devuelve al lazo, en su
   *  mismo hilo. Ausente = no se ofrece — la aparcada cae a la pista de siempre. */
  alEnviarFeedback?: (id: string, texto: string) => void;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const apagado = conectado === false;

  const destinos = TRANSICIONES[t.estado];
  const aparcada = t.estado === "requiere-atencion";
  const ofrecerReintentar = aparcada && destinos.includes("nuevo") && alReintentar !== undefined;
  const ofrecerTerminar = aparcada && destinos.includes("terminada") && alTerminar !== undefined;
  const ofrecerFeedback = aparcada && destinos.includes("nuevo") && alEnviarFeedback !== undefined;
  const pistaDeFeedback = aparcada && destinos.includes("nuevo") && alEnviarFeedback === undefined;
  const ofrecerDescartar = alDescartar !== undefined;

  if (!ofrecerReintentar && !ofrecerTerminar && !ofrecerFeedback && !pistaDeFeedback && !ofrecerDescartar) {
    return null;
  }

  return (
    <div className={estilos.acciones} role="group" aria-label="Acciones de la tarea">
      {apagado ? (
        <p className={estilos.avisoConexion}>Sin conexión: no se puede mandar nada hasta reconectar.</p>
      ) : null}
      {ofrecerReintentar ? (
        <button type="button" className={estilos.boton} disabled={apagado} onClick={() => alReintentar!(t.id)}>
          Reintentar
        </button>
      ) : null}
      {ofrecerTerminar ? (
        <button type="button" className={estilos.boton} disabled={apagado} onClick={() => alTerminar!(t.id)}>
          Dar por bueno
        </button>
      ) : null}
      {!ofrecerDescartar ? null : confirmando ? (
        <>
          <span className={estilos.avisoDescarte}>¿Borrar la tarea?</span>
          <button
            type="button"
            className={estilos.botonPeligro}
            disabled={apagado}
            onClick={() => {
              alDescartar!(t.id);
              setConfirmando(false);
            }}
          >
            Sí, descartar
          </button>
          {/* Cancelar no manda nada al servidor: no se apaga con el cable. */}
          <button type="button" className={estilos.boton} onClick={() => setConfirmando(false)}>
            Cancelar
          </button>
        </>
      ) : (
        <button type="button" className={estilos.boton} disabled={apagado} onClick={() => setConfirmando(true)}>
          Descartar
        </button>
      )}
      {ofrecerFeedback ? (
        <FormularioDeFeedback id={t.id} apagado={apagado} alEnviar={alEnviarFeedback!} />
      ) : pistaDeFeedback ? (
        <p className={estilos.pista}>Se resuelve editando la tarea para añadir tu feedback: sigue desde ahí.</p>
      ) : null}
    </div>
  );
}

/**
 * El campo de feedback: una frase, no una decisión con diff — por eso es un `<textarea>` y
 * un botón, sin modal (§0 del diseño).
 *
 * **El vacío se rechaza AQUÍ TAMBIÉN**, y no solo en el servidor: `aplicarFeedback`
 * (`agent/tareasEnDisco.ts`) ya lo rechaza y lo dice, pero mandarlo igual y esperar a que
 * el servidor lo diga por un acto de sistema —en una ventana que no pinta el
 * transcript— sería mudo.
 */
function FormularioDeFeedback({
  id,
  apagado,
  alEnviar,
}: {
  id: string;
  apagado: boolean;
  alEnviar: (id: string, texto: string) => void;
}) {
  const [texto, setTexto] = useState("");
  const limpio = texto.trim();
  return (
    <form
      className={estilos.feedback}
      onSubmit={(evento) => {
        evento.preventDefault();
        if (limpio === "" || apagado) return;
        alEnviar(id, limpio);
        setTexto("");
      }}
    >
      <label className={estilos.etiquetaFeedback} htmlFor={`feedback-${id}`}>
        Tu feedback
      </label>
      <textarea
        id={`feedback-${id}`}
        className={estilos.campoFeedback}
        rows={2}
        value={texto}
        disabled={apagado}
        onChange={(evento) => setTexto(evento.target.value)}
        placeholder="Se manda al agente en el mismo hilo…"
      />
      <button type="submit" className={estilos.botonFeedback} disabled={limpio === "" || apagado}>
        Enviar feedback
      </button>
    </form>
  );
}
