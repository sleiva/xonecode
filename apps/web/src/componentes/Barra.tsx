import clsx from "clsx";
import {
  IconFolderClose16,
  IconNewChatOutline16,
  IconSettingsOutline16,
} from "@deepseek-ai/dsh-client-ui-primitives";
import barra from "../../estilos/SidebarRoot.module.css";
import navegador from "../../estilos/WorkspaceBrowser.module.css";
import filas from "../../estilos/Rows.module.css";
import ajustes from "../../estilos/SettingsRoot.module.css";
import estilos from "./Barra.module.css";

export interface Proyecto { id: string; nombre: string; sesiones: { id: string; titulo: string; historica: boolean }[] }

/**
 * La barra, ahora con el CSS de deepseek en vez de la aproximación a mano que había:
 * el armazón de la columna es `estilos/SidebarRoot.module.css` (fila de marca arriba,
 * `.regionArea` elástica en medio, `.footArea` clavado abajo), la zona de listas es
 * `estilos/WorkspaceBrowser.module.css` y cada fila es `estilos/Rows.module.css`. El pie
 * es el asiento de `estilos/SettingsRoot.module.css`. Recolorear todo esto vuelve a ser
 * cambiar el VALOR de un token en un sitio, que es lo que pidió el usuario.
 *
 * **Tres niveles, no dos.** Es lo que NO se copia de ellos: deepseek tiene workspace →
 * sesión, y aquí hay entorno → proyectos → sesiones. Se toma su oficio y su CSS, no su
 * modelo de información: el entorno se queda con su `<select>` (nuestro, en
 * `Barra.module.css`) porque en su barra no hay nada equivalente que copiar.
 *
 * **Las filas son `<button>`, no los `<div role="treeitem">` del original.** Allí el
 * árbol se recorre con el teclado y el rol lo justifica; aquí no hay navegación de árbol
 * —una fila solo abre lo que nombra—, y un `<div>` con `onClick` sería una fila que el
 * teclado no alcanza. La contrapartida es que su `.projectRow`/`.sessionRow` da por hecho
 * un `<div>` y no resetea nada de botón, así que el reseteo lo pone `.reseteoDeBoton`
 * (`Barra.module.css`) en la misma etiqueta — el mismo apaño que `Maqueta.tsx` usa para
 * la altura del marco, y por el mismo motivo: no tocar la hoja copiada.
 *
 * **No hay botón global de «sesión nueva»**, que en su barra es el control más visible
 * (`.newSession` de la hoja copiada, sin ocupante aquí). Crear una sesión desde cero
 * necesitaría una clase del cable que hoy no existe —`vestibulo.ts` solo sabe ABRIR un
 * proyecto—, y un botón que no hace nada es justo el fallo mudo que este repo persigue.
 * La acción por proyecto sí se enseña (en `.rowActions`, que solo salen al posar el
 * ratón) porque el criterio de aceptación la pide y el manejador puede llegar el día que
 * el cable la lleve; hasta entonces `App.tsx` le pasa uno que no hace nada, igual que a
 * `alElegirEntorno`.
 *
 * NADA de la marca de DeepSeek viaja aquí: la ranura `.brandName` la ocupa el nombre de
 * xonecode, y `.brandMark` —donde el original monta su `FishLogo`— se queda vacía.
 */
