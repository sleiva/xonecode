import { afterEach, describe, expect, it, vi } from "vitest";
import {
  abrirHotswap,
  DESTINO_POR_OMISION,
  estaViva,
  INTERVALO_DE_REENVIO_MS,
  INTERVALO_DE_SONDEO_MS,
  lanzarYComprobar,
  TOPE_DE_APERTURA_MS,
  TOPE_DE_ARRANQUE_MS,
  TOPE_DE_SALUDO_MS,
  type AbrirSocketHotswap,
  type SocketHotswap,
} from "./hotswap.js";

const URL = "wss://127.0.0.1:8443/hotswap";

/**
 * Lo que se mide al conectar con el framework todavía arrancando, palabra por palabra: `adb
 * forward` acepta la conexión en el lado del host y la resetea en cuanto el cliente intenta el
 * handshake. Es la línea que aparecía DOS veces en la pestaña antes de que esto se reintentara.
 */
const MENSAJE_DE_TLS = "Client network socket disconnected before secure TLS connection was established";

/** Un árbol de verdad, con la forma que documenta el contrato: array JSON dentro de `status`. */
const ARBOL = JSON.stringify([{ name: "MAP_LOGIN_BTN", type: "B", visible: true }]);

/** La respuesta del framework cuando todavía no hay app delante. */
const SIN_APP = { result: false, status: "App is not running" };

/** Cuántos sondeos caben hasta el tope, con el de la primera vuelta incluido. */
const SONDEO_COMPLETO = TOPE_DE_ARRANQUE_MS / INTERVALO_DE_SONDEO_MS + 1;

/**
 * Un servidor de mentira, por el MISMO camino que el de verdad: llega un comando por `send` y
 * su respuesta sale por el socket.
 *
 * **El saludo lo manda el test a mano** (`saludar()`), y no el constructor, porque aquí la
 * conexión es instantánea: en la realidad el cliente se suscribe a `message` antes de que el
 * handshake termine —así que el saludo no se puede perder—, y un doble sin búfer sí lo
 * perdería si lo emitiera antes de que nadie escuche. Decir CUÁNDO saluda es, además, la mitad
 * de lo que hay que probar: que no saluda nunca es el caso (b).
 */
