import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import clsx from "clsx";
import marco from "../../estilos/AppFrame.module.css";
import conversacion from "../../estilos/ConversationRoot.module.css";
import {
  ANCHO_MINIMO_DEL_PANEL,
  ANCHO_PANEL_MAXIMO,
  ANCHO_PANEL_POR_OMISION,
  acotarAnchoDePanel,
} from "../repartoDeColumnas.js";
import estilos from "./Maqueta.module.css";

/**
 * El ancho de la barra: la OMISIÓN, sus límites y el paso del teclado.
 *
 * Era 280 a secas, el valor del mockup, y se subió a 320 porque en 280 el nombre de un
 * proyecto de verdad no cabe —medido en la pantalla del usuario: «PlaemerWebTe…»— y ahí
 * comparte hueco además con la etiqueta de compartido y con el «…» de la sesión.
 *
 * Y desde aquí es un ancho ELEGIBLE, no una constante: 320 es una omisión buena para una
 * pantalla y mala para otra, y esa decisión es de quien mira. El techo del 60% de la
 * ventana no es simetría con el suelo — es lo que impide que un ancho recordado en una
 * pantalla grande deje sin centro a un portátil.
 */
export const ANCHO_BARRA_POR_OMISION = 320;
const ANCHO_BARRA_MINIMO = 220;
const ANCHO_BARRA_MAXIMO = 560;
const FRACCION_MAXIMA_DE_VENTANA = 0.6;
const PASO_DE_TECLADO = 16;

/**
 * El ancho, acotado. **`anchoDeVentana` es opcional a propósito, y las dos formas de
 * llamarla son distintas:**
 *
 * - **Sin ventana** (al PINTAR): se acota solo a `[MINIMO, MAXIMO]`, y el techo del 60%
 *   lo aplica el CSS con un `min(Xpx, 60vw)` en la pista. Así encoger la ventana estrecha
 *   la barra sin TOCAR el valor recordado: aplicarlo aquí sobrescribiría los 560 que
 *   alguien eligió en su pantalla grande la primera vez que abriera el portátil.
 * - **Con ventana** (al ARRASTRAR o al teclear): se acota además por el 60%, que es lo que
 *   mantiene el tirador pegado al puntero — sin él la cifra seguiría creciendo mientras la
 *   pista, capada por el CSS, se queda quieta.
 */
export function acotarAnchoDeBarra(px: number, anchoDeVentana?: number): number {
  if (!Number.isFinite(px)) return ANCHO_BARRA_POR_OMISION;
  const techo =
    anchoDeVentana === undefined
      ? ANCHO_BARRA_MAXIMO
      : Math.max(
          ANCHO_BARRA_MINIMO,
          Math.min(ANCHO_BARRA_MAXIMO, Math.round(anchoDeVentana * FRACCION_MAXIMA_DE_VENTANA))
        );
  return Math.round(Math.min(Math.max(px, ANCHO_BARRA_MINIMO), techo));
}

