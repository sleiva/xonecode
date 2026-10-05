import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import {
  binarioDeClaudeDelSdk,
  crearServicioDeMotoresLocales,
  type DependenciasDeMotoresLocales,
  type ProcesoDeLogin,
} from "./motoresLocales.js";
import { binarioDeCodex } from "../subagentes/subagenteCodex.js";

/** La prueba de PRODUCCIÓN tiene que salir por el mismo puerto que un subagente: se espía aquí. */
const correr = vi.fn(async () => "OK");
vi.mock("../subagentes/subagenteExterno.js", () => ({
  crearSubagenteExterno: () => ({ disponible: async () => true, correr }),
}));

const SIN_SESION = JSON.stringify({ loggedIn: false, authMethod: "none" });
const CON_SESION = JSON.stringify({ loggedIn: true, authMethod: "claude.ai", orgName: "XOne", subscriptionType: "team", email: "a@b.es" });
const POR_CLAVE = JSON.stringify({ loggedIn: true, authMethod: "claude.ai", apiKeySource: "ANTHROPIC_API_KEY" });

type Llamada = { binario: string; args: readonly string[]; entorno: Readonly<Record<string, string | undefined>> };

function falloDeProceso(codigo: unknown, salida: { stdout?: string; stderr?: string } = {}): Error {
  return Object.assign(new Error("Command failed"), { code: codigo, ...salida });
}

function dobles(extra: Partial<DependenciasDeMotoresLocales> & { auth?: string } = {}) {
  const llamadas: Llamada[] = [];
  const cambios = vi.fn();
  const deps: DependenciasDeMotoresLocales = {
    alCambiar: cambios,
    plataforma: "linux",
    entorno: { PATH: "/usr/bin" },
    ahora: () => new Date("2026-10-03T10:00:00.000Z"),
    binarioDeClaude: () => "/sdk/claude",
    ejecutar: async (binario, args, opciones) => {
      llamadas.push({ binario, args, entorno: opciones.entorno });
      if (binario === "/sdk/claude" && args[0] === "--version") return { stdout: "2.1.263 (Claude Code)\n", stderr: "" };
      if (binario === "/sdk/claude" && args[0] === "auth") {
        const heredado = opciones.entorno["ANTHROPIC_API_KEY"] !== undefined;
        return { stdout: heredado ? POR_CLAVE : (extra.auth ?? CON_SESION), stderr: "" };
      }
      throw falloDeProceso("ENOENT");
    },
    ...extra,
  };
  return { deps, llamadas, cambios };
}

