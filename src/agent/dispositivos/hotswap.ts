/**
 * El canal de comandos del servidor hotswap: un WebSocket en `/hotswap`.
 *
 * Es la mitad que LANZA y MIDE sobre el dispositivo: abrir el canal, pedir que la app arranque
 * y luego PREGUNTAR si está viva. Subir ficheros, la base de datos y las capturas van por el
 * HTTP del mismo servidor y por otro camino.
 *
 * **Medido el 16-sep-2026 contra `com.xone.android.framework` 5.0.2.2dev** (flavor standalone,
 * emulador Android 15, `adb forward tcp:8443`) — el detalle entero, en la skill `xone-hotswap`:
 *
 * - **La ruta es `/hotswap`**, y no una parecida: `/`, `/ws`, `/websocket`, `/command` y `/api`
 *   contestan `400`.
 * - **El servidor habla primero.** Al abrir manda `{"command":"server_hello","protocol_version":2}`.
 *   Mandar un comando antes de recibirlo es inventarse un protocolo que no es el que hay, y por
 *   eso esto ESPERA el saludo con tope en vez de saludar él.
 * - **Y tras un reinicio hay que REINTENTAR la conexión, no solo esperar el saludo.** Medido en
 *   el emulador: el `am start` que reinicia el framework devuelve **antes** de que el servidor
 *   escuche, y como el `adb forward` ya tiene el LISTEN en el lado del host, la conexión TCP se
 *   ACEPTA y se resetea — el cliente ve `Client network socket disconnected before secure TLS
 *   connection was established` en cuanto intenta el handshake. `TOPE_DE_SALUDO_MS` no cubre eso:
 *   mide un socket ABIERTO que se queda callado, y aquí el socket no llega a abrirse. De ahí
 *   `abrirConReintento` y su `TOPE_DE_APERTURA_MS`: el mismo minuto que la espera de la app,
 *   porque es la misma pregunta —cuánto tarda el aparato en llegar— sobre otro momento.
 * - **El nombre de un comando es EXACTO.** `launchapplication` en minúscula contesta
 *   `Unknown command: launchapplication`. No hay alias insensible a mayúsculas: la grafía es
 *   parte del contrato, y hay un test que la fija byte a byte sobre lo que sale por el socket.
 * - **El `{"result":true}` de `launchApplication` es un ACUSE, no una medida.** El framework
 *   acusa el lanzamiento y no espera a que la app cargue: medido, a un proyecto al que le
 *   faltaba el fichero que declara su `connstring` le contestó `true` y la app murió detrás en
 *   un diálogo de error. Lo que dice si está VIVA es un comando de LECTURA, y eso es
 *   `lanzarYComprobar`: lanzar, y luego leer hasta que conteste un árbol. Es la misma regla que
 *   ««Terminó bien» y «ya está» son dos cosas», ahora sobre un dispositivo.
 * - `getCurrentScreen` y `status`/`state` **no existen** en esta versión (`Unknown command`),
 *   aunque la tabla de la skill los dé por disponibles. Y `POST /command` da `404`: los
 *   comandos van por aquí.
 *
 * **Y la lectura es `getAllElements`, no `waitForElement`.** `waitForElement` pide el nombre de
 * un control, y de una app cualquiera no sabemos ninguno: inventarse uno es justo lo que la
 * skill prohíbe. `getAllElements` no necesita saber nada de la app —contesta su árbol de
 * controles o contesta que no hay app—, y esa es toda la pregunta que hay que hacer.
 *
 * **`ws` es dependencia DIRECTA, y el porqué.** `engines` dice `node >= 20` y el `WebSocket`
 * global no existe hasta Node 22: confiar en el global deja el CLI roto en una versión de Node
 * que este paquete declara soportar, mientras `npm test` sigue verde en la máquina de quien
 * escribe (v22). `ws` es JS puro —misma forma que `fflate`—, ya estaba en disco como
 * transitiva de ink y jsdom (8.21.3), y da `rejectUnauthorized` en las opciones, que es lo que
 * hace falta para el certificado autofirmado del dispositivo.
 *
 * **El constructor del socket entra por `deps`.** Es un puerto como cualquier otro de este
 * repo: `npm test` no puede abrir un socket —ni contra un puerto que quizá no exista, ni
 * contra el emulador que alguien tenga corriendo en su máquina—, así que el doble se pasa por
 * parámetro y el `ws` de verdad solo se usa cuando nadie lo pasa.
 */
