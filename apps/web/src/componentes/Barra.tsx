import { useEffect, useState } from "react";
import clsx from "clsx";
import {
  IconFolderClose16,
  IconFolderOpen16,
  IconTriangleRightFill14,
  IconNewChatOutline16,
  IconSettingsOutline16,
  IconCheckOutline16,
  IconDownloadOutline16,
} from "@deepseek-ai/dsh-client-ui-primitives";
import barra from "../../estilos/SidebarRoot.module.css";
import navegador from "../../estilos/WorkspaceBrowser.module.css";
import filas from "../../estilos/Rows.module.css";
import ajustes from "../../estilos/SettingsRoot.module.css";
import { MenuDeSesion } from "./MenuDeSesion.js";
import { Desplegable } from "./Desplegable.js";
import { IconoChincheta, IconoCompartido, IconoDeApp } from "./IconosDeProyecto.js";
import { IconoDeEntorno } from "./IconoDeEntorno.js";
import { selloDeFecha } from "../selloDeFecha.js";
import estilos from "./Barra.module.css";
import type { SesionDelCable } from "../tipos.js";

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

/**
 * Una fila de sesión de la barra: la del CABLE, sin una tercera copia escrita aquí. Era la
 * tercera declaración del mismo dato (host, `tipos.ts`, esta), y una fila redeclarada a mano es
 * como un campo nuevo se queda mudo en la barra sin que nada se ponga rojo.
 *
 * Lo único que se le AÑADE es `historica`, que no viaja por el cable: la marca `App.tsx` al
 * armar la lista, porque toda sesión de la barra es una relectura de un índice.
 */
export type FilaDeSesion = SesionDelCable & { historica?: boolean };

/**
 * Lo que va a la derecha del título de una fila, que es UNA de dos cosas y nunca las dos.
 *
 * Mientras la fila está ocupada —se está abriendo, o el agente trabaja en ella AHORA— va la
 * actividad, en el hueco donde ya se mira: ni la fecha ni el gasto de un turno en vuelo aportan
 * nada en ese segundo, y el gasto menos que nada, que es justo el dato a punto de cambiar. Con
 * PALABRAS y no un punto animado, como las otras marcas de la fila: un giro no lo lee quien no
 * distingue el movimiento ni un lector de pantalla, y `aria-busy` habla de lo que espera la
 * interfaz, no de lo que hace el agente.
 *
 * Y cuando no lo está, la FICHA: su sello de fecha. Llevaba delante el gasto de la sesión entera
 * (una Σ y su cifra) y se quitó por decisión suya: la lista contesta qué conversación es y de
 * cuándo, y lo que cuesta la abierta ya lo dice su contador. El total sigue en el índice
 * (`EntradaIndice.consumo`); lo que se retira es pintarlo aquí.
 *
 * Está extraído con nombre, y no dentro del `map` de la barra, porque ahí es donde este repo ya
 * ha escondido nueve composiciones que todos los tests doblaban.
 */
function FichaDeSesion({
  sesion,
  abriendo,
}: {
  sesion: FilaDeSesion;
  abriendo: boolean;
}): React.ReactElement | null {
  if (abriendo) {
    return (
      <span className={estilos.actividad} title="Abriendo…">
        abriendo…
      </span>
    );
  }
  if (sesion.trabajando === true) {
    return (
      <span className={estilos.actividad} title="El agente está trabajando…">
        trabajando…
      </span>
    );
  }
  const sello = selloDeSesion(sesion.ultimoTurno);
  // Sin fecha no se pinta NI el envoltorio: vacío seguiría llevándose el `margin-left: auto`.
  if (sello === undefined) return null;
  return (
    <span className={estilos.fichaDeSesion}>
      <span className={estilos.selloDeFecha}>{sello}</span>
    </span>
  );
}

/**
 * Una fila de proyecto con sus sesiones debajo. Extraída con nombre, y no dentro del `map` de
 * la barra, porque se pinta en DOS grupos —«Proyectos fijados» y «Proyectos»— y una copia por
 * grupo es cómo divergen el día que se toque una. Todo lo que decide llega por props: la fila
 * no sabe en qué grupo está.
 */
