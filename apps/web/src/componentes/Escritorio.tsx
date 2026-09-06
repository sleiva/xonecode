import { PROYECTOS_POR_OMISION } from "./Barra.js";
import estilos from "./Escritorio.module.css";
import { Equipo } from "./Equipo.js";
import type { InformeDeDispositivos } from "../tipos.js";

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
}: {
  /** El saludo (`agent/persona.ts`). Ausente = se saluda igual, sin inventarse un nombre. */
  nombre?: string;
  /** El entorno activo. Ausente = no hay ninguno registrado todavía. */
  entorno?: { nombre: string; url: string };
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
          {[
            { clave: "destacados", lista: destacados, secundario: false },
            { clave: "otros", lista: otros, secundario: true },
          ].map(({ clave, lista, secundario }) =>
            lista.length === 0 ? null : (
          <section key={clave} aria-label={secundario ? "otros proyectos del entorno" : "proyectos en la barra"}>
          {secundario && destacados.length > 0 ? (
            <h2 className={estilos.subtituloDeGrupo}>
              {lista.length === 1 ? "Otro proyecto del entorno" : `Otros ${lista.length} proyectos del entorno`} · se
              eligen en Ajustes
            </h2>
          ) : null}
          <ul className={estilos.rejilla}>
            {lista.map((p) => {
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
                    className={secundario ? estilos.empezarSecundario : estilos.empezar}
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
            )
          )}
          </>
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