/**
 * El armazón de columnas, con el CSS de deepseek (`estilos/AppFrame.module.css`) en vez
 * de la aproximación a mano que había antes: `.frame` es un grid, la barra vive en
 * `.sidebarCol` (que es quien pinta el relleno y el borde de la barra, no la barra
 * misma), el centro en `.centerCol` y el panel en `.detailsCol`.
 *
 * **La tercera columna no se ha inventado aquí: estaba en la hoja copiada y no se usaba.**
 * `.detailsCol`, su tirador con pastilla (`data-side="details"`) y el
 * `.frame[data-details-collapsed]` que le quita el borde a cero llevaban ahí desde el
 * principio; lo que faltaba era la pista del grid y quién la habita. Por eso montar el panel
 * de vistas a la derecha del chat no trajo geometría nueva — solo la decisión de cuándo cabe,
 * que vive en `repartoDeColumnas.ts` porque es lo único que no sabe hacer una hoja de estilos.
 *
 * Tres cosas las pone este componente porque la hoja copiada no las trae:
 *
 * 1. **Las pistas del grid.** `.frame` no declara `grid-template-columns`; en el
 *    original las escribe `AppFrame.tsx` en línea, calculadas por su solucionador de
 *    concesiones. Aquí son tres: la barra, el resto y el panel. Sin esto el grid tiene UNA
 *    columna y todo se apila. **Y son tres SIEMPRE, con `0px` en la que no está**, igual que
 *    la barra plegada: `.frame` anima `grid-template-columns`, y una transición entre dos
 *    listas de distinta longitud no interpola — el panel aparecería y desaparecería de golpe
 *    mientras la barra, que siempre tiene su pista, se desliza.
 * 2. **La altura.** `.frame` mide `height: 100%`, y nuestros `html`/`body` no miden
 *    nada; `.alto` le añade `100dvh` en la misma etiqueta en vez de tocar la hoja
 *    copiada.
 * Y una que NO se pone, medida en pantalla: el atributo `data-phase="active"` del
 * original. Tentador —la columna está siempre en esa fase— y roto: enciende
 * `.root[data-phase='active'] .viewArea { flex: 1 0 auto; min-height: auto }`, que allí
 * tiene sentido porque su `.viewArea` vive DENTRO de un `.scrollBody` que scrollea con el
 * compositor pegajoso dentro. Aquí no hay `.scrollBody` —nuestro compositor es un hermano
 * de la columna, no un asiento del scroller—, así que `.viewArea` crecía hasta el alto del
 * contenido, se desbordaba, y `.centerCol` (que recorta) lo escondía DEBAJO del
 * compositor: la conversación y las trazas dejaban de poder scrollear y las últimas
 * líneas quedaban tapadas. Sin el atributo mandan las reglas base (`.viewArea { flex: 1;
 * min-height: 0 }`), que es lo que acota el scroll.
 *
 * 3. **El ancho vivo de la columna.** `--dsh-chat-content-width` (declarada en
 *    `ConversationRoot.module.css`, que se monta aquí sobre `.centerCol`) es un `clamp`
 *    cuyo término del medio es `--dsh-conversation-column-width`: allí la publica un
 *    `ResizeObserver` sobre la columna, y sin nadie que la publique el ancho se queda
 *    clavado en el suelo de 680px sea cual sea la pantalla. Se publica aquí igual, con
 *    guarda: **jsdom no implementa `ResizeObserver`**, así que sin el `typeof` cualquier
 *    test que monte `Maqueta` reventaría al montar — y con la guarda el ancho cae al
 *    suelo, que es exactamente lo que un test sin layout debe ver. Se observa la columna
 *    del CENTRO y no el panel: esa variable centra la conversación y alinea el compositor,
 *    y en el panel no hay ni una cosa ni la otra.
 * 4. **Los tiradores que redimensionan.** La hoja copiada trae su geometría
 *    (`.handle`, la tira de 8 px a caballo del borde, el cursor, y el
 *    `.frame[data-dragging]` que apaga la transición mientras se arrastra) porque el
 *    original también las redimensiona; lo que no trae es el gesto, la accesibilidad ni
 *    quién recuerda el ancho. El gesto y el `separator` de ARIA están aquí —**en UNA sola
 *    pieza, `Tirador`, que sirve a los dos lados**: el manejo del puntero son noventa líneas
 *    con cuatro trampas medidas dentro, y una segunda copia para el panel sería el segundo
 *    sitio donde cada una de esas cuatro puede volver—; los anchos los recuerda `App`, igual
 *    que el plegado, y por el mismo motivo: son de este navegador.
 */
