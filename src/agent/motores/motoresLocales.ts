/**
 * Los motores locales en la máquina: medir si están y con qué sesión, PROBARLOS con un encargo de
 * verdad, e iniciar la sesión de Claude Code desde un botón. Las reglas puras están en
 * `core/motoresLocales.ts`; aquí solo hay procesos.
 *
 * Tres decisiones que no se ven en el código:
 *
 * - **Se mide el binario que el SDK LANZA**, el de su paquete de plataforma, y no el `claude` del
 *   PATH: pueden ser versiones distintas (medido: 2.1.263 frente a 2.1.287), y medir el otro
 *   diría algo de un programa que los subagentes no corren. Sin respaldo al PATH, a propósito.
 * - **La prueba sale por el MISMO puerto que un encargo real** (`crearSubagenteExterno().correr`),
 *   no por un `query()` montado aquí: una prueba con sus propias opciones mediría otra cosa —el
 *   patrón de fallo de siempre, una composición que solo existe donde nadie la usa—.
 * - **`auth login` funciona sin TTY** (medido con el binario del SDK y un `CLAUDE_CONFIG_DIR`
 *   aislado): abre el navegador él solo, imprime un enlace de respaldo y espera «Paste code here
 *   if prompted». Así que el botón lanza el proceso y, si la web enseña un código, se le pasa
 *   por `stdin`. **El enlace no cruza el cable** (la regla de los conectores): si el navegador
 *   no se abrió, lo vuelve a abrir el SERVIDOR. Límite declarado: por un túnel no sirve.
 */

import { exec, execFile, spawn, type ChildProcess } from "node:child_process";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  INSTRUCCIONES_DE_PRUEBA,
  MOTORES_CON_MODELO,
  MOTORES_LOCALES,
  motivoDeModeloDeMotorInaceptable,
  TAREA_DE_PRUEBA,
  interpretarAuthStatusDeClaude,
  lineaDeSesionDeClaude,
  pideCodigo,
  recortar,
  respuestaDePruebaValida,
  sinUrls,
  ultimaLinea,
  urlDeAutorizacion,
  versionDeSalida,
  type CaminoDePrueba,
  type EstadoDeMotorLocal,
  type PruebaDeMotorLocal,
} from "../../core/motoresLocales.js";
import type { MotorExterno } from "../../core/ports.js";
import { entornoDeShell } from "../../core/shellDeAgente.js";
import { mensajeSeguro } from "../../core/trazaDeErrores.js";
import { describirFallo } from "../dispositivos/dispositivosEnMaquina.js";
import { abrirEnSistema } from "../cloudstudio/cloudstudioMcp.js";
import { crearSubagenteExterno } from "../subagentes/subagenteExterno.js";
import { binarioDeCodex } from "../subagentes/subagenteCodex.js";
import { binarioDeOpencode } from "../subagentes/subagenteOpencode.js";
import { guardarModeloDeOpencode, modeloDeOpencodeGuardado } from "../config/settingsEnDisco.js";

/** `--version` y `auth status`: si tardan más, el binario no está bien. */
export const TOPE_DE_MEDIDA_MS = 15_000;
/** Un primer arranque de Claude Code en frío tarda; dos minutos es «no contesta». */
export const TOPE_DE_PRUEBA_MS = 120_000;
/** Lo que se espera a que la persona termine en el navegador. */
export const TOPE_DE_LOGIN_MS = 10 * 60_000;

type Entorno = Readonly<Record<string, string | undefined>>;

export interface Salida {
  stdout: string;
  stderr: string;
}

/** El proceso del login, con lo justo para doblarlo en un test. */
export type ProcesoDeLogin = Pick<ChildProcess, "stdout" | "stderr" | "stdin" | "on" | "kill">;

