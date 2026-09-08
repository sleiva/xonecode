import type { TareaDelCable } from "../tipos.js";
import { AccionesDeTarea } from "./AccionesDeTarea.js";
import { EntregaDeTarea } from "./EntregaDeTarea.js";
import estilos from "./TareasDelProyecto.module.css";

const ETIQUETA_DE_ESTADO: Record<TareaDelCable["estado"], string> = {
  nuevo: "Nuevo",
  "en-proceso": "En proceso",
  // La MISMA etiqueta que `Kanban.tsx` usa para esta columna, y por el mismo motivo que
  // documenta ahí: el identificador del enum no se toca, pero lo que la interfaz DICE es
  // «esperando feedback» desde §0 del diseño, y dos etiquetas para el mismo estado en dos
  // pestañas de la misma app sería la misma mentira que un color repetido a mano.
  "requiere-atencion": "Esperando feedback",
  terminada: "Terminada",
};

/**
 * La lista de tareas en background del proyecto ABIERTO, como pestaña.
 *
 * **Task 15: esta pestaña ya NO depende de si hay alguna tarea, y eso MATIZA la regla de
 * `Pestanas.tsx#hayArtefactos` en vez de contradecirla.** Un artefacto es el REGISTRO de
 * algo que el agente ya dibujó: una pestaña de registro vacía es el control sin dato
 * detrás, y por eso solo existe con al menos uno. Una tarea es lo contrario — es donde se
 * ACTÚA —, y antes de esta tarea la única puerta para crear la primera de un proyecto
 * abierto era volver al escritorio (la marca «xonecode»): la pestaña que enseñaría cómo
 * hacerlo desaparecía justo cuando alguien la buscaba. El criterio que queda, para quien
 * lea la regla de Artefactos y quiera «arreglar» esto: **una pestaña de REGISTRO existe si
 * hay registro; una pestaña de ACCIÓN existe siempre, y su estado vacío dice cómo se
 * empieza.** No es un hueco: es la respuesta a «¿y cómo se crea una?».
 *
 * **Ausente y vacío no son lo mismo, y esta vista es la que tiene que sostener esa
 * distinción hasta el final.** `tareas` ausente significa que la cola todavía no ha llegado
 * del servidor (`estado.tareas` en `store.ts`) — no se puede afirmar «no hay ninguna» sin
 * haber medido, la misma regla que `Revision#via`. `tareas={[]}` significa que sí llegó y
 * este proyecto no tiene ninguna: solo ENTONCES se pinta el estado vacío.
 *
 * No pide nada al servidor: la cola entera viaja en `{clase:"tareas"}` y ya está en el
 * store (`App.tsx` filtra por `proyecto`), así que aquí no hay ningún `useEffect` de red.
 *
 * **Las cuatro acciones son de `AccionesDeTarea.tsx`**, la misma pieza que monta
 * `Kanban.tsx`: antes esta lista ofrecía reintentar/terminar/descartar y no feedback, así
 * que una tarea aparcada solo se podía atender desde el kanban del escritorio (Task 13).
 * `conectado` se reenvía tal cual: sin cable, esos controles se apagan y lo dicen — la
 * misma regla que ya siguen Ficheros, Revisión y Artefactos.
 */
