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
  /**
   * El identificador de ESTA conexión, para que el servidor sepa a qué pestaña engancharle
   * la mirada de una tarea (ver `Conexion.mirar`). Por omisión se genera uno; entra por
   * opción para poder afirmar sobre la URL del SSE y sobre el mensaje en un test.
   */
  idDeCliente?: string;
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
  /**
   * Sube los bytes de un adjunto de tarea (`POST /adjunto`).
   *
   * Por HTTP y no por el cable: el SSE lleva JSON y esto son bytes. Devuelve `{ok, motivo?}`
   * en vez de lanzar, porque quien lo llama lo pinta en la fila de ese fichero — un
   * `try/catch` en la ventana para enseñar un texto sería el mismo trato con más ruido.
   */
  subirAdjunto(tarea: string, nombre: string, fichero: Blob): Promise<{ ok: boolean; motivo?: string }>;
  /**
   * Empieza (`ver: true`) o deja de mirar en vivo lo que hace una tarea de fondo.
   *
   * **Tiene método propio y no se manda con `enviar` porque lleva el id de ESTA conexión**, y
   * ese es un dato del transporte: el SSE y el `POST /accion` son dos peticiones distintas,
   * así que sin él el servidor no sabría a qué pestaña engancharle la mirada — y tendría que
   * emitirle el transcript de la tarea a todo el mundo, que es exactamente lo que no puede
   * pasar. Quien pulsa el botón no tiene por qué conocerlo, y pasarlo a mano por los
   * componentes sería otra copia que mantener de acuerdo.
   */
  mirar(tarea: string, ver: boolean): Promise<unknown>;
}

/**
 * El id de una conexión: texto llano y corto. No es una ruta ni un nombre de fichero —es la
 * clave de un mapa del servidor— pero se mantiene en `[A-Za-z0-9_-]` para que no haya nada
 * que escapar en ninguna de las capas por las que pasa (la query del SSE y un JSON).
 *
 * `crypto.randomUUID` no se usa a propósito: no está en todos los contextos (hace falta un
 * origen seguro) y esta consola se sirve por `http://127.0.0.1`. Aquí no hace falta que sea
 * imprevisible: el token del servidor es lo que autoriza, esto solo distingue pestañas.
 */
function idNuevoDeCliente(): string {
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
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

  /**
   * UNO por conexión, y el MISMO entre reconexiones: un id nuevo por caída dejaría en el
   * servidor una entrada muerta por cada una, y su `close` no se podría distinguir del de la
   * reconexión que acaba de reclamar el mismo hueco.
   */
  const idDeCliente = opciones.idDeCliente ?? idNuevoDeCliente();

  const conectar = (): void => {
    const es = fabricaDeEventos(`/eventos?cliente=${idDeCliente}`);
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

  // Función y no método del objeto: `mirar` la reusa, y con `this.enviar` un
  // `const {mirar} = conexion` —o un manejador pasado como prop— se quedaría sin `this`.
  const enviar = (mensaje: MensajeDelCliente): Promise<unknown> =>
    fetchInyectado("/accion", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(mensaje),
    });

  return {
    cerrar(): void {
      cerrada = true;
      if (idDeReintento !== undefined) cancelarTemporizador(idDeReintento);
      fuente?.close();
    },
    mirar(tarea: string, ver: boolean): Promise<unknown> {
      // Por el mismo `POST /accion` que todo lo demás; lo único que esta capa añade es el
      // id, que es suyo. Ver `Conexion.mirar`.
      return enviar({ clase: "mirar", tarea, ver, cliente: idDeCliente });
    },
    enviar,
    async subirAdjunto(tarea, nombre, fichero) {
      // El nombre va CODIFICADO en la query y no en el camino de la ruta: `registrarRuta`
      // casa por coincidencia exacta (la misma razón que documenta `RUTA_ARTEFACTO`). Y sin
      // `content-type` propio: el servidor lee bytes, y ponerle uno solo podría mentir.
      const url = `/adjunto?tarea=${encodeURIComponent(tarea)}&nombre=${encodeURIComponent(nombre)}`;
      let respuesta: unknown;
      try {
        respuesta = await fetchInyectado(url, { method: "POST", credentials: "same-origin", body: fichero });
      } catch (error) {
        // Un fallo de red no puede tumbar la ventana: se dice en la fila del fichero.
        return { ok: false, motivo: error instanceof Error ? error.message : "no se pudo subir" };
      }
      const r = respuesta as { ok?: unknown; status?: unknown; text?: () => Promise<string> } | undefined;
      if (r?.ok === true) return { ok: true };
      // El MOTIVO lo escribe el servidor y no lleva ninguna ruta de la máquina (su test lo
      // vigila): es lo que hace que un tope o un nombre rechazado se lean en su fila en vez
      // de como un número de estado.
      const motivo = (await r?.text?.().catch(() => "")) ?? "";
      return { ok: false, motivo: motivo.trim() === "" ? `el servidor contestó ${String(r?.status ?? "?")}` : motivo.trim() };
    },
  };
}
