import { useState } from "react";
import { Modal, Button } from "@deepseek-ai/dsh-client-ui-primitives";
import estilos from "./NuevaSesion.module.css";

/**
 * Empezar una sesión en un proyecto, con una ventana delante.
 *
 * Antes esto no preguntaba nada: el «+» de la barra abría la sesión de golpe, y si la copia
 * local no estaba, la elección de rama aparecía como un selector flotando en mitad del
 * centro, sin decir de qué proyecto era ni que iba a DESCARGAR el proyecto entero. Las dos
 * cosas son la misma decisión y se toman en el mismo sitio.
 *
 * Los dos casos que pinta son los dos estados reales del proyecto, y los distingue por un
 * dato del servidor (`local`) y no por adivinarlo:
 *
 * - **Ya bajado**: no hay nada que preguntar. Un botón, y a trabajar.
 * - **Sin bajar**: hace falta la rama ORIGEN, y se dice que se va a descargar — que es lo
 *   que de verdad va a pasar y puede tardar. Con una sola rama disponible se preselecciona
 *   (mismo criterio que el alta de terminal), pero se ENSEÑA: elegir por el usuario y
 *   callarlo es cómo se acaba trabajando sobre la rama equivocada.
 *
 * Lo que NO hace es empezar sola. Cerrar no abre nada, y esa es la diferencia con lo de
 * antes: pulsar «+» por error costaba una descarga.
 */
export function NuevaSesion({
  proyecto,
  local,
  ramas,
  aviso,
  alEmpezar,
  alCerrar,
}: {
  proyecto: { id: string; nombre: string };
  /** La copia local ya existe (lo dice el servidor): entonces no hay rama que elegir. */
  local: boolean;
  /**
   * Las ramas del proyecto, cuando hacen falta. Vacío mientras el servidor las busca —se
   * piden al abrir esta ventana—, y eso se dice en vez de fingir una lista.
   */
  ramas: readonly string[];
  /**
   * Lo que falló al buscarlas, si falló. Sin esto la ventana se quedaba en «consultando las
   * ramas…» para siempre cuando la consulta reventaba —CloudStudio pide una sesión MCP viva
   * y puede fallar—: el motivo viajaba en el mensaje de alta y aterrizaba en un acto de
   * sistema, que es la OTRA pantalla. Un «cargando» eterno es un fallo mudo con animación.
   */
  aviso?: string;
  /** `rama` solo cuando hay que bajar el proyecto; con copia local no se manda ninguna. */
  alEmpezar: (rama?: string) => void;
  alCerrar: () => void;
}) {
  // La primera rama es la preseleccionada, y se ve cuál es. `undefined` mientras no haya
  // llegado ninguna: no se elige por el usuario un valor que aún no existe.
  const [rama, setRama] = useState<string | undefined>(undefined);
  const elegida = rama ?? ramas[0];

  return (
    // Capa y velo propios: los CSS Modules del primitivo son stubs vacíos y su diálogo no
    // trae ni posición ni tamaño — sin esto la ventana se pinta al final del `body`, fuera
    // de la vista. Mismo motivo y misma solución que en `Ajustes` y `Aprobacion`.
    <Modal open onClose={alCerrar} title="Nueva sesión" headless className={estilos.capa}>
      <div
        className={estilos.velo}
        onClick={(evento) => {
          if (evento.target === evento.currentTarget) alCerrar();
        }}
      >
        <div className={estilos.ventana}>
          <h2 className={estilos.titulo}>Nueva sesión en {proyecto.nombre}</h2>
          {local ? (
            <p className={estilos.nota}>La copia local ya está en tu equipo: se abre y ya.</p>
          ) : (
            <>
              <p className={estilos.nota}>
                Este proyecto todavía no está en tu equipo. Al empezar se descarga entero desde
                CloudStudio, y eso puede tardar.
              </p>
              <label className={estilos.etiqueta} htmlFor="nueva-sesion-rama">
                Rama de origen
              </label>
              {ramas.length === 0 ? (
                aviso === undefined ? (
                  <p className={estilos.espera}>consultando las ramas…</p>
                ) : (
                  // El motivo, donde el usuario está mirando. Y sin desplegable: no hay nada
                  // que elegir, así que enseñar uno vacío sería fingir que sí.
                  <p className={estilos.fallo} role="alert">
                    No se pudieron consultar las ramas: {aviso}
                  </p>
                )
              ) : (
                <select
                  id="nueva-sesion-rama"
                  className={estilos.campo}
                  value={elegida ?? ""}
                  onChange={(e) => setRama(e.target.value)}
                >
                  {ramas.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              )}
            </>
          )}
          <div className={estilos.acciones}>
            <Button variant="outline" className={estilos.accion} onClick={alCerrar}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              className={estilos.accion}
              // Sin rama que mandar no se puede empezar lo que hay que bajar: el botón
              // espera a que lleguen, en vez de mandar un `undefined` que el servidor
              // tendría que interpretar.
              disabled={!local && elegida === undefined}
              onClick={() => alEmpezar(local ? undefined : elegida)}
            >
              {/* «Empezar» en los dos casos. Lo que la descarga implica ya lo dice el
                  párrafo de arriba —y con más detalle del que cabe en un botón—; ponerlo
                  también aquí era decir dos veces lo mismo y hacer que la acción se llamara
                  distinta según el estado del proyecto, cuando es la misma. */}
              Empezar
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
