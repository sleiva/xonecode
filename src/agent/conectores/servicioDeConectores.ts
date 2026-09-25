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
  CATALOGO_DE_CONECTORES, conectorDeDefinicion, conectorDelCatalogo, esConectorPropio, estadoDeConector,
  filaDeCatalogo, idDeConectorDesdeNombre, interpretarCallback, motivoDeDefinicionInaceptable,
  TOPE_DE_CONEXION_MS, TTL_DE_AUTORIZACION_MS,
  type AutenticacionDeConector, type ConectorDeCatalogo, type ConectorDelCable, type DefinicionDeConector,
  type FilaDeCatalogo, type Pendiente, type PruebaDeConector, type ToolDeConector,
} from "../../core/conectores.js";
import { motivoDeClaveInaceptable } from "../../core/config.js";
import {
  anadirConector, ErrorDeFicheroDeConectores, guardarDefinicion, guardarOAuth, leerConectores,
  leerOAuth, olvidarDefinicion, olvidarOAuth, quitarConector,
  type SecretosDeConector,
} from "./conectoresEnDisco.js";
import { ProveedorDeConector } from "./proveedorDeConector.js";
import { abrirEnSistema } from "../cloudstudio/cloudstudioMcp.js";

export interface ServicioDeConectores {
  lista(): {
    /** `catálogo ∪ definiciones`, recortado a lo que viaja (sin `url`). */
    catalogo: FilaDeCatalogo[];
    conectores: ConectorDelCable[];
    desconocidos: string[];
    ilegible?: true;
    error?: string;
  };
  /** Da de alta un conector ESCRITO A MANO. Devuelve su id derivado, o `undefined` con el
   *  motivo ya puesto en `error` — el molde de `anadir`, que tampoco lanza por una frase. */
  crear(def: DefinicionDeConector): string | undefined;
  /**
   * Por dónde se autoriza ese id: OAuth abre el navegador, `api-key` pide una clave, y
   * `ninguna` no se autoriza. Lo pregunta el SERVIDOR y no viaja al cliente: lo que el cliente
   * manda es la INTENCIÓN («autoriza este id»), no por dónde.
   */
  autenticacionDe(id: string): AutenticacionDeConector | undefined;
  anadir(id: string): void; // un id que esta consola no resuelve deja su frase en `error`
  quitar(id: string): void; // también olvida su credencial y su prueba; de un `custom:`, su definición
  probar(id: string): Promise<void>; // guarda la FOTO en memoria
  autorizar(id: string, redirectUrl: string): Promise<void>; // abre el navegador; no devuelve la URL
  guardarClave(id: string, clave: string): void; // el carril del `api-key`, que no abre nada
  completar(query: URLSearchParams): Promise<{ ok: boolean; mensaje: string }>;
  desconectar(id: string): void; // olvida tokens (y cliente) o la clave, no lo quita
}

/**
 * Cómo se autentica una conexión: un proveedor OAuth, o una cabecera ya montada. Ausente es
 * «ninguna», y también «falta la credencial» — quien decide cuál de las dos lo sabe por el
 * conector, no por esto.
 *
 * Una unión y no dos campos opcionales: `{proveedor?, cabecera?}` admite las dos cosas a la
 * vez, que no significa nada, y a un tercer campo opcional le pasaría lo mismo.
 */
export type CredencialDeRed = { proveedor: OAuthClientProvider } | { cabecera: string };

export interface RedDeConectores {
  listarTools(url: string, credencial: CredencialDeRed | undefined, senal: AbortSignal): Promise<ToolDeConector[]>;
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

  /** La misma frase en los dos sitios donde un `conectores.json` ilegible impide saber qué está
   *  añadido: al fallar `anadir` y al rechazar `autorizar` por la misma causa (ver más abajo). */
  const FICHERO_ILEGIBLE = "el fichero de conectores no se entiende: revísalo o bórralo a mano";
  /** La frase de un fallo AL GUARDAR EN DISCO, nunca `error.message`: un `ErrorDeFicheroDeConectores`
   *  lleva la ruta ABSOLUTA del fichero (`conectoresEnDisco.ts#paraEscribir`), y un `EACCES`/`ENOSPC`
   *  de Node también la lleva — ninguna ruta de la máquina viaja por el cable. */
  const motivoDeFallo = (e: unknown): string => {
    if (e instanceof ErrorDeFicheroDeConectores) return FICHERO_ILEGIBLE;
    const code = (e as { code?: unknown } | null)?.code;
    return typeof code === "string" ? `no se pudo guardar (código ${code})` : "no se pudo guardar";
  };
  /** Para las operaciones de disco: lo que falla se DICE en `error`, no se lanza al cable.
   *  Devuelve si fue bien, que es lo único que `crear` necesita para saber si encadenar. */
  const operar = (hacer: () => void): boolean => {
    let bien = false;
    try { hacer(); error = undefined; bien = true; }
    catch (e) { error = motivoDeFallo(e); }
    cambio();
    return bien;
  };

