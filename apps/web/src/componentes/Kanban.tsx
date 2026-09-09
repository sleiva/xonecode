import type { Acto, TareaDelCable } from "../tipos.js";
import { AccionesDeTarea } from "./AccionesDeTarea.js";
import { EntregaDeTarea } from "./EntregaDeTarea.js";
import { MirarTarea } from "./MirarTarea.js";
import { QuienEjecutaTareas } from "./QuienEjecutaTareas.js";
import estilos from "./Kanban.module.css";

/**
 * El dashboard de tareas: cuatro columnas, una por estado.
 *
 * Vive en el ESCRITORIO y no en una sesión: las tareas son de la aplicación —de la máquina,
 * en realidad— igual que «Tu equipo». Y por eso mismo hay que decir cuándo este proceso NO
 * las ejecuta: se ve igual en dos ventanas y solo avanza en una.
 *
 * **Y lo que se dice de eso son TRES frases y no una** (`QuienEjecutaTareas.tsx`, la misma
 * pieza que monta la lista del proyecto): las ejecuta otro proceso —y entonces una tarea
 * creada aquí se queda `nuevo` hasta que ESE proceso mire la cola, porque `revisar()` sale
 * en `!miCerrojo` y no hay temporizador ni IPC—, no las ejecuta nadie, o no se sabe. «No soy
 * yo» y «no hay nadie» significan lo contrario, y un aviso que manda a esperar a un proceso
 * que no existe es peor que uno mudo.
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
  alMirar,
  alDejarDeMirar,
  mirando,
  mirada,
  proyectoActivo,
  conectado,
}: {
  cola: {
    lista: readonly TareaDelCable[];
    concurrencia: number;
    corriendoAqui: boolean;
    /** Si las ejecuta OTRO proceso. Ausente = no se sabe, que no es lo mismo que «nadie»:
     *  ver `QuienEjecutaTareas`. */
    ejecutaOtroProceso?: boolean;
  };
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
   * Ver EN VIVO lo que hace el turno de una tarea, desplegando su tarjeta (Task 17: ya no
   * es un bloque hermano del kanban). Ausente = no se ofrece.
   *
   * Solo se pinta en una `en-proceso`, y solo si la ejecuta ESTE proceso: sin su consola
   * aquí no hay transcript que enseñar, y un botón que no puede cumplir lo que dice es el
   * botón muerto de siempre. Para una terminada, lo que hay es su transcript GUARDADO — se
   * abre pulsando el título, y es el MISMO (no hay un segundo registro). Las condiciones
   * viven en `MirarTarea.tsx`, no aquí: esta pieza solo reenvía lo que la cola sabe.
   */
  alMirar?: (id: string) => void;
  /** Cerrar esa vista, desenganchando SOLO ese mirón. Ausente = no se ofrece cerrarla desde
   *  aquí. */
  alDejarDeMirar?: (id: string) => void;
  /** Cuál se está mirando ahora, si alguna: su tarjeta lo dice y su botón cierra en vez de
   *  abrir. Sin esto, con el panel abierto no se sabría de qué tarjeta es lo que se lee. */
  mirando?: string;
  /** El transcript que el servidor está mandando de la tarea que se mira. Ausente o de otra
   *  tarea = todavía no ha pintado nada de la que se mira aquí. */
  mirada?: { tarea: string; actos: readonly Acto[] };
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
      {/* Quién las ejecuta si no es este proceso, y qué le pasa a una creada aquí: la MISMA
          pieza que la lista del proyecto, porque son tres frases y dos copias divergen. */}
      <QuienEjecutaTareas
        corriendoAqui={cola.corriendoAqui}
        {...(cola.ejecutaOtroProceso === undefined ? {} : { ejecutaOtroProceso: cola.ejecutaOtroProceso })}
        donde="este kanban"
      />
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
                      corriendoAqui={cola.corriendoAqui}
                      {...(alMirar === undefined ? {} : { alMirar })}
                      {...(alDejarDeMirar === undefined ? {} : { alDejarDeMirar })}
                      {...(mirando === undefined ? {} : { mirando })}
                      {...(mirada === undefined ? {} : { mirada })}
                    />
                  ) : (
                    <TarjetaSimple
                      key={t.id}
                      tarea={t}
                      alAbrirSesion={alAbrirSesion}
                      alDescartar={alDescartar}
                      conectado={conectado}
                      // `MirarTarea` decide las tres condiciones de «Ver lo que hace»: aquí
                      // solo se reenvía lo que la cola sabe (`corriendoAqui` es de la cola,
                      // no de la tarea, así que la tarjeta no lo puede saber sin que se le
                      // pase).
                      corriendoAqui={cola.corriendoAqui}
                      {...(alMirar === undefined ? {} : { alMirar })}
                      {...(alDejarDeMirar === undefined ? {} : { alDejarDeMirar })}
                      {...(mirando === undefined ? {} : { mirando })}
                      {...(mirada === undefined ? {} : { mirada })}
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
  corriendoAqui,
  alMirar,
  alDejarDeMirar,
  mirando,
  mirada,
  bloqueadaPorProyectoAbierto,
}: {
  tarea: TareaDelCable;
  alAbrirSesion?: (proyecto: string, sesion: string) => void;
  alDescartar?: (id: string) => void;
  conectado?: boolean;
  /** Si ESTE proceso ejecuta las tareas: es de la cola, no de la tarea, así que la tarjeta
   *  no lo puede saber sin que se le pase. */
  corriendoAqui?: boolean;
  alMirar?: (id: string) => void;
  alDejarDeMirar?: (id: string) => void;
  mirando?: string;
  mirada?: { tarea: string; actos: readonly Acto[] };
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
            estados (ver su docblock). Solo AQUÍ si la tarjeta no está desplegada: expandida
            (una `terminada` que se estaba mirando cuando acabó), `MirarTarea` ya lo enseña
            dentro del detalle, y pintarlo dos veces sería la misma información repetida. */}
        {mirando === t.id ? null : <EntregaDeTarea tarea={t} />}
        {bloqueadaPorProyectoAbierto === true ? (
          <span className={estilos.bloqueada}>
            Esperando a que se cierre el proyecto: mientras alguien lo tenga abierto, gana la persona.
          </span>
        ) : null}
        {/* Ver lo que hace, en vivo, desplegando ESTA tarjeta (Task 17): la MISMA pieza que
            monta `TareasDelProyecto.tsx`, con sus condiciones dentro y no aquí. */}
        <MirarTarea
          tarea={t}
          conectado={conectado}
          corriendoAqui={corriendoAqui}
          {...(alMirar === undefined ? {} : { alMirar })}
          {...(alDejarDeMirar === undefined ? {} : { alDejarDeMirar })}
          {...(mirando === undefined ? {} : { mirando })}
          {...(mirada === undefined ? {} : { mirada })}
        />
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
  corriendoAqui,
  alMirar,
  alDejarDeMirar,
  mirando,
  mirada,
}: {
  tarea: TareaDelCable;
  alAbrirSesion?: (proyecto: string, sesion: string) => void;
  alAbrirRevision?: (proyecto: string, sesion: string) => void;
  alReintentar?: (id: string) => void;
  alDescartar?: (id: string) => void;
  alTerminar?: (id: string) => void;
  alEnviarFeedback?: (id: string, texto: string) => void;
  conectado?: boolean;
  /** Solo importa si esta tarea llegó aquí ya siendo MIRADA en `en-proceso`: el despliegue
   *  se queda abierto para poder plegarlo, aunque esta columna ya no ofrezca abrirlo. */
  corriendoAqui?: boolean;
  alMirar?: (id: string) => void;
  alDejarDeMirar?: (id: string) => void;
  mirando?: string;
  mirada?: { tarea: string; actos: readonly Acto[] };
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

        {/* Motivo, veredicto y autorizadas van AQUÍ solo si esta tarjeta NO está desplegada:
            expandida, `MirarTarea` ya los enseña dentro del detalle (Task 17), y pintarlos
            dos veces sería la misma información repetida — el mismo argumento por el que
            `EntregaDeTarea` ya evita repetir su propio resumen si el motivo lo lleva
            dentro. */}
        {mirando === t.id ? null : (
          <>
        {/* El motivo: es lo que dice QUÉ hay que decidir, y por tanto lo que hay que leer
            antes de tocar el feedback o el reintento que `AccionesDeTarea` ofrece justo
            debajo. Sin abrir nada. */}
        {t.motivo === undefined ? null : <p className={estilos.motivo}>{t.motivo}</p>}

        {/* Lo que el juez echó en falta, si habló: sus hallazgos son lo accionable de esta
            columna —lo que hay que contestar— y el resumen no se repite si el motivo de
            arriba ya lo lleva. La MISMA pieza que la tarjeta de una entregada. */}
        <EntregaDeTarea tarea={t} />

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
          </>
        )}

        <AccionesDeTarea
          tarea={t}
          conectado={conectado}
          alReintentar={alReintentar}
          alDescartar={alDescartar}
          alTerminar={alTerminar}
          alEnviarFeedback={alEnviarFeedback}
        />

        {/* Normalmente esta columna no ofrece ABRIR el despliegue (no es «en-proceso»), pero
            si la tarea llegó aquí siendo MIRADA se queda expandida para poder plegarla —
            `MirarTarea` decide, esta pieza solo reenvía. */}
        <MirarTarea
          tarea={t}
          conectado={conectado}
          corriendoAqui={corriendoAqui}
          {...(alMirar === undefined ? {} : { alMirar })}
          {...(alDejarDeMirar === undefined ? {} : { alDejarDeMirar })}
          {...(mirando === undefined ? {} : { mirando })}
          {...(mirada === undefined ? {} : { mirada })}
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
