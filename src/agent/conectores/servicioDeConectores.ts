/**
 * Lo que la consola hace con un conector, en un solo sitio y con la red por COSTURA.
 *
 * Todo lo caro entra por `RedDeConectores`, que se pasa al construir: así los tests de la
 * regla no abren un socket, y la composición de verdad vive en `servicioDeConectoresCableado`
 * con su propio test — el patrón de fallo de siempre es una composición de producción
 * dentro de algo que todos los tests doblan.
 *
 * **La prueba es una FOTO en memoria**, como la de dispositivos: se mide al pulsar y tras
 * autorizar, no hay sondeo, y un proceso nuevo empieza sin foto — ausente es «no se ha
 * probado», no «falla».
 */
import { randomBytes } from "node:crypto";
import { UnauthorizedError, auth, type OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import {
  conectorDelCatalogo, estadoDeConector, interpretarCallback,
  TOPE_DE_CONEXION_MS, TTL_DE_AUTORIZACION_MS,
  type ConectorDelCable, type Pendiente, type PruebaDeConector, type ToolDeConector,
} from "../../core/conectores.js";
import { anadirConector, ErrorDeFicheroDeConectores, leerAnadidos, leerOAuth, olvidarOAuth, quitarConector } from "./conectoresEnDisco.js";
import { ProveedorDeConector } from "./proveedorDeConector.js";
import { abrirEnSistema } from "../cloudstudio/cloudstudioMcp.js";

export interface ServicioDeConectores {
  lista(): { conectores: ConectorDelCable[]; desconocidos: string[]; ilegible?: true; error?: string };
  anadir(id: string): void; // un id fuera del catálogo deja su frase en `error`
  quitar(id: string): void; // también olvida su OAuth y su prueba
  probar(id: string): Promise<void>; // guarda la FOTO en memoria
  autorizar(id: string, redirectUrl: string): Promise<void>; // abre el navegador; no devuelve la URL
  completar(query: URLSearchParams): Promise<{ ok: boolean; mensaje: string }>;
  desconectar(id: string): void; // olvida tokens (y cliente), no lo quita
}

export interface RedDeConectores {
  listarTools(url: string, proveedor: OAuthClientProvider | undefined, senal: AbortSignal): Promise<ToolDeConector[]>;
  iniciarAutorizacion(url: string, proveedor: OAuthClientProvider): Promise<"REDIRECT" | "AUTHORIZED">;
  canjearCodigo(url: string, proveedor: OAuthClientProvider, code: string): Promise<void>;
  abrir(url: URL): void;
}

interface PendienteConRedirect extends Pendiente { redirectUrl: string }

export function crearServicioDeConectores(o: {
  casa: string;
  red: RedDeConectores;
  ahora?: () => number;
  alCambiar?: () => void;
}): ServicioDeConectores {
  const ahora = o.ahora ?? Date.now;
  const pruebas = new Map<string, PruebaDeConector>();
  const pendientes = new Map<string, PendienteConRedirect>();
  /** La frase de la última operación que falló. Viaja en el mensaje: `informar` no llega al
   *  navegador desde el vestíbulo, y Ajustes se abre sin proyecto. */
  let error: string | undefined;
  const cambio = (): void => { try { o.alCambiar?.(); } catch { /* reemitir no puede tumbar la operación */ } };
  const hayPendienteVivo = (id: string): boolean => [...pendientes.values()].some((p) => p.id === id && p.expira >= ahora());
  /** Retira los pendientes de ESTE conector, vivos o no: el callback viejo contestará «ya se
   *  usó». Sin esto, `quitar`/`desconectar` dejan un canje en vuelo que escribe tokens de un
   *  conector ya retirado (o deja «Esperando al navegador…» encendido diez minutos). */
  const retirarPendientes = (id: string): void => { for (const [s, p] of pendientes) if (p.id === id) pendientes.delete(s); };

  /** La frase de un fallo AL GUARDAR EN DISCO, nunca `error.message`: un `ErrorDeFicheroDeConectores`
   *  lleva la ruta ABSOLUTA del fichero (`conectoresEnDisco.ts#paraEscribir`), y un `EACCES`/`ENOSPC`
   *  de Node también la lleva — ninguna ruta de la máquina viaja por el cable. */
  const motivoDeFallo = (e: unknown): string => {
    if (e instanceof ErrorDeFicheroDeConectores) return "el fichero de conectores no se entiende: revísalo o bórralo a mano";
    const code = (e as { code?: unknown } | null)?.code;
    return typeof code === "string" ? `no se pudo guardar (código ${code})` : "no se pudo guardar";
  };
  /** Para las operaciones de disco: lo que falla se DICE en `error`, no se lanza al cable. */
  const operar = (hacer: () => void): void => {
    try { hacer(); error = undefined; }
    catch (e) { error = motivoDeFallo(e); }
    cambio();
  };

  const catalogado = (id: string) => {
    const c = conectorDelCatalogo(id);
    if (c === undefined) throw new Error(`«${id}» no está en el catálogo de conectores`);
    return c;
  };
  const proveedor = (id: string, redirectUrl: string, state: string, alRedirigir: (u: URL) => void = () => {}) =>
    new ProveedorDeConector({ casa: o.casa, id, redirectUrl, state, alRedirigir });

  const motivoDe = (error: unknown): string => {
    if (error instanceof UnauthorizedError) return "falta autorizar";
    const code = (error as { code?: unknown } | null)?.code;
    if (typeof code === "number") return `no responde (HTTP ${code})`;
    if (typeof code === "string") return `no responde (código ${code})`;
    return "no responde";
  };

  const servicio: ServicioDeConectores = {
    lista() {
      const { anadidos, desconocidos, ilegible } = leerAnadidos(o.casa);
      const vivos = new Set([...pendientes.values()].filter((p) => p.expira >= ahora()).map((p) => p.id));
      return {
        desconocidos,
        ...(ilegible ? { ilegible } : {}),
        ...(error === undefined ? {} : { error }),
        conectores: anadidos.map((id) => {
          const c = catalogado(id);
          const prueba = pruebas.get(id);
          return {
            id,
            estado: estadoDeConector(c, leerOAuth(o.casa, id).tokens !== undefined),
            ...(prueba === undefined ? {} : { prueba }),
            ...(vivos.has(id) ? { autorizando: true } : {}),
          };
        }),
      };
    },
    anadir(id) {
      // Fuera de `operar`: su frase lleva el id y no una ruta, así que no pasa por
      // `motivoDeFallo` — que solo sabe traducir fallos de DISCO.
      if (conectorDelCatalogo(id) === undefined) { error = `«${id}» no está en el catálogo de conectores`; cambio(); return; }
      operar(() => { anadirConector(o.casa, id); });
    },
    // `retirarPendientes` va ANTES de `operar`: su `cambio()` es SÍNCRONO, así que quien lo
    // escuche y lea `lista()` dentro del callback vería `autorizando: true` un instante de
    // más si el pendiente se retirara después — el mismo síntoma que `autorizar` evita al
    // borrar su pendiente antes de avisar de un fallo.
    quitar(id) { retirarPendientes(id); operar(() => { quitarConector(o.casa, id); olvidarOAuth(o.casa, id); pruebas.delete(id); }); },
    desconectar(id) { retirarPendientes(id); operar(() => { olvidarOAuth(o.casa, id); pruebas.delete(id); }); },
    async probar(id) {
      const c = conectorDelCatalogo(id);
      if (c === undefined) { error = `«${id}» no está en el catálogo de conectores`; cambio(); return; }
      // Con una autorización abierta no se toca la red: un 401 haría que el SDK arrancara
      // OTRA y pisara el verificador PKCE —uno por conector— que el callback va a necesitar.
      if (hayPendienteVivo(id)) { cambio(); return; }
      const guardado = leerOAuth(o.casa, id);
      // Un OAuth sin tokens NO se prueba contra la red: el SDK, al ver el 401, intentaría
      // registrar un cliente —con un redirect que no es ninguno— y dejaría basura en el
      // fichero. La respuesta ya se sabe sin preguntar.
      if (c.autenticacion === "oauth" && (guardado.tokens === undefined || guardado.redirectUri === undefined)) {
        pruebas.set(id, { cuando: ahora(), ok: false, motivo: "falta autorizar" });
        cambio();
        return;
      }
      const control = new AbortController();
      let reloj: ReturnType<typeof setTimeout> | undefined;
      const tope = new Promise<never>((_, rechazar) => {
        reloj = setTimeout(() => { control.abort(); rechazar(new Error("tope")); }, TOPE_DE_CONEXION_MS);
      });
      try {
        // Sin autenticación no se pasa proveedor: un `authProvider` haría que el SDK
        // intentara un registro contra un servidor que no lo pide.
        const p = c.autenticacion === "oauth" ? proveedor(id, guardado.redirectUri!, "") : undefined;
        const tools = await Promise.race([o.red.listarTools(c.url, p, control.signal), tope]);
        pruebas.set(id, { cuando: ahora(), ok: true, tools });
        // Un `error` de una operación ANTERIOR no puede quedarse junto a un estado que ya es
        // correcto: «ausente ≠ vacío» también vale para lo que ya no es cierto.
        error = undefined;
      } catch (error) {
        pruebas.set(id, { cuando: ahora(), ok: false, motivo: control.signal.aborted ? "no responde (no contestó a tiempo)" : motivoDe(error) });
      } finally {
        clearTimeout(reloj);
        cambio();
      }
    },
    async autorizar(id, redirectUrl) {
      const c = conectorDelCatalogo(id);
      if (c === undefined) { error = `«${id}» no está en el catálogo de conectores`; cambio(); return; }
      // UNA autorización viva por conector: el verificador PKCE se guarda por conector, así
      // que una nueva invalida la anterior. Pulsar «Conectar» otra vez es también cómo se
      // recupera quien cerró la pestaña a medias.
      retirarPendientes(id);
      const state = randomBytes(32).toString("base64url");
      pendientes.set(state, { id, expira: ahora() + TTL_DE_AUTORIZACION_MS, redirectUrl });
      // NO se limpia `error` aquí: en este instante no se sabe todavía si `autorizar` va a ir
      // bien —solo se ha apuntado un pendiente—, y limpiarlo a ciegas borraría el error de UN
      // CLIC ANTERIOR (por ejemplo, un `anadir` que falló al escribir) antes de que nadie lo
      // viera, ahora que «Añadir» en un OAuth manda `anadir` y `autorizar` seguidos. Se limpia
      // donde `autorizar` de verdad tiene éxito: la rama `AUTHORIZED` llama a `probar`, que ya
      // limpia el suyo al ir bien; la rama `REDIRECT` no ha decidido nada todavía —quien lo
      // decide es `completar`, que ya limpia el suyo al canjear el código—.
      cambio();
      try {
        const resultado = await o.red.iniciarAutorizacion(c.url, proveedor(id, redirectUrl, state, (url) => o.red.abrir(url)));
        // Ya autorizado (tokens válidos): no hay navegador que esperar.
        if (resultado === "AUTHORIZED") { pendientes.delete(state); await servicio.probar(id); }
      } catch (e) {
        // Descubrimiento, registro o red: sin esto la pantalla esperaría a un navegador que
        // nunca se abrió hasta que caducara el plazo.
        pendientes.delete(state);
        pruebas.set(id, { cuando: ahora(), ok: false, motivo: motivoDe(e) });
        cambio();
      }
    },
    async completar(query) {
      // `interpretarCallback` CONSUME el pendiente, así que su redirect se lee antes: el
      // canje tiene que ir con el MISMO `redirect_uri` con el que se pidió el código.
      const redirect = pendientes.get(query.get("state") ?? "")?.redirectUrl;
      const r = interpretarCallback(query, pendientes, ahora());
      cambio();
      if (!r.ok || redirect === undefined) return { ok: false, mensaje: r.ok ? "esa autorización ya no está pendiente" : r.motivo };
      const c = catalogado(r.id);
      try {
        await o.red.canjearCodigo(c.url, proveedor(r.id, redirect, ""), r.code);
      } catch (error) {
        pruebas.set(r.id, { cuando: ahora(), ok: false, motivo: motivoDe(error) });
        cambio();
        return { ok: false, mensaje: "no se pudo completar la autorización: vuelve a pulsar Conectar" };
      }
      // El canje fue bien: un `error` de una operación anterior ya no describe el estado
      // actual. No se deja esperando a que `probar` lo limpie — puede fallar por su cuenta
      // sin que eso reviva un error que ya no es cierto.
      error = undefined;
      await servicio.probar(r.id);
      return { ok: true, mensaje: `${c.nombre} conectado` };
    },
  };
  return servicio;
}

export function redDeConectoresReal(): RedDeConectores {
  return {
    async listarTools(url, proveedor, senal) {
      const opciones = { ...(proveedor ? { authProvider: proveedor } : {}), requestInit: { signal: senal } };
      // Un `Client` NUEVO para el intento por SSE, como el ejemplo de compatibilidad del
      // propio SDK: el que falló al conectar no se reutiliza. Los tres medidos hablan
      // streamable-http; el SSE queda para un servidor viejo.
      let cliente = new Client({ name: "xonecode", version: "0" });
      try {
        await cliente.connect(new StreamableHTTPClientTransport(new URL(url), opciones), { signal: senal });
      } catch (error) {
        if (error instanceof UnauthorizedError || senal.aborted) throw error;
        await cliente.close().catch(() => {});
        cliente = new Client({ name: "xonecode", version: "0" });
        await cliente.connect(new SSEClientTransport(new URL(url), opciones), { signal: senal });
      }
      try {
        const { tools } = await cliente.listTools(undefined, { signal: senal });
        return tools.map((t) => ({
          nombre: t.name,
          ...(t.description ? { descripcion: t.description } : {}),
          ...(typeof t.annotations?.readOnlyHint === "boolean" ? { soloLectura: t.annotations.readOnlyHint } : {}),
        }));
      } finally {
        await cliente.close().catch(() => {});
      }
    },
    iniciarAutorizacion: (url, proveedor) => auth(proveedor, { serverUrl: url }),
    canjearCodigo: async (url, proveedor, code) => { await auth(proveedor, { serverUrl: url, authorizationCode: code }); },
    abrir: abrirEnSistema,
  };
}

export function servicioDeConectoresCableado(o: { casa: string; alCambiar?: () => void }): ServicioDeConectores {
  return crearServicioDeConectores({ casa: o.casa, red: redDeConectoresReal(), ...(o.alCambiar ? { alCambiar: o.alCambiar } : {}) });
}