  /**
   * Un id resuelto contra TODO lo que hay: el catálogo y las definiciones del registro que se acaba
   * de leer. Las dos familias vuelven como la MISMA fila (`conectorDeDefinicion`), así que de aquí
   * para abajo nada sabe de dónde salió un conector.
   *
   * El registro entra por PARÁMETRO en vez de leerse aquí, y no es ceremonia: quien resuelve
   * después de un `await` tiene que volver a mirarlo —el mundo pudo cambiar mientras la red
   * respondía—, y quien resuelve varios ids tiene que hacerlo contra UNA foto. Una lectura por id
   * serían dos ficheros distintos a mitad de camino. **Y no se cachea**: una definición vieja que
   * afirma que un servidor existe es peor que no tener índice, la misma regla que
   * `proveedoresPersonalizados()` y `SkillsEnDisco`.
   */
  const resolver = (id: string, definiciones: Record<string, DefinicionDeConector>): ConectorDeCatalogo | undefined => {
    const delCatalogo = conectorDelCatalogo(id);
    if (delCatalogo !== undefined) return delCatalogo;
    const def = definiciones[id];
    return def === undefined ? undefined : conectorDeDefinicion(id, def);
  };

  /**
   * Resuelve un id y exige que además esté AÑADIDO: es lo que necesitan las operaciones que
   * ESCRIBEN una credencial. Sin esto, un `crear` cuya escritura falló —o un `quitar` que le ganó
   * la carrera— dejaría una clave o unos tokens huérfanos en el fichero de secretos, sin ningún
   * «Quitar»/«Desconectar» que los alcanzara (esos botones solo salen para lo que YA está en la
   * lista). Devuelve `undefined` con la frase puesta en `error`.
   */
  const anadido = (id: string): ConectorDeCatalogo | undefined => {
    const registro = leerConectores(o.casa);
    const c = resolver(id, registro.definiciones);
    if (c === undefined) { error = `«${id}» no es un conector de esta consola`; cambio(); return undefined; }
    if (!registro.anadidos.includes(id)) {
      // El fichero ilegible es la MISMA causa que ya dejó `anadir` en `error`: se repite su
      // frase en vez de inventar una nueva que la pisaría. Genuinamente ausente (un `quitar`
      // de antes, o nunca se añadió) lleva la suya propia.
      error = registro.ilegible === true ? FICHERO_ILEGIBLE : `«${id}» no está añadido`;
      cambio();
      return undefined;
    }
    return c;
  };

  /**
   * ¿Hay con qué autenticarse? La MISMA pregunta para las dos familias —tokens o clave—, que es
   * lo que contesta `estadoDeConector`: quien mira el fichero de secretos resuelve la suya y le
   * pasa un booleano.
   */
  const tieneCredencial = (autenticacion: AutenticacionDeConector, guardado: SecretosDeConector): boolean => {
    if (autenticacion === "oauth") return guardado.tokens !== undefined;
    if (autenticacion === "api-key") return guardado.clave !== undefined;
    return false;
  };