import WebSocket from "ws";

/** La URL por omisión: el puerto de fábrica, con el `adb forward` hecho. */
export const DESTINO_POR_OMISION = "wss://127.0.0.1:8443/hotswap";

/**
 * Cuánto se espera al saludo antes de dar el canal por muerto.
 *
 * No es un plazo para la app: es para el SERVIDOR, que está dentro del proceso host y saluda en
 * cuanto acepta el socket. Quince segundos es de sobra para un túnel de `adb` en loopback, y
 * seguir esperando deja el turno parado sin nada que lo explique.
 */
export const TOPE_DE_SALUDO_MS = 15_000;

/**
 * Y hasta cuándo se sigue INTENTANDO abrir el canal, contando desde el primer intento.
 *
 * **No es lo mismo que `TOPE_DE_SALUDO_MS`, y por eso hay dos.** Aquél mide un socket ABIERTO que
 * no saluda; éste, un socket que no llega a abrirse — que es lo que se mide tras reiniciar el
 * framework (ver la cabecera del módulo). Confundirlos deja el lanzamiento muriendo con la línea
 * de TLS mientras el framework arranca detrás.
 *
 * El mismo minuto que la espera de la app: las dos preguntan lo mismo —cuánto tarda el aparato en
 * llegar— sobre dos momentos distintos, y sesenta segundos son de sobra para una pantalla que
 * arranca. El tope es del BUCLE y no de cada intento, así que uno que se quede esperando el saludo
 * puede añadir su `TOPE_DE_SALUDO_MS` por encima.
 */
export const TOPE_DE_APERTURA_MS = 60_000;

/**
 * Cada cuánto se vuelve a preguntar: por el canal que aún no abre, y por la app que aún no está
 * en pie.
 *
 * Un solo número para las dos esperas porque son la misma idea —volver a preguntar en vez de
 * dormir un rato fijo— y porque miden lo mismo: unos segundos de un aparato arrancando.
 */
export const INTERVALO_DE_SONDEO_MS = 1_000;

/**
 * Y hasta cuándo, después de lanzarla.
 *
 * Se sondea con intervalo en vez de dormir un rato fijo por dos motivos, y son las dos caras
 * del mismo error: un temporizador fijo o MIENTE por corto —diciendo que no arrancó algo que
 * estaba arrancando— o hace perder un minuto entero en cada despliegue que va bien. Lo que
 * decide es la medida, y en cuanto llega se para.
 */
export const TOPE_DE_ARRANQUE_MS = 60_000;

/**
 * Cada cuánto se le VUELVE A PEDIR el lanzamiento mientras la lectura diga que la app no está.
 *
 * Existe por una medida, y es la que hacía fallar la pestaña entera: **el primer
 * `launchApplication` que llega con el framework recién reiniciado se acepta con
 * `{"result":true}` y no arranca nada.** Medido con los MISMOS bytes de ZIP en las dos
 * direcciones: mandándolo una sola vez, doce lecturas seguidas dicen `App is not running` durante
 * los 60 s del tope; volviéndolo a pedir cada 5 s, hay árbol a los dos o tres segundos del
 * segundo o tercer envío. Las cuatro tiradas buenas de esa sesión se pusieron vivas **justo
 * detrás de un reenvío**, y ninguna se puso viva sin él.
 *
 * **Solo se reenvía con la lectura DICIENDO que no está**, y eso no es prudencia: reenviar sobre
 * una app viva la TUMBA —`MainEntry.finishApp()` → `closeApplication` → `Terminating and
 * disposing appData`—, medido como un ciclo de viva/muerta cada 5 s. El bucle de abajo solo llega
 * a esta línea cuando la lectura acaba de decir que no hay app, así que la propiedad se sostiene
 * por construcción y no por un `if` que alguien pueda quitar.
 *
 * Cinco segundos y no uno: es el intervalo con el que se midió, y preguntar más a menudo no
 * adelanta nada —lo que arranca la app es un envío POSTERIOR, no la prisa—.
 */
export const INTERVALO_DE_REENVIO_MS = 5_000;