export function Barra({ entornos, entornoActivo, proyectos, sesionActiva, alElegirEntorno, alAbrirSesion, alAbrirProyecto, alNuevaSesion, alAbrirAjustes }: {
  entornos: { id: string; nombre: string }[];
  entornoActivo: string;
  proyectos: Proyecto[];
  sesionActiva?: string;
  alElegirEntorno: (id: string) => void;
  alAbrirSesion: (proyecto: string, sesion: string) => void;
  /** El nombre del proyecto es un botón: pide su rama y lo abre (o lo enseña, si ya
   *  estaba abierto — el servidor no distingue, `completarProyecto`/`abrirProyecto` corren
   *  igual). */
  alAbrirProyecto: (proyecto: string) => void;
  /** Ver el comentario de cabecera: la acción existe, el mensaje del cable todavía no. */
  alNuevaSesion: (proyecto: string) => void;
  /**
   * «Ajustes», ahora una entrada de verdad y no una línea de texto suelta. Lo que hace
   * lo decide `App.tsx`: no hay panel de ajustes que abrir, hay un comando de barra
   * (`/config`), y quién sabe mandarlo por el cable es quien tiene el `enviar`.
   */
  alAbrirAjustes: () => void;
}) {
  return (
    <nav className={barra.root}>
      {/* La fila de marca. Sin `.brandMark`: ahí es donde el original monta su logo, y
          copiar el CSS no hace nuestro su dibujo. */}
      <div className={barra.logoRow}>
        <span className={clsx(barra.brand, estilos.marcaSinBoton)}>
          <span className={barra.brandIdentity}>
            <span className={barra.brandName}>
              <span className={barra.fallbackBrandName}>xonecode</span>
            </span>
          </span>
        </span>
      </div>

      <div className={barra.regionArea}>
        <div className={navegador.root}>
          {/* Nivel 1 — el entorno. El `<select>` es nuestro: en su barra no hay nada
              equivalente de lo que copiar el estilo. */}
          <div className={navegador.sectionHeader}>
            <span className={navegador.sectionLabel}>Entorno</span>
            <span className={estilos.rellenoDeSeccion} />
          </div>
          {entornos.length === 0 ? (
            <p className={navegador.empty}>Sin entorno que enseñar aquí todavía.</p>
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

          {/* Niveles 2 y 3 — proyectos, y dentro de cada uno sus sesiones. */}
          <div className={navegador.sectionHeader}>
            <span className={navegador.sectionLabel}>Proyectos</span>
            <span className={estilos.rellenoDeSeccion} />
          </div>
          <div className={navegador.listArea}>
            <div className={navegador.treeBody}>
              <div className={navegador.list}>
                {proyectos.length === 0 ? (
                  <p className={navegador.empty}>Sin proyectos que enseñar aquí todavía.</p>
                ) : (
                  proyectos.map((p) => (
                    <div key={p.id} className={navegador.groupSection}>
                      <div className={clsx(filas.projectRow, estilos.filaConAccion)}>
                        <button
                          type="button"
                          className={clsx(estilos.reseteoDeBoton, estilos.cuerpoDeFila)}
                          onClick={() => alAbrirProyecto(p.id)}
                        >
                          {/*
                            `.slot` sí, `.folder` NO. Esa clase solo existe en su hoja
                            para que la carpeta DESAPAREZCA al posar el ratón
                            (`.projectRow:hover .folder { display: none }`) y deje sitio a
                            un chevron que despliega la fila. Aquí las sesiones se enseñan
                            siempre —no hay nada que desplegar— y no hay chevron que
                            ponga, así que con `.folder` la fila se quedaba con el hueco
                            en blanco al pasar por encima: medido en pantalla.
                          */}
                          <span className={filas.slot} aria-hidden="true">
                            <IconFolderClose16 size={16} />
                          </span>
                          <span className={filas.projectText}>
                            <span className={filas.title}>{p.nombre}</span>
                          </span>
                        </button>
                        <span className={filas.rowActions}>
                          <button
                            type="button"
                            className={filas.iconButton}
                            onClick={() => alNuevaSesion(p.id)}
                            aria-label={`nueva sesión en ${p.nombre}`}
                          >
                            <IconNewChatOutline16 size={16} />
                          </button>
                        </span>
                      </div>
                      {p.sesiones.length === 0 ? (
                        <p className={clsx(navegador.empty, estilos.sinSesiones)}>Sin sesiones todavía.</p>
                      ) : (
                        p.sesiones.map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            className={clsx(
                              estilos.reseteoDeBoton,
                              filas.sessionRow,
                              s.id === sesionActiva && filas.selected,
                              s.historica && estilos.historica
                            )}
                            onClick={() => alAbrirSesion(p.id, s.id)}
                          >
                            <span className={filas.slot} aria-hidden="true" />
                            <span className={filas.title}>{s.titulo}</span>
                          </button>
                        ))
                      )}
                    </div>
                  ))
                )}
              </div>
              <div className={navegador.fade} aria-hidden="true" />
            </div>
          </div>
        </div>
      </div>

      {/* El pie. En la referencia es «Settings» y abre un panel; aquí es «Ajustes» y
          manda `/config` — el comando que ya existe (`COMANDOS` en `cli/consola.ts`) y
          cuya salida entra en el transcript como cualquier otra. Mismo asiento, misma
          geometría, misma tecla de color; lo que cambia es a dónde lleva. */}
      <div className={barra.footArea}>
        <div className={barra.settingsArea}>
          <div className={ajustes.triggerRow}>
            <button type="button" className={ajustes.trigger} onClick={alAbrirAjustes}>
              <IconSettingsOutline16 size={16} />
              <span className={ajustes.triggerLabel}>Ajustes</span>
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