describe("medir", () => {
  it("Claude: versión y sesión del binario del SDK, sin correo, y Codex/OpenCode sin instalar", async () => {
    const { deps } = dobles();
    const s = crearServicioDeMotoresLocales(deps);
    await s.medir();
    const [claude, codex, opencode] = s.foto()!;
    expect(claude).toMatchObject({ motor: "claude-code", instalado: "ok", version: "2.1.263", conSesion: true, sesion: "Cuenta de Claude · Team · XOne", admiteLogin: true });
    expect(claude!.conClave).toBeUndefined();
    expect(JSON.stringify(s.foto())).not.toContain("@");
    expect(codex).toMatchObject({ motor: "codex", instalado: "no-encontrado" });
    expect(opencode).toMatchObject({ motor: "opencode", instalado: "no-encontrado" });
  });

  it("con una clave de Anthropic en el entorno se miden los DOS caminos, y se dice", async () => {
    const { deps, llamadas } = dobles({ entorno: { PATH: "/usr/bin", ANTHROPIC_API_KEY: "sk-ant-x" } });
    const s = crearServicioDeMotoresLocales(deps);
    await s.medir();
    const claude = s.foto()![0]!;
    expect(claude).toMatchObject({ conSesion: true, conClave: true });
    const estados = llamadas.filter((l) => l.args[0] === "auth");
    // El limpio (sin la clave) dice la sesión; el heredado, que mandaría la clave.
    expect(estados.map((l) => l.entorno["ANTHROPIC_API_KEY"])).toEqual([undefined, "sk-ant-x"]);
  });

  it("sin sesión `auth status` sale con 1 y AUN ASÍ se lee su JSON (medido)", async () => {
    const base = dobles();
    const s = crearServicioDeMotoresLocales({
      ...base.deps,
      ejecutar: async (binario, args, opciones) => {
        if (args[0] === "auth") throw falloDeProceso(1, { stdout: SIN_SESION, stderr: "" });
        return base.deps.ejecutar!(binario, args, opciones);
      },
    });
    await s.medir();
    expect(s.foto()![0]).toMatchObject({ conSesion: false, sesion: "Sin sesión iniciada" });
    expect(s.foto()![0]!.detalle).toBeUndefined();
  });

  it("sin binario para el sistema, se dice y no se ofrece el login", async () => {
    const { deps } = dobles({ binarioDeClaude: () => undefined });
    const s = crearServicioDeMotoresLocales(deps);
    await s.medir();
    expect(s.foto()![0]).toMatchObject({ instalado: "no-encontrado" });
    expect(s.foto()![0]!.admiteLogin).toBeUndefined();
  });

  it("Codex: la sesión sale de `codex login status` (0 con sesión, otro código sin ella)", async () => {
    let conSesion = true;
    const base = dobles();
    // El binario que se lanza de VERDAD: en un Windows con Codex instalado es su `codex.exe`.
    const codex = binarioDeCodex();
    const s = crearServicioDeMotoresLocales({
      ...base.deps,
      ejecutar: async (binario, args, opciones) => {
        if (binario === codex && args[0] === "--version") return { stdout: "codex-cli 0.152.1", stderr: "" };
        if (binario === codex && args[0] === "login") {
          if (conSesion) return { stdout: "Logged in using ChatGPT\n", stderr: "" };
          throw falloDeProceso(1, { stdout: "", stderr: "Not logged in\n" });
        }
        return base.deps.ejecutar!(binario, args, opciones);
      },
    });
    await s.medir();
    expect(s.foto()![1]).toMatchObject({ instalado: "ok", version: "0.152.1", conSesion: true, sesion: "Logged in using ChatGPT" });
    conSesion = false;
    await s.medir();
    expect(s.foto()![1]).toMatchObject({ conSesion: false, sesion: "Not logged in" });
  });
});

describe("el modelo de OpenCode", () => {
  it("la foto dice que se elige y cuál hay; elegir lo GUARDA y quita la prueba de antes", async () => {
    let guardado: string | undefined = "opencode-go/glm-5.3";
    const guardar = vi.fn((_motor: string, modelo: string | undefined) => void (guardado = modelo));
    const { deps } = dobles({ leerModelo: (m) => (m === "opencode" ? guardado : undefined), guardarModelo: guardar });
    const s = crearServicioDeMotoresLocales(deps);
    await s.medir();
    const deOpencode = () => s.foto()!.find((m) => m.motor === "opencode")!;
    expect(deOpencode()).toMatchObject({ admiteModelo: true, modelo: "opencode-go/glm-5.3" });
    expect(s.foto()!.find((m) => m.motor === "claude-code")!.admiteModelo).toBeUndefined();

    await s.probar("opencode");
    expect(deOpencode().pruebas).toHaveLength(1);
    expect(s.elegirModelo("opencode", " opencode-go/kimi-k3 ")).toBe(true);
    expect(guardar).toHaveBeenLastCalledWith("opencode", "opencode-go/kimi-k3");
    expect(deOpencode()).toMatchObject({ modelo: "opencode-go/kimi-k3" });
    expect(deOpencode().pruebas).toBeUndefined();

    // Vacío lo QUITA; y un nombre sin forma, o un motor que no lo admite, no se guarda.
    expect(s.elegirModelo("opencode", "")).toBe(true);
    expect(guardar).toHaveBeenLastCalledWith("opencode", undefined);
    expect(deOpencode().modelo).toBeUndefined();
    expect(s.elegirModelo("opencode", "sin barra")).toBe(false);
    expect(s.elegirModelo("claude-code", "anthropic/x")).toBe(false);
    expect(guardar).toHaveBeenCalledTimes(2);
  });

  it("si no se pudo escribir, se dice que no", () => {
    const { deps } = dobles({ guardarModelo: () => { throw new Error("settings.json roto"); } });
    expect(crearServicioDeMotoresLocales(deps).elegirModelo("opencode", "opencode-go/glm-5.3")).toBe(false);
  });
});