/**
 * La versión del protocolo con la que esto está medido.
 *
 * Otra NO se rechaza: no se rechaza lo que no se ha medido como incompatible. Se cuenta en el
 * log y se sigue — un `protocol_version` distinto dice que el otro lado puede hablar otro
 * idioma, y quien lo demuestra o lo desmiente es el primer comando.
 */
const PROTOCOL_VERSION = 2;

/** El formato del volcado: `xone` da los controles con su nombre, que es por el que se pulsa. */
const FORMATO = "xone";

/** Las dos frases con las que el framework dice que todavía no hay app delante. */
const FRASE_SIN_APP = "App is not running";
const FRASE_SIN_PANTALLA = "No activity is visible";

/**
 * La respuesta del framework, tal cual llegó. Sin interpretar: `result` es suyo y `status` es
 * donde viene el motivo —y, en `getAllElements`, el árbol entero como JSON—.
 */
export interface RespuestaHotswap {
  /** El `result` del framework. `false` es un NO suyo, no un fallo de transporte. */
  result?: unknown;
  /**
   * El `status`. Es SIEMPRE una cadena, también cuando lleva dentro un JSON: es el
   * `ResultMessage(string)` documentado, el mismo molde que usan `getCurrentScreen` y `getRows`.
   */
  status?: string;
  [clave: string]: unknown;
}

/**
 * El trozo del socket que este módulo usa, y nada más.
 *
 * Es estructural a propósito: así el doble de un test no tiene que parecerse a `ws` en nada que
 * no se use, y una versión mayor de `ws` que mueva lo demás no toca aquí.
 */
export interface SocketHotswap {
  on: (evento: "message" | "error" | "close", cb: (valor: never) => void) => void;
  send: (texto: string) => void;
  close: () => void;
}

/** Cómo se abre el socket. Entra por parámetro: `npm test` no abre ninguno. */
export type AbrirSocketHotswap = (url: string) => SocketHotswap;

export interface DependenciasDeHotswap {
  /** El constructor del socket de verdad. Sin él se usa `ws`. */
  abrirSocket?: AbrirSocketHotswap;
  /**
   * La URL del canal. Gana la posicional de `abrirHotswap`; esto existe porque
   * `lanzarYComprobar` no tiene dónde ponerla —su segundo parámetro son las dependencias— y es
   * quien conoce el puerto, que no siempre es el 8443 de fábrica.
   */
  destino?: string;
  /** Cada línea, tal cual. Es lo que permite decir «el framework contestó esto» sin adivinar. */
  alLinea?: (linea: string) => void;
}

export interface ClienteHotswap {
  /**
   * Manda un comando y espera SU respuesta. Antes espera el saludo: no sale nada por el socket
   * hasta que el servidor ha hablado.
   */
  comando(nombre: string, extra?: Record<string, unknown>): Promise<RespuestaHotswap>;
  /** Cierra el canal. Idempotente: se llama en un `finally`, y también desde el propio fallo. */
  cerrar(): void;
  /**
   * Espera el saludo del servidor. Se resuelve con el `server_hello`, y falla con UNA línea si el
   * canal se cerró antes o si no llegó en `TOPE_DE_SALUDO_MS`.
   *
   * Es un MÉTODO y no un campo a propósito: `comando` ya espera el saludo por dentro, así que
   * quien no necesite esperarlo aparte no toca esta promesa — y una promesa que rechaza sin nadie
   * mirándola tumba el proceso. Quien la pida, que la pida en el acto: es lo que hace
   * `abrirConReintento`, que la pide antes de soltar el hilo.
   */
  esperarSaludo(): Promise<void>;
  /** Cada línea, tal cual llegue. Se registra al abrir y antes de mandar nada. */
  alLinea(escucha: (linea: string) => void): void;
}

/**
 * Abre el canal y devuelve el cliente.
 *
 * No es `async` a propósito: quien la llama quiere el cliente para poder REGISTRAR su log
 * antes de que llegue nada, y el saludo —que sí es asíncrono— se espera dentro de `comando`.
 */
