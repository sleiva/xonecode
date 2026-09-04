import clsx from "clsx";
import estilos from "./Barra.module.css";

export interface Proyecto { id: string; nombre: string; sesiones: { id: string; titulo: string; historica: boolean }[] }

/**
 * Los tres niveles, ahora a la IZQUIERDA (`Maqueta.tsx`, como deepseek — cambio de rumbo
 * del usuario): entorno → proyectos → sesiones, y un pie con lo que hoy
 * son comandos de barra (`/config`, `/modelo`) y no un ajuste con sitio propio en la
 * interfaz — un enlace a un panel que no existe sería el mismo dato inventado que un
 * alias de color que no existe.
 *
 * Solo se monta con el proyecto ya abierto (`App.tsx#enAlta`): mientras no lo hay, el
 * primer arranque no enseña ni esta barra ni nada de alrededor, así que las listas
 * vacías de aquí abajo son el caso «entorno registrado, aún sin proyectos» o «proyecto
 * abierto, aún sin sesiones» — no la pantalla de bienvenida. Cada nivel dice por qué
 * está vacío y no una lista que simplemente no pinta nada, porque eso es indistinguible
 * de que la barra se haya roto.
 *
 * `entornos`/`proyectos` llegan vacíos SIEMPRE hoy: `vestibulo.ts` (servidor) construye
 * esa jerarquía para el alta, pero ningún mensaje del cable la manda de vuelta una vez
 * hay proyecto abierto —esta tarea no tocó el servidor para añadir uno—, así que el
 * estado vacío de «Proyectos» es en la práctica el único que se ve hoy, INCLUSO con un
 * entorno ya registrado y un proyecto ya abierto en el propio turno que se está mirando.
 * Por eso el texto de cada nivel vacío dice que esta BARRA no tiene qué enseñar, y no que
 * no exista ningún entorno o proyecto: lo segundo sería una afirmación falsa sobre el
 * mundo (el entorno SÍ está registrado; esta barra es la que no lo sabe todavía), y ese
 * es justo el matiz que este repo no deja pasar en un aviso de honestidad.
 */
export function Barra({ entornos, entornoActivo, proyectos, sesionActiva, alElegirEntorno, alAbrirSesion, alNuevaSesion }: {
  entornos: { id: string; nombre: string }[];
  entornoActivo: string;
  proyectos: Proyecto[];
  sesionActiva?: string;
  alElegirEntorno: (id: string) => void;
  alAbrirSesion: (proyecto: string, sesion: string) => void;
  /**
   * Una sesión es reabrible por diseño (`web/servidor/sesiones.ts`), pero crear una
   * NUEVA desde aquí necesitaría una clase del cable que hoy no existe —abrir un
   * proyecto solo pasa por el alta, una vez, y `vestibulo.ts` no tiene un «vuelve a
   * abrir este mismo proyecto sin sesión»—. El botón se enseña igual, porque es la
   * acción que pide el criterio de aceptación y `proyectos` puede llegar poblado el
   * día que el cable la lleve; hasta entonces, quien monte `Barra` sin ese mensaje le
   * pasa un manejador que no hace nada, igual que ya hace con `alElegirEntorno`.
   */
  alNuevaSesion: (proyecto: string) => void;
}) {
  return (
    <nav className={estilos.barra}>
      <div className={estilos.contenido}>
        <section className={estilos.seccion}>
          <h2 className={estilos.tituloSeccion}>Entorno</h2>
          {entornos.length === 0 ? (
            <p className={estilos.vacio}>Sin entorno que enseñar aquí todavía.</p>
          ) : (
            <select
              className={estilos.entorno}
              value={entornoActivo}
              onChange={(e) => alElegirEntorno(e.target.value)}
            >
              {entornos.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nombre}
                </option>
              ))}
            </select>
          )}
        </section>

        <section className={clsx(estilos.seccion, estilos.seccionProyectos)}>
          <h2 className={estilos.tituloSeccion}>Proyectos</h2>
          {proyectos.length === 0 ? (
            <p className={estilos.vacio}>Sin proyectos que enseñar aquí todavía.</p>
          ) : (
            <ul className={estilos.proyectos}>
              {proyectos.map((p) => (
                <li key={p.id}>
                  <div className={estilos.filaProyecto}>
                    <span className={estilos.proyecto}>{p.nombre}</span>
                    <button
                      type="button"
                      className={estilos.nuevaSesion}
                      onClick={() => alNuevaSesion(p.id)}
                      aria-label={`nueva sesión en ${p.nombre}`}
                    >
                      + sesión
                    </button>
                  </div>
                  {p.sesiones.length === 0 ? (
                    <p className={estilos.vacioSesiones}>Sin sesiones todavía.</p>
                  ) : (
                    <ul className={estilos.sesiones}>
                      {p.sesiones.map((s) => (
                        <li key={s.id}>
                          <button
                            className={clsx(
                              estilos.sesion,
                              s.historica && estilos.historica,
                              s.id === sesionActiva && estilos.activa
                            )}
                            onClick={() => alAbrirSesion(p.id, s.id)}
                          >
                            {s.titulo}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* El remate de abajo: en la referencia va «Settings», y aquí son `/config` y
          `/modelo` —comandos de barra, no un panel propio— porque eso es lo que ya
          existe (`COMANDOS` en `cli/consola.ts`) y no hay nada que inventarle una
          pantalla. Sin esto la barra terminaba en la última sesión, como si el resto se
          hubiera cortado. */}
      <div className={estilos.pie}>
        <p className={estilos.pieTitulo}>Ajustes</p>
        <p className={estilos.pieNota}>
          <code className={estilos.pieComando}>/config</code> y{" "}
          <code className={estilos.pieComando}>/modelo</code>, desde el compositor.
        </p>
      </div>
    </nav>
  );
}
