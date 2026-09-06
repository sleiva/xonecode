import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import clsx from "clsx";
import marco from "../../estilos/AppFrame.module.css";
import conversacion from "../../estilos/ConversationRoot.module.css";
import estilos from "./Maqueta.module.css";

/**
 * El armazón de columnas, con el CSS de deepseek (`estilos/AppFrame.module.css`) en vez
 * de la aproximación a mano que había antes: `.frame` es un grid, la barra vive en
 * `.sidebarCol` (que es quien pinta el relleno y el borde de la barra, no la barra
 * misma) y el centro en `.centerCol`. Cambiar el aspecto de esto vuelve a ser cambiar el
 * VALOR de un token, que es lo que pidió el usuario.
 *
 * Tres cosas las pone este componente porque la hoja copiada no las trae:
 *
 * 1. **Las pistas del grid.** `.frame` no declara `grid-template-columns`; en el
 *    original las escribe `AppFrame.tsx` en línea, calculadas por su solucionador de
 *    concesiones. Aquí no hay columna de detalles ni barra plegable, así que son dos:
 *    `ANCHO_BARRA` y el resto. Sin esto el grid tiene UNA columna y la barra se apila
 *    encima del centro.
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
 *    suelo, que es exactamente lo que un test sin layout debe ver.
 */
const ANCHO_BARRA = 280;

export function Maqueta({
  centro,
  barra,
  cabecera,
  barraContraida = false,
}: {
  centro: ReactNode;
  barra: ReactNode;
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
   */
  barraContraida?: boolean;
}) {
  const columna = useRef<HTMLDivElement>(null);
  const [anchoDeColumna, setAnchoDeColumna] = useState(0);

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
      className={clsx(marco.frame, estilos.alto)}
      style={{
        gridTemplateColumns: `${barraContraida ? 0 : ANCHO_BARRA}px minmax(0, 1fr)`,
        // `.frame` trae `grid-template-rows: 100%`, una fila y del alto entero. Con
        // cabecera hacen falta dos, y la de abajo con `minmax(0, 1fr)` y no `1fr`: `1fr`
        // tiene suelo `auto`, así que una conversación larga estiraba la fila por debajo
        // del alto de la pantalla en vez de dejar scrollear la columna.
        ...(cabecera === undefined ? {} : { gridTemplateRows: "auto minmax(0, 1fr)" }),
      }}
    >
      {cabecera === undefined ? null : <div className={estilos.cabecera}>{cabecera}</div>}
      <div className={marco.sidebarCol}>{barraContraida ? null : barra}</div>
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
    </div>
  );
}
