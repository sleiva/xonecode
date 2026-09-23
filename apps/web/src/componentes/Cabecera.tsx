import clsx from "clsx";
import {
  IconBranchOutline16,
  IconSettingsOutline16,
  IconFollowsystemOutline16,
  IconLightOutline16,
  IconDarkOutline16,
} from "@deepseek-ai/dsh-client-ui-primitives";
import conversacion from "../../estilos/ConversationRoot.module.css";
import pastilla from "../../estilos/AgentPresetLabel.module.css";
import type { Apariencia } from "../apariencia.js";
import estilos from "./Cabecera.module.css";

/*
 * Los tres pasos de apariencia, con el icono que dice exactamente lo que hace —seguir al
 * sistema, claro, oscuro—: los mismos tres que ofrecía la sección «Apariencia» de Ajustes
 * antes de mudarse aquí. Un solo gesto en la barra en vez de una sección propia: es un
 * ajuste de un clic, no una materia que necesite su propia página.
 */
const APARIENCIAS: readonly { id: Apariencia; etiqueta: string; Icono: typeof IconSettingsOutline16 }[] = [
  { id: "sistema", etiqueta: "Como el sistema", Icono: IconFollowsystemOutline16 },
  { id: "claro", etiqueta: "Claro", Icono: IconLightOutline16 },
  { id: "oscuro", etiqueta: "Oscuro", Icono: IconDarkOutline16 },
];

/**
 * La cabecera de la sesión, con el CSS de deepseek
 * (`estilos/ConversationRoot.module.css`): fila de título con las migas a la izquierda,
 * el modo al lado, la acción a la derecha, y DEBAJO la tira de pestañas — todo dentro
 * del mismo `<header>`, que es lo que hace que la línea de separación quede bajo las
 * pestañas y no entre el título y ellas.
 *
 * **Las pestañas ya no están aquí**, y tampoco en el panel central: viven en el PANEL de
 * vistas (`Pestanas.tsx` cuenta las cuatro casas que ha tenido la tira y por qué esta es la
 * suya). Lo que esta cabecera conserva de aquello son los DOS botones de los extremos —la
 * barra lateral a la izquierda, el panel a la derecha—, que son de la aplicación: valen
 * igual con una columna desplegada que sin ella, y cada uno vive fuera de lo que abre porque
 * cerrado se iría con ello y no habría por dónde volver.
 *
 * Las migas son UNA sola —no hay jerarquía de subagentes que recorrer— y va como el
 * `<button disabled>` que el original usa para la última: mismo elemento, mismo estado,
 * misma clase `.crumbCurrent`.
 */