  /**
   * La credencial CON LA QUE SE HABLA con el servidor, o `undefined` si no hay ninguna o le falta
   * algo — y ahí las dos familias se juntan: un OAuth sin tokens (o sin el redirect con el que se
   * registró su cliente, que es lo que ata el `redirect_uri`) y un `api-key` sin clave son el
   * mismo «no hay con qué». Una unión y no dos campos opcionales porque quien la recibe tiene que
   * elegir UN carril.
   *
   * `Bearer ` lo pone el CÓDIGO y no se le pide a nadie: `motivoDeClaveInaceptable` no deja pasar
   * un valor con espacios, así que el prefijo no cabe en la clave que pega una persona.
   */
  const credencialDe = (c: ConectorDeCatalogo, guardado: SecretosDeConector): CredencialDeRed | undefined => {
    if (c.autenticacion === "oauth") {
      return guardado.tokens !== undefined && guardado.redirectUri !== undefined
        ? { proveedor: proveedor(c.id, guardado.redirectUri, "") }
        : undefined;
    }
    if (c.autenticacion === "api-key") return guardado.clave === undefined ? undefined : { cabecera: `Bearer ${guardado.clave}` };
    return undefined;
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
      const registro = leerConectores(o.casa);
      const vivos = new Set([...pendientes.values()].filter((p) => p.expira >= ahora()).map((p) => p.id));
      return {
        // Las filas de CÓDIGO primero y las definiciones después, y las dos con la misma forma.
        // Es lo que hace que el cliente resuelva un `custom:` con la misma línea que un `jira`,
        // y lo que deja VER una definición huérfana —la que dejó un `quitar` que no olvidó su
        // definición, o una escrita a mano en el fichero—: sale como fila, con su nombre, y se
        // puede volver a añadir. Un fantasma invisible no se arregla.
        catalogo: [
          ...CATALOGO_DE_CONECTORES.map(filaDeCatalogo),
          ...Object.entries(registro.definiciones).map(([id, def]) => filaDeCatalogo(conectorDeDefinicion(id, def))),
        ],
        desconocidos: registro.desconocidos,
        ...(registro.ilegible === true ? { ilegible: true as const } : {}),
        ...(error === undefined ? {} : { error }),
        // Una fila por id añadido, y `leerConectores` solo llama vivo a un id que RESUELVE, así
        // que las dos cosas salen de la MISMA lectura y aquí no hay un `undefined` que defender
        // —el `flatMap` lo comprueba en vez de afirmarlo—. Es lo que deja que la lista viaje sin
        // nombre: el cliente lo busca en el catálogo, que ahora trae también las definiciones.
        conectores: registro.anadidos.flatMap((id) => {
          const c = resolver(id, registro.definiciones);
          if (c === undefined) return [];
          const prueba = pruebas.get(id);
          const guardado = leerOAuth(o.casa, id);
          return [{
            id,
            estado: estadoDeConector(c, tieneCredencial(c.autenticacion, guardado)),
            ...(prueba === undefined ? {} : { prueba }),
            ...(vivos.has(id) ? { autorizando: true } : {}),
          }];
        }),
      };
    },
    autenticacionDe(id) {
      // Sin `cambio()` y sin tocar `error`: es una PREGUNTA, y quien la hace ya sabe qué contar
      // si la respuesta es `undefined` — escribir una frase aquí la pondría en pantalla cada vez
      // que alguien pulsa un botón que no lleva a nada.
      return resolver(id, leerConectores(o.casa).definiciones)?.autenticacion;
    },
    crear(def) {
      const registro = leerConectores(o.casa);
      // Sin poder leer qué está ocupado no se puede comprobar el nombre, y crear a ciegas
      // pisaría una definición que ya existe. Es la misma causa que el `anadir` de al lado.
      if (registro.ilegible === true) { error = FICHERO_ILEGIBLE; cambio(); return undefined; }
      // Lo ocupado son los AÑADIDOS y los DEFINIDOS: una definición huérfana —dejada por un
      // `quitar` que falló, o escrita a mano en el fichero— también ocupa su sitio, porque
      // volver a crearla la pisa.
      const motivo = motivoDeDefinicionInaceptable(def, [...registro.anadidos, ...Object.keys(registro.definiciones)]);
      // Fuera de `operar`: la frase es NUESTRA y no una ruta, así que no pasa por
      // `motivoDeFallo` — que solo sabe traducir fallos de DISCO.
      if (motivo !== undefined) { error = motivo; cambio(); return undefined; }
      const id = idDeConectorDesdeNombre(def.nombre);
      // La definición ANTES que el alta: si el segundo paso falla, el primero deja una
      // definición que nadie puede alcanzar —y que por eso cuenta como ocupada—, mientras que al
      // revés quedaría un id añadido sin fila, o sea una fila de la lista sin nombre.
      const bien = operar(() => { guardarDefinicion(o.casa, id, def); anadirConector(o.casa, id); });
      // Y solo con la escritura hecha se devuelve el id: quien encadena la autorización no puede
      // abrir un navegador (ni pedir una clave) por un conector que no llegó a estar añadido.
      return bien ? id : undefined;
    },
    anadir(id) {
      // Fuera de `operar`: su frase lleva el id y no una ruta, así que no pasa por
      // `motivoDeFallo` — que solo sabe traducir fallos de DISCO.
      if (resolver(id, leerConectores(o.casa).definiciones) === undefined) {
        error = `«${id}» no es un conector de esta consola`;
        cambio();
        return;
      }
      operar(() => { anadirConector(o.casa, id); });
    },
    // `retirarPendientes` va ANTES de `operar`: su `cambio()` es SÍNCRONO, así que quien lo
    // escuche y lea `lista()` dentro del callback vería `autorizando: true` un instante de
    // más si el pendiente se retirara después — el mismo síntoma que `autorizar` evita al
    // borrar su pendiente antes de avisar de un fallo.
    //
    // De un conector PROPIO se lleva también su definición: sin eso queda su fila en el catálogo
    // —que ahora trae las definiciones— y el id desaparece de `anadidos`, o sea un fantasma en
    // «Disponibles» que nadie puede quitar ni volver a añadir (su nombre está ocupado por una
    // definición invisible). El molde de «dos especialistas, uno sin mantener y en silencio».
    quitar(id) {
      retirarPendientes(id);
      operar(() => {
        quitarConector(o.casa, id);
        olvidarOAuth(o.casa, id);
        if (esConectorPropio(id)) olvidarDefinicion(o.casa, id);
        pruebas.delete(id);
      });
    },
    desconectar(id) { retirarPendientes(id); operar(() => { olvidarOAuth(o.casa, id); pruebas.delete(id); }); },
    guardarClave(id, clave) {
      const c = anadido(id);
      if (c === undefined) return;
      // Una clave guardada para un conector que no la pide es una credencial huérfana: nadie la
      // usaría y no habría botón que la borrara. El carril lo elige la autenticación del conector.
      if (c.autenticacion !== "api-key") { error = `«${c.nombre}» no se autentica con una clave`; cambio(); return; }
      // La criba es la de siempre (`core/config.ts`): rechaza la vacía, una línea `NOMBRE=valor`
      // y cualquier cosa con espacios, porque esto acaba en una cabecera HTTP. Se comprueba ANTES
      // de escribir, y su frase sale de aquí —fuera de `operar`— porque no es un fallo de DISCO.
      const motivo = motivoDeClaveInaceptable(clave);
      if (motivo !== undefined) { error = motivo; cambio(); return; }
      // Se FUSIONA con lo que hubiera en vez de escribir `{clave}`: el `clientInformation` y los
      // tokens de un conector que se autorizó antes no son de esta operación.
      operar(() => { guardarOAuth(o.casa, id, { ...leerOAuth(o.casa, id), clave }); });
    },
    async probar(id) {
      const c = resolver(id, leerConectores(o.casa).definiciones);
      if (c === undefined) { error = `«${id}» no es un conector de esta consola`; cambio(); return; }
      // Con una autorización abierta no se toca la red: un 401 haría que el SDK arrancara
      // OTRA y pisara el verificador PKCE —uno por conector— que el callback va a necesitar.
      if (hayPendienteVivo(id)) { cambio(); return; }
      const guardado = leerOAuth(o.casa, id);
      // Un conector que PIDE autenticación y no tiene con qué NO se prueba contra la red: el SDK,
      // al ver el 401, intentaría registrar un cliente —con un redirect que no es ninguno— y
      // dejaría basura en el fichero. La respuesta ya se sabe sin preguntar, y vale igual para un
      // OAuth sin tokens que para un `api-key` sin clave: es el mismo «falta autorizar».
      const credencial = credencialDe(c, guardado);
      if (credencial === undefined && c.autenticacion !== "ninguna") {
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
        // Sin autenticación la credencial es `undefined` y así se pasa: un `authProvider` haría
        // que el SDK intentara un registro contra un servidor que no lo pide.
        const tools = await Promise.race([o.red.listarTools(c.url, credencial, control.signal), tope]);
        // El mundo pudo cambiar MIENTRAS la red respondía: un `quitar`/`desconectar` disparado
        // después de pulsar «Probar» pero antes de que conteste corre en SÍNCRONO y no espera a
        // esto. Sin repetir aquí la comprobación, este resultado — de una petición que arrancó
        // contra un estado que ya no existe — resucitaría un «Conectado» sobre un conector que
        // se acaba de quitar o desconectar. No se compara el VALOR de los tokens contra
        // `guardado`: el propio SDK puede refrescarlos dentro de `listarTools` y eso sí sigue
        // siendo un éxito legítimo — solo importa que siga añadido y, si hace falta, autorizado.
        const sigueAnadido = leerConectores(o.casa).anadidos.includes(id);
        const sigueAutorizado = c.autenticacion === "ninguna" || credencialDe(c, leerOAuth(o.casa, id)) !== undefined;
        if (sigueAnadido && sigueAutorizado) {
          pruebas.set(id, { cuando: ahora(), ok: true, tools });
          // Un `error` de una operación ANTERIOR no puede quedarse junto a un estado que ya es
          // correcto: «ausente ≠ vacío» también vale para lo que ya no es cierto.
          error = undefined;
        }
      } catch (error) {
        pruebas.set(id, { cuando: ahora(), ok: false, motivo: control.signal.aborted ? "no responde (no contestó a tiempo)" : motivoDe(error) });
      } finally {
        clearTimeout(reloj);
        cambio();
      }
    },
    async autorizar(id, redirectUrl) {
      // `autorizar` resolvía el id SOLO contra el catálogo, nunca contra lo AÑADIDO: si el
      // `anadir` del mismo clic había fallado al escribir —o un `quitar` le ganó la carrera—
      // esto abría un navegador de verdad, completaba un OAuth de verdad y dejaba tokens
      // huérfanos en `conectores-oauth.json` sin ningún «Quitar»/«Desconectar» que los
      // alcanzara (esos botones solo salen para lo que YA está en la lista). Se comprueba lo
      // añadido, y ANTES de tocar la red, no después de escribir tokens.
      const c = anadido(id);
      if (c === undefined) return;
      // La guarda SIMÉTRICA de `guardarClave`: abrir el navegador por un conector que se autentica
      // con una clave registraría un cliente OAuth contra un servidor que no lo pide y dejaría
      // tokens que nadie va a usar ni borrar. El carril lo elige la autenticación del conector, y
      // esto es el fail-closed por si quien enruta se equivoca.
      if (c.autenticacion !== "oauth") { error = `«${c.nombre}» no se autoriza con el navegador`; cambio(); return; }
      // UNA autorización viva por conector: el verificador PKCE se guarda por conector, así
      // que una nueva invalida la anterior. Pulsar «Conectar» otra vez es también cómo se
      // recupera quien cerró la pestaña a medias.
      retirarPendientes(id);
      const state = randomBytes(32).toString("base64url");
      pendientes.set(state, { id, expira: ahora() + TTL_DE_AUTORIZACION_MS, redirectUrl });
      // NO se limpia `error` aquí: en este instante no se sabe todavía si `autorizar` va a ir
      // bien —solo se ha apuntado un pendiente—, y limpiarlo a ciegas borraría el error de UN
      // CLIC ANTERIOR (por ejemplo, el fallo de una operación anterior sobre OTRO conector)
      // antes de que nadie lo viera. Se limpia donde `autorizar` de verdad tiene éxito: la
      // rama `AUTHORIZED` llama a `probar`, que ya limpia el suyo al ir bien; la rama
      // `REDIRECT` no ha decidido nada todavía —quien lo decide es `completar`, que ya limpia
      // el suyo al canjear el código—.
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
      // Se vuelve a leer el registro: entre pedir la autorización y volver del navegador puede
      // haber pasado media hora, y el conector puede haberse quitado —o definido— por el camino.
      const c = resolver(r.id, leerConectores(o.casa).definiciones);
      if (c === undefined) { cambio(); return { ok: false, mensaje: "ese conector ya no existe" }; }
      try {
        await o.red.canjearCodigo(c.url, proveedor(r.id, redirect, ""), r.code);
      } catch (error) {
        pruebas.set(r.id, { cuando: ahora(), ok: false, motivo: motivoDe(error) });
        cambio();
        return { ok: false, mensaje: "no se pudo completar la autorización: vuelve a pulsar Conectar" };
      }
      // Un `quitar()` puede correr MIENTRAS `canjearCodigo` está en vuelo — es el único momento
      // en que esto importa: antes de este `await` todo es síncrono, así que si `quitar` hubiera
      // corrido antes, `retirarPendientes` ya habría hecho que `interpretarCallback` fallara
      // arriba. Si ganó la carrera AQUÍ, el SDK ya escribió tokens frescos (su `saveTokens`,
      // dentro de `canjearCodigo`) para un conector que ya NO está añadido — se olvidan otra
      // vez, sin dejarlos huérfanos, y no se corre `probar` sobre algo que ya no está.
      if (!leerConectores(o.casa).anadidos.includes(r.id)) {
        try { olvidarOAuth(o.casa, r.id); } catch { /* si esto también falla no hay más que deshacer */ }
        cambio();
        return { ok: false, mensaje: `«${c.nombre}» ya no está añadido` };
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

/** Lo mínimo que `listarTools` usa del `Client` del SDK, para que la costura pueda doblarlo. */
export type ClienteDeMcp = Pick<Client, "connect" | "close" | "listTools">;

/** El transporte de un carril: lo que `Client.connect` acepta. */
export type TransporteDeMcp = Parameters<Client["connect"]>[0];

/** Lo que este código le pasa a los DOS transportes: los dos tipos del SDK lo aceptan. */
export type OpcionesDeTransporte = { authProvider?: OAuthClientProvider; requestInit?: RequestInit };

/**
 * Por dónde habla `listarTools`: el cliente y los dos transportes. Existe por lo que se prueba
 * sin red —el reparto de los dos carriles, o sea CUÁL de los dos errores sale—, que es justo lo
 * que desde fuera de esta función no se ve. Por omisión, las piezas de verdad.
 */
export interface CosturaDeRedDeConectores {
  crearCliente(): ClienteDeMcp;
  /** En orden: streamable-http (el protocolo de todos los medidos) y SSE (para uno viejo). */
  primario(url: URL, opciones: OpcionesDeTransporte): TransporteDeMcp;
  respaldo(url: URL, opciones: OpcionesDeTransporte): TransporteDeMcp;
}

const COSTURA_REAL: CosturaDeRedDeConectores = {
  crearCliente: () => new Client({ name: "xonecode", version: "0" }),
  primario: (url, opciones) => new StreamableHTTPClientTransport(url, opciones),
  respaldo: (url, opciones) => new SSEClientTransport(url, opciones),
};

export function redDeConectoresReal(costura: CosturaDeRedDeConectores = COSTURA_REAL): RedDeConectores {
  return {
    async listarTools(url, credencial, senal) {
      // Los dos carriles de credencial, cada uno por SU palanca del SDK: `authProvider` para
      // OAuth (es quien refresca tokens y firma la petición) y una cabecera para una clave. No
      // hay un tercer camino, y la unión es lo que impide pasar los dos a la vez.
      const cabeceras = credencial !== undefined && "cabecera" in credencial ? { Authorization: credencial.cabecera } : undefined;
      const opciones = {
        ...(credencial !== undefined && "proveedor" in credencial ? { authProvider: credencial.proveedor } : {}),
        requestInit: { signal: senal, ...(cabeceras === undefined ? {} : { headers: cabeceras }) },
      };
      // Un `Client` NUEVO para el intento por SSE, como el ejemplo de compatibilidad del
      // propio SDK: el que falló al conectar no se reutiliza. Los tres medidos hablan
      // streamable-http; el SSE queda para un servidor viejo.
      let cliente = costura.crearCliente();
      try {
        await cliente.connect(costura.primario(new URL(url), opciones), { signal: senal });
      } catch (error) {
        if (error instanceof UnauthorizedError || senal.aborted) throw error;
        await cliente.close().catch(() => {});
        cliente = costura.crearCliente();
        try {
          await cliente.connect(costura.respaldo(new URL(url), opciones), { signal: senal });
        } catch {
          // El motivo lo trae el PRIMARIO, así que el del respaldo se DESCARTA. Medido: un 401
          // de streamable-http llega como un `Error` con `code: 401` —y `motivoDe` lo convierte
          // en «no responde (HTTP 401)»—, mientras que un fallo de red por el carril del SSE es
          // un `Error` pelado sin código. Relanzando el del respaldo, una clave mala se leía
          // exactamente igual que un host que no resuelve: «no responde», sin el código. Que el
          // respaldo también falle NO quiere decir que el diagnóstico del primario fuera el
          // equivocado: quiere decir que este servidor no habla ninguno de los dos protocolos,
          // y lo que hay que enseñar es por qué falló el que sí era el suyo.
          throw error;
        }
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