function FilaDeProyecto({
  p,
  desplegado,
  alPlegar,
  fijado,
  proyectoActivo,
  proyectoEnResumen,
  sesionActiva,
  abriendo,
  apagado,
  abriendoAlgo,
  alFijar,
  alAbrirProyecto,
  alNuevaSesion,
  alAbrirSesion,
  alAccionDeSesion,
}: {
  p: Proyecto;
  desplegado: string | undefined;
  alPlegar: () => void;
  fijado: boolean;
  proyectoActivo: string | undefined;
  proyectoEnResumen: string | undefined;
  sesionActiva: string | undefined;
  abriendo: { proyecto?: string; sesion?: string; entorno?: string; descargando?: true } | undefined;
  apagado: boolean;
  abriendoAlgo: boolean;
  alFijar: (proyecto: string, fijar: boolean) => void;
  alAbrirProyecto: (proyecto: string) => void;
  alNuevaSesion: (proyecto: string) => void;
  alAbrirSesion: (proyecto: string, sesion: string) => void;
  alAccionDeSesion: (proyecto: string, sesion: string, titulo: string, accion: "renombrar" | "borrar") => void;
}): React.ReactElement {
  /*
   * Abrir algo tarda, y la señal va donde estaba el clic: en la fila. Se distingue el
   * proyecto de la sesión porque son dos filas distintas —una sesión guardada se abre desde
   * la suya— y porque una sesión NUEVA no tiene fila todavía: en ese caso el indicador se
   * queda en la del proyecto, que es donde está su «+».
   */
  const abriendoProyecto = (id: string): boolean =>
    abriendo !== undefined && abriendo.proyecto === id && abriendo.sesion === undefined;
  const abriendoSesion = (id: string): boolean => abriendo !== undefined && abriendo.sesion === id;
  /*
   * **Una sola fila marcada en toda la barra**, esté en el grupo que esté. Con el resumen
   * delante manda el del resumen —es de él de quien habla el centro— y la sesión abierta
   * detrás no marca a su proyecto; sin resumen, el proyecto abierto. Marcar los dos dejaba dos
   * filas diciendo «aquí estás».
   *
   * Y con el resumen delante NINGÚN chat va marcado: no se está leyendo ninguno. La sesión
   * sigue abierta detrás, pero marcarla afirmaría que es lo que tienes delante.
   */
  const esLaMarcada = p.id === (proyectoEnResumen ?? proyectoActivo);
  const carpeta = p.id === desplegado ? <IconFolderOpen16 size={16} /> : <IconFolderClose16 size={16} />;
  const sesionMarcada = proyectoEnResumen === undefined ? sesionActiva : undefined;
  return (
    <div className={navegador.groupSection}>
      <div
        className={clsx(
          filas.projectRow,
          estilos.filaConAccion,
          esLaMarcada && estilos.filaAbierta,
          p.rama !== undefined && estilos.filaConRama
        )}
        // Dos señales para lo mismo y no una: el color de fondo lo pierde
        // quien no distingue bien los tonos, y el `aria-current` es lo que
        // se lo dice a un lector de pantalla.
        {...(esLaMarcada ? { "aria-current": "true" as const } : {})}
        {...(abriendoProyecto(p.id) ? { "aria-busy": "true" as const } : {})}
      >
        {/*
          Fijar, lo PRIMERO de la fila y siempre a la vista: es una decisión sobre el proyecto
          entero, no sobre su contenido. Hermano del plegador y no dentro de él —un control
          dentro de otro es HTML inválido—. La chincheta cambia de FORMA (hueca/rellena) además
          de color, y `aria-pressed` lo dice a un lector de pantalla.
        */}
        <button
          type="button"
          className={clsx(estilos.reseteoDeBoton, filas.iconButton, estilos.fijar)}
          data-fijado={fijado ? "" : undefined}
          aria-pressed={fijado}
          aria-label={`${fijado ? "dejar de fijar" : "fijar"} ${p.nombre}`}
          title={fijado ? "Dejar de fijar" : "Fijar arriba"}
          disabled={apagado}
          onClick={() => alFijar(p.id, !fijado)}
        >
          <IconoChincheta fijado={fijado} size={14} />
        </button>
        {/*
          **El plegador es un botón APARTE, y tiene que serlo.** Va como
          hermano del botón del nombre y no dentro: un `<button>` anidado en
          otro es HTML inválido y reparte el clic entre los dos — la misma
          razón por la que el «…» de una sesión no vive dentro de su fila.

          Y **`.folder` + `.chevron` son de la hoja copiada**, que ya traía
          esta afordancia hecha: la carpeta se va al posar el ratón
          (`.projectRow:hover .folder { display: none }`) y deja sitio al
          triángulo, que gira 90° al abrirse (`.arrowOpen`). Aquí antes se
          usaba `.slot` a secas —y estaba bien— porque las sesiones se
          enseñaban siempre y no había nada que desplegar; ahora sí lo hay.

          La carpeta cambia además de glifo (cerrada/abierta), que es lo que
          dice el estado SIN posar el ratón: el chevron solo aparece en
          `:hover` y en `:focus-visible`, y con el ratón lejos la única
          señal de la fila sería el hueco.

          **Con icono de app, el icono ocupa el sitio de la carpeta** (`p.icono`): es lo que
          distingue un proyecto de otro de un vistazo. Sigue la misma afordancia —se va al posar
          el ratón y deja el triángulo—, y lo que se pierde es el cambio cerrada/abierta sin ratón:
          el estado lo siguen diciendo `aria-expanded` y el triángulo. Si la imagen no carga, vuelve
          la carpeta.
        */}
        <button
          type="button"
          className={clsx(estilos.reseteoDeBoton, estilos.plegador)}
          aria-expanded={p.id === desplegado}
          aria-label={`${p.id === desplegado ? "plegar" : "desplegar"} las sesiones de ${p.nombre}`}
          onClick={alPlegar}
        >
          <span className={clsx(filas.slot, filas.folder, estilos.glifoDeCarpeta)} aria-hidden="true">
            {p.icono === true ? (
              <IconoDeApp id={p.id} lado={16} className={estilos.iconoDeApp} respaldo={carpeta} />
            ) : (
              carpeta
            )}
          </span>
          <span className={clsx(filas.slot, filas.chevron, estilos.glifoDeChevron)} aria-hidden="true">
            <IconTriangleRightFill14
              size={14}
              className={clsx(filas.arrow, p.id === desplegado && filas.arrowOpen)}
            />
          </span>
        </button>
        <button
          type="button"
          className={clsx(estilos.reseteoDeBoton, estilos.cuerpoDeFila)}
          disabled={apagado || abriendoAlgo}
          onClick={() => alAbrirProyecto(p.id)}
        >
          <span className={filas.projectText}>
            {/* El proyecto activo se marca con el fondo y con el NOMBRE, no
                con el filo de cian: ese se quedó para la fila que estás
                leyendo (ver `Barra.module.css`). */}
            <span className={clsx(filas.title, esLaMarcada && estilos.tituloActivo)}>
              {p.nombre}
            </span>
            {/*
              La rama de la que se BAJÓ la copia, debajo y más pequeña: es la que manda al
              subir y al comparar, y hasta ahora solo se veía abriendo el proyecto. Con la
              `.meta` de la hoja copiada, que es su segunda línea de fila. `aria-hidden` con la
              rama en `title`, como los iconos de al lado: sin ocultarla, el nombre accesible
              del botón sería «Tienda master» y no el del proyecto.
            */}
            {p.rama === undefined ? null : (
              <span className={clsx(filas.meta, estilos.ramaDeProyecto)} title={`Rama de origen: ${p.rama}`} aria-hidden="true">
                {p.rama}
              </span>
            )}
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
          ) : p.trabajando === true || (p.id !== desplegado && p.sesiones.some((se) => se.trabajando === true)) ? (
            /*
              **Aquí, y con la lista PLEGADA es obligatorio.** El servidor
              manda `proyectos[].trabajando` solo cuando ninguna fila suya la
              lleva —para no decirlo dos veces—, y eso valía cuando las
              sesiones se enseñaban todas: la fila lo decía. Con la lista
              plegada esa fila no existe, así que un turno corriendo en un
              proyecto que no estás mirando no se vería en NINGUNA parte.

              No es el cruce prohibido de datos que este repo evita: la
              lista de sesiones ya está aquí, plegada o no, y se le pregunta
              a ella. Y desplegado NO se dice: ahí lo dice la fila, que es
              la que se abre — la regla de no decirlo dos veces sigue.
            */
            <span className={estilos.actividad} title="El agente está trabajando en este proyecto…">
              trabajando…
            </span>
          ) : p.tareasEnCurso !== undefined && p.tareasEnCurso > 0 ? (
            // Una tarea de fondo trabajando, con la misma marca que una conversación y otras palabras: no hay chat que
            // abrir, está en la pestaña Tareas del proyecto.
            <span
              className={estilos.actividad}
              title={p.tareasEnCurso === 1 ? "Una tarea de fondo está trabajando en este proyecto" : `${p.tareasEnCurso} tareas de fondo están trabajando en este proyecto`}
            >
              {p.tareasEnCurso === 1 ? "tarea en curso…" : `${p.tareasEnCurso} tareas en curso…`}
            </span>
          ) : null}
          {/*
            De quién es, con un ICONO y solo cuando es de OTRA persona. Lo propio no lleva
            nada: es lo normal, y lo que cambia cómo trabajas es que sea de otro. Ausente —el
            servidor no lo dijo— tampoco pinta nada; a la vista coincide con «propio», pero no
            en el dato, y el resumen del proyecto sí los distingue.

            `aria-hidden` con la info en `title`, igual que el icono de la copia local de al
            lado y por lo mismo: sin ocultarlo, un lector de pantalla lo leería como parte del
            NOMBRE del botón.
          */}
          {p.compartido === true ? (
            <span className={estilos.compartido} title="Compartido contigo" aria-hidden="true">
              <IconoCompartido size={14} />
            </span>
          ) : null}
          {/*
            Descargado en local o no. A diferencia de `compartido`, aquí
            AUSENTE sí significa «no está» —el servidor mide la copia en
            disco para todo proyecto de este mensaje, nunca «no lo sé»—, así
            que se pinta SIEMPRE, con un icono por cada uno de los dos
            estados en vez de la pastilla de texto que usa el Escritorio:
            esta fila es de una sola línea y no hay sitio para dos palabras
            más.

            `aria-hidden`, con la info solo en `title`: es supletoria al
            nombre del botón («abre este proyecto»), y sin ocultarla un
            lector de pantalla leería «tienda no descargado» como si «no
            descargado» fuera parte del NOMBRE del proyecto — se comprobó
            con `Barra.comportamiento.test.tsx`, que busca los botones por
            el nombre a secas.
          */}
          <span
            className={estilos.estadoLocal}
            data-local={p.local === true ? "" : undefined}
            title={p.local === true ? "Descargado en este equipo" : "No descargado: se bajará al abrirlo"}
            aria-hidden="true"
          >
            {p.local === true ? <IconCheckOutline16 size={14} /> : <IconDownloadOutline16 size={14} />}
          </span>
        </button>
        {/* El «+» se ve SIEMPRE, sin posar el ratón: fuera de `.rowActions` (la hoja copiada
            lo esconde salvo en `:hover`) y de `.accionesDeFila` (que lo deja en opacidad 0). Se
            queda con `filas.iconButton`, que es su tamaño y su gris. El «…» de las sesiones sigue
            saliendo al posar el ratón: aquella acción es de segundo plano, ésta no. */}
        <span className={estilos.accionFija}>
          <button
            type="button"
            className={filas.iconButton}
            // Y una sesión NUEVA aquí tampoco: sería la segunda sobre la
            // misma copia de trabajo, o sea el mismo rechazo.
            disabled={apagado || abriendoAlgo || p.trabajando === true}
            {...(p.trabajando === true
              ? {
                  title:
                    "este proyecto está trabajando: pulsa su nombre para ver qué hace, y abre otra cuando termine",
                }
              : {})}
            onClick={() => alNuevaSesion(p.id)}
            aria-label={`nueva sesión en ${p.nombre}`}
          >
            <IconNewChatOutline16 size={16} />
          </button>
        </span>
      </div>
      {/* Plegado: las filas se DESMONTAN, no se esconden. Una fila
          invisible con `visibility` sigue siendo tabulable, y se llega con
          el teclado a botones que no se ven — el mismo cuidado que la barra
          entera al plegarse. */}
      {p.id !== desplegado ? null : p.sesiones.length === 0 ? (
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
              s.id === sesionMarcada && estilos.sesionAbierta,
              s.historica && estilos.historica
            )}
            {...(s.id === sesionMarcada ? { "aria-current": "true" as const } : {})}
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
                ? {
                    title:
                      "este proyecto está trabajando en otra conversación: pulsa su nombre para verla",
                  }
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
              {/*
                A la derecha del título van dos cosas que NO se excluyen —una
                sesión tiene fecha Y gasto—, y mientras hay actividad manda la
                actividad: es el hueco donde ya se mira, y ni la fecha ni el
                gasto de un turno en vuelo aportan nada en ese segundo.
              */}
              <FichaDeSesion sesion={s} abriendo={abriendoSesion(s.id)} />
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
  );
}