function servidorFalso(
  opciones: {
    version?: number;
    /** Qué contesta a cada comando. `veces` es cuántas veces se ha recibido ESE comando. */
    contestar?: (comando: Record<string, unknown>, veces: number) => unknown;
    /** Un socket que no llega a abrir: `send` revienta como un puerto sin nadie escuchando. */
    romperAlMandar?: boolean;
    /** No contesta a nada, para probar el desenlace de un canal que se cae a mitad. */
    mudo?: boolean;
    /**
     * Cuántas conexiones NO llegan a abrir antes de que una funcione. Es lo MEDIDO tras reiniciar
     * el framework: el `adb forward` ya tiene el LISTEN en el lado del host, así que la conexión
     * se acepta y se resetea antes de que nadie salude.
     */
    noAbreLasPrimeras?: number;
    /**
     * Saluda solo, en cuanto el cliente está escuchando. Para los casos que no controlan CUÁNDO
     * saluda —los del reintento—, y no para los que sí: decir cuándo saluda es la mitad de lo que
     * hay que probar en el camino normal.
     */
    saludaSolo?: boolean;
  } = {}
) {
  const {
    version = 2,
    contestar = () => ({ result: true, status: "" }),
    romperAlMandar = false,
    mudo = false,
    noAbreLasPrimeras = 0,
    saludaSolo = false,
  } = opciones;
  const urls: string[] = [];
  const enviados: string[] = [];
  const cuantas = new Map<string, number>();
  const oyentes = new Map<string, ((valor: unknown) => void)[]>();
  let cerrado = false;

  const emitir = (evento: string, valor?: unknown): void => {
    for (const cb of oyentes.get(evento) ?? []) cb(valor);
  };

  const socket: SocketHotswap = {
    on: (evento, cb) => {
      const lista = oyentes.get(evento) ?? [];
      lista.push(cb as (valor: unknown) => void);
      oyentes.set(evento, lista);
    },
    send: (texto) => {
      if (romperAlMandar) {
        throw Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:8443"), { code: "ECONNREFUSED" });
      }
      enviados.push(texto);
      const comando = JSON.parse(texto) as Record<string, unknown>;
      const nombre = String(comando["command"]);
      const veces = (cuantas.get(nombre) ?? 0) + 1;
      cuantas.set(nombre, veces);
      if (mudo) return;
      emitir("message", Buffer.from(JSON.stringify(contestar(comando, veces))));
    },
    close: () => {
      cerrado = true;
    },
  };

  /**
   * Un socket que no llega a abrir: `error` y `close` sin haber saludado, que es exactamente lo
   * medido. Se emite por reloj y no en el acto porque el cliente se suscribe DESPUÉS de que el
   * constructor devuelva el socket —en `ws` un evento nunca es síncrono—, así que un `error`
   * inmediato se perdería y el caso no probaría nada.
   */
  const socketQueNoAbre = (): SocketHotswap => {
    const propios = new Map<string, ((valor: unknown) => void)[]>();
    const emitirPropio = (evento: string, valor?: unknown): void => {
      for (const cb of propios.get(evento) ?? []) cb(valor);
    };
    return {
      on: (evento, cb) => {
        const lista = propios.get(evento) ?? [];
        lista.push(cb as (valor: unknown) => void);
        propios.set(evento, lista);
        if (evento !== "error") return;
        setTimeout(() => {
          emitirPropio("error", new Error(MENSAJE_DE_TLS));
          emitirPropio("close", 1006);
        }, 0);
      },
      send: () => {},
      close: () => {},
    };
  };

  let aperturas = 0;
  const abrirSocket: AbrirSocketHotswap = (url) => {
    urls.push(url);
    aperturas += 1;
    if (aperturas <= noAbreLasPrimeras) return socketQueNoAbre();
    if (saludaSolo) setTimeout(() => saludar(), 0);
    return socket;
  };
  /** El servidor habla primero, en cuanto el cliente está escuchando. */
  const saludar = (): void =>
    emitir("message", Buffer.from(JSON.stringify({ command: "server_hello", protocol_version: version })));

  return {
    abrirSocket,
    urls,
    enviados,
    /** Cuántas veces se recibió un comando, por su nombre EXACTO. */
    veces: (nombre: string) => cuantas.get(nombre) ?? 0,
    cerrado: () => cerrado,
    saludar,
    caerse: () => emitir("close", 1006),
    reventar: (error: Error) => emitir("error", error),
    /** Lo que el servidor dice sin que nadie lo haya pedido. */
    decir: (mensaje: unknown) => emitir("message", Buffer.from(JSON.stringify(mensaje))),
  };
}

afterEach(() => {
  vi.useRealTimers();
});

/**
 * Deja correr los microtareas pendientes con el reloj de verdad.
 *
 * Hace falta porque el doble contesta DENTRO del `send`: entre que el saludo llega y el comando
 * sale por el socket hay un par de vueltas de promesas, y `await Promise.resolve()` no siempre
 * alcanza a todas.
 */
const reposar = (): Promise<void> => new Promise((resolver) => setImmediate(resolver));

