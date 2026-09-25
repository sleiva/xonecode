import { describe, it, expect } from "vitest";
import {
  CATALOGO_DE_CONECTORES,
  conectorDeDefinicion,
  conectorDelCatalogo,
  definicionDelCable,
  esAutenticacionDeConector,
  esConectorPropio,
  estadoDeConector,
  idDeConectorDesdeNombre,
  idDeConectorPropio,
  interpretarCallback,
  motivoDeDefinicionInaceptable,
  slugDeConectorPropio,
  TTL_DE_AUTORIZACION_MS,
  type DefinicionDeConector,
  type Pendiente,
} from "./conectores.js";
import { motivoDeEndpointInaceptable } from "./modelos.js";

describe("catálogo de conectores", () => {
  it("son los tres medidos, con su URL y su autenticación", () => {
    expect(CATALOGO_DE_CONECTORES.map((c) => [c.id, c.url, c.autenticacion])).toEqual([
      ["deepwiki", "https://mcp.deepwiki.com/mcp", "ninguna"],
      ["jira", "https://mcp.atlassian.com/v1/mcp", "oauth"],
      ["notion", "https://mcp.notion.com/mcp", "oauth"],
    ]);
  });
  it("cada URL pasa la MISMA regla que un MCP", () => {
    for (const c of CATALOGO_DE_CONECTORES) expect(motivoDeEndpointInaceptable(c.url)).toBeUndefined();
  });
  it("un id que no está en el catálogo no existe", () => {
    expect(conectorDelCatalogo("linear")).toBeUndefined();
    expect(conectorDelCatalogo("jira")?.nombre).toBe("Jira");
  });
});

describe("estadoDeConector", () => {
  const deepwiki = conectorDelCatalogo("deepwiki")!;
  const jira = conectorDelCatalogo("jira")!;
  const propio = conectorDeDefinicion(idDeConectorPropio("acme"), {
    nombre: "Acme",
    descripcion: "Un servidor propio",
    url: "https://mcp.acme.com/mcp",
    autenticacion: "api-key",
  });
  it("sin autenticación no hay nada que autorizar", () => {
    expect(estadoDeConector(deepwiki, false)).toBe("sin-autorizacion");
    // Y con credencial tampoco: no hay nada que autorizar aunque la haya.
    expect(estadoDeConector(deepwiki, true)).toBe("sin-autorizacion");
  });
  it("OAuth sin tokens falta autorizar; con tokens está autorizado", () => {
    expect(estadoDeConector(jira, false)).toBe("falta-autorizar");
    expect(estadoDeConector(jira, true)).toBe("autorizado");
  });
  it("un `api-key` contesta lo MISMO: su clave es la credencial", () => {
    // Es la razón de que el segundo parámetro se llame `hayCredencial` y no `hayTokens`: el
    // estado no distingue familias, solo si hay con qué autenticarse.
    expect(estadoDeConector(propio, false)).toBe("falta-autorizar");
    expect(estadoDeConector(propio, true)).toBe("autorizado");
  });
});

