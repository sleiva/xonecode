/**
 * La mudanza de una vez de las copias locales que siguen en el reparto VIEJO
 * (`<base>/<entorno>/workspace/<proyecto>`) al de ahora (`<workspace>/<entorno>/<proyecto>`).
 *
 * **No es cosmética, y por eso se hace sola.** `dentroDelWorkspace` es lo que decide si el
 * harness puede commitear al cerrar cada turno, y compara la raíz contra el workspace: con
 * el reparto nuevo, una copia que se quedara en el sitio viejo dejaría de estar dentro y los
 * commits por turno se pararían EN SILENCIO — que es exactamente el fallo mudo que este repo
 * persigue en todas partes. Dejarlas donde están no era una opción; dejarlas y avisar,
 * tampoco, porque el aviso saldría en cada arranque para siempre.
 *
 * La decisión de QUÉ se muda es pura y vive en `core/mudanzaDeWorkspace.ts`. Aquí solo está
 * lo que toca disco: mover, reescribir los dos almacenes con raíces absolutas y CONTARLO.
 */

import { randomUUID, createHash } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, readdirSync, renameSync, rmdirSync, unlinkSync } from "node:fs";
import { cp, lstat, mkdir, readdir, readlink, rename, rm, statfs, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, relative } from "node:path";

import { mudanzasPendientes, planDeCambioDeBase, rutaMudada, type Mudanza } from "../../core/mudanzaDeWorkspace.js";
import { remapearRaicesDeTareas } from "../tareas/tareasEnDisco.js";
import { BASURA_DEL_SO } from "../sesiones/gitSync.js";

export interface ResultadoDeMudanza {
  mudadas: number;
  chocadas: number;
}

/** Las CARPETAS que cuelgan de una ruta. Un fichero suelto no es un proyecto, y un
 *  `.DS_Store` es un nombre de segmento tan válido como cualquier otro. */
