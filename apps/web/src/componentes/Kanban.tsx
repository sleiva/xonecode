import { useState } from "react";
import type { TareaDelCable } from "../tipos.js";
import estilos from "./Kanban.module.css";

/**
 * El dashboard de tareas: cuatro columnas, una por estado.
 *
 * Vive en el ESCRITORIO y no en una sesión: las tareas son de la aplicación —de la máquina,
 * en realidad— igual que «Tu equipo». Y por eso mismo hay que decir cuándo este proceso NO
 * las ejecuta: se ve igual en dos ventanas y solo avanza en una.
 *
 * **Sin barra de progreso, a propósito.** Un turno no sabe cuánto le queda, y una barra que
 * avanza sola es la mentira con forma de dato que este repo evita en todas partes. Lo que se
 * enseña es desde cuándo corre.
 *
 * **La columna de `requiere-atencion` se rotula «Esperando feedback», y NO lleva diff ni
 * botón de aprobar.** Una tarea en background APLICA sus escrituras —la autorización es el
 * acto de crearla, no un modal por fichero (`docs/superpowers/…/design.md`, §0)—, así que
 * el diff ya no es el momento en que alguien decide: es una tarjeta cuyo único final posible
 * sería un rechazo, y eso enseña a aprobar sin mirar. Lo que SÍ dice, porque nadie lo
 * aprobó, es lo que la tarea AUTORIZÓ escribir (`t.autorizadas`, nunca «lo que escribió»: una
 * ruta que las guardas de sitio rechazan sale ahí sin haberse escrito) y el enlace a su
 * Revisión, que es donde vive la verdad sobre el disco.
 */
const COLUMNAS: readonly { estado: TareaDelCable["estado"]; etiqueta: string }[] = [
  { estado: "nuevo", etiqueta: "Nuevo" },
  { estado: "en-proceso", etiqueta: "En proceso" },
  // El identificador del enum no se toca —está en disco, en el cable y en el store—; lo que
  // cambió es lo que SIGNIFICA: ya no es donde cae toda escritura, es donde cae una decisión
  // que el desarrollador tiene que tomar de verdad.
  { estado: "requiere-atencion", etiqueta: "Esperando feedback" },
  { estado: "terminada", etiqueta: "Terminada" },
];

