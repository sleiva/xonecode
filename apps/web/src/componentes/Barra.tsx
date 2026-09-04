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
 * Se monta con `enAlta` en falso (`App.tsx`): cuenta y entorno resueltos, CON o SIN
 * proyecto abierto —el paso de proyecto salió del alta y se elige aquí—, así que las
 * listas vacías de aquí abajo son de verdad «entorno registrado, aún sin proyectos» o
 * «proyecto abierto, aún sin sesiones», y ya no el único caso que se veía. Cada nivel
 * dice por qué está vacío y no una lista que simplemente no pinta nada, porque eso es
 * indistinguible de que la barra se haya roto.
 *
 * `entornos`/`proyectos` YA llegan poblados (`App.tsx` los lee de `estado.alta`, que el
 * servidor manda siempre, tenga o no proyecto abierto). Lo que sigue siendo un hueco:
 * `sesiones` de cada proyecto llega vacía siempre —no hay mensaje del cable que las
 * traiga—. Abrir un proyecto (`alAbrirProyecto`) SÍ está cableado: pide la rama al
 * servidor y, si tiene más de una, `App.tsx` enseña un selector — ver el comentario de
 * `alAbrirProyecto` ahí para el porqué de la elección con una sola rama.
 */
export function Barra({ entornos, entornoActivo, proyectos, sesionActiva, alElegirEntorno, alAbrirSesion, alAbrirProyecto, alNuevaSesion }: {
  entornos: { id: string; nombre: string }[];
  entornoActivo: string;
  proyectos: Proyecto[];
  sesionActiva?: string;
  alElegirEntorno: (id: string) => void;
  alAbrirSesion: (proyecto: string, sesion: string) => void;
  /** El nombre del proyecto es ahora un botón: pide su rama y lo abre (o lo enseña, si ya
   *  estaba abierto — el servidor no distingue, `completarProyecto`/`abrirProyecto` corren
   *  igual). */
  alAbrirProyecto: (proyecto: string) => void;
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
                    <button
                      type="button"
                      className={estilos.proyecto}
                      onClick={() => alAbrirProyecto(p.id)}
                    >
                      {p.nombre}
                    </button>
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