describe("abrirHotswap", () => {
  it("no manda NADA hasta que el servidor saluda", async () => {
    const servidor = servidorFalso();
    const cliente = abrirHotswap(URL, { abrirSocket: servidor.abrirSocket });

    const respuesta = cliente.comando("launchApplication", { appName: "MiApp" });
    // Se deja correr la vuelta de promesas y se mira OTRA VEZ: sin saludo no ha salido nada, y
    // no por casualidad ni por llegar tarde — es la única forma de saber que esto no se está
    // inventando el protocolo.
    await reposar();
    expect(servidor.enviados).toEqual([]);

    servidor.saludar();
    await expect(respuesta).resolves.toEqual({ result: true, status: "" });
    // Y la grafía es EXACTA, en el mismo orden: `launchapplication` en minúscula contesta
    // `Unknown command`, así que esto no es cosmética, es el contrato.
    expect(servidor.enviados).toEqual(['{"command":"launchApplication","appName":"MiApp"}']);
  });

  it("si el servidor no saluda, cierra y falla con UNA línea", async () => {
    vi.useFakeTimers();
    const servidor = servidorFalso();
    const lineas: string[] = [];
    const cliente = abrirHotswap(URL, { abrirSocket: servidor.abrirSocket, alLinea: (l) => lineas.push(l) });

    const rechazo = cliente.comando("launchApplication", { appName: "MiApp" }).catch((e: Error) => e.message);
    await vi.advanceTimersByTimeAsync(TOPE_DE_SALUDO_MS);

    expect(await rechazo).toBe(`el servidor de ${URL} no saludó en 15 s`);
    expect(servidor.cerrado()).toBe(true);
    expect(servidor.enviados).toEqual([]);
    // Y la línea queda en el log: un fallo que solo se ve por el rechazo de una promesa no
    // llega a ninguna pantalla.
    expect(lineas).toContain(`el servidor de ${URL} no saludó en 15 s`);
  });

  it("un protocol_version distinto se CUENTA y se sigue: no se rechaza lo que no se ha medido", async () => {
    const servidor = servidorFalso({ version: 3 });
    const lineas: string[] = [];
    const cliente = abrirHotswap(URL, { abrirSocket: servidor.abrirSocket });
    cliente.alLinea((l) => lineas.push(l));

    const respuesta = cliente.comando("launchApplication", { appName: "MiApp" });
    servidor.saludar();

    await expect(respuesta).resolves.toEqual({ result: true, status: "" });
    expect(lineas.some((l) => l.includes("protocol_version 3"))).toBe(true);
  });

  it("las dos líneas del servidor —el saludo y la respuesta— quedan en el log tal cual", async () => {
    const servidor = servidorFalso({ contestar: () => ({ result: true, status: ARBOL }) });
    const lineas: string[] = [];
    const cliente = abrirHotswap(URL, { abrirSocket: servidor.abrirSocket, alLinea: (l) => lineas.push(l) });

    const respuesta = cliente.comando("getAllElements", { format: "xone" });
    servidor.saludar();
    await respuesta;

    expect(lineas).toEqual([
      '{"command":"server_hello","protocol_version":2}',
      JSON.stringify({ result: true, status: ARBOL }),
    ]);
  });

  it("cierra el canal cuando el socket se cae, en vez de dejar a nadie esperando", async () => {
    const servidor = servidorFalso({ mudo: true });
    const cliente = abrirHotswap(URL, { abrirSocket: servidor.abrirSocket });
    const respuesta = cliente.comando("launchApplication", { appName: "MiApp" });
    servidor.saludar();
    await reposar();

    servidor.caerse();
    await expect(respuesta).rejects.toThrow("el canal se cerró antes de contestar");
  });
});

describe("estaViva", () => {
  it("un árbol es una app viva, y vacío también: `[]` es una pantalla tapada, no una app muerta", () => {
    expect(estaViva({ result: true, status: ARBOL })).toBe(true);
    expect(estaViva({ result: true, status: "[]" })).toBe(true);
  });

  it("ninguna de las dos frases de «aún no hay app» cuenta como viva", () => {
    expect(estaViva({ result: false, status: "App is not running" })).toBe(false);
    expect(estaViva({ result: true, status: "App is not running" })).toBe(false);
    expect(estaViva({ result: true, status: "No activity is visible" })).toBe(false);
  });

  it("un `result:false` manda aunque el status traiga un árbol", () => {
    expect(estaViva({ result: false, status: ARBOL })).toBe(false);
  });

  it("CUALQUIER otra cosa que no sea un árbol es no viva", () => {
    // Un error que no estábamos esperando es justo lo que no puede pasar por un visto bueno.
    expect(estaViva({ result: true, status: "Unknown command: getAllElements" })).toBe(false);
    expect(estaViva({ result: true, status: "" })).toBe(false);
    // `ResultMessage(exception)` no trae `status` y sí `exceptionClass`/`exceptionMessage`.
    expect(estaViva({ result: false, exceptionClass: "java.lang.Exception", exceptionMessage: "boom" })).toBe(false);
    // Un objeto JSON suelto tampoco: el payload de `getAllElements` es un ARRAY.
    expect(estaViva({ result: true, status: '{"collection":"X"}' })).toBe(false);
  });
});

