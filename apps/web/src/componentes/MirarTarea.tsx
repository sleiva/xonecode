import type { Acto, TareaDelCable } from "../tipos.js";
import { EntregaDeTarea } from "./EntregaDeTarea.js";
import estilos from "./MirarTarea.module.css";

/**
 * El despliegue de «lo que hace» una tarea de fondo, EN VIVO — dentro de SU fila, no como
 * bloque suelto del escritorio (Task 17).
 *
 * **De dónde sale.** La Task 16 la puso como sección hermana debajo del kanban
 * (`Escritorio.tsx`), con un argumento defendible —«se lee mientras se ve el resto de la
 * cola»— que resolvía el problema equivocado: el escritorio es la vista de conjunto de la
 * máquina, y una consola de una sola tarea ahí compite con todo lo demás. Desplegar en la
 * propia fila consigue las dos cosas: sigue sin ser un modal, sigue leyéndose junto a la
 * cola, y deja de ser un bloque del escritorio. Por eso esta pieza pasa a ser la ÚNICA
 * responsable del botón (con `aria-expanded`) y del cuerpo del detalle: `Kanban.tsx` y
 * `TareasDelProyecto.tsx` la montan igual, así que las tres condiciones de quién puede
 * mirar y cuándo viven aquí y no se repiten en cada llamador — dos copias es cómo divergen.
 *
 * **Quién puede mirar y cuándo NO cambia de la Task 16**: `en-proceso`, `corriendoAqui` y
 * cable vivo. Sin las tres, y sin estar ya expandida, no hay nada que ofrecer.
 *
 * **Expandida se queda expandida aunque la tarea deje de cumplir esas tres condiciones**
 * (decisión que ya tenía `MirarTarea` con `corre`): el panel se queda abierto cuando la
 * tarea acaba, o queda aparcada, mientras se está mirando — cerrarlo de golpe tiraría lo
 * último que se estaba leyendo. El botón para plegar sigue ahí en los dos casos.
 *
 * **Es de SOLO lectura, que es una decisión y no un hueco.** No hay compositor: esa consola
 * es de la tarea, y darle a alguien una caja de texto ahí prometería una conversación que
 * el turno no va a leer. Para intervenir está aparcar con feedback, en la propia tarjeta.
 *
 * **El detalle sirve además para lo que la fila no puede enseñar**: el motivo ENTERO, lo
 * que la tarea autorizó a escribir sin aprobación, y el veredicto del juez cuando lo haya —
 * los tres ya viajan por el cable en `TareaDelCable` y antes solo se pintaban en la
 * tarjeta de «esperando feedback» (`Kanban.tsx#TarjetaDeAtencion`); una `en-proceso` no
 * tenía dónde enseñarlos.
 */
export function MirarTarea({
  tarea: t,
  corriendoAqui,
  conectado,
  mirando,
  mirada,
  alMirar,
  alDejarDeMirar,
}: {
  tarea: TareaDelCable;
  /** Si ESTE proceso ejecuta las tareas. Ausente = no se sabe, y entonces no se ofrece
   *  abrir — el mismo trato que `conectado` ausente en las demás piezas de tarea. */
  corriendoAqui?: boolean;
  /** Si el cable está vivo. Ausente = se asume conectado. */
  conectado?: boolean;
  /** El id de la tarea que se está mirando ahora, si alguna. */
  mirando?: string;
  /** El transcript que el servidor está mandando de la tarea mirada. Ausente o de OTRA
   *  tarea = todavía no ha pintado nada de ESTA. */
  mirada?: { tarea: string; actos: readonly Acto[] };
  /** Empezar a mirar. Ausente = no se ofrece. */
  alMirar?: (id: string) => void;
  /** Dejar de mirar: pliega Y desengancha ese mirón, sin afectar a los demás. Ausente = no
   *  se ofrece plegar (y por tanto tampoco abrir: un botón que no se puede cerrar no se
   *  abre). */
  alDejarDeMirar?: (id: string) => void;
}) {
  const expandida = mirando === t.id;
  const puedeAbrir =
    alMirar !== undefined &&
    alDejarDeMirar !== undefined &&
    t.estado === "en-proceso" &&
    corriendoAqui === true &&
    conectado !== false;
  if (!expandida && !puedeAbrir) return null;

  return (
    <div className={estilos.envoltura}>
      <button
        type="button"
        className={estilos.boton}
        aria-expanded={expandida}
        onClick={() => (expandida ? alDejarDeMirar!(t.id) : alMirar!(t.id))}
      >
        {expandida ? "Dejar de ver lo que hace" : "Ver lo que hace"}
      </button>
      {expandida ? <Detalle tarea={t} corriendoAqui={corriendoAqui} mirada={mirada} /> : null}
    </div>
  );
}

