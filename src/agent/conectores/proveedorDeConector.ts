/**
 * El `OAuthClientProvider` del SDK para UN conector. El molde es `ProviderCloudStudio`
 * (`cloudstudioMcp.ts`), con tres diferencias que no son de forma:
 *  - **Cliente PÚBLICO** (`token_endpoint_auth_method: "none"`): no hay dónde guardar un
 *    secreto que valga más que el propio token, y Notion y Atlassian lo aceptan (medido).
 *  - **El cliente va atado a su `redirect_uri`**: el puerto de la consola puede cambiar
 *    entre arranques y el servidor rechazaría el callback. Otro puerto = registrar de nuevo,
 *    que es una llamada.
 *  - **El `state` lo pone el servicio**, que es quien lo apunta como pendiente: la ruta
 *    pública del callback no tiene otra autenticación que ese valor.
 */
import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type { OAuthClientInformationMixed, OAuthClientMetadata, OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";
import { guardarOAuth, leerOAuth, type SecretosDeConector } from "./conectoresEnDisco.js";

export interface OpcionesDeProveedor {
  casa: string;
  id: string;
  redirectUrl: string;
  state: string;
  alRedirigir: (url: URL) => void;
}

export class ProveedorDeConector implements OAuthClientProvider {
  /**
   * Los secretos de ESTE conector. Son los mismos que guarda el carril de la clave —un solo
   * fichero por conector—, pero aquí no puede haber `clave`: quien construye un proveedor es el
   * carril de OAuth, y la autenticación de un conector no cambia después de crearlo.
   */
  private datos: SecretosDeConector;
  constructor(private readonly o: OpcionesDeProveedor) {
    this.datos = leerOAuth(o.casa, o.id);
  }
  private guardar(): void { guardarOAuth(this.o.casa, this.o.id, this.datos); }
  get redirectUrl(): string { return this.o.redirectUrl; }
  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: "xonecode",
      redirect_uris: [this.o.redirectUrl],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    };
  }
  state(): string { return this.o.state; }
  clientInformation(): OAuthClientInformationMixed | undefined {
    return this.datos.redirectUri === this.o.redirectUrl ? this.datos.clientInformation : undefined;
  }
  saveClientInformation(info: OAuthClientInformationMixed): void {
    this.datos = { ...this.datos, clientInformation: info, redirectUri: this.o.redirectUrl };
    this.guardar();
  }
  tokens(): OAuthTokens | undefined { return this.datos.tokens; }
  saveTokens(tokens: OAuthTokens): void { this.datos = { ...this.datos, tokens }; this.guardar(); }
  redirectToAuthorization(url: URL): void { this.o.alRedirigir(url); }
  saveCodeVerifier(verifier: string): void { this.datos = { ...this.datos, codeVerifier: verifier }; this.guardar(); }
  codeVerifier(): string {
    if (!this.datos.codeVerifier) throw new Error("no hay verificador PKCE para esta autorización: vuelve a pulsar Conectar");
    return this.datos.codeVerifier;
  }
  /** El gancho de recuperación del SDK: sin él, un refresh muerto es un fallo duro. */
  invalidateCredentials(alcance: "all" | "client" | "tokens" | "verifier" | "discovery"): void {
    const { clientInformation, redirectUri, tokens, codeVerifier } = this.datos;
    if (alcance === "all") this.datos = {};
    else if (alcance === "client") this.datos = { ...(tokens ? { tokens } : {}), ...(codeVerifier ? { codeVerifier } : {}) };
    else if (alcance === "tokens") this.datos = { ...(clientInformation ? { clientInformation } : {}), ...(redirectUri ? { redirectUri } : {}), ...(codeVerifier ? { codeVerifier } : {}) };
    else if (alcance === "verifier") this.datos = { ...(clientInformation ? { clientInformation } : {}), ...(redirectUri ? { redirectUri } : {}), ...(tokens ? { tokens } : {}) };
    this.guardar();
  }
}
