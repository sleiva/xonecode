import { describe, it, expect } from "vitest";
import { esperaDeReintento, crearConexion, type FuenteDeEventos } from "./conexion.js";
import { crearStoreDelCliente } from "./store.js";

describe("reintento", () => {
  it("crece y se topa en 30 s: reconectar cada segundo para siempre es una tormenta", () => {
    expect([0, 1, 2, 3, 10].map(esperaDeReintento)).toEqual([1000, 2000, 4000, 8000, 30000]);
  });
});

/**
 * jsdom no implementa `EventSource` (medido: `typeof window.EventSource` es
 * `"undefined"` bajo jsdom 25), así que la conexión se prueba SIEMPRE con esta fábrica
 * doblada — nunca contra un `EventSource` de verdad (regla del repo: `npm test` sin
 * navegador ni red).
 */
class FuenteFalsa implements FuenteDeEventos {
  onmessage: ((ev: { data: string }) => void) | null = null;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  cerrada = false;
  close(): void {
    this.cerrada = true;
  }
}

/**
 * Un reloj de mentira en vez de `vi.useFakeTimers()`: la conexión ya acepta
 * `temporizador`/`cancelarTemporizador` inyectados, así que registrar la llamada y
 * dispararla a mano prueba lo mismo sin acoplar el test al reloj global de Vitest.
 */
function crearRelojFalso() {
  let siguienteId = 0;
  const pendientes = new Map<number, { fn: () => void; ms: number }>();
  return {
    temporizador: (fn: () => void, ms: number): number => {
      const id = siguienteId++;
      pendientes.set(id, { fn, ms });
      return id;
    },
    cancelarTemporizador: (id: unknown): void => {
      pendientes.delete(id as number);
    },
    /** Dispara el ÚNICO temporizador pendiente y devuelve la espera con la que se agendó. */
    dispararUnico(): number {
      expect(pendientes.size).toBe(1);
      const [[id, { fn, ms }]] = [...pendientes.entries()];
      pendientes.delete(id);
      fn();
      return ms;
    },
    tamano: (): number => pendientes.size,
  };
}

