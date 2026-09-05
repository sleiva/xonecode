import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  adoptarLegadoSiProcede,
  EstadoOAuthVersionIncompatible,
  guardarEstadoDeEntorno,
  herramientaDeProyectos,
  invocarSobre,
  leerEstado,
  olvidarEntorno,
  ProviderCloudStudio,
  proyectosDeResultado,
  respuestaDeCallback,
  servidorDeImplementacion,
  URL_CLOUDSTUDIO_POR_OMISION,
} from "./cloudstudioMcp.js";

describe("proyectosDeResultado", () => {
  it("extrae identidades de una respuesta estructurada sin conservar el resto", () => {
    expect(proyectosDeResultado({
      projects: [
        { id: "a", name: "Ventas", secreto: "nunca llega a config" },
        { projectId: "b", title: "Inventario" },
        { id: "a", name: "Duplicado" },
      ],
    })).toEqual([
      { id: "a", nombre: "Ventas" },
      { id: "b", nombre: "Inventario" },
    ]);
  });

  it("admite JSON textual y descarta una respuesta que no representa proyectos", () => {
    expect(proyectosDeResultado('{"items":[{"project_id":"a","nombre":"Ventas"}]}')).toEqual([
      { id: "a", nombre: "Ventas" },
    ]);
    expect(proyectosDeResultado("texto libre")).toEqual([]);
  });

  it("extrae el JSON textual del bloque MCP sin filtrar su contenido al resto de la app", () => {
    expect(proyectosDeResultado({
      content: [{ type: "text", text: '{"projects":[{"id":"a","name":"Ventas"}]}' }],
    })).toEqual([{ id: "a", nombre: "Ventas" }]);
  });
});

describe("invocarSobre", () => {
  // El SDK MCP no lanza cuando una tool falla: `isError: true` es una respuesta RPC
  // válida, con el motivo dentro de `content`. Sin esta conversión, «No project is
  // open» nunca llegaría a un catch y `clienteCloudStudio` no podría reabrir la
  // sesión — un `invocarSobre` que se limitara a `return callTool(...)` pasaría los
  // dos primeros tests igual, pero jamás rechazaría en el tercero.
  it("convierte isError en una excepción con el texto del servidor", async () => {
    const invocar = invocarSobre(async () => ({
      isError: true,
      content: [{ type: "text", text: "No project is open. Use the studio_open_project tool" }],
    }));
    await expect(invocar("studio_get_file", { filePath: "a.js" }))
      .rejects.toThrow(/No project is open/);
  });

  it("un isError sin texto no deja el mensaje vacío", async () => {
    const invocar = invocarSobre(async () => ({ isError: true, content: [] }));
    await expect(invocar("studio_get_context", {})).rejects.toThrow(/./);
  });

  it("una respuesta sin isError se devuelve tal cual, sin tocarla", async () => {
    const bruto = { content: [{ type: "text", text: "contenido" }] };
    const invocar = invocarSobre(async () => bruto);
    expect(await invocar("studio_get_file", { filePath: "a.js" })).toBe(bruto);
  });

  it("pasa nombre y argumentos al callTool subyacente sin transformarlos", async () => {
    const peticiones: unknown[] = [];
    const invocar = invocarSobre(async (peticion) => {
      peticiones.push(peticion);
      return { content: [] };
    });
    await invocar("studio_open_project", { project: "AppForTest" });
    expect(peticiones).toEqual([{ name: "studio_open_project", arguments: { project: "AppForTest" } }]);
  });

  // Medido contra el servidor real: `studio_open_project` con un id devolvió
  // «Failed to open project: Project '96fe…' not found for user 'sleiva@xone.es'», y un
  // `studio_edit_file` en modo `patch` puede rechazar devolviendo el propio bloque que
  // se intentó escribir. El mensaje de la excepción es justo el canal que atraviesa
  // `conSesion`, logs, capturas y `sync.log` — el invariante del repo lo protege.
  it("una tool de ESCRITURA no reenvía el cuerpo del error: puede ser nuestro fichero rebotando", async () => {
    const contenidoReconocible = "function actualizarStock() { /* lógica real del cliente */ }";
    const invocar = invocarSobre(async () => ({
      isError: true,
      content: [{ type: "text", text: `Patch rejected, offending block was:\n${contenidoReconocible}\nEOF` }],
    }));
    const error = await invocar("studio_edit_file", { filePath: "stock.js", content: "x", editMode: "replace" })
      .catch((e: unknown) => e as Error);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain(contenidoReconocible);
    // Sigue sirviendo para diagnosticar: nombra la tool y la ruta.
    expect((error as Error).message).toContain("studio_edit_file");
    expect((error as Error).message).toContain("stock.js");
  });

  it("una tool de LECTURA solo reenvía la primera línea, acotada", async () => {
    const primeraLinea = "File extension '.jpg' is not allowed or missing";
    const resto = "x".repeat(500);
    const invocar = invocarSobre(async () => ({
      isError: true,
      content: [{ type: "text", text: `${primeraLinea}\n${resto}` }],
    }));
    const error = await invocar("studio_get_file", { filePath: "logo.jpg" }).catch((e: unknown) => e as Error);
    expect((error as Error).message).toContain(primeraLinea);
    expect((error as Error).message).not.toContain(resto);
    expect((error as Error).message.length).toBeLessThan(primeraLinea.length + 50);
    expect((error as Error).message).toContain("studio_get_file");
  });

  it("la caducidad de sesión se conserva incluso en una tool de escritura: si no, no hay reapertura posible", async () => {
    const invocar = invocarSobre(async () => ({
      isError: true,
      content: [{ type: "text", text: "No project is open. Use the studio_open_project tool" }],
    }));
    await expect(invocar("studio_edit_file", { filePath: "a.js", content: "x", editMode: "replace" }))
      .rejects.toThrow(/No project is open/);
  });
});