export function Maqueta({
  centro,
  barra,
  panel,
  cabecera,
  barraContraida = false,
  anchoBarra,
  anchoPanel,
  alRedimensionarBarra,
  alRedimensionarPanel,
}: {
  centro: ReactNode;
  barra: ReactNode;
  /**
   * El panel de vistas, a la DERECHA del centro. **Ausente = la columna no está**: su pista
   * se va a cero y aquí no se monta nada, que es la misma regla que la barra plegada —lo que
   * se pliega se desmonta, porque un elemento invisible sigue siendo tabulable—.
   *
   * Quién decide si cabe no es este componente sino `repartoDeColumnas.ts`, y esa división
   * es deliberada: aquí solo hay geometría, y la política de «con esta ventana y estos
   * anchos, ¿quién se queda fuera?» se puede probar entera sin montar una pantalla.
   */
  panel?: ReactNode;
  /**
   * La barra superior, que cruza las DOS columnas.
   *
   * Va aquí y no dentro de `centro` —que es donde estaba— porque es la barra de la
   * APLICACIÓN y no la del centro: la marca, el estado del cable y el botón de plegar la
   * lateral valen igual con la barra desplegada que sin ella, y arrancándola en el borde de
   * la columna central se leía como si fuera de la conversación. Es además lo que pide el
   * rediseño, donde la tira azul va de lado a lado y la lateral empieza por debajo.
   *
   * Es un ítem más del grid, ocupando `1 / -1`, y no un envoltorio por fuera: el `.frame`
   * copiado ya es el elemento que mide la pantalla entera y anima sus pistas, y meterlo
   * dentro de otra caja habría duplicado esa medida en dos sitios que se pueden desincronizar.
   * Opcional: sin ella el grid se queda como estaba, con una sola fila.
   */
  cabecera?: ReactNode;
  /**
   * La barra lateral, plegada. La columna se va a CERO y su contenido se desmonta — no se
   * esconde con `visibility`: una barra invisible sigue siendo tabulable, y se llega con el
   * teclado a botones que no se ven. Volver a expandirla la vuelve a montar con lo que el
   * servidor diga en ese momento, que es lo mismo que enseñaría si nunca se hubiera
   * plegado.
   *
   * **Puede venir plegada sin que el usuario la haya plegado**: `repartoDeColumnas` la
   * cierra sola cuando la ventana no da para las tres columnas. Aquí no se nota la
   * diferencia —esto solo pinta—, pero quien recuerda la preferencia no debe escribir nunca
   * lo que salga de ahí.
   */
  barraContraida?: boolean;
  /**
   * El ancho de la barra, en píxeles. Ausente = la omisión: quien la monta no tiene que
   * saber la cifra, y así no hay dos sitios donde esté escrita.
   */
  anchoBarra?: number;
  /** El ancho del panel. Mismo trato que `anchoBarra`. */
  anchoPanel?: number;
  /**
   * Se pide el ancho nuevo hacia arriba; quien lo recuerda es `App`, igual que con el
   * plegado. `terminado` distingue las dos cadencias del gesto y hace falta: el arrastre
   * manda muchas veces por segundo —cada `pointermove`— y `localStorage` se escribe UNA,
   * al soltar. Cada pulsación de tecla es un gesto terminado ella sola.
   *
   * **Sin este manejador no se pinta el tirador.** Un asa de redimensionar que no
   * redimensiona es el control muerto de siempre, y aquí además tapa 8 px de la columna.
   */
  alRedimensionarBarra?: (ancho: number, terminado: boolean) => void;
  /** Lo mismo para el panel. Sin él, y sin panel, no se pinta su tirador. */
  alRedimensionarPanel?: (ancho: number, terminado: boolean) => void;
}) {
  const columna = useRef<HTMLDivElement>(null);
  const marcoNodo = useRef<HTMLDivElement>(null);
  const [anchoDeColumna, setAnchoDeColumna] = useState(0);
  const [arrastrando, setArrastrando] = useState(false);

  const ancho = acotarAnchoDeBarra(anchoBarra ?? ANCHO_BARRA_POR_OMISION);
  const anchoDelPanel = acotarAnchoDePanel(anchoPanel ?? ANCHO_PANEL_POR_OMISION);
  const redimensionable = alRedimensionarBarra !== undefined && !barraContraida;
  const panelRedimensionable = alRedimensionarPanel !== undefined && panel !== undefined;
  const pistaDeLaBarra = barraContraida
    ? "0px"
    : `min(${ancho}px, ${Math.round(FRACCION_MAXIMA_DE_VENTANA * 100)}vw)`;
  // Sin `min(…, vw)`: al panel el techo se lo pone `repartoDeColumnas`, que le manda el
  // centro a ocupar el sitio del chat en cuanto los dos no caben. Un tope de CSS aquí
  // encogería el panel por debajo de su suelo en vez de cambiar de reparto, que es
  // justamente la decisión que se sacó de la hoja de estilos.
  const pistaDelPanel = panel === undefined ? "0px" : `${anchoDelPanel}px`;

  useEffect(() => {
    const nodo = columna.current;
    if (nodo === null || typeof ResizeObserver === "undefined") return;
    const observador = new ResizeObserver(() => {
      const ancho = nodo.getBoundingClientRect().width;
      if (ancho > 0) setAnchoDeColumna(ancho);
    });
    observador.observe(nodo);
    return () => observador.disconnect();
  }, []);

  return (
    <div
      ref={marcoNodo}
      className={clsx(marco.frame, estilos.alto)}
      // La hoja copiada ya trae `.frame[data-dragging] { transition: none }`: sin eso, la
      // pista se movería por la curva de plegado y la columna se despegaría del tirador.
      {...(arrastrando ? { "data-dragging": "true" } : {})}
      // Se lo pide la hoja copiada para que `.detailsCol` no pinte una costura de 1 px
      // cuando su pista mide cero. Aquí además el contenido está desmontado, así que sin
      // esto quedaría una línea vertical pegada al borde sin nada detrás.
      {...(panel === undefined ? { "data-details-collapsed": "true" } : {})}
      style={{
        // `min(Xpx, 60vw)` y no `Xpx`: el techo de la ventana lo aplica el CSS EN VIVO, así
        // que encoger la ventana estrecha la barra sin tocar el ancho recordado.
        gridTemplateColumns: `${pistaDeLaBarra} minmax(0, 1fr) ${pistaDelPanel}`,
        // `.frame` trae `grid-template-rows: 100%`, una fila y del alto entero. Con
        // cabecera hacen falta dos, y la de abajo con `minmax(0, 1fr)` y no `1fr`: `1fr`
        // tiene suelo `auto`, así que una conversación larga estiraba la fila por debajo
        // del alto de la pantalla en vez de dejar scrollear la columna.
        ...(cabecera === undefined ? {} : { gridTemplateRows: "auto minmax(0, 1fr)" }),
      }}
    >
      {cabecera === undefined ? null : <div className={estilos.cabecera}>{cabecera}</div>}
      <div className={marco.sidebarCol}>{barraContraida ? null : barra}</div>
      {redimensionable ? (
        <Tirador
          lado="sidebar"
          etiqueta="Ancho de la barra lateral"
          ancho={ancho}
          minimo={ANCHO_BARRA_MINIMO}
          maximo={ANCHO_BARRA_MAXIMO}
          porOmision={ANCHO_BARRA_POR_OMISION}
          izquierda={pistaDeLaBarra}
          clase={estilos.tirador}
          {...(cabecera === undefined ? {} : { claseDeFila: estilos.tiradorEnFila })}
          marcoNodo={marcoNodo}
          // La barra empieza en el borde IZQUIERDO del marco, así que su ancho ES la
          // distancia del puntero a ese borde.
          medir={(clientX, caja) => clientX - caja.left}
          acotar={acotarAnchoDeBarra}
          alPedir={alRedimensionarBarra}
          alArrastrar={setArrastrando}
        />
      ) : null}
      <div
        ref={columna}
        className={clsx(marco.centerCol, conversacion.root)}
        style={
          anchoDeColumna === 0
            ? undefined
            : ({ "--dsh-conversation-column-width": `${anchoDeColumna}px` } as React.CSSProperties)
        }
      >
        {centro}
      </div>
      {/*
        La columna del panel va DESPUÉS del centro en el DOM, y su tirador después de ella:
        la hoja copiada enseña la pastilla del asa con `.detailsCol:hover ~ .handle[...]`,
        que es un hermano POSTERIOR. Con el orden al revés esa regla no dispararía nunca y el
        asa solo se vería al pasar por encima de sus 8 px.
      */}
      <div className={clsx(marco.detailsCol, conversacion.root)}>{panel}</div>
      {panelRedimensionable ? (
        <Tirador
          lado="details"
          etiqueta="Ancho del panel"
          ancho={anchoDelPanel}
          minimo={ANCHO_MINIMO_DEL_PANEL}
          maximo={ANCHO_PANEL_MAXIMO}
          porOmision={ANCHO_PANEL_POR_OMISION}
          // Contado desde la derecha: el panel se pega a ese borde. `calc` y no un número
          // porque el ancho del marco no se conoce al pintar.
          izquierda={`calc(100% - ${anchoDelPanel}px)`}
          clase={estilos.tiradorDelPanel}
          {...(cabecera === undefined ? {} : { claseDeFila: estilos.tiradorDelPanelEnFila })}
          marcoNodo={marcoNodo}
          // El panel acaba en el borde DERECHO, así que su ancho es lo que va del puntero a
          // ese borde: el espejo de la barra, y el único parámetro que los distingue.
          medir={(clientX, caja) => caja.right - clientX}
          acotar={acotarAnchoDePanel}
          alPedir={alRedimensionarPanel}
          alArrastrar={setArrastrando}
        />
      ) : null}
    </div>
  );
}

