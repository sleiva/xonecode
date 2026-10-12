/**
 * ngrok en ESTA máquina: dónde está, si contesta, si tiene cuenta, y guardar el authtoken.
 *
 * **La medida manda, nunca un flag recordado**: «instalado» es que `ngrok version` contesta;
 * «con cuenta» es que la configuración que `ngrok config check` NOMBRA tiene un `authtoken`, o
 * que el entorno trae `NGROK_AUTHTOKEN` (ngrok la lee, y el túnel le pasa el entorno sin
 * filtrar). La ruta de esa configuración no sale de aquí, ni la salida de ngrok: un fallo es un
 * texto de `core/tunel.ts#MOTIVOS_DEL_TUNEL`.
 */
import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { MOTIVOS_DEL_TUNEL } from "../../core/tunel.js";
import { localizadorDeAndroid } from "../dispositivos/dispositivosEnMaquina.js";

/** Lo que tarda como mucho una pregunta corta a ngrok (`version`, `config …`). */
export const TOPE_DE_PREGUNTA_A_NGROK_MS = 15_000;

export interface ResultadoDeEjecucion {
  ok: boolean;
  salida: string;
}

export interface DependenciasDeNgrok {
  /** El binario de ngrok, o `undefined` si no está en el PATH. */
  localizar?: () => string | undefined;
  /** Corre un binario SIN shell y devuelve si salió con 0 y su stdout. Nunca lanza. */
  ejecutar?: (binario: string, args: string[]) => Promise<ResultadoDeEjecucion>;
  /** Lee un fichero de texto; lanza si no se puede. */
  leer?: (ruta: string) => string;
  entorno?: Record<string, string | undefined>;
}

/** ngrok en el PATH, con la misma búsqueda que los binarios de las recetas (`.exe` en Windows). */
export function localizarNgrok(
  deps: { plataforma?: string; entorno?: Record<string, string | undefined>; existe?: (ruta: string) => boolean } = {}
): string | undefined {
  const { enPath } = localizadorDeAndroid({
    plataforma: deps.plataforma ?? process.platform,
    entorno: deps.entorno ?? process.env,
    home: homedir(),
    existe: deps.existe ?? existsSync,
  });
  return enPath("ngrok");
}

/**
 * El `execFile` de verdad. Sin shell, y el error NO se propaga: su `message` y su `cmd` llevan
 * los argumentos, y en `config add-authtoken` uno de ellos es el token.
 */
export const ejecutarReal = (binario: string, args: string[]): Promise<ResultadoDeEjecucion> =>
  new Promise((resolver) => {
    try {
      execFile(
        binario,
        args,
        { timeout: TOPE_DE_PREGUNTA_A_NGROK_MS, windowsHide: true, encoding: "utf8" },
        (error, stdout) => resolver({ ok: error === null, salida: typeof stdout === "string" ? stdout : "" })
      );
    } catch {
      resolver({ ok: false, salida: "" });
    }
  });

/**
 * Una línea `authtoken:` con un valor no vacío, arriba (formato v2) o dentro de `agent:` (v3).
 * `authtoken: ""` o sin valor no es una cuenta.
 */
export function configTieneAuthtoken(texto: string): boolean {
  for (const linea of texto.split(/\r?\n/)) {
    const m = /^\s*authtoken:(.*)$/.exec(linea);
    if (m === null) continue;
    const valor = m[1]!.replace(/\s+#.*$/, "").trim().replace(/^(["'])(.*)\1$/, "$2").trim();
    if (valor !== "" && !valor.startsWith("#")) return true;
  }
  return false;
}

export interface MedidaDeNgrok {
  instalado: boolean;
  version?: string;
  cuenta: boolean;
}

export async function medirNgrok(deps: DependenciasDeNgrok = {}): Promise<MedidaDeNgrok> {
  const entorno = deps.entorno ?? process.env;
  const localizar = deps.localizar ?? (() => localizarNgrok({ entorno }));
  const ejecutar = deps.ejecutar ?? ejecutarReal;
  const leer = deps.leer ?? ((ruta: string) => readFileSync(ruta, "utf8"));

  const binario = localizar();
  if (binario === undefined) return { instalado: false, cuenta: false };
  const v = await ejecutar(binario, ["version"]);
  if (!v.ok) return { instalado: false, cuenta: false };
  const version = /ngrok version (\S+)/.exec(v.salida)?.[1];
  const conVersion = version === undefined ? {} : { version };

  if ((entorno.NGROK_AUTHTOKEN ?? "").trim() !== "") return { instalado: true, ...conVersion, cuenta: true };

  const c = await ejecutar(binario, ["config", "check"]);
  const ruta = c.ok ? /Valid configuration file at (.+)/.exec(c.salida)?.[1]?.trim() : undefined;
  let cuenta = false;
  if (ruta !== undefined && ruta !== "") {
    try {
      cuenta = configTieneAuthtoken(leer(ruta));
    } catch {
      cuenta = false;
    }
  }
  return { instalado: true, ...conVersion, cuenta };
}

/** Lo que tiene un authtoken de ngrok: alfanumérico con `_`/`-`, sin espacios. */
const FORMA_DE_AUTHTOKEN = /^[A-Za-z0-9_-]{10,200}$/;

export type ResultadoDeGuardarAuthtoken = { ok: true } | { ok: false; motivo: string };

/**
 * `ngrok config add-authtoken <token>`, por `execFile` y sin shell. El token no se escribe en
 * ningún fichero nuestro ni en un log, y un fallo devuelve un texto FIJO. **Límite declarado**:
 * mientras corre, el token está en la línea de órdenes del proceso (lo ve `ps`): es como ngrok lo
 * recibe, y dura lo que tarda en escribir su configuración.
 */
export async function guardarAuthtoken(token: string, deps: DependenciasDeNgrok = {}): Promise<ResultadoDeGuardarAuthtoken> {
  const limpio = token.trim();
  if (!FORMA_DE_AUTHTOKEN.test(limpio)) return { ok: false, motivo: MOTIVOS_DEL_TUNEL.authtokenSinForma };
  const entorno = deps.entorno ?? process.env;
  const binario = (deps.localizar ?? (() => localizarNgrok({ entorno })))();
  if (binario === undefined) return { ok: false, motivo: MOTIVOS_DEL_TUNEL.noInstalado };
  const r = await (deps.ejecutar ?? ejecutarReal)(binario, ["config", "add-authtoken", limpio]);
  return r.ok ? { ok: true } : { ok: false, motivo: MOTIVOS_DEL_TUNEL.authtokenNoGuardado };
}