function Detalle({
  tarea: t,
  corriendoAqui,
  mirada,
}: {
  tarea: TareaDelCable;
  corriendoAqui?: boolean;
  mirada?: { tarea: string; actos: readonly Acto[] };
}) {
  const actos = mirada?.tarea === t.id ? mirada.actos : [];
  // Con qué frase se lee un panel vacío: `corre` es «esta tarea sigue en-proceso Y este
  // proceso la ejecuta» — las mismas dos condiciones que ofrecen el botón para ABRIRLA,
  // recalculadas aquí porque el detalle puede seguir expandido después de que dejen de
  // valer (ver docblock del componente).
  const corre = t.estado === "en-proceso" && corriendoAqui === true;
  return (
    <div className={estilos.panel} aria-label={`Lo que hace: ${t.titulo}`}>
      <p className={estilos.nota}>
        Es <strong>su conversación</strong>, la misma que se lee al abrir la sesión cuando
        acabe — no un registro aparte. De <strong>solo lectura</strong>: para intervenir,
        contéstale con el feedback de su tarjeta cuando la tarea lo pida.
      </p>
      {/* Ausente = no consta ningún motivo; nunca se inventa uno para rellenar el hueco. */}
      {t.motivo === undefined ? null : <p className={estilos.motivo}>{t.motivo}</p>}
      {/* Lo que la tarea AUTORIZÓ, nunca «lo que escribió»: ver `Kanban.tsx#TarjetaDeAtencion`,
          de donde sale este bloque. Ausente = no consta (no llegó a correr un turno); `[]` =
          corrió y no autorizó ninguna — las dos cosas son distintas. */}
      {t.autorizadas === undefined ? null : t.autorizadas.length === 0 ? (
        <p className={estilos.ficheros}>No autorizó ninguna escritura sin aprobación.</p>
      ) : (
        <div className={estilos.ficheros}>
          <p>Autorizó escribir sin aprobación ({t.autorizadas.length}):</p>
          <ul className={estilos.listaDeFicheros}>
            {t.autorizadas.map((f) => (
              <li key={f}>
                <code>{f}</code>
              </li>
            ))}
          </ul>
        </div>
      )}
      {/* El veredicto del juez, cuando lo haya: la misma pieza que pinta el kanban y la
          lista, para que no puedan afirmar cosas distintas de la misma tarea. */}
      <EntregaDeTarea tarea={t} />
      {actos.length === 0 ? (
        // Dos frases y no una: ver `corre`. Distinto de «se ha colgado» en el primer caso, y
        // distinto de «no ha empezado» en el segundo.
        <p className={estilos.vacio}>
          {corre
            ? "Todavía no ha pintado nada. En cuanto empiece, aparecerá aquí."
            : "Esta tarea ya no corre aquí. Lo que hizo está en su conversación: pulsa su título en la tarjeta para abrirla."}
        </p>
      ) : (
        <ul className={estilos.transcript}>
          {actos.map((acto, indice) => (
            // El índice como clave: los actos no tienen id y esta lista solo crece por el
            // final o sustituye su último elemento (`store.ts`, el `case "mirada"`).
            <li key={indice}>
              <Linea acto={acto} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Linea({ acto }: { acto: Acto }) {
  switch (acto.tipo) {
    case "usuario":
      return <p className={estilos.usuario}>{acto.texto}</p>;
    case "asistente":
      return <p className={estilos.asistente}>{acto.texto}</p>;
    case "razonamiento":
      // Plegado, como en el chat: puede ser larguísimo y no es la respuesta. `<details>`
      // nativo, sin una línea de JavaScript.
      return (
        <details className={estilos.razonamiento}>
          <summary>Razonamiento</summary>
          <p className={estilos.razonamientoTexto}>{acto.texto}</p>
        </details>
      );
    case "herramientas":
      return (
        <p className={estilos.pulso}>
          {acto.lineas.join("\n")}
        </p>
      );
    case "fase":
      return <p className={estilos.pulso}>{acto.texto}</p>;
    case "sistema":
      // Los actos de sistema SE VEN, y esto es lo que más falta hace aquí: por ese canal
      // pasan el aviso de las escrituras que la tarea autorizó sin que nadie las aprobara y
      // el motivo con el que se aparca. Esconderlos en una pestaña de depuración es
      // exactamente el aviso que nadie lee.
      return <p className={estilos.sistema}>{acto.texto}</p>;
    case "error":
      return <p className={estilos.error}>{acto.texto}</p>;
    case "artefacto":
      // Nombre y peso, sin enlace: abrir un artefacto se hace desde la sesión, que es quien
      // resuelve la ruta (`GET /artefacto`). Prometerlo aquí sería un botón sin nada detrás.
      return (
        <p className={estilos.artefacto}>
          Artefacto: {acto.nombre} ({acto.bytes} B)
        </p>
      );
    case "fin":
      // El cierre del registro con su duración: un dato de la Trayectoria, no una línea de
      // conversación. Mismo criterio que el chat.
      return null;
  }
}
