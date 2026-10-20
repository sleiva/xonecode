import { describe, expect, it } from "vitest";
import { medirDiagnosticoDeNode, type DependenciasDelDiagnostico } from "./diagnosticoDeNodeEnMaquina.js";

type Llamada = { programa: string; args: readonly string[]; shell: boolean; entorno?: Record<string, string> };

/** Un diagnóstico con TODO doblado: nada se lanza de verdad. */
function con(extra: Partial<DependenciasDelDiagnostico> = {}, responder?: (l: Llamada) => Promise<{ stdout: string }>) {
  const llamadas: Llamada[] = [];
  const deps: DependenciasDelDiagnostico = {
    plataforma: "darwin",
    arquitectura: "arm64",
    versionDeNode: "v22.1.0",
    ahora: () => new Date("2026-10-16T08:00:00Z"),
    scripts: () => [
      { nombre: "xone-captura-android", ruta: "/s/xone-captura-android" },
      { nombre: "xone-hotswap", ruta: "/s/xone-hotswap" },
    ],
    simulador: () => ({ programa: "/node", previos: ["/linter/cli.js"] }),
    versionDeXoneLinter: () => "1.5.0",
    claude: () => "/sdk/claude",
    versionDelSdk: () => "2.1.301",
    entornoDeAgente: () => ({ PATH: "/agente/bin" }),
    navegador: () => "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    nodeDelServidor: "/srv/node",
    git: async () => "git version 2.47.0 (Apple Git-154)",
    ejecutar: async (programa, args, opciones) => {
      const l = { programa, args, shell: opciones.shell, ...(opciones.entorno === undefined ? {} : { entorno: opciones.entorno }) };
      llamadas.push(l);
      if (responder !== undefined) return responder(l);
      if (programa === "node" && args[0] === "--version") return { stdout: "v22.1.0\n" };
      if (programa === "/sdk/claude") return { stdout: "2.1.301 (Claude Code)\n" };
      return { stdout: "" };
    },
    ...extra,
  };
  return { deps, llamadas };
}

describe("medirDiagnosticoDeNode", () => {
  it("en macOS: todo verde, el script por su nombre y xone-hotswap el elegido", async () => {
    const { deps, llamadas } = con();
    const d = await medirDiagnosticoDeNode(deps);
    expect(d).toEqual({
      cuando: "2026-10-16T08:00:00.000Z",
      servidor: { version: "v22.1.0", plataforma: "darwin", arquitectura: "arm64" },
      nodeEnPath: { ok: true, valor: "22.1.0" },
      scripts: { ok: true, valor: "xone-hotswap --help", cuantos: 2 },
      simulador: { ok: true, valor: "xone-linter 1.5.0" },
      claudeCode: { ok: true, valor: "2.1.301" },
      // Solo el nombre del programa: la ruta no cruza.
      navegador: { ok: true, valor: "Google Chrome" },
      git: { ok: true, valor: "2.47.0" },
    });
    expect(llamadas).toContainEqual({ programa: "/s/xone-hotswap", args: ["--help"], shell: false, entorno: { PATH: "/agente/bin" } });
  });

  it("en Windows: `node` por la shell CON EL ENTORNO DE LOS AGENTES, y el script con el Node del servidor, como el agente", async () => {
    const { deps, llamadas } = con({ plataforma: "win32" });
    await medirDiagnosticoDeNode(deps);
    expect(llamadas).toContainEqual({ programa: "node", args: ["--version"], shell: true, entorno: { PATH: "/agente/bin" } });
    expect(llamadas).toContainEqual({ programa: "/srv/node", args: ["/s/xone-hotswap", "--help"], shell: false, entorno: { PATH: "/agente/bin" } });
  });

  it("un PATH de AGENTE roto sale en rojo aunque el del servidor esté bien (medido: verde en Windows con «node: command not found»)", async () => {
    const { deps } = con({}, async (l) => {
      if (l.programa === "node" && l.entorno?.["PATH"] === "/agente/bin") throw Object.assign(new Error("/x"), { code: 127 });
      return { stdout: "v1" };
    });
    expect((await medirDiagnosticoDeNode(deps)).nodeEnPath).toEqual({ ok: false, motivo: "salió con código 127" });
  });

  it("el simulador que contesta su JSON de fallo y sale con 1 ARRANCÓ; sin JSON es un fallo, con su code y sin rutas", async () => {
    const conJson = con({}, async (l) => {
      if (l.programa === "/node") throw Object.assign(new Error("/ruta"), { code: 1, stdout: '{"success": false, "error": "x"}' });
      return { stdout: "v1" };
    });
    expect((await medirDiagnosticoDeNode(conJson.deps)).simulador).toEqual({ ok: true, valor: "xone-linter 1.5.0" });
    const sinJson = con({}, async (l) => {
      if (l.programa === "/node") throw Object.assign(new Error("spawn /node ENOENT"), { code: "ENOENT" });
      return { stdout: "v1" };
    });
    expect((await medirDiagnosticoDeNode(sinJson.deps)).simulador).toEqual({ ok: false, motivo: "no se encuentra el programa (ENOENT)" });
  });

  it("sin navegador lo dice (medido en Windows: el crítico no podía medir la maqueta)", async () => {
    const { deps } = con({ navegador: () => undefined });
    expect((await medirDiagnosticoDeNode(deps)).navegador).toEqual({ ok: false, motivo: "no hay Chrome, Edge, Chromium ni Brave: el crítico no podrá medir la maqueta" });
  });

  /** IXCODE-60: sin git una copia se baja sin repo y no se puede revisar ni subir; ningún diagnóstico lo decía. */
  it("sin git lo dice en su línea, con el porqué y sin rutas", async () => {
    const { deps } = con({
      git: async () => {
        throw Object.assign(new Error("spawn git ENOENT /usr/bin"), { code: "ENOENT" });
      },
    });
    expect((await medirDiagnosticoDeNode(deps)).git).toEqual({ ok: false, motivo: "no se encuentra el programa (ENOENT)" });
  });

  it("sin scripts, o sin el binario de Claude Code para el sistema, cada uno lo dice en SU línea", async () => {
    const { deps } = con({ scripts: () => [], claude: () => undefined });
    const d = await medirDiagnosticoDeNode(deps);
    expect(d.scripts).toEqual({ ok: false, cuantos: 0, motivo: "no se detecta ningún script en las skills" });
    expect(d.claudeCode).toEqual({ ok: false, motivo: "el SDK no trae Claude Code para este sistema" });
    expect(d.nodeEnPath.ok).toBe(true);
  });
});
