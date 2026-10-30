/**
 * **La shell no escribe el proyecto**: lo que una orden cambia en sus ficheros se DESHACE, y se le dice.
 *
 * Medido en la prueba grande de la calculadora (30-10-2026): con las escrituras del desarrollador rechazadas, el
 * orquestador encargó que el desarrollador dejara la colección en `/artefactos/entrega/` y que el device-controller la
 * copiara al proyecto con `cp` —«las escrituras en la raíz se rechazan, hazlo por shell»—. Eso se salta la decisión de
 * la persona, la conversión a UTF-8 y la cola de escrituras, y dejó un `Menu.xne.bak` suelto. Las colecciones, estilos,
 * scripts, iconos y fuentes los escriben developer-xone y designer-xone con `write_file`/`edit_file`; quien tiene la
 * shell prueba en el aparato y deja lo suyo en `/artefactos/` y `/hotswap/` (dentro de `.xonecode/`).
 *
 * Por qué COMPROBAR y no leer la orden: un `cp`, un `>` o un `sed -i` se reconocen, pero un `python3 -c` o una ruta en
 * una variable no. Mirar el disco antes y después vale escriba la orden como la escriba.
 *
 * **Límites declarados**: un fichero de más de `TOPE_DE_COPIA_BYTES` que la shell cambie se detecta pero no se puede
 * deshacer (se dice); y una escritura que no pasa por el backend de los agentes —la persona guardando en el editor—
 * HECHA MIENTRAS corre una orden se tomaría por de la shell. Entre órdenes se acepta como estado bueno.
 */
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";

/** Lo que no es «el proyecto» para esta guarda: la carpeta de xonecode (artefactos, hotswap, planes…) y la de git. */
export const CARPETAS_FUERA_DE_LA_GUARDA: readonly string[] = [".xonecode", ".git"];

/** Hasta aquí se guarda el contenido de un fichero para poder devolverlo. Una imagen de ejemplo de MyAllXOne pesa 4 MB. */
export const TOPE_DE_COPIA_BYTES = 16 * 1024 * 1024;

interface Copia {
  tam: number;
  mtime: number;
  bytes?: Buffer;
}

export interface CambiosDeLaShell {
  /** Rutas del proyecto (relativas, con `/`) que la orden cambió, creó o borró, ya devueltas a como estaban. */
  deshechos: string[];
  /** Las que cambió y no se pudieron devolver (sin copia: demasiado grandes). */
  sinDeshacer: string[];
}

export interface GuardaDelProyecto {
  /** Antes de una orden. Sin otra en vuelo, toma lo que hay como estado bueno (lo escrito entre órdenes). */
  empezar(): void;
  /** Después: lo que la orden cambió en el proyecto, ya deshecho. */
  terminar(): CambiosDeLaShell;
  /** Una escritura LEGÍTIMA (`write_file`/`edit_file`), por su ruta virtual: es estado bueno aunque haya una orden en vuelo. */
  anotar(rutaVirtual: string): void;
}

const conBarras = (rel: string): string => rel.split(sep).join("/");

/** Los ficheros y carpetas del proyecto, sin las de fuera de la guarda ni enlaces. */
function recorrer(raiz: string): { ficheros: Map<string, { tam: number; mtime: number }>; carpetas: Set<string> } {
  const ficheros = new Map<string, { tam: number; mtime: number }>();
  const carpetas = new Set<string>();
  const pendientes = [raiz];
  while (pendientes.length > 0) {
    const carpeta = pendientes.pop()!;
    let entradas;
    try {
      entradas = readdirSync(carpeta, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entradas) {
      const ruta = join(carpeta, e.name);
      if (carpeta === raiz && CARPETAS_FUERA_DE_LA_GUARDA.includes(e.name)) continue;
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) {
        carpetas.add(conBarras(relative(raiz, ruta)));
        pendientes.push(ruta);
      } else if (e.isFile()) {
        try {
          const st = statSync(ruta);
          ficheros.set(conBarras(relative(raiz, ruta)), { tam: st.size, mtime: st.mtimeMs });
        } catch {
          // Desaparecido entre listar y mirar: no está.
        }
      }
    }
  }
  return { ficheros, carpetas };
}