describe("lanzarYComprobar", () => {
  it("lanza, y cuando el acuse vuelve lee hasta que hay árbol", async () => {
    vi.useFakeTimers();
    const servidor = servidorFalso({
      contestar: (comando, veces) => {
        if (comando["command"] === "launchApplication") return { result: true, status: "" };
        return veces <= 3 ? SIN_APP : { result: true, status: ARBOL };
      },
    });

    const veredicto = lanzarYComprobar("MiApp", { abrirSocket: servidor.abrirSocket });
    servidor.saludar();
    // Tres sondeos dicen que no hay app y el cuarto trae el árbol: tres esperas de un segundo.
    await vi.advanceTimersByTimeAsync(INTERVALO_DE_SONDEO_MS * 3);

    await expect(veredicto).resolves.toEqual({ viva: true, respuesta: { result: true, status: ARBOL } });
    expect(servidor.enviados[0]).toBe('{"command":"launchApplication","appName":"MiApp"}');
    expect(servidor.enviados[1]).toBe('{"command":"getAllElements","format":"xone"}');
    expect(servidor.veces("getAllElements")).toBe(4);
    // Y se para en cuanto lo sabe: nada de gastar el minuto entero en un despliegue que va bien.
    expect(servidor.veces("getAllElements")).toBeLessThan(SONDEO_COMPLETO);
    expect(servidor.cerrado()).toBe(true);
  });

  /**
   * El caso que dejaba la pestaña inservible, medido el 16-sep-2026 contra el emulador y con los
   * MISMOS bytes de ZIP en las dos direcciones: **el primer `launchApplication` que llega con el
   * framework recién reiniciado se acepta y no arranca nada.** Mandándolo una sola vez, doce
   * lecturas seguidas dicen `App is not running` durante los 60 s del tope; volviéndolo a pedir,
   * hay árbol dos o tres segundos después del segundo envío. Las cuatro tiradas buenas de esa
   * sesión se pusieron vivas JUSTO detrás de un reenvío, y ninguna sin él.
   */
  it("el primer lanzamiento se acepta y no arranca nada: lo que la arranca es el reenvío", async () => {
    vi.useFakeTimers();
    let lanzamientos = 0;
    const servidor = servidorFalso({
      contestar: (comando) => {
        if (comando["command"] === "launchApplication") {
          lanzamientos += 1;
          return { result: true, status: "" };
        }
        return lanzamientos >= 2 ? { result: true, status: ARBOL } : SIN_APP;
      },
    });

    const lineas: string[] = [];
    const veredicto = lanzarYComprobar("MiApp", { abrirSocket: servidor.abrirSocket, alLinea: (l) => lineas.push(l) });
    servidor.saludar();
    await vi.advanceTimersByTimeAsync(INTERVALO_DE_REENVIO_MS + INTERVALO_DE_SONDEO_MS);

    await expect(veredicto).resolves.toEqual({ viva: true, respuesta: { result: true, status: ARBOL } });
    expect(servidor.veces("launchApplication")).toBe(2);
    // Y el reenvío va DETRÁS de la lectura, no antes: es la lectura la que decide, y sobre una app
    // viva un segundo `launchApplication` la TUMBA (`MainEntry.finishApp()`, medido).
    expect(servidor.enviados[0]).toBe('{"command":"launchApplication","appName":"MiApp"}');
    expect(servidor.enviados[1]).toBe('{"command":"getAllElements","format":"xone"}');
    expect(servidor.enviados[6]).toBe('{"command":"getAllElements","format":"xone"}');
    expect(servidor.enviados[7]).toBe('{"command":"launchApplication","appName":"MiApp"}');
    expect(servidor.enviados[8]).toBe('{"command":"getAllElements","format":"xone"}');
    // Se dice, porque es la línea que explica por qué el recorrido tarda lo que tarda.
    expect(lineas).toContain("el framework aceptó el lanzamiento y la app no arrancó: se le vuelve a pedir");
    // Y se para en cuanto hay árbol: dos lanzamientos en total, no uno cada cinco segundos.
    expect(servidor.cerrado()).toBe(true);
  });

  it("un reenvío que el framework rechaza corta con su frase LITERAL, sin insistir", async () => {
    vi.useFakeTimers();
    let lanzamientos = 0;
    const servidor = servidorFalso({
      contestar: (comando) => {
        if (comando["command"] !== "launchApplication") return SIN_APP;
        lanzamientos += 1;
        // El primero se acepta y el segundo se rechaza: la misma regla para los dos, porque un
        // `result` que no es `true` es el framework diciendo que no.
        return lanzamientos === 1 ? { result: true, status: "" } : { result: false, status: "Unknown command: launchApplication" };
      },
    });

    const veredicto = lanzarYComprobar("MiApp", { abrirSocket: servidor.abrirSocket });
    servidor.saludar();
    await vi.advanceTimersByTimeAsync(INTERVALO_DE_REENVIO_MS + INTERVALO_DE_SONDEO_MS);

    const resultado = await veredicto;
    expect(resultado.viva).toBe(false);
    expect(resultado.motivo).toBe("Unknown command: launchApplication");
    expect(servidor.veces("launchApplication")).toBe(2);
    expect(servidor.cerrado()).toBe(true);
  });

  it("si nunca deja de decir «App is not running», el motivo es esa frase LITERAL", async () => {
    vi.useFakeTimers();
    const servidor = servidorFalso({
      contestar: (comando) => (comando["command"] === "launchApplication" ? { result: true, status: "" } : SIN_APP),
    });

    const veredicto = lanzarYComprobar("MiApp", { abrirSocket: servidor.abrirSocket });
    servidor.saludar();
    await vi.advanceTimersByTimeAsync(TOPE_DE_ARRANQUE_MS);

    const resultado = await veredicto;
    expect(resultado.viva).toBe(false);
    // Sin traducir: es lo que contestó el framework, y es lo único que dice qué pasó.
    expect(resultado.motivo).toBe("App is not running");
    expect(resultado.respuesta).toEqual(SIN_APP);
    // El tope se agota PREGUNTANDO: el sondeo es a los 0 s, 1 s, … y el último a los 60 s.
    expect(servidor.veces("getAllElements")).toBe(SONDEO_COMPLETO);
    expect(servidor.cerrado()).toBe(true);
  });

  it("si el lanzamiento no se acepta, la frase es el status literal y no se sondea nada", async () => {
    const servidor = servidorFalso({
      // Medido: la minúscula contesta esto. Los nombres son EXACTOS.
      contestar: () => ({ result: false, status: "Unknown command: launchapplication" }),
    });

    const veredicto = lanzarYComprobar("MiApp", { abrirSocket: servidor.abrirSocket });
    servidor.saludar();

    await expect(veredicto).resolves.toMatchObject({
      viva: false,
      motivo: "Unknown command: launchapplication",
    });
    expect(servidor.veces("getAllElements")).toBe(0);
    // `cerrar()` también en el camino de fallo: si no, cada intento deja un socket abierto
    // contra el emulador.
    expect(servidor.cerrado()).toBe(true);
  });

  it("un `status` con algo que no es un árbol no pasa por app viva", async () => {
    vi.useFakeTimers();
    const servidor = servidorFalso({ contestar: () => ({ result: true, status: "Screen 'X' is not readable by the 'xone' format" }) });

    const veredicto = lanzarYComprobar("MiApp", { abrirSocket: servidor.abrirSocket });
    servidor.saludar();
    await vi.advanceTimersByTimeAsync(TOPE_DE_ARRANQUE_MS);

    const resultado = await veredicto;
    expect(resultado.viva).toBe(false);
    expect(resultado.motivo).toBe("Screen 'X' is not readable by the 'xone' format");
  });

  it("no lanza: un puerto sin nadie escuchando vuelve como una línea", async () => {
    const servidor = servidorFalso({ romperAlMandar: true });
    const veredicto = lanzarYComprobar("MiApp", { abrirSocket: servidor.abrirSocket });
    servidor.saludar();

    await expect(veredicto).resolves.toEqual({
      viva: false,
      motivo: "no hay nadie escuchando ahí: el servidor vive dentro de la app, y sin app no hay servidor",
    });
  });

  it("un canal que se cae a mitad tampoco cuelga: vuelve con su línea", async () => {
    const servidor = servidorFalso({ mudo: true });
    const veredicto = lanzarYComprobar("MiApp", { abrirSocket: servidor.abrirSocket });
    servidor.saludar();
    await reposar();

    servidor.caerse();
    await expect(veredicto).resolves.toEqual({ viva: false, motivo: "el canal se cerró antes de contestar" });
    // Y la CONEXIÓN no se reintenta: aquí el canal ya había abierto, y volver a empezar desde cero
    // trataría un canal que se cayó a mitad como uno que no llegó a existir. El reenvío del
    // LANZAMIENTO es otra cosa y no se ve aquí: viaja por el canal de dentro, y éste se cerró.
    expect(servidor.urls).toHaveLength(1);
  });

  it("va al destino que se le dice, y por omisión al de fábrica", async () => {
    for (const [destino, esperado] of [
      [undefined, DESTINO_POR_OMISION],
      ["wss://127.0.0.1:9443/hotswap", "wss://127.0.0.1:9443/hotswap"],
    ] as const) {
      // El lanzamiento se rechaza, así que no hay sondeo ni reloj de por medio: lo que se mide
      // aquí es a QUÉ URL se abrió el canal.
      const servidor = servidorFalso({ contestar: () => ({ result: false, status: "App is not running" }) });
      const veredicto = lanzarYComprobar("MiApp", { abrirSocket: servidor.abrirSocket, destino });
      servidor.saludar();
      await veredicto;
      expect(servidor.urls).toEqual([esperado]);
    }
  });
});