describe("herramientaDeProyectos", () => {
  it("prefiere el nombre real del servidor XOne sobre cualquier heurística", () => {
    const elegida = herramientaDeProyectos([
      { name: "studio_get_project_structure" },
      { name: "studio_list_projects", description: "Lista los proyectos" },
      { name: "project_list" },
    ]);
    expect(elegida?.name).toBe("studio_list_projects");
  });

  it("acepta los alias históricos cuando el servidor no publica el nombre nuevo", () => {
    expect(herramientaDeProyectos([{ name: "project_list" }])?.name).toBe("project_list");
    expect(herramientaDeProyectos([{ name: "list_projects" }])?.name).toBe("list_projects");
  });

  it("cae en una heurística solo con tools sin argumentos obligatorios", () => {
    expect(herramientaDeProyectos([
      { name: "studio_projects_listing", inputSchema: { type: "object", required: ["id"] } },
    ])).toBeUndefined();
    expect(herramientaDeProyectos([{ name: "studio_projects_listing" }])?.name)
      .toBe("studio_projects_listing");
  });

  it("no confunde otra tool de proyecto con el listado", () => {
    expect(herramientaDeProyectos([
      { name: "studio_open_project" },
      { name: "studio_download_project" },
    ])).toBeUndefined();
  });
});