export function TareasDelProyecto({
  tareas,
  alNuevaTarea,
  corriendoAqui,
  alReintentar,
  alDescartar,
  alTerminar,
  alEnviarFeedback,
  conectado,
}: {
  /** Ausente = la cola todavía no ha llegado del servidor. `[]` = llegó, y este proyecto no
   *  tiene ninguna. Los dos casos NO son el mismo texto. */
  tareas?: readonly TareaDelCable[];
  /**
   * Crear una tarea PARA ESTE proyecto, sin salir de esta pestaña ni volver al escritorio.
   * Ausente = no se ofrece — hoy solo pasa si `App` no puede resolver el id del proyecto
   * activo (`alta.proyectoActivo` se DEDUCE comparando raíces y puede no cuadrar). No lleva
   * parámetro: a diferencia del botón del escritorio, que elige entre varias tarjetas, aquí
   * ya se está DENTRO del proyecto — pedirlo sería preguntar algo que ya se sabe.
   */
  alNuevaTarea?: () => void;
  /** `nuevo → en-proceso` se salta desde aquí: reintentar es lo que devuelve una tarea
   *  aparcada a la cola. Ausente = no se ofrece. */
  alReintentar?: (id: string) => void;
  /** Borra la tarea, con su carpeta de adjuntos. Irreversible, y por eso confirma en la
   *  propia fila antes de mandarlo. Ausente = no se ofrece. */
  alDescartar?: (id: string) => void;
  /** «La persona da el trabajo por bueno»: `requiere-atencion → terminada` sin pasar por
   *  un reintento. Ausente = no se ofrece. */
  alTerminar?: (id: string) => void;
  /** «Se edita la tarea y se agrega el feedback del usuario»: la devuelve al lazo, en su
   *  mismo hilo. Ausente = no se ofrece — la aparcada cae a la pista de siempre. */
  alEnviarFeedback?: (id: string, texto: string) => void;
  /** Si el cable está vivo: apaga en `AccionesDeTarea` (y el botón «Nueva tarea» de aquí)
   *  lo que manda algo al servidor, y lo dice. Ausente = se asume conectado. */
  conectado?: boolean;
  /**
   * Si es ESTE proceso el que ejecuta las tareas (`corriendoAqui` del cable). `false`
   * significa que el cerrojo lo tiene otro, y entonces hay que decir algo que no es obvio:
   * una tarea creada desde aquí **no dispara nada allí** —`revisar()` sale en `!miCerrojo`,
   * y no hay temporizador ni IPC—, así que se queda en «Nuevo» hasta que ese proceso mire
   * la cola por su cuenta. Se dice en esta pestaña porque es donde vive «Nueva tarea», o
   * sea donde se crea la tarea que se va a quedar quieta: el aviso sirve ANTES de crearla.
   *
   * **Ausente = no se sabe** —la cola todavía no ha llegado— y entonces no se afirma nada,
   * la regla de siempre.
   */
  corriendoAqui?: boolean;
}) {
  const apagado = conectado === false;
  return (
    <section className={estilos.lista} aria-label="Tareas del proyecto">
      <div className={estilos.encabezado}>
        <span className={estilos.rotulo}>Tareas en background</span>
        {alNuevaTarea === undefined ? null : (
          <button type="button" className={estilos.nueva} disabled={apagado} onClick={alNuevaTarea}>
            Nueva tarea
          </button>
        )}
      </div>
      {/*
        El motivo del apagado tiene que ser texto VISIBLE, no un `title`: un `title` no se ve
        en táctil, la mayoría de navegadores no lo enseña de forma fiable con el ratón, y un
        lector de pantalla puede no anunciarlo — la misma familia de fallo que un aviso que
        nadie lee o un control en `display:none` sin tabular. Mismo texto y patrón que
        `AccionesDeTarea.module.css#.avisoConexion` usa por fila; aquí es de la pestaña
        entera, así que vive junto a la cabecera y no dentro de ninguna fila.
      */}
      {apagado && alNuevaTarea !== undefined ? (
        <p className={estilos.avisoConexion}>Sin conexión: no se puede crear una tarea hasta reconectar.</p>
      ) : null}
      {/* Ver `corriendoAqui`: sin esto, una tarea creada desde el proceso que no manda se
          queda quieta y muda, y eso se lee como un cuelgue. */}
      {corriendoAqui === false ? (
        <p className={estilos.avisoProceso} role="note">
          Las tareas las ejecuta otro proceso: aquí se ven, pero no avanzan. Una que crees
          desde aquí se queda en «Nuevo» hasta que ese proceso vuelva a mirar la cola por su
          cuenta —al acabar otra tarea, o al reiniciarlo—: no se le avisa.
        </p>
      ) : null}
      {tareas === undefined ? (
        <p className={estilos.aviso}>Consultando la cola de tareas de este proyecto…</p>
      ) : tareas.length === 0 ? (
        <p className={estilos.aviso}>
          Este proyecto todavía no tiene ninguna tarea en background. Pulsa «Nueva tarea» para
          darle al agente un encargo que trabaje solo, sin que tengas que quedarte mirando: se
          aplica sin pedir aprobación, porque la autorización es crearla.
        </p>
      ) : (
        <ul className={estilos.filas}>
          {tareas.map((t) => (
            <Fila
              key={t.id}
              tarea={t}
              conectado={conectado}
              {...(alReintentar === undefined ? {} : { alReintentar })}
              {...(alDescartar === undefined ? {} : { alDescartar })}
              {...(alTerminar === undefined ? {} : { alTerminar })}
              {...(alEnviarFeedback === undefined ? {} : { alEnviarFeedback })}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function Fila({
  tarea: t,
  alReintentar,
  alDescartar,
  alTerminar,
  alEnviarFeedback,
  conectado,
}: {
  tarea: TareaDelCable;
  alReintentar?: (id: string) => void;
  alDescartar?: (id: string) => void;
  alTerminar?: (id: string) => void;
  alEnviarFeedback?: (id: string, texto: string) => void;
  conectado?: boolean;
}) {
  return (
    <li className={estilos.fila} data-estado={t.estado}>
      <span className={estilos.punto} aria-hidden="true" />
      <div className={estilos.cuerpo}>
        <div className={estilos.cabecera}>
          <span className={estilos.titulo}>{t.titulo}</span>
          <span className={estilos.etiquetaEstado}>{ETIQUETA_DE_ESTADO[t.estado]}</span>
        </div>
        {/* Ausente = no consta ningún motivo; nunca se inventa uno para rellenar la fila. */}
        {t.motivo === undefined ? null : <p className={estilos.motivo}>{t.motivo}</p>}
        {/* Y cómo llegó a «Terminada», que es donde el motivo ya no existe: la MISMA pieza
            que monta `Kanban.tsx`, para que las dos vistas no puedan afirmar cosas
            distintas de la misma tarea. */}
        <EntregaDeTarea tarea={t} />
      </div>
      <div className={estilos.acciones}>
        <AccionesDeTarea
          tarea={t}
          conectado={conectado}
          alReintentar={alReintentar}
          alDescartar={alDescartar}
          alTerminar={alTerminar}
          alEnviarFeedback={alEnviarFeedback}
        />
      </div>
    </li>
  );
}