export function abrirHotswap(destino: string, deps: DependenciasDeHotswap = {}): ClienteHotswap {
  const abrirSocket = deps.abrirSocket ?? abrirSocketReal;
  const escuchas: ((linea: string) => void)[] = [];
  /**
   * Las respuestas que se esperan, en orden de llegada.
   *
   * **Se emparejan por ORDEN porque no hay otra correspondencia posible.** El protocolo medido
   * no manda ninguna: sale `{"command":…}` y vuelve `{"result":…,"status":…}`, sin eco del
   * comando y sin número de petición. Es decir que dos comandos en vuelo a la vez se
   * contestarían cruzados — por eso `comando` se espera antes de mandar el siguiente, y por eso
   * este módulo no ofrece un `mandar` que no espera.
   */
  const pendientes: { cumplir: (r: RespuestaHotswap) => void; fallar: (e: Error) => void }[] = [];
  let cerrado = false;
  let responderSaludo: (() => void) | undefined;
  let fallarSaludo: ((e: Error) => void) | undefined;
  const saludo = new Promise<void>((cumplir, fallar) => {
    responderSaludo = cumplir;
    fallarSaludo = fallar;
  });

  const decir = (linea: string): void => {
    deps.alLinea?.(linea);
    for (const escucha of escuchas) escucha(linea);
  };

  const cerrar = (motivo = "el canal se cerró antes de contestar"): void => {
    if (cerrado) return;
    cerrado = true;
    clearTimeout(relojDeSaludo);
    try {
      socket.close();
    } catch {
      // Un socket que nunca llegó a abrir puede quejarse al cerrarse. No hay nada que hacer
      // con eso, y tirarlo aquí se llevaría por delante al que SÍ estaba esperando.
    }
    for (const pendiente of pendientes.splice(0)) pendiente.fallar(new Error(motivo));
    // Resolver el saludo con un error es lo que desbloquea un `comando` que aún esperaba: sin
    // esto, el que llama se queda esperando a un servidor que ya no está.
    fallarSaludo?.(new Error(motivo));
  };

  const socket = abrirSocket(destino);

  // El tope del saludo se arma al ABRIR, no al mandar: mide «no saludó», y el rato que alguien
  // tarde en decidir qué comando mandar no es eso.
  const relojDeSaludo = setTimeout(() => {
    const motivo = `el servidor de ${destino} no saludó en ${Math.round(TOPE_DE_SALUDO_MS / 1000)} s`;
    decir(motivo);
    fallarSaludo?.(new Error(motivo));
    cerrar(motivo);
  }, TOPE_DE_SALUDO_MS);

  socket.on("message", ((dato: unknown) => {
    // Un evento `message` de `ws` ya es un mensaje ENTERO, no un trozo de flujo: el troceado
    // que sí hace falta leyendo un stdio (ver `subagenteCodex.ts`) aquí sobra.
    const linea = String(dato);
    decir(linea);
    let mensaje: RespuestaHotswap;
    try {
      mensaje = JSON.parse(linea) as RespuestaHotswap;
    } catch {
      // Una línea que no es JSON no tumba nada: se queda en el log, que es para lo que está.
      return;
    }
    if (mensaje["command"] === "server_hello") {
      const version = mensaje["protocol_version"];
      if (version !== PROTOCOL_VERSION) {
        // No se rechaza lo que no se ha medido como incompatible: se CUENTA y se sigue.
        decir(`el servidor saluda con protocol_version ${String(version)}, y esto está medido con la ${PROTOCOL_VERSION}`);
      }
      clearTimeout(relojDeSaludo);
      responderSaludo?.();
      return;
    }
    const pendiente = pendientes.shift();
    // Una respuesta que nadie pidió se queda en el log y no se le da a ningún comando: dársela
    // al siguiente en la cola sería contestar una pregunta con la respuesta de otra.
    pendiente?.cumplir(mensaje);
  }) as never);

  socket.on("error", ((error: Error) => {
    // El motivo se DICE por el log y se convierte en el fallo del que esperaba: un socket que
    // revienta no puede dejar a nadie esperando su respuesta.
    const motivo = unaLinea(error);
    decir(motivo);
    cerrar(motivo);
  }) as never);
  socket.on("close", (() => cerrar()) as never);

  return {
    comando(nombre: string, extra: Record<string, unknown> = {}): Promise<RespuestaHotswap> {
      if (cerrado) return Promise.reject(new Error("el canal se cerró antes de mandar el comando"));
      // El saludo, PRIMERO. Además de no inventarse el protocolo, es lo que garantiza que el
      // socket está abierto cuando se escribe: `ws` no deja mandar en un socket que aún no ha
      // abierto, y quien avisa de que está abierto es el propio servidor al saludar.
      return saludo.then(
        () =>
          new Promise<RespuestaHotswap>((cumplir, fallar) => {
            const pendiente = { cumplir, fallar };
            pendientes.push(pendiente);
            try {
              // `command` el primero y `extra` detrás, para que lo que sale por el socket sea
              // exactamente `{"command":"launchApplication","appName":"…"}`.
              socket.send(JSON.stringify({ command: nombre, ...extra }));
            } catch (error) {
              const i = pendientes.indexOf(pendiente);
              if (i >= 0) pendientes.splice(i, 1);
              fallar(new Error(unaLinea(error)));
            }
          })
      );
    },
    cerrar,
    esperarSaludo(): Promise<void> {
      return saludo;
    },
    alLinea(escucha: (linea: string) => void): void {
      escuchas.push(escucha);
    },
  };
}

