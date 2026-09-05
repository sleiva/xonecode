import type { Acto } from "../tipos.js";
import { usarPegadoAbajo } from "../pegadoAbajo.js";
import { BotonDeCopiar } from "./BotonDeCopiar.js";
import { MarkdownText, type MarkdownCodeLabels } from "@deepseek-ai/dsh-client-ui-primitives";
import vista from "../../estilos/ChatView.module.css";
import estilos from "./Chat.module.css";

/**
 * La vista de lectura: cada turno de USUARIO o ASISTENTE como un globo, con el del
 * asistente renderizado por `MarkdownText` (`@deepseek-ai/dsh-client-ui-primitives`) en
 * vez de `marked` + `DOMPurify` (Task 13). No es «parsear y luego sanear»: su propio
 * tipo la documenta como «Untrusted assistant-Markdown renderer» y su política es que el
 * HTML crudo se pinta como TEXTO LITERAL — nunca entra al DOM (verificado leyendo su
 * `render.js` compilado: el nodo `html` del árbol devuelve `node.value`, una cadena, no
 * `dangerouslySetInnerHTML`) — así que no hay sanitizer cuyo agujero pueda fallar, porque
 * no se construye HTML a partir del texto del modelo. `Chat.test.tsx` prueba justo eso
 * contra el DOM real, no contra la promesa del tipo.
 *
 * **`streaming` va a `true` solo en el último acto de asistente MIENTRAS el turno corre.**
 * Desde que `pielWeb.ts` emite el acto por trozos, el último puede estar a medio llegar y
 * ese modo es justo para eso: `MarkdownText` no resalta vallas ni TeX a medio cerrar porque
 * el cierre viene detrás. Pero **apaga el resaltado entero** (`lang: undefined` en su
 * `renderCode`), así que dejarlo puesto cuando el turno ya terminó deja el último mensaje en
 * gris para siempre — medido en pantalla. Por eso hace falta saber si hay turno en vuelo, y
 * eso lo dice el servidor (`clase: "turno"`), no se deduce.
 *
 * `codeLabels` va en español porque el paquete es «zero-cordis» y no puede leer el
 * locale de la app: sin esto, el botón de copiar de cada valla de código saldría en
 * chino, que es el valor por omisión documentado en su propio README.
 *
 * El texto del USUARIO se pinta tal cual, sin pasar por `MarkdownText`: son sus propias
 * palabras, no hay nada que interpretar como markdown.
 *
 * **El trabajo del agente se ve AQUÍ, y se PLIEGA al terminar.** Mientras el turno corre,
 * el pulso —razonamiento, tools y fases— se enseña abierto: es lo único que hay que mirar
 * mientras el agente trabaja. En cuanto el turno acaba se dobla en una línea («Trabajo del
 * agente · N pasos · Xs») y la conversación se lee sin el andamio. No se BORRA: lo que pasó,
 * pasó, y está a un clic — en la Trayectoria sigue entero y sin plegar.
 *
 * **El trabajo del agente se ve AQUÍ, no solo en la Trayectoria.** Antes el Chat pintaba
 * únicamente los globos de usuario y asistente, y todo lo demás —las tools que llama, las
 * fases, lo que piensa— vivía en la otra pestaña. El resultado, medido en pantalla: se
 * escribía una petición y no pasaba nada durante minutos, con el agente trabajando a la
 * vista de nadie. Ahora la actividad va intercalada en la conversación, en gris y en una
 * línea, como en el harness de DeepSeek: `razonamiento`, `herramientas` y `fase`.
 *
 * Lo que sigue siendo de la Trayectoria y no se duplica aquí: `sistema` (avisos de la
 * consola, no del turno) y `fin` (el resumen con la duración). La pestaña sigue siendo el
 * registro completo; esto es el pulso.
 */
const ETIQUETAS_DE_CODIGO: MarkdownCodeLabels = { copyLabel: "Copiar", copiedLabel: "Copiado" };

/** Los actos que son PULSO del turno y no conversación: se pliegan al terminar. */
const ES_PULSO = new Set(["razonamiento", "herramientas", "fase"]);

/**
 * Un tramo de pulso: los actos de trabajo consecutivos, con si su turno YA terminó.
 *
 * Agrupar es lo que permite plegarlo entero en una línea cuando acaba. Mientras el turno
 * corre se enseña abierto —es lo único que se ve mientras el agente trabaja—; en cuanto hay
 * un `fin` detrás, se convierte en «N pasos · Xs» y deja de competir con la respuesta.
 */
interface TramoDePulso {
  desde: number;
  actos: Acto[];
  terminado: boolean;
  /** La duración del turno que lo cerró, si lo hay. */
  ms?: number;
}