describe("conexión SSE", () => {
  it("un mensaje del SSE se decodifica y se aplica al store", () => {
    const fuentes: FuenteFalsa[] = [];
    const store = crearStoreDelCliente();
    crearConexion(store, {
      idDeCliente: "c1",
      fabricaDeEventos: (url) => {
        // El id de cliente va en la QUERY del SSE: es la única petición con un sumidero al
        // otro lado, así que es por donde el servidor se entera de a quién enganchar la
        // mirada de una tarea (`arranque.ts`). Ver `Conexion.mirar`.
        expect(url).toBe("/eventos?cliente=c1");
        const f = new FuenteFalsa();
        fuentes.push(f);
        return f;
      },
    });
    fuentes[0].onmessage!({ data: JSON.stringify({ clase: "acto", acto: { tipo: "usuario", texto: "hola" } }) });
    expect(store.leer().actos).toHaveLength(1);
  });

  it("un mensaje que no es JSON no lanza dentro de onmessage y no toca el store", () => {
    const fuentes: FuenteFalsa[] = [];
    const store = crearStoreDelCliente();
    crearConexion(store, {
      fabricaDeEventos: () => {
        const f = new FuenteFalsa();
        fuentes.push(f);
        return f;
      },
    });
    expect(() => fuentes[0].onmessage!({ data: "{esto no es json" })).not.toThrow();
    expect(store.leer().actos).toHaveLength(0);
  });

  it("onopen marca conectado y es el único sitio que lo hace", () => {
    const fuentes: FuenteFalsa[] = [];
    const store = crearStoreDelCliente();
    crearConexion(store, {
      fabricaDeEventos: () => {
        const f = new FuenteFalsa();
        fuentes.push(f);
        return f;
      },
    });
    expect(store.leer().conectado).toBe(false);
    fuentes[0].onopen!();
    expect(store.leer().conectado).toBe(true);
  });

  it("un error cierra el EventSource EN CURSO: sin eso el reintento propio corre en paralelo con el del navegador", () => {
    const fuentes: FuenteFalsa[] = [];
    const store = crearStoreDelCliente();
    const reloj = crearRelojFalso();
    crearConexion(store, {
      fabricaDeEventos: () => {
        const f = new FuenteFalsa();
        fuentes.push(f);
        return f;
      },
      temporizador: reloj.temporizador,
      cancelarTemporizador: reloj.cancelarTemporizador,
    });
    fuentes[0].onerror!();
    expect(fuentes[0].cerrada).toBe(true);
    expect(store.leer().conectado).toBe(false);
  });

  it("el backoff crece con cada error consecutivo y un open lo reinicia a 1 s", () => {
    const fuentes: FuenteFalsa[] = [];
    const store = crearStoreDelCliente();
    const reloj = crearRelojFalso();
    crearConexion(store, {
      fabricaDeEventos: () => {
        const f = new FuenteFalsa();
        fuentes.push(f);
        return f;
      },
      temporizador: reloj.temporizador,
      cancelarTemporizador: reloj.cancelarTemporizador,
    });

    fuentes[0].onerror!();
    expect(reloj.dispararUnico()).toBe(1000); // dispara conectar() de nuevo -> fuentes[1]
    fuentes[1].onerror!();
    expect(reloj.dispararUnico()).toBe(2000); // -> fuentes[2]
    fuentes[2].onopen!(); // se recupera: el contador de intentos vuelve a cero
    fuentes[2].onerror!();
    expect(reloj.dispararUnico()).toBe(1000); // NO 8000 — un open borra el historial de fallos
  });

  it("cerrar() cierra el EventSource y cancela el reintento pendiente: no reconecta después", () => {
    const fuentes: FuenteFalsa[] = [];
    const store = crearStoreDelCliente();
    const reloj = crearRelojFalso();
    const conexion = crearConexion(store, {
      fabricaDeEventos: () => {
        const f = new FuenteFalsa();
        fuentes.push(f);
        return f;
      },
      temporizador: reloj.temporizador,
      cancelarTemporizador: reloj.cancelarTemporizador,
    });

    fuentes[0].onerror!(); // agenda un reintento
    conexion.cerrar();

    expect(fuentes[0].cerrada).toBe(true);
    expect(reloj.tamano()).toBe(0); // el reintento agendado se canceló, no solo se ignoró
    expect(fuentes).toHaveLength(1); // nadie reconectó después de cerrar()
  });

  it("enviar() hace POST /accion con credentials same-origin y content-type json", async () => {
    const store = crearStoreDelCliente();
    const llamadas: [string, RequestInit][] = [];
    const conexion = crearConexion(store, {
      fabricaDeEventos: () => new FuenteFalsa(),
      fetch: async (url, opciones) => {
        llamadas.push([url, opciones]);
        return undefined;
      },
    });

    await conexion.enviar({ clase: "prosa", texto: "hola" });

    expect(llamadas).toHaveLength(1);
    const [url, opciones] = llamadas[0];
    expect(url).toBe("/accion");
    expect(opciones.method).toBe("POST");
    expect(opciones.credentials).toBe("same-origin");
    expect(opciones.headers).toEqual({ "content-type": "application/json" });
    expect(opciones.body).toBe(JSON.stringify({ clase: "prosa", texto: "hola" }));
  });

  /**
   * La subida de un adjunto va por HTTP y no por el cable: el SSE lleva JSON y esto son
   * bytes. Vive aquí y no en `App.tsx` por lo mismo que `enviar`: el `fetch` entra inyectado,
   * así que se puede afirmar sobre la petición sin abrir un socket ni parchear el global.
   */
  it("subirAdjunto() hace POST /adjunto con el nombre en la QUERY y los bytes como cuerpo", async () => {
    const store = crearStoreDelCliente();
    const llamadas: [string, RequestInit][] = [];
    const conexion = crearConexion(store, {
      fabricaDeEventos: () => new FuenteFalsa(),
      fetch: async (url, opciones) => {
        llamadas.push([url, opciones]);
        return { ok: true, status: 204, text: async () => "" };
      },
    });

    const fichero = new File(["0123456789"], "mockup.png", { type: "image/png" });
    expect(await conexion.subirAdjunto("b1", "mockup.png", fichero)).toEqual({ ok: true });

    const [url, opciones] = llamadas[0]!;
    // El nombre CODIFICADO en la query: `registrarRuta` casa por coincidencia exacta, así
    // que no puede ir en el camino de la ruta.
    expect(url).toBe("/adjunto?tarea=b1&nombre=mockup.png");
    expect(opciones.method).toBe("POST");
    expect(opciones.credentials).toBe("same-origin");
    expect(opciones.body).toBe(fichero);
    // Sin `content-type` propio: lo pone el navegador con el del fichero, y el servidor no
    // lo mira — lee bytes.
    expect(opciones.headers).toBeUndefined();
  });

  it("y devuelve el MOTIVO que contesta el servidor, que es lo que la fila del fichero pinta", async () => {
    const store = crearStoreDelCliente();
    const conexion = crearConexion(store, {
      fabricaDeEventos: () => new FuenteFalsa(),
      fetch: async () => ({ ok: false, status: 413, text: async () => "el adjunto es demasiado grande" }),
    });
    expect(await conexion.subirAdjunto("b1", "g.bin", new File(["x"], "g.bin"))).toEqual({
      ok: false,
      motivo: "el adjunto es demasiado grande",
    });
  });

  it("un fallo de red no revienta la ventana: se dice como motivo", async () => {
    const store = crearStoreDelCliente();
    const conexion = crearConexion(store, {
      fabricaDeEventos: () => new FuenteFalsa(),
      fetch: async () => {
        throw new Error("fetch failed");
      },
    });
    const r = await conexion.subirAdjunto("b1", "a.png", new File(["x"], "a.png"));
    expect(r.ok).toBe(false);
    expect(r.motivo).toBeDefined();
  });
});

