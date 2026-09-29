import { useState } from "react";
import { Modal, Button } from "@deepseek-ai/dsh-client-ui-primitives";
import estilos from "./NuevaSesion.module.css";
import { Desplegable } from "./Desplegable.js";

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
 * **Es modal de verdad: solo se cierra con «Cancelar».** Ni el velo ni `Escape`: con una
 * descarga de minutos en marcha, un clic fuera de la ventana la hacía desaparecer y dejaba
 * solo el «descargando…» de la fila para saber qué pasaba.
 *
 * **Mientras no están las ramas DE ESTE proyecto, el combo y «Empezar» esperan bloqueados**,
 * con la carga DENTRO del propio combo. Quien decide que son de este proyecto es `App.tsx` (`ramasDe`):
 * aquí llegan vacías hasta entonces, y eso es lo que impide empezar con la rama de otro.
 *
 * **Y al empezar la descarga, la ventana se queda** con «Descargando proyecto…» y «Empezar»
 * bloqueado hasta que el servidor diga cómo acabó: si abre el proyecto, `App.tsx` la cierra;
 * si falla, el motivo sale debajo del combo y se puede volver a intentar.
 */
export function NuevaSesion({
  proyecto,
  local,
  ramas,
  aviso,
  descargando,
  alEmpezar,
  alCerrar,
}: {
  proyecto: { id: string; nombre: string };
  /** La copia local ya existe (lo dice el servidor): entonces no hay rama que elegir. */
  local: boolean;
  /**
   * Las ramas DE ESTE proyecto. Vacío mientras el servidor las busca —se piden al abrir esta
   * ventana—, y eso se dice en vez de fingir una lista.
   */
  ramas: readonly string[];
  /**
   * Lo que falló en el último paso —consultar las ramas o descargar—, si falló. Sin esto la
   * ventana se quedaba en «consultando» para siempre cuando la consulta reventaba.
   */
  aviso?: string;
  /** La descarga pedida desde esta ventana está EN MARCHA. */
  descargando?: boolean;
  /** `rama` solo cuando hay que bajar el proyecto; con copia local no se manda ninguna. */
  alEmpezar: (rama?: string) => void;
  alCerrar: () => void;
}) {
  // La primera rama es la preseleccionada, y se ve cuál es. `undefined` mientras no haya
  // llegado ninguna: no se elige por el usuario un valor que aún no existe.
  const [rama, setRama] = useState<string | undefined>(undefined);
  const elegida = rama !== undefined && ramas.includes(rama) ? rama : ramas[0];
  const enMarcha = descargando === true;
  const cargandoRamas = !local && ramas.length === 0 && aviso === undefined;

  return (
    // Capa y velo propios: los CSS Modules del primitivo son stubs vacíos y su diálogo no
    // trae ni posición ni tamaño — sin esto la ventana se pinta al final del `body`, fuera
    // de la vista. Mismo motivo y misma solución que en `Ajustes` y `Aprobacion`.
    //
    // `onClose` NO cierra: es por donde el primitivo avisa del `Escape`, y esta ventana solo
    // se cierra con «Cancelar».
    <Modal open onClose={() => {}} title="Nueva sesión" headless className={estilos.capa}>
      <div className={estilos.velo}>
        <div className={estilos.ventana} {...(enMarcha || cargandoRamas ? { "aria-busy": "true" as const } : {})}>
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
              {/* El combo está SIEMPRE, y bloqueado mientras no hay nada que elegir o se está
                  descargando: que aparezca y desaparezca movía la ventana entera. */}
              <Desplegable
                id="nueva-sesion-rama"
                className={estilos.campo}
                value={elegida ?? ""}
                disabled={ramas.length === 0 || enMarcha}
                cargando={cargandoRamas}
                onChange={(e) => setRama(e.target.value)}
              >
                {ramas.length === 0 ? (
                  <option value="">{cargandoRamas ? "cargando las ramas…" : "sin ramas que elegir"}</option>
                ) : (
                  ramas.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))
                )}
              </Desplegable>
              {/* La carga de las ramas va DENTRO del combo (la señal en el sitio de la flecha y
                  «cargando las ramas…» como su texto). Debajo, UNA de dos cosas: la descarga en
                  marcha, o por qué falló el último paso. */}
              {enMarcha ? (
                <p className={estilos.carga} role="status">
                  <span className={estilos.girando} aria-hidden="true" />
                  Descargando proyecto…
                </p>
              ) : aviso !== undefined ? (
                <p className={estilos.fallo} role="alert">
                  {ramas.length === 0 ? "No se pudieron consultar las ramas" : "No se pudo descargar el proyecto"}: {aviso}
                </p>
              ) : null}
            </>
          )}
          <div className={estilos.acciones}>
            {/* Cancelar sigue vivo durante la descarga: cierra la ventana, no la descarga,
                que sigue y se ve en la fila del proyecto. Una ventana sin salida mientras un
                servidor tarda minutos sería peor. */}
            <Button variant="outline" className={estilos.accion} onClick={alCerrar}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              className={`${estilos.accion} ${estilos.principal}`}
              // Sin rama que mandar no se puede empezar lo que hay que bajar, y con la
              // descarga en marcha un segundo clic pediría otra encima.
              disabled={enMarcha || (!local && elegida === undefined)}
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
