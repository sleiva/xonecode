import { useEffect } from "react";
import { etiquetaDeEstado, seLlegaAlDispositivo } from "../inventarioDeDispositivos.js";
import { selloDeFecha } from "../selloDeFecha.js";
import type { EstadoDelCliente } from "../store.js";
import { formatearMs } from "../tiempo.js";
import type { Dispositivo, DispositivoElegido, FaseDelLanzamiento } from "../tipos.js";
import estilos from "./Ejecutar.module.css";

/**
 * Ejecutar: ¿se puede lanzar la app de este proyecto, en qué aparato, y cómo va?
 *
 * **Es la pestaña que cierra el viaje entero del harness en un aparato**: el agente escribe,
 * el verificador mira, y hasta ahora lo único que faltaba era VER la app funcionando — eso
 * era el terminal, la skill y `adb` a mano. Aquí está el mismo recorrido, contado en vivo.
 *
 * **Y lo que la pestaña NO hace es decidir.** El veredicto lo compone el servidor
 * (`core/puedeLanzarse.ts#motivoDeBloqueo`) y por el cable llega en FRASES ya escritas; aquí
 * no hay ni una causa compuesta, ni un `if` que traduzca un código a un motivo. Escribir el
 * mismo diagnóstico en dos sitios es cómo el de la pantalla se queda viejo sin que nadie lo
 * note, y el que se lee es justo el que decide si alguien desenchufa el teléfono o arregla un
 * fichero. Lo único que esta pestaña compone son las palabras de la INTERFAZ (la fase, el
 * tiempo, el estado) y los tres estados vacíos, que dicen cómo se empieza.
 *
 * **Sin `alLanzar` no hay botón**, que es la regla de `VerificarDispositivo.tsx`: un botón que
 * no puede cumplir es el botón muerto de siempre. Y las tres condiciones del apagado están
 * escritas a la vista —cable, veredicto y recorrido— en vez de repartidas por el JSX: con un
 * `&&` de más o de menos, el síntoma es un botón que promete un lanzamiento que no va a haber.
 *
 * **Montarse ES lo que hace medir**, como en la banda de `CloudStudio`: la medida vive en el
 * servidor —habla con `adb`, tarda segundos— así que no se hereda de ninguna foto, se PIDE. Y
 * se vuelve a pedir cuando `conectado` pasa a `true`, porque `marcarDesconectado` tira el
 * veredicto (`store.ts`) y sin esa segunda petición la pestaña se quedaría en «midiendo» para
 * siempre tras una reconexión. También cuando cambia el dispositivo elegido: el aparato es una
 * de las entradas del veredicto, y sin eso el panel se contradice —lo medido en el emulador—.
 */