describe("probar", () => {
  it("la de producción va por el MISMO puerto que un subagente, sin escritura y fuera de un proyecto", async () => {
    correr.mockClear();
    const { deps } = dobles();
    delete deps.probar;
    const s = crearServicioDeMotoresLocales(deps);
    await s.probar("claude-code");
    expect(correr).toHaveBeenCalledTimes(1);
    const peticion = (correr.mock.calls[0] as unknown as [Record<string, unknown>])[0];
    expect(peticion).toMatchObject({ motor: "claude-code", permitirEscritura: false });
    expect(peticion["ejecucion"]).toBeUndefined();
    expect(s.foto()![0]!.pruebas).toEqual([
      expect.objectContaining({ camino: "unico", ok: true, detalle: "contestó «OK»" }),
    ]);
  });

  it("con clave heredada prueba los dos caminos, y el de ejecución lleva el entorno SIN la clave", async () => {
    correr.mockClear();
    const { deps } = dobles({ entorno: { PATH: "/usr/bin", ANTHROPIC_API_KEY: "sk-ant-x" } });
    delete deps.probar;
    const s = crearServicioDeMotoresLocales(deps);
    await s.probar("claude-code");
    const peticiones = correr.mock.calls.map((c) => (c as unknown as [Record<string, unknown>])[0]);
    expect(peticiones).toHaveLength(2);
    expect(peticiones[0]!["ejecucion"]).toBeUndefined();
    const ejecucion = peticiones[1]!["ejecucion"] as { entorno: Record<string, string> };
    expect(ejecucion.entorno["ANTHROPIC_API_KEY"]).toBeUndefined();
    expect(s.foto()![0]!.pruebas!.map((p) => p.camino)).toEqual(["sin-ejecucion", "con-ejecucion"]);
  });

  it("un fallo se cuenta en una línea, sin rutas ni enlaces, y suelta el «probando»", async () => {
    const { deps } = dobles({
      probar: async () => {
        throw new Error("claude-code: Invalid API key · Please run /login at https://claude.com/x en C:\\Users\\alguien\\app");
      },
    });
    const s = crearServicioDeMotoresLocales(deps);
    await s.probar("claude-code");
    const prueba = s.foto()![0]!.pruebas![0]!;
    expect(prueba.ok).toBe(false);
    expect(prueba.detalle).toContain("Invalid API key");
    expect(prueba.detalle).not.toContain("https://");
    expect(prueba.detalle).not.toContain("alguien");
    expect(s.foto()![0]!.probando).toBeUndefined();
  });
});

