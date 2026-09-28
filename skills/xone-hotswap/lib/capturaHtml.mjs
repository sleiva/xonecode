/**
 * Una captura PNG de un HTML (un artefacto), con Chrome, SIN depender de que Chrome termine.
 *
 * POR QUÉ EXISTE. Medido en el Chrome instalado (154, macOS): con un `--user-data-dir` NUEVO,
 * `--headless --screenshot` ESCRIBE la captura y el proceso no termina nunca —con `old` y con
 * `new`, con o sin `--no-first-run` o `--use-mock-keychain`—. El `device-controller` lo
 * compuso a mano para ver un diagrama y el turno se quedó colgado hasta el tope de la shell.
 * Sin perfil propio Chrome sí sale, pero usaría el perfil REAL de la persona.
 *
 * Así que aquí manda la MEDIDA, no el código de salida (la misma regla que la instalación de
 * dispositivos y `/pdf`): perfil temporal, se espera a que el PNG exista con un tamaño que ya no
 * cambia, y entonces se mata el GRUPO de procesos —un Chrome deja helpers que sobreviven a
 * matar solo al padre—. Con su propio tope (`TOPE_DE_CAPTURA_MS`), muy por debajo del de la shell.
 *
 * LÍMITE DECLARADO: el HTML se abre con JavaScript y con red, como lo abriría un navegador. Quien
 * llama ya tiene la shell entera, así que esto no le concede nada nuevo; `/pdf` sí lo cierra con
 * una CSP porque lo pide una persona sobre cualquier fichero del proyecto.
 *
 * Fuera de `scripts/` a propósito: esa carpeta va al PATH y cada fichero suyo es un comando. Las
 * piezas que tocan el sistema entran por parámetro, para probar la regla sin un Chrome delante.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/** Un Chrome que no ha dejado un PNG estable en este plazo no va a dejarlo. Una página normal
 *  tarda menos de un segundo. */
export const TOPE_DE_CAPTURA_MS = 30_000;
const CADA_MS = 200;

/** Los navegadores conocidos, por orden. Lista CERRADA, la misma idea que `/pdf`. */
export const NAVEGADORES = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
];

export function navegadorDeCaptura(existe = existsSync) {
  return NAVEGADORES.find((ruta) => existe(ruta));
}

export function argumentosDeCaptura({ html, png, perfil, ancho = 1400, alto = 1000 }) {
  return [
    "--headless",
    "--disable-gpu",
    "--hide-scrollbars",
    "--no-first-run",
    "--no-default-browser-check",
    `--user-data-dir=${perfil}`,
    `--window-size=${ancho},${alto}`,
    `--screenshot=${png}`,
    pathToFileURL(html).href,
  ];
}

/**
 * Espera a que `ruta` exista con un tamaño mayor que cero que no cambia entre dos lecturas.
 * Devuelve los bytes, o `undefined` si se agota el tope.
 */
export async function esperarFicheroEstable({ ruta, topeMs = TOPE_DE_CAPTURA_MS, cadaMs = CADA_MS, tamano, dormir, ahora = Date.now }) {
  const leer = tamano ?? ((r) => (existsSync(r) ? statSync(r).size : -1));
  const esperar = dormir ?? ((ms) => new Promise((resolver) => setTimeout(resolver, ms)));
  const limite = ahora() + topeMs;
  let anterior = -1;
  while (ahora() < limite) {
    const actual = leer(ruta);
    if (actual > 0 && actual === anterior) return actual;
    anterior = actual;
    await esperar(cadaMs);
  }
  return undefined;
}

/** Lanza en su PROPIO grupo, para poder matarlo entero. */
function lanzarReal(navegador, args) {
  const hijo = spawn(navegador, args, { stdio: "ignore", detached: process.platform !== "win32" });
  hijo.on("error", () => {});
  return hijo;
}

function matarGrupoReal(hijo) {
  if (hijo.pid === undefined) return;
  try {
    if (process.platform === "win32") spawn("taskkill", ["/pid", String(hijo.pid), "/T", "/F"], { stdio: "ignore" });
    else process.kill(-hijo.pid, "SIGKILL");
  } catch {
    // Ya no estaba: es lo que se quería.
  }
}

/**
 * Captura `html` en `png`. Nunca LANZA: devuelve `{ bytes }` o `{ error }` con un motivo legible,
 * porque lo lee un modelo que tiene que decidir qué hacer después.
 */
export async function capturarHtml({
  html,
  png,
  ancho,
  alto,
  /** Cómo se BUSCA el navegador: entra por parámetro para que el test no dependa de si la máquina
   *  que lo corre tiene Chrome. */
  buscarNavegador = navegadorDeCaptura,
  navegador = buscarNavegador(),
  lanzar = lanzarReal,
  matar = matarGrupoReal,
  esperar = esperarFicheroEstable,
  topeMs = TOPE_DE_CAPTURA_MS,
}) {
  if (navegador === undefined) {
    return { error: "no hay ningún Chrome/Chromium/Edge conocido en esta máquina para capturar el HTML" };
  }
  if (!existsSync(html)) return { error: `no existe el HTML que capturar: ${html}` };
  // Uno de antes haría creer que ya está: se borra ANTES de lanzar.
  rmSync(png, { force: true });
  const perfil = mkdtempSync(join(tmpdir(), "xone-captura-html-"));
  let hijo;
  try {
    hijo = lanzar(navegador, argumentosDeCaptura({ html, png, perfil, ancho, alto }));
    const bytes = await esperar({ ruta: png, topeMs });
    if (bytes === undefined) {
      return { error: `Chrome no dejó la captura en ${Math.round(topeMs / 1000)} s: la página no terminó de pintarse o Chrome no arrancó` };
    }
    return { bytes };
  } finally {
    // SIEMPRE: con captura o sin ella, Chrome no se va solo.
    if (hijo !== undefined) matar(hijo);
    rmSync(perfil, { recursive: true, force: true });
  }
}
