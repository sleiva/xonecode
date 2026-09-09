import type { Acto } from "../tipos.js";
import { usarPegadoAbajo } from "../pegadoAbajo.js";
import { protegerDolares } from "../protegerDolares.js";
import { ETIQUETAS_DE_CODIGO } from "../etiquetasDeCodigo.js";
import { BotonDeCopiar } from "./BotonDeCopiar.js";
import { MarkdownText } from "@deepseek-ai/dsh-client-ui-primitives";
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
 * `codeLabels` va en español porque el paquete es «zero-cordis» y no puede leer el locale
 * de la app: sin esto, el botón de copiar de cada valla de código saldría en chino, que es
 * el valor por omisión documentado en su propio README. La pareja de palabras vive en
 * `etiquetasDeCodigo.ts` porque la pestaña Ficheros renderiza markdown con las mismas.
 *
 * El texto del USUARIO se pinta tal cual, sin pasar por `MarkdownText`: son sus propias
 * palabras, no hay nada que interpretar como markdown.
 *
 * **El trabajo del agente se ve AQUÍ, y se PLIEGA al terminar.** Mientras el turno corre,
 * el pulso —razonamiento, tools y fases— se enseña abierto: es lo único que hay que mirar
 * mientras el agente trabaja. En cuanto el turno acaba se dobla en una línea («Trabajo del
 * agente · N pasos · Xs») y la conversación se lee sin el andamio. No se BORRA: lo que pasó,
 * pasó, y está a un clic — en las Trazas sigue entero y sin plegar.
 *
 * **El trabajo del agente se ve AQUÍ, no solo en las Trazas.** Antes el Chat pintaba
 * únicamente los globos de usuario y asistente, y todo lo demás —las tools que llama, las
 * fases, lo que piensa— vivía en la otra pestaña. El resultado, medido en pantalla: se
 * escribía una petición y no pasaba nada durante minutos, con el agente trabajando a la
 * vista de nadie. Ahora la actividad va intercalada en la conversación, en gris y en una
 * línea, como en el harness de DeepSeek: `razonamiento`, `herramientas` y `fase`.
 *
 * Lo que sigue siendo de las Trazas y no se duplica aquí: `sistema` (avisos de la
 * consola, no del turno) y `fin` (el resumen con la duración). La pestaña sigue siendo el
 * registro completo; esto es el pulso.
 */
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