/** Lo único que se sabe del tiempo: cuándo empezó o cuándo se creó. Nunca cuánto queda. */
function cuando(t: TareaDelCable): string {
  const iso = t.empezada ?? t.creada;
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return iso;
  return fecha.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function Kanban({
  cola,
  alAbrirSesion,
  alAbrirRevision,
  alEnviarFeedback,
  proyectoActivo,
}: {
  cola: { lista: readonly TareaDelCable[]; concurrencia: number; corriendoAqui: boolean };
  /** Abrir la conversación de una tarea: es cómo se atiende. Ausente = no se ofrece. */
  alAbrirSesion?: (proyecto: string, sesion: string) => void;
  /** Abrir su pestaña Revisión: es la única forma de mirar lo que de verdad cambió en el
   *  disco, sin aprobación previa de por medio. Ausente = no se ofrece. */
  alAbrirRevision?: (proyecto: string, sesion: string) => void;
  /**
   * Añadir feedback a una tarea «esperando feedback»: es lo que la devuelve al lazo, en su
   * mismo hilo (§0 del diseño, `docs/superpowers/…/design.md`). Ausente = no se ofrece —el
   * mismo trato que `alAbrirSesion`—, y entonces la tarjeta se queda con la pista de texto
   * de siempre en vez de un campo que no llevaría a ninguna parte.
   */
  alEnviarFeedback?: (id: string, texto: string) => void;
  /**
   * El proyecto cuya consola HUMANA está abierta ahora mismo (`estado.alta.proyectoActivo`,
   * la misma raíz que `bloqueados()` mira en `arranque.ts#construirCorredorDeTareasCableado`
   * para decidir qué NO arranca). Una tarea `nuevo` de ESTE proyecto no gasta hueco de
   * concurrencia y no avanza mientras dure — «gana la persona» — y sin decirlo se lee como
   * un cuelgue: se queda quieta en la primera columna sin que nada lo explique.
   */
  proyectoActivo?: string;
}) {
  if (cola.lista.length === 0) {
    return (
      <section className={estilos.kanban} aria-label="Tareas en background">
        <h2 className={estilos.titulo}>Tareas</h2>
        <p className={estilos.vacio}>Ninguna tarea todavía. Se crean desde un proyecto, y se ejecutan solas.</p>
      </section>
    );
  }
  return (
    <section className={estilos.kanban} aria-label="Tareas en background">
      <h2 className={estilos.titulo}>Tareas</h2>
      {cola.corriendoAqui ? null : (
        <p className={estilos.aviso} role="note">
          Las tareas las ejecuta otro proceso: aquí se ven, pero este kanban no avanza —
          ábrelo desde el proceso que las corre para verlas moverse.
        </p>
      )}
      <div className={estilos.columnas}>
        {COLUMNAS.map((c) => {
          const suyas = cola.lista.filter((t) => t.estado === c.estado);
          return (
            <div key={c.estado} className={estilos.columna}>
              <h3 className={estilos.encabezado}>
                {c.etiqueta} <span className={estilos.cuenta}>{suyas.length}</span>
              </h3>
              <ul className={estilos.tarjetas}>
                {suyas.map((t) =>
                  c.estado === "requiere-atencion" ? (
                    <TarjetaDeAtencion
                      key={t.id}
                      tarea={t}
                      alAbrirSesion={alAbrirSesion}
                      alAbrirRevision={alAbrirRevision}
                      alEnviarFeedback={alEnviarFeedback}
                    />
                  ) : (
                    <TarjetaSimple
                      key={t.id}
                      tarea={t}
                      alAbrirSesion={alAbrirSesion}
                      // Solo tiene sentido decirlo de una `nuevo` —«en-proceso» ya corre y
                      // «terminada» ya acabó— y solo si ESTE kanban es el que ejecuta: en el
                      // segundo proceso el aviso global de arriba ya cubre por qué nada
                      // avanza, y el proyecto abierto de ESTA ventana no es lo que bloquea al
                      // corredor de la otra.
                      bloqueadaPorProyectoAbierto={
                        cola.corriendoAqui && t.estado === "nuevo" && proyectoActivo !== undefined && t.proyecto === proyectoActivo
                      }
                    />
                  )
                )}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** Nuevo, en proceso y terminada: proyecto, título y tiempo, y nada más que decidir. */
function TarjetaSimple({
  tarea: t,
  alAbrirSesion,
  bloqueadaPorProyectoAbierto,
}: {
  tarea: TareaDelCable;
  alAbrirSesion?: (proyecto: string, sesion: string) => void;
  bloqueadaPorProyectoAbierto?: boolean;
}) {
  const cuerpo = (
    <>
      <span className={estilos.proyecto}>{t.proyectoNombre}</span>
      <span className={estilos.tituloDeTarea}>{t.titulo}</span>
      <span className={estilos.cuando}>{cuando(t)}</span>
      {bloqueadaPorProyectoAbierto === true ? (
        <span className={estilos.bloqueada}>
          Esperando a que se cierre el proyecto: mientras alguien lo tenga abierto, gana la persona.
        </span>
      ) : null}
    </>
  );
  // Sin sesión no hay nada que abrir —la tarea no ha corrido— y un botón que no lleva a
  // ninguna parte es el botón muerto de siempre.
  return t.sesion !== undefined && alAbrirSesion !== undefined ? (
    <li>
      <button type="button" className={estilos.tarjeta} onClick={() => alAbrirSesion(t.proyecto, t.sesion!)}>
        {cuerpo}
      </button>
    </li>
  ) : (
    <li>
      <div className={estilos.tarjeta}>{cuerpo}</div>
    </li>
  );
}

/**
 * «Esperando feedback»: el motivo, lo que se autorizó a escribir y el enlace a Revisión.
 *
 * NO es un botón envolviendo todo lo demás —a diferencia de `TarjetaSimple`— porque «abrir
 * conversación» y «abrir Revisión» son dos acciones distintas y un botón dentro de otro
 * botón es HTML inválido: el título es su propio control, separado del enlace a Revisión.
 */
function TarjetaDeAtencion({
  tarea: t,
  alAbrirSesion,
  alAbrirRevision,
  alEnviarFeedback,
}: {
  tarea: TareaDelCable;
  alAbrirSesion?: (proyecto: string, sesion: string) => void;
  alAbrirRevision?: (proyecto: string, sesion: string) => void;
  alEnviarFeedback?: (id: string, texto: string) => void;
}) {
  return (
    <li>
      <div className={estilos.tarjeta} data-atencion="">
        <span className={estilos.proyecto}>{t.proyectoNombre}</span>
        {t.sesion !== undefined && alAbrirSesion !== undefined ? (
          <button type="button" className={estilos.tituloBoton} onClick={() => alAbrirSesion(t.proyecto, t.sesion!)}>
            {t.titulo}
          </button>
        ) : (
          <span className={estilos.tituloDeTarea}>{t.titulo}</span>
        )}
        <span className={estilos.cuando}>{cuando(t)}</span>

        {/* El motivo: lo único accionable de esta columna hasta que exista un botón real
            de feedback (Task 12). Sin abrir nada. */}
        {t.motivo === undefined ? null : <p className={estilos.motivo}>{t.motivo}</p>}

        {/* Lo que la tarea AUTORIZÓ, nunca «lo que escribió»: una ruta que las guardas de
            sitio rechazan sale aquí sin haberse escrito. Ausente = no consta (no llegó a
            correr un turno); `[]` = corrió y no autorizó ninguna — las dos cosas son
            distintas y no se pueden confundir. */}
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

        {/* «Se edita la tarea y se agrega el feedback del usuario» (§0 del diseño): sin
            modal, es una frase y no una decisión con diff. Ausente `alEnviarFeedback` cae a
            la pista de texto de siempre — no se pinta un campo que no llevaría a
            ninguna parte. */}
        {alEnviarFeedback === undefined ? (
          <p className={estilos.pista}>Se resuelve editando la tarea para añadir tu feedback: sigue desde ahí.</p>
        ) : (
          <FormularioDeFeedback id={t.id} alEnviar={alEnviarFeedback} />
        )}

        {t.sesion !== undefined && alAbrirRevision !== undefined ? (
          <button
            type="button"
            className={estilos.enlaceRevision}
            onClick={() => alAbrirRevision(t.proyecto, t.sesion!)}
          >
            Ver qué cambió, en Revisión
          </button>
        ) : null}
      </div>
    </li>
  );
}

/**
 * El campo de feedback: una frase, no una decisión con diff — por eso es un `<textarea>` y
 * un botón, sin modal.
 *
 * **El vacío se rechaza AQUÍ TAMBIÉN**, y no solo en el servidor: `aplicarFeedback`
 * (`agent/tareasEnDisco.ts`) ya lo rechaza y lo dice, pero mandarlo igual y esperar a que el
 * servidor lo diga por un acto de sistema —en una ventana que no pinta el transcript— sería
 * mudo. El botón deshabilitado es la respuesta inmediata; el servidor sigue siendo la
 * autoridad, que es lo mismo que ya hace el paso de cuenta con el catálogo de modelos.
 */
function FormularioDeFeedback({ id, alEnviar }: { id: string; alEnviar: (id: string, texto: string) => void }) {
  const [texto, setTexto] = useState("");
  const limpio = texto.trim();
  return (
    <form
      className={estilos.feedback}
      onSubmit={(evento) => {
        evento.preventDefault();
        if (limpio === "") return;
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
        onChange={(evento) => setTexto(evento.target.value)}
        placeholder="Se manda al agente en el mismo hilo…"
      />
      <button type="submit" className={estilos.botonFeedback} disabled={limpio === ""}>
        Enviar feedback
      </button>
    </form>
  );
}