/**
 * Abre el canal REINTENTANDO mientras el framework arranca, y devuelve el cliente ya saludado.
 *
 * Existe por una medida, no por prudencia: tras el `am start` que reinicia el framework, el
 * servidor todavía no escucha, y el `adb forward` —que ya tiene el LISTEN en el lado del host—
 * acepta la conexión para resetearla en cuanto el cliente intenta el handshake. Eso **no** lo
 * cubre el tope del saludo, que mide un socket abierto que se queda callado, y sin reintento un
 * lanzamiento que iba bien muere con la línea de TLS.
 *
 * **Aquí se reintenta la CONEXIÓN y nada más.** En cuanto hay saludo, el cliente sale de aquí con
 * el canal abierto, y el reintento del LANZAMIENTO es otra cosa y vive en `lanzarYComprobar`, que
 * es quien puede mirar si la app está viva antes de volver a pedirla. Este comentario decía
 * —hasta que se midió— que reintentar un `launchApplication` ya mandado «sería lanzar la app dos
 * veces por un motivo que no se ha medido». El motivo apareció, y era el contrario:
 * `INTERVALO_DE_REENVIO_MS`.
 *
 * **Y se dice UNA vez, la primera.** El motivo del primer intento es el que explica qué pasó
 * —todos los intentos de este caso dan el mismo—, y el mismo renglón repetido cada segundo
 * llenaría la cola del log, que es corta, y taparía las líneas del recorrido.
 *
 * La cuenta es del número de intentos y no del reloj (`lanzarYComprobar` sondea igual), con la
 * hora como segunda condición: así el tope no depende de que el reloj avance, que es lo que
 * convierte un bucle de estos en una suite colgada.
 */
async function abrirConReintento(destino: string, deps: DependenciasDeHotswap): Promise<ClienteHotswap> {
  const desde = Date.now();
  const intentos = Math.ceil(TOPE_DE_APERTURA_MS / INTERVALO_DE_SONDEO_MS) + 1;
  let ultimo = "";
  for (let intento = 1; intento <= intentos; intento++) {
    const cliente = abrirHotswap(destino, deps);
    // El saludo se pide ANTES de soltar el hilo, y no es un detalle: así la promesa queda con su
    // manejador puesto desde el primer instante, y un canal que se cae en el acto no deja un
    // rechazo sin dueño.
    const saludo = cliente.esperarSaludo();
    try {
      await saludo;
      if (intento > 1) deps.alLinea?.(`el canal con ${destino} abrió en el intento ${intento}`);
      return cliente;
    } catch (error) {
      // Un intento que no abrió no puede dejar su socket por ahí: es la misma fuga que la de
      // `lanzarYComprobar`, y contra un emulador se acumula sin dar ningún síntoma.
      cliente.cerrar();
      ultimo = unaLinea(error);
      if (intento === 1) deps.alLinea?.(`se reintenta el canal con ${destino}: ${ultimo}`);
      if (intento === intentos || Date.now() - desde >= TOPE_DE_APERTURA_MS) break;
      await dormir(INTERVALO_DE_SONDEO_MS);
    }
  }
  // El ÚLTIMO motivo y no el primero: es el que dice cómo estaba el aparato al darse por vencido.
  throw new Error(
    `no se pudo abrir el canal con ${destino} en ${Math.round(TOPE_DE_APERTURA_MS / 1000)} s: ${ultimo}`
  );
}

