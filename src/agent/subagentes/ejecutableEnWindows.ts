/**
 * El ejecutable de VERDAD de un motor externo en Windows.
 *
 * npm instala `opencode` y `codex` como un `.cmd`, y `spawn("opencode")` sin shell busca solo
 * `opencode.exe` en el PATH: `ENOENT`. La medida de Ajustes pasaba por la shell y daba «Listo»;
 * lanzarlo fallaba. Medido sobre opencode 1.18.34 y sobre el `@openai/codex` de npm.
 *
 * No se arregla con `shell: true` ni con `cmd.exe /c`: Parar mata al hijo (`PeticionExterna.senal`),
 * y el hijo sería `cmd.exe` —el motor nieto sobreviviría—. Se lee el shim y se lanza el NATIVO:
 *
 * - **OpenCode**: el shim apunta a un `.exe` (`"%dp0%\node_modules\opencode-ai\bin\opencode.exe"`),
 *   y se lanza ese.
 * - **Codex**: el shim apunta a un script de Node (`…\@openai\codex\bin\codex.js`) que a su vez
 *   lanza el `codex.exe` de su paquete de plataforma. Tampoco se lanza `node codex.js`: en Windows
 *   matar a `node` no le reenvía nada al nieto. Se busca el `codex.exe` con la MISMA regla que el
 *   script (`@openai/codex-win32-<arch>/vendor/<triple>/bin/codex.exe`), igual que con el binario
 *   del SDK de Claude. Lo único que el script añade al entorno son `CODEX_MANAGED_*`, que solo
 *   deciden cómo sugiere actualizarse.
 *
 * Un shim de otro script de Node no se persigue: se devuelve `undefined` y quien llama se queda
 * con el nombre a secas. Fuera del PATH × PATHEXT no se acepta nada: npm deja además un `opencode`
 * SIN extensión, que es el shim de sh para Git Bash y no se puede lanzar.
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { win32 } from "node:path";

const { delimiter, join, dirname } = win32;

/** Lo que el resolvedor necesita de la máquina, para poder probarlo sin ella. */
export interface MaquinaWindows {
  readonly path: string | undefined;
  readonly pathext: string | undefined;
  readonly esFichero: (ruta: string) => boolean;
  readonly leer: (ruta: string) => string;
  /** `process.arch`: decide el paquete de plataforma de Codex. */
  readonly arquitectura?: string;
}

const PATHEXT_POR_OMISION = ".COM;.EXE;.BAT;.CMD";

/**
 * Lo que lanza un shim `.cmd` de npm, RELATIVO a la carpeta del shim: un `.exe` o un `.js`. Es la
 * ÚLTIMA ruta `"%dp0%\…"` del fichero: el de un script de Node nombra antes `"%dp0%\node.exe"`
 * en el `IF EXIST` que busca un Node al lado, y ese no es el destino.
 */
export function destinoDeShimDeNpm(texto: string): string | undefined {
  const todas = [...texto.matchAll(/"%dp0%\\([^"%]+?\.(?:exe|js))"/gi)];
  return todas.at(-1)?.[1];
}

/** El triple de Rust de cada arquitectura de Windows, como lo nombra `codex.js`. */
const TRIPLE_DE_WINDOWS: Readonly<Record<string, string>> = {
  x64: "x86_64-pc-windows-msvc",
  arm64: "aarch64-pc-windows-msvc",
};

/**
 * El `codex.exe` que lanzaría `…\@openai\codex\bin\codex.js`. El script lo resuelve con
 * `require.resolve("@openai/codex-win32-<arch>/package.json")` desde su paquete (anidado o
 * subido al `node_modules` de al lado) y cae a `vendor/` dentro del propio paquete.
 */
export function nativoDeCodex(script: string, maquina: MaquinaWindows): string | undefined {
  if (!/[\\/]@openai[\\/]codex[\\/]bin[\\/]codex\.js$/i.test(script)) return undefined;
  const arquitectura = maquina.arquitectura ?? "x64";
  const triple = TRIPLE_DE_WINDOWS[arquitectura];
  if (triple === undefined) return undefined;
  const paquete = dirname(dirname(script));
  const plataforma = `codex-win32-${arquitectura}`;
  const enVendor = (raiz: string): string => join(raiz, "vendor", triple, "bin", "codex.exe");
  const candidatos = [
    enVendor(join(paquete, "node_modules", "@openai", plataforma)),
    enVendor(join(dirname(paquete), plataforma)),
    enVendor(paquete),
  ];
  return candidatos.find((c) => maquina.esFichero(c));
}

/** Lo que lanza un shim, ya resuelto a un nativo que existe, o `undefined`. */
function nativoDeShim(shim: string, maquina: MaquinaWindows): string | undefined {
  let texto: string;
  try {
    texto = maquina.leer(shim);
  } catch {
    return undefined;
  }
  const destino = destinoDeShimDeNpm(texto);
  if (destino === undefined) return undefined;
  const ruta = join(dirname(shim), destino);
  if (/\.js$/i.test(ruta)) return nativoDeCodex(ruta, maquina);
  return maquina.esFichero(ruta) ? ruta : undefined;
}

/** La ruta del ejecutable que de verdad se lanza para `nombre`, o `undefined` si no hay uno. */
export function resolverEnWindows(nombre: string, maquina: MaquinaWindows): string | undefined {
  const extensiones = (maquina.pathext ?? PATHEXT_POR_OMISION)
    .split(";")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.startsWith("."));
  for (const carpeta of (maquina.path ?? "").split(delimiter)) {
    if (carpeta.trim() === "") continue;
    for (const ext of extensiones) {
      const candidato = join(carpeta, nombre + ext);
      if (!maquina.esFichero(candidato)) continue;
      if (ext === ".exe" || ext === ".com") return candidato;
      if (ext !== ".cmd" && ext !== ".bat") continue;
      return nativoDeShim(candidato, maquina);
    }
  }
  return undefined;
}

const MAQUINA_REAL: MaquinaWindows = {
  get path() {
    return process.env["PATH"] ?? process.env["Path"];
  },
  get pathext() {
    return process.env["PATHEXT"];
  },
  esFichero: (ruta) => {
    try {
      return existsSync(ruta) && statSync(ruta).isFile();
    } catch {
      return false;
    }
  },
  leer: (ruta) => readFileSync(ruta, "utf8"),
  arquitectura: process.arch,
};

/**
 * El binario que se le pasa a `spawn`. Fuera de Windows, tal cual. En Windows, un nombre a secas o
 * un `.cmd` se resuelven a su nativo; una ruta a un `.exe` (lo que alguien puso en `OPENCODE_BIN`
 * o `CODEX_BIN`) se respeta. Lo que no se resuelve se devuelve como llegó: el `ENOENT` dirá lo que
 * pasa.
 */
export function ejecutableParaLanzar(binario: string, maquina: MaquinaWindows = MAQUINA_REAL, plataforma = process.platform): string {
  if (plataforma !== "win32") return binario;
  if (/\.(cmd|bat)$/i.test(binario)) {
    if (!maquina.esFichero(binario)) return binario;
    return nativoDeShim(binario, maquina) ?? binario;
  }
  if (/[\\/]/.test(binario)) return binario;
  return resolverEnWindows(binario, maquina) ?? binario;
}
