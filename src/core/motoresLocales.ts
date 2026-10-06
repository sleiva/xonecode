/**
 * Los MOTORES LOCALES —Claude Code, Codex, OpenCode— vistos desde Ajustes: si están, si tienen
 * sesión iniciada y si contestan. Puro: lo que toca la máquina vive en
 * `agent/motores/motoresLocales.ts`.
 *
 * Existe porque un subagente con `motor: claude-code` corre el producto de la máquina con SU
 * login, y hasta ahora nada decía si ese login estaba: `disponible()` solo comprobaba que el SDK
 * se importa, y un motor sin sesión fallaba a mitad de un encargo. La guía que circulaba entre
 * usuarios —PowerShell como administrador, la REPL, `/login`, «deja la consola abierta»— tenía
 * dos cosas de más, medidas: el SDK trae su PROPIO binario (no hace falta instalar Claude Code) y
 * la credencial queda en disco (no hace falta dejar nada abierto).
 */

import type { MotorExterno } from "./ports.js";

/** Los tres, en el orden de las pestañas: Claude Code primero, que es el que más se usa. */
export const MOTORES_LOCALES: readonly MotorExterno[] = ["claude-code", "codex", "opencode"];

export function esMotorLocal(valor: unknown): valor is MotorExterno {
  return typeof valor === "string" && (MOTORES_LOCALES as readonly string[]).includes(valor);
}

/**
 * Por qué ENTORNO se prueba. Un subagente de Claude Code SIN `ejecucion` no recibe `env` y hereda
 * el del proceso —donde `guardarCredencial` deja a propósito la `ANTHROPIC_API_KEY` de
 * xonecode—, y uno CON `ejecucion` recibe el de nuestra shell, sin claves. Medido: con la clave
 * en el entorno, `auth status` contesta `apiKeySource: "ANTHROPIC_API_KEY"` y factura a la clave
 * aunque haya login. Así que con clave son DOS caminos, y se prueban los dos; sin ella, uno.
 */
export type CaminoDePrueba = "unico" | "sin-ejecucion" | "con-ejecucion";

export interface PruebaDeMotorLocal {
  camino: CaminoDePrueba;
  ok: boolean;
  /** La respuesta recortada, o el motivo del fallo en una línea. Sin rutas ni URL. */
  detalle: string;
  ms: number;
  medido: string;
}

export interface LoginDeMotorLocal {
  fase: "esperando" | "hecho" | "fallo" | "cancelado";
  /** El binario dijo «Paste code here if prompted»: se puede pegar el código de la web. */
  pideCodigo?: true;
  detalle?: string;
  desde: string;
}

/**
 * La foto de un motor. Cada campo ausente es «no consta», nunca «no»: un `conSesion` que falta
 * es que no se supo preguntar (OpenCode no tiene una salida de estado que se pueda leer sin
 * adivinar), y entonces la tarjeta no afirma nada y lo dice la prueba.
 */
export interface EstadoDeMotorLocal {
  motor: MotorExterno;
  instalado: "ok" | "no-encontrado" | "fallo";
  version?: string;
  /** Por qué no está o por qué falló, en una línea. */
  detalle?: string;
  conSesion?: boolean;
  /** La sesión en palabras: «Cuenta de Claude · Team · XOne». El CORREO no cruza nunca. */
  sesion?: string;
  /** Claude Code: sin ejecución, el SDK usaría la clave de API de xonecode y no el login. */
  conClave?: true;
  pruebas?: PruebaDeMotorLocal[];
  probando?: true;
  login?: LoginDeMotorLocal;
  /** Esta ejecución puede iniciar sesión desde el botón (hoy, solo Claude Code). */
  admiteLogin?: true;
  /** Y abrir una consola del sistema con el comando ya escrito, como respaldo. */
  admiteConsola?: true;
  /**
   * Este motor necesita un modelo elegido aquí (hoy, solo OpenCode): sin uno, con nuestra
   * configuración cerrada elige solo un modelo de su tier gratuito, que no contesta fuera de su
   * propia consola (medido). Lo usan la prueba y todo subagente sin `modelo:` en su `.md`.
   */
  admiteModelo?: true;
  /** El elegido, `proveedor/modelo`. Ausente es que no hay ninguno. */
  modelo?: string;
  medido: string;
}

/** Los motores a los que se les elige el modelo en Ajustes. */
export const MOTORES_CON_MODELO: readonly MotorExterno[] = ["opencode"];

/**
 * Un modelo de OpenCode tal como lo lista `opencode models`: `proveedor/modelo`. Es la regla del
 * SERVIDOR al guardarlo y al leerlo de `settings.json`; lo que no la cumpla no se escribe en la
 * configuración del hijo, donde un valor raro sería un error de arranque y no un «no vale».
 */
export function motivoDeModeloDeMotorInaceptable(modelo: string): string | undefined {
  if (modelo.length > 200) return "el nombre del modelo es demasiado largo";
  if (!/^[A-Za-z0-9._-]+\/[A-Za-z0-9._:@+/-]+$/.test(modelo)) return "el modelo tiene que ser «proveedor/modelo», como lo lista `opencode models`";
  return undefined;
}