/**
 * Lanza la app y COMPRUEBA que está viva.
 *
 * Las dos partes están separadas a propósito porque son dos hechos distintos: el acuse de
 * `launchApplication` dice que el framework aceptó el encargo, y el árbol de `getAllElements`
 * dice que hay una app delante. Medido: lo primero es `true` aunque lo segundo no llegue nunca.
 *
 * **La conexión se reintenta** (`abrirConReintento`) porque un socket que no abre no es un
 * veredicto sobre la app: recién reiniciado el framework, el canal tarda unos segundos en
 * existir.
 *
 * **Y el lanzamiento se VUELVE A PEDIR** mientras la lectura diga que no está
 * (`INTERVALO_DE_REENVIO_MS`): el primer envío tras un reinicio en frío se acepta y no arranca
 * nada, así que mandarlo una sola vez y esperar sesenta segundos es esperar a un encargo que el
 * framework ya tiró. La regla que lo hace seguro es que solo se reenvía detrás de una lectura que
 * dice «no está»: sobre una app viva, un segundo `launchApplication` la tumba.
 *
 * **Nunca lanza**: todo —el saludo que no llega, el socket que revienta, un `Unknown command`—
 * vuelve como `{viva, motivo}` de una línea. Quien la llama está atendiendo algo que puede
 * contar en una pantalla, y un fallo del dispositivo no es una excepción del programa.
 *
 * Y `cerrar()` va en un `finally`, también en el camino de fallo: un socket vivo contra un
 * emulador que se queda abierto en cada intento es una fuga que no da ningún síntoma hasta que
 * se acumula.
 */
export async function lanzarYComprobar(app: string, deps: DependenciasDeHotswap = {}): Promise<ArranqueDeApp> {
  // Abrir va DENTRO del `try` porque abrir también puede fallar: `ws` lanza si la URL está mal
  // escrita, y una URL mal escrita no puede salir de aquí como una excepción.
  let cliente: ClienteHotswap | undefined;
  try {
    cliente = await abrirConReintento(deps.destino ?? DESTINO_POR_OMISION, deps);
    const acuse = await cliente.comando("launchApplication", { appName: app });
    if (acuse.result !== true) {
      // La frase es el `status` LITERAL: es lo único que dice QUÉ pasó, y traducirlo a una
      // frase nuestra perdería justo el dato que hace falta para diagnosticar.
      return { viva: false, motivo: decirDe(acuse), respuesta: acuse };
    }

    // Se sondea hasta que la respuesta sea un árbol, con el tope como única salida. El sondeo
    // es a los 0 s, 1 s, … y el ÚLTIMO a los 60 s: de ahí el `+ 1` — con la cuenta corta, el
    // tope se agotaría un segundo antes de haber preguntado al final.
    //
    // Y dentro del bucle se VUELVE A PEDIR el lanzamiento cada `INTERVALO_DE_REENVIO_MS`: el
    // primer envío de un framework recién reiniciado se acepta y no arranca nada. Se llega a esas
    // dos líneas solo cuando la lectura acaba de decir que la app NO está, que es la única
    // situación en la que volver a pedirla no la tumba.
    const veces = TOPE_DE_ARRANQUE_MS / INTERVALO_DE_SONDEO_MS + 1;
    let ultima: RespuestaHotswap = acuse;
    let envio = Date.now();
    for (let intento = 0; intento < veces; intento++) {
      if (intento > 0) await dormir(INTERVALO_DE_SONDEO_MS);
      ultima = await cliente.comando("getAllElements", { format: FORMATO });
      if (estaViva(ultima)) return { viva: true, respuesta: ultima };

      if (Date.now() - envio >= INTERVALO_DE_REENVIO_MS) {
        envio = Date.now();
        deps.alLinea?.("el framework aceptó el lanzamiento y la app no arrancó: se le vuelve a pedir");
        const otro = await cliente.comando("launchApplication", { appName: app });
        // La misma regla que el primero, y por el mismo motivo: un `result` que no es `true` es
        // el framework diciendo que no, y eso no se arregla insistiendo.
        if (otro.result !== true) return { viva: false, motivo: decirDe(otro), respuesta: otro };
        // `ultima` NO se toca: es la última respuesta que dice cómo está la APP, y el acuse de un
        // lanzamiento no dice nada de eso. Pisarlo dejaría el motivo del tope agotado en `""` —el
        // `status` de un acuse— en vez de en la frase del framework, que es lo único que explica
        // qué pasó.
      }
    }
    // Se agotó el tope, y el motivo es la última respuesta tal cual: «no arrancó en 60 s» a
    // secas tiraría lo único que el framework dijo sobre por qué.
    return { viva: false, motivo: decirDe(ultima), respuesta: ultima };
  } catch (error) {
    return { viva: false, motivo: unaLinea(error) };
  } finally {
    cliente?.cerrar();
  }
}

