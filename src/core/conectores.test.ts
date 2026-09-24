import { describe, it, expect } from "vitest";
import {
  CATALOGO_DE_CONECTORES,
  conectorDelCatalogo,
  estadoDeConector,
  interpretarCallback,
  TTL_DE_AUTORIZACION_MS,
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
  it("sin autenticación no hay nada que autorizar", () => {
    expect(estadoDeConector(deepwiki, false)).toBe("sin-autorizacion");
  });
  it("OAuth sin tokens falta autorizar; con tokens está autorizado", () => {
    expect(estadoDeConector(jira, false)).toBe("falta-autorizar");
    expect(estadoDeConector(jira, true)).toBe("autorizado");
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
