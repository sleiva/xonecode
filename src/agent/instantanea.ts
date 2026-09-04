import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { indicePrivado, claseDeCambio } from "./git.js";

const ejecutar = promisify(execFile);

export interface Cambio {
  /** Ruta relativa al PROYECTO, no al repo: el prefijo ya viene recortado. */
  ruta: string;
  clase: "nuevo" | "modificado" | "borrado";
}

export interface Instantanea {
  /** Cómo se tomó. Un deshacer del que no sabes cuál es, no es un deshacer. */
  via: "git" | "huellas";
  cambios(): Promise<Cambio[]>;
  /** El diff con contenido, que es el formato que un modelo lee bien. Vacío sin git. */
  diff(): Promise<string>;
}

/**
 * La foto por árbol de git.
 *
 * Tres propiedades medidas, y cada una resuelve un fallo del enfoque anterior:
 *
 * - **No necesita commits**: `write-tree` escribe desde el índice, HEAD no entra. El repo
 *   del usuario tiene cero commits y funciona igual.
 * - **No necesita ser la raíz del repo**: se acota con `-- .` y las rutas del diff se
 *   recortan con `prefijo` (`git rev-parse --show-prefix`).
 * - **No toca nada del usuario**: ni su índice, ni su staging, ni su `.gitignore`.
 */
async function porArbol(raiz: string, prefijo: string): Promise<Instantanea> {
  const escribirArbol = async (): Promise<string> => {
    const idx = indicePrivado("idx");
    try {
      await ejecutar("git", ["add", "-A", "--", "."], {
        cwd: raiz,
        env: { ...process.env, GIT_INDEX_FILE: idx.ruta },
      });
      const { stdout } = await ejecutar("git", ["write-tree"], {
        cwd: raiz,
        env: { ...process.env, GIT_INDEX_FILE: idx.ruta },
      });
      return stdout.trim();
    } finally {
      idx.limpiar();
    }
  };

  const antes = await escribirArbol();
  // Quita el prefijo del repo para que las rutas se lean desde el proyecto.
  const recortar = (r: string): string => (prefijo && r.startsWith(prefijo) ? r.slice(prefijo.length) : r);

  return {
    via: "git",
    async cambios(): Promise<Cambio[]> {
      const ahora = await escribirArbol();
      if (ahora === antes) return [];
      const { stdout } = await ejecutar("git", ["diff-tree", "-r", "--name-status", antes, ahora, "--", "."], { cwd: raiz });
      return stdout
        .split("\n")
        .filter((l) => l.trim())
        .map((l) => {
          const [estado, ...resto] = l.split("\t");
          return { ruta: recortar(resto[resto.length - 1]!.trim()), clase: claseDeCambio(estado!) };
        });
    },
    async diff(): Promise<string> {
      const ahora = await escribirArbol();
      if (ahora === antes) return "";
      const { stdout } = await ejecutar("git", ["diff", antes, ahora, "--", "."], { cwd: raiz, maxBuffer: 32 * 1024 * 1024 });
      return stdout;
    },
  };
}

const hash = (f: string): string => createHash("sha1").update(readFileSync(f)).digest("hex");

function huellas(raiz: string, base: string, prof = 0): Map<string, string> {
  const m = new Map<string, string>();
  if (prof > 6 || !existsSync(raiz)) return m;
  for (const entrada of readdirSync(raiz)) {
    if (entrada === "node_modules" || entrada === ".git") continue;
    const ruta = join(raiz, entrada);
    try {
      if (statSync(ruta).isDirectory()) for (const [k, v] of huellas(ruta, base, prof + 1)) m.set(k, v);
      else m.set(ruta.slice(base.length + 1), hash(ruta));
    } catch {
      // Un enlace roto no invalida la foto del resto.
    }
  }
  return m;
}

/** Sin git: huellas de contenido. Más lenta, y sin diff — se dice, no se disimula. */
function porHuellas(raiz: string): Instantanea {
  const antes = huellas(raiz, raiz);
  return {
    via: "huellas",
    async cambios(): Promise<Cambio[]> {
      const ahora = huellas(raiz, raiz);
      const salida: Cambio[] = [];
      for (const [ruta, h] of ahora) {
        const previo = antes.get(ruta);
        if (previo === undefined) salida.push({ ruta, clase: "nuevo" });
        else if (previo !== h) salida.push({ ruta, clase: "modificado" });
      }
      for (const ruta of antes.keys()) if (!ahora.has(ruta)) salida.push({ ruta, clase: "borrado" });
      return salida.sort((a, b) => a.ruta.localeCompare(b.ruta));
    },
    async diff(): Promise<string> {
      return ""; // sin git no hay diff con contenido, y se declara en `via`
    },
  };
}

export async function tomarInstantanea(
  raiz: string,
  git: { usable: boolean; prefijo: string }
): Promise<Instantanea> {
  if (!git.usable) return porHuellas(raiz);
  try {
    return await porArbol(raiz, git.prefijo);
  } catch {
    // Git puede fallar por algo que no anticipamos (un hook, permisos). Caer a huellas
    // es peor pero funciona, y `via` lo dice — nunca se finge que la foto es de git.
    return porHuellas(raiz);
  }
}