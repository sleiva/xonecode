/**
 * El recorrido entero, con TODOS los efectos doblados: aquí no hay un `adb`, ni un socket, ni
 * una conexión, ni un certificado. El único «proceso» es un `EventEmitter` y la única «subida»
 * es una función que devuelve un código.
 *
 * Es el invariante de este repo visto desde el módulo que más efectos tiene: si este test
 * lanzara un proceso de verdad, el módulo estaría mal montado, no el test.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import type { Dispositivo } from "../../core/dispositivos.js";
import type { AbrirSocketHotswap, SocketHotswap } from "./hotswap.js";
import { TOPE_SIN_SALIDA_MS as EL_DE_LA_INSTALACION } from "./instalacionEnMaquina.js";
import type { ProcesoHijo } from "./instalacionEnMaquina.js";
import {
  cabecerasDeSubida,
  FASES_DE_LANZAMIENTO,
  lanzarEnDispositivo,
  motivoDeSubida,
  opcionesDeSubida,
  rutaDeSubida,
  TOPE_DE_TRABAJO_MS,
  TOPE_SIN_SALIDA_MS,
  type DependenciasDeLanzamiento,
  type FaseDeLanzamiento,
  type PeticionDeLanzamiento,
  type PeticionDeSubida,
  type RespuestaDeSubida,
} from "./lanzamientoEnMaquina.js";

/** El paquete que devolvió la medida: el flavor standalone. El otro tiene otro nombre. */
const DEL_FRAMEWORK = "com.xone.android.framework";

const APARATO: Dispositivo = {
  id: "emulator-5554",
  nombre: "Pixel 8",
  plataforma: "android",
  clase: "emulador",
  estado: "conectado",
};

const PETICION: PeticionDeLanzamiento = { dispositivo: APARATO, raiz: "/proyectos/MiApp", app: "MiApp" };

/** Dos megas justos, para que la línea del tamaño sea legible y comprobable. */
const PAQUETE = {
  bytes: new Uint8Array([80, 75, 3, 4]),
  ficheros: ["app.ini", "colecciones/saludo.xne"],
  total: 2 * 1024 * 1024,
};

/** Un árbol de verdad: array JSON dentro de `status`, que es lo que dice que la app está viva. */
const ARBOL = JSON.stringify([{ name: "btnSaludo", type: "B", visible: true }]);

const ANDROID = {
  plataforma: "darwin",
  entorno: { PATH: "/opt/homebrew/bin" },
  home: "/Users/yo",
  existe: (ruta: string) => ruta === "/opt/homebrew/bin/adb",
};

/** Un hijo de mentira: se le dan datos y se le hace terminar a mano. */
function hijoFalso(pid?: number) {
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  const sucesos = new EventEmitter();
  let matado: string | undefined;
  const hijo = {
    stdout,
    stderr,
    stdin: { write: () => {}, end: () => {} },
    on: (evento: string, cb: (...a: unknown[]) => void) => void sucesos.on(evento, cb),
    kill: (senal?: string) => {
      matado = senal ?? "SIGTERM";
      return true;
    },
    pid,
  } as unknown as ProcesoHijo;
  return {
    hijo,
    get matado() {
      return matado;
    },
    salida: (texto: string) => stdout.emit("data", Buffer.from(texto)),
    cerrar: (codigo: number | null) => sucesos.emit("close", codigo),
    reventar: (e: Error) => sucesos.emit("error", e),
  };
}

/** Un `lanzar` con su registro de llamadas y sus hijos, uno NUEVO por llamada. */
function lanzador(pid?: number) {
  const llamadas: { binario: string; args: string[] }[] = [];
  const hijos: ReturnType<typeof hijoFalso>[] = [];
  return {
    llamadas,
    hijos,
    lanzar: (binario: string, args: string[]) => {
      llamadas.push({ binario, args });
      const h = hijoFalso(pid);
      hijos.push(h);
      return h.hijo;
    },
  };
}

/**
 * El servidor de `/hotswap` de mentira, por el MISMO camino que el de verdad: el socket que
 * saluda y contesta. Es el doble de `deps.abrirSocket`, así que quien corre es el cliente de
 * `hotswap.ts` — con su espera del saludo y su sondeo— y no una segunda copia del protocolo.
 *
 * Las dos respuestas van en una MICROTAREA: `abrirSocket` devuelve y el cliente se suscribe a
 * `message` justo después, así que un doble que contestara dentro del propio `send` —o que
 * saludara antes de devolver— perdería su mensaje por llegar antes que su escucha.
 */
function servidorHotswap(contestar: (comando: Record<string, unknown>) => unknown) {
  const oyentes: ((valor: unknown) => void)[] = [];
  const enviados: string[] = [];
  let cerrado = false;
  const emitir = (valor: unknown): void => {
    for (const cb of oyentes) cb(Buffer.from(JSON.stringify(valor)));
  };
  const socket: SocketHotswap = {
    on: (evento, cb) => {
      if (evento === "message") oyentes.push(cb as (valor: unknown) => void);
    },
    send: (texto) => {
      enviados.push(texto);
      queueMicrotask(() => emitir(contestar(JSON.parse(texto) as Record<string, unknown>)));
    },
    close: () => {
      cerrado = true;
    },
  };
  const abrirSocket: AbrirSocketHotswap = () => {
    queueMicrotask(() => emitir({ command: "server_hello", protocol_version: 2 }));
    return socket;
  };
  return { abrirSocket, enviados, cerrado: () => cerrado };
}

/**
 * Deja correr los microtareas pendientes con el reloj de verdad. Hace falta porque cada fase
 * encadena varias promesas —el framework, la subida, el canal— y `await Promise.resolve()` no
 * llega a todas.
 */
const reposar = (): Promise<void> => new Promise((resolver) => setImmediate(resolver));

/**
 * Espera a que aparezca el hijo N. Con tope y con aserción, para que un fallo salga como un
 * rojo que dice qué pasó y no como un test colgado hasta que el suite se rinde.
 */
async function esperarHijo(l: ReturnType<typeof lanzador>, indice: number): Promise<void> {
  for (let vuelta = 0; vuelta < 50 && l.hijos.length <= indice; vuelta++) await reposar();
  expect(l.hijos.length).toBeGreaterThan(indice);
}

/** Cierra el hijo N, esperando a que exista. */
async function cerrarHijo(l: ReturnType<typeof lanzador>, indice: number): Promise<void> {
  await esperarHijo(l, indice);
  l.hijos[indice]!.cerrar(0);
  await reposar();
}

/** Cierra los hijos en orden: cada fase espera al proceso de la anterior. */
async function atender(l: ReturnType<typeof lanzador>, cuantos: number): Promise<void> {
  for (let i = 0; i < cuantos; i++) await cerrarHijo(l, i);
}