export interface ArranqueDeApp {
  viva: boolean;
  /**
   * UNA línea: la respuesta literal del framework, sin traducir. **Ausente si está viva** — el
   * mismo molde que `ResultadoDeTrabajo`: `motivo` es para lo que falló, y una app viva no
   * falló. Lo que prueba que está viva viaja en `respuesta`, no aquí.
   */
  motivo?: string;
  /** La última respuesta leída, entera. Es la MEDIDA: un `result:true` no lo es. */
  respuesta?: RespuestaHotswap;
}

/**
 * El veredicto de vida, en UN sitio.
 *
 * Vale si el framework no ha dicho que no, si no ha dicho ninguna de las dos frases con las que
 * dice que todavía no hay app delante, y si lo que trae es de verdad un ÁRBOL.
 *
 * Lo del árbol no es un adorno, es la parte que impide el falso positivo: `getAllElements` mete
 * su payload —el array de descriptores— como JSON dentro de `status`, así que cualquier otra
 * cosa que llegue por ahí (otro error, una cadena vacía, un objeto suelto) NO es una app viva.
 * Conformarse con «hay algo en `status`» convertiría un error desconocido en un visto bueno,
 * que es el diagnóstico falso más caro de todos porque no da ningún síntoma.
 *
 * Y un árbol VACÍO sí está vivo: el `[]` lo contesta una pantalla con un diálogo modal delante
 * —lo de debajo está tapado y no se publica—, que es una app en pie, no una app muerta.
 */
export function estaViva(respuesta: RespuestaHotswap): boolean {
  if (respuesta.result === false) return false;
  const status = typeof respuesta.status === "string" ? respuesta.status : "";
  if (status.includes(FRASE_SIN_APP)) return false;
  if (status.includes(FRASE_SIN_PANTALLA)) return false;
  try {
    return Array.isArray(JSON.parse(status));
  } catch {
    return false;
  }
}

/** El motivo, con la respuesta LITERAL y sin traducir. «No funciona» no es un hallazgo. */
function decirDe(respuesta: RespuestaHotswap): string {
  const status = typeof respuesta.status === "string" ? respuesta.status.trim() : "";
  return status === "" ? JSON.stringify(respuesta) : status;
}

/** La espera entre sondeos. `setTimeout` pelado, para que el test pueda adelantar el reloj. */
function dormir(ms: number): Promise<void> {
  return new Promise((resolver) => setTimeout(resolver, ms));
}

/** Una línea, nunca la traza entera ni una ruta de la máquina. */
function unaLinea(error: unknown): string {
  const e = error as { code?: unknown; message?: unknown } | null;
  // El fallo más probable con diferencia, y el que peor se lee en crudo: el servidor vive
  // DENTRO del proceso de la app, así que un puerto que no contesta es que la app no está viva.
  if (e !== null && typeof e === "object" && e.code === "ECONNREFUSED") {
    return "no hay nadie escuchando ahí: el servidor vive dentro de la app, y sin app no hay servidor";
  }
  const mensaje = e !== null && typeof e === "object" && typeof e.message === "string" ? e.message : String(error);
  return mensaje.split(/\r?\n/)[0]!.slice(0, 160);
}

/**
 * El socket de verdad. **`rejectUnauthorized: false` no es un descuido**: el certificado del
 * dispositivo es autofirmado en las dos plataformas —la skill lo dice y por eso todos sus
 * ejemplos van con `curl -k`—, así que con la comprobación puesta no se conectaría con nada.
 * El destino es un túnel de `adb` en loopback o la IP de la LAN que enseña la propia app, y
 * quien pueda escribir en esa conexión ya está en la máquina.
 */
const abrirSocketReal: AbrirSocketHotswap = (url) =>
  new WebSocket(url, { rejectUnauthorized: false }) as unknown as SocketHotswap;