export function Ejecutar({
  veredicto,
  lanzamiento,
  dispositivos,
  alActualizarDispositivos,
  elegido,
  conectado,
  alRevisar,
  alLanzar,
  alCancelar,
  alElegirDispositivo,
}: {
  /**
   * El veredicto de la medida. Ausente = todavía no ha llegado ninguna.
   *
   * **El tipo sale del STORE y no del cable**, que es la regla de `Receta.tsx:199` con
   * `instalacion`: `Extract<MensajeAlCliente, …>` traería el discriminante del sobre
   * (`clase: "lanzable"`) y `estado.lanzable` no lo lleva — `clase` es del cable, no un dato—,
   * así que la Tarea 10 no podría pasarlo sin un adaptador. El `NonNullable` es por el `?`
   * del campo del estado: el `?` de aquí ya cubre el ausente.
   */
  veredicto?: NonNullable<EstadoDelCliente["lanzable"]>;
  /** El recorrido del lanzamiento: en curso, o cómo acabó el último. Ausente = no hubo ninguno. Del store, por lo mismo. */
  lanzamiento?: NonNullable<EstadoDelCliente["lanzamiento"]>;
  /**
   * El inventario medido de la máquina, TAL CUAL lo manda el servidor — los apagados
   * incluidos: esta pestaña enseña solo los que están a mano, y distinguir «no hay ninguno
   * enchufado» de «hay tres y ninguno arrancado» necesita la lista entera. Ausente = todavía
   * no se ha mirado qué hay enchufado, que no es lo mismo que no haber nada.
   */
  dispositivos?: readonly Dispositivo[];
  /** «Vuelve a medir.» Se llama al entrar: la foto que hay puede ser de hace rato. Ausente =
   *  esta ejecución no puede, y entonces se trabaja con la que haya. */
  alActualizarDispositivos?: () => void;
  /** El dispositivo de la sesión, que es el que el servidor va a usar si nadie elige otro. */
  elegido?: DispositivoElegido;
  /** ¿Hay cable? Sin él no se pide ni se lanza: la petición se perdería sin decirlo. */
  conectado?: boolean;
  /** Vuelve a medir. Ausente = esta ventana no puede medir, y entonces no promete medidas. */
  alRevisar?: () => void;
  /** El único verbo que puede apagar el botón: ausente = no hay botón. */
  alLanzar?: () => void;
  /** Parar el lanzamiento en curso. Ausente = se deja correr, y no se finge poder pararlo. */
  alCancelar?: () => void;
  /** El id del dispositivo elegido. Ausente = la lista se enseña, pero no se elige. */
  alElegirDispositivo?: (id: string) => void;
}) {
  // Depende de `conectado`, de `alRevisar` y de CUÁL es el dispositivo elegido. Las tres son
  // entradas del veredicto: el aparato elegido es una de las cosas que `puedeLanzarse` mira, así
  // que cambiar de aparato invalida la medida igual que volver el cable. Sin esa tercera
  // dependencia la pestaña se contradecía a sí misma en pantalla —lo medido en el emulador el
  // 16-sep-2026—: se pulsaba un aparato en la lista de abajo, su fila pasaba a decir «el de esta
  // sesión», y el veredicto de arriba seguía afirmando «Esta sesión no tiene ningún dispositivo
  // elegido» hasta que algo forzara otra medida. Y no vale con dispararlo desde el manejador del
  // clic: la elección también se cambia desde la pastilla del compositor, que es otro camino.
  // `App` envuelve el manejador en `useCallback`: sin eso el efecto se dispararía en cada render
  // —una petición por tecla, y cada una es un `adb`— y con un `alRevisar` nuevo cada vez, el `if`
  // de abajo no lo pararía. Y se depende del `id` y no del objeto: `elegido` es un objeto nuevo
  // por render y eso pediría una medida por render.
  useEffect(() => {
    if (conectado === false || alRevisar === undefined) return;
    alRevisar();
  }, [conectado, alRevisar, elegido?.id]);

  /**
   * **Y la foto de los dispositivos se rehace al entrar aquí**, por lo mismo que en Ajustes:
   * la que hay es de cuando se conectó el cliente, y esta pestaña decide con ella qué está «a
   * mano». Medido en la pantalla del usuario: mató el emulador y siguió saliendo como
   * arrancado, así que esta lista habría ofrecido lanzar la app en un aparato que no está.
   *
   * Una sola vez al montar —`conectado` es la única dependencia— y no un sondeo: cada medida
   * lanza `adb` y `xcrun` en la máquina de quien mira.
   */
  useEffect(() => {
    if (conectado === false) return;
    alActualizarDispositivos?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conectado]);

  const enCurso = lanzamiento?.estado === "corriendo";
  const puedeLanzar = conectado === true && veredicto?.listo === true && alLanzar !== undefined && !enCurso;

  /**
   * Los que están A MANO ahora mismo: lo conectado y lo arrancado, que es la misma cuenta que
   * hace `inventarioDeDispositivos.ts` para poner los de arriba (y `VerificarDispositivo`
   * para decir si un aparato es alcanzable).
   *
   * **Solo esos, y no el inventario entero**: un iPhone apagado o uno de los 35 simuladores de
   * iOS que no están corriendo no son candidatos a lanzar nada, y listarlos aquí sería repetir
   * Ajustes con una lista donde nueve de cada diez filas no se pueden pulsar. Lo que falta se
   * CUENTA y se manda a Ajustes, que es donde se arregla.
   */
  const aMano = (dispositivos ?? []).filter(seLlegaAlDispositivo);
  const sinMirar = dispositivos === undefined;

  // El nombre del destino: el del veredicto manda —es el que el servidor acaba de resolver
  // contra la medida— y el de la sesión es el respaldo, porque sin veredicto todavía no hay
  // nada resuelto. Con los dos ausentes el botón sigue diciendo dónde, sin nombre propio.
  const destino = veredicto?.dispositivo?.nombre ?? elegido?.nombre;
  const medido = veredicto === undefined ? undefined : selloDeFecha(veredicto.medido);

  return (
    <div className={estilos.panel}>
      {conectado === false ? (
        // Se dice POR QUÉ no hay botón, y no se pinta uno apagado: la medida y el lanzamiento
        // viven en el servidor, así que sin cable no hay nada que ofrecer — y un botón gris
        // sin explicación se lee como un fallo de la ventana.
        <p className={estilos.aviso}>
          Sin conexión con el servidor no se puede medir ni lanzar: las dos cosas las hace él, no esta ventana. En
          cuanto vuelva el cable, la medida se rehace sola.
        </p>
      ) : veredicto !== undefined ? (
        <div className={estilos.veredicto}>
          <p className={estilos.cabecera}>
            <span className={estilos.app}>{veredicto.app ?? veredicto.proyecto}</span>
            {/* El proyecto solo se nombra si la app NO se llama ya como él: en un proyecto
                sin `app.ini` las dos palabras son la misma y «AppDemo en AppDemo» es la
                duplicación de siempre.

                **Y hay que COMPARARLAS, no basta con que la app exista.** La primera versión
                de esta línea solo miraba `app === undefined` mientras el comentario prometía
                lo otro, así que en cuanto los dos nombres coincidían —el esqueleto de
                xonecode, donde la carpeta y el `app.ini` se llaman igual— la cabecera decía
                «EjecutarDemo en EjecutarDemo». No lo cazó ningún test porque los dos únicos
                casos que había usaban un `app` distinto del proyecto: un fixture que no se
                parecía al dato. */}
            {veredicto.app === undefined || veredicto.app === veredicto.proyecto ? null : (
              <span className={estilos.proyecto}>en {veredicto.proyecto}</span>
            )}
            {/* La fecha de la medida: un veredicto sin fecha es una promesa sin fecha, y esta
                sale de la FOTO del equipo —que puede tener minutos—, no de este instante. */}
            {medido === undefined ? null : <span className={estilos.sello}>medido el {medido}</span>}
          </p>
          {veredicto.listo ? (
            <p className={estilos.listo}>Está todo lo que hace falta: se puede lanzar.</p>
          ) : (
            // TODAS las faltas, cada una en su renglón y en el orden en que vienen: es el
            // orden de la lectura —lo que hay que arreglar antes va primero— y el texto es
            // del servidor. Una sola frase que las resumiera perdería justo el dato que se
            // arregla (el nombre del aparato, el fichero que falta).
            <ul className={estilos.faltas}>
              {veredicto.faltas.map((falta, i) => (
                // La clave lleva el índice porque DOS causas distintas pueden dar la MISMA
                // frase —dos conexiones que declaran el mismo `connstring` que falta—, y una
                // clave repetida es un aviso de React y una fila que se pinta mal.
                <li key={`${i}:${falta}`} className={estilos.falta}>
                  {falta}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : alRevisar === undefined ? (
        // Nadie ha cableado la petición, y la única razón por la que esta ventana no puede
        // pedir la medida es que no haya proyecto al que pedírsela: sin él el servidor no
        // contesta ni el veredicto (`arranque.ts#atenderRevisarLanzamiento`). Se dice cómo se
        // empieza en vez de dejar un «midiendo» que no va a acabar nunca.
        <p className={estilos.aviso}>
          No hay ningún proyecto abierto que lanzar. Se abre desde el escritorio, y a partir de ahí esta pestaña mide
          si su app se puede ejecutar en un dispositivo.
        </p>
      ) : (
        <p className={estilos.aviso}>Midiendo si se puede lanzar la app de este proyecto…</p>
      )}

      {/* El verbo ARRIBA y el recorrido debajo: el botón es lo que se pulsa —también después
          de un fallo, que es cuando más se pulsa— y lo que pasó se lee justo debajo. Mientras
          corre no hay botón, así que lo que queda es el recorrido solo. */}
      {puedeLanzar ? (
        <div className={estilos.acciones}>
          <button
            type="button"
            className={estilos.ejecutar}
            // Dice EN QUÉ aparato va a lanzar, y no «Ejecutar» a secas: el sujeto de la
            // promesa es lo que la hace comprobable — con dos dispositivos a mano, el mismo
            // botón lanzaría en uno distinto según lo que estuviera elegido en otra pestaña.
            title={
              destino === undefined
                ? "Lanza la app del proyecto en el dispositivo de esta sesión"
                : `Lanza la app del proyecto en ${destino}`
            }
            onClick={alLanzar}
          >
            {destino === undefined ? "Ejecutar en el dispositivo de la sesión" : `Ejecutar en ${destino}`}
          </button>
        </div>
      ) : null}

      {lanzamiento === undefined ? null : (
        <Recorrido
          lanzamiento={lanzamiento}
          {...(destino === undefined ? {} : { destino })}
          {...(alCancelar === undefined ? {} : { alCancelar })}
        />
      )}

      {/* La sección se ROTULA y no lleva encabezado de documento: es el mismo molde que la
          lista de Tareas del proyecto y el registro de `/sync` —una sección de una pestaña,
          con su nombre accesible y su rótulo a la vista—, y así el título de la ventana sigue
          siendo el del proyecto que hay abierto. */}
      <section className={estilos.dispositivos} aria-label="Dispositivos a mano">
        <span className={estilos.rotulo}>Dispositivos a mano</span>
        {sinMirar ? (
          // Ausente ≠ vacío: nadie ha mirado, así que no se puede afirmar que no haya nada.
          <p className={estilos.aviso}>
            Todavía no se ha mirado qué hay enchufado. Mira en Ajustes → Dispositivos, que es donde se mide la máquina y
            se ve qué le falta a cada herramienta.
          </p>
        ) : aMano.length === 0 ? (
          // Con informe y ninguno a mano: se manda a donde se arregla, en vez de dejar un
          // hueco que parece un fallo de la pestaña.
          <p className={estilos.aviso}>
            Ninguno de los dispositivos medidos está a mano ahora mismo. En Ajustes → Dispositivos se ve qué le falta a
            cada uno.
          </p>
        ) : (
          <ul className={estilos.lista}>
            {aMano.map((d) => {
              const esElegido = d.id === (elegido?.id ?? veredicto?.dispositivo?.id);
              // Sin cable la elección se perdería, así que no se ofrece: la fila se enseña
              // —es la foto de lo que hay— pero no se finge que se puede pulsar.
              const elegible = alElegirDispositivo !== undefined && conectado !== false;
              const etiqueta = `${d.nombre} · ${d.plataforma === "ios" ? "iOS" : "Android"} · ${etiquetaDeEstado(d)}`;
              return (
                <li key={d.id} className={estilos.fila}>
                  {elegible ? (
                    <button
                      type="button"
                      className={estilos.dispositivo}
                      aria-current={esElegido ? "true" : undefined}
                      // La intención, no el comando: el servidor resuelve la foto contra su
                      // última medida — el navegador no es fuente sobre la máquina.
                      onClick={() => alElegirDispositivo(d.id)}
                    >
                      {etiqueta}
                    </button>
                  ) : (
                    <span className={estilos.dispositivo}>{etiqueta}</span>
                  )}
                  {/* Cuál está elegido, dicho con palabras además del color: es el dato que
                      explica dónde va a caer el botón de arriba, y un color no lo lee un
                      lector de pantalla. */}
                  {esElegido ? <span className={estilos.marca}>el de esta sesión</span> : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

/**
 * El recorrido de un lanzamiento, del primer mensaje al último.
 *
 * **`lineas` va TAL CUAL**: el servidor ya manda la cola (`LINEAS_DE_LOG`), y recortarla otra
 * vez aquí sería una segunda regla sobre el mismo dato — el día que una de las dos cambie, lo
 * que se enseña deja de ser lo que pasó. Y la FASE y el TIEMPO son del cable: `ms` se mide
 * desde que se dijo `corriendo`, que es exactamente lo que esta tarjeta está contando.
 */
function Recorrido({
  lanzamiento,
  destino,
  alCancelar,
}: {
  lanzamiento: NonNullable<EstadoDelCliente["lanzamiento"]>;
  destino?: string;
  alCancelar?: () => void;
}) {
  const enCurso = lanzamiento.estado === "corriendo";
  // La LECTURA de la comprobación: es la última línea que dijo el servidor, y solo cuando
  // acabó bien. Ahí está lo que se midió de verdad —«el framework contestó su árbol de
  // controles»—, que es lo que distingue «arrancó» de «acepté el lanzamiento».
  const lectura = lanzamiento.estado === "ok" ? lanzamiento.lineas[lanzamiento.lineas.length - 1] : undefined;
  // El aparato de ESTE recorrido manda sobre el del veredicto: el veredicto dice dónde SE
  // PODÍA lanzar cuando se midió, y esto cuenta dónde se lanzó. El del veredicto queda como
  // respaldo para el mensaje que llegara sin dispositivo.
  const en = lanzamiento.dispositivo?.nombre ?? destino;
  /**
   * ¿Se enseña la cola del recorrido?
   *
   * **Mientras corre sí, y cuando hay algo que explicar también** —un fallo, un cuelgue, una
   * cancelación: ahí las líneas son la única pista de dónde se quedó—. **Al acabar BIEN no**,
   * y no es una excepción por gusto: la última línea de ese log ES la lectura que se enseña
   * justo encima, así que pintarla otra vez sería el mismo dato dos veces en la misma tarjeta.
   */
  const hayLineas = lanzamiento.estado !== "ok" && lanzamiento.lineas.length > 0;
  return (
    <section className={estilos.recorrido} data-estado={lanzamiento.estado}>
      <p className={estilos.cabeceraDelRecorrido}>
        <span className={estilos.fase}>{ETIQUETA_DE_FASE[lanzamiento.fase]}</span>
        <span className={estilos.tiempo}>{formatearMs(lanzamiento.ms)}</span>
        {enCurso && alCancelar !== undefined ? (
          // Cancelar SOLO mientras corre y SOLO si hay a quién pedírselo: sobre un recorrido
          // cerrado no hay nada que parar, y sin manejador el botón no llevaría a ninguna
          // parte. Estilo secundario, el mismo de «Volver a mirar»: parar esto es una acción
          // corriente de la pestaña, no la parada de emergencia del compositor.
          <button type="button" className={estilos.cancelar} onClick={alCancelar}>
            Cancelar
          </button>
        ) : null}
      </p>
      <p className={estilos.desenlace}>{desenlaceDe(lanzamiento, en)}</p>
      {lectura === undefined ? null : <p className={estilos.lectura}>{lectura}</p>}
      {hayLineas ? (
        // `pre-wrap` y no `pre`: son líneas de consola —su sangría es parte del dato— pero
        // una ruta larga tiene que poder partirse en vez de sacar scroll horizontal aquí
        // dentro.
        <pre className={estilos.lineas}>{lanzamiento.lineas.join("\n")}</pre>
      ) : null}
    </section>
  );
}

/**
 * Qué decir de cada final. Es un `switch` exhaustivo y sin `default` a propósito: un estado
 * nuevo en el cable (`ESTADOS_DEL_LANZAMIENTO`) es un error de compilación hasta que alguien
 * escriba qué decir, en vez de una tarjeta muda que nadie nota.
 *
 * **Los motivos son del SERVIDOR, tal cual**: los de `fallo` y `colgada` son suyos —la frase
 * literal del framework cuando la app no arrancó— y traducirlos perdería justo el dato que
 * hace falta para diagnosticar. Lo que el cliente pone son las palabras de los estados que no
 * traen motivo: `ok` y `cancelada` no tienen nada que contar, así que aquí se dice qué pasó.
 */
function desenlaceDe(
  lanzamiento: NonNullable<EstadoDelCliente["lanzamiento"]>,
  destino: string | undefined
): string {
  const en = destino === undefined ? "" : ` en ${destino}`;
  switch (lanzamiento.estado) {
    case "corriendo":
      return `Lanzando la app${en}…`;
    case "ok":
      return `La app arrancó y está viva${en}.`;
    case "fallo":
      return lanzamiento.motivo ?? "El lanzamiento falló, y el servidor no dijo por qué.";
    case "colgada":
      return lanzamiento.motivo ?? "El lanzamiento se quedó sin contestar.";
    case "cancelada":
      return "Se canceló el lanzamiento.";
  }
}

/**
 * Cómo se llama cada fase del recorrido.
 *
 * Las palabras son de la INTERFAZ y no del diagnóstico: el cable manda un identificador
 * cerrado (`FASES_DEL_LANZAMIENTO`) y su recorrido en frases ya viene en `lineas`. El
 * `Record` sobre la unión es lo que hace que una fase nueva no se quede sin nombre — se
 * pinta aquí y en ningún otro sitio.
 */
const ETIQUETA_DE_FASE: Record<FaseDelLanzamiento, string> = {
  comprobando: "comprobando el dispositivo",
  empaquetando: "empaquetando la app",
  subiendo: "subiendo al dispositivo",
  reiniciando: "reiniciando el framework",
  lanzando: "lanzando la app",
  "comprobando-arranque": "comprobando que arrancó",
};