/** El recorrido entero con todo doblado, y el reloj en la mano. */
function recorrido(extra: Partial<DependenciasDeLanzamiento> = {}, l: ReturnType<typeof lanzador> = lanzador()) {
  const subidas: PeticionDeSubida[] = [];
  const fases: { fase: FaseDeLanzamiento; linea: string }[] = [];
  const servidor = servidorHotswap((comando) =>
    comando["command"] === "launchApplication" ? { result: true, status: "" } : { result: true, status: ARBOL }
  );
  let reloj = 1_000;
  const trabajo = lanzarEnDispositivo(PETICION, {
    ...ANDROID,
    lanzar: l.lanzar,
    frameworkEnDispositivo: async () => ({
      instalado: true,
      paquete: DEL_FRAMEWORK,
      detalle: `framework instalado: ${DEL_FRAMEWORK}`,
    }),
    empaquetarProyecto: () => PAQUETE,
    subir: async (peticion) => {
      subidas.push(peticion);
      return { codigo: 200 };
    },
    abrirSocket: servidor.abrirSocket,
    alFase: (fase, linea) => fases.push({ fase, linea }),
    ahora: () => reloj,
    ...extra,
  });
  return {
    l,
    subidas,
    fases,
    servidor,
    trabajo,
    ponerReloj: (t: number) => {
      reloj = t;
    },
    /** Las líneas de UNA fase, en orden. */
    deFase: (fase: FaseDeLanzamiento) => fases.filter((f) => f.fase === fase).map((f) => f.linea),
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("lanzarEnDispositivo", () => {
  it("recorre las seis fases en orden, y cada una dice lo suyo", async () => {
    const r = recorrido();
    // Los dos primeros procesos, y el reloj se mueve ANTES del último: el `ms` se mide entre
    // que se empieza y que se acaba, y con el reloj quieto eso sería siempre cero.
    await atender(r.l, 2);
    r.ponerReloj(4_000);
    await cerrarHijo(r.l, 2);
    const resultado = await r.trabajo.terminado;

    expect(resultado).toEqual({ estado: "ok", fase: "comprobando-arranque", ms: 3_000 });
    expect([...new Set(r.fases.map((f) => f.fase))]).toEqual([...FASES_DE_LANZAMIENTO]);
    expect(r.deFase("comprobando")).toEqual([
      "túnel aplicado: 127.0.0.1:8443 es el aparato emulator-5554",
      `framework instalado: ${DEL_FRAMEWORK}`,
    ]);
    expect(r.deFase("empaquetando")).toEqual(["el paquete son 2,0 MB en 2 ficheros"]);
    expect(r.deFase("reiniciando")).toEqual([
      `parando ${DEL_FRAMEWORK}`,
      "arrancando la pantalla del servidor de hotswap, que levanta el canal",
    ]);
    expect(r.deFase("comprobando-arranque")).toEqual([
      "la app está viva: el framework contestó su árbol de controles",
    ]);
    // El canal cuenta lo suyo en la fase del lanzamiento, y su saludo es parte de lo que hay
    // que poder leer: es lo que dice con qué protocolo se está hablando.
    expect(r.deFase("lanzando").some((l) => l.includes("server_hello"))).toBe(true);
  });

  it("los tres comandos de adb, con el serial, la actividad del servidor y sin `.mainEntry`", async () => {
    const r = recorrido();
    await atender(r.l, 3);
    await r.trabajo.terminado;

    expect(r.l.llamadas.map((c) => c.args)).toEqual([
      ["-s", "emulator-5554", "forward", "tcp:8443", "tcp:8443"],
      ["-s", "emulator-5554", "shell", "am", "force-stop", DEL_FRAMEWORK],
      [
        "-s",
        "emulator-5554",
        "shell",
        "am",
        "start",
        "-n",
        `${DEL_FRAMEWORK}/com.xone.android.hotswap.activities.SetupActivity`,
      ],
    ]);
    expect(r.l.llamadas.every((c) => c.binario === "/opt/homebrew/bin/adb")).toBe(true);
    // Medido: `.mainEntry` NO levanta el servidor, así que el `/hotswap` no existiría y el
    // lanzamiento se quedaría sin canal.
    expect(JSON.stringify(r.l.llamadas)).not.toContain("mainEntry");
  });

  it("el túnel se aplica ANTES de hablar con el servidor, y NO se quita al terminar", async () => {
    const l = lanzador();
    let llamadasAlSubir = -1;
    const r = recorrido(
      {
        subir: async () => {
          llamadasAlSubir = l.llamadas.length;
          return { codigo: 200 };
        },
      },
      l
    );
    await atender(r.l, 3);
    await r.trabajo.terminado;

    // Antes de la subida solo ha corrido el `forward`: el servidor escucha en el `localhost`
    // del aparato, y sin túnel `127.0.0.1:8443` no lleva a ninguna parte.
    expect(llamadasAlSubir).toBe(1);
    expect(r.l.llamadas[0]!.args.slice(2)).toEqual(["forward", "tcp:8443", "tcp:8443"]);
    // Y NO se quita: se reaplica tras cada reconexión del cable, así que quitarlo dejaría el
    // SIGUIENTE lanzamiento hablando con nadie.
    expect(JSON.stringify(r.l.llamadas)).not.toContain("--remove");
  });

  it("la subida va por POST al nombre exacto del ZIP, con la app escapada y con Content-Length", async () => {
    const r = recorrido();
    await atender(r.l, 3);
    await r.trabajo.terminado;

    expect(r.subidas).toEqual([
      {
        host: "127.0.0.1",
        puerto: 8443,
        ruta: "/file_upload?file=debug_app_update.zip&appName=MiApp",
        metodo: "POST",
        // Sin `Content-Length` el servidor contesta 411 y no lee nada. El ZIP va ENTERO en el
        // cuerpo: no hay fichero temporal que subir.
        cabeceras: { "Content-Length": "4", "Content-Type": "application/octet-stream" },
        cuerpo: PAQUETE.bytes,
      },
    ]);
  });

  it("lanza por el canal de `/hotswap` con el nombre EXACTO de la app y cierra el canal", async () => {
    const r = recorrido();
    await atender(r.l, 3);
    await r.trabajo.terminado;

    expect(r.servidor.enviados).toEqual([
      '{"command":"launchApplication","appName":"MiApp"}',
      '{"command":"getAllElements","format":"xone"}',
    ]);
    expect(r.servidor.cerrado()).toBe(true);
  });

  it("sin adb no se lanza NADA: ni un proceso, ni una subida", async () => {
    const r = recorrido({ existe: () => false });
    await expect(r.trabajo.terminado).resolves.toMatchObject({
      estado: "fallo",
      fase: "comprobando",
      motivo: "no está adb: sin él no se llega al dispositivo",
    });
    expect(r.l.llamadas).toEqual([]);
    expect(r.subidas).toEqual([]);
    expect(r.fases).toEqual([{ fase: "comprobando", linea: "no está adb: sin él no se llega al dispositivo" }]);
  });

  it("sin framework se corta en comprobando, y con el túnel ya puesto", async () => {
    const r = recorrido({
      frameworkEnDispositivo: async () => ({
        instalado: false,
        detalle: "no aparece el framework: ni el standalone ni el de Play Store",
      }),
    });
    await atender(r.l, 1);
    const resultado = await r.trabajo.terminado;

    expect(resultado).toMatchObject({
      estado: "fallo",
      fase: "comprobando",
      motivo: "no aparece el framework: ni el standalone ni el de Play Store",
    });
    // El motivo también es una línea del log: un recorrido que se para en silencio se lee como
    // que se ha colgado.
    expect(r.fases.at(-1)).toEqual({
      fase: "comprobando",
      linea: "no aparece el framework: ni el standalone ni el de Play Store",
    });
    // El túnel SÍ se aplicó —va antes— y no se subió nada.
    expect(r.l.llamadas.length).toBe(1);
    expect(r.subidas).toEqual([]);
  });

  it("un paquete que no se puede montar corta en empaquetando, con UNA línea", async () => {
    const r = recorrido({
      empaquetarProyecto: () => {
        throw new Error("el proyecto ocupa 600,0 MB y el paquete admite 512,0 MB: no se sube nada");
      },
    });
    await atender(r.l, 1);
    await expect(r.trabajo.terminado).resolves.toMatchObject({
      estado: "fallo",
      fase: "empaquetando",
      motivo: "el proyecto ocupa 600,0 MB y el paquete admite 512,0 MB: no se sube nada",
    });
    expect(r.subidas).toEqual([]);
  });

  it("un 411 en la subida NO llega a reiniciar: se corta en subiendo con su frase", async () => {
    const r = recorrido({ subir: async () => ({ codigo: 411 }) });
    await atender(r.l, 1);
    await expect(r.trabajo.terminado).resolves.toMatchObject({
      estado: "fallo",
      fase: "subiendo",
      motivo: "el servidor pidió el tamaño del cuerpo y no se lo mandamos",
    });
    // Lo que prueba que no se tocó el aparato: ningún `force-stop` y ningún canal abierto.
    expect(r.l.llamadas.length).toBe(1);
    expect(JSON.stringify(r.l.llamadas)).not.toContain("force-stop");
    expect(r.servidor.enviados).toEqual([]);
  });

  it("una subida sin nadie escuchando vuelve con la frase del servidor, no con la traza", async () => {
    const r = recorrido({
      subir: async () => {
        throw Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:8443"), { code: "ECONNREFUSED" });
      },
    });
    await atender(r.l, 1);
    await expect(r.trabajo.terminado).resolves.toMatchObject({
      estado: "fallo",
      fase: "subiendo",
      motivo: "no hay nadie escuchando ahí: el servidor vive dentro de la app, y sin app no hay servidor",
    });
  });

  it("si la app no arranca, la frase es la LITERAL del framework", async () => {
    const r = recorrido({
      abrirSocket: servidorHotswap(() => ({ result: false, status: "App is not running" })).abrirSocket,
    });
    await atender(r.l, 3);
    await expect(r.trabajo.terminado).resolves.toMatchObject({
      estado: "fallo",
      fase: "comprobando-arranque",
      motivo: "App is not running",
    });
  });

  it("un `adb` mudo se da por COLGADO en el tope de silencio, y no antes", async () => {
    vi.useFakeTimers();
    const r = recorrido();
    await vi.advanceTimersByTimeAsync(TOPE_SIN_SALIDA_MS - 1);
    // Mientras calla todavía se le espera: el tope es del SILENCIO, no de la lentitud.
    expect(r.l.hijos[0]!.matado).toBeUndefined();

    await vi.advanceTimersByTimeAsync(1);
    expect(r.l.hijos[0]!.matado).toBe("SIGKILL");
    r.l.hijos[0]!.cerrar(null);

    await expect(r.trabajo.terminado).resolves.toMatchObject({
      estado: "colgada",
      fase: "comprobando",
      motivo: "no dijo nada en 5 min",
    });
    expect(r.subidas).toEqual([]);
  });

  it("cancelar se lleva el GRUPO entero, no solo al hijo", async () => {
    const l = lanzador(4321);
    const grupos: { pid: number; senal: string }[] = [];
    const r = recorrido({ matarGrupo: (pid, senal) => void grupos.push({ pid, senal }) }, l);
    await atender(r.l, 1);
    await esperarHijo(r.l, 1);

    r.trabajo.cancelar();
    // Con `detached` el hijo es líder de su grupo y su pid es el del grupo: lo que se mata es
    // el grupo, porque un nieto sobrevive a `child.kill()`.
    expect(grupos).toEqual([{ pid: 4321, senal: "SIGTERM" }]);
    // Y al hijo no se le manda nada aparte: al grupo se llega por el pid.
    expect(r.l.hijos[1]!.matado).toBeUndefined();

    r.l.hijos[1]!.cerrar(null);
    await expect(r.trabajo.terminado).resolves.toMatchObject({ estado: "cancelada", fase: "reiniciando" });
    // Cancelado no se sigue: ni `am start`, ni canal, ni subida.
    expect(r.l.llamadas.length).toBe(2);
    expect(r.servidor.enviados).toEqual([]);
  });

  it("cancelar durante la subida aborta la petición en vuelo, y cancelar manda sobre el código", async () => {
    let senal: AbortSignal | undefined;
    let soltar: (r: RespuestaDeSubida) => void = () => {};
    const r = recorrido({
      subir: (_peticion, s) => {
        senal = s;
        return new Promise<RespuestaDeSubida>((resolver) => {
          soltar = resolver;
        });
      },
    });
    await atender(r.l, 1);
    expect(senal?.aborted).toBe(false);

    r.trabajo.cancelar();
    expect(senal?.aborted).toBe(true);
    // Aunque el servidor conteste que sí después: lo que decidió la persona manda.
    soltar({ codigo: 200 });
    await expect(r.trabajo.terminado).resolves.toMatchObject({ estado: "cancelada", fase: "subiendo" });
    expect(JSON.stringify(r.l.llamadas)).not.toContain("force-stop");
  });
});

describe("las fases", () => {
  it("son seis, y en el orden en que se recorren", () => {
    expect([...FASES_DE_LANZAMIENTO]).toEqual([
      "comprobando",
      "empaquetando",
      "subiendo",
      "reiniciando",
      "lanzando",
      "comprobando-arranque",
    ]);
  });
});

describe("los topes", () => {
  it("son los MISMOS de la instalación, no una copia con los números escritos otra vez", () => {
    expect(TOPE_SIN_SALIDA_MS).toBe(EL_DE_LA_INSTALACION);
    expect(TOPE_SIN_SALIDA_MS).toBe(5 * 60_000);
    expect(TOPE_DE_TRABAJO_MS).toBe(60 * 60_000);
    // El del silencio es el síntoma; el total solo evita que un proceso que habla sin avanzar
    // se quede para siempre, así que tiene que ser el mayor de los dos.
    expect(TOPE_SIN_SALIDA_MS).toBeLessThan(TOPE_DE_TRABAJO_MS);
  });
});

describe("motivoDeSubida", () => {
  it("cada código de la tabla medida tiene UNA frase", () => {
    expect(motivoDeSubida(400)).toBe("el servidor rechazó la subida: falta el nombre de la app o el tamaño no cuadra");
    expect(motivoDeSubida(403)).toBe("el servidor rechazó el nombre de la app o la ruta");
    expect(motivoDeSubida(405)).toBe("el servidor no acepta POST en esa ruta");
    expect(motivoDeSubida(409)).toBe("en el dispositivo hay un directorio donde iba la app");
    expect(motivoDeSubida(411)).toBe("el servidor pidió el tamaño del cuerpo y no se lo mandamos");
    expect(motivoDeSubida(413)).toBe("el ZIP pasa de 512 MiB");
    expect(motivoDeSubida(500)).toBe("el dispositivo no pudo crear el directorio, extraer o mover el fichero");
  });

  it("el 200 no es un rechazo, y un código que no está en la tabla se CUENTA", () => {
    expect(motivoDeSubida(200)).toBeUndefined();
    // Un código que no consta no se puede explicar, pero se puede decir: inventarle una frase
    // sería afirmar una causa que nadie ha medido.
    expect(motivoDeSubida(418)).toBe("subida rechazada (418)");
  });
});

describe("la petición de subida", () => {
  it("la ruta lleva el nombre EXACTO del ZIP y el de la app escapado", () => {
    // Con otro nombre el servidor no dispara la extracción, y con el nombre partido por un `&`
    // leería otra app —o ninguna— sin decir nada.
    expect(rutaDeSubida("MiApp")).toBe("/file_upload?file=debug_app_update.zip&appName=MiApp");
    expect(rutaDeSubida("Mi App & Cía")).toBe(
      "/file_upload?file=debug_app_update.zip&appName=Mi%20App%20%26%20C%C3%ADa"
    );
  });

  it("va por POST, con Content-Length y sin comprobar el certificado de ESTA petición", () => {
    const cuerpo = new Uint8Array(2_048);
    expect(cabecerasDeSubida(cuerpo)).toEqual({
      "Content-Length": "2048",
      "Content-Type": "application/octet-stream",
    });

    const opciones = opcionesDeSubida({
      host: "127.0.0.1",
      puerto: 8443,
      ruta: rutaDeSubida("MiApp"),
      metodo: "POST",
      cabeceras: cabecerasDeSubida(cuerpo),
      cuerpo,
    });
    // El certificado del aparato es autofirmado, y el `rejectUnauthorized` se queda AQUÍ en vez
    // de apagarse para todo el proceso: una variable de entorno no distingue a quién le hablas,
    // y `NODE_TLS_REJECT_UNAUTHORIZED=0` dejaría sin comprobar también al proveedor del modelo.
    expect(opciones).toMatchObject({
      host: "127.0.0.1",
      port: 8443,
      method: "POST",
      rejectUnauthorized: false,
    });
    expect(opciones.path).toBe("/file_upload?file=debug_app_update.zip&appName=MiApp");
  });
});