/**
 * El caso medido en el emulador el 16-sep-2026, y el que dejaba la pestaña inservible justo
 * después de subir: el `am start` que reinicia el framework devuelve antes de que el servidor
 * escuche, y como el `adb forward` ya tiene el LISTEN en el lado del host, la conexión se ACEPTA
 * y se resetea antes de que nadie salude. El tope del saludo no cubría eso —mide un socket
 * abierto que se queda callado—, así que el lanzamiento moría con la línea de TLS mientras el
 * framework arrancaba detrás.
 */
describe("la conexión que todavía no abre", () => {
  it("reintenta mientras el framework arranca, y el lanzamiento sale", async () => {
    vi.useFakeTimers();
    const servidor = servidorFalso({
      noAbreLasPrimeras: 2,
      saludaSolo: true,
      contestar: () => ({ result: true, status: ARBOL }),
    });
    const lineas: string[] = [];
    const veredicto = lanzarYComprobar("MiApp", { abrirSocket: servidor.abrirSocket, alLinea: (l) => lineas.push(l) });
    await vi.advanceTimersByTimeAsync(TOPE_DE_APERTURA_MS);

    await expect(veredicto).resolves.toEqual({ viva: true, respuesta: { result: true, status: ARBOL } });
    // Tres conexiones: dos que no abrieron y la que sí. Y el lanzamiento salió UNA vez.
    expect(servidor.urls).toEqual([URL, URL, URL]);
    expect(servidor.veces("launchApplication")).toBe(1);
    // El motivo del primer intento es el que explica qué pasó…
    expect(lineas).toContain(`se reintenta el canal con ${URL}: ${MENSAJE_DE_TLS}`);
    // …y el mismo renglón repetido cada segundo llenaría la cola del log, que es corta: va UNA vez.
    expect(lineas.filter((l) => l.startsWith("se reintenta el canal"))).toHaveLength(1);
    expect(lineas).toContain(`el canal con ${URL} abrió en el intento 3`);
  });

  it("y si no abre nunca se para con el tope, con el ÚLTIMO motivo y sin mandar un solo comando", async () => {
    vi.useFakeTimers();
    const servidor = servidorFalso({ noAbreLasPrimeras: Number.POSITIVE_INFINITY });
    const veredicto = lanzarYComprobar("MiApp", { abrirSocket: servidor.abrirSocket });
    await vi.advanceTimersByTimeAsync(TOPE_DE_APERTURA_MS + INTERVALO_DE_SONDEO_MS * 2);

    const resultado = await veredicto;
    expect(resultado.viva).toBe(false);
    expect(resultado.motivo).toContain("no se pudo abrir el canal");
    expect(resultado.motivo).toContain(MENSAJE_DE_TLS);
    expect(resultado.motivo).toContain("en 60 s");
    // Un reintento sin tope sería un bucle contra un aparato que no está: se cuenta, y se para.
    expect(servidor.urls.length).toBeLessThanOrEqual(TOPE_DE_APERTURA_MS / INTERVALO_DE_SONDEO_MS + 2);
    // Y a un canal que no existe no se le manda nada: el saludo es lo primero, siempre.
    expect(servidor.enviados).toEqual([]);
  });

  it("un socket que abre y no saluda también se reintenta, y el motivo lo dice con sus palabras", async () => {
    // El otro camino hacia el mismo fallo: aquí la conexión SÍ entra y lo que no llega es el
    // saludo. El reintento no distingue —las dos son «el canal todavía no está»—, y el motivo que
    // viaja es el del módulo, no la línea de TLS: cada desenlace se cuenta como es.
    vi.useFakeTimers();
    const servidor = servidorFalso({ mudo: true });
    const lineas: string[] = [];
    const veredicto = lanzarYComprobar("MiApp", { abrirSocket: servidor.abrirSocket, alLinea: (l) => lineas.push(l) });
    await vi.advanceTimersByTimeAsync(TOPE_DE_APERTURA_MS + TOPE_DE_SALUDO_MS);

    const resultado = await veredicto;
    expect(resultado.viva).toBe(false);
    expect(resultado.motivo).toContain(`el servidor de ${URL} no saludó en 15 s`);
    expect(lineas.some((l) => l.includes("se reintenta el canal"))).toBe(true);
    // Y se reintentó de verdad, no una sola vez: el camino del saludo que no llega cuenta con el
    // mismo tope que el de la conexión que no abre.
    expect(servidor.urls.length).toBeGreaterThan(1);
  });
});