/** Lo que interesa de `claude auth status --json`. */
export interface SesionDeClaude {
  iniciada: boolean;
  /** La clave de una variable de entorno manda sobre el login (medido). */
  porClave: boolean;
  metodo?: string;
  organizacion?: string;
  plan?: string;
}

/**
 * Lee la salida de `claude auth status --json`. Solo se queda con método, organización, plan y
 * de dónde sale la clave: **el correo y el id de organización no salen de aquí**, la misma regla
 * que `nombreDelAsignado` aplica al asignado de Jira. Lo que no es un JSON con `loggedIn`
 * booleano no es una respuesta, y se devuelve `undefined` en vez de adivinar.
 */
export function interpretarAuthStatusDeClaude(salida: string): SesionDeClaude | undefined {
  let crudo: unknown;
  try {
    crudo = JSON.parse(salida);
  } catch {
    return undefined;
  }
  if (typeof crudo !== "object" || crudo === null) return undefined;
  const j = crudo as Record<string, unknown>;
  if (typeof j["loggedIn"] !== "boolean") return undefined;
  const texto = (v: unknown): string | undefined => (typeof v === "string" && v.trim() !== "" ? v.trim() : undefined);
  const metodo = texto(j["authMethod"]);
  const organizacion = texto(j["orgName"]);
  const plan = texto(j["subscriptionType"]);
  return {
    iniciada: j["loggedIn"],
    porClave: texto(j["apiKeySource"]) !== undefined,
    ...(metodo === undefined || metodo === "none" ? {} : { metodo }),
    ...(organizacion === undefined ? {} : { organizacion }),
    ...(plan === undefined ? {} : { plan }),
  };
}

/** La sesión de Claude en una línea, para la tarjeta. */
export function lineaDeSesionDeClaude(s: SesionDeClaude): string {
  if (s.porClave) return "Clave de API de una variable de entorno";
  if (!s.iniciada) return "Sin sesión iniciada";
  const metodo =
    s.metodo === "claude.ai" ? "Cuenta de Claude" : s.metodo === "console" ? "Consola de Anthropic" : (s.metodo ?? "Sesión iniciada");
  const plan = s.plan === undefined ? undefined : s.plan.charAt(0).toUpperCase() + s.plan.slice(1);
  return [metodo, plan, s.organizacion].filter((p): p is string => p !== undefined).join(" · ");
}

/** De `claude --version` («2.1.263 (Claude Code)») o `codex-cli 0.1.0`, el número. */
export function versionDeSalida(salida: string): string | undefined {
  const m = /\d+\.\d+(?:\.\d+)?(?:[-+][0-9A-Za-z.-]+)?/.exec(salida);
  return m === null ? undefined : m[0];
}

const URL = /https?:\/\/\S+/g;

/** Una URL no cruza el cable: la de autorización lleva el `state` y el reto de PKCE. */
export function sinUrls(texto: string): string {
  return texto.replace(URL, "<enlace>");
}

/**
 * Los sitios donde Claude manda iniciar sesión. Lista BLANCA de host: la URL sale de la salida de
 * un proceso, y lo que se abra en el navegador no puede ser lo primero que ese proceso escriba.
 */
const HOSTS_DE_LOGIN = ["claude.com", "claude.ai", "anthropic.com"];

export function urlDeAutorizacion(salida: string): string | undefined {
  for (const m of salida.matchAll(URL)) {
    try {
      const url = new globalThis.URL(m[0]);
      const host = url.hostname;
      if (url.protocol === "https:" && HOSTS_DE_LOGIN.some((h) => host === h || host.endsWith(`.${h}`))) return url.toString();
    } catch {
      // No es una URL: se sigue buscando.
    }
  }
  return undefined;
}

/** El binario de Claude pide el código cuando el navegador no pudo volver solo (medido sin TTY). */
export function pideCodigo(salida: string): boolean {
  return /paste code/i.test(salida);
}

/** La última línea con algo, sin URL y acotada: es lo que se cuenta de un login que falló. */
export function ultimaLinea(salida: string): string | undefined {
  const linea = salida
    .split(/\r?\n/)
    // El prompt de pegar el código no es parte del motivo: el binario lo deja delante, en la
    // misma línea que el error (medido: «Paste code here if prompted > Login failed: …»).
    .map((l) => l.replace(/^.*paste code[^>]*>\s*/i, "").trim())
    .filter((l) => l !== "")
    .pop();
  return linea === undefined ? undefined : recortar(sinUrls(linea));
}

export function recortar(texto: string, tope = 160): string {
  const una = texto.replace(/\s+/g, " ").trim();
  return una.length > tope ? `${una.slice(0, tope - 1)}…` : una;
}

/** Lo que se le pide al motor para probarlo. Corto a propósito: se paga en cada prueba. */
export const TAREA_DE_PRUEBA = "Responde exactamente con la palabra OK y nada más.";
export const INSTRUCCIONES_DE_PRUEBA =
  "Esto es una prueba de conexión de XOneCode. No uses ninguna herramienta: contesta solo con lo que se te pide.";

/** Contestó y dijo lo que se le pidió. Que conteste otra cosa también es un fallo que contar. */
export function respuestaDePruebaValida(texto: string): boolean {
  return /\bOK\b/i.test(texto);
}