export function Cabecera({
  titulo,
  proyecto,
  modo,
  conectado,
  barraContraida,
  alAlternarBarra,
  panelAbierto,
  alAlternarPanel,
  alAbrirAjustes,
  apariencia,
  alCambiarApariencia,
  alIrAlEscritorio,
}: {
  titulo: string;
  /**
   * El proyecto al que pertenece `titulo`, cuando es una sesión. Medido: la miga decía
   * «xonecode / Hola» y AppDemo no aparecía en ningún sitio de la cabecera. Con él, la
   * miga son dos niveles («AppDemo / Hola»); si coincide con el título —una sesión sin
   * nombre todavía se llama como su proyecto— no se repite.
   */
  proyecto?: string;
  /**
   * El modo del proyecto abierto (`.xonecode/config.json`), tal cual lo manda el
   * servidor. Ausente = el servidor no lo sabe (no hay proyecto abierto, o su config no
   * se pudo leer) y entonces NO se pinta pastilla: una que dijera «offline» sin haberlo
   * leído sería un dato inventado, que es justo lo que este repo no consiente.
   */
  modo?: "offline" | "cloud";
  conectado: boolean;
  /** Si la barra lateral está plegada, para que el botón diga qué va a hacer. */
  barraContraida?: boolean;
  /** Plegar y desplegar la barra lateral. Ausente = no se ofrece el botón. */
  alAlternarBarra?: () => void;
  /** Si el panel de vistas está abierto, para que su botón diga qué va a hacer. */
  panelAbierto?: boolean;
  /**
   * Abrir y cerrar el panel de vistas (Ficheros, Revisión, Trazas…). **Ausente = no se
   * ofrece**, que es lo que toca en el escritorio: sin sesión abierta no hay ni ficheros ni
   * revisión que enseñar, y un botón que abre una columna vacía es el control muerto de
   * siempre.
   *
   * Va en la barra de la APLICACIÓN, en el mismo extremo que la columna que abre, y es el
   * espejo exacto del de la barra lateral: uno por cada borde de la pantalla. Y va aquí y no
   * dentro del panel por la misma razón práctica que aquél — cerrado, el panel no está, así
   * que su botón se iría con él y no habría por dónde volver. La «×» del propio panel es la
   * otra mitad del par: cierra desde dentro, este abre desde fuera.
   */
  alAlternarPanel?: () => void;
  /**
   * Abrir Ajustes desde la barra de la APLICACIÓN. Medido: el único acceso vivía en la
   * barra lateral, así que plegada no había forma de llegar. Ausente = no se ofrece.
   */
  alAbrirAjustes?: () => void;
  /**
   * El claro/oscuro de ESTA ventana (`apariencia.ts`). **Ausente = no se pinta el
   * conmutador**: un control sin dato detrás es la misma mentira que una lista vacía
   * rellenada con un placeholder. Vive junto al botón de Ajustes y no dentro de la
   * ventana: era una sección propia ahí, y un ajuste de un solo clic no necesita una
   * página para él solo.
   */
  apariencia?: Apariencia;
  /** Cambia la apariencia. Ausente = no se pinta el conmutador (misma regla que arriba). */
  alCambiarApariencia?: (apariencia: Apariencia) => void;
  /**
   * Volver al ESCRITORIO, con la sesión abierta detrás. **Ausente = no se ofrece**, que es
   * lo que toca cuando ya estás en él: la marca se queda como rótulo y no como un botón
   * que no lleva a ninguna parte.
   *
   * Va en la MARCA porque la marca ya es la raíz de la miga que se lee al lado
   * («xonecode / AppDemo / Hola»): pulsar el primer nivel de una miga es lo que hace
   * cualquier interfaz con migas, y no hace falta cromo nuevo en una barra que ya tiene
   * cuatro cosas. La alternativa —una entrada «Escritorio» arriba de la barra lateral—
   * añadía un control y además desaparecía con la barra plegada, que es justo cuando más
   * falta hace.
   */
  alIrAlEscritorio?: () => void;
}) {
  return (
    <header className={clsx(conversacion.header, estilos.barraSuperior)}>
      <div className={conversacion.titleRow}>
        <div className={conversacion.titleCluster}>
          {/*
            El botón de plegar vive en la barra de herramientas y no dentro de la propia
            barra lateral —donde lo pone el mockup— por una razón práctica: plegada, la
            barra no está, así que su botón se iría con ella y no habría por dónde volver.
          */}
          {alAlternarBarra === undefined ? null : (
            <button
              type="button"
              className={estilos.plegar}
              onClick={alAlternarBarra}
              aria-expanded={barraContraida !== true}
              aria-label={barraContraida === true ? "Mostrar la barra lateral" : "Ocultar la barra lateral"}
              title={barraContraida === true ? "Mostrar la barra lateral" : "Ocultar la barra lateral"}
            >
              {barraContraida === true ? "»" : "«"}
            </button>
          )}
          {/*
            La marca, que hasta el rediseño vivía arriba de la barra lateral. Se mudó aquí
            con la tira azul: esta es la ÚNICA superficie de marca de la aplicación
            (`Cabecera.module.css`), y el nombre del producto sobre el azul profundo es lo
            que empareja esta pantalla con el splash del arranque.

            Sin la pastilla «DESKTOP» que el mockup pone al lado: no hay ningún modo de
            escritorio del que hablar —la consola web es una sola cosa—, y una pastilla que
            no distingue nada de nada es un rótulo decorativo.
          */}
          {/*
            El símbolo va DENTRO de la marca, no al lado: es la misma raíz de la miga, y
            partirlo en dos elementos daría dos zonas pulsables para el mismo destino. Es
            el icono oficial que entregó el usuario, servido desde `apps/web/public/` con
            la MISMA ruta que el favicon de `index.html` — un solo fichero, porque dos
            copias del logo acaban siendo dos logos. Local y no de un CDN: esta consola
            escucha en loopback y declara un modo offline de primera clase. `alt=""` y no «xonecode»: la
            palabra está ahí al lado en texto, y repetirla la haría anunciarse dos veces.
          */}
          {alIrAlEscritorio === undefined ? (
            <span className={estilos.marca}>
              <img className={estilos.simbolo} src="/iconos/xonecode.png" alt="" width={22} height={22} />
              XOneCode
            </span>
          ) : (
            <button
              type="button"
              className={clsx(estilos.marca, estilos.marcaEnlace)}
              onClick={alIrAlEscritorio}
              title="Volver al escritorio"
            >
              <img className={estilos.simbolo} src="/iconos/xonecode.png" alt="" width={22} height={22} />
              XOneCode
            </button>
          )}
          <span className={estilos.separador} aria-hidden="true">
            /
          </span>
          <nav className={conversacion.crumbs} aria-label="dónde estás">
            {proyecto === undefined || proyecto === titulo ? null : (
              <>
                <span className={conversacion.crumbSeg}>
                  <button type="button" className={conversacion.crumb} disabled>
                    {proyecto}
                  </button>
                </span>
                <span className={estilos.separador} aria-hidden="true">
                  /
                </span>
              </>
            )}
            <span className={conversacion.crumbSeg}>
              <button
                type="button"
                className={clsx(conversacion.crumb, conversacion.crumbCurrent)}
                disabled
              >
                {titulo}
              </button>
            </span>
          </nav>
          <div className={conversacion.headerActions}>
            {modo === undefined ? null : (
              <span className={pastilla.label}>
                {/*
                  El original monta aquí `IconAgentPresetOutline16`, que el paquete
                  publicado (`@deepseek-ai/dsh-client-ui-primitives@0.0.1-rc.1`, el que
                  hay instalado) NO exporta — medido: no está en su lista de exports, y
                  usarlo montaba `undefined` y React reventaba con «Element type is
                  invalid». De los que SÍ exporta, la rama es la que dice la verdad de
                  este dato: el modo es si el proyecto se sincroniza con CloudStudio, y
                  esa sincronización ES una rama (`agent/gitSync.ts`).
                */}
                <IconBranchOutline16 className={pastilla.icon} size={16} />
                {modo === "cloud" ? "modo cloud" : "modo offline"}
              </span>
            )}
          </div>
        </div>
        {/*
          El asiento de la derecha. En la referencia lo ocupa «Session log», que aquí no
          existe —no hay descarga de la sesión que ofrecer—, así que lo ocupa lo único
          que de verdad hay que saber en esa esquina: si el cable sigue vivo. Inventar el
          botón de ellos para rellenar el hueco sería prometer una descarga que no pasa.
        */}
        <div className={conversacion.headerUtilities}>
          {apariencia === undefined || alCambiarApariencia === undefined ? null : (
            <div className={estilos.temaGrupo} role="group" aria-label="apariencia">
              {APARIENCIAS.map(({ id, etiqueta, Icono }) => (
                <button
                  key={id}
                  type="button"
                  className={estilos.temaBoton}
                  // Puesto SIEMPRE, también en el que no lo está: es lo que convierte los
                  // tres botones en un conmutador y no en tres acciones sueltas.
                  aria-pressed={id === apariencia}
                  data-puesto={id === apariencia ? "" : undefined}
                  title={etiqueta}
                  aria-label={etiqueta}
                  onClick={() => {
                    // Pulsar el que ya está puesto no manda nada.
                    if (id !== apariencia) alCambiarApariencia(id);
                  }}
                >
                  <Icono size={16} />
                </button>
              ))}
            </div>
          )}
          {alAlternarPanel === undefined ? null : (
            <button
              type="button"
              className={estilos.ajustes}
              onClick={alAlternarPanel}
              aria-expanded={panelAbierto === true}
              // «Mostrar/Ocultar», como el de la barra lateral, y no «Abrir/Cerrar»: el
              // panel lleva DENTRO su propia «×», que sí se llama «Cerrar el panel», y dos
              // controles distintos con el mismo nombre accesible son indistinguibles para
              // quien navega por nombre — y ambiguos hasta para un test.
              aria-label={panelAbierto === true ? "Ocultar el panel" : "Mostrar el panel"}
              title={panelAbierto === true ? "Ocultar el panel" : "Mostrar el panel"}
            >
              <IconoDePanel abierto={panelAbierto === true} />
            </button>
          )}
          {alAbrirAjustes === undefined ? null : (
            <button
              type="button"
              className={estilos.ajustes}
              onClick={alAbrirAjustes}
              aria-label="Ajustes"
              title="Ajustes"
            >
              <IconSettingsOutline16 size={16} />
            </button>
          )}
          <span className={clsx(estilos.estado, conectado ? estilos.conectado : estilos.desconectado)}>
            <span className={estilos.punto} aria-hidden="true" />
            {conectado ? "conectado" : "sin conexión"}
          </span>
        </div>
      </div>

    </header>
  );
}

/**
 * El icono del panel: el marco de la pantalla con su columna derecha marcada, rellena
 * cuando el panel está abierto y solo perfilada cuando no. Dibujado aquí y no traído de un
 * CDN, como el resto (`IconosDelCompositor.tsx`): esta consola escucha en loopback y declara
 * un modo offline de primera clase.
 *
 * `currentColor` y `aria-hidden`: el botón que lo lleva ya dice con palabras lo que hace, y
 * un icono que se anuncia además lo diría dos veces.
 */
function IconoDePanel({ abierto }: { abierto: boolean }) {
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x={1.75} y={2.75} width={12.5} height={10.5} rx={2} stroke="currentColor" strokeWidth={1.3} />
      <path
        d="M10 3v10"
        stroke="currentColor"
        strokeWidth={1.3}
        strokeLinecap="round"
      />
      {abierto ? <rect x={10} y={3} width={4.25} height={10} rx={1} fill="currentColor" opacity={0.55} /> : null}
    </svg>
  );
}