export function crearGuardaDelProyecto(raiz: string): GuardaDelProyecto {
  const copias = new Map<string, Copia>();
  let carpetasBuenas = new Set<string>();
  let enVuelo = 0;

  const copiar = (rel: string, tam: number, mtime: number): void => {
    let bytes: Buffer | undefined;
    if (tam <= TOPE_DE_COPIA_BYTES) {
      try {
        bytes = readFileSync(join(raiz, rel));
      } catch {
        bytes = undefined;
      }
    }
    copias.set(rel, { tam, mtime, ...(bytes === undefined ? {} : { bytes }) });
  };
  const igual = (c: Copia | undefined, f: { tam: number; mtime: number }): boolean => c !== undefined && c.tam === f.tam && c.mtime === f.mtime;
  const remirar = (rel: string): void => {
    try {
      const st = statSync(join(raiz, rel));
      const c = copias.get(rel);
      if (c !== undefined) copias.set(rel, { ...c, tam: st.size, mtime: st.mtimeMs });
    } catch {
      // Si ya no está, la próxima foto lo dirá.
    }
  };

  return {
    empezar() {
      enVuelo += 1;
      // Con otra orden en vuelo, NO: lo que esa haya cambiado ya pasaría por bueno.
      if (enVuelo > 1) return;
      const { ficheros, carpetas } = recorrer(raiz);
      for (const [rel, f] of ficheros) if (!igual(copias.get(rel), f)) copiar(rel, f.tam, f.mtime);
      for (const rel of [...copias.keys()]) if (!ficheros.has(rel)) copias.delete(rel);
      carpetasBuenas = carpetas;
    },
    terminar() {
      enVuelo = Math.max(0, enVuelo - 1);
      const deshechos: string[] = [];
      const sinDeshacer: string[] = [];
      const { ficheros, carpetas } = recorrer(raiz);
      for (const [rel, f] of ficheros) {
        const c = copias.get(rel);
        if (c === undefined) {
          // NUEVO: no estaba, se quita.
          try {
            rmSync(join(raiz, rel), { force: true });
            deshechos.push(rel);
          } catch {
            sinDeshacer.push(rel);
          }
        } else if (!igual(c, f)) {
          if (c.bytes === undefined) {
            sinDeshacer.push(rel);
            continue;
          }
          writeFileSync(join(raiz, rel), c.bytes);
          remirar(rel);
          deshechos.push(rel);
        }
      }
      for (const [rel, c] of copias) {
        if (ficheros.has(rel)) continue;
        // BORRADO: se devuelve.
        if (c.bytes === undefined) {
          sinDeshacer.push(rel);
          continue;
        }
        mkdirSync(dirname(join(raiz, rel)), { recursive: true });
        writeFileSync(join(raiz, rel), c.bytes);
        remirar(rel);
        deshechos.push(rel);
      }
      // Las carpetas que creó la orden, ya vacías de lo suyo, se quitan (de la más honda a la menos).
      for (const rel of [...carpetas].filter((d) => !carpetasBuenas.has(d)).sort((a, b) => b.length - a.length)) {
        try {
          if (existsSync(join(raiz, rel)) && lstatSync(join(raiz, rel)).isDirectory() && readdirSync(join(raiz, rel)).length === 0) rmSync(join(raiz, rel), { recursive: true });
        } catch {
          // Una carpeta vacía que queda no cambia el proyecto.
        }
      }
      return { deshechos: deshechos.sort(), sinDeshacer: sinDeshacer.sort() };
    },
    anotar(rutaVirtual) {
      const rel = rutaVirtual.replace(/^\/+/, "");
      if (rel === "" || rel.split("/").includes("..") || CARPETAS_FUERA_DE_LA_GUARDA.includes(rel.split("/")[0]!)) return;
      try {
        const st = lstatSync(join(raiz, rel));
        if (!st.isFile()) return;
        copiar(rel, st.size, st.mtimeMs);
        for (let d = dirname(rel); d !== "." && d !== ""; d = dirname(d)) carpetasBuenas.add(d);
      } catch {
        copias.delete(rel);
      }
    },
  };
}

