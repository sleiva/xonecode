import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { UnauthorizedError, type OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import { TOPE_DE_CONEXION_MS } from "../../core/conectores.js";
import { guardarOAuth, leerOAuth, rutaDeAnadidos, rutaDeOAuth } from "./conectoresEnDisco.js";
import { ProveedorDeConector } from "./proveedorDeConector.js";
import { crearServicioDeConectores, servicioDeConectoresCableado, type RedDeConectores, type ServicioDeConectores } from "./servicioDeConectores.js";

let casa: string;
let reloj: number;
const ahora = () => reloj;

function redDoble(): RedDeConectores {
  return {
    listarTools: vi.fn<RedDeConectores["listarTools"]>(async () => []),
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
    const proveedorRecibido = (red.listarTools as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as ProveedorDeConector;
    expect(proveedorRecibido.redirectUrl).toBe(redirectUri);
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

    // El error se deja DESPUÉS de `autorizar` (que también limpia el suyo al arrancar): si no
    // fuera así, este test pasaría aunque `completar` nunca tocara `error`.
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

  it("monta las seis operaciones y lista() lee del casa sin tocar la red", () => {
    const s = servicioDeConectoresCableado({ casa });
    expect(typeof s.lista).toBe("function");
    expect(typeof s.anadir).toBe("function");
    expect(typeof s.quitar).toBe("function");
    expect(typeof s.probar).toBe("function");
    expect(typeof s.autorizar).toBe("function");
    expect(typeof s.completar).toBe("function");
    expect(typeof s.desconectar).toBe("function");
    s.anadir("deepwiki");
    expect(s.lista().conectores).toEqual([{ id: "deepwiki", estado: "sin-autorizacion" }]);
  });
});