export interface Proyecto {
  id: string;
  nombre: string;
  sesiones: FilaDeSesion[];
  /**
   * Compartido CONTIGO por otra persona (`shared` de CloudStudio). **Ausente no es «es
   * tuyo»**: es que el servidor no lo dijo. En la fila solo `true` pinta algo —el icono de
   * compartido—; el resumen del proyecto sí distingue ausente de `false`.
   */
  compartido?: boolean;
  /**
   * La copia local ya existe: no hace falta bajar nada para abrirlo. Se pinta con un icono
   * (junto al de compartido) en vez de con la pastilla de texto que usa el
   * Escritorio: aquí la fila es de una sola línea y no hay sitio para dos palabras más.
   * A diferencia de `compartido`, ausente aquí SÍ significa «no está» — el servidor mide
   * la copia en disco para todo proyecto de este mensaje, nunca «no lo sé» —, así que se
   * pinta siempre, con un icono para cada uno de los dos estados.
   */
  local?: boolean;
  /** La rama de la que se bajó la copia local, para pintarla debajo del nombre. Ausente = sin
   *  copia, o no consta: entonces la fila se queda en una línea. */
  rama?: string;
  /** La copia local tiene icono de app (`app.ini`): se pinta en el sitio de la carpeta. Ausente =
   *  sin copia o sin icono, y entonces la carpeta de siempre. */
  icono?: true;
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
  /**
   * Cuántas tareas de FONDO de este proyecto están ejecutándose ahora (`en-proceso` en la cola). Ausente = ninguna, o la
   * cola no ha llegado. Se dice en la fila porque una tarea corre sola y sin consola abierta: sin esto, solo se veía
   * entrando en el panel del proyecto.
   */
  tareasEnCurso?: number;
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
 * La acción por proyecto sí se enseña, y SIEMPRE a la vista (`.accionFija`, no las
 * `.rowActions` que solo salen al posar el ratón): es la acción principal de la fila, la que
 * abre la ventana de sesión nueva.
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

export function Barra({ entornos, entornoActivo, proyectos, visibles, fijados, proyectoActivo, proyectoEnResumen, sesionActiva, abriendo, alElegirEntorno, alAbrirSesion, alAbrirProyecto, alNuevaSesion, alAccionDeSesion, alFijar, alAbrirAjustes, alAbrirAjustesEnEntornos, conectado, version }: {
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
   * Los ids FIJADOS de este entorno (`Entorno.fijados`): van en su propio grupo, arriba, y ya
   * no se repiten en «Proyectos». Ausente = ninguno.
   */
  fijados?: readonly string[];
  /**
   * El proyecto ABIERTO ahora mismo, y su sesión. Ausentes = no se sabe, y entonces no se
   * marca nada: marcar «el primero» por no tener el dato es peor que no marcar, porque una
   * fila resaltada afirma que ahí es donde estás.
   */
  proyectoActivo?: string;
  sesionActiva?: string;
  /**
   * El proyecto cuyo PANEL está en el centro (`PanelDelProyecto.tsx`). Su fila se marca como la
   * abierta —fondo y `aria-current`—, porque es de él de quien habla la pantalla.
   */
  proyectoEnResumen?: string;
  /**
   * Qué se está abriendo AHORA, dicho por el servidor. Entre el clic y la sesión abierta
   * pasan de unos cientos de milisegundos a los minutos de una descarga, y sin señal la
   * barra se queda igual que estaba: el clic se lee como que no ha hecho nada. Ausente =
   * no se está abriendo nada.
   *
   * `entorno` es el cuarto caso y el único que NO es una apertura: mudar el entorno activo
   * vacía la lista y la vuelve a traer del otro servidor, y hasta que llega el `alta` el
   * `<select>` —que va controlado por él— se quedaba en el valor VIEJO. Medido en el
   * navegador: 1.480 ms con el valor viejo y ninguna señal. Con esto la fila enseña el que
   * se ha pedido, que es lo que hace que la elección parezca haber entrado.
   */
  abriendo?: { proyecto?: string; sesion?: string; entorno?: string; descargando?: true };
  alElegirEntorno: (id: string) => void;
  alAbrirSesion: (proyecto: string, sesion: string) => void;
  /**
   * El nombre del proyecto es un botón: abre su PANEL en el centro (`App.tsx#abrirProyecto`).
   * Empezar a trabajar es el «+».
   *
   * Con el proyecto TRABAJANDO sigue vivo a propósito, al contrario que el «+»: su panel dice
   * «El agente está trabajando» con «Volver al chat», que es la forma de llegar a la
   * conversación en marcha mientras no tenga fila propia —su id nace al volcar el primer acto—.
   * Apagarlo aquí dejaría un proyecto trabajando al que no se puede ni mirar.
   */
  alAbrirProyecto: (proyecto: string) => void;
  /** Fijar o dejar de fijar un proyecto. La lista la compone `App.tsx` y la guarda el
   *  servidor con el entorno. */
  alFijar: (proyecto: string, fijar: boolean) => void;
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
   * El enlace «Ajustes» del aviso de proyectos sin enseñar abre la ventana YA en la pestaña
   * Entornos, en vez de en «general»: quien lo pulsa viene buscando justo esa lista.
   * Opcional y con fallback a `alAbrirAjustes` — un caller que no lo cablee sigue abriendo
   * la ventana, solo que en la sección de siempre; nunca un enlace que no hace nada.
   */
  alAbrirAjustesEnEntornos?: () => void;
  /**
   * Si el cable está vivo. Sin él, todo lo que manda algo al servidor se apaga: cambiar de
   * entorno, abrir un proyecto o una sesión, el «+» y el «…». Medido sin servidor: la barra
   * seguía entera y pulsable con un «sin conexión» pequeño arriba. «Ajustes» se queda: la
   * apariencia es de este navegador y funciona sin cable.
   */
  conectado?: boolean;
  /**
   * La línea de versión ya formateada por el servidor (`core/version.ts#lineaDeVersion`),
   * para el pie de la barra. Ausente = no se pudo calcular al arrancar, y entonces no se
   * pinta nada — nunca una versión inventada.
   */
  version?: string;
}) {
  const apagado = conectado === false;

  /** Mientras se abre algo no se pide otra cosa: el segundo clic no cancela el primero. */
  const abriendoAlgo = abriendo !== undefined;
  /**
   * El entorno que la fila ENSEÑA: el que se ha pedido mientras el cambio viaja, y el de
   * verdad el resto del tiempo.
   *
   * No es cosmético y no se puede deducir de otra cosa. El `<select>` va controlado por
   * `entornoActivo`, que sale del `alta`, y el `alta` no llega hasta que CloudStudio
   * contesta —medido: 1.480 ms—, así que sin esto React lo devuelve al valor viejo en
   * cuanto se suelta y la elección se lee como que no ha entrado. Lo mismo el icono, que es
   * la marca del entorno activo: el de antes junto al nombre nuevo sería una contradicción
   * de 20 px.
   *
   * Si el cambio FALLA, esto se apaga con el resto del indicador y el valor vuelve solo al
   * que sigue siendo el activo —que es la verdad, y el aviso dice qué pasó—.
   */
  const entornoPendiente = abriendo?.entorno;
  const entornoQueSeVe = entornoPendiente ?? entornoActivo;
  // El orden de `visibles` NO manda: manda el del listado, que es el del servidor. Elegir
  // qué se ve es una cosa; reordenar el listado remoto sería otra, y nadie la ha pedido.
  //
  // Los FIJADOS salen de la cuenta antes que nada: van en su grupo, arriba, estén o no entre
  // los visibles, y no se repiten abajo. Con el orden del listado también, por lo mismo.
  const fijadosALaVista = proyectos.filter((p) => fijados?.includes(p.id) === true);
  const sinFijar = proyectos.filter((p) => !fijadosALaVista.includes(p));
  const elegidos =
    visibles === undefined
      ? proyectos.slice(0, PROYECTOS_POR_OMISION)
      : proyectos.filter((p) => visibles.includes(p.id));
  const alaVista = elegidos.filter((p) => !fijadosALaVista.includes(p));
  // Lo que no se ve en NINGUNO de los dos grupos: ni fijado ni elegido.
  const ocultos = sinFijar.length - alaVista.length;

  /**
   * **Las sesiones se pliegan, y solo hay UNA lista abierta: la del proyecto activo.**
   *
   * Antes se enseñaban todas las de todos, y con cuatro proyectos de doce conversaciones eso
   * es una columna que no se puede leer: lo que se busca —la conversación de donde estás—
   * queda enterrado entre las de proyectos que no estás mirando.
   *
   * Es un acordeón y no un conjunto de plegados independientes, porque lo pedido es «uno
   * solo»: desplegar uno cierra el que hubiera. Un solo `string | undefined` lo dice todo, y
   * `undefined` es «ninguno abierto» — que es lo que hay sin proyecto activo (el escritorio
   * recién arrancado).
   *
   * El PROYECTO ACTIVO manda cuando cambia: abrir una sesión de otro proyecto lleva el
   * despliegue con ella, porque es donde acabas de mirar. Se hace en un efecto y no
   * derivándolo, para que un despliegue a mano sobreviva a un re-render.
   */
  const [desplegado, setDesplegado] = useState<string | undefined>(proyectoActivo);
  useEffect(() => setDesplegado(proyectoActivo), [proyectoActivo]);

  /** Lo que las filas de los dos grupos comparten: todo menos si están fijadas. */
  const propsDeFila = (p: Proyecto) => ({
    p,
    desplegado,
    alPlegar: () => setDesplegado(p.id === desplegado ? undefined : p.id),
    proyectoActivo,
    proyectoEnResumen,
    sesionActiva,
    abriendo,
    apagado,
    abriendoAlgo,
    alFijar,
    alAbrirProyecto,
    alNuevaSesion,
    alAbrirSesion,
    alAccionDeSesion,
  });

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
            {/* La señal de que se está mudando, y va AQUÍ y no en la fila de abajo por una
                razón medida: ahí el `<select>` declara `calc(100% - 4px)` y cede ancho, así
                que un texto de 67 px lo encogía de 263 a 188 —un salto de 75 px en el
                control que se acaba de usar, dos veces, al irse y al volver—. Esta línea
                solo lleva una palabra y ya tiene su relleno elástico, que es lo que empuja
                esto al borde. Con las mismas PALABRAS que las otras marcas de la barra y no
                un giro: un giro no lo lee quien no distingue el movimiento. */}
            {entornoPendiente === undefined ? null : (
              <span className={estilos.actividad} title="Cambiando de entorno…">
                cambiando…
              </span>
            )}
          </div>
          {entornos.length === 0 ? (
            <p className={navegador.empty}>Sin entorno que enseñar aquí todavía.</p>
          ) : (
            <div
              className={estilos.filaDeEntorno}
              // Lo que ESPERA la interfaz es esta fila: su valor está a medio camino. El
              // `aria-busy` va en el elemento que espera y no en el que lo cuenta.
              {...(entornoPendiente === undefined ? {} : { "aria-busy": "true" as const })}
            >
            {/* El icono va FUERA del `<select>`: un `<option>` no admite marcado, así que
                lo que se puede pintar es la marca del entorno ACTIVO — que además es la
                pregunta que uno se hace mirando esa esquina («¿en qué servidor estoy?»). */}
            <IconoDeEntorno entorno={entornoQueSeVe} size={20} className={estilos.iconoDeEntorno} />
            <Desplegable
              className={estilos.entorno}
              // Mientras algo viaja no se pide otra cosa, la misma regla que las filas del
              // árbol: un segundo cambio de entorno con el primero en vuelo dejaría a
              // `proyectos` y `ramas` vaciándose por un camino y llenándose por otro.
              disabled={apagado || abriendoAlgo}
              value={entornoQueSeVe}
              onChange={(e) => alElegirEntorno(e.target.value)}
            >
              {entornos.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nombre}
                </option>
              ))}
            </Desplegable>
            </div>
          )}

          {/* Niveles 2 y 3 — proyectos, y dentro de cada uno sus sesiones.

              Los DOS grupos —«Proyectos fijados» y «Proyectos»— van dentro de la lista que
              hace scroll, cada uno con su cabecera. Fuera de ella, una columna de fijados
              desplegados empujaría la barra sin poder desplazarse. Las cabeceras son las
              mismas tres clases que la de «Entorno», para que se lean como iguales. */}
          <div className={navegador.listArea}>
            <div className={navegador.treeBody}>
              <div className={navegador.list}>
                {fijadosALaVista.length === 0 ? null : (
                  <>
                    <div className={navegador.sectionHeader}>
                      <span className={clsx(navegador.sectionLabel, estilos.rotulo)}>Proyectos fijados</span>
                      <span className={estilos.rellenoDeSeccion} />
                    </div>
                    {fijadosALaVista.map((p) => (
                      <FilaDeProyecto key={p.id} {...propsDeFila(p)} fijado />
                    ))}
                  </>
                )}
                <div className={navegador.sectionHeader}>
                  <span className={clsx(navegador.sectionLabel, estilos.rotulo)}>Proyectos</span>
                  <span className={estilos.rellenoDeSeccion} />
                </div>
                {alaVista.length === 0 ? (
                  <p className={navegador.empty}>
                    {proyectos.length === 0
                      ? "Sin proyectos que enseñar aquí todavía."
                      : fijadosALaVista.length > 0 && ocultos === 0
                        ? "Todos los elegidos están fijados arriba."
                        : "Ninguno elegido para esta barra; elígelos en Ajustes."}
                  </p>
                ) : (
                  alaVista.map((p) => <FilaDeProyecto key={p.id} {...propsDeFila(p)} fijado={false} />)
                )}
                {/*
                  Lo que NO se está viendo se dice, y se dice dónde se arregla. Callarlo
                  dejaría creer que el entorno solo tiene cuatro proyectos — el listado
                  remoto trae los que trae, y esto es un tope de presentación, no la verdad
                  sobre el servidor. En tarjeta y no en línea suelta, para que se lea como
                  un aviso y no como una fila más de la lista; «Ajustes» es el botón que
                  arregla lo que la tarjeta describe, así que lleva DIRECTO a esa pestaña
                  (`alAbrirAjustesEnEntornos`) y no a la sección general.
                */}
                {ocultos > 0 ? (
                  <div className={estilos.avisoOcultos}>
                    <p className={estilos.textoDeAviso}>
                      {ocultos === 1 ? "1 proyecto más sin enseñar" : `${ocultos} proyectos más sin enseñar`} · elígelos en{" "}
                      {/* Nombre accesible DISTINTO del botón de más abajo (`ajustes.trigger`,
                          que también se llama «Ajustes»): dos controles con el mismo nombre
                          en la misma pantalla son indistinguibles para quien navega por
                          nombre. El texto visible se queda igual — es la frase de siempre. */}
                      <button
                        type="button"
                        className={estilos.enlaceDeAviso}
                        onClick={alAbrirAjustesEnEntornos ?? alAbrirAjustes}
                        aria-label="Ajustes, pestaña Entornos"
                      >
                        Ajustes
                      </button>
                    </p>
                  </div>
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
        {/* El separador y la versión son propios (`Barra.module.css`) y no de la hoja
            copiada `SidebarRoot.module.css` («Copiado SIN CAMBIOS»): van como hermanos de
            `.settingsArea` dentro de `.footArea`, que ya es `flex-direction: column`. */}
        <div className={estilos.separadorDePie} aria-hidden="true" />
        <div className={barra.settingsArea}>
          <div className={ajustes.triggerRow}>
            <button type="button" className={ajustes.trigger} onClick={alAbrirAjustes}>
              <IconSettingsOutline16 size={16} />
              <span className={ajustes.triggerLabel}>Ajustes</span>
            </button>
          </div>
        </div>
        {version === undefined ? null : <p className={estilos.version}>{version}</p>}
      </div>
    </nav>
  );
}