describe("proyectosDeResultado · forma real de studio_list_projects", () => {
  // Medido contra el servidor: no es una lista, es un MAPA indexado por id bajo
  // «recents», y el identificador viaja en «pid». Los demás campos (permisos, correo
  // del propietario, fechas) no salen de aquí.
  const respuestaReal = {
    recents: {
      "5cd2327f_53f3_40b9_9bb4_e6973fd0a938": {
        name: "AppDemo",
        pid: "5cd2327f_53f3_40b9_9bb4_e6973fd0a938",
        shared: false,
        last: "2026-09-02T04:41:38",
        rights: "{remove:true,download:true,edit:true}",
        suser: "alguien@ejemplo.es",
        studiopermissions: [{ show: false }],
      },
      "e01d2abe_25e7_47a0_9654_7bee94878a35": {
        name: "AppDeve",
        pid: "e01d2abe_25e7_47a0_9654_7bee94878a35",
        shared: true,
      },
    },
  };

  it("extrae los proyectos de un mapa indexado por id", () => {
    expect(proyectosDeResultado(respuestaReal)).toEqual([
      { id: "5cd2327f_53f3_40b9_9bb4_e6973fd0a938", nombre: "AppDemo" },
      { id: "e01d2abe_25e7_47a0_9654_7bee94878a35", nombre: "AppDeve" },
    ]);
  });

  it("no deja escapar ningún otro campo del proyecto", () => {
    const extraidos = proyectosDeResultado(respuestaReal);
    // Sin esto la comprobación de abajo pasaría también con una lista vacía.
    expect(extraidos).toHaveLength(2);
    const serializado = JSON.stringify(extraidos);
    for (const filtrado of ["suser", "ejemplo.es", "rights", "studiopermissions", "last"]) {
      expect(serializado).not.toContain(filtrado);
    }
  });

  it("usa la clave del mapa como id cuando la entrada no repite «pid»", () => {
    expect(proyectosDeResultado({ recents: { abc: { name: "SinPid" } } })).toEqual([
      { id: "abc", nombre: "SinPid" },
    ]);
  });

  it("llega igual envuelto en el bloque de texto del SDK MCP", () => {
    expect(proyectosDeResultado({
      content: [{ type: "text", text: JSON.stringify(respuestaReal) }],
    })).toHaveLength(2);
  });
});

/**
 * `~/.xonecode/cloudstudio-oauth.json` pasa de un único juego plano de tokens a un
 * fichero indexado por entorno: los dos oficiales, más el on-premise de un cliente. Cada
 * test recibe su propia «casa» temporal (nunca `~/.xonecode` real, como ya hace
 * `settingsEnDisco.test.ts`) y una ruta DENTRO de una carpeta que todavía no existe, para
 * que `guardarEstado` tenga que crear el árbol — como en el primer login de una casa
 * nueva.
 */