/**
 * **Mirar en vivo una tarea de fondo** (Task 16).
 *
 * El `POST /accion` y el SSE son dos peticiones distintas, así que el servidor no puede
 * saber por sí solo qué pestaña pidió mirar: el identificador lo pone esta capa —una vez por
 * conexión— y viaja en los dos sitios. Vive aquí y no en `App.tsx` porque es un dato del
 * TRANSPORTE: quien pulsa el botón no tiene por qué conocerlo, y pasarlo a mano por los
 * componentes sería una copia más que mantener de acuerdo.
 */
describe("mirar una tarea", () => {
  it("el id de cliente viaja en la query del SSE y en el mensaje, y es el MISMO", async () => {
    const store = crearStoreDelCliente();
    const urls: string[] = [];
    const cuerpos: string[] = [];
    const conexion = crearConexion(store, {
      idDeCliente: "c1",
      fabricaDeEventos: (url) => {
        urls.push(url);
        return new FuenteFalsa();
      },
      fetch: async (_url, opciones) => {
        cuerpos.push(String(opciones.body));
        return undefined;
      },
    });
    await conexion.mirar("t1", true);
    await conexion.mirar("t1", false);
    expect(urls).toEqual(["/eventos?cliente=c1"]);
    expect(cuerpos).toEqual([
      JSON.stringify({ clase: "mirar", tarea: "t1", ver: true, cliente: "c1" }),
      JSON.stringify({ clase: "mirar", tarea: "t1", ver: false, cliente: "c1" }),
    ]);
  });

  it("el id se conserva entre reconexiones: la reconexión reclama la misma entrada", () => {
    const store = crearStoreDelCliente();
    const urls: string[] = [];
    const reloj = crearRelojFalso();
    crearConexion(store, {
      idDeCliente: "c1",
      fabricaDeEventos: (url) => {
        urls.push(url);
        return new FuenteFalsa();
      },
      temporizador: reloj.temporizador,
      cancelarTemporizador: reloj.cancelarTemporizador,
    });
    // Un id nuevo por reconexión dejaría en el servidor una entrada muerta por cada caída,
    // y el `close` de la vieja no podría distinguirse del de la nueva.
    expect(urls).toEqual(["/eventos?cliente=c1"]);
  });

  it("sin id inyectado se genera uno, distinto por conexión y sin caracteres raros", () => {
    const store = crearStoreDelCliente();
    const urls: string[] = [];
    const fabrica = (url: string): FuenteFalsa => {
      urls.push(url);
      return new FuenteFalsa();
    };
    crearConexion(store, { fabricaDeEventos: fabrica });
    crearConexion(store, { fabricaDeEventos: fabrica });
    expect(urls).toHaveLength(2);
    expect(urls[0]).not.toBe(urls[1]);
    // Va en una query y es la clave de un mapa del servidor, nunca una ruta: aun así se
    // mantiene en texto llano para que no haya nada que escapar en ninguna capa.
    for (const url of urls) expect(url).toMatch(/^\/eventos\?cliente=[A-Za-z0-9_-]+$/);
  });
});
