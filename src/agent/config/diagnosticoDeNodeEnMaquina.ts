import { exec, execFile } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { motivoDeFallo, type DiagnosticoDeNode, type LineaDeDiagnostico } from "../../core/diagnosticoDeNode.js";
import { versionDeSalida } from "../../core/motoresLocales.js";
import { scriptsConRuta } from "../grafo/proyecto.js";
import { skillsConRuta } from "../grafo/skills.js";
import { binarioDeClaudeDelSdk } from "../motores/motoresLocales.js";
import { comoLanzarElSimulador } from "../turno/verificador.js";

/**
 * Las medidas de `core/diagnosticoDeNode.ts` en la máquina de verdad. Cada una con su tope, y ninguna devuelve una ruta:
 * los motivos salen de `motivoDeFallo` (el `code`, nunca el mensaje de Node). Las dependencias se inyectan para que el
 * test componga el diagnóstico sin lanzar nada.
 */

/** Más que esto es «no contesta»: son `--version`, `--help` y una validación de una carpeta vacía. */
export const TOPE_DEL_DIAGNOSTICO_MS = 20_000;

/** El script que se prueba, si está: el que el agente más usa. Si no, el primero. */
const SCRIPT_DE_PRUEBA = "xone-hotswap";

export interface DependenciasDelDiagnostico {
  plataforma?: NodeJS.Platform;
  arquitectura?: string;
  versionDeNode?: string;
  ahora?: () => Date;
  /** Un proceso corto: resuelve con su salida, RECHAZA con un código distinto de 0 (como `execFile`). */
  ejecutar?: (programa: string, args: readonly string[], opciones: { shell: boolean }) => Promise<{ stdout: string }>;
  scripts?: () => { nombre: string; ruta: string }[];
  simulador?: () => { programa: string; previos: string[] };
  versionDeXoneLinter?: () => string | undefined;
  claude?: () => string | undefined;
  versionDelSdk?: () => string | undefined;
}

const execFileP = promisify(execFile);
const execP = promisify(exec);

async function ejecutarReal(programa: string, args: readonly string[], opciones: { shell: boolean }): Promise<{ stdout: string }> {
  // `node` a secas en Windows va por la shell: es como lo encuentra quien lo teclea, y lo que el diagnóstico quiere saber.
  if (opciones.shell) {
    const { stdout } = await execP([programa, ...args].join(" "), { timeout: TOPE_DEL_DIAGNOSTICO_MS, windowsHide: true, encoding: "utf8" });
    return { stdout: String(stdout) };
  }
  const { stdout } = await execFileP(programa, [...args], { timeout: TOPE_DEL_DIAGNOSTICO_MS, windowsHide: true, encoding: "utf8" });
  return { stdout: String(stdout) };
}

function leerVersion(id: string): string | undefined {
  try {
    return (createRequire(import.meta.url)(id) as { version?: string }).version;
  } catch {
    return undefined;
  }
}

function versionDeClaudeDelSdk(): string | undefined {
  try {
    return (createRequire(import.meta.url)("@anthropic-ai/claude-agent-sdk/package.json") as { claudeCodeVersion?: string }).claudeCodeVersion;
  } catch {
    return undefined;
  }
}

/** Mide todo y compone la foto. Nunca lanza: lo que falla es una línea en rojo con su motivo. */
export async function medirDiagnosticoDeNode(deps: DependenciasDelDiagnostico = {}): Promise<DiagnosticoDeNode> {
  const plataforma = deps.plataforma ?? process.platform;
  const ejecutar = deps.ejecutar ?? ejecutarReal;
  const windows = plataforma === "win32";

  const intentar = async (f: () => Promise<string | undefined>): Promise<LineaDeDiagnostico> => {
    try {
      const valor = await f();
      return valor === undefined ? { ok: true } : { ok: true, valor };
    } catch (e) {
      return { ok: false, motivo: motivoDeFallo(e) };
    }
  };

  const nodeEnPath = intentar(async () => versionDeSalida((await ejecutar("node", ["--version"], { shell: windows })).stdout));

  const lista = (deps.scripts ?? (() => scriptsConRuta(undefined, skillsConRuta().map((s) => s.nombre), plataforma)))();
  const elegido = lista.find((s) => s.nombre === SCRIPT_DE_PRUEBA) ?? lista[0];
  const scripts: Promise<DiagnosticoDeNode["scripts"]> =
    elegido === undefined
      ? Promise.resolve({ ok: false, cuantos: 0, motivo: "no se detecta ningún script en las skills" })
      : intentar(async () => {
          // La MISMA llamada que haría el agente: por su nombre fuera de Windows, con `node <ruta>` en Windows.
          await (windows ? ejecutar("node", [elegido.ruta, "--help"], { shell: false }) : ejecutar(elegido.ruta, ["--help"], { shell: false }));
          return `${elegido.nombre} --help`;
        }).then((l) => ({ ...l, cuantos: lista.length }));

  const simulador = intentar(async () => {
    const { programa, previos } = (deps.simulador ?? comoLanzarElSimulador)();
    // Una carpeta que no existe: el simulador contesta su JSON de fallo y sale con 0. Basta para saber que ARRANCA.
    const vacia = mkdtempSync(join(tmpdir(), "xonecode-diag-"));
    try {
      await ejecutar(programa, [...previos, "validate", join(vacia, "nada"), "--json"], { shell: false });
    } catch (e) {
      // Medido con xone-linter 1.5: ante una carpeta que no existe contesta su JSON de fallo y sale con 1. Que conteste
      // su JSON es lo que importa: ARRANCÓ. Solo sin esa respuesta es un fallo de verdad.
      const salida = (e as { stdout?: unknown }).stdout;
      if (typeof salida !== "string" || !salida.includes('"success"')) throw e;
    } finally {
      rmSync(vacia, { recursive: true, force: true });
    }
    const version = (deps.versionDeXoneLinter ?? (() => leerVersion("xone-linter/package.json")))();
    return version === undefined ? undefined : `xone-linter ${version}`;
  });

  const claudeCode: Promise<LineaDeDiagnostico> = (async () => {
    const bin = (deps.claude ?? (() => binarioDeClaudeDelSdk(plataforma, deps.arquitectura ?? process.arch)))();
    if (bin === undefined) return { ok: false, motivo: "el SDK no trae Claude Code para este sistema" };
    // La versión la dice el binario; si no la imprime, la que declara el SDK.
    return intentar(async () => {
      const dicha = versionDeSalida((await ejecutar(bin, ["--version"], { shell: false })).stdout);
      return dicha ?? (deps.versionDelSdk ?? versionDeClaudeDelSdk)();
    });
  })();

  return {
    cuando: (deps.ahora ?? (() => new Date()))().toISOString(),
    servidor: { version: deps.versionDeNode ?? process.version, plataforma, arquitectura: deps.arquitectura ?? process.arch },
    nodeEnPath: await nodeEnPath,
    scripts: await scripts,
    simulador: await simulador,
    claudeCode: await claudeCode,
  };
}
