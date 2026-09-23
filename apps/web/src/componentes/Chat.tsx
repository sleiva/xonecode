import { Fragment } from "react";
import type { Acto, ConsumoDeTurno } from "../tipos.js";
import { usarPegadoAbajo } from "../pegadoAbajo.js";
import { useCronometro } from "../cronometro.js";
import { protegerDolares } from "../protegerDolares.js";
import { ETIQUETAS_DE_CODIGO } from "../etiquetasDeCodigo.js";
import { BotonDeCopiar } from "./BotonDeCopiar.js";
import { CierreDelTurno } from "./CierreDelTurno.js";
import { urlDeArtefacto } from "./Artefactos.js";
import { hayCosteQueEnsenar } from "./CosteDelTurno.js";
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
/**
 * Un tramo de trabajo: el `<details>` con «Trabajo del agente» y el andamio dentro.
 *
 * Es un componente y no un trozo del `map` porque necesita un `ref` y un efecto — ver el
 * scroll de abajo.
 *
 * **Nace PLEGADO siempre, también con el turno en vuelo.** Se abría mientras corría, «porque
 * es lo único que se ve mientras trabaja»; dejó de ser cierto cuando el resumen empezó a
 * llevar el paso actual y su cronómetro, que es justo lo que se lee con el pulso plegado.
 * Medido en pantalla: un tramo abierto de cuarenta pasos empuja la respuesta fuera de la
 * vista, y con un turno largo son varios a la vez.
 *
 * **Y al abrirlo es una VENTANA con scroll, pegada al final.** El andamio de un turno de
 * aparato son decenas de líneas; volcarlas enteras convierte un clic de curiosidad en perder
 * el sitio. Se reusa `usarPegadoAbajo`, el mismo que mantiene el transcript abajo mientras
 * el agente escribe: baja solo si ya estabas abajo, así que subir a leer una línea de hace
 * diez tools no te devuelve al fondo en la siguiente.
 */
