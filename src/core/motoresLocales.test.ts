import { describe, expect, it } from "vitest";
import {
  esMotorLocal,
  motivoDeModeloDeMotorInaceptable,
  interpretarAuthStatusDeClaude,
  lineaDeSesionDeClaude,
  pideCodigo,
  respuestaDePruebaValida,
  sinUrls,
  ultimaLinea,
  urlDeAutorizacion,
  versionDeSalida,
} from "./motoresLocales.js";

/** La salida REAL de `claude auth status --json` (2.1.263), con los datos personales cambiados. */
const CON_SUSCRIPCION = JSON.stringify({
  loggedIn: true,
  authMethod: "claude.ai",
  apiProvider: "firstParty",
  analyticsDisabled: false,
  projectsDirectory: "C:\\Users\\alguien\\.claude\\projects",
  configDirectory: "C:\\Users\\alguien\\.claude",
  email: "alguien@ejemplo.es",
  orgId: "84ab2383-0000-0000-0000-9f54fd4c9a72",
  orgName: "XOne",
  subscriptionType: "team",
});

/** Y con una `ANTHROPIC_API_KEY` en el entorno: manda la clave, aunque haya login. */
const CON_CLAVE = JSON.stringify({
  loggedIn: true,
  authMethod: "claude.ai",
  apiProvider: "firstParty",
  apiKeySource: "ANTHROPIC_API_KEY",
  orgName: null,
  subscriptionType: null,
});

describe("interpretarAuthStatusDeClaude", () => {
  it("se queda con método, organización y plan, y NADA de correo, id ni rutas", () => {
    const s = interpretarAuthStatusDeClaude(CON_SUSCRIPCION)!;
    expect(s).toEqual({ iniciada: true, porClave: false, metodo: "claude.ai", organizacion: "XOne", plan: "team" });
    const texto = JSON.stringify(s);
    expect(texto).not.toContain("@");
    expect(texto).not.toContain("84ab2383");
    expect(texto).not.toContain("Users");
  });

  it("una clave en el entorno se reconoce: es la que usaría el SDK", () => {
    expect(interpretarAuthStatusDeClaude(CON_CLAVE)).toMatchObject({ porClave: true });
    expect(lineaDeSesionDeClaude(interpretarAuthStatusDeClaude(CON_CLAVE)!)).toBe("Clave de API de una variable de entorno");
  });

  it("sin sesión, y lo que no es la respuesta esperada no se adivina", () => {
    const sin = interpretarAuthStatusDeClaude(JSON.stringify({ loggedIn: false, authMethod: "none" }))!;
    expect(sin).toEqual({ iniciada: false, porClave: false });
    expect(lineaDeSesionDeClaude(sin)).toBe("Sin sesión iniciada");
    expect(interpretarAuthStatusDeClaude("Login method: Claude Team account")).toBeUndefined();
    expect(interpretarAuthStatusDeClaude(JSON.stringify({ loggedIn: "si" }))).toBeUndefined();
  });

  it("la línea dice método, plan y organización", () => {
    expect(lineaDeSesionDeClaude(interpretarAuthStatusDeClaude(CON_SUSCRIPCION)!)).toBe("Cuenta de Claude · Team · XOne");
  });
});

describe("el login de Claude sin TTY", () => {
  /** Lo que imprime de verdad `claude auth login` sin terminal (medido), con el `state` cambiado. */
  const SALIDA =
    "Opening browser to sign in…\nIf the browser didn't open, visit: https://claude.com/cai/oauth/authorize?code=true&client_id=x&state=abc\nPaste code here if prompted > ";

  it("reconoce el enlace de autorización y que pide el código", () => {
    expect(urlDeAutorizacion(SALIDA)).toBe("https://claude.com/cai/oauth/authorize?code=true&client_id=x&state=abc");
    expect(pideCodigo(SALIDA)).toBe(true);
    expect(pideCodigo("Opening browser to sign in…")).toBe(false);
  });

  it("solo abre enlaces de los sitios de Anthropic, y nunca http", () => {
    expect(urlDeAutorizacion("visit: https://claude.com.evil.example/login")).toBeUndefined();
    expect(urlDeAutorizacion("visit: http://claude.ai/login")).toBeUndefined();
    expect(urlDeAutorizacion("visit: https://console.anthropic.com/oauth")).toBe("https://console.anthropic.com/oauth");
  });

  it("un enlace nunca sale en lo que se cuenta", () => {
    expect(sinUrls(SALIDA)).not.toContain("https://");
    expect(ultimaLinea(`fallo\nvisita https://claude.com/x?state=s\n`)).toBe("visita <enlace>");
    // Medido: el error llega pegado al prompt de pegar el código.
    expect(ultimaLinea("Paste code here if prompted > Login failed: Request failed with status code 400")).toBe(
      "Login failed: Request failed with status code 400"
    );
  });
});

describe("las piezas pequeñas", () => {
  it("la versión sale de la salida de cada producto", () => {
    expect(versionDeSalida("2.1.263 (Claude Code)")).toBe("2.1.263");
    expect(versionDeSalida("codex-cli 0.152.1")).toBe("0.152.1");
    expect(versionDeSalida("sin número")).toBeUndefined();
  });

  it("la prueba vale si contesta OK, y no si contesta otra cosa", () => {
    expect(respuestaDePruebaValida("OK")).toBe(true);
    expect(respuestaDePruebaValida("ok.")).toBe(true);
    expect(respuestaDePruebaValida("Invalid API key · Please run /login")).toBe(false);
  });

  it("los motores son los tres externos", () => {
    expect(esMotorLocal("claude-code")).toBe(true);
    expect(esMotorLocal("modelo")).toBe(false);
  });
});

describe("motivoDeModeloDeMotorInaceptable", () => {
  it("vale lo que lista `opencode models`: proveedor/modelo", () => {
    for (const id of ["opencode-go/glm-5.3", "opencode/big-pickle", "openrouter/qwen/qwen3-coder:free", "opencode-go/deepseek-v4.1-flash"]) {
      expect(motivoDeModeloDeMotorInaceptable(id)).toBeUndefined();
    }
  });
  it("y no lo que no tiene esa forma: sin proveedor, con espacios o comillas, o desmedido", () => {
    for (const id of ["glm-5.3", "a/b c", 'a/"b"', "/b", "a/", "a/".padEnd(300, "x")]) {
      expect(motivoDeModeloDeMotorInaceptable(id)).toBeDefined();
    }
  });
});
