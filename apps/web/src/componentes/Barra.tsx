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
import { MenuDeSesion } from "./MenuDeSesion.js";
import { IconoDeEntorno } from "./IconoDeEntorno.js";
import { selloDeFecha } from "../selloDeFecha.js";
import estilos from "./Barra.module.css";

/** El sello de una fila, o nada si no hay hora que pintar. Envuelve a `selloDeFecha` solo
 *  para que la fila no tenga que repetir la comprobación de ausencia. */
const selloDeSesion = (iso: string | undefined): string | undefined =>
  iso === undefined ? undefined : selloDeFecha(iso);

/**
 * Las sesiones ordenadas por su ÚLTIMO turno, las recientes arriba.
 *
 * Las que no traen hora van al final —no se les inventa una fecha ni se las mete por
 * medio— y entre ellas se mantiene el criterio de SIEMPRE: al revés del índice, que las
 * guarda en orden de alta, así que invertirlo es «las más recientes arriba». Es lo único
 * que se sabe de ellas, y es el mismo orden que enseña el escritorio.
 */
export function ordenarPorUltimoTurno<T extends { ultimoTurno?: string }>(sesiones: readonly T[]): T[] {
  const conHora = sesiones.filter((s) => s.ultimoTurno !== undefined);
  const sinHora = sesiones.filter((s) => s.ultimoTurno === undefined).reverse();
  // Los ISO se comparan como texto a propósito: con la misma zona (`Z`, que es lo que
  // escribe `toISOString`) el orden lexicográfico ES el cronológico, y no hay que
  // construir dos `Date` por comparación.
  conHora.sort((a, b) => (b.ultimoTurno ?? "").localeCompare(a.ultimoTurno ?? ""));
  return [...conHora, ...sinHora];
}

export interface Proyecto {
  id: string;
  nombre: string;
  sesiones: {
    id: string;
    titulo: string;
    historica?: boolean;
    /** Cuándo se tocó por última vez, ISO. Ordena la lista y se pinta a la derecha.
     *  Ausente = el índice no lo dice: sin sello, y esa fila va la última. */
    ultimoTurno?: string;
    /** La abrió una TAREA de fondo. **Ausente es «no consta»**, no «es una conversación»:
     *  no la llevan las sesiones anteriores a la marca, y se pintan lisas porque liso es
     *  lo conservador. */
    deTarea?: true;
    /**
     * Tiene un turno EN MARCHA ahora mismo, esté o no delante. Es lo que hace visible que
     * cambiar de sesión ya no interrumpe al agente: la conversación que dejaste atrás sigue
     * trabajando y la barra lo dice. **Ausente es «no consta que trabaje»**, igual que las
     * otras dos marcas de esta fila.
     */
    trabajando?: true;
  }[];
  /**
   * Compartido CONTIGO por otra persona (`shared` de CloudStudio). **Ausente no es «es
   * tuyo»**: es que el servidor no lo dijo, y entonces no se pinta NADA — ni «propio» ni
   * «compartido»—, que es lo único honesto cuando el dato no ha llegado.
   */
  compartido?: boolean;
  /**
   * Alguna sesión de este proyecto tiene un turno EN MARCHA. No se deduce de `sesiones`: una
   * sesión nueva no tiene fila en el índice hasta que vuelca su primer acto, así que el caso
   * más común —abrir, pedir algo, irse a otro proyecto— no habría marcado nada.
   *
   * De aquí cuelgan dos cosas: la marca del proyecto, y que las OTRAS sesiones de ese
   * proyecto no se puedan pulsar mientras dure — una copia de trabajo no aguanta dos
   * conversaciones y el servidor lo declina, así que decirlo ANTES del clic es lo que evita
   * el botón muerto.
   */
  trabajando?: true;
}

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
 * NADA de la marca de DeepSeek viaja aquí, y desde el rediseño tampoco la nuestra: la fila
 * de marca (`.logoRow`, `.brandName`, y el `.brandMark` donde el original monta su
 * `FishLogo`) se fue entera. El nombre del producto vive ahora en la barra superior
 * (`Cabecera.tsx`), que cruza las dos columnas — tenerlo en los dos sitios era decirlo dos
 * veces en la misma esquina.
 */