function carpetasDe(ruta: string): readonly string[] {
  try {
    return readdirSync(ruta, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    return [];
  }
}

/**
 * Retira una carpeta del reparto viejo que ya no pinta nada — y solo si NO queda nada del
 * usuario dentro.
 *
 * `rmdir` no vacía carpetas, así que él solo ya es la garantía. Lo único que se borra antes
 * es la BASURA DEL SO, y de la lista CERRADA que `gitSync.ts` ya mantiene para lo mismo: sin
 * esto, un `.DS_Store` que Finder dejó al mirar la carpeta bastaba para que el husco vacío
 * se quedara en `~/.xonecode` para siempre, que es justo lo que esta mudanza venía a quitar.
 * Medido sobre un caso real: los dos husos tenían uno.
 */
function retirarSiSobra(carpeta: string): void {
  try {
    const dentro = readdirSync(carpeta);
    if (dentro.length > 0 && dentro.every((n) => (BASURA_DEL_SO as readonly string[]).includes(n))) {
      for (const basura of dentro) unlinkSync(join(carpeta, basura));
    }
    rmdirSync(carpeta);
  } catch {
    // No estaba vacía, o no estaba, o no se pudo tocar. En los tres casos no hay nada que
    // hacer: la carpeta vieja de más es un adorno, no un fallo que contar.
  }
}

export function mudarWorkspaceLegado(opciones: {
  /** La casa donde viven `settings.json` y `tareas/indice.json`. Inyectable por los tests. */
  casa?: string;
  /** La base con el reparto viejo: `settings.workspace` si estaba puesto, o `~/.xonecode`. */
  legado: string;
  /** El workspace de ahora. */
  workspace: string;
  entornos: readonly string[];
  /** Al TERMINAL y no al cable: por ahí viajan rutas de la máquina (`sinRutas`). */
  escribir: (texto: string) => void;
  /** Cómo se mueve una copia. Por omisión `renameSync`; entra por parámetro porque el fallo
   *  que importa —EXDEV, un workspace en otro volumen— no se puede provocar en un temporal. */
  mover?: (desde: string, hacia: string) => void;
}): ResultadoDeMudanza {
  const mover = opciones.mover ?? renameSync;
  const { mudanzas, chocadas } = mudanzasPendientes({
    legado: opciones.legado,
    workspace: opciones.workspace,
    entornos: opciones.entornos,
    existe: existsSync,
    listar: carpetasDe,
  });

  if (mudanzas.length === 0 && chocadas.length === 0) return { mudadas: 0, chocadas: 0 };

  // Solo las que SE MOVIERON de verdad reescriben una ruta guardada: apuntar el índice a un
  // sitio donde la carpeta no llegó a estar es peor que no tocarlo.
  const hechas: Mudanza[] = [];
  for (const mudanza of mudanzas) {
    try {
      mkdirSync(dirname(mudanza.hacia), { recursive: true });
      mover(mudanza.desde, mudanza.hacia);
      hechas.push(mudanza);
    } catch (error) {
      const motivo = error instanceof Error ? error.message : String(error);
      opciones.escribir(`no se pudo mudar «${mudanza.proyecto}» (${mudanza.entorno}): ${motivo}\n`);
    }
  }

  if (hechas.length > 0) {
    const traducir = (raiz: string): string | undefined => rutaMudada(raiz, hechas);
    // Un fallo no puede tumbar el arranque de la consola: las copias ya están mudadas, y
    // lo que queda es un ajuste que se vuelve a poner a mano.
    //
    // **Queda UNO**, y antes eran dos: el otro reescribía las claves de
    // `settings.sinAprobacion`, que era el ajuste por RUTA de «escribe sin preguntar». Ese
    // ajuste se retiró entero cuando el modo de escritura pasó a vivir en la SESIÓN
    // (`core/modoDeEscritura.ts`), así que ya no hay ninguna ruta absoluta suya que
    // traducir. El bucle se queda porque el siguiente almacén con rutas dentro entra aquí.
    for (const [que, remapear] of [
      // Su raíz NO es la `casa`: `casa` es el HOME (`rutaSettings` le añade `.xonecode`) y
      // la base de las tareas es ya la carpeta `.xonecode`. Se traduce aquí, a la vista.
      ["la cola de tareas", () => remapearRaicesDeTareas(join(opciones.casa ?? homedir(), ".xonecode"), traducir)],
    ] as const) {
      try {
        remapear();
      } catch (error) {
        const motivo = error instanceof Error ? error.message : String(error);
        opciones.escribir(`las copias se mudaron, pero no se pudo actualizar ${que}: ${motivo}\n`);
      }
    }

    // La carpeta vieja se retira SOLO si quedó vacía, y eso lo garantiza `rmdir` por
    // construcción: nunca vacía nada. Un `notas.txt` del usuario ahí dentro la deja en pie,
    // que es la respuesta correcta.
    for (const entorno of new Set(hechas.map((m) => m.entorno))) {
      for (const carpeta of [join(opciones.legado, entorno, "workspace"), join(opciones.legado, entorno)]) {
        retirarSiSobra(carpeta);
      }
    }

    opciones.escribir(
      `${hechas.length} ${hechas.length === 1 ? "copia local mudada" : "copias locales mudadas"} al workspace: ` +
        `${hechas.map((m) => `${m.proyecto} (${m.entorno})`).join(", ")}\n`
    );
  }

  for (const choque of chocadas) {
    // Callarlo dejaría dos copias del mismo proyecto y a nadie sabiendo cuál mira la consola.
    opciones.escribir(
      `«${choque.proyecto}» (${choque.entorno}) NO se mudó: ya hay una copia en el workspace. ` +
        `La vieja sigue donde estaba y no se ha tocado.\n`
    );
  }

  return { mudadas: hechas.length, chocadas: chocadas.length };
}

/** Las carpetas que cuelgan de una ruta: la foto de disco que pide `planDeCambioDeBase`. */
export function planDeCambioDeBaseEnDisco(opciones: {
  desde: string;
  hacia: string;
  casaXonecode: string;
}): ReturnType<typeof planDeCambioDeBase> {
  return planDeCambioDeBase({ ...opciones, existe: existsSync, listar: carpetasDe });
}

/** En qué va una mudanza de base. Sin rutas: viaja por el cable tal cual. */
export interface ProgresoDeMudanza {
  fase: "comprobar" | "copiar" | "verificar" | "borrar";
  proyecto?: string;
  entorno?: string;
  indice?: number;
  total?: number;
}

export type ResultadoDeCambioDeBase =
  | { estado: "hecho"; mudadas: number; restos: string[]; avisos: string[] }
  | { estado: "rechazado"; motivo: string };

/** Lo que un árbol tiene, fichero a fichero, para compararlo con su copia. */
type Huella = Map<string, string>;

/** Bytes de todo lo que cuelga de `raiz`, sin seguir enlaces. */
async function tamanyoDe(raiz: string): Promise<number> {
  const info = await lstat(raiz);
  if (!info.isDirectory()) return info.isFile() ? info.size : 0;
  let total = 0;
  for (const nombre of await readdir(raiz)) total += await tamanyoDe(join(raiz, nombre));
  return total;
}

/** Lo que ocupa lo que se va a mudar, en megas redondeados hacia arriba: para el aviso. */
export async function megasDeLasMudanzas(mudanzas: readonly Mudanza[]): Promise<number> {
  let bytes = 0;
  for (const m of mudanzas) bytes += await tamanyoDe(m.desde);
  return Math.ceil(bytes / (1024 * 1024));
}

function sha256De(fichero: string): Promise<string> {
  return new Promise((resolver, rechazar) => {
    const hash = createHash("sha256");
    createReadStream(fichero)
      .on("data", (trozo) => hash.update(trozo))
      .on("error", rechazar)
      .on("end", () => resolver(hash.digest("hex")));
  });
}

/**
 * La huella de un árbol: por cada entrada, su ruta RELATIVA y lo que es — una carpeta, un
 * enlace con su destino, o un fichero con su tamaño y su SHA-256. Se lee en streaming: un
 * `checkpoint.sqlite` pesa cientos de megas y no tiene por qué caber entero en memoria.
 */
async function huellaDe(raiz: string, dentro = raiz, huella: Huella = new Map()): Promise<Huella> {
  for (const nombre of await readdir(dentro)) {
    const ruta = join(dentro, nombre);
    const clave = relative(raiz, ruta).replace(/\\/g, "/");
    const info = await lstat(ruta);
    if (info.isSymbolicLink()) huella.set(clave, `enlace:${await readlink(ruta)}`);
    else if (info.isDirectory()) {
      huella.set(clave, "carpeta");
      await huellaDe(raiz, ruta, huella);
    } else if (info.isFile()) huella.set(clave, `fichero:${info.size}:${await sha256De(ruta)}`);
    else huella.set(clave, "otro");
  }
  return huella;
}

/** Por qué la copia NO es igual al original, o `undefined` si lo es byte a byte. */
async function diferenciaEntre(original: string, copia: string): Promise<string | undefined> {
  const [a, b] = await Promise.all([huellaDe(original), huellaDe(copia)]);
  for (const [clave, valor] of a) {
    if (!b.has(clave)) return `falta «${clave}» en la copia`;
    if (b.get(clave) !== valor) return `«${clave}» no es igual en la copia`;
  }
  for (const clave of b.keys()) if (!a.has(clave)) return `la copia tiene «${clave}» de más`;
  return undefined;
}

/** Margen sobre lo que ocupa lo que se copia: el disco no se llena hasta el último byte. */
const MARGEN_DE_ESPACIO = 1.1;
const RESERVA_DE_ESPACIO = 64 * 1024 * 1024;

/**
 * CAMBIAR EL WORKSPACE MUDANDO lo que hay dentro: copiar, VERIFICAR y solo entonces borrar el
 * origen. La decisión de QUÉ se muda es pura (`core/mudanzaDeWorkspace.ts#planDeCambioDeBase`);
 * aquí está lo que toca disco, en un orden que no deja nada a medias:
 *
 * 1. **comprobar**: el destino se puede escribir y cabe lo que se copia, con margen;
 * 2. **copiar** cada proyecto a una carpeta OCULTA hermana de su destino
 *    (`.<proyecto>.llegando-<uuid>`). Se COPIA siempre, también en el mismo disco: un
 *    `rename` entre volúmenes da EXDEV, y así el origen sigue intacto hasta el final;
 * 3. **verificar** cada copia contra su original, fichero a fichero con SHA-256 — la igualdad
 *    byte a byte es más fuerte que cualquier comprobación de git, y `git fsck` abortaría por
 *    defectos que ya traía el origen. Una sola diferencia descarta TODAS las copias;
 * 4. con todo verificado, las ocultas pasan a su nombre, y SOLO ENTONCES se guarda el
 *    workspace nuevo y se reescribe `proyecto.raiz` del índice de tareas;
 * 5. **borrar** el origen por lápida (renombrar y luego borrar, el molde de
 *    `borrarCopiaDeProyecto`). Si algo lo bloquea, el cambio YA está hecho y se dice como
 *    `restos`: deshacerlo con la base nueva escrita sería peor.
 *
 * Hasta el paso 4 la base vieja es la válida y en el destino solo hay carpetas ocultas, que se
 * limpian. Quien llama garantiza que nada escribe en la base mientras tanto
 * (`vestibulo.mudarWorkspace`).
 */
export async function mudarBaseDeWorkspace(opciones: {
  desde: string;
  hacia: string;
  mudanzas: readonly Mudanza[];
  /** `~/.xonecode`: donde vive el índice de tareas. */
  casaXonecode: string;
  guardarWorkspace: (ruta: string) => void;
  progreso?: (p: ProgresoDeMudanza) => void;
  /** Cómo se copia un proyecto. Inyectable: una copia que sale MAL no se provoca a mano. */
  copiar?: (desde: string, hacia: string) => Promise<void>;
  /** Bytes libres en el destino, o ausente si no se sabe. Inyectable por los tests. */
  espacioLibre?: (ruta: string) => Promise<number | undefined>;
  /** Cómo se renombra el origen a su lápida. Inyectable: un fichero bloqueado por otro
   *  programa no se provoca en un temporal. */
  enterrar?: (desde: string, lapida: string) => Promise<void>;
  /** Cómo se retira una copia ya puesta en el destino al deshacer el paso 4. Inyectable por lo
   *  mismo que `enterrar`: una carpeta que no se deja borrar no se provoca en un temporal. */
  retirar?: (copia: string) => Promise<void>;
}): Promise<ResultadoDeCambioDeBase> {
  const { mudanzas, progreso } = opciones;
  const copiar =
    opciones.copiar ??
    ((desde: string, hacia: string) =>
      cp(desde, hacia, { recursive: true, verbatimSymlinks: true, errorOnExist: true, force: false, preserveTimestamps: true }));
  const espacioLibre =
    opciones.espacioLibre ??
    (async (ruta: string) => {
      try {
        const s = await statfs(ruta);
        return Number(s.bavail) * Number(s.bsize);
      } catch {
        return undefined;
      }
    });
  const total = mudanzas.length;

  // 1. Comprobar. Un error de Node lleva la ruta absoluta en su mensaje: se dice su `code`.
  progreso?.({ fase: "comprobar" });
  try {
    await mkdir(opciones.hacia, { recursive: true });
    const prueba = join(opciones.hacia, `.xonecode-prueba-${randomUUID()}`);
    await writeFile(prueba, "");
    await unlink(prueba);
  } catch (error) {
    return { estado: "rechazado", motivo: `no se puede escribir en la carpeta nueva (${codigoDe(error)})` };
  }
  if (total > 0) {
    let ocupa = 0;
    for (const m of mudanzas) ocupa += await tamanyoDe(m.desde);
    const libre = await espacioLibre(opciones.hacia);
    if (libre !== undefined && libre < ocupa * MARGEN_DE_ESPACIO + RESERVA_DE_ESPACIO) {
      return {
        estado: "rechazado",
        motivo: `no cabe: hay que copiar ${megas(ocupa)} y en la carpeta nueva quedan ${megas(libre)} libres`,
      };
    }
  }

  // 2 y 3. Copiar y verificar, cada una a su carpeta oculta.
  const ocultas: string[] = [];
  const descartar = async (): Promise<void> => {
    for (const oculta of ocultas) await rm(oculta, { recursive: true, force: true }).catch(() => {});
  };
  for (const [i, m] of mudanzas.entries()) {
    const oculta = join(dirname(m.hacia), `.${m.proyecto}.llegando-${randomUUID()}`);
    try {
      progreso?.({ fase: "copiar", proyecto: m.proyecto, entorno: m.entorno, indice: i + 1, total });
      await mkdir(dirname(m.hacia), { recursive: true });
      ocultas.push(oculta);
      await copiar(m.desde, oculta);
      progreso?.({ fase: "verificar", proyecto: m.proyecto, entorno: m.entorno, indice: i + 1, total });
      const diferencia = await diferenciaEntre(m.desde, oculta);
      if (diferencia !== undefined) {
        await descartar();
        return {
          estado: "rechazado",
          motivo: `la copia de «${m.proyecto}» no salió igual (${diferencia}): no se ha cambiado nada`,
        };
      }
    } catch (error) {
      await descartar();
      return { estado: "rechazado", motivo: `no se pudo copiar «${m.proyecto}» (${codigoDe(error)}): no se ha cambiado nada` };
    }
  }

  // 4. A su nombre, y entonces el workspace nuevo. Un fallo aquí deshace lo renombrado.
  const puestas: number[] = [];
  try {
    for (const [i, m] of mudanzas.entries()) {
      await rename(ocultas[i]!, m.hacia);
      puestas.push(i);
    }
    opciones.guardarWorkspace(opciones.hacia);
  } catch (error) {
    // Deshacer es RETIRAR la copia puesta, que se puede: el origen sigue intacto (el paso 5 no
    // ha corrido). Antes se renombraba de vuelta tragándose el error, y si fallaba quedaba una
    // copia entera en la base nueva mientras el resultado decía «no se ha cambiado nada» —y el
    // plan siguiente, al verla, bloqueaba cada reintento con «ya hay una copia de…»—.
    const retirar = opciones.retirar ?? ((copia: string) => rm(copia, { recursive: true, force: true }));
    const sueltas: string[] = [];
    for (const i of puestas) {
      const m = mudanzas[i]!;
      try {
        await retirar(m.hacia);
      } catch {
        sueltas.push(`${m.proyecto} (${m.entorno})`);
      }
    }
    await descartar();
    if (sueltas.length > 0) {
      // Sin rutas: viaja por el cable. El proyecto y el entorno dicen dónde en la carpeta nueva.
      return {
        estado: "rechazado",
        motivo:
          `no se pudo terminar el cambio (${codigoDe(error)}): el workspace sigue siendo el de antes y tus copias ` +
          `están intactas, pero en la carpeta nueva quedó una copia de ${sueltas.join(", ")} que no se pudo retirar: ` +
          "bórrala a mano antes de volver a intentarlo",
      };
    }
    return { estado: "rechazado", motivo: `no se pudo terminar el cambio (${codigoDe(error)}): no se ha cambiado nada` };
  }
  const avisos: string[] = [];
  try {
    remapearRaicesDeTareas(opciones.casaXonecode, (raiz) => rutaMudada(raiz, mudanzas));
  } catch (error) {
    avisos.push(`las copias se mudaron, pero no se pudo actualizar la cola de tareas (${codigoDe(error)})`);
  }

  // 5. Borrar el origen por lápida.
  const restos: string[] = [];
  for (const [i, m] of mudanzas.entries()) {
    progreso?.({ fase: "borrar", proyecto: m.proyecto, entorno: m.entorno, indice: i + 1, total });
    const lapida = join(dirname(m.desde), `.${m.proyecto}.borrando-${randomUUID()}`);
    try {
      await (opciones.enterrar ?? rename)(m.desde, lapida);
    } catch {
      restos.push(`${m.proyecto} (${m.entorno})`);
      continue;
    }
    try {
      await rm(lapida, { recursive: true, force: true });
    } catch {
      restos.push(`${m.proyecto} (${m.entorno})`);
    }
  }
  for (const entorno of new Set(mudanzas.map((m) => m.entorno))) retirarSiSobra(join(opciones.desde, entorno));

  return { estado: "hecho", mudadas: total, restos, avisos };
}

function megas(bytes: number): string {
  return `${Math.ceil(bytes / (1024 * 1024))} MB`;
}

function codigoDe(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : "error";
}
