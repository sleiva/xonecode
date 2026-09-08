import { PROYECTOS_POR_OMISION } from "./Barra.js";
import { IconoDeEntorno } from "./IconoDeEntorno.js";
import estilos from "./Escritorio.module.css";
import { Equipo } from "./Equipo.js";
import { Kanban } from "./Kanban.js";
import type { InformeDeDispositivos, TareaDelCable } from "../tipos.js";

/**
 * El centro cuando no hay sesión abierta: el escritorio.
 *
 * Sustituye a `SinProyectoAbierto`, que era una línea de texto («elige un proyecto en la
 * barra lateral») en mitad de una pantalla vacía. La barra ya no es el único sitio donde se
 * puede empezar: aquí están los proyectos con lo que se sabe de cada uno, y empezar es un
 * clic sobre el que quieras.
 *
 * **Todo lo que se pinta viene del servidor y ya viajaba por el cable**: los proyectos con
 * sus sesiones y si tienen copia local (`alta.proyectos`), el entorno activo
 * (`alta.entornoActivo` sobre `alta.registrados`) y el modelo en vigor (`modelos.actual`).
 * No hay ni una tarjeta de relleno: cuando falta algo se dice qué falta y dónde se arregla,
 * que es lo que esta pantalla hacía mal — no decía nada.
 *
 * **Solo se pintan los proyectos ELEGIDOS** (`visibles`, la misma elección que manda en la
 * barra lateral; ausente = los `PROYECTOS_POR_OMISION` primeros, igual que ella). Los demás
 * se CUENTAN en una línea con el camino a Ajustes, y no se pintan: estaban debajo con su
 * propia rejilla de tarjetas, y eso deshacía la elección —el escritorio enseñaba los
 * dieciocho proyectos del entorno y el grupo elegido se perdía entre ellos—. Elegir cuatro
 * y ver dieciocho es no haber elegido. Pero la cuenta no se calla: sin ella, el escritorio
 * afirmaría que el entorno solo tiene estos.
 *
 * Y no se pinta NADA del mockup que no tenga dato detrás. El panel de dispositivos
 * (`Equipo.tsx`) existe desde que el servidor MIDE la máquina (`core/dispositivos.ts`:
 * sistema, adb/emulator, simuladores y dispositivos iOS); «Build & Run» y cualquier acción
 * sobre el móvil siguen sin cablear y no se pintan. Ver `docs/DISENO-DASHBOARD.md`.
 */