describe("estado OAuth por entorno", () => {
  function rutaNueva(): string {
    const casa = mkdtempSync(join(tmpdir(), "xonecode-cloudstudio-oauth-"));
    return join(casa, ".xonecode", "cloudstudio-oauth.json");
  }

  function ficheroTemporalCon(plano: unknown): string {
    const ruta = rutaNueva();
    mkdirSync(join(ruta, ".."), { recursive: true, mode: 0o700 });
    writeFileSync(ruta, JSON.stringify(plano));
    return ruta;
  }

  function ficheroTemporalVacio(): string {
    return rutaNueva(); // no existe todavía: leerEstado debe devolver el estado vacío
  }

  function ficheroTemporalCrudo(texto: string): string {
    const ruta = rutaNueva();
    mkdirSync(join(ruta, ".."), { recursive: true, mode: 0o700 });
    writeFileSync(ruta, texto);
    return ruta;
  }

  /** `token_type` no importa a ningún test de este bloque: solo hace falta para que el
   *  literal case en el tipo `OAuthTokens` del SDK MCP. */
  function tokenDePrueba(access_token: string): { access_token: string; token_type: string } {
    return { access_token, token_type: "bearer" };
  }

  it("un fichero plano (el de hoy) no se pierde: pasa a la clave legado", () => {
    const ruta = ficheroTemporalCon({ tokens: { access_token: "viejo" }, scopes: ["a"] });
    const estado = leerEstado(ruta);
    expect(estado.version).toBe(2);
    expect(estado.porEntorno.legado?.tokens?.access_token).toBe("viejo");
  });

  it("leer un fichero plano NO lo reescribe: un arranque de solo lectura no toca el disco del usuario", () => {
    const bruto = JSON.stringify({ tokens: { access_token: "viejo" }, scopes: ["a"] });
    const ruta = ficheroTemporalCon(JSON.parse(bruto));
    leerEstado(ruta);
    leerEstado(ruta);
    // Byte a byte: la migración se materializa en la primera ESCRITURA, no aquí.
    expect(readFileSync(ruta, "utf8")).toBe(bruto);
  });

  it("legado se adopta al registrar el entorno de la URL por omisión, y NO antes", () => {
    const ruta = ficheroTemporalCon({ tokens: { access_token: "viejo" } });
    // Un entorno cualquiera no se lo lleva.
    adoptarLegadoSiProcede(ruta, { id: "otro", url: "https://on-prem/mcp" });
    expect(leerEstado(ruta).porEntorno.legado).toBeDefined();
    expect(leerEstado(ruta).porEntorno.otro).toBeUndefined();
    // El de la URL por omisión sí.
    adoptarLegadoSiProcede(ruta, { id: "webstudio", url: URL_CLOUDSTUDIO_POR_OMISION });
    expect(leerEstado(ruta).porEntorno.webstudio?.tokens?.access_token).toBe("viejo");
    expect(leerEstado(ruta).porEntorno.legado).toBeUndefined();
  });

  it("adoptar legado conserva intactos los tokens de un entorno que ya existía", () => {
    // Un fichero plano de antes, más un entorno "otro" que ya inició sesión aparte: la
    // primera escritura de guardarEstadoDeEntorno es la que materializa la migración de
    // formato, y es justo ahí donde un bug podría machacar "otro" con el porEntorno entero.
    const ruta = ficheroTemporalCon({ tokens: { access_token: "viejo" } });
    guardarEstadoDeEntorno(ruta, "otro", { tokens: tokenDePrueba("del-otro-entorno") });
    adoptarLegadoSiProcede(ruta, { id: "webstudio", url: URL_CLOUDSTUDIO_POR_OMISION });
    const { porEntorno } = leerEstado(ruta);
    expect(porEntorno.webstudio?.tokens?.access_token).toBe("viejo");
    expect(porEntorno.otro?.tokens?.access_token).toBe("del-otro-entorno");
    expect(porEntorno.legado).toBeUndefined();
  });

  it("nunca se registró el entorno por omisión: legado queda intacto para siempre", () => {
    const ruta = ficheroTemporalCon({ tokens: { access_token: "viejo" } });
    adoptarLegadoSiProcede(ruta, { id: "on-prem-cliente", url: "https://cloudstudio.cliente.example/mcp" });
    expect(leerEstado(ruta).porEntorno.legado?.tokens?.access_token).toBe("viejo");
  });

  it("cerrar sesión en un entorno deja intactos los demás", () => {
    const ruta = ficheroTemporalVacio();
    guardarEstadoDeEntorno(ruta, "a", { tokens: tokenDePrueba("ta") });
    guardarEstadoDeEntorno(ruta, "b", { tokens: tokenDePrueba("tb") });
    olvidarEntorno(ruta, "a");
    expect(leerEstado(ruta).porEntorno.a).toBeUndefined();
    expect(leerEstado(ruta).porEntorno.b?.tokens?.access_token).toBe("tb");
  });

  it("olvidar un entorno sin nada guardado no crea el fichero", () => {
    const ruta = ficheroTemporalVacio();
    olvidarEntorno(ruta, "nunca-existió");
    expect(existsSync(ruta)).toBe(false);
    expect(leerEstado(ruta).porEntorno).toEqual({});
  });

  it("un fichero corrupto sigue dando estado vacío y no imprime nada", () => {
    const ruta = ficheroTemporalCrudo("{{{");
    expect(leerEstado(ruta).porEntorno).toEqual({});
  });

  it("una versión futura y desconocida no se sobrescribe: leerEstado la trata como vacía, pero escribir encima destruiría lo que no sabe interpretar", () => {
    const bruto = JSON.stringify({ version: 3, porEntorno: { futuro: { tokens: tokenDePrueba("del-futuro") } } });
    const ruta = ficheroTemporalCon(JSON.parse(bruto));
    expect(() => guardarEstadoDeEntorno(ruta, "a", { tokens: tokenDePrueba("ta") }))
      .toThrow(EstadoOAuthVersionIncompatible);
    expect(() => olvidarEntorno(ruta, "a")).toThrow(EstadoOAuthVersionIncompatible);
    expect(() => adoptarLegadoSiProcede(ruta, { id: "webstudio", url: URL_CLOUDSTUDIO_POR_OMISION }))
      .toThrow(EstadoOAuthVersionIncompatible);
    // Ninguno de los tres intentos tocó el disco.
    expect(readFileSync(ruta, "utf8")).toBe(bruto);
  });

  it("un fichero nuevo se escribe en disco como { version: 2, porEntorno: {…} }", () => {
    const ruta = ficheroTemporalVacio();
    guardarEstadoDeEntorno(ruta, "webstudio", { tokens: tokenDePrueba("t") });
    const enDisco = JSON.parse(readFileSync(ruta, "utf8"));
    expect(enDisco.version).toBe(2);
    expect(enDisco.porEntorno.webstudio.tokens.access_token).toBe("t");
  });

  it("el fichero queda 0600 dentro de una carpeta 0700, igual que antes de los entornos", () => {
    const ruta = ficheroTemporalVacio();
    guardarEstadoDeEntorno(ruta, "webstudio", { tokens: tokenDePrueba("t") });
    expect(statSync(ruta).mode & 0o777).toBe(0o600);
    expect(statSync(join(ruta, "..")).mode & 0o777).toBe(0o700);
  });
});

