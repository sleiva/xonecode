import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ProveedorDeConector } from "./proveedorDeConector.js";
import { guardarOAuth, leerOAuth } from "./conectoresEnDisco.js";

let casa: string;
beforeEach(() => { casa = mkdtempSync(join(tmpdir(), "prov-")); });
const nuevo = (redirect = "http://127.0.0.1:4200/mcp/oauth/callback", alRedirigir = (_: URL) => {}) =>
  new ProveedorDeConector({ casa, id: "notion", redirectUrl: redirect, state: "s1", alRedirigir });

describe("ProveedorDeConector", () => {
  it("cliente público con el redirect de ESTE arranque", () => {
    expect(nuevo().clientMetadata).toEqual({
      client_name: "xonecode",
      redirect_uris: ["http://127.0.0.1:4200/mcp/oauth/callback"],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    });
  });
  it("un cliente registrado para otro puerto no vale", () => {
    guardarOAuth(casa, "notion", { clientInformation: { client_id: "viejo" }, redirectUri: "http://127.0.0.1:1/mcp/oauth/callback" });
    expect(nuevo().clientInformation()).toBeUndefined();
  });
  it("guardar el cliente guarda también su redirect", () => {
    const p = nuevo();
    p.saveClientInformation({ client_id: "c" });
    expect(leerOAuth(casa, "notion")).toMatchObject({ clientInformation: { client_id: "c" }, redirectUri: "http://127.0.0.1:4200/mcp/oauth/callback" });
    expect(p.clientInformation()).toEqual({ client_id: "c" });
  });
  it("tokens, y olvidar solo los tokens", () => {
    const p = nuevo();
    p.saveClientInformation({ client_id: "c" });
    p.saveTokens({ access_token: "a", token_type: "Bearer" });
    expect(p.tokens()?.access_token).toBe("a");
    p.invalidateCredentials("tokens");
    expect(p.tokens()).toBeUndefined();
    expect(p.clientInformation()).toEqual({ client_id: "c" });
  });
  it("redirigir no abre nada: entrega la URL", () => {
    const vistas: URL[] = [];
    nuevo(undefined, (u) => vistas.push(u)).redirectToAuthorization(new URL("https://x/a"));
    expect(vistas.map(String)).toEqual(["https://x/a"]);
  });
  it("el state es el del servicio", () => {
    expect(nuevo().state()).toBe("s1");
  });
});
