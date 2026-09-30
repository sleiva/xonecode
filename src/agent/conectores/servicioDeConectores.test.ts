import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { UnauthorizedError, type OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import { InvalidGrantError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { TOPE_DE_CONEXION_MS, TOPE_DE_LLAMADA_MS } from "../../core/conectores.js";
import { guardarOAuth, leerConectores, leerOAuth, rutaDeAnadidos, rutaDeOAuth } from "./conectoresEnDisco.js";
import { ProveedorDeConector } from "./proveedorDeConector.js";
import {
  crearServicioDeConectores, ErrorDeTool, redDeConectoresReal, servicioDeConectoresCableado,
  type ClienteDeMcp, type CosturaDeRedDeConectores, type RedDeConectores, type ServicioDeConectores, type TransporteDeMcp,
} from "./servicioDeConectores.js";

let casa: string;
let reloj: number;
const ahora = () => reloj;

function redDoble(): RedDeConectores {
  return {
    listarTools: vi.fn<RedDeConectores["listarTools"]>(async () => []),
    llamarTool: vi.fn<RedDeConectores["llamarTool"]>(async () => ""),
    iniciarAutorizacion: vi.fn<RedDeConectores["iniciarAutorizacion"]>(async () => "REDIRECT"),
    canjearCodigo: vi.fn<RedDeConectores["canjearCodigo"]>(async () => {}),
    abrir: vi.fn<RedDeConectores["abrir"]>(() => {}),
  };
}

function crear(red: RedDeConectores, alCambiar?: () => void): ServicioDeConectores {
  return crearServicioDeConectores({ casa, red, ahora, ...(alCambiar ? { alCambiar } : {}) });
}

beforeEach(() => {
  casa = mkdtempSync(join(tmpdir(), "servicio-conectores-"));
  reloj = 1_000_000;
});

describe("lista, anadir, quitar", () => {
  it("anadir deja el conector sin autorización (deepwiki no la pide)", () => {
    const s = crear(redDoble());
    s.anadir("deepwiki");
    expect(s.lista().conectores).toEqual([{ id: "deepwiki", estado: "sin-autorizacion" }]);
  });

  it("un id fuera del catálogo deja su frase en error, y una operación que va bien la limpia", () => {
    const s = crear(redDoble());
    s.anadir("linear");
    expect(s.lista().error).toContain("linear");
    s.anadir("deepwiki");
    expect(s.lista().error).toBeUndefined();
  });

  it("un fichero ilegible deja su frase en error SIN la ruta de la máquina (ninguna ruta viaja por el cable)", () => {
    mkdirSync(join(casa, ".xonecode"), { recursive: true });
    writeFileSync(rutaDeAnadidos(casa), "{roto");
    const s = crear(redDoble());
    s.anadir("jira");
    const l = s.lista();
    expect(l.error).toBeDefined();
    expect(l.error).not.toContain(casa);
    expect(JSON.stringify(l)).not.toContain(casa);
  });

  it("quitar saca el conector de la lista y olvida su OAuth", () => {
    const s = crear(redDoble());
    s.anadir("notion");
    guardarOAuth(casa, "notion", { tokens: { access_token: "a", token_type: "Bearer" } });
    s.quitar("notion");
    expect(s.lista().conectores).toEqual([]);
    expect(leerOAuth(casa, "notion")).toEqual({});
  });

  it("desconectar olvida tokens pero NO quita el conector de la lista", () => {
    const s = crear(redDoble());
    s.anadir("notion");
    guardarOAuth(casa, "notion", { tokens: { access_token: "a", token_type: "Bearer" }, redirectUri: "http://127.0.0.1:4200/mcp/oauth/callback" });
    s.desconectar("notion");
    expect(s.lista().conectores).toEqual([{ id: "notion", estado: "falta-autorizar" }]);
  });
});

describe("probar", () => {
  it("ok con las tools que devuelve la red", async () => {
    const red = redDoble();
    (red.listarTools as ReturnType<typeof vi.fn>).mockResolvedValue([{ nombre: "ask_wiki_question" }]);
    const s = crear(red);
    s.anadir("deepwiki");
    await s.probar("deepwiki");
    const prueba = s.lista().conectores[0]?.prueba;
    expect(prueba).toMatchObject({ ok: true, tools: [{ nombre: "ask_wiki_question" }] });
  });

  it("un fallo con code numérico da el motivo con el código HTTP, sin el mensaje remoto", async () => {
    const red = redDoble();
    (red.listarTools as ReturnType<typeof vi.fn>).mockRejectedValue(Object.assign(new Error("https://secreto?token=x"), { code: 503 }));
    const s = crear(red);
    s.anadir("deepwiki");
    await s.probar("deepwiki");
    const l = s.lista();
    expect(l.conectores[0]?.prueba).toMatchObject({ ok: false, motivo: "no responde (HTTP 503)" });
    expect(JSON.stringify(l)).not.toContain("secreto");
  });

  it("jira sin tokens: falta autorizar, y listarTools NO se llama", async () => {
    const red = redDoble();
    const s = crear(red);
    s.anadir("jira");
    await s.probar("jira");
    expect(s.lista().conectores[0]?.prueba).toMatchObject({ ok: false, motivo: "falta autorizar" });
    expect(red.listarTools).not.toHaveBeenCalled();
  });

  it("un UnauthorizedError del SDK da 'falta autorizar' y el proveedor lleva el redirect guardado", async () => {
    const redirectUri = "http://127.0.0.1:4200/mcp/oauth/callback";
    guardarOAuth(casa, "jira", { tokens: { access_token: "a", token_type: "Bearer" }, redirectUri });
    const red = redDoble();
    (red.listarTools as ReturnType<typeof vi.fn>).mockRejectedValue(new UnauthorizedError());
    const s = crear(red);
    s.anadir("jira");
    await s.probar("jira");
    expect(s.lista().conectores[0]?.prueba).toMatchObject({ ok: false, motivo: "falta autorizar" });
    // El puerto recibe la UNIÓN, no el proveedor pelado: quien habla con el servidor tiene que
    // elegir un carril, y el de un OAuth es su `authProvider`.
    const credencial = (red.listarTools as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as { proveedor: ProveedorDeConector };
    expect(credencial.proveedor.redirectUrl).toBe(redirectUri);
  });

  it("un OAuthError REAL del SDK (una credencial que el propio reintento de auth() ya no pudo salvar) también da 'falta autorizar'", async () => {
    // El SDK, dentro de `auth()`, ya invalida los tokens y reintenta UNA vez él solo cuando ve
    // uno de estos tres errores — si `InvalidGrantError` llega hasta AQUÍ es porque ese
    // reintento interno también topó con una credencial mala. Sin el `instanceof OAuthError` de
    // `motivoDe`, esto se leía «no responde»: la clase no lleva `code` numérico ni string.
    const redirectUri = "http://127.0.0.1:4200/mcp/oauth/callback";
    guardarOAuth(casa, "jira", { tokens: { access_token: "a", token_type: "Bearer" }, redirectUri });
    const red = redDoble();
    (red.listarTools as ReturnType<typeof vi.fn>).mockRejectedValue(new InvalidGrantError("refresh token revocado"));
    const s = crear(red);
    s.anadir("jira");
    await s.probar("jira");
    expect(s.lista().conectores[0]?.prueba).toMatchObject({ ok: false, motivo: "falta autorizar" });
  });

  it("un Error de red sin OAuthError ni 'code' sigue dando 'no responde'", async () => {
    const red = redDoble();
    (red.listarTools as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("ECONNREFUSED"));
    const s = crear(red);
    s.anadir("deepwiki");
    await s.probar("deepwiki");
    expect(s.lista().conectores[0]?.prueba).toMatchObject({ ok: false, motivo: "no responde" });
  });

  it("un tope que no contesta a tiempo aborta la señal y da su propio motivo", async () => {
    vi.useFakeTimers();
    try {
      const red = redDoble();
      (red.listarTools as ReturnType<typeof vi.fn>).mockImplementation(
        (_url, _proveedor, senal) => new Promise(() => { /* nunca resuelve */ void senal; }),
      );
      const s = crear(red);
      s.anadir("deepwiki");
      const p = s.probar("deepwiki");
      await vi.advanceTimersByTimeAsync(TOPE_DE_CONEXION_MS);
      await p;
      expect(s.lista().conectores[0]?.prueba).toMatchObject({ ok: false, motivo: "no responde (no contestó a tiempo)" });
      const senalRecibida = (red.listarTools as ReturnType<typeof vi.fn>).mock.calls[0]?.[2] as AbortSignal;
      expect(senalRecibida.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("con un pendiente vivo del mismo conector, probar NO toca la red (no pisa el verificador PKCE)", async () => {
    // Con tokens guardados, para que la única razón de NO llamar a la red sea el pendiente
    // vivo y no la guarda de «sin tokens» — si se retira la guarda del pendiente, este test
    // seguiría en verde por la otra guarda, y no probaría nada.
    guardarOAuth(casa, "notion", { tokens: { access_token: "a", token_type: "Bearer" }, redirectUri: "http://127.0.0.1:4200/mcp/oauth/callback" });
    const red = redDoble();
    const s = crear(red);
    s.anadir("notion");
    void s.autorizar("notion", "http://127.0.0.1:4200/mcp/oauth/callback");
    await s.probar("notion");
    expect(red.listarTools).not.toHaveBeenCalled();
    // Deja la foto como está: ni la borra ni inventa una.
    expect(s.lista().conectores[0]?.prueba).toBeUndefined();
  });

  it("un desconectar que corre MIENTRAS la red responde no deja que probar resucite «Conectado»", async () => {
    const redirectUri = "http://127.0.0.1:4200/mcp/oauth/callback";
    guardarOAuth(casa, "notion", { tokens: { access_token: "a", token_type: "Bearer" }, redirectUri });
    const red = redDoble();
    // Un doble cuya resolución controlamos a mano, como el tope: aquí en vez de dejar que el
    // tiempo avance, es `desconectar` quien decide cuándo dispara — ANTES de resolver la red.
    let resolver: ((tools: unknown) => void) | undefined;
    (red.listarTools as ReturnType<typeof vi.fn>).mockImplementation(
      () => new Promise((resolve) => { resolver = resolve; }),
    );
    const s = crear(red);
    s.anadir("notion");

    const p = s.probar("notion");
    // `listarTools` ya se invocó en el tramo síncrono de `probar` (antes de su primer
    // `await`), así que `resolver` ya está asignado aquí.
    s.desconectar("notion");
    resolver?.([{ nombre: "search" }]);
    await p;

    // Sin el arreglo, este `probar` en vuelo escribe `{ok:true}` DESPUÉS de que `desconectar`
    // borrara los tokens, y la fila vuelve a leerse «Conectado» aunque se acaba de desconectar.
    expect(s.lista().conectores[0]).toMatchObject({ id: "notion", estado: "falta-autorizar" });
    expect(s.lista().conectores[0]?.prueba).toBeUndefined();
  });

  it("quitar retira el pendiente: el callback ya no encuentra nada que canjear", async () => {
    const red = redDoble();
    const s = crear(red);
    s.anadir("notion");
    await s.autorizar("notion", "http://127.0.0.1:4200/mcp/oauth/callback");
    const proveedor = (red.iniciarAutorizacion as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as ProveedorDeConector;
    const state = proveedor.state();

    s.quitar("notion");
    const resultado = await s.completar(new URLSearchParams(`code=c&state=${state}`));

    expect(resultado.ok).toBe(false);
    expect(red.canjearCodigo).not.toHaveBeenCalled();
    expect(leerOAuth(casa, "notion")).toEqual({});
  });

  it("desconectar retira el pendiente: no se queda 'autorizando' ni bloquea probar", async () => {
    const red = redDoble();
    const s = crear(red);
    s.anadir("notion");
    await s.autorizar("notion", "http://127.0.0.1:4200/mcp/oauth/callback");
    expect(s.lista().conectores[0]).toMatchObject({ autorizando: true });

    s.desconectar("notion");
    expect(s.lista().conectores[0]).not.toHaveProperty("autorizando");

    guardarOAuth(casa, "notion", { tokens: { access_token: "b", token_type: "Bearer" }, redirectUri: "http://127.0.0.1:4200/mcp/oauth/callback" });
    await s.probar("notion");
    expect(red.listarTools).toHaveBeenCalled();
  });

  it("desconectar retira el pendiente ANTES de avisar: quien lee lista() dentro de alCambiar ya no ve autorizando", async () => {
    const red = redDoble();
    let vistoAlAvisar: boolean | undefined;
    const s = crearServicioDeConectores({
      casa, red, ahora,
      // Se lee `lista()` SÍNCRONAMENTE dentro del propio callback, como haría un servidor que
      // reemite el estado en cuanto se le avisa de un cambio.
      alCambiar: () => { vistoAlAvisar = s.lista().conectores[0]?.autorizando; },
    });
    s.anadir("notion");
    await s.autorizar("notion", "http://127.0.0.1:4200/mcp/oauth/callback");
    expect(s.lista().conectores[0]).toMatchObject({ autorizando: true });

    s.desconectar("notion");

    expect(vistoAlAvisar).not.toBe(true);
  });

  it("quitar retira el pendiente ANTES de avisar: un canje iniciado DENTRO de alCambiar ya no lo encuentra", async () => {
    // `quitar` saca el conector de `lista()` en cuanto su escritura en disco va bien —eso pasa
    // ANTES de `cambio()` en los dos órdenes posibles—, así que leer `lista()` dentro del aviso
    // no distingue el orden. Lo que sí lo distingue es invocar `completar` DENTRO del aviso:
    // `interpretarCallback` consulta el `Map` de pendientes de forma SÍNCRONA, en el tramo de
    // la función async que corre antes de su primer `await` — así que atrapa el estado exacto
    // que había en el instante de `cambio()`.
    const red = redDoble();
    let state = "";
    let dispararEnQuitar = false;
    let resultadoDesdeElAviso: Promise<{ ok: boolean; mensaje: string }> | undefined;
    const s = crearServicioDeConectores({
      casa, red, ahora,
      alCambiar: () => {
        if (dispararEnQuitar) resultadoDesdeElAviso = s.completar(new URLSearchParams(`code=c&state=${state}`));
      },
    });
    s.anadir("notion");
    await s.autorizar("notion", "http://127.0.0.1:4200/mcp/oauth/callback");
    const proveedor = (red.iniciarAutorizacion as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as ProveedorDeConector;
    state = proveedor.state();

    dispararEnQuitar = true;
    s.quitar("notion");

    expect(resultadoDesdeElAviso).toBeDefined();
    await expect(resultadoDesdeElAviso).resolves.toMatchObject({ ok: false });
    expect(red.canjearCodigo).not.toHaveBeenCalled();
  });
});

describe("autorizar y completar", () => {
  it("autorizar abre por red.abrir, nunca por un valor devuelto, y marca autorizando", async () => {
    const red = redDoble();
    (red.iniciarAutorizacion as ReturnType<typeof vi.fn>).mockImplementation(async (_url, proveedor: OAuthClientProvider) => {
      proveedor.redirectToAuthorization(new URL("https://mcp.notion.com/authorize?x"));
      return "REDIRECT";
    });
    const s = crear(red);
    s.anadir("notion");
    const resultado = await s.autorizar("notion", "http://127.0.0.1:4200/mcp/oauth/callback");
    expect(resultado).toBeUndefined();
    expect(red.abrir).toHaveBeenCalledWith(new URL("https://mcp.notion.com/authorize?x"));
    expect(s.lista().conectores[0]).toMatchObject({ autorizando: true });
  });

  it("completar canjea el código, prueba y limpia autorizando", async () => {
    const redirectUri = "http://127.0.0.1:4200/mcp/oauth/callback";
    const red = redDoble();
    (red.iniciarAutorizacion as ReturnType<typeof vi.fn>).mockResolvedValue("REDIRECT");
    (red.canjearCodigo as ReturnType<typeof vi.fn>).mockImplementation(async (_url, proveedor: OAuthClientProvider, code) => {
      expect(code).toBe("c");
      await proveedor.saveClientInformation?.({ client_id: "cliente-1" });
      await proveedor.saveTokens({ access_token: "a", token_type: "Bearer" });
    });
    (red.listarTools as ReturnType<typeof vi.fn>).mockResolvedValue([{ nombre: "search" }]);
    const s = crear(red);
    s.anadir("notion");
    await s.autorizar("notion", redirectUri);
    const proveedorDeAutorizar = (red.iniciarAutorizacion as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as ProveedorDeConector;
    const state = proveedorDeAutorizar.state();

    const resultado = await s.completar(new URLSearchParams(`code=c&state=${state}`));

    expect(red.canjearCodigo).toHaveBeenCalled();
    expect(red.listarTools).toHaveBeenCalled();
    expect(resultado).toEqual({ ok: true, mensaje: "Notion conectado" });
    const l = s.lista();
    expect(l.conectores[0]).not.toHaveProperty("autorizando");
    expect(l.conectores[0]?.prueba).toMatchObject({ ok: true });
  });

  it("completar con un state desconocido no canjea nada", async () => {
    const red = redDoble();
    const s = crear(red);
    s.anadir("notion");
    const resultado = await s.completar(new URLSearchParams("code=c&state=lo-que-sea"));
    expect(resultado.ok).toBe(false);
    expect(red.canjearCodigo).not.toHaveBeenCalled();
  });

  it("un autorizar que falla no lanza, borra el pendiente y deja prueba fallida", async () => {
    const red = redDoble();
    (red.iniciarAutorizacion as ReturnType<typeof vi.fn>).mockRejectedValue(Object.assign(new Error("no se pudo"), { code: 500 }));
    const s = crear(red);
    s.anadir("notion");
    await expect(s.autorizar("notion", "http://127.0.0.1:4200/mcp/oauth/callback")).resolves.toBeUndefined();
    const l = s.lista();
    expect(l.conectores[0]).not.toHaveProperty("autorizando");
    expect(l.conectores[0]?.prueba).toMatchObject({ ok: false });
  });

  it("un InvalidGrantError REAL del SDK que llega hasta autorizar (el reintento interno de auth() también falló) deja 'falta autorizar', no 'no responde'", async () => {
    const red = redDoble();
    (red.iniciarAutorizacion as ReturnType<typeof vi.fn>).mockRejectedValue(new InvalidGrantError("x"));
    const s = crear(red);
    s.anadir("notion");
    await expect(s.autorizar("notion", "http://127.0.0.1:4200/mcp/oauth/callback")).resolves.toBeUndefined();
    expect(s.lista().conectores[0]?.prueba).toMatchObject({ ok: false, motivo: "falta autorizar" });
  });

  it("un anadir que falla seguido de autorizar para el MISMO id no lo autoriza: «Añadir» en OAuth manda las dos seguidas, y jira nunca llegó a estar añadida", async () => {
    // El escenario real: «Añadir» sobre un OAuth manda `anadir` y `autorizar` en el MISMO
    // clic. Si `anadir` falla al escribir en disco, jira nunca llega a `anadidos` — así que
    // `autorizar` tiene que RECHAZARLA, sin abrir ningún navegador ni tocar la red, y no solo
    // dejar el error del `anadir` sin tocar.
    mkdirSync(join(casa, ".xonecode"), { recursive: true });
    writeFileSync(rutaDeAnadidos(casa), "{roto");
    const red = redDoble();
    // Sin esto `abrir` nunca se llamaría ni con el fallo arreglado: el doble por omisión no
    // redirige a ningún sitio, así que la aserción de `abrir` sería cierta por casualidad.
    (red.iniciarAutorizacion as ReturnType<typeof vi.fn>).mockImplementation(async (_url, proveedor: OAuthClientProvider) => {
      proveedor.redirectToAuthorization(new URL("https://mcp.jira.com/authorize?x"));
      return "REDIRECT";
    });
    const s = crear(red);

    s.anadir("jira");
    const errorDelAnadir = s.lista().error;
    expect(errorDelAnadir).toBeDefined();

    await s.autorizar("jira", "http://127.0.0.1:4200/mcp/oauth/callback");

    // El fichero sigue ilegible: es la MISMA causa que ya dejó `anadir`, así que el motivo no
    // cambia — pero ahora la razón es que `autorizar` también la vio y se negó por su cuenta.
    expect(s.lista().error).toBe(errorDelAnadir);
    expect(red.iniciarAutorizacion).not.toHaveBeenCalled();
    expect(red.abrir).not.toHaveBeenCalled();
  });

  it("un quitar sobre un conector ya añadido también deja a autorizar sin red: no es solo el camino de un anadir fallido", async () => {
    const red = redDoble();
    (red.iniciarAutorizacion as ReturnType<typeof vi.fn>).mockImplementation(async (_url, proveedor: OAuthClientProvider) => {
      proveedor.redirectToAuthorization(new URL("https://mcp.jira.com/authorize?x"));
      return "REDIRECT";
    });
    const s = crear(red);
    s.anadir("jira");
    expect(s.lista().conectores).toHaveLength(1);

    s.quitar("jira");
    await s.autorizar("jira", "http://127.0.0.1:4200/mcp/oauth/callback");

    expect(s.lista().error).toBe("«jira» no está añadido");
    expect(red.iniciarAutorizacion).not.toHaveBeenCalled();
    expect(red.abrir).not.toHaveBeenCalled();
  });

  it("un quitar que gana la carrera AL CANJE deja a completar sin autorizar, y olvida los tokens que el SDK acababa de escribir", async () => {
    const redirectUri = "http://127.0.0.1:4200/mcp/oauth/callback";
    const red = redDoble();
    (red.iniciarAutorizacion as ReturnType<typeof vi.fn>).mockResolvedValue("REDIRECT");
    const s = crear(red);
    s.anadir("notion");
    await s.autorizar("notion", redirectUri);
    const proveedorDeAutorizar = (red.iniciarAutorizacion as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as ProveedorDeConector;
    const state = proveedorDeAutorizar.state();

    (red.canjearCodigo as ReturnType<typeof vi.fn>).mockImplementation(async (_url, proveedor: OAuthClientProvider, code) => {
      expect(code).toBe("c");
      // `quitar` corre MIENTRAS este canje está en vuelo, antes de que `completar` pueda volver
      // a comprobar si el conector sigue añadido — es la única ventana donde la carrera importa
      // (antes de este `await` todo es síncrono, y `quitar` ya retira el pendiente).
      s.quitar("notion");
      await proveedor.saveTokens({ access_token: "a", token_type: "Bearer" });
    });

    const resultado = await s.completar(new URLSearchParams(`code=c&state=${state}`));

    expect(resultado.ok).toBe(false);
    // Sin el arreglo, el SDK deja aquí un token huérfano: `quitar` ya se ejecutó y no hay
    // ningún «Quitar»/«Desconectar» en pantalla que alcance a un conector fuera de la lista.
    expect(leerOAuth(casa, "notion")).toEqual({});
  });

  it("dos autorizaciones seguidas: solo el state del segundo vale para completar", async () => {
    const red = redDoble();
    (red.iniciarAutorizacion as ReturnType<typeof vi.fn>).mockResolvedValue("REDIRECT");
    const s = crear(red);
    s.anadir("notion");
    await s.autorizar("notion", "http://127.0.0.1:4200/mcp/oauth/callback");
    const proveedor1 = (red.iniciarAutorizacion as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as ProveedorDeConector;
    const state1 = proveedor1.state();

    await s.autorizar("notion", "http://127.0.0.1:4200/mcp/oauth/callback");
    const proveedor2 = (red.iniciarAutorizacion as ReturnType<typeof vi.fn>).mock.calls[1]?.[1] as ProveedorDeConector;
    const state2 = proveedor2.state();

    expect(state1).not.toBe(state2);
    const primerIntento = await s.completar(new URLSearchParams(`code=c&state=${state1}`));
    expect(primerIntento.ok).toBe(false);

    (red.canjearCodigo as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    const segundoIntento = await s.completar(new URLSearchParams(`code=c&state=${state2}`));
    expect(segundoIntento.ok).toBe(true);
  });
});

describe("un `error` de antes se limpia con CUALQUIER operación que va bien, no solo las de escritura", () => {
  it("un probar que va bien limpia el error que dejó un anadir a un id desconocido", async () => {
    const red = redDoble();
    (red.listarTools as ReturnType<typeof vi.fn>).mockResolvedValue([{ nombre: "ask_wiki_question" }]);
    const s = crear(red);
    s.anadir("deepwiki");
    // El error se deja DESPUÉS de un `anadir` que sí fue bien (que también limpia el suyo): si
    // no fuera así, este test pasaría aunque `probar` nunca tocara `error`.
    s.anadir("linear"); // fuera del catálogo: deja su frase en error
    expect(s.lista().error).toContain("linear");

    await s.probar("deepwiki");

    expect(s.lista().error).toBeUndefined();
  });

  it("un completar que va bien limpia el error que dejó un anadir a un id desconocido", async () => {
    const red = redDoble();
    (red.listarTools as ReturnType<typeof vi.fn>).mockResolvedValue([{ nombre: "search" }]);
    const s = crear(red);
    s.anadir("notion");
    await s.autorizar("notion", "http://127.0.0.1:4200/mcp/oauth/callback");
    const proveedor = (red.iniciarAutorizacion as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as ProveedorDeConector;

    // El error se deja DESPUÉS de `autorizar` (que ya devolvió y no toca `error` sin saber si
    // tuvo éxito): si `autorizar` lo limpiara al arrancar, este test pasaría aunque `completar`
    // nunca tocara `error`.
    s.anadir("linear");
    expect(s.lista().error).toContain("linear");

    const resultado = await s.completar(new URLSearchParams(`code=c&state=${proveedor.state()}`));

    expect(resultado.ok).toBe(true);
    expect(s.lista().error).toBeUndefined();
  });
});

describe("el fallo de una operación de disco no lanza hacia fuera", () => {
  it("anadir/quitar contra un fichero de anadidos ilegible dejan su frase en error", () => {
    mkdirSync(join(casa, ".xonecode"), { recursive: true });
    writeFileSync(rutaDeAnadidos(casa), "{roto");
    const s = crear(redDoble());
    expect(() => s.anadir("jira")).not.toThrow();
    expect(s.lista().error).toBeDefined();
    expect(() => s.quitar("jira")).not.toThrow();
  });

  it("desconectar contra un fichero de OAuth ilegible deja su frase en error, sin la ruta de la máquina", () => {
    mkdirSync(join(casa, ".xonecode"), { recursive: true });
    writeFileSync(rutaDeOAuth(casa), "{roto");
    const s = crear(redDoble());
    expect(() => s.desconectar("notion")).not.toThrow();
    const l = s.lista();
    expect(l.error).toBeDefined();
    expect(l.error).not.toContain(casa);
  });
});

describe("un conector escrito a mano", () => {
  const DEF = {
    nombre: "Acme Tools",
    descripcion: "Un servidor propio",
    url: "https://mcp.acme.com/mcp",
    autenticacion: "api-key" as const,
  };
  const ID = "custom:acme-tools";

  it("crear deriva el id del NOMBRE, añade y deja la fila en lista()", () => {
    // El id no entra por parámetro: se deriva del nombre con la misma regla que un proveedor
    // personalizado, y por eso el cliente no puede elegirlo.
    const s = crear(redDoble());
    expect(s.crear(DEF)).toBe(ID);
    expect(s.lista().conectores).toEqual([{ id: ID, estado: "falta-autorizar" }]);
    expect(s.lista().desconocidos).toEqual([]);
    expect(s.lista().error).toBeUndefined();
  });

  it("un conector propio se AÑADE sin más: su definición es lo que lo hace resoluble", () => {
    // Es lo que antes no podía pasar: un id fuera del catálogo caía en `desconocidos`.
    const s = crear(redDoble());
    s.crear({ ...DEF, autenticacion: "ninguna" });
    expect(s.lista().conectores).toEqual([{ id: ID, estado: "sin-autorizacion" }]);
    expect(s.lista().desconocidos).toEqual([]);
  });

  it("un nombre que ya está dado de alta se RECHAZA con su motivo, sin pisar la definición de antes", () => {
    const s = crear(redDoble());
    s.crear(DEF);
    expect(s.crear({ ...DEF, url: "https://otro.example.com/mcp" })).toBeUndefined();
    expect(s.lista().error).toContain("acme-tools");
    // Lo que estaba escrito sigue siendo lo primero: sin esto, el segundo alta dejaría la clave
    // del primero apuntando a otro servidor.
    expect(leerConectores(casa).definiciones[ID]?.url).toBe(DEF.url);
  });

  it("una URL fuera de la regla deja SU motivo en error y no escribe NADA", () => {
    const s = crear(redDoble());
    expect(s.crear({ ...DEF, url: "http://192.168.1.5:3000" })).toBeUndefined();
    expect(s.lista().error).toBeDefined();
    expect(s.lista().conectores).toEqual([]);
    expect(leerConectores(casa).definiciones).toEqual({});
  });

  it("sin poder leer el fichero no se crea a ciegas: la ocupación del nombre es una incógnita", () => {
    mkdirSync(join(casa, ".xonecode"), { recursive: true });
    writeFileSync(rutaDeAnadidos(casa), "{roto");
    const s = crear(redDoble());
    expect(s.crear(DEF)).toBeUndefined();
    expect(s.lista().error).toBeDefined();
    expect(s.lista().error).not.toContain(casa);
  });

  it("sin clave no toca la red: falta autorizar, y listarTools NO se llama", async () => {
    const red = redDoble();
    const s = crear(red);
    s.crear(DEF);
    await s.probar(ID);
    expect(s.lista().conectores[0]?.prueba).toMatchObject({ ok: false, motivo: "falta autorizar" });
    expect(red.listarTools).not.toHaveBeenCalled();
  });

  it("con clave, probar pasa la cabecera `Bearer` al puerto y la fila queda autorizada", async () => {
    const red = redDoble();
    (red.listarTools as ReturnType<typeof vi.fn>).mockResolvedValue([{ nombre: "search" }]);
    const s = crear(red);
    s.crear(DEF);
    s.guardarClave(ID, "sk-abc");
    expect(s.lista().conectores[0]?.estado).toBe("autorizado");

    await s.probar(ID);

    // `Bearer ` lo pone el CÓDIGO: la criba no deja pasar un valor con espacios, así que el
    // prefijo no cabe en lo que pega una persona.
    expect((red.listarTools as ReturnType<typeof vi.fn>).mock.calls[0]?.[1]).toEqual({ cabecera: { nombre: "Authorization", valor: "Bearer sk-abc" } });
    expect(s.lista().conectores[0]?.prueba).toMatchObject({ ok: true });
  });

  it("una clave que no puede viajar en una cabecera deja SU frase, sin repetirla, y no se escribe", () => {
    const s = crear(redDoble());
    s.crear(DEF);
    s.guardarClave(ID, "Bearer sk-abc");
    const l = s.lista();
    expect(l.error).toBe("la clave lleva espacios o caracteres que no pueden viajar en una cabecera HTTP");
    expect(l.conectores[0]?.estado).toBe("falta-autorizar");
    expect(leerOAuth(casa, ID).clave).toBeUndefined();
  });

  it("una clave para un conector que no la pide se RECHAZA: sería una credencial que nadie puede borrar", () => {
    const s = crear(redDoble());
    s.anadir("jira");
    s.guardarClave("jira", "sk-abc");
    expect(s.lista().error).toContain("Jira");
    expect(leerOAuth(casa, "jira").clave).toBeUndefined();
  });

  it("guardarClave de un conector ya quitado no deja una clave huérfana", () => {
    const s = crear(redDoble());
    s.crear(DEF);
    s.quitar(ID);
    s.guardarClave(ID, "sk-abc");
    expect(leerOAuth(casa, ID)).toEqual({});
  });

  it("quitar se lleva la definición Y la clave, y deja el nombre libre otra vez", () => {
    const s = crear(redDoble());
    s.crear(DEF);
    s.guardarClave(ID, "sk-abc");
    s.quitar(ID);
    expect(s.lista().conectores).toEqual([]);
    expect(leerConectores(casa).definiciones).toEqual({});
    expect(leerOAuth(casa, ID)).toEqual({});
    // El fantasma de «Disponibles» sería justo esto: sin la definición borrada, el nombre
    // seguiría ocupado y esta segunda alta se rechazaría.
    expect(s.crear(DEF)).toBe(ID);
  });

  it("desconectar olvida la clave pero NO quita el conector de la lista", () => {
    const s = crear(redDoble());
    s.crear(DEF);
    s.guardarClave(ID, "sk-abc");
    s.desconectar(ID);
    expect(s.lista().conectores).toEqual([{ id: ID, estado: "falta-autorizar" }]);
    expect(leerOAuth(casa, ID).clave).toBeUndefined();
  });

  it("un conector propio con OAuth completa el viaje: el callback resuelve la URL desde la DEFINICIÓN", async () => {
    // El `throw` de antes (`catalogado`) habría estallado justo aquí: dentro de la ruta PÚBLICA
    // del callback, después de que ya hubiera contestado.
    const red = redDoble();
    (red.iniciarAutorizacion as ReturnType<typeof vi.fn>).mockResolvedValue("REDIRECT");
    (red.canjearCodigo as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (red.listarTools as ReturnType<typeof vi.fn>).mockResolvedValue([{ nombre: "search" }]);
    const s = crear(red);
    s.crear({ ...DEF, autenticacion: "oauth" });
    await s.autorizar(ID, "http://127.0.0.1:4200/mcp/oauth/callback");
    const proveedor = (red.iniciarAutorizacion as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as ProveedorDeConector;

    const resultado = await s.completar(new URLSearchParams(`code=c&state=${proveedor.state()}`));

    expect(resultado).toEqual({ ok: true, mensaje: "Acme Tools conectado" });
    expect((red.iniciarAutorizacion as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toBe(DEF.url);
  });

  it("la clave no viaja en la lista", () => {
    const s = crear(redDoble());
    s.crear(DEF);
    s.guardarClave(ID, "sk-secreta");
    expect(JSON.stringify(s.lista())).not.toContain("sk-secreta");
  });
});

describe("alCambiar", () => {
  it("se llama tras cada operación que cambia lista()", async () => {
    const alCambiar = vi.fn();
    const s = crear(redDoble(), alCambiar);
    s.anadir("deepwiki");
    expect(alCambiar).toHaveBeenCalled();
    alCambiar.mockClear();
    await s.probar("deepwiki");
    expect(alCambiar).toHaveBeenCalled();
  });
});

describe("servicioDeConectoresCableado", () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it("monta las nueve operaciones y lista() lee del casa sin tocar la red", () => {
    const s = servicioDeConectoresCableado({ casa });
    expect(typeof s.lista).toBe("function");
    expect(typeof s.crear).toBe("function");
    expect(typeof s.anadir).toBe("function");
    expect(typeof s.quitar).toBe("function");
    expect(typeof s.probar).toBe("function");
    expect(typeof s.llamar).toBe("function");
    expect(typeof s.autorizar).toBe("function");
    expect(typeof s.guardarClave).toBe("function");
    expect(typeof s.completar).toBe("function");
    expect(typeof s.desconectar).toBe("function");
    s.anadir("deepwiki");
    expect(s.lista().conectores).toEqual([{ id: "deepwiki", estado: "sin-autorizacion" }]);
  });
});

describe("los dos carriles de conexión, sin red", () => {
  /**
   * Lo que hay DETRÁS de `redDeConectoresReal`, doblado por su costura: un cliente que falla al
   * conectar por el transporte que se le diga, y dos transportes que no son más que una MARCA
   * —aquí lo que hay que distinguir es cuál de los dos se pidió, no qué protocolo habla—.
   *
   * Es la costura que hace que esto sea un test y no una promesa: el reparto de los dos carriles
   * vivía dentro del cierre de `listarTools`, que es justo lo que todos los tests de aquí doblan,
   * así que la regla estaba escrita y no probada.
   */
  function redConTransportesDobles(errores: { primario?: unknown; respaldo?: unknown } = {}) {
    const primario = { carril: "primario" } as unknown as TransporteDeMcp;
    const respaldo = { carril: "respaldo" } as unknown as TransporteDeMcp;
    const porTransporte = new Map<unknown, unknown>();
    if (errores.primario !== undefined) porTransporte.set(primario, errores.primario);
    if (errores.respaldo !== undefined) porTransporte.set(respaldo, errores.respaldo);
    const pedirRespaldo = vi.fn(() => respaldo);
    const costura: CosturaDeRedDeConectores = {
      crearCliente: () => ({
        connect: (async (transporte: unknown) => {
          const error = porTransporte.get(transporte);
          if (error !== undefined) throw error;
        }) as ClienteDeMcp["connect"],
        close: async () => {},
        listTools: (async () => ({ tools: [] })) as unknown as ClienteDeMcp["listTools"],
        callTool: (async () => ({ content: [] })) as unknown as ClienteDeMcp["callTool"],
      }),
      primario: () => primario,
      respaldo: pedirRespaldo,
    };
    return { red: redDeConectoresReal(costura), pedirRespaldo };
  }

  it("una clave mala se lee «la clave no vale (HTTP 401)», y no como un servidor que no existe", async () => {
    // Medido: un 401 de streamable-http llega como un `Error` con `code: 401`, y un fallo de red
    // por el carril del SSE es un `Error` pelado sin código. Relanzando el del respaldo, los dos
    // casos acababan en el mismo «no responde» y no había forma de saber que la clave era mala.
    const { red } = redConTransportesDobles({
      primario: Object.assign(new Error("Streamable HTTP error: Error POSTing to endpoint"), { code: 401 }),
      respaldo: new Error("fetch failed"),
    });
    const s = crearServicioDeConectores({ casa, red, ahora });
    s.crear({ nombre: "Acme Tools", descripcion: "Un servidor propio", url: "https://mcp.acme.com/mcp", autenticacion: "api-key" });
    s.guardarClave("custom:acme-tools", "sk-mala");

    await s.probar("custom:acme-tools");

    expect(s.lista().conectores[0]?.prueba).toMatchObject({ ok: false, motivo: "falta autorizar (la clave no vale: HTTP 401)" });
  });

  it("un primario que falla sin código y un respaldo que conecta: la conexión sale por el respaldo", async () => {
    const { red, pedirRespaldo } = redConTransportesDobles({ primario: new Error("no lo habla") });
    await expect(red.listarTools("https://mcp.acme.com/mcp", undefined, new AbortController().signal)).resolves.toEqual([]);
    expect(pedirRespaldo).toHaveBeenCalled();
  });

  it("un primario que conecta no pide el respaldo", async () => {
    const { red, pedirRespaldo } = redConTransportesDobles();
    await expect(red.listarTools("https://mcp.acme.com/mcp", undefined, new AbortController().signal)).resolves.toEqual([]);
    expect(pedirRespaldo).not.toHaveBeenCalled();
  });

  it("un UnauthorizedError del primario NO pide el respaldo: ese es el carril de OAuth, no un servidor viejo", async () => {
    const { red, pedirRespaldo } = redConTransportesDobles({ primario: new UnauthorizedError() });
    await expect(red.listarTools("https://mcp.acme.com/mcp", undefined, new AbortController().signal))
      .rejects.toBeInstanceOf(UnauthorizedError);
    expect(pedirRespaldo).not.toHaveBeenCalled();
  });
});

describe("llamarTool contra un McpServer real en memoria (Task 3)", () => {
  /**
   * Un `McpServer` de verdad, con dos tools —`eco` (devuelve sus argumentos) y `rota` (contesta
   * `isError: true`)— conectado a un extremo de un par `InMemoryTransport`. El otro extremo se
   * inyecta por la costura como `primario`, sin tocar la red: es lo que hace que la conexión
   * factorizada (`conectar`) y el recorte del resultado se prueben contra la librería real y no
   * contra una promesa de lo que un servidor contesta.
   */
  async function servidorDeEcoConectado(): Promise<TransporteDeMcp> {
    const servidor = new McpServer({ name: "servidor-de-pruebas", version: "0" });
    servidor.registerTool("eco", { inputSchema: z.looseObject({}) }, async (args) => ({
      content: [{ type: "text" as const, text: JSON.stringify(args) }],
    }));
    servidor.registerTool("rota", {}, async () => ({
      content: [{ type: "text" as const, text: "x".repeat(400) }],
      isError: true,
    }));
    const [transporteCliente, transporteServidor] = InMemoryTransport.createLinkedPair();
    await servidor.connect(transporteServidor);
    return transporteCliente as unknown as TransporteDeMcp;
  }

  const RESPALDO_INESPERADO = () => { throw new Error("no debería usarse: el primario iba a conectar"); };

  it("devuelve el texto del bloque type:text que da la tool", async () => {
    const transporteCliente = await servidorDeEcoConectado();
    const costura: CosturaDeRedDeConectores = {
      crearCliente: () => new Client({ name: "xonecode-test", version: "0" }),
      primario: () => transporteCliente,
      respaldo: RESPALDO_INESPERADO,
    };
    const red = redDeConectoresReal(costura);

    const texto = await red.llamarTool("https://mcp.test/mcp", undefined, "eco", { q: "x", n: 1 }, new AbortController().signal);

    expect(JSON.parse(texto)).toEqual({ q: "x", n: 1 });
  });

  it("isError:true lanza con el texto recortado a EXACTAMENTE 300 caracteres, no menos", async () => {
    const transporteCliente = await servidorDeEcoConectado();
    const costura: CosturaDeRedDeConectores = {
      crearCliente: () => new Client({ name: "xonecode-test", version: "0" }),
      primario: () => transporteCliente,
      respaldo: RESPALDO_INESPERADO,
    };
    const red = redDeConectoresReal(costura);

    // Un `toThrow(cadena)` compara por SUBCADENA: un mensaje de 400 caracteres sin recortar
    // también lo pasaría. Se atrapa el error y se mide su longitud a mano.
    let atrapado: unknown;
    try {
      await red.llamarTool("https://mcp.test/mcp", undefined, "rota", {}, new AbortController().signal);
    } catch (e) {
      atrapado = e;
    }
    expect(atrapado).toBeInstanceOf(Error);
    expect((atrapado as Error).message).toBe("x".repeat(300));
    expect((atrapado as Error).message.length).toBe(300);
  });

  it("un primario que falla al CONECTAR cae al respaldo, y la llamada sigue leyendo la tool real", async () => {
    const transporteCliente = await servidorDeEcoConectado();
    const transportePrimarioRoto = {
      start: async () => { throw new Error("este servidor no habla streamable-http"); },
      close: async () => {},
      send: async () => {},
    } as unknown as TransporteDeMcp;
    const costura: CosturaDeRedDeConectores = {
      crearCliente: () => new Client({ name: "xonecode-test", version: "0" }),
      primario: () => transportePrimarioRoto,
      respaldo: () => transporteCliente,
    };
    const red = redDeConectoresReal(costura);

    const texto = await red.llamarTool("https://mcp.test/mcp", undefined, "eco", { via: "respaldo" }, new AbortController().signal);

    expect(JSON.parse(texto)).toEqual({ via: "respaldo" });
  });

  it("cierra el cliente en su finally tanto si la tool acaba bien como si acaba en isError", async () => {
    for (const nombre of ["eco", "rota"] as const) {
      const transporteCliente = await servidorDeEcoConectado();
      let cierres = 0;
      const costura: CosturaDeRedDeConectores = {
        crearCliente: () => {
          const cliente = new Client({ name: "xonecode-test", version: "0" });
          const cerrarOriginal = cliente.close.bind(cliente);
          cliente.close = async () => { cierres += 1; await cerrarOriginal(); };
          return cliente;
        },
        primario: () => transporteCliente,
        respaldo: RESPALDO_INESPERADO,
      };
      const red = redDeConectoresReal(costura);

      await red.llamarTool("https://mcp.test/mcp", undefined, nombre, {}, new AbortController().signal).catch(() => {});

      expect(cierres).toBe(1);
    }
  });
});

describe("ServicioDeConectores.llamar", () => {
  it("un id que no está añadido lanza «no está conectado», sin tocar la red", async () => {
    const red = redDoble();
    const s = crear(red);
    await expect(s.llamar("jira", "buscar", {})).rejects.toThrow("«jira» no está conectado");
    expect(red.llamarTool).not.toHaveBeenCalled();
  });

  it("un id fuera del catálogo lanza lo mismo que uno no añadido", async () => {
    const red = redDoble();
    const s = crear(red);
    await expect(s.llamar("linear", "buscar", {})).rejects.toThrow("«linear» no está conectado");
    expect(red.llamarTool).not.toHaveBeenCalled();
  });

  it("añadido pero sin credencial: «falta autorizar», sin tocar la red", async () => {
    const red = redDoble();
    const s = crear(red);
    s.anadir("jira"); // oauth, sin tokens guardados
    await expect(s.llamar("jira", "buscar", {})).rejects.toThrow("falta autorizar");
    expect(red.llamarTool).not.toHaveBeenCalled();
  });

  it("con un pendiente vivo del mismo conector, llamar NO toca la red (no pisa el verificador PKCE)", async () => {
    // Mismo montaje que el test equivalente de `probar`: tokens guardados, para que la única
    // razón de NO llamar a la red sea el pendiente vivo y no la guarda de «sin credencial» — si
    // se retira la guarda del pendiente, este test seguiría en verde por la otra guarda, y no
    // probaría nada.
    guardarOAuth(casa, "notion", { tokens: { access_token: "a", token_type: "Bearer" }, redirectUri: "http://127.0.0.1:4200/mcp/oauth/callback" });
    const red = redDoble();
    const s = crear(red);
    s.anadir("notion");
    void s.autorizar("notion", "http://127.0.0.1:4200/mcp/oauth/callback");
    await expect(s.llamar("notion", "buscar", {})).rejects.toThrow("autorización en curso");
    expect(red.llamarTool).not.toHaveBeenCalled();
  });

  it("con credencial, pasa la MISMA que probar y devuelve el texto de la red", async () => {
    const red = redDoble();
    (red.llamarTool as ReturnType<typeof vi.fn>).mockResolvedValue("hola");
    const s = crear(red);
    s.anadir("deepwiki"); // "ninguna": sin autenticación, credencial undefined
    await expect(s.llamar("deepwiki", "ask_wiki_question", { q: "x" })).resolves.toBe("hola");
    expect(red.llamarTool).toHaveBeenCalledWith("https://mcp.deepwiki.com/mcp", undefined, "ask_wiki_question", { q: "x" }, expect.anything(), TOPE_DE_CONEXION_MS);
  });

  it("un tope que no contesta a tiempo aborta la señal y da su propio motivo", async () => {
    vi.useFakeTimers();
    try {
      const red = redDoble();
      (red.llamarTool as ReturnType<typeof vi.fn>).mockImplementation(
        (_url, _credencial, _nombre, _args, senal) => new Promise(() => { void senal; }),
      );
      const s = crear(red);
      s.anadir("deepwiki");
      const p = s.llamar("deepwiki", "ask_wiki_question", {});
      // La aserción se crea ANTES de avanzar el reloj: si se espera al `advanceTimersByTimeAsync`
      // para engancharla, vitest puede marcar el rechazo como no gestionado aunque la aserción
      // luego pase.
      const aserto = expect(p).rejects.toThrow("no responde (no contestó a tiempo)");
      await vi.advanceTimersByTimeAsync(TOPE_DE_CONEXION_MS);
      await aserto;
    } finally {
      vi.useRealTimers();
    }
  });

  it("un 401 da el MISMO motivo que probar (motivoDe)", async () => {
    const red = redDoble();
    (red.llamarTool as ReturnType<typeof vi.fn>).mockRejectedValue(Object.assign(new Error("x"), { code: 401 }));
    const s = crear(red);
    s.anadir("deepwiki");
    await expect(s.llamar("deepwiki", "ask_wiki_question", {})).rejects.toThrow("no responde (HTTP 401)");
  });

  it("un ErrorDeTool (isError de la tool) se relanza TAL CUAL, sin aplanarlo a «no responde»", async () => {
    const red = redDoble();
    (red.llamarTool as ReturnType<typeof vi.fn>).mockRejectedValue(new ErrorDeTool("la JQL no es válida"));
    const s = crear(red);
    s.anadir("deepwiki");
    await expect(s.llamar("deepwiki", "buscar", {})).rejects.toThrow("la JQL no es válida");
  });

  it("no toca `pruebas` ni emite `alCambiar`: es una llamada, no una prueba", async () => {
    const alCambiar = vi.fn();
    const red = redDoble();
    (red.llamarTool as ReturnType<typeof vi.fn>).mockResolvedValue("ok");
    const s = crear(red, alCambiar);
    s.anadir("deepwiki");
    alCambiar.mockClear();

    await s.llamar("deepwiki", "ask_wiki_question", {});

    expect(alCambiar).not.toHaveBeenCalled();
    expect(s.lista().conectores[0]?.prueba).toBeUndefined();
  });

  it("un `llamar` que falla tampoco toca `pruebas` ni `alCambiar`", async () => {
    const alCambiar = vi.fn();
    const red = redDoble();
    (red.llamarTool as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("ECONNREFUSED"));
    const s = crear(red, alCambiar);
    s.anadir("deepwiki");
    alCambiar.mockClear();

    await expect(s.llamar("deepwiki", "ask_wiki_question", {})).rejects.toThrow();

    expect(alCambiar).not.toHaveBeenCalled();
    expect(s.lista().conectores[0]?.prueba).toBeUndefined();
  });
});

describe("Stitch: la clave en SU cabecera y una llamada de verdad para probarla", () => {
  // Medido el 30-09-2026 contra stitch.googleapis.com/mcp: la clave va en `X-Goog-Api-Key` (como
  // `Bearer` da 401), y `tools/list` contesta 200 sin clave y con una FALSA — solo `list_projects`
  // distingue. Una clave mala llega del SDK como `StreamableHTTPError` con `code: 401`.
  it("la clave viaja a secas en `X-Goog-Api-Key`, no como `Bearer`", async () => {
    const red = redDoble();
    const s = crear(red);
    s.anadir("stitch");
    s.guardarClave("stitch", "AQ.abc");
    await s.probar("stitch");
    expect((red.listarTools as ReturnType<typeof vi.fn>).mock.calls[0]?.[1]).toEqual({ cabecera: { nombre: "X-Goog-Api-Key", valor: "AQ.abc" } });
  });

  it("probar LLAMA a `list_projects` después de listar, y solo entonces sale Conectado", async () => {
    const red = redDoble();
    (red.listarTools as ReturnType<typeof vi.fn>).mockResolvedValue([{ nombre: "list_projects" }]);
    const s = crear(red);
    s.anadir("stitch");
    s.guardarClave("stitch", "AQ.abc");
    await s.probar("stitch");
    const llamada = (red.llamarTool as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(llamada?.[2]).toBe("list_projects");
    expect(llamada?.[3]).toEqual({});
    expect(s.lista().conectores[0]?.prueba).toMatchObject({ ok: true });
  });

  it("una clave mala —listar pasa, la llamada da 401— NO es Conectado: es «falta autorizar», que ofrece Conectar", async () => {
    const red = redDoble();
    (red.listarTools as ReturnType<typeof vi.fn>).mockResolvedValue([{ nombre: "list_projects" }]);
    (red.llamarTool as ReturnType<typeof vi.fn>).mockRejectedValue(Object.assign(new Error("Streamable HTTP error"), { code: 401 }));
    const s = crear(red);
    s.anadir("stitch");
    s.guardarClave("stitch", "AQ.mala");
    await s.probar("stitch");
    expect(s.lista().conectores[0]?.prueba).toMatchObject({ ok: false, motivo: "falta autorizar (la clave no vale: HTTP 401)" });
  });

  it("si la llamada de comprobación contesta isError, el motivo es SU texto", async () => {
    const red = redDoble();
    (red.llamarTool as ReturnType<typeof vi.fn>).mockRejectedValue(new ErrorDeTool("cuota agotada"));
    const s = crear(red);
    s.anadir("stitch");
    s.guardarClave("stitch", "AQ.abc");
    await s.probar("stitch");
    expect(s.lista().conectores[0]?.prueba).toMatchObject({ ok: false, motivo: "cuota agotada" });
  });

  it("un conector SIN comprobación no hace ninguna llamada al probar", async () => {
    const red = redDoble();
    const s = crear(red);
    s.anadir("deepwiki");
    await s.probar("deepwiki");
    expect(red.llamarTool).not.toHaveBeenCalled();
  });

  it("la cabecera llega al TRANSPORTE con su nombre, no dentro de `Authorization`", async () => {
    let opciones: { requestInit?: RequestInit } | undefined;
    const costura: CosturaDeRedDeConectores = {
      crearCliente: () => ({ connect: async () => {}, close: async () => {}, listTools: async () => ({ tools: [] }) }) as unknown as ClienteDeMcp,
      primario: (_url, o) => { opciones = o; return {} as TransporteDeMcp; },
      respaldo: () => { throw new Error("no debería usarse"); },
    };
    await redDeConectoresReal(costura).listarTools("https://mcp.test/mcp", { cabecera: { nombre: "X-Goog-Api-Key", valor: "AQ.abc" } }, new AbortController().signal);
    expect(opciones?.requestInit?.headers).toEqual({ "X-Goog-Api-Key": "AQ.abc" });
  });
});

describe("las llamadas de un agente y sus tools con esquema", () => {
  it("`llamar` con `topeMs` pasa ESE tope a la red, que se lo da al SDK (su omisión corta a los 60 s)", async () => {
    const red = redDoble();
    const s = crear(red);
    s.anadir("deepwiki");
    await s.llamar("deepwiki", "ask_wiki_question", {}, { topeMs: TOPE_DE_LLAMADA_MS });
    expect((red.llamarTool as ReturnType<typeof vi.fn>).mock.calls[0]?.[5]).toBe(TOPE_DE_LLAMADA_MS);
  });

  it("`tools` devuelve el esquema; la foto de `probar` NO lo lleva, porque viaja por el cable", async () => {
    const red = redDoble();
    const esquema = { type: "object", properties: { q: { type: "string" } } };
    (red.listarTools as ReturnType<typeof vi.fn>).mockResolvedValue([{ nombre: "ask", soloLectura: true, esquema }]);
    const s = crear(red);
    s.anadir("deepwiki");
    expect(await s.tools("deepwiki")).toEqual([{ nombre: "ask", soloLectura: true, esquema }]);
    await s.probar("deepwiki");
    expect(s.lista().conectores[0]?.prueba).toEqual({ cuando: reloj, ok: true, tools: [{ nombre: "ask", soloLectura: true }] });
  });

  it("`tools` de un conector sin credencial no toca la red: lanza «falta autorizar»", async () => {
    const red = redDoble();
    const s = crear(red);
    s.anadir("stitch");
    await expect(s.tools("stitch")).rejects.toThrow("falta autorizar");
    expect(red.listarTools).not.toHaveBeenCalled();
  });

  it("el tope largo llega al `callTool` del SDK como `timeout`", async () => {
    let opcionesDeLaPeticion: unknown;
    const costura: CosturaDeRedDeConectores = {
      crearCliente: () => ({
        connect: async () => {}, close: async () => {}, listTools: async () => ({ tools: [] }),
        callTool: async (_p: unknown, _s: unknown, o: unknown) => { opcionesDeLaPeticion = o; return { content: [{ type: "text", text: "ok" }] }; },
      }) as unknown as ClienteDeMcp,
      primario: () => ({}) as TransporteDeMcp,
      respaldo: () => { throw new Error("no debería usarse"); },
    };
    await redDeConectoresReal(costura).llamarTool("https://mcp.test/mcp", undefined, "x", {}, new AbortController().signal, TOPE_DE_LLAMADA_MS);
    expect(opcionesDeLaPeticion).toMatchObject({ timeout: TOPE_DE_LLAMADA_MS });
  });
});