function TramoDeTrabajo({
  tramo: t,
  pasos,
  segundosEnVuelo,
  pasoActual,
  segundosDelPaso,
}: {
  tramo: TramoDePulso;
  pasos: number;
  segundosEnVuelo?: number;
  pasoActual?: string;
  segundosDelPaso?: number;
}) {
  // La dependencia es cuánto ha llegado: el efecto corre después del pintado, que es cuando
  // `scrollHeight` ya vale lo nuevo.
  const { nodo, alDesplazar } = usarPegadoAbajo(t.actos.length);
  return (
    <details
      className={`${vista.flowItem} ${estilos.pensando}`}
      // Al abrirlo, al FINAL: lo último es lo que está pasando, y es lo que se viene a ver.
      onToggle={(e) => {
        if (!e.currentTarget.open || nodo.current === null) return;
        nodo.current.scrollTop = nodo.current.scrollHeight;
      }}
    >
      <summary className={estilos.resumen}>
        {t.terminado ? (
          <>
            {`Trabajo del agente · ${pasos} ${pasos === 1 ? "paso" : "pasos"}`}
            {/*
              La duración y el coste del turno, en la línea que ya lo cierra. Es el nivel
              «mensaje» que faltaba: el contador del compositor dice lo que lleva la
              conversación, y de un acumulado no se saca lo que costó lo último. Se compone en
              `CierreDelTurno` y no aquí, porque el mismo par lo pinta el cierre de un turno
              sin trabajo: dos copias serían dos sitios donde la duración y el coste pueden
              dejar de ir juntos.
            */}
            {t.ms === undefined && t.consumo === undefined ? null : (
              <>
                {" · "}
                <CierreDelTurno ms={t.ms} consumo={t.consumo} />
              </>
            )}
          </>
        ) : (
          // Una caja FLEXIBLE acotada al ancho del `summary`: sin ella el recorte del paso
          // actual no se aplica (un `span` en línea no recorta) y una línea larga —medido: el
          // aviso de un turno que falló— salía de la columna con su barra de scroll horizontal.
          <span className={estilos.lineaEnVuelo}>
            <span className={estilos.enVuelo}>
              {segundosEnVuelo === undefined ? "Trabajando…" : `Trabajando… · ${segundosEnVuelo} s`}
            </span>
            {/*
              Y en qué paso está. Va aquí, en la línea que se ve con el pulso PLEGADO, porque
              desplegarlo para saber qué está haciendo es exactamente lo que sobra cuando un
              turno se alarga — y desde que nace plegado, esta línea es lo único que lo dice.
            */}
            {pasoActual === undefined ? null : (
              <span className={estilos.pasoActual}>
                {` · ${pasoActual}`}
                {segundosDelPaso === undefined ? "" : ` · ${segundosDelPaso} s`}
              </span>
            )}
          </span>
        )}
      </summary>
      <div className={estilos.detalleDePulso} ref={nodo} onScroll={alDesplazar}>
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

/** ¿Hay algo que PREVISUALIZAR de este artefacto? Solo una imagen, y por su `mime`, que sale
 *  de una tabla cerrada por extensión (`core/artefactos.ts`) — nunca de olfatear los bytes. */
const esImagen = (acto: Extract<Acto, { tipo: "artefacto" }>): boolean =>
  acto.mime !== undefined && acto.mime.startsWith("image/");

/**
 * Las capturas de un tramo, en una FILA de miniaturas.
 *
 * Una captura es lo único del hilo que se entiende de un vistazo sin abrir nada, y salía como
 * un renglón con su nombre: `captura-1790061246909.jpg`, un timestamp que no dice nada de lo
 * que hay dentro. En un turno de aparato son seis o siete, o sea seis o siete renglones
 * iguales. Enseñar la imagen contesta la pregunta que el nombre no contesta.
 *
 * Tres cosas que no son de forma:
 *
 * - **Se pinta con un `<img src>` a la ruta HTTP del artefacto**, nunca marcado inyectado en
 *   el DOM: es la misma regla que el visor de Ficheros, y el motivo es que un `.svg` puede
 *   traer un `<script>` dentro. En un `<img>` no se ejecuta.
 * - **Sin texto, pero con NOMBRE ACCESIBLE.** Lo que se quita es el renglón, no la
 *   identidad: sin `alt` esto sería un adorno para quien no ve la imagen, y el control que
 *   lleva a la pestaña dejaría de tener nombre.
 * - **Altura fija y ancho automático.** Una captura de móvil es muy vertical y un diagrama
 *   muy horizontal; recortando al centro con `object-fit: cover` se pierde justo la barra
 *   superior, que es lo que dice en qué pantalla está. Cada una toma el ancho que le toque.
 */
function CapturasDelTramo({
  actos,
  alAbrir,
}: {
  actos: Extract<Acto, { tipo: "artefacto" }>[];
  alAbrir?: (ruta: string) => void;
}) {
  return (
    <div className={estilos.capturas}>
      {actos.map((a, i) =>
        alAbrir === undefined ? (
          // Sin manejador no hay a dónde ir, así que no es un botón: el botón muerto de
          // siempre. La imagen se sigue viendo, que es la mitad que sí funciona.
          <img key={i} className={estilos.captura} src={urlDeArtefacto(a.ruta)} alt={a.nombre} />
        ) : (
          <button
            key={i}
            type="button"
            className={estilos.capturaAbrir}
            onClick={() => alAbrir(a.ruta)}
            title={`${a.nombre} · ${Math.max(1, Math.round(a.bytes / 1024))} KB`}
          >
            <img className={estilos.captura} src={urlDeArtefacto(a.ruta)} alt={a.nombre} />
          </button>
        )
      )}
    </div>
  );
}

/**
 * La tarjeta de un ARTEFACTO en el hilo.
 *
 * Existe porque este acto es el único del turno que se escribió SIN aprobación —no es un
 * fichero del proyecto—, y una escritura que nadie aprueba no puede ser además muda. Dice
 * qué es, cuánto pesa y por dónde abrirlo.
 *
 * **Lo que ya NO dice, y por qué.** Llevaba debajo dos renglones más: la ruta entera y una
 * frase —«No es un fichero del proyecto: vive con esta sesión, no entra en git y no sube a
 * CloudStudio»—. Medido en el navegador sobre una sesión real: la tarjeta medía 113 px de
 * los que **23 son el dato**; 36 px eran la ruta, con el uuid de la sesión partido en dos
 * líneas, y 18 px esa frase, **idéntica en las dieciséis tarjetas** de esa conversación.
 *
 * Y la frase no era un hecho de ese fichero: es una REGLA, la misma para todos, así que
 * repetirla por tarjeta enseña a no leerla — el patrón del aviso que salta cuando no ha
 * pasado nada, escrito en la bitácora de este repo. **Donde se conserva es al pie de la
 * pestaña Artefactos**, una sola vez y donde ya vivía, que es donde se decide sobre ellos.
 * El `title` de aquí la repite y no cuenta como conservarla: un `title` es solo hover y no
 * lo alcanzan ni el teclado ni el táctil, la misma lección que `SelectorDeModo.tsx`.
 *
 * La RUTA no se pierde: sigue siendo lo que copia el botón, que es para lo que se usaba —
 * para leerla nadie necesita el uuid, y para pegarla en un terminal sí—.
 */
function TarjetaDeArtefacto({
  acto,
  sesion,
  alAbrir,
}: {
  acto: Extract<Acto, { tipo: "artefacto" }>;
  sesion?: string;
  alAbrir?: (ruta: string) => void;
}) {
  // La ruta desde la RAÍZ DEL PROYECTO, que se puede componer aquí porque el id de la sesión
  // ya viaja en el alta. Nunca la ruta de la máquina —el cable puede ir por un túnel—, y sin
  // id de sesión se copia la virtual, que es la verdad que se tiene.
  const donde =
    sesion === undefined
      ? acto.ruta
      : `.xonecode/sesiones/${sesion}/artefactos/${acto.ruta.slice("/artefactos/".length)}`;
  return (
    <div
      className={estilos.artefacto}
      title="No es un fichero del proyecto: vive con esta sesión, no entra en git y no sube a CloudStudio."
    >
      <div className={estilos.artefactoFila}>
        <span aria-hidden className={estilos.artefactoIcono}>
          🖼
        </span>
        {/* El NOMBRE es el enlace: lleva a la pestaña Artefactos con este elegido. La
            tarjeta es lo primero que se ve cuando el agente acaba de dibujar, y sin esto
            había que ir a buscar la pestaña y elegirlo otra vez. Sin manejador se queda
            como rótulo: un botón que no lleva a ninguna parte es el botón muerto de
            siempre. */}
        {alAbrir === undefined ? (
          <span className={estilos.artefactoNombre}>{acto.nombre}</span>
        ) : (
          <button
            type="button"
            className={`${estilos.artefactoNombre} ${estilos.artefactoAbrir}`}
            onClick={() => alAbrir(acto.ruta)}
          >
            {acto.nombre}
          </button>
        )}
        <span className={estilos.artefactoPeso}>{Math.max(1, Math.round(acto.bytes / 1024))} KB</span>
        <BotonDeCopiar texto={donde} etiqueta="Copiar la ruta del artefacto" />
      </div>
    </div>
  );
}

/**
 * Qué actos forman el TRAMO de trabajo, o sea qué se agrupa bajo «Trabajo del agente».
 *
 * **`artefacto` está aquí, y no es obvio**: no es un paso que el agente diera, es lo que un
 * paso PRODUJO. Fuera del conjunto caía en la rama de conversación, que cierra el tramo
 * abierto, y el efecto medido en pantalla sobre una sesión de `device-controller` era la
 * secuencia `P5 A P5 A P8 A P1 A P2`: cinco tarjetas alternando con cinco bloques, cuatro de
 * ellos de uno o dos pasos. Es exactamente el fallo que el `continue` de `sincronizacion`
 * evita por el otro lado, con la diferencia de que un artefacto SÍ se pinta.
 *
 * Estar en el tramo no significa plegarse con él: las tarjetas salen FUERA del `<details>`
 * (ver el render), porque una captura escondida bajo un desplegable es una captura que nadie
 * mira. Lo que se gana es que el tramo no se parta y que el orden se conserve.
 */
const ES_PULSO = new Set(["razonamiento", "herramientas", "fase", "artefacto"]);

/**
 * Cómo se llama cada clase de lo que el HARNESS dice sobre el turno, y cómo se cuenta.
 *
 * Los actos de sistema eran un cajón con cuatro orígenes —la respuesta a un comando, el
 * enunciado de una pregunta, los avisos de honestidad y las escrituras autorizadas sin
 * preguntar—, y al final de un turno salían cuatro renglones grises seguidos. Dos de ellos
 * se contradecían entre sí y tres eran el mismo «quiere escribir un fichero del proyecto».
 *
 * **Se pliega lo que el harness dice SOBRE el turno; lo que te CONTESTA, no.** Un «hecho:
 * cada escritura vuelve a pedir aprobación» es el acuse de un botón que acabas de pulsar, y
 * plegarlo sería no contestarte — por eso no tiene clase y sigue suelto.
 *
 * **El resumen dice QUÉ hay dentro, no solo cuántos.** Que existan avisos no puede quedar
 * escondido: es lo único que la bitácora de honestidad existe para hacer visible. Lo que se
 * pliega es el párrafo, nunca el hecho de que lo hay.
 */
const CLASES_DE_SISTEMA = {
  aviso: { titulo: "Verificaciones", uno: "aviso", varios: "avisos", markdown: false },
  permiso: { titulo: "Permisos", uno: "escritura", varios: "escrituras", markdown: false },
  /**
   * El resumen con el que se compactó la conversación al pasar el umbral de contexto. Es lo
   * que el harness hizo CON el turno, así que se pliega como los otros dos; y es el ÚNICO que
   * se pinta como markdown, porque es un texto del modelo con títulos y listas. La bandera va
   * en la TABLA y no en el render: un aviso que nombre `Menu.xne` o `MAP_COLOR5` no puede
   * pasar por markdown, que se comería los guiones bajos.
   */
  resumen: { titulo: "Resumen del contexto", uno: "resumen", varios: "resúmenes", markdown: true },
} as const;

type ClaseDeSistema = keyof typeof CLASES_DE_SISTEMA;

/** Un tramo de lo que dice el harness: actos SEGUIDOS de la misma clase. Dos clases
 *  distintas no se funden — «qué se autorizó» y «qué falló» son dos preguntas. */
type TramoDeSistema = { desde: number; clase: ClaseDeSistema; actos: Extract<Acto, { tipo: "sistema" }>[] };

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
  /**
   * Lo que costó el turno que lo cerró. Ausente = no consta: una sesión escrita antes de que
   * esto existiera, o un ejecutor de pega que no mide. Entonces no se pinta el coste — un
   * `↑0 ↓0` afirmaría una medida que nadie hizo.
   */
  consumo?: ConsumoDeTurno;
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
   * Esta sesión aplica las escrituras SIN pedir aprobación (el modo es `autonomo`). Se
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
   * En QUÉ paso está ahora mismo: la última línea de trabajo que llegó.
   *
   * Las líneas se emiten cuando una tool va a EMPEZAR (`core/entrelazar.ts`: «solo cuenta lo
   * que va a ocurrir»), así que la última es literalmente lo que se está haciendo. Ausente =
   * todavía no ha hecho nada, y entonces no se afirma ningún paso.
   */
  const pasoActual = (() => {
    for (let i = actos.length - 1; i >= 0; i -= 1) {
      const a = actos[i]!;
      if (a.tipo === "usuario") return undefined;
      if (a.tipo === "herramientas" && a.lineas.length > 0) return a.lineas[a.lineas.length - 1];
    }
    return undefined;
  })();
  /**
   * Y cuánto lleva EN ÉL, que es otra pregunta que el total no contesta.
   *
   * Medido con un turno de más de nueve minutos delante: «Trabajando… · 650 s» no distingue
   * un agente que avanza de uno colgado. Lo que lo distingue es si el paso actual lleva dos
   * segundos o lleva seis minutos, y eso importa sobre todo con un motor EXTERNO, cuyo
   * trabajo son minutos en otro proceso.
   *
   * Se mide desde que la línea APARECIÓ, no desde que la tool arrancó de verdad: es lo único
   * que el cliente sabe, y decirlo de otra forma sería afirmar una medida que nadie tomó.
   */
  const segundosDelPaso = useCronometro(turnoEnVuelo === true && pasoActual !== undefined, pasoActual);

  /**
   * La lista a pintar: los actos de conversación tal cual, y los de pulso agrupados en
   * tramos. Se calcula en una pasada y no con un `filter` por acto porque un tramo necesita
   * saber qué viene DESPUÉS —si hay un `fin`, su turno acabó—, y eso no se ve mirando un
   * acto solo.
   */
  const piezas: Array<
    | { tipo: "acto"; acto: Acto; indice: number }
    | { tipo: "pulso"; tramo: TramoDePulso }
    | { tipo: "harness"; tramo: TramoDeSistema }
    | { tipo: "cierre"; desde: number; ms: number; consumo: ConsumoDeTurno }
  > = [];
  let tramo: TramoDePulso | undefined;
  /** El tramo de harness abierto. Aparte de `tramo` porque son dos agrupadores distintos:
   *  un aviso no cierra el trabajo del agente ni al revés. */
  let deHarness: TramoDeSistema | undefined;
  /**
   * Los tramos del turno EN CURSO, y solo esos.
   *
   * Es lo que impide el fallo que se midió en pantalla: un `fin` cerraba el último tramo de
   * la lista ENTERA, así que un turno que no tuvo trabajo —una pregunta contestada a pelo—
   * le robaba la duración y el coste al turno anterior, que quedaba en pantalla con las
   * cifras de otro. El contador de la conversación seguía cuadrando; la cifra del mensaje,
   * que es la que se mira para saber qué costó lo último, era la de otro turno.
   *
   * Un turno abre con el mensaje del humano —`usuario` solo lo emite el compositor— y cierra
   * con su `fin`. Lo que quedara abierto al llegar un mensaje nuevo se cierra SIN cifras: el
   * turno que no llegó a cerrar no midió nada, e inventarle una duración sería peor que
   * dejarlo sin ella.
   */
  let delTurno: TramoDePulso[] = [];
  for (const [indice, acto] of actos.entries()) {
    /**
     * Una operación de sincronización pasa de largo, y sin tocar el tramo abierto.
     *
     * No se pinta aquí —no es conversación: se cuenta en el registro de la banda de
     * sincronización, en Revisión— y por eso no puede cerrar el tramo de pulso como hace
     * cualquier otro acto de conversación: partiría en dos el trabajo del agente por una
     * operación de git que no tiene nada que ver con él. Va con `continue` y NO con el
     * `return null` del `switch` de abajo, que es lo que haría lo contrario.
     *
     * Que hoy no pueda pillarse un tramo vivo no lo convierte en inofensivo: una línea
     * encolada solo corre entre turnos, pero la garantía barata —no romper nada— cuesta una
     * línea, y la otra dirección sí tiene un fallo que medir.
     */
    if (acto.tipo === "sincronizacion") continue;
    /**
     * Lo que el HARNESS dice sobre el turno se agrupa por CLASE, y la clase viaja con el
     * acto (`core/actos.ts`) en vez de deducirse del texto — la misma regla que la forma de
     * una pregunta. Un `sistema` SIN clase no entra: es la respuesta a un comando, y plegar
     * el acuse de un botón que acabas de pulsar sería no contestar.
     *
     * No cierra el tramo de pulso ni lo abre: es otra cosa, con su propio agrupador. Y dos
     * clases seguidas NO se funden, porque «qué se autorizó» y «qué falló» son dos preguntas.
     */
    // La clase se comprueba contra la TABLA y no solo contra `undefined`: el acto llega por
    // el cable, de otro proceso que puede tener otra versión, y el store solo valida el
    // `tipo`. Una clase que este cliente no conozca dejaba `CLASES_DE_SISTEMA[clase]` en
    // `undefined` y el destructuring del render LANZABA — o sea que se llevaba el transcript
    // entero. Se cae al camino suelto, que es el lado conservador: se ve, sin agrupar.
    if (acto.tipo === "sistema" && acto.clase !== undefined && acto.clase in CLASES_DE_SISTEMA) {
      const clase = acto.clase;
      if (deHarness === undefined || deHarness.clase !== clase) {
        deHarness = { desde: indice, clase, actos: [] };
        piezas.push({ tipo: "harness", tramo: deHarness });
      }
      deHarness.actos.push(acto);
      continue;
    }
    deHarness = undefined;
    if (ES_PULSO.has(acto.tipo)) {
      if (tramo === undefined) {
        /**
         * **Abrir uno nuevo da por TERMINADO al anterior, aunque el turno siga.**
         *
         * `terminado` decide si el resumen dice «Trabajo del agente · N pasos» o
         * «Trabajando… · el paso de ahora», y ese paso y su cronómetro se calculan UNA vez
         * para la lista entera. Sin esto los pintaban todos los tramos sin terminar: medido
         * en pantalla con un turno en vuelo, tres tramos seguidos decían literalmente lo
         * mismo —«Trabajando… · 1397 s · busca function calc · 17 s»— y solo uno era cierto.
         *
         * Un tramo que un mensaje del asistente ya cerró no está trabajando: lo que tiene
         * por delante son sus pasos, no el paso de ahora. Las CIFRAS del turno no se ven
         * afectadas: las reparte el `fin` al ÚLTIMO de `delTurno`, y ese sigue siendo el
         * último.
         */
        const anterior = delTurno[delTurno.length - 1];
        if (anterior !== undefined) anterior.terminado = true;
        tramo = { desde: indice, actos: [], terminado: false };
        piezas.push({ tipo: "pulso", tramo });
        delTurno.push(tramo);
      }
      tramo.actos.push(acto);
      continue;
    }
    if (acto.tipo === "usuario") {
      for (const abierto of delTurno) abierto.terminado = true;
      delTurno = [];
    }
    // Cualquier acto de conversación CIERRA el tramo abierto —lo que venga después es otro
    // tramo—, pero no lo da por terminado: el turno puede seguir (más tools tras la
    // respuesta). Lo que lo termina es el `fin`.
    tramo = undefined;
    if (acto.tipo === "fin") {
      // La duración del turno se la queda el ÚLTIMO tramo suyo: es el que cierra el trabajo,
      // y repartirla entre todos sería inventarse cuánto duró cada trozo. Y el COSTE del turno
      // por el mismo camino y por el mismo motivo: es de quien terminó, no de cada trozo.
      const ultimo = delTurno[delTurno.length - 1];
      for (const suyo of delTurno) suyo.terminado = true;
      delTurno = [];
      if (ultimo !== undefined) {
        ultimo.ms = acto.ms;
        if (acto.consumo !== undefined) ultimo.consumo = acto.consumo;
      } else if (acto.consumo !== undefined && hayCosteQueEnsenar(acto.consumo)) {
        // Un turno sin un solo acto de trabajo no tiene dónde colgar la cifra, y hasta ahora
        // se perdía: la respuesta salía sin decir lo que costó, que es justo la pregunta del
        // nivel «mensaje». Va en su propio cierre —sin plegado, porque no hay nada dentro—,
        // y solo si hay algo que enseñar: un turno sin consumo no añade una línea vacía.
        piezas.push({ tipo: "cierre", desde: indice, ms: acto.ms, consumo: acto.consumo });
      }
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
        <div className={`${vista.column} ${estilos.flujo}`}>
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
              {/*
                Aquí decía «Escribe `/` para ver los comandos», y esa frase ya no es cierta en
                esta piel: en el navegador no hay ninguno, y una ayuda que nombra una tecla
                muerta es peor que no tenerla (ver `Compositor.tsx`). Lo que sí hay que decir
                —con qué modelo va a trabajar esta sesión— se dice, y cuando no consta se calla
                entero: un párrafo que solo existía para sostener la frase de los comandos se
                iría con ella y dejaría un hueco en blanco.
              */}
              {modelo === undefined ? null : (
                <p>
                  Trabajará con <code>{modelo}</code>; se cambia en la pastilla de la caja.
                </p>
              )}
            </section>
          ) : null}
          {sinAprobacion ? (
            // `role="note"` y no `alert`: es un estado de la sesión, no algo que acabe de
            // pasar. Va arriba del todo, por delante incluso del aviso de relectura: cambia
            // lo que va a ocurrir con lo próximo que escribas.
            //
            // Y manda a la PASTILLA, no al comando: en el navegador «/» es prosa y cada
            // acción tiene su botón, así que decirle a alguien que teclee `/aprobacion` es
            // mandarlo a un camino que aquí no existe.
            <p role="note" className={`${vista.flowItem} ${estilos.sinAprobacion}`}>
              Esta sesión va en <strong>modo autónomo</strong>: los cambios se aplican solos
              y cada turno te dirá qué ficheros tocó. Subir a CloudStudio sigue pidiéndote
              permiso. Vuelve a <strong>supervisado</strong> en la pastilla de la caja.
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
            if (pieza.tipo === "cierre") {
              return (
                // Sin `<details>`: un turno sin actos de trabajo no tiene nada que desplegar,
                // y un control que al pulsarlo no enseña nada es el botón muerto de siempre.
                <p key={`cierre-${pieza.desde}`} className={`${vista.flowItem} ${estilos.pensando} ${estilos.cierre}`}>
                  <CierreDelTurno ms={pieza.ms} consumo={pieza.consumo} />
                </p>
              );
            }
            if (pieza.tipo === "harness") {
              const { tramo: t } = pieza;
              const { titulo, uno, varios, markdown } = CLASES_DE_SISTEMA[t.clase];
              const n = t.actos.length;
              return (
                // Plegado siempre: al contrario que el pulso, esto no se sigue en vivo — sale
                // entero al cerrar el turno. Lo que NO se pliega es el resumen, que dice qué
                // hay dentro: el párrafo se esconde, el hecho de que lo hay nunca.
                <details key={`harness-${t.desde}`} className={`${vista.flowItem} ${estilos.pensando}`}>
                  <summary className={estilos.resumen}>
                    {`${titulo} · ${n} ${n === 1 ? uno : varios}`}
                  </summary>
                  <div className={estilos.detalleDePulso}>
                    {t.actos.map((a, i) =>
                      markdown ? (
                        // `md-cuerpo` y los dólares escapados, como la respuesta del asistente:
                        // es el mismo tipo de texto y se tiene que leer igual.
                        <div key={i} role="note" className="md-cuerpo">
                          <MarkdownText text={protegerDolares(a.texto)} codeLabels={ETIQUETAS_DE_CODIGO} />
                        </div>
                      ) : (
                        <p key={i} role="note" className={estilos.sistema}>
                          {a.texto}
                        </p>
                      )
                    )}
                  </div>
                </details>
              );
            }
            if (pieza.tipo === "pulso") {
              const { tramo: t } = pieza;
              // Los pasos NO cuentan los artefactos: un artefacto es lo que un paso produjo,
              // no un paso más. Contarlos inflaba la cabecera —«21 pasos» habría dicho 26 en
              // la sesión que se midió— y esa cifra es lo único que la línea plegada afirma.
              const pasos = t.actos.reduce(
                (n, a) => n + (a.tipo === "artefacto" ? 0 : a.tipo === "herramientas" ? a.lineas.length : 1),
                0
              );
              // Y lo que ese trabajo PRODUJO, que se pinta después del desplegable y en su
              // orden. Se parte en dos porque son dos formas: de una imagen se enseña la
              // imagen, y de lo demás su nombre — de un `.json` no hay nada que previsualizar.
              const producido = t.actos.filter(
                (a): a is Extract<Acto, { tipo: "artefacto" }> => a.tipo === "artefacto"
              );
              const capturas = producido.filter(esImagen);
              const otros = producido.filter((a) => !esImagen(a));
              const desplegable = (
                <TramoDeTrabajo
                  key={`pulso-${t.desde}`}
                  tramo={t}
                  pasos={pasos}
                  {...(segundosEnVuelo === undefined ? {} : { segundosEnVuelo })}
                  {...(pasoActual === undefined ? {} : { pasoActual })}
                  {...(segundosDelPaso === undefined ? {} : { segundosDelPaso })}
                />
              );
              // Y las tarjetas FUERA del desplegable: pertenecen al tramo —por eso no lo
              // parten— pero no se pliegan con él, que sería esconder la captura que el
              // agente acaba de sacar. Sin tarjetas no hay fragmento que envolver.
              return producido.length === 0 ? (
                desplegable
              ) : (
                <Fragment key={`pulso-${t.desde}`}>
                  {desplegable}
                  {/*
                    Las tarjetas van en UN grupo y no sueltas en la columna, y eso es de
                    espaciado: `ChatView.module.css` separa a los hijos de `.column` con 16 px
                    —el hueco entre dos mensajes—, y trece tarjetas seguidas con ese hueco se
                    leen como trece bloques sueltos en vez de como la lista que son. Medido
                    después de quitarles la ruta y la nota: 47 px de tarjeta y 63 de salto.
                    Se agrupan aquí en vez de pelear la especificidad de esa hoja, que es de
                    la librería y no se toca.
                  */}
                  <div className={`${vista.flowItem} ${estilos.artefactosDelTramo}`}>
                    {capturas.length === 0 ? null : (
                      <CapturasDelTramo actos={capturas} alAbrir={alAbrirArtefacto} />
                    )}
                    {otros.map((a, i) => (
                      <TarjetaDeArtefacto
                        key={`${t.desde}-${i}`}
                        acto={a}
                        sesion={sesion}
                        alAbrir={alAbrirArtefacto}
                      />
                    ))}
                  </div>
                </Fragment>
              );
            }
            const { acto, indice } = pieza;
            if (acto.tipo === "usuario") {
              return (
                // `inicioDeTurno` es lo único que da JERARQUÍA al hueco: un turno empieza
                // cuando habla la persona (`usuario` solo lo emite el compositor), así que
                // este es el único sitio donde el hueco significa «aquí empieza otra cosa».
                <p
                  key={indice}
                  className={`${vista.flowItem} ${estilos.globo} ${estilos.usuario} ${estilos.inicioDeTurno}`}
                >
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
            if (acto.tipo === "sistema") {
              // Los actos de SISTEMA se pintaban solo en Trazas, y eso estaba mal medido:
              // por aquí pasan las dos cosas que más falta hacen a la vista. Una es la
              // respuesta a un comando que el usuario acaba de teclear —`/aprobacion` decía
              // su respuesta a una pestaña de depuración—; la otra son los avisos de
              // honestidad (`core/bitacora.ts`), y un aviso que solo vive en la pestaña de
              // depurar el harness es exactamente el aviso que nadie lee, que es lo que esa
              // bitácora existe para evitar.
              //
              // Por aquí pasa ahora solo lo que NO tiene clase: la respuesta a un comando y
              // el enunciado de una pregunta. Eso sigue suelto y a la vista a propósito —es
              // el acuse de algo que la persona acaba de pulsar, y plegarlo sería no
              // contestarle—. Lo que el harness dice SOBRE el turno (`aviso`, `permiso`) se
              // agrupa arriba, en su propio plegable.
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