export function Escritorio({
  nombre,
  entorno,
  proyectos,
  modelo,
  alNuevaSesion,
  alAbrirSesion,
  alAbrirAjustes,
  conectado,
  visibles,
  dispositivos,
  alActualizarDispositivos,
  tareas,
  alAbrirSesionDeTarea,
  alAbrirRevisionDeTarea,
  proyectoActivo,
}: {
  /** El saludo (`agent/persona.ts`). Ausente = se saluda igual, sin inventarse un nombre. */
  nombre?: string;
  /** El entorno activo. Ausente = no hay ninguno registrado todavía. */
  /** El `id` además del nombre: es lo que decide su marca (`IconoDeEntorno`). */
  entorno?: { id: string; nombre: string; url: string };
  proyectos: readonly {
    id: string;
    nombre: string;
    local?: boolean;
    /** Compartido CONTIGO por otra persona. Ausente = el servidor no lo dijo, que no es lo
     *  mismo que «es tuyo»: entonces no se pinta ninguna de las dos etiquetas. */
    compartido?: boolean;
    sesiones?: readonly { id: string; titulo: string }[];
  }[];
  /** «proveedor/modelo» en vigor. Ausente = no hay sesión y por tanto no se afirma ninguno. */
  modelo?: string;
  /**
   * Los proyectos elegidos para la barra (`Entorno.proyectos`). Ausente = nadie eligió y
   * aplica la misma omisión que la barra. Medido: la barra enseñaba cuatro y decía «14 más»
   * mientras el escritorio pintaba los dieciocho iguales, con dieciocho botones primarios.
   * Ahora los destacados van primero y el resto debajo, con su botón en segundo plano.
   */
  visibles?: readonly string[];
  alNuevaSesion: (proyecto: string) => void;
  alAbrirSesion: (proyecto: string, sesion: string) => void;
  alAbrirAjustes: () => void;
  /**
   * Si el cable está vivo. Medido sin servidor: lo único que cambiaba era un «sin conexión»
   * pequeño en la esquina, y los 18 «Nueva sesión» seguían negros y pulsables — se pulsaba
   * y no pasaba nada. Sin conexión, lo que manda algo al servidor se apaga, y el punto
   * del entorno deja de estar verde: nada de esto se puede afirmar sin cable.
   */
  conectado?: boolean;
  /** La foto de la máquina (`Equipo.tsx`). Ausente = aún no llegó. */
  dispositivos?: InformeDeDispositivos;
  alActualizarDispositivos?: () => void;
  /**
   * La cola de tareas en background (`Kanban.tsx`). Ausente = el servidor no ha mandado
   * `tareas` todavía — ni una vez, ni esta ejecución no las ejecuta—, y eso NO es lo mismo
   * que «no hay ninguna»: el panel lo dice en vez de afirmar una cola vacía que nadie ha
   * medido, la misma regla que `dispositivos` ausente en «Tu equipo».
   */
  tareas?: { lista: readonly TareaDelCable[]; concurrencia: number; corriendoAqui: boolean };
  /** Abrir la conversación de una tarea, desde su tarjeta del kanban. */
  alAbrirSesionDeTarea?: (proyecto: string, sesion: string) => void;
  /** Abrir la pestaña Revisión de una tarea «esperando feedback»: la verdad sobre lo que
   *  cambió en el disco, sin aprobación previa de por medio. */
  alAbrirRevisionDeTarea?: (proyecto: string, sesion: string) => void;
  /**
   * El proyecto cuya consola HUMANA está abierta ahora (`estado.alta.proyectoActivo`). El
   * escritorio se puede ver con una sesión de otro proyecto ya abierta detrás —volver a él
   * es solo estado de vista, no cierra nada—, así que esto puede estar definido aquí; se le
   * pasa al kanban para que una tarea `nuevo` de ESE proyecto diga que espera, en vez de
   * quedarse quieta sin explicación.
   */
  proyectoActivo?: string;
}) {
  const apagado = conectado === false;
  const destacados =
    visibles === undefined ? proyectos.slice(0, PROYECTOS_POR_OMISION) : proyectos.filter((p) => visibles.includes(p.id));
  const otros = proyectos.filter((p) => !destacados.includes(p));
  return (
    <div className={estilos.escritorio}>
      <div className={estilos.contenido}>
        <header className={estilos.portada}>
          <h1 className={estilos.saludo}>{nombre === undefined ? "Hola" : `Hola, ${nombre}`}</h1>
          <p className={estilos.subtitulo}>
            Elige un proyecto para empezar a trabajar, o sigue una conversación de antes.
          </p>
          {entorno === undefined ? null : (
            <p className={estilos.entorno}>
              {/* La marca del entorno, delante de su punto de conexión: la primera dice de
                  QUÉ servidor se habla y el segundo si se le está hablando. */}
              <IconoDeEntorno entorno={entorno.id} size={20} className={estilos.iconoDeEntorno} />
              <span className={estilos.punto} data-sin-conexion={apagado ? "" : undefined} aria-hidden="true" />
              <span className={estilos.entornoNombre}>{entorno.nombre}</span>
              <span className={estilos.entornoUrl}>{entorno.url}</span>
            </p>
          )}
        </header>

        {proyectos.length === 0 ? (
          // Los dos vacíos NO son el mismo, y se distinguen: sin entorno no hay a quién
          // preguntarle por proyectos; con entorno y sin proyectos, el que no tiene es él.
          <p className={estilos.vacio}>
            {entorno === undefined
              ? "No hay ningún entorno registrado todavía. Se registra en Ajustes, con su URL."
              : "Este entorno no ha devuelto ningún proyecto."}{" "}
            <button type="button" className={estilos.enlace} onClick={alAbrirAjustes}>
              Abrir Ajustes
            </button>
          </p>
        ) : (
          <>
          <section aria-label="proyectos elegidos">
          <ul className={estilos.rejilla}>
            {destacados.map((p) => {
              const sesiones = p.sesiones ?? [];
              return (
                <li key={p.id} className={estilos.tarjeta} data-local={p.local === true ? "" : undefined}>
                  <div className={estilos.cabeceraDeTarjeta}>
                    <h2 className={estilos.nombreDeProyecto}>{p.nombre}</h2>
                    {/*
                      De quién es, pegado al NOMBRE — mientras que «en tu equipo» se queda
                      en su esquina. Son dos preguntas distintas y no pueden compartir sitio:
                      una es de quién es el proyecto allá arriba, la otra si está bajado
                      aquí. Con una palabra y no solo con color, y solo cuando el servidor
                      lo dijo: `undefined` no pinta ninguna de las dos.
                    */}
                    {p.compartido === undefined ? null : (
                      <span className={estilos.duenno} data-compartido={p.compartido ? "" : undefined}>
                        {p.compartido ? "compartido" : "propio"}
                      </span>
                    )}
                    {/* «En tu equipo» es un dato del servidor, no una promesa: es si existe
                        su copia local, que es lo que decide si empezar baja algo o no. */}
                    <span className={estilos.marca} data-local={p.local === true ? "" : undefined}>
                      {p.local === true ? "en tu equipo" : "sin descargar"}
                    </span>
                  </div>
                  {sesiones.length === 0 ? (
                    <p className={estilos.sinSesiones}>Sin sesiones todavía.</p>
                  ) : (
                    <ul className={estilos.sesiones}>
                      {/* Las últimas cuatro: una tarjeta no es un archivo histórico, y el
                          resto sigue entero en la barra lateral. */}
                      {sesiones.slice(-4).reverse().map((s) => (
                        <li key={s.id}>
                          <button
                            type="button"
                            className={estilos.sesion}
                            disabled={apagado}
                            onClick={() => alAbrirSesion(p.id, s.id)}
                          >
                            {s.titulo}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <button
                    type="button"
                    className={estilos.empezar}
                    disabled={apagado}
                    onClick={() => alNuevaSesion(p.id)}
                  >
                    Nueva sesión
                  </button>
                </li>
              );
            })}
          </ul>
          </section>
          {/*
            Los que quedan FUERA se cuentan, no se pintan.

            Antes se pintaban debajo con su propia rejilla de tarjetas, y eso deshacía la
            elección: el escritorio enseñaba los dieciocho proyectos del entorno y el
            grupo elegido se perdía entre ellos. Elegir cuatro y ver dieciocho es no haber
            elegido.

            Pero **contarlos y decir dónde se eligen no es negociable**, y es la misma regla
            que ya cumple la barra lateral: callarlos haría creer que el entorno solo tiene
            estos. La cifra va con un botón a Ajustes y no con la frase «se eligen en
            Ajustes» a secas — es donde hay que ir, así que se va desde aquí.
          */}
          {otros.length === 0 ? null : (
            <p className={estilos.resto}>
              {otros.length === 1 ? "Otro proyecto del entorno" : `Otros ${otros.length} proyectos del entorno`} sin
              enseñar{" "}
              <button type="button" className={estilos.enlace} onClick={alAbrirAjustes}>
                Elígelos en Ajustes
              </button>
            </p>
          )}
          </>
        )}

        {/*
          Las tareas en background, entre lo elegido y «Tu equipo»: son de la aplicación,
          igual que el resto de este panel. Ausente no es «no hay ninguna» —es «no ha
          llegado la cola»—, la misma regla que la foto de la máquina de más abajo, así que
          se dice en vez de afirmar un kanban vacío que nadie ha medido.
        */}
        {tareas === undefined ? (
          <p className={estilos.vacio}>Todavía no ha llegado la cola de tareas en background.</p>
        ) : (
          <Kanban
            cola={tareas}
            {...(alAbrirSesionDeTarea === undefined ? {} : { alAbrirSesion: alAbrirSesionDeTarea })}
            {...(alAbrirRevisionDeTarea === undefined ? {} : { alAbrirRevision: alAbrirRevisionDeTarea })}
            {...(proyectoActivo === undefined ? {} : { proyectoActivo })}
          />
        )}

        <Equipo
          {...(dispositivos === undefined ? {} : { informe: dispositivos })}
          conectado={!apagado}
          {...(alActualizarDispositivos === undefined ? {} : { alActualizar: alActualizarDispositivos })}
        />

        {/* El modelo, dicho una vez y donde se va a usar. Ausente = no hay sesión abierta y
            no se afirma ninguno, la misma regla que la pastilla del compositor. */}
        {modelo === undefined ? null : (
          <p className={estilos.pie}>
            Trabajará con <span className={estilos.modelo}>{modelo}</span>. Se cambia en Ajustes o
            desde la pastilla del compositor.
          </p>
        )}
      </div>
    </div>
  );
}
