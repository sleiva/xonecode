/**
 * El SSE del navegador al servidor (`/eventos`) y el `POST /accion` de vuelta —el
 * transporte de `web/servidor/transporte.ts` visto desde el otro extremo del cable.
 *
 * `EventSource` NUNCA se llama al margen de una fábrica inyectable: `npm test` no puede
 * necesitar un navegador (regla del repo, y medido — jsdom 25 no implementa `EventSource`
 * en absoluto, `typeof window.EventSource === "undefined"`), así que probar esta conexión
 * exige un doble. La fábrica por omisión es el `EventSource` global de verdad, para que en
 * producción no haga falta pasar nada.
 */
import type { MensajeDelCliente } from "./tipos.js";
import type { crearStoreDelCliente } from "./store.js";

type Store = ReturnType<typeof crearStoreDelCliente>;

/** El subconjunto de `EventSource` que esta conexión usa — lo que un doble tiene que dar. */
export interface FuenteDeEventos {
  onmessage: ((ev: { data: string }) => void) | null;
  onopen: (() => void) | null;
  onerror: (() => void) | null;
  close(): void;
}

export type FabricaDeEventos = (url: string) => FuenteDeEventos;

/** El subconjunto de `fetch` que `enviar` usa. */
export type FuncionFetch = (url: string, opciones: RequestInit) => Promise<unknown>;

const fabricaPorOmision: FabricaDeEventos = (url) => new EventSource(url) as unknown as FuenteDeEventos;

/** 1 s, 2 s, 4 s… con tope de 30 s. Reconectar cada segundo para siempre es una tormenta. */
export function esperaDeReintento(intento: number): number {
  return Math.min(1000 * 2 ** intento, 30_000);
}

export interface OpcionesDeConexion {
  fabricaDeEventos?: FabricaDeEventos;
  fetch?: FuncionFetch;
  /** Costura de test del reloj: el backoff no puede dormir el test. */
  temporizador?: (fn: () => void, ms: number) => unknown;
  cancelarTemporizador?: (id: unknown) => void;
}

export interface Conexion {
  /** Cierra el `EventSource` en curso y cancela cualquier reintento pendiente. */
  cerrar(): void;
  enviar(mensaje: MensajeDelCliente): Promise<unknown>;
}

/**
 * Abre el SSE contra `/eventos` y lo mantiene: un `error` cierra el stream en curso —el
 * `EventSource` nativo reintenta solo a los ~3 s, y sin cerrarlo primero el backoff de aquí
 * correría EN PARALELO con el suyo, dejando dos streams abiertos donde el servidor solo
 * conserva un sumidero (`transporte.ts#conectar` lo sobrescribe) y el otro se queda
 * escuchando en el vacío— y agenda el siguiente intento con `esperaDeReintento`. Un `open`
 * reinicia el contador: si no, una caída larga deja el backoff clavado en 30 s para
 * siempre en vez de volver a intentar rápido la próxima vez que de verdad se recupere.
 */
export function crearConexion(store: Store, opciones: OpcionesDeConexion = {}): Conexion {
  const fabricaDeEventos = opciones.fabricaDeEventos ?? fabricaPorOmision;
  const fetchInyectado = opciones.fetch ?? ((url, init) => fetch(url, init));
  const temporizador = opciones.temporizador ?? ((fn, ms) => setTimeout(fn, ms));
  const cancelarTemporizador = opciones.cancelarTemporizador ?? ((id) => clearTimeout(id as Parameters<typeof clearTimeout>[0]));

  let intento = 0;
  let idDeReintento: unknown;
  let fuente: FuenteDeEventos | undefined;
  let cerrada = false;

  const conectar = (): void => {
    const es = fabricaDeEventos("/eventos");
    fuente = es;

    es.onopen = () => {
      intento = 0;
      store.marcarConectado();
    };

    es.onmessage = (ev) => {
      // Un `JSON.parse` de la red es responsabilidad de OTRO proceso: un cuerpo roto no
      // puede tumbar el `onmessage` y con él la conexión entera (misma regla que
      // `store.aplicar` aplica dentro, en dos capas).
      let mensaje: unknown;
      try {
        mensaje = JSON.parse(ev.data);
      } catch {
        return;
      }
      store.aplicar(mensaje);
    };

    es.onerror = () => {
      es.close();
      store.marcarDesconectado();
      if (cerrada) return;
      const espera = esperaDeReintento(intento);
      intento += 1;
      idDeReintento = temporizador(conectar, espera);
    };
  };

  conectar();

  return {
    cerrar(): void {
      cerrada = true;
      if (idDeReintento !== undefined) cancelarTemporizador(idDeReintento);
      fuente?.close();
    },
    enviar(mensaje: MensajeDelCliente): Promise<unknown> {
      return fetchInyectado("/accion", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(mensaje),
      });
    },
  };
}