describe("un conector escrito a mano", () => {
  const def: DefinicionDeConector = {
    nombre: "Acme Tools",
    descripcion: "Un servidor propio",
    url: "https://mcp.acme.com/mcp",
    autenticacion: "api-key",
  };

  it("el id se DERIVA del nombre, con la regla de siempre y los acentos descompuestos", () => {
    expect(idDeConectorDesdeNombre("Acme Tools")).toBe("custom:acme-tools");
    expect(idDeConectorDesdeNombre("  Mi Servidor  ")).toBe("custom:mi-servidor");
    expect(idDeConectorDesdeNombre("Notión de José")).toBe("custom:notion-de-jose");
    expect(idDeConectorDesdeNombre("C++ & C#")).toBe("custom:c-c");
  });

  it("un id con forma de slug propio se reconoce, y lo que no, no", () => {
    expect(esConectorPropio("custom:acme-tools")).toBe(true);
    expect(slugDeConectorPropio("custom:acme-tools")).toBe("acme-tools");
    // Un id del catálogo no es propio, y un `custom:` con basura tampoco: `esConectorPropio` es
    // lo que decide si un id del fichero puede escribir una definición.
    expect(esConectorPropio("jira")).toBe(false);
    expect(esConectorPropio("custom:")).toBe(false);
    expect(esConectorPropio("custom:CON-mayusculas")).toBe(false);
    expect(esConectorPropio("custom:../../fuera")).toBe(false);
  });

  it("la definición vuelve como la MISMA fila que una del catálogo", () => {
    // Es lo que hace que de ahí para abajo nada sepa de qué familia viene un conector.
    expect(conectorDeDefinicion("custom:acme-tools", def)).toEqual({
      id: "custom:acme-tools", nombre: "Acme Tools", descripcion: def.descripcion,
      url: def.url, autenticacion: "api-key",
    });
  });

  it("lo que llega por el cable se comprueba por FORMA, campo a campo", () => {
    expect(definicionDelCable(def)).toEqual(def);
    // Un cliente puede mentir sobre lo que el tipo promete, así que un campo que no es del tipo
    // que dice ser tumba la definición ENTERA en vez de colarse a medias.
    expect(definicionDelCable(null)).toBeUndefined();
    expect(definicionDelCable("un texto")).toBeUndefined();
    expect(definicionDelCable({ ...def, nombre: 7 })).toBeUndefined();
    expect(definicionDelCable({ ...def, descripcion: undefined })).toBeUndefined();
    expect(definicionDelCable({ ...def, url: null })).toBeUndefined();
    expect(definicionDelCable({ ...def, autenticacion: "bearer" })).toBeUndefined();
  });

  it("la autenticación se comprueba por VALOR: es lo que llega por el cable", () => {
    expect(esAutenticacionDeConector("ninguna")).toBe(true);
    expect(esAutenticacionDeConector("oauth")).toBe(true);
    expect(esAutenticacionDeConector("api-key")).toBe(true);
    expect(esAutenticacionDeConector("apikey")).toBe(false);
    expect(esAutenticacionDeConector("API-KEY")).toBe(false);
    expect(esAutenticacionDeConector(undefined)).toBe(false);
  });

  it("un nombre o una descripción vacíos no valen", () => {
    expect(motivoDeDefinicionInaceptable({ ...def, nombre: "   " }, [])).toBe("ponle un nombre");
    expect(motivoDeDefinicionInaceptable({ ...def, descripcion: "" }, [])).toBe("escribe una descripción: es lo que se lee en la lista");
  });

  it("la URL pasa por la regla de SIEMPRE, no por una copia de ella", () => {
    // La misma función que la de un endpoint de modelo, así que `http://` fuera de loopback se
    // rechaza aquí por construcción y no por una segunda lista que pueda divergir.
    const fuera = { ...def, url: "http://192.168.1.5:3000" };
    expect(motivoDeDefinicionInaceptable(fuera, [])).toBe(motivoDeEndpointInaceptable(fuera.url));
    expect(motivoDeDefinicionInaceptable(fuera, [])).toBeDefined();
    expect(motivoDeDefinicionInaceptable({ ...def, url: "http://127.0.0.1:3000/mcp" }, [])).toBeUndefined();
    expect(motivoDeDefinicionInaceptable({ ...def, url: "https://usuario:clave@mcp.acme.com/mcp" }, [])).toBeDefined();
  });

  it("un nombre del que no sale un slug válido lo DICE, con el motivo", () => {
    const motivo = motivoDeDefinicionInaceptable({ ...def, nombre: "+++" }, []);
    expect(motivo).toContain("de ese nombre no sale un identificador válido");
  });

  it("el nombre YA dado de alta se rechaza, y lo que se está comprobando son los OCUPADOS", () => {
    // Lo que choca es crear DOS VECES el mismo nombre: el segundo pisaría la definición del
    // primero, y su URL y su clave se quedarían apuntando a otro servidor.
    const motivo = motivoDeDefinicionInaceptable(def, ["jira", "custom:acme-tools"]);
    expect(motivo).toContain("acme-tools");
    expect(motivoDeDefinicionInaceptable(def, ["jira"])).toBeUndefined();
    // Una definición HUÉRFANA —dejada por un `quitar` que falló— también ocupa su sitio por eso
    // mismo: volver a crearla la pisaría igual.
    expect(motivoDeDefinicionInaceptable(def, ["custom:acme-tools"])).toBeDefined();
  });

  it("un nombre propio NO choca con la fila del CATÁLOGO que se llame igual", () => {
    // `custom:jira` y `jira` son ids distintos, y montar tu propio servidor de Jira es una razón
    // real para darlo de alta a mano: los dos conviven cada uno con su fila.
    expect(motivoDeDefinicionInaceptable({ ...def, nombre: "Jira" }, [])).toBeUndefined();
  });
});

describe("interpretarCallback", () => {
  const ahora = 1_000_000;
  const pendientes = (): Map<string, Pendiente> =>
    new Map([["s1", { id: "notion", expira: ahora + TTL_DE_AUTORIZACION_MS }]]);

  it("un state pendiente vale UNA vez", () => {
    const p = pendientes();
    expect(interpretarCallback(new URLSearchParams("code=abc&state=s1"), p, ahora)).toEqual({ ok: true, id: "notion", code: "abc" });
    expect(interpretarCallback(new URLSearchParams("code=abc&state=s1"), p, ahora).ok).toBe(false);
  });
  it("state desconocido, ausente o caducado es un no", () => {
    expect(interpretarCallback(new URLSearchParams("code=abc&state=otro"), pendientes(), ahora).ok).toBe(false);
    expect(interpretarCallback(new URLSearchParams("code=abc"), pendientes(), ahora).ok).toBe(false);
    expect(interpretarCallback(new URLSearchParams("code=abc&state=s1"), pendientes(), ahora + TTL_DE_AUTORIZACION_MS + 1).ok).toBe(false);
  });
  it("un error del proveedor consume el state y no repite lo recibido", () => {
    const p = pendientes();
    const r = interpretarCallback(new URLSearchParams("error=access_denied&error_description=<script>&state=s1"), p, ahora);
    expect(r.ok).toBe(false);
    expect(JSON.stringify(r)).not.toContain("script");
    expect(JSON.stringify(r)).not.toContain("access_denied");
    expect(p.has("s1")).toBe(false);
  });
  it("sin code no hay nada que canjear", () => {
    expect(interpretarCallback(new URLSearchParams("state=s1"), pendientes(), ahora).ok).toBe(false);
  });
});
