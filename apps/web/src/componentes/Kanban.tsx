import type { TareaDelCable } from "../tipos.js";
import { AccionesDeTarea } from "./AccionesDeTarea.js";
import { EntregaDeTarea } from "./EntregaDeTarea.js";
import estilos from "./Kanban.module.css";

/**
 * El dashboard de tareas: cuatro columnas, una por estado.
 *
 * Vive en el ESCRITORIO y no en una sesión: las tareas son de la aplicación —de la máquina,
 * en realidad— igual que «Tu equipo». Y por eso mismo hay que decir cuándo este proceso NO
 * las ejecuta: se ve igual en dos ventanas y solo avanza en una.
 *
 * **Y hay que decir la mitad que falta, que es la que muerde** (F4 de la revisión final):
 * una tarea creada desde el proceso que no tiene el cerrojo no dispara nada en el que sí lo
 * tiene —`revisar()` sale en `!miCerrojo` y no hay temporizador ni IPC—, así que se queda
 * `nuevo` hasta que ESE proceso mire la cola por su cuenta: cuando acabe otra tarea, o al
 * reiniciarlo. «Ábrelo desde el proceso que las corre para verlas moverse» prometía que
 * allí se mueven; una recién creada, todavía no. Sin decirlo se lee como un cuelgue, que es
 * el peor final de una cola.
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
 *
 * **Y una «Terminada» dice CÓMO llegó ahí** (`EntregaDeTarea.tsx`): el juez la aprobó, se
 * entregó con una condición de menos, o la dio por buena una persona. Las tres se pintaban
 * igual —proyecto, título, hora— porque el `veredicto` y su `salvedad` no salían del host
 * (F1 de la revisión final), y `conEstado` borra el `motivo` al entregar: sin eso, la
 * tarjeta de una entrega sin nada verificado y la de una entrega completa eran la misma.
 *
 * **Reintentar, descartar, terminar y feedback son de `AccionesDeTarea.tsx`**, la misma
 * pieza que monta `TareasDelProyecto.tsx`: antes esta vista solo ofrecía feedback, y la
 * lista solo reintentar/terminar/descartar, así que una tarea bloqueada solo se
 * desbloqueaba desde una de las dos pantallas (Task 13). `conectado` viaja igual que en
 * Ficheros, Revisión y Artefactos: sin cable, esos controles se apagan y lo dicen.
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
  alReintentar,
  alDescartar,
  alTerminar,
  alEnviarFeedback,
  proyectoActivo,
  conectado,
}: {
  cola: { lista: readonly TareaDelCable[]; concurrencia: number; corriendoAqui: boolean };
  /** Abrir la conversación de una tarea: es cómo se atiende. Ausente = no se ofrece. */
  alAbrirSesion?: (proyecto: string, sesion: string) => void;
  /** Abrir su pestaña Revisión: es la única forma de mirar lo que de verdad cambió en el
   *  disco, sin aprobación previa de por medio. Ausente = no se ofrece. */
  alAbrirRevision?: (proyecto: string, sesion: string) => void;
  /** Reenviado tal cual a `AccionesDeTarea`. Ausente = no se ofrece. */
  alReintentar?: (id: string) => void;
  /** Reenviado tal cual a `AccionesDeTarea`. Ausente = no se ofrece. */
  alDescartar?: (id: string) => void;
  /** Reenviado tal cual a `AccionesDeTarea`. Ausente = no se ofrece. */
  alTerminar?: (id: string) => void;
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
  /** Si el cable está vivo: apaga en `AccionesDeTarea` lo que manda algo al servidor
   *  (reintentar, descartar, terminar, feedback) y dice por qué. Ausente = se asume
   *  conectado. */
  conectado?: boolean;
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
          ábrelo desde el proceso que las corre para verlas moverse. Y una tarea que crees
          desde aquí se queda en «Nuevo» hasta que ese proceso vuelva a mirar la cola por su
          cuenta —al acabar otra tarea, o al reiniciarlo—: no se le avisa.
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
                      alReintentar={alReintentar}
                      alDescartar={alDescartar}
                      alTerminar={alTerminar}
                      alEnviarFeedback={alEnviarFeedback}
                      conectado={conectado}
                    />
                  ) : (
                    <TarjetaSimple
                      key={t.id}
                      tarea={t}
                      alAbrirSesion={alAbrirSesion}
                      alDescartar={alDescartar}
                      conectado={conectado}
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

/**
 * Nuevo, en proceso y terminada: proyecto, título, tiempo y lo que `AccionesDeTarea` ofrezca
 * (hoy, solo descartar — reintentar/terminar/feedback son de la aparcada).
 *
 * **Ya NO es un `<button>` envolviendo la tarjeta entera** (como antes de Task 13): con
 * descartar ofrecido también aquí, un botón dentro de otro botón es HTML inválido — la misma
 * razón por la que `TarjetaDeAtencion` ya era un `<div>`. El título es su propio control.
 */
function TarjetaSimple({
  tarea: t,
  alAbrirSesion,
  alDescartar,
  conectado,
  bloqueadaPorProyectoAbierto,
}: {
  tarea: TareaDelCable;
  alAbrirSesion?: (proyecto: string, sesion: string) => void;
  alDescartar?: (id: string) => void;
  conectado?: boolean;
  bloqueadaPorProyectoAbierto?: boolean;
}) {
  return (
    <li>
      <div className={estilos.tarjeta}>
        <span className={estilos.proyecto}>{t.proyectoNombre}</span>
        {/* Sin sesión no hay nada que abrir —la tarea no ha corrido— y un botón que no
            lleva a ninguna parte es el botón muerto de siempre. */}
        {t.sesion !== undefined && alAbrirSesion !== undefined ? (
          <button type="button" className={estilos.tituloBoton} onClick={() => alAbrirSesion(t.proyecto, t.sesion!)}>
            {t.titulo}
          </button>
        ) : (
          <span className={estilos.tituloDeTarea}>{t.titulo}</span>
        )}
        <span className={estilos.cuando}>{cuando(t)}</span>
        {/* Cómo llegó a «Terminada»: el juez, una condición de menos, o una persona. La
            misma pieza que monta `TareasDelProyecto.tsx`, y no pinta nada en los otros
            estados (ver su docblock). */}
        <EntregaDeTarea tarea={t} />
        {bloqueadaPorProyectoAbierto === true ? (
          <span className={estilos.bloqueada}>
            Esperando a que se cierre el proyecto: mientras alguien lo tenga abierto, gana la persona.
          </span>
        ) : null}
        <AccionesDeTarea tarea={t} conectado={conectado} alDescartar={alDescartar} />
      </div>
    </li>
  );
}

/**
 * «Esperando feedback»: el motivo, lo que se autorizó a escribir, las acciones de
 * `AccionesDeTarea` y el enlace a Revisión.
 *
 * Es un `<div>` y no un botón envolviéndolo todo —igual que `TarjetaSimple` desde Task 13—
 * porque aquí hay VARIAS acciones distintas (abrir conversación, ir a Revisión, y las de
 * `AccionesDeTarea`) y un botón dentro de otro botón es HTML inválido: el título es su
 * propio control, separado del resto.
 */
function TarjetaDeAtencion({
  tarea: t,
  alAbrirSesion,
  alAbrirRevision,
  alReintentar,
  alDescartar,
  alTerminar,
  alEnviarFeedback,
  conectado,
}: {
  tarea: TareaDelCable;
  alAbrirSesion?: (proyecto: string, sesion: string) => void;
  alAbrirRevision?: (proyecto: string, sesion: string) => void;
  alReintentar?: (id: string) => void;
  alDescartar?: (id: string) => void;
  alTerminar?: (id: string) => void;
  alEnviarFeedback?: (id: string, texto: string) => void;
  conectado?: boolean;
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

        {/* El motivo: es lo que dice QUÉ hay que decidir, y por tanto lo que hay que leer
            antes de tocar el feedback o el reintento que `AccionesDeTarea` ofrece justo
            debajo. Sin abrir nada. */}
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

        <AccionesDeTarea
          tarea={t}
          conectado={conectado}
          alReintentar={alReintentar}
          alDescartar={alDescartar}
          alTerminar={alTerminar}
          alEnviarFeedback={alEnviarFeedback}
        />

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