describe("iniciar sesión", () => {
  function procesoFalso() {
    const p = new EventEmitter() as EventEmitter & { stdout: PassThrough; stderr: PassThrough; stdin: PassThrough; kill: () => boolean };
    p.stdout = new PassThrough();
    p.stderr = new PassThrough();
    p.stdin = new PassThrough();
    p.kill = vi.fn(() => {
      p.emit("exit", null);
      return true;
    });
    return p;
  }

  it("lanza `auth login` del binario del SDK sin la clave, y el enlace NO entra en la foto", async () => {
    const proceso = procesoFalso();
    const lanzar = vi.fn(() => proceso as unknown as ProcesoDeLogin);
    const abrir = vi.fn();
    const { deps } = dobles({ lanzar, abrir, entorno: { PATH: "/usr/bin", ANTHROPIC_API_KEY: "sk-ant-x" } });
    const s = crearServicioDeMotoresLocales(deps);
    expect(s.iniciarSesion("claude-code", "claudeai")).toBe(true);
    expect(lanzar).toHaveBeenCalledWith("/sdk/claude", ["auth", "login", "--claudeai"], expect.anything());
    const entorno = (lanzar.mock.calls[0] as unknown as [string, string[], { entorno: Record<string, string> }])[2].entorno;
    expect(entorno["ANTHROPIC_API_KEY"]).toBeUndefined();

    proceso.stdout.write("Opening browser to sign in…\nIf the browser didn't open, visit: https://claude.com/cai/oauth/authorize?state=s\nPaste code here if prompted > ");
    await new Promise((r) => setImmediate(r));
    expect(s.foto()![0]!.login).toMatchObject({ fase: "esperando", pideCodigo: true });
    expect(JSON.stringify(s.foto())).not.toContain("https://");

    // El navegador lo vuelve a abrir el SERVIDOR, con el enlace que solo él conoce.
    expect(s.abrirNavegador("claude-code")).toBe(true);
    expect(abrir).toHaveBeenCalledWith("https://claude.com/cai/oauth/authorize?state=s");

    // Otro login a la vez, no.
    expect(s.iniciarSesion("claude-code", "claudeai")).toBe(false);

    let escrito = "";
    proceso.stdin.on("data", (d: Buffer) => (escrito += d.toString()));
    expect(s.enviarCodigo("claude-code", "  abc#123  ")).toBe(true);
    expect(s.enviarCodigo("claude-code", "dos\nlineas")).toBe(false);
    await new Promise((r) => setImmediate(r));
    expect(escrito).toBe("abc#123\n");

    proceso.emit("exit", 0);
    expect(s.foto()![0]!.login).toMatchObject({ fase: "hecho" });
  });

  it("cancelar mata el proceso y lo dice; un fallo cuenta su última línea sin enlace", async () => {
    const primero = procesoFalso();
    const segundo = procesoFalso();
    const procesos = [primero, segundo];
    const { deps } = dobles({ lanzar: () => procesos.shift() as unknown as ProcesoDeLogin });
    const s = crearServicioDeMotoresLocales(deps);
    s.iniciarSesion("claude-code", "console");
    expect(s.cancelarSesion("claude-code")).toBe(true);
    expect(s.foto()![0]!.login).toMatchObject({ fase: "cancelado" });

    s.iniciarSesion("claude-code", "claudeai");
    segundo.stdout.write("OAuth error: invalid code, see https://claude.com/help\n");
    await new Promise((r) => setImmediate(r));
    segundo.emit("exit", 1);
    expect(s.foto()![0]!.login).toMatchObject({ fase: "fallo", detalle: "OAuth error: invalid code, see <enlace>" });
  });

  it("solo Claude Code se inicia desde aquí", () => {
    const { deps } = dobles({ lanzar: vi.fn() });
    const s = crearServicioDeMotoresLocales(deps);
    expect(s.iniciarSesion("codex", "claudeai")).toBe(false);
    expect(deps.lanzar).not.toHaveBeenCalled();
  });
});

describe("binarioDeClaudeDelSdk", () => {
  it("busca con la MISMA regla que el SDK: paquete por plataforma y arquitectura, y las dos libc en Linux", () => {
    const pedidos: string[] = [];
    const resolver = (id: string): string => {
      pedidos.push(id);
      if (id.endsWith("-musl/claude")) return `/nm/${id}`;
      throw new Error("no está");
    };
    expect(binarioDeClaudeDelSdk("linux", "x64", resolver)).toBe("/nm/@anthropic-ai/claude-agent-sdk-linux-x64-musl/claude");
    expect(pedidos).toEqual(["@anthropic-ai/claude-agent-sdk-linux-x64/claude", "@anthropic-ai/claude-agent-sdk-linux-x64-musl/claude"]);
    expect(binarioDeClaudeDelSdk("win32", "x64", (id) => id)).toBe("@anthropic-ai/claude-agent-sdk-win32-x64/claude.exe");
    expect(binarioDeClaudeDelSdk("darwin", "arm64", () => { throw new Error("no"); })).toBeUndefined();
  });

  it("y en esta máquina lo encuentra de verdad (el SDK está instalado)", () => {
    expect(binarioDeClaudeDelSdk()).toMatch(/claude(\.exe)?$/);
  });
});