describe("la página del callback de OAuth", () => {
  it("sin URL de web, la de siempre: 200 y «ya puedes volver a xonecode»", () => {
    const r = respuestaDeCallback("abc", null);
    expect(r.estado).toBe(200);
    expect(r.cuerpo).toMatch(/volver a xonecode/);
  });

  it("con URL de web, 302 a la web: en un navegador «vuelve a la terminal» es falso", () => {
    const r = respuestaDeCallback("abc", null, "http://127.0.0.1:7788/?t=xyz");
    expect(r.estado).toBe(302);
    expect(r.cabeceras.location).toBe("http://127.0.0.1:7788/?t=xyz");
    expect(r.cuerpo).toBe("");
  });

  it("el FALLO no redirige ni con web: la web todavía no sabe el motivo y lo taparía", () => {
    const r = respuestaDeCallback(null, "access_denied", "http://127.0.0.1:7788/");
    expect(r.estado).toBe(400);
    expect(r.cabeceras.location).toBeUndefined();
    // Y el texto no manda a «la consola», que en el navegador no es donde está el usuario.
    expect(r.cuerpo).not.toMatch(/la consola/);
  });

  it("un callback sin código es un fallo aunque el IDS no diga por qué", () => {
    expect(respuestaDeCallback(null, null, "http://127.0.0.1:7788/").estado).toBe(400);
  });
});

/**
 * El `serverInfo` del initialize: es texto que llega del OTRO lado y acaba en
 * `settings.json` y en la barra lateral, así que pasa por la misma criba que cualquier
 * otro dato remoto de este fichero.
 */
describe("servidorDeImplementacion · el nombre que el servidor MCP se da a sí mismo", () => {
  it("prefiere `title` (el nombre para leer) sobre `name` (el programático)", () => {
    expect(
      servidorDeImplementacion({ name: "xone-cloudstudio", title: "XOne CloudStudio", version: "2.1.0" })
    ).toEqual({ nombre: "XOne CloudStudio", version: "2.1.0" });
  });

  it("sin `title` vale `name`: es mejor que nada", () => {
    expect(servidorDeImplementacion({ name: "xone-cloudstudio", version: "2.1.0" })).toEqual({
      nombre: "xone-cloudstudio",
      version: "2.1.0",
    });
  });

  it("sin nada legible no se afirma nada", () => {
    expect(servidorDeImplementacion(undefined)).toBeUndefined();
    expect(servidorDeImplementacion({ name: "   ", version: "1" })).toBeUndefined();
    expect(servidorDeImplementacion({ name: 7 as never, version: "1" })).toBeUndefined();
  });

  it("quita lo que no es imprimible y colapsa espacios: un salto de línea disfraza lo que venga detrás", () => {
    const sucio = servidorDeImplementacion({ title: "XOne\n\rStudio\t  local", version: "1" });
    expect(sucio?.nombre).toBe("XOne Studio local");
  });

  it("acota la longitud: cabe cualquier nombre real y no cabe un párrafo", () => {
    const largo = servidorDeImplementacion({ title: "x".repeat(500), version: "y".repeat(500) });
    expect(largo?.nombre).toHaveLength(60);
    expect(largo?.version).toHaveLength(60);
  });

  it("una versión ausente o vacía no se inventa", () => {
    expect(servidorDeImplementacion({ title: "XOne CloudStudio" })).toEqual({ nombre: "XOne CloudStudio" });
  });
});