export interface DependenciasDeMotoresLocales {
  /** Se llama tras cada cambio de la foto: quien lo monta emite el mensaje. */
  alCambiar: () => void;
  plataforma?: string;
  entorno?: Entorno;
  ahora?: () => Date;
  binarioDeClaude?: () => string | undefined;
  /** Un proceso corto. Rechaza con un código distinto de 0, como `execFile`. */
  ejecutar?: (binario: string, args: readonly string[], opciones: { timeout: number; entorno: Entorno }) => Promise<Salida>;
  lanzar?: (binario: string, args: readonly string[], opciones: { entorno: Entorno }) => ProcesoDeLogin;
  /** Un encargo de prueba al motor. Devuelve la respuesta; lanza si no la hay. */
  probar?: (peticion: { motor: MotorExterno; camino: CaminoDePrueba; entornoLimpio: Record<string, string>; senal: AbortSignal }) => Promise<string>;
  abrir?: (url: string) => void;
  /** Abre una terminal del sistema con el comando. `false` si en este sistema no se sabe. */
  abrirTerminal?: (binario: string, args: readonly string[], entorno: Entorno) => boolean;
  /** El modelo elegido para un motor de `MOTORES_CON_MODELO`, leído en cada medida. */
  leerModelo?: (motor: MotorExterno) => string | undefined;
  /** Y guardarlo; `undefined` lo quita. Lanza si no se pudo escribir. */
  guardarModelo?: (motor: MotorExterno, modelo: string | undefined) => void;
}

export interface ServicioDeMotoresLocales {
  /** La última foto. Ausente hasta la primera medida. */
  foto(): EstadoDeMotorLocal[] | undefined;
  medir(): Promise<void>;
  probar(motor: MotorExterno): Promise<void>;
  /** `false` si no se puede (otro login en curso, o el motor no lo admite). */
  iniciarSesion(motor: MotorExterno, modo: "claudeai" | "console"): boolean;
  enviarCodigo(motor: MotorExterno, codigo: string): boolean;
  cancelarSesion(motor: MotorExterno): boolean;
  abrirNavegador(motor: MotorExterno): boolean;
  abrirConsola(motor: MotorExterno): boolean;
  /** `false` si el motor no admite modelo, el nombre no vale o no se pudo guardar. */
  elegirModelo(motor: MotorExterno, modelo: string | undefined): boolean;
}

/**
 * El `claude` del paquete de plataforma del SDK, con la MISMA regla con que lo busca el SDK
 * (`sdk.mjs`): `@anthropic-ai/claude-agent-sdk-<plataforma>-<arquitectura>/claude[.exe]`, y en
 * Linux las dos variantes de libc. Resuelto por el cargador de módulos, nunca contando `..`.
 */
export function binarioDeClaudeDelSdk(
  plataforma: string = process.platform,
  arquitectura: string = process.arch,
  resolver: (id: string) => string = createRequire(import.meta.url).resolve
): string | undefined {
  const base = "@anthropic-ai/claude-agent-sdk";
  const paquetes =
    plataforma === "linux" ? [`${base}-linux-${arquitectura}`, `${base}-linux-${arquitectura}-musl`] : [`${base}-${plataforma}-${arquitectura}`];
  const sufijo = plataforma === "win32" ? ".exe" : "";
  for (const paquete of paquetes) {
    try {
      return resolver(`${paquete}/claude${sufijo}`);
    } catch {
      // No está esta variante: la siguiente.
    }
  }
  return undefined;
}

/** El entorno de NUESTRA shell, sin claves de API: el de un subagente con `ejecucion`. */
function limpio(entorno: Entorno): Record<string, string> {
  return entornoDeShell({ entorno });
}

/** ¿El entorno heredado lleva algo de Anthropic que el limpio quita? Entonces son dos caminos. */
function heredaClaveDeAnthropic(entorno: Entorno): boolean {
  const sin = limpio(entorno);
  return Object.keys(entorno).some((k) => k.startsWith("ANTHROPIC_") && entorno[k] !== undefined && !(k in sin));
}

