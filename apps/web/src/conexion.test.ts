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
      fabricaDeEventos: (url) => {
        expect(url).toBe("/eventos");
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
});