/** Lo que se le dice a quien lanzó la orden. Vacío si no tocó nada. */
export function textoDeCambiosDeshechos(c: CambiosDeLaShell): string {
  if (c.deshechos.length === 0 && c.sinDeshacer.length === 0) return "";
  const lista = (rs: readonly string[]): string => rs.map((r) => `/${r}`).join(", ");
  return [
    "",
    "[XOneCode] Esta orden CAMBIÓ ficheros del PROYECTO, y la shell no escribe el proyecto.",
    ...(c.deshechos.length === 0 ? [] : [`Se han DESHECHO: ${lista(c.deshechos)}.`]),
    ...(c.sinDeshacer.length === 0 ? [] : [`No se pudieron deshacer (demasiado grandes): ${lista(c.sinDeshacer)}.`]),
    "Las colecciones, estilos, scripts y app.xml los escribe developer-xone, y los iconos y fuentes designer-xone, con write_file/edit_file (pasan por la aprobación). " +
      "No los copies con la shell ni des la vuelta por /artefactos/: si una escritura se rechazó, lo decide la persona. Lo tuyo (capturas, logs, ficheros de trabajo) va en /artefactos/.",
  ].join("\n");
}

/**
 * La shell con la guarda puesta: cada orden se comprueba al terminar, y lo deshecho se AÑADE a su salida con un código
 * distinto de 0. Envuelve el backend que ejecuta, así que vale igual para `execute` (la shell libre) que para
 * `ejecutar_script` (la estrecha).
 */
export function conGuardaDelProyecto<B extends { execute(c: string): unknown }>(backend: B, guarda: GuardaDelProyecto): B {
  return new Proxy(backend, {
    get(objetivo, prop, receptor) {
      if (prop !== "execute") return Reflect.get(objetivo, prop, receptor) as unknown;
      return async (comando: string) => {
        guarda.empezar();
        let r: unknown;
        let cambios: CambiosDeLaShell = { deshechos: [], sinDeshacer: [] };
        try {
          r = await objetivo.execute(comando);
        } finally {
          // También si la orden LANZA: lo que dejó a medias no se queda.
          cambios = guarda.terminar();
        }
        const texto = textoDeCambiosDeshechos(cambios);
        if (texto === "") return r;
        const base = (r ?? {}) as { output?: string; exitCode?: number | null };
        return { ...base, output: `${base.output ?? ""}${texto}`, exitCode: base.exitCode === 0 || base.exitCode == null ? 1 : base.exitCode };
      };
    },
  });
}

/**
 * El backend de los agentes con sus escrituras ANOTADAS en la guarda: un `write_file` del desarrollador mientras el
 * device-controller corre una orden es estado bueno, no algo que deshacer. Se anota lo que quedó en el disco (con la
 * conversión a UTF-8 ya hecha), pase lo que pase con la escritura.
 */
export function conEscriturasAnotadas<B extends { write(ruta: string, contenido: string): unknown; edit(ruta: string, viejo: string, nuevo: string, todas?: boolean): unknown }>(
  backend: B,
  guarda: GuardaDelProyecto
): B {
  return new Proxy(backend, {
    get(objetivo, prop, receptor) {
      if (prop !== "write" && prop !== "edit") return Reflect.get(objetivo, prop, receptor) as unknown;
      const original = Reflect.get(objetivo, prop, receptor) as (...a: unknown[]) => unknown;
      return async (ruta: string, ...resto: unknown[]) => {
        try {
          return await original.call(objetivo, ruta, ...resto);
        } finally {
          guarda.anotar(ruta);
        }
      };
    },
  });
}