const execFileP = promisify(execFile);
const execP = promisify(exec);

/**
 * Un proceso corto de verdad. Un nombre a secas en Windows va por la shell: `codex` y `opencode`
 * los instala npm como `.cmd`, y `execFile` sin shell no los encuentra. Los argumentos son
 * constantes de este fichero, así que componer la línea no abre ninguna inyección.
 */
async function ejecutarReal(binario: string, args: readonly string[], opciones: { timeout: number; entorno: Entorno }): Promise<Salida> {
  const env = opciones.entorno as NodeJS.ProcessEnv;
  if (process.platform === "win32" && !/[\\/]/.test(binario)) {
    const { stdout, stderr } = await execP([binario, ...args].join(" "), { timeout: opciones.timeout, env, windowsHide: true, encoding: "utf8" });
    return { stdout: String(stdout), stderr: String(stderr) };
  }
  const { stdout, stderr } = await execFileP(binario, [...args], { timeout: opciones.timeout, env, windowsHide: true, encoding: "utf8" });
  return { stdout: String(stdout), stderr: String(stderr) };
}

function lanzarReal(binario: string, args: readonly string[], opciones: { entorno: Entorno }): ProcesoDeLogin {
  return spawn(binario, [...args], { env: opciones.entorno as NodeJS.ProcessEnv, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
}

/**
 * Una terminal con el comando ya escrito: el respaldo de cuando el botón no puede (el navegador
 * es de otra máquina, o la persona prefiere verlo). Solo Windows y macOS, donde se sabe qué
 * terminal hay; en el resto no se ofrece, que es mejor que un botón que no hace nada.
 */
function abrirTerminalReal(binario: string, args: readonly string[], entorno: Entorno): boolean {
  const env = entorno as NodeJS.ProcessEnv;
  if (process.platform === "win32") {
    const comando = `& '${binario.replace(/'/g, "''")}' ${args.join(" ")}`;
    const hijo = spawn("cmd.exe", ["/c", "start", "", "powershell", "-NoExit", "-Command", comando], { env, detached: true, stdio: "ignore" });
    hijo.on("error", () => {});
    hijo.unref();
    return true;
  }
  if (process.platform === "darwin") {
    const linea = `'${binario.replace(/'/g, `'\\''`)}' ${args.join(" ")}`;
    const guion = `tell application "Terminal" to do script "${linea.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
    const hijo = spawn("osascript", ["-e", guion, "-e", 'tell application "Terminal" to activate'], { env, detached: true, stdio: "ignore" });
    hijo.on("error", () => {});
    hijo.unref();
    return true;
  }
  return false;
}

/**
 * La prueba de producción: el MISMO puerto que corre un subagente, sin política de escritura
 * (nada que escribir) y en una carpeta vacía fuera de cualquier proyecto. Con `con-ejecucion`
 * lleva el entorno limpio, que es lo que recibe un agente con `ejecucion: true`.
 */
async function probarReal(peticion: {
  motor: MotorExterno;
  camino: CaminoDePrueba;
  entornoLimpio: Record<string, string>;
  senal: AbortSignal;
}): Promise<string> {
  const cwd = join(tmpdir(), "xonecode-prueba-de-motor");
  mkdirSync(cwd, { recursive: true });
  return crearSubagenteExterno({}).correr({
    motor: peticion.motor,
    cwd,
    instrucciones: INSTRUCCIONES_DE_PRUEBA,
    tarea: TAREA_DE_PRUEBA,
    permitirEscritura: false,
    agente: "prueba-de-conexion",
    senal: peticion.senal,
    ...(peticion.camino === "con-ejecucion" ? { ejecucion: { scripts: [], entorno: peticion.entornoLimpio, lecturas: [] } } : {}),
  });
}

/**
 * La salida de un proceso que contesta TAMBIÉN cuando sale con otro código: `claude auth status`
 * sin sesión imprime su JSON y sale con 1 (medido). Un tope o un binario que no está sí lanzan.
 */
async function salidaAunqueFalle(promesa: Promise<Salida>): Promise<string> {
  try {
    return (await promesa).stdout;
  } catch (error) {
    const e = error as { stdout?: unknown; killed?: boolean; code?: unknown } | null;
    if (e !== null && typeof e === "object" && e.killed !== true && typeof e.code === "number" && typeof e.stdout === "string") {
      return e.stdout;
    }
    throw error;
  }
}

/** Lo que se cuenta de un error: una línea, sin rutas ni enlaces. */
function motivoDe(error: unknown, topeMs: number): string {
  return recortar(sinUrls(mensajeSeguro(describirFallo(error, topeMs))));
}

export function crearServicioDeMotoresLocales(deps: DependenciasDeMotoresLocales): ServicioDeMotoresLocales {
  const plataforma = deps.plataforma ?? process.platform;
  const entorno = (): Entorno => deps.entorno ?? process.env;
  const ahora = (): string => (deps.ahora ?? (() => new Date()))().toISOString();
  const binarioDeClaude = deps.binarioDeClaude ?? (() => binarioDeClaudeDelSdk());
  const ejecutar = deps.ejecutar ?? ejecutarReal;
  const lanzar = deps.lanzar ?? lanzarReal;
  const probarMotor = deps.probar ?? probarReal;
  const abrir = deps.abrir ?? ((url: string) => abrirEnSistema(new URL(url)));
  const abrirTerminal = deps.abrirTerminal ?? abrirTerminalReal;
  const admiteConsola = deps.abrirTerminal !== undefined || plataforma === "win32" || plataforma === "darwin";
  const leerModelo = deps.leerModelo ?? ((motor: MotorExterno) => (motor === "opencode" ? modeloDeOpencodeGuardado() : undefined));
  const guardarModelo =
    deps.guardarModelo ??
    ((motor: MotorExterno, modelo: string | undefined) => {
      if (motor === "opencode") guardarModeloDeOpencode(undefined, modelo);
    });
  /** Lo que la tarjeta necesita para el selector: que lo admite, y cuál hay. */
  const deModelo = (motor: MotorExterno): Partial<EstadoDeMotorLocal> => {
    if (!MOTORES_CON_MODELO.includes(motor)) return {};
    const modelo = leerModelo(motor);
    return { admiteModelo: true, ...(modelo === undefined ? {} : { modelo }) };
  };

  const estados = new Map<MotorExterno, EstadoDeMotorLocal>();
  const logins = new Map<MotorExterno, { hijo: ProcesoDeLogin; url?: string; cancelado: boolean; tope: ReturnType<typeof setTimeout> }>();
  let medida: Promise<void> | undefined;

  const poner = (motor: MotorExterno, cambio: Partial<EstadoDeMotorLocal>, quitar: (keyof EstadoDeMotorLocal)[] = []): void => {
    const antes = estados.get(motor) ?? { motor, instalado: "fallo" as const, medido: ahora() };
    const nuevo: EstadoDeMotorLocal = { ...antes, ...cambio };
    for (const campo of quitar) delete nuevo[campo];
    estados.set(motor, nuevo);
    deps.alCambiar();
  };

  async function medirClaude(): Promise<Partial<EstadoDeMotorLocal> & { instalado: EstadoDeMotorLocal["instalado"] }> {
    const bin = binarioDeClaude();
    if (bin === undefined) {
      return { instalado: "no-encontrado", detalle: "el SDK de Claude Code no trae binario para este sistema" };
    }
    let version: string | undefined;
    try {
      version = versionDeSalida((await ejecutar(bin, ["--version"], { timeout: TOPE_DE_MEDIDA_MS, entorno: entorno() })).stdout);
    } catch (error) {
      return { instalado: "fallo", detalle: motivoDe(error, TOPE_DE_MEDIDA_MS) };
    }
    const base = { instalado: "ok" as const, admiteLogin: true as const, ...(admiteConsola ? { admiteConsola: true as const } : {}), ...(version === undefined ? {} : { version }) };
    try {
      const sesion = interpretarAuthStatusDeClaude(
        await salidaAunqueFalle(ejecutar(bin, ["auth", "status", "--json"], { timeout: TOPE_DE_MEDIDA_MS, entorno: limpio(entorno()) }))
      );
      if (sesion === undefined) return { ...base, detalle: "no se pudo leer el estado de la sesión" };
      let conClave = false;
      if (heredaClaveDeAnthropic(entorno())) {
        const heredada = interpretarAuthStatusDeClaude(
          await salidaAunqueFalle(ejecutar(bin, ["auth", "status", "--json"], { timeout: TOPE_DE_MEDIDA_MS, entorno: entorno() }))
        );
        conClave = heredada?.porClave === true;
      }
      return { ...base, conSesion: sesion.iniciada, sesion: lineaDeSesionDeClaude(sesion), ...(conClave ? { conClave: true } : {}) };
    } catch (error) {
      return { ...base, detalle: `no se pudo leer la sesión: ${motivoDe(error, TOPE_DE_MEDIDA_MS)}` };
    }
  }

  /**
   * Codex y OpenCode: si están y qué versión. La sesión de Codex se lee de `codex login status`,
   * que sale con 0 solo con sesión (y dice cuál en una línea). La de OpenCode NO se lee: `auth
   * list` pinta una tabla para personas, y adivinar de ella sería afirmar sin medida — lo dice la
   * prueba. Límite declarado: ninguno de los dos estaba instalado donde se escribió esto.
   */
  async function medirOtro(motor: "codex" | "opencode"): Promise<Partial<EstadoDeMotorLocal> & { instalado: EstadoDeMotorLocal["instalado"] }> {
    const bin = motor === "codex" ? binarioDeCodex() : binarioDeOpencode();
    let version: string | undefined;
    try {
      const s = await ejecutar(bin, ["--version"], { timeout: TOPE_DE_MEDIDA_MS, entorno: entorno() });
      version = versionDeSalida(`${s.stdout}\n${s.stderr}`);
    } catch (error) {
      const e = error as { code?: unknown; stderr?: unknown } | null;
      const noEsta =
        e?.code === "ENOENT" ||
        e?.code === 127 ||
        (e?.code === 1 && typeof e.stderr === "string" && /not recognized|no se reconoce/i.test(e.stderr));
      return noEsta
        ? { instalado: "no-encontrado", detalle: `${motor} no está instalado o no está en el PATH` }
        : { instalado: "fallo", detalle: motivoDe(error, TOPE_DE_MEDIDA_MS) };
    }
    const base = { instalado: "ok" as const, ...(version === undefined ? {} : { version }) };
    if (motor === "opencode") return base;
    try {
      const s = await ejecutar(bin, ["login", "status"], { timeout: TOPE_DE_MEDIDA_MS, entorno: entorno() });
      const linea = ultimaLinea(`${s.stdout}\n${s.stderr}`);
      return { ...base, conSesion: true, ...(linea === undefined ? {} : { sesion: linea }) };
    } catch (error) {
      const e = error as { stdout?: unknown; stderr?: unknown; killed?: boolean } | null;
      if (e?.killed === true) return { ...base, detalle: motivoDe(error, TOPE_DE_MEDIDA_MS) };
      const linea = ultimaLinea(`${typeof e?.stdout === "string" ? e.stdout : ""}\n${typeof e?.stderr === "string" ? e.stderr : ""}`);
      return { ...base, conSesion: false, sesion: linea ?? "Sin sesión iniciada" };
    }
  }

  async function medirTodos(): Promise<void> {
    const medidas = await Promise.all(
      MOTORES_LOCALES.map(async (motor) => [motor, motor === "claude-code" ? await medirClaude() : await medirOtro(motor)] as const)
    );
    const medido = ahora();
    for (const [motor, medidaDelMotor] of medidas) {
      const antes = estados.get(motor);
      // Lo que no es de la medida —las pruebas, el login en curso, «probando»— se conserva:
      // volver a medir no borra la respuesta que se acaba de ver.
      const conserva: Partial<EstadoDeMotorLocal> = {
        ...(antes?.pruebas === undefined ? {} : { pruebas: antes.pruebas }),
        ...(antes?.probando === undefined ? {} : { probando: antes.probando }),
        ...(antes?.login === undefined ? {} : { login: antes.login }),
      };
      estados.set(motor, { motor, ...medidaDelMotor, ...deModelo(motor), ...conserva, medido });
    }
    deps.alCambiar();
  }

  const servicio: ServicioDeMotoresLocales = {
    foto: () => (estados.size === 0 ? undefined : MOTORES_LOCALES.flatMap((m) => estados.get(m) ?? [])),

    medir(): Promise<void> {
      // Dos «Volver a comprobar» seguidos esperan a la MISMA medida en vez de lanzar otra.
      medida ??= medirTodos().finally(() => {
        medida = undefined;
      });
      return medida;
    },

    async probar(motor: MotorExterno): Promise<void> {
      if (estados.get(motor)?.probando === true) return;
      const caminos: CaminoDePrueba[] =
        motor === "claude-code" && heredaClaveDeAnthropic(entorno()) ? ["sin-ejecucion", "con-ejecucion"] : ["unico"];
      poner(motor, { probando: true });
      const pruebas: PruebaDeMotorLocal[] = [];
      for (const camino of caminos) {
        const controlador = new AbortController();
        const tope = setTimeout(() => controlador.abort(), TOPE_DE_PRUEBA_MS);
        const inicio = Date.now();
        try {
          const respuesta = await probarMotor({ motor, camino, entornoLimpio: limpio(entorno()), senal: controlador.signal });
          const ok = respuestaDePruebaValida(respuesta);
          pruebas.push({
            camino,
            ok,
            detalle: ok ? `contestó «${recortar(sinUrls(respuesta), 60)}»` : `contestó otra cosa: «${recortar(sinUrls(respuesta), 100)}»`,
            ms: Date.now() - inicio,
            medido: ahora(),
          });
        } catch (error) {
          const detalle = controlador.signal.aborted
            ? `no contestó en ${Math.round(TOPE_DE_PRUEBA_MS / 1000)} s`
            : recortar(sinUrls(mensajeSeguro(error instanceof Error ? error.message : String(error))));
          pruebas.push({ camino, ok: false, detalle, ms: Date.now() - inicio, medido: ahora() });
        } finally {
          clearTimeout(tope);
        }
      }
      poner(motor, { pruebas }, ["probando"]);
    },

    iniciarSesion(motor, modo): boolean {
      if (motor !== "claude-code" || logins.has(motor)) return false;
      const bin = binarioDeClaude();
      if (bin === undefined) {
        poner(motor, { login: { fase: "fallo", detalle: "el SDK de Claude Code no trae binario para este sistema", desde: ahora() } });
        return false;
      }
      let hijo: ProcesoDeLogin;
      try {
        hijo = lanzar(bin, ["auth", "login", modo === "console" ? "--console" : "--claudeai"], { entorno: limpio(entorno()) });
      } catch (error) {
        poner(motor, { login: { fase: "fallo", detalle: motivoDe(error, TOPE_DE_LOGIN_MS), desde: ahora() } });
        return false;
      }
      const desde = ahora();
      let salida = "";
      const vivo = {
        hijo,
        cancelado: false,
        tope: setTimeout(() => {
          vivo.cancelado = true;
          hijo.kill();
          cerrar("fallo", `no se terminó en ${Math.round(TOPE_DE_LOGIN_MS / 60_000)} minutos`);
        }, TOPE_DE_LOGIN_MS),
      } as { hijo: ProcesoDeLogin; url?: string; cancelado: boolean; tope: ReturnType<typeof setTimeout> };
      logins.set(motor, vivo);
      poner(motor, { login: { fase: "esperando", desde } });

      let cerrado = false;
      const cerrar = (fase: "hecho" | "fallo" | "cancelado", detalle?: string): void => {
        if (cerrado) return;
        cerrado = true;
        clearTimeout(vivo.tope);
        logins.delete(motor);
        poner(motor, { login: { fase, desde, ...(detalle === undefined ? {} : { detalle }) } });
        // La sesión acaba de cambiar (o no): la foto se rehace en vez de suponerla. DESPUÉS de la
        // medida que esté en vuelo, no unida a ella: esa empezó antes del login y diría «sin
        // sesión» al lado de «Sesión iniciada».
        void (medida ?? Promise.resolve())
          .catch(() => {})
          .then(() => servicio.medir())
          .catch(() => {});
      };
      const alSalir = (trozo: Buffer | string): void => {
        salida += trozo.toString();
        vivo.url ??= urlDeAutorizacion(salida);
        const login = estados.get(motor)?.login;
        if (pideCodigo(salida) && login?.fase === "esperando" && login.pideCodigo !== true) {
          poner(motor, { login: { ...login, pideCodigo: true } });
        }
      };
      hijo.stdout?.on("data", alSalir);
      hijo.stderr?.on("data", alSalir);
      hijo.on("error", (error) => cerrar("fallo", motivoDe(error, TOPE_DE_LOGIN_MS)));
      hijo.on("exit", (codigo) => {
        if (vivo.cancelado) cerrar("cancelado");
        else if (codigo === 0) cerrar("hecho");
        else cerrar("fallo", ultimaLinea(salida) ?? `terminó con código ${String(codigo)}`);
      });
      return true;
    },

    enviarCodigo(motor, codigo): boolean {
      const vivo = logins.get(motor);
      const limpioDeCodigo = codigo.trim();
      // Un código de OAuth es una línea de texto imprimible y corta: otra cosa no se le escribe
      // a un proceso, que leería un salto de línea de más como una segunda respuesta.
      if (vivo === undefined || limpioDeCodigo === "" || limpioDeCodigo.length > 2000 || /[\u0000-\u001f\u007f]/.test(limpioDeCodigo)) {
        return false;
      }
      vivo.hijo.stdin?.write(`${limpioDeCodigo}\n`);
      return true;
    },

    cancelarSesion(motor): boolean {
      const vivo = logins.get(motor);
      if (vivo === undefined) return false;
      vivo.cancelado = true;
      vivo.hijo.kill();
      return true;
    },

    abrirNavegador(motor): boolean {
      const url = logins.get(motor)?.url;
      if (url === undefined) return false;
      abrir(url);
      return true;
    },

    abrirConsola(motor): boolean {
      if (motor !== "claude-code" || !admiteConsola) return false;
      const bin = binarioDeClaude();
      if (bin === undefined) return false;
      return abrirTerminal(bin, ["auth", "login"], limpio(entorno()));
    },

    elegirModelo(motor, modelo): boolean {
      if (!MOTORES_CON_MODELO.includes(motor)) return false;
      const limpioDeModelo = modelo?.trim() === "" ? undefined : modelo?.trim();
      if (limpioDeModelo !== undefined && motivoDeModeloDeMotorInaceptable(limpioDeModelo) !== undefined) return false;
      try {
        guardarModelo(motor, limpioDeModelo);
      } catch {
        return false;
      }
      // La prueba de antes era con OTRO modelo: se quita, para que nadie lea un «✓» que ya no vale.
      poner(motor, deModelo(motor), ["pruebas", ...(limpioDeModelo === undefined ? (["modelo"] as const) : [])]);
      return true;
    },
  };
  return servicio;
}