/**
 * Un asa de redimensionar, la misma para la barra y para el panel.
 *
 * Es hija del MARCO y no de la columna —las columnas recortan su desbordamiento, y esta
 * tira de 8 px monta a caballo del borde— y lleva la clase `.handle` de la hoja copiada,
 * que es donde vive esa geometría (`data-side` elige la variante: el `details` pinta
 * además una pastilla, la barra se queda con la tira). La pista de color al pasar por
 * encima es NUESTRA (`Maqueta.module.css`): el diseño deja la variante `sidebar`
 * invisible, y un asa que no se ve no invita a arrastrarla.
 *
 * Con cabecera se coloca en la SEGUNDA fila, y eso no es cosmético: un absoluto con celda
 * declarada toma esa celda como bloque contenedor, así que la tira deja de cruzar la barra
 * superior — donde solo taparía la miga con un cursor de redimensionar.
 *
 * Es el patrón «window splitter» de ARIA: un `separator` ENFOCABLE con `aria-valuenow`, o
 * sea el mismo control para el ratón y para el teclado. Sin `tabIndex` sería un asa que
 * solo existe si tienes ratón.
 *
 * **Lo que cambia entre los dos lados es `medir`**, y nada más: la barra mide desde el
 * borde izquierdo del marco y el panel desde el derecho. Todo lo demás —la captura del
 * puntero, las teclas, el doble clic y las cuatro trampas medidas que hay dentro— es el
 * mismo código, y por eso es una sola pieza.
 */