/**
 * Cuántos proyectos se enseñan cuando nadie ha dicho cuáles.
 *
 * Un CloudStudio con doscientos proyectos no cabe en una barra lateral, y el que importa
 * hoy lo sabe la persona y no el servidor. Cuatro es la omisión —lo que se ve sin
 * configurar nada—; en Ajustes se eligen los que sean, y esa elección MANDA sobre este
 * tope: quien pide seis, ve seis.
 */
export const PROYECTOS_POR_OMISION = 4;

export function Barra({ entornos, entornoActivo, proyectos, visibles, proyectoActivo, sesionActiva, abriendo, alElegirEntorno, alAbrirSesion, alAbrirProyecto, alNuevaSesion, alAccionDeSesion, alAbrirAjustes, conectado }: {
  entornos: { id: string; nombre: string }[];
  entornoActivo: string;
  proyectos: Proyecto[];
  /**
   * Los ids elegidos para ESTE entorno. **Ausente no es «ninguno»**: es que nadie lo ha
   * dicho, y entonces se enseñan los `PROYECTOS_POR_OMISION` primeros. Una lista vacía sí
   * es una elección y se respeta — la barra se queda sin proyectos y lo dice.
   */
  visibles?: readonly string[];
  /**
   * El proyecto ABIERTO ahora mismo, y su sesión. Ausentes = no se sabe, y entonces no se
   * marca nada: marcar «el primero» por no tener el dato es peor que no marcar, porque una
   * fila resaltada afirma que ahí es donde estás.
   */
  proyectoActivo?: string;
  sesionActiva?: string;
  /**
   * Qué se está abriendo AHORA, dicho por el servidor. Entre el clic y la sesión abierta
   * pasan de unos cientos de milisegundos a los minutos de una descarga, y sin señal la
   * barra se queda igual que estaba: el clic se lee como que no ha hecho nada. Ausente =
   * no se está abriendo nada.
   */
  abriendo?: { proyecto?: string; sesion?: string; descargando?: true };
  alElegirEntorno: (id: string) => void;
  alAbrirSesion: (proyecto: string, sesion: string) => void;
  /** El nombre del proyecto es un botón: pide su rama y lo abre (o lo enseña, si ya
   *  estaba abierto — el servidor no distingue, `completarProyecto`/`abrirProyecto` corren
   *  igual). */
  alAbrirProyecto: (proyecto: string) => void;
  /** Ver el comentario de cabecera: la acción existe, el mensaje del cable todavía no. */
  alNuevaSesion: (proyecto: string) => void;
  /**
   * Lo que se ha elegido en el «…» de una sesión. La barra NO ejecuta ninguna de las dos:
   * las dos escriben y una además es irreversible, así que van a un diálogo que las
   * confirma, y ese diálogo es de la aplicación (`App.tsx`) y no de la barra — se pinta
   * sobre la pantalla entera, no dentro de una columna de 280px.
   */
  alAccionDeSesion: (
    proyecto: string,
    sesion: string,
    titulo: string,
    accion: "renombrar" | "borrar"
  ) => void;
  /**
   * «Ajustes», ahora una entrada de verdad y no una línea de texto suelta. Lo que hace
   * lo decide `App.tsx`: no hay panel de ajustes que abrir, hay un comando de barra
   * (`/config`), y quién sabe mandarlo por el cable es quien tiene el `enviar`.
   */
  alAbrirAjustes: () => void;
  /**
   * Si el cable está vivo. Sin él, todo lo que manda algo al servidor se apaga: cambiar de
   * entorno, abrir un proyecto o una sesión, el «+» y el «…». Medido sin servidor: la barra
   * seguía entera y pulsable con un «sin conexión» pequeño arriba. «Ajustes» se queda: la
   * apariencia es de este navegador y funciona sin cable.
   */
  conectado?: boolean;
}) {
  const apagado = conectado === false;

  /**
   * Abrir algo tarda, y la señal va donde estaba el clic: en la fila. Se distingue el
   * proyecto de la sesión porque son dos filas distintas —una sesión guardada se abre desde
   * la suya— y porque una sesión NUEVA no tiene fila todavía: en ese caso el indicador se
   * queda en la del proyecto, que es donde está su «+».
   */
  const abriendoProyecto = (id: string): boolean =>
    abriendo !== undefined && abriendo.proyecto === id && abriendo.sesion === undefined;
  const abriendoSesion = (id: string): boolean => abriendo !== undefined && abriendo.sesion === id;
  /** Mientras se abre algo no se pide otra cosa: el segundo clic no cancela el primero. */
  const abriendoAlgo = abriendo !== undefined;
  // El orden de `visibles` NO manda: manda el del listado, que es el del servidor. Elegir
  // qué se ve es una cosa; reordenar el listado remoto sería otra, y nadie la ha pedido.
  const alaVista =
    visibles === undefined
      ? proyectos.slice(0, PROYECTOS_POR_OMISION)
      : proyectos.filter((p) => visibles.includes(p.id));
  const ocultos = proyectos.length - alaVista.length;

  return (
    <nav className={barra.root}>
      {/* La marca ya NO va aquí: vive en la barra superior (`Cabecera.tsx`) desde que esa
          cruza las dos columnas. Tenerla en las dos era decir el nombre del producto dos
          veces en la misma esquina, y con la tira azul de lado a lado la de la lateral
          quedaba debajo, suelta y sin superficie de marca que la sostuviera. */}

      <div className={barra.regionArea}>
        <div className={navegador.root}>
          {/* Nivel 1 — el entorno. El `<select>` es nuestro: en su barra no hay nada
              equivalente de lo que copiar el estilo. */}
          <div className={navegador.sectionHeader}>
            <span className={clsx(navegador.sectionLabel, estilos.rotulo)}>Entorno</span>
            <span className={estilos.rellenoDeSeccion} />
          </div>
          {entornos.length === 0 ? (
            <p className={navegador.empty}>Sin entorno que enseñar aquí todavía.</p>
          ) : (
            <div className={estilos.filaDeEntorno}>
            {/* El icono va FUERA del `<select>`: un `<option>` no admite marcado, así que
                lo que se puede pintar es la marca del entorno ACTIVO — que además es la
                pregunta que uno se hace mirando esa esquina («¿en qué servidor estoy?»). */}
            <IconoDeEntorno entorno={entornoActivo} size={20} className={estilos.iconoDeEntorno} />
            <select
              className={estilos.entorno}
              disabled={apagado}
              value={entornoActivo}
              onChange={(e) => alElegirEntorno(e.target.value)}
            >
              {entornos.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nombre}
                </option>
              ))}
            </select>
            </div>
          )}

          {/* Niveles 2 y 3 — proyectos, y dentro de cada uno sus sesiones. */}
          <div className={navegador.sectionHeader}>
            <span className={clsx(navegador.sectionLabel, estilos.rotulo)}>Proyectos</span>
            <span className={estilos.rellenoDeSeccion} />
          </div>
          <div className={navegador.listArea}>
            <div className={navegador.treeBody}>
              <div className={navegador.list}>
                {alaVista.length === 0 ? (
                  <p className={navegador.empty}>
                    {proyectos.length === 0
                      ? "Sin proyectos que enseñar aquí todavía."
                      : "Ninguno elegido para esta barra; elígelos en Ajustes."}
                  </p>
                ) : (
                  alaVista.map((p) => (
                    <div key={p.id} className={navegador.groupSection}>
                      <div
                        className={clsx(
                          filas.projectRow,
                          estilos.filaConAccion,
                          p.id === proyectoActivo && estilos.filaAbierta
                        )}
                        // Dos señales para lo mismo y no una: el color de fondo lo pierde
                        // quien no distingue bien los tonos, y el `aria-current` es lo que
                        // se lo dice a un lector de pantalla.
                        {...(p.id === proyectoActivo ? { "aria-current": "true" as const } : {})}
                        {...(abriendoProyecto(p.id) ? { "aria-busy": "true" as const } : {})}
                      >
                        <button
                          type="button"
                          className={clsx(estilos.reseteoDeBoton, estilos.cuerpoDeFila)}
                          disabled={apagado || abriendoAlgo}
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
                            {/* El proyecto activo se marca con el fondo y con el NOMBRE, no
                                con el filo de cian: ese se quedó para la fila que estás
                                leyendo (ver `Barra.module.css`). */}
                            <span className={clsx(filas.title, p.id === proyectoActivo && estilos.tituloActivo)}>
                              {p.nombre}
                            </span>
                          </span>
                          {abriendoProyecto(p.id) ? (
                            <span
                              className={estilos.actividad}
                              // Con PALABRAS y no solo con el giro: una descarga son minutos
                              // y un punto que gira no distingue eso de medio segundo.
                              title={abriendo?.descargando === true ? "Descargando el proyecto…" : "Abriendo…"}
                            >
                              {abriendo?.descargando === true ? "descargando…" : "abriendo…"}
                            </span>
                          ) : p.trabajando ? (
                            /*
                              Y en el proyecto, porque la lista de sesiones se puede plegar:
                              sin esto, un turno corriendo en una conversación de otro
                              proyecto no se vería en ninguna parte. Dice «trabajando» y no
                              cuántas: una basta para que haya que volver.
                            */
                            <span className={estilos.actividad} title="El agente está trabajando en este proyecto…">
                              trabajando…
                            </span>
                          ) : null}
                          {/*
                            De quién es. Tres cosas de esta etiqueta:

                            - Va con una PALABRA y no solo con un color, como el
                              `aria-current` de la fila abierta o el «+n −n» de los
                              ficheros: un punto de color no lo lee quien no distingue los
                              tonos, ni un lector de pantalla.
                            - Solo si el servidor lo dijo. `undefined` no pinta NADA, ni
                              «propio» ni «compartido».
                            - Al lado del nombre y no debajo: su `.projectText` es una
                              columna y meterla dentro habría partido la fila en dos
                              líneas, deshaciendo la decisión que su propia hoja documenta
                              («Compact one-line Workspace row»).
                          */}
                          {p.compartido === undefined ? null : (
                            <span className={estilos.duenno} data-compartido={p.compartido ? "" : undefined}>
                              {p.compartido ? "compartido" : "propio"}
                            </span>
                          )}
                        </button>
                        <span className={clsx(filas.rowActions, estilos.accionesDeFila)}>
                          <button
                            type="button"
                            className={filas.iconButton}
                            // Y una sesión NUEVA aquí tampoco: sería la segunda sobre la
                            // misma copia de trabajo, o sea el mismo rechazo.
                            disabled={apagado || abriendoAlgo || p.trabajando === true}
                            {...(p.trabajando === true
                              ? { title: "este proyecto está trabajando: espera a que termine" }
                              : {})}
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
                        // Las más recientes ARRIBA, por el ÚLTIMO TURNO y no por el orden
                        // de alta del índice: era `[...].reverse()`, así que una
                        // conversación vieja reabierta hoy se quedaba abajo del todo. Las
                        // que no traen hora van al final —no se les inventa una— y entre
                        // ellas se conserva el orden que traían, que es lo único que se
                        // sabe de ellas.
                        ordenarPorUltimoTurno(p.sesiones).map((s) => (
                          /*
                            Un `<div>` con un botón dentro y el menú al lado, no un botón
                            suelto: el «…» es interactivo y anidarlo dentro del botón de la
                            fila es HTML inválido —un control dentro de otro—, con el clic
                            repartido entre los dos. Es la misma forma que ya tiene la fila
                            de proyecto aquí arriba, y la que la hoja copiada da por hecha
                            (`.sessionRow:hover .rowActions`).
                          */
                          <div
                            key={s.id}
                            className={clsx(
                              filas.sessionRow,
                              estilos.filaConAccion,
                              // NO `filas.selected`: esa clase de la hoja copiada pinta el
                              // MISMO fondo que `:hover`, así que la sesión abierta y la
                              // fila que tienes debajo del ratón se ven idénticas — medido
                              // en pantalla. Se marca como el proyecto abierto: fondo MÁS
                              // barra de acento, y `aria-current` para quien no distingue
                              // el color.
                              s.id === sesionActiva && estilos.sesionAbierta,
                              s.historica && estilos.historica
                            )}
                            {...(s.id === sesionActiva ? { "aria-current": "true" as const } : {})}
                            {...(abriendoSesion(s.id) ? { "aria-busy": "true" as const } : {})}
                          >
                            <button
                              type="button"
                              className={clsx(estilos.reseteoDeBoton, estilos.cuerpoDeFila)}
                              /*
                                Con este proyecto trabajando, solo se puede pulsar LA que
                                trabaja: volver a ella es el buen caso —es lo que uno hace
                                para ver cómo va— y las demás las declina el servidor, porque
                                dos conversaciones sobre la misma copia de trabajo se
                                pisarían los ficheros. Decirlo antes del clic es lo que evita
                                el botón muerto; la guarda del servidor sigue estando, que es
                                quien manda si esta lista llega vieja.

                                Si el turno corre en una sesión que aún no tiene fila (una
                                nueva, antes de su primer volcado) no hay ninguna marcada y
                                se apagan todas — que es exactamente lo que el servidor
                                contestaría.
                              */
                              disabled={apagado || abriendoAlgo || (p.trabajando === true && s.trabajando !== true)}
                              {...(p.trabajando === true && s.trabajando !== true
                                ? { title: "este proyecto está trabajando en otra conversación" }
                                : {})}
                              onClick={() => alAbrirSesion(p.id, s.id)}
                            >
                              <span className={filas.slot} aria-hidden="true" />
                              <span className={filas.title}>
                                {/*
                                  Una sesión de tarea llega SIN título: el título sale del
                                  primer acto de `usuario` y una tarea no manda ninguno. Se
                                  ROTULA lo que falta —no se inventa un título—, porque una
                                  fila en blanco no se puede ni leer ni reconocer.

                                  Y sin marca se rotula igual pero sin decir de quién es: es
                                  el caso de las sesiones de tarea anteriores a la marca, y
                                  ahí «no consta» no puede convertirse en «es una tarea».
                                */}
                                {s.titulo !== "" ? s.titulo : s.deTarea ? "Tarea de fondo" : "Sin título"}
                              </span>
                              {s.deTarea ? (
                                // Con PALABRAS y no solo con un color: es lo que distingue
                                // una conversación tuya de lo que escribió una tarea sola, y
                                // un color no lo dice ni a quien no lo ve ni a un lector de
                                // pantalla.
                                <span className={estilos.marcaDeTarea}>Tarea</span>
                              ) : null}
                              {/* Mientras se abre, en el hueco de la fecha va la actividad:
                                  es el sitio donde ya se mira, y la fecha de la sesión que
                                  estás abriendo no aporta nada en ese segundo. */}
                              {abriendoSesion(s.id) ? (
                                <span className={estilos.actividad} title="Abriendo…">
                                  abriendo…
                                </span>
                              ) : s.trabajando ? (
                                /*
                                  El agente está trabajando en esa conversación AHORA. Va en
                                  el hueco de la fecha y con la misma pieza que «abriendo…»,
                                  por dos razones: es el sitio donde ya se mira, y mientras un
                                  turno corre la fecha del último no aporta nada — es
                                  justamente el dato que está a punto de cambiar.

                                  Con PALABRAS, como las otras dos marcas de esta fila: un
                                  punto animado no lo lee quien no distingue el movimiento ni
                                  un lector de pantalla, y `aria-busy` habla de lo que la
                                  interfaz está esperando, no de lo que hace el agente.
                                */
                                <span className={estilos.actividad} title="El agente está trabajando…">
                                  trabajando…
                                </span>
                              ) : selloDeSesion(s.ultimoTurno) === undefined ? null : (
                                <span className={estilos.selloDeFecha}>{selloDeSesion(s.ultimoTurno)}</span>
                              )}
                            </button>
                            {apagado ? null : (
                            <MenuDeSesion
                              titulo={s.titulo}
                              className={estilos.accionesDeFila}
                              alRenombrar={() => alAccionDeSesion(p.id, s.id, s.titulo, "renombrar")}
                              alBorrar={() => alAccionDeSesion(p.id, s.id, s.titulo, "borrar")}
                            />
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  ))
                )}
                {/*
                  Lo que NO se está viendo se dice, y se dice dónde se arregla. Callarlo
                  dejaría creer que el entorno solo tiene cuatro proyectos — el listado
                  remoto trae los que trae, y esto es un tope de presentación, no la verdad
                  sobre el servidor.
                */}
                {ocultos > 0 ? (
                  <p className={clsx(navegador.empty, estilos.sinSesiones)}>
                    {ocultos === 1 ? "1 proyecto más sin enseñar" : `${ocultos} proyectos más sin enseñar`} · elígelos en
                    Ajustes
                  </p>
                ) : null}
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