export function Chat({
  actos,
  turnoEnVuelo = false,
  historica = false,
  sinAprobacion = false,
  trabajoAlAbrir,
  segundosEnVuelo,
  proyecto,
  modelo,
  sesion,
  alAbrirArtefacto,
}: {
  actos: readonly Acto[];
  turnoEnVuelo?: boolean;
  /**
   * La sesión es una RELECTURA (`alta.historica`): se reabrió de otra sesión de xonecode y
   * el agente no la recuerda. Se dice arriba del todo, con palabras. Sin esto la pantalla
   * enseñaba la conversación y el compositor activo como si se pudiera seguir hablando.
   */
  historica?: boolean;
  /**
   * Este proyecto aplica las escrituras SIN pedir aprobación (`alta.sinAprobacion`). Se
   * dice arriba, con la conversación, y no solo en el aviso del turno: la decisión se tomó
   * una vez —quizá hace meses, en `settings.json`— y quien se sienta hoy tiene que saberlo
   * ANTES de pedir nada, no después con los ficheros ya cambiados.
   */
  sinAprobacion?: boolean;
  /**
   * Lo que YA estaba sin commitear en el proyecto cuando se abrió esta sesión
   * (`alta.trabajoAlAbrir`). Ausente = nada que decir: el árbol estaba limpio, no hay git
   * con qué mirar —todo proyecto offline— o no se pudo medir. Ninguna de las tres es un
   * aviso, y darlo igualmente sería el aviso que enseña a ignorar los avisos.
   */
  trabajoAlAbrir?: { ficheros: string[]; total: number };
  /** Cuántos segundos lleva el turno en vuelo (`useCronometro`). Ausente = no hay turno. */
  segundosEnVuelo?: number;
  /** Para el estado vacío: dónde estás y con qué modelo. Ausentes = no se afirman. */
  proyecto?: string;
  modelo?: string;
  /**
   * El id de la sesión abierta (`alta.sesionActiva`), y solo para una cosa: componer la
   * ruta del proyecto donde está un artefacto. Ausente —la sesión no tiene id hasta que se
   * vuelca el primer acto— y la tarjeta enseña la ruta virtual a secas en vez de inventarse
   * una. La ruta REAL de la máquina no viaja nunca: el cable puede ir por un túnel.
   */
  sesion?: string;
  /**
   * Abrir un artefacto: su tarjeta lo ofrece pulsando el nombre.
   *
   * Opcional a propósito. Sin manejador el nombre se pinta como RÓTULO y no como botón: un
   * botón que no lleva a ninguna parte es el botón muerto de siempre, y este componente se
   * monta también en tests que no cablean la pestaña.
   */
  alAbrirArtefacto?: (ruta: string) => void;
}) {
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
          {actos.length === 0 && !historica ? (
            // Una sesión nueva era un vacío de setecientos píxeles: ni saludo, ni qué se
            // puede pedir, ni en qué proyecto estás — y la barra no la enseña hasta el
            // primer acto. Todo lo que se dice aquí ya viajaba por el cable.
            <section className={`${vista.flowItem} ${estilos.bienvenida}`} aria-label="sesión nueva">
              <h2 className={estilos.bienvenidaTitulo}>
                {proyecto === undefined ? "Sesión nueva" : `Sesión nueva en ${proyecto}`}
              </h2>
              <p>
                Pide algo en la caja de abajo: una pantalla nueva, un cambio en un <code>.xne</code>,
                una duda de XOne. El agente lee el proyecto, propone los cambios y{" "}
                <strong>te pide aprobación antes de escribir</strong> ningún fichero.
              </p>
              <p>
                Escribe <code>/</code> para ver los comandos.
                {modelo === undefined ? null : (
                  <>
                    {" "}
                    Trabajará con <code>{modelo}</code>; se cambia en la pastilla de la caja.
                  </>
                )}
              </p>
            </section>
          ) : null}
          {sinAprobacion ? (
            // `role="note"` y no `alert`: es una condición permanente de este proyecto, no
            // algo que acabe de pasar. Va arriba del todo, por delante incluso del aviso de
            // relectura: cambia lo que va a ocurrir con lo próximo que escribas.
            <p role="note" className={`${vista.flowItem} ${estilos.sinAprobacion}`}>
              Este proyecto escribe <strong>sin pedirte aprobación</strong>: los cambios se
              aplican solos y cada turno te dirá qué ficheros tocó. Escribe{" "}
              <code>/aprobacion humana</code> para volver a decidir tú.
            </p>
          ) : null}
          {trabajoAlAbrir === undefined ? null : (
            // Va detrás de `sinAprobacion` y delante de la relectura: los dos primeros son
            // sobre el proyecto y el disco —con qué te encuentras—, y el tercero es sobre
            // esta conversación. `role="note"`: no ha fallado nada.
            //
            // En PASADO, y no es un matiz de estilo: la medida es del instante de abrir y
            // no se repite en los reanuncios del alta, precisamente para que no pueda
            // contar como ajeno lo que esta sesión escriba después. Un «hay cambios» sería
            // falso en cuanto alguien commitee, con el aviso todavía puesto.
            // `div` y no `p` como los otros dos avisos: éste lleva una LISTA dentro, y un
            // `<ul>` no es contenido válido de un `<p>`. React lo monta por API del DOM y
            // no por el parser, así que no se ve romperse — pero un navegador que parsee
            // ese marcado cierra el párrafo antes de la lista, y entonces el fondo del
            // aviso se acabaría en la primera línea. El estilo va por CLASE, no por
            // etiqueta, así que no cambia nada más.
            <div role="note" className={`${vista.flowItem} ${estilos.trabajoAlAbrir}`}>
              Cuando abriste esta sesión, el proyecto ya tenía{" "}
              <strong>
                {trabajoAlAbrir.total} {trabajoAlAbrir.total === 1 ? "fichero" : "ficheros"} sin commitear
              </strong>
              . No los ha escrito esta conversación: pueden ser de otra sesión, de una tarea de
              fondo o tuyos de antes.
              <ul>
                {trabajoAlAbrir.ficheros.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
              {trabajoAlAbrir.total > trabajoAlAbrir.ficheros.length ? (
                <>y {trabajoAlAbrir.total - trabajoAlAbrir.ficheros.length} más</>
              ) : null}
            </div>
          )}
          {historica ? (
            // `role="note"`: es información de contexto, no una alerta. Y va DENTRO de la
            // columna, encabezando la conversación a la que se refiere.
            <p role="note" className={`${vista.flowItem} ${estilos.relectura}`}>
              Conversación reabierta: el agente no la recuerda. Lo que escribas empieza un hilo
              nuevo sobre este proyecto, con esta conversación a la vista pero no en su memoria.
            </p>
          ) : null}
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
                      : segundosEnVuelo === undefined
                        ? "Trabajando…"
                        : `Trabajando… · ${segundosEnVuelo} s`}
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
                // `md-cuerpo` es una clase GLOBAL, no de módulo: el cuerpo de un documento
                // markdown se pinta igual aquí y en el `.md` que enseña la pestaña
                // Ficheros, así que sus reglas viven en `estilos/markdown.css`.
                <div key={indice} className={`${vista.flowItem} ${estilos.globo} ${estilos.asistente} md-cuerpo`}>
                  <MarkdownText
                    // Con los dólares escapados: el renderizador los lee como TeX y no
                    // se puede apagar (`protegerDolares.ts`). El botón de copiar de abajo
                    // se queda con el texto original.
                    text={protegerDolares(acto.texto)}
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
            if (acto.tipo === "artefacto") {
              // La tarjeta existe porque este acto es el único del turno que se escribió
              // SIN aprobación —no es un fichero del proyecto—, y una escritura que nadie
              // aprueba no puede ser además muda. Dice qué es, cuánto pesa y dónde está.
              //
              // Dónde: la ruta desde la RAÍZ DEL PROYECTO, que se puede componer aquí
              // porque el id de la sesión ya viaja en el alta. Nunca la ruta de la máquina
              // —el cable puede ir por un túnel—, y sin id de sesión se enseña la virtual,
              // que es la verdad que se tiene.
              const donde =
                sesion === undefined
                  ? acto.ruta
                  : `.xonecode/sesiones/${sesion}/artefactos/${acto.ruta.slice("/artefactos/".length)}`;
              return (
                <div key={indice} className={`${vista.flowItem} ${estilos.artefacto}`}>
                  <div className={estilos.artefactoFila}>
                    <span aria-hidden className={estilos.artefactoIcono}>
                      🖼
                    </span>
                    {/* El NOMBRE es el enlace: lleva a la pestaña Artefactos con este
                        elegido. La tarjeta es lo primero que se ve cuando el agente acaba de
                        dibujar, y sin esto había que ir a buscar la pestaña y elegirlo otra
                        vez. Sin manejador se queda como rótulo. */}
                    {alAbrirArtefacto === undefined ? (
                      <span className={estilos.artefactoNombre}>{acto.nombre}</span>
                    ) : (
                      <button
                        type="button"
                        className={`${estilos.artefactoNombre} ${estilos.artefactoAbrir}`}
                        onClick={() => alAbrirArtefacto(acto.ruta)}
                      >
                        {acto.nombre}
                      </button>
                    )}
                    <span className={estilos.artefactoPeso}>
                      {Math.max(1, Math.round(acto.bytes / 1024))} KB
                    </span>
                    <BotonDeCopiar texto={donde} etiqueta="Copiar la ruta del artefacto" />
                  </div>
                  <p className={estilos.artefactoRuta}>{donde}</p>
                  <p className={estilos.artefactoNota}>
                    No es un fichero del proyecto: vive con esta sesión, no entra en git y no
                    sube a CloudStudio.
                  </p>
                </div>
              );
            }
            if (acto.tipo === "sistema") {
              // Los actos de SISTEMA se pintaban solo en Trazas, y eso estaba mal medido:
              // por aquí pasan las dos cosas que más falta hacen a la vista. Una es la
              // respuesta a un comando que el usuario acaba de teclear —`/aprobacion` decía
              // su respuesta a una pestaña de depuración—; la otra son los avisos de
              // honestidad (`core/bitacora.ts`), y un aviso que solo vive en la pestaña de
              // depurar el harness es exactamente el aviso que nadie lee, que es lo que esa
              // bitácora existe para evitar. Van fuera del tramo plegable a propósito: el
              // pulso se dobla al terminar el turno y esto no puede desaparecer con él.
              return (
                <p key={indice} role="note" className={`${vista.flowItem} ${estilos.sistema}`}>
                  {acto.texto}
                </p>
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