function Tirador({
  lado,
  etiqueta,
  ancho,
  minimo,
  maximo,
  porOmision,
  izquierda,
  clase,
  claseDeFila,
  marcoNodo,
  medir,
  acotar,
  alPedir,
  alArrastrar,
}: {
  lado: "sidebar" | "details";
  etiqueta: string;
  ancho: number;
  minimo: number;
  maximo: number;
  porOmision: number;
  /** Lo que va al `left` en línea. La hoja copiada lo transiciona, así que sigue la misma
   *  curva que la pista del grid y el asa no se despega del borde al plegar. */
  izquierda: string;
  clase: string;
  claseDeFila?: string;
  marcoNodo: React.RefObject<HTMLDivElement | null>;
  medir: (clientX: number, caja: DOMRect) => number;
  acotar: (px: number, anchoDeVentana?: number) => number;
  alPedir: (ancho: number, terminado: boolean) => void;
  alArrastrar: (arrastrando: boolean) => void;
}) {
  const [arrastrando, setArrastrando] = useState(false);

  const arrastrar = (valor: boolean): void => {
    setArrastrando(valor);
    alArrastrar(valor);
  };

  /** El ancho que pide un gesto, acotado. Se acota con la ventana porque es un gesto. */
  const pedir = (px: number, terminado: boolean): void => {
    alPedir(acotar(px, typeof window === "undefined" ? undefined : window.innerWidth), terminado);
  };

  const desdeElPuntero = (clientX: number, terminado: boolean): void => {
    const nodo = marcoNodo.current;
    if (nodo === null) return;
    pedir(medir(clientX, nodo.getBoundingClientRect()), terminado);
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={etiqueta}
      aria-valuenow={ancho}
      aria-valuemin={minimo}
      aria-valuemax={maximo}
      tabIndex={0}
      className={clsx(marco.handle, clase, claseDeFila)}
      data-side={lado}
      {...(arrastrando ? { "data-dragging": "true" } : {})}
      style={{ left: izquierda }}
      onPointerDown={(evento) => {
        // «> 0» y no «!== 0» a propósito: el botón principal es 0, y **jsdom no
        // implementa `PointerEvent`** —comprobado en jsdom 25.0.1—, así que el evento
        // que llega en los tests es un `Event` pelado sin `button`. Un `undefined` no
        // es un botón secundario, y con `!== 0` el gesto quedaba bloqueado ahí.
        if (evento.button > 0) return;
        // Sin esto, el arrastre selecciona el texto de la barra y del centro.
        evento.preventDefault();
        // El arrastre se abre ANTES de pedir la captura, y la captura va envuelta: es
        // una comodidad, no la condición del gesto. Con ella los `pointermove` de fuera
        // del asa siguen llegando AQUÍ y no hace falta colgar nada de `window`; sin
        // ella el arrastre sigue funcionando mientras el puntero no se salga de la
        // tira. Al revés —capturar primero— un fallo ahí se llevaba el gesto entero:
        // medido en Chrome, `setPointerCapture` LANZA si el `pointerId` no es de un
        // puntero activo, y jsdom no implementa el método siquiera.
        arrastrar(true);
        try {
          evento.currentTarget.setPointerCapture?.(evento.pointerId);
        } catch {
          // Sin captura; el arrastre ya está abierto.
        }
      }}
      onPointerMove={(evento) => {
        if (!arrastrando) return;
        desdeElPuntero(evento.clientX, false);
      }}
      onPointerUp={(evento) => {
        if (!arrastrando) return;
        arrastrar(false);
        desdeElPuntero(evento.clientX, true);
      }}
      // Un puntero cancelado (un gesto del sistema, un dedo que se va) NO es un
      // arrastre a medias que se quede pegado: se cierra con el último ancho pintado.
      onPointerCancel={() => {
        if (!arrastrando) return;
        arrastrar(false);
        pedir(ancho, true);
      }}
      // La captura se puede perder sin un `pointerup`: el puntero sale de la ventana, el
      // sistema se queda el gesto. Sin esto el arrastre quedaría abierto para siempre —
      // el marco con `data-dragging` y la barra siguiendo al ratón sin botón pulsado.
      // Tras un `pointerup` normal también llega, y entonces no hace nada: la guarda ya
      // ve el arrastre cerrado.
      onLostPointerCapture={() => {
        if (!arrastrando) return;
        arrastrar(false);
        pedir(ancho, true);
      }}
      onKeyDown={(evento) => {
        // Las flechas mueven el borde, no el ancho: en el panel, que crece hacia la
        // IZQUIERDA, «derecha» tiene que encogerlo o la tecla haría lo contrario de lo que
        // se ve. Es el mismo espejo que `medir`.
        const haciaElFinal = lado === "details" ? -1 : 1;
        const nuevo =
          evento.key === "ArrowLeft"
            ? ancho - PASO_DE_TECLADO * haciaElFinal
            : evento.key === "ArrowRight"
              ? ancho + PASO_DE_TECLADO * haciaElFinal
              : evento.key === "Home"
                ? minimo
                : evento.key === "End"
                  ? maximo
                  : undefined;
        if (nuevo === undefined) return;
        // Las flechas mueven el foco o la página si nadie las para.
        evento.preventDefault();
        pedir(nuevo, true);
      }}
      // Doble clic vuelve a la omisión, que es la salida de quien se ha pasado
      // arrastrando y no sabe a qué número volver.
      onDoubleClick={() => pedir(porOmision, true)}
    />
  );
}