/**
 * El gancho del que depende la recuperación automática del SDK. `auth()`
 * (`@modelcontextprotocol/sdk/client/auth.js`) atrapa `InvalidGrantError` —el refresh token
 * muerto—, llama a `invalidateCredentials('tokens')` y REINTENTA el flujo entero. Sin
 * implementarlo esa llamada era un no-op: el SDK reintentaba con las mismas credenciales
 * podridas y volvía a fallar, así que un token caducado sin refresco válido era un fallo
 * duro que solo se arreglaba borrando el fichero a mano.
 */
describe("ProviderCloudStudio · invalidar credenciales", () => {
  function provider(ruta: string) {
    return new ProviderCloudStudio(ruta, "webstudio", "http://127.0.0.1:7634/callback", () => {}, [
      "mcp.read",
    ]);
  }

  it("«tokens» se lleva el token Y los scopes concedidos, y deja el cliente registrado", () => {
    const casa = mkdtempSync(join(tmpdir(), "xc-oauth-"));
    const ruta = join(casa, "cloudstudio-oauth.json");
    guardarEstadoDeEntorno(ruta, "webstudio", {
      clientInformation: { client_id: "abc" },
      tokens: { access_token: "viejo", token_type: "Bearer", scope: "mcp.read" },
      scopes: ["mcp.read"],
      codeVerifier: "v",
    });

    provider(ruta).invalidateCredentials("tokens");

    const despues = leerEstado(ruta).porEntorno.webstudio!;
    expect(despues.tokens).toBeUndefined();
    // Los scopes van CON el token: conservarlos haría creer que hay permiso concedido para
    // unos tokens que ya no existen.
    expect(despues.scopes).toBeUndefined();
    // El registro del cliente y el verificador NO son el problema y se quedan: volver a
    // registrarse en el IDS por un token caducado sería trabajo de más.
    expect(despues.clientInformation).toEqual({ client_id: "abc" });
    expect(despues.codeVerifier).toBe("v");
  });

  it("«all» deja el entorno sin credenciales, y no toca las de los demás", () => {
    const casa = mkdtempSync(join(tmpdir(), "xc-oauth-"));
    const ruta = join(casa, "cloudstudio-oauth.json");
    guardarEstadoDeEntorno(ruta, "webstudio", { tokens: { access_token: "a", token_type: "Bearer" } });
    guardarEstadoDeEntorno(ruta, "manager", { tokens: { access_token: "b", token_type: "Bearer" } });

    provider(ruta).invalidateCredentials("all");

    const despues = leerEstado(ruta).porEntorno;
    expect(despues.webstudio).toEqual({});
    expect(despues.manager?.tokens?.access_token).toBe("b");
  });

  it("«verifier» y «client» borran lo suyo y nada más", () => {
    const casa = mkdtempSync(join(tmpdir(), "xc-oauth-"));
    const ruta = join(casa, "cloudstudio-oauth.json");
    // Con `scopes`: sin ellos, el CONSTRUCTOR borra el token por su cuenta —no puede
    // afirmar que cubra los permisos pedidos—, y este test estaría midiendo aquello en vez
    // de la invalidación.
    guardarEstadoDeEntorno(ruta, "webstudio", {
      clientInformation: { client_id: "abc" },
      tokens: { access_token: "a", token_type: "Bearer" },
      scopes: ["mcp.read"],
      codeVerifier: "v",
    });

    provider(ruta).invalidateCredentials("verifier");
    expect(leerEstado(ruta).porEntorno.webstudio?.codeVerifier).toBeUndefined();
    expect(leerEstado(ruta).porEntorno.webstudio?.tokens?.access_token).toBe("a");

    provider(ruta).invalidateCredentials("client");
    expect(leerEstado(ruta).porEntorno.webstudio?.clientInformation).toBeUndefined();
    expect(leerEstado(ruta).porEntorno.webstudio?.tokens?.access_token).toBe("a");
  });
});