export function Chat({ actos, turnoEnVuelo = false }: { actos: readonly Acto[]; turnoEnVuelo?: boolean }) {
  // Cuál es el último acto de asistente: es el único que puede estar llegando todavía.
  const ultimoAsistente = actos.map((a) => a.tipo).lastIndexOf("asistente");

  /**
   * La lista a pintar: los actos de conversación tal cual, y los de pulso agrupados en
   * tramos. Se calcula en una pasada y no con un `filter` por acto porque un tramo necesita
   * saber qué viene DESPUÉS —si hay un `fin`, su turno acabó—, y eso no se ve mirando un
   * acto solo.
   */
  const piezas: Array<{ tipo: "acto"; acto: Acto; indice: number } | { tipo: "pulso"; tramo: TramoDePulso }> = [];
  let tramo: TramoDePulso | undefined;
  for (const [indice, acto] of actos.entries()) {
    if (ES_PULSO.has(acto.tipo)) {
      if (tramo === undefined) {
        tramo = { desde: indice, actos: [], terminado: false };
        piezas.push({ tipo: "pulso", tramo });
      }
      tramo.actos.push(acto);
      continue;
    }
    // Cualquier acto de conversación CIERRA el tramo abierto —lo que venga después es otro
    // tramo—, pero no lo da por terminado: el turno puede seguir (más tools tras la
    // respuesta). Lo que lo termina es el `fin`, y entonces termina TODOS los de ese turno.
    tramo = undefined;
    if (acto.tipo === "fin") {
      let ultimo: TramoDePulso | undefined;
      for (const pieza of piezas) {
        if (pieza.tipo !== "pulso") continue;
        pieza.tramo.terminado = true;
        ultimo = pieza.tramo;
      }
      // La duración del turno se la queda el ÚLTIMO tramo: es el que cierra el trabajo, y
      // repartirla entre todos sería inventarse cuánto duró cada trozo.
      if (ultimo !== undefined) ultimo.ms = acto.ms;
      continue;
    }
    if (acto.tipo === "sistema") continue;
    piezas.push({ tipo: "acto", acto, indice });
  }
  // El scroller sigue lo que llega, salvo que hayas subido a leer. Sin esto el texto crecía
  // fuera de la vista: el modelo escribía y la pantalla se quedaba donde estaba.
  const { nodo, alDesplazar } = usarPegadoAbajo(actos);
  return (
    <div className={vista.root}>
      <div className={vista.scroll} ref={nodo} onScroll={alDesplazar}>
        {/* La columna centrada: `max-width: var(--dsh-chat-content-width); margin: 0 auto`
            en la hoja copiada, con la variable declarada por `.root` de
            `estilos/ConversationRoot.module.css` (que `Maqueta.tsx` monta sobre la
            columna central). Es lo que pone la conversación en el CENTRO y no pegada a la
            barra, y lo que la alinea con el compositor, que lee la MISMA variable. */}
        <div className={vista.column}>
          {piezas.map((pieza) => {
            if (pieza.tipo === "pulso") {
              const { tramo: t } = pieza;
              const pasos = t.actos.reduce(
                (n, a) => n + (a.tipo === "herramientas" ? a.lineas.length : 1),
                0
              );
              return (
                // Abierto mientras el turno corre —es lo único que se ve mientras trabaja—
                // y plegado en cuanto termina: la conversación se lee sin el andamio, y el
                // andamio sigue estando a un clic. No se BORRA: lo que pasó, pasó.
                <details key={`pulso-${t.desde}`} className={`${vista.flowItem} ${estilos.pensando}`} open={!t.terminado}>
                  <summary className={estilos.resumen}>
                    {t.terminado
                      ? `Trabajo del agente · ${pasos} ${pasos === 1 ? "paso" : "pasos"}${
                          t.ms === undefined ? "" : ` · ${Math.round(t.ms / 100) / 10}s`
                        }`
                      : "Trabajando…"}
                  </summary>
                  <div className={estilos.detalleDePulso}>
                    {t.actos.map((a, i) => {
                      if (a.tipo === "razonamiento") {
                        return (
                          <p key={i} className={`${estilos.textoTenue} ${estilos.pensado}`}>
                            {a.texto}
                          </p>
                        );
                      }
                      if (a.tipo === "herramientas") {
                        return (
                          <ul key={i} className={estilos.trabajo}>
                            {a.lineas.map((linea, j) => (
                              <li key={j} className={estilos.textoTenue}>
                                {linea}
                              </li>
                            ))}
                          </ul>
                        );
                      }
                      if (a.tipo === "fase") {
                        return (
                          <p key={i} className={`${estilos.textoTenue} ${estilos.fase}`}>
                            {a.texto} · {Math.round(a.ms / 100) / 10}s
                          </p>
                        );
                      }
                      return null;
                    })}
                  </div>
                </details>
              );
            }
            const { acto, indice } = pieza;
            if (acto.tipo === "usuario") {
              return (
                <p key={indice} className={`${vista.flowItem} ${estilos.globo} ${estilos.usuario}`}>
                  {acto.texto}
                </p>
              );
            }
            if (acto.tipo === "asistente") {
              return (
                <div key={indice} className={`${vista.flowItem} ${estilos.globo} ${estilos.asistente}`}>
                  <MarkdownText
                    text={acto.texto}
                    // Solo mientras el turno CORRE. `MarkdownText` desactiva el resaltado
                    // en modo streaming (`lang: context.streaming ? undefined : lang`,
                    // medido en su `renderCode`), que es justo lo que quieres a medio
                    // llegar —una valla sin cerrar no se puede colorear— y justo lo que no
                    // quieres después: el último mensaje se quedaba gris para siempre.
                    streaming={turnoEnVuelo && indice === ultimoAsistente}
                    codeLabels={ETIQUETAS_DE_CODIGO}
                  />
                  {/*
                    Copiar la respuesta ENTERA, con el icono del harness. Las vallas de
                    código ya traen el suyo (lo pinta `MarkdownText`), pero copiar el
                    mensaje completo no se podía sin seleccionar a mano.
                  */}
                  <div className={estilos.acciones}>
                    <BotonDeCopiar texto={acto.texto} etiqueta="Copiar la respuesta" />
                  </div>
                </div>
              );
            }
            if (acto.tipo === "error") {
              return (
                <p key={indice} className={`${vista.flowItem} ${estilos.globo} ${estilos.error}`}>
                  {acto.texto}
                </p>
              );
            }
            return null;
          })}
        </div>
      </div>
    </div>
  );
}
