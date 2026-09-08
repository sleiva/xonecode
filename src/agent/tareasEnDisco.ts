/**
 * La cola de tareas en disco: `~/.xonecode/tareas/`.
 *
 * **De la MÁQUINA, no de un proyecto**, y esa es la decisión de este fichero. El kanban es
 * global y no puede depender de tener descargados los dieciocho proyectos del entorno: con
 * la cola dentro de cada uno, listar las tareas obligaría a abrirlos todos. Es el mismo
 * reparto que ya existe entre `settings.json` y el `config.json` de proyecto.
 *
 * Los ADJUNTOS también van aquí y no en el proyecto: una tarea puede crearse para uno que
 * no se ha abierto nunca, y guardar ahí un adjunto sería estrenarle el `.xonecode/` por la
 * puerta de atrás. Fuera del proyecto se gana además gratis lo que importaba — no entran en
 * git y no suben a CloudStudio — sin depender de ninguna exclusión.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Tarea } from "../core/tareas.js";

/** Bytes que se aceptan por adjunto y por tarea. */
export const TOPE_DE_ADJUNTO = 20_000_000;
export const TOPE_DE_ADJUNTOS_POR_TAREA = 50_000_000;

/** Un nombre de adjunto: un segmento llano y nada más. La misma lista BLANCA de forma que
 *  `esRutaDeArtefacto`, y por lo mismo — de ella depende que esto no escriba fuera. */
const SEGMENTO = /^[A-Za-z0-9._-]+$/;
const nombreAceptable = (n: string): boolean => SEGMENTO.test(n) && n !== "." && n !== "..";

export interface ResultadoDeAdjunto {
  ok: boolean;
  /** Una frase, sin ninguna ruta de la máquina. */
  motivo?: string;
}

export interface TareasEnDisco {
  listar(): Tarea[];
  guardar(tareas: readonly Tarea[]): void;
  /** Concede el cerrojo, o dice de quién es. Ver `tomarCerrojo` abajo. */
  tomarCerrojo(): { tomado: true } | { tomado: false; dePid: number };
  soltarCerrojo(): void;
  guardarAdjunto(tarea: string, nombre: string, datos: Buffer): ResultadoDeAdjunto;
  /** La carpeta REAL de los adjuntos de una tarea, para montarla en el backend. Se queda
   *  en el host: es una ruta de la máquina. */
  carpetaDeAdjuntos(tarea: string): string;
  borrarTarea(id: string): void;
}

export function crearTareasEnDisco(opciones: {
  /** La base (`~/.xonecode` por omisión). Entra por parámetro para probar sin tocar el home. */
  base?: string;
  pid?: number;
  /** ¿Vive ese proceso? Por omisión, `process.kill(pid, 0)`. */
  vivo?: (pid: number) => boolean;
  informar?: (texto: string) => void;
  topeDeAdjunto?: number;
  topePorTarea?: number;
}): TareasEnDisco {
  const base = join(opciones.base ?? join(homedir(), ".xonecode"), "tareas");
  const pid = opciones.pid ?? process.pid;
  const vivo = opciones.vivo ?? estaVivo;
  const informar = opciones.informar ?? (() => {});
  const topeDeAdjunto = opciones.topeDeAdjunto ?? TOPE_DE_ADJUNTO;
  const topePorTarea = opciones.topePorTarea ?? TOPE_DE_ADJUNTOS_POR_TAREA;
  const indice = join(base, "indice.json");
  const cerrojo = join(base, "corredor.lock");

  const carpetaDeAdjuntos = (tarea: string): string => join(base, tarea, "adjuntos");

  /**
   * **El índice lleva el ENCARGO entero del usuario**, así que la carpeta y el fichero van a
   * 0600/0700: la misma regla que ya sigue `checkpoint.sqlite`, y por el mismo motivo — es
   * contenido de una persona, no un dato de sistema.
   */
  function guardarIndice(tareas: readonly Tarea[]): void {
    mkdirSync(base, { recursive: true, mode: 0o700 });
    writeFileSync(indice, `${JSON.stringify(tareas, null, 1)}\n`, { encoding: "utf8", mode: 0o600 });
  }

  /**
   * Lee el índice y dice además si se PUDO leer — pero NO avisa por su cuenta: quien la
   * llama sabe qué está haciendo (enseñar la cola, o borrar una tarea) y es quien tiene que
   * elegir las palabras. Avisar aquí dentro con un solo mensaje fijo fue el propio error que
   * esto corrige: `borrarTarea` heredaba el «la cola se enseña vacía» de `listar()`, que
   * describe la situación de otro sitio — un aviso que manda a mirar donde no está el
   * problema es peor que ninguno.
   *
   * Un índice sintácticamente válido pero que no es una lista (`{}`, por ejemplo) es tan
   * ilegible como uno con JSON roto: las dos formas de «esto no es la cola» devuelven vacío
   * y ninguna se sobrescribe sola.
   */
  function leerIndice(): { tareas: Tarea[]; legible: boolean } {
    if (!existsSync(indice)) return { tareas: [], legible: true };
    try {
      const leido = JSON.parse(readFileSync(indice, "utf8")) as unknown;
      if (!Array.isArray(leido)) return { tareas: [], legible: false };
      return { tareas: leido as Tarea[], legible: true };
    } catch {
      // No se sobrescribe: perder la cola de alguien por no saber leerla sería peor que
      // no enseñarla. Misma postura que una línea corrupta del `.jsonl` de una sesión.
      return { tareas: [], legible: false };
    }
  }

  /** Quién tiene el cerrojo, si el fichero se puede leer y trae un pid. */
  function leerDueño(): { pid: number } | undefined {
    try {
      const dueño = JSON.parse(readFileSync(cerrojo, "utf8")) as { pid?: unknown };
      return typeof dueño.pid === "number" ? { pid: dueño.pid } : undefined;
    } catch {
      return undefined;
    }
  }

  return {
    listar() {
      const { tareas, legible } = leerIndice();
      if (!legible) informar("el índice de tareas no se pudo leer; la cola se enseña vacía");
      return tareas;
    },
    guardar(tareas) {
      guardarIndice(tareas);
    },
    /**
     * **Un solo corredor por máquina.** Dos consolas abiertas serían dos ejecutores sobre la
     * misma cola, y con ellos dos turnos del mismo proyecto a la vez — que es exactamente lo
     * que el cerrojo por proyecto existe para evitar.
     *
     * **La toma es atómica**: `flag: "wx"` crea el fichero solo si no existe, y falla con
     * `EEXIST` si ya está — comprobar con `existsSync` y escribir después, como antes, deja
     * una ventana entre las dos llamadas donde dos procesos que arrancan a la vez pueden leer
     * los dos «no hay cerrojo» y escribir los dos: perder esa carrera es exactamente lo que
     * este cerrojo existe para impedir.
     *
     * Un cerrojo de un proceso MUERTO se recoge: si no, un cuelgue o un `kill -9` dejaría la
     * cola parada para siempre y sin forma de arrancarla salvo borrando un fichero a mano. Y
     * tras recogerlo se reintenta la creación exclusiva UNA vez — si en ese hueco otro proceso
     * se adelantó, perdimos la carrera de verdad y se dice de quién es, en vez de fingir que
     * el cerrojo es nuestro.
     *
     * **Y después de CADA `wx` ganado, una RELECTURA de confirmación.** El `wx` por sí solo
     * no basta cuando se llega por la vía de recoger un cerrojo muerto: A ve al dueño muerto
     * y lo borra; B ve al mismo dueño muerto y también lo borra; A crea el suyo con `wx` y
     * gana; y entonces B —que ya había decidido reclamar y solo le faltaba ejecutarlo— borra
     * el fichero que A ACABA de crear y crea el suyo encima. Los dos `wx` tienen éxito en su
     * propio proceso, y los dos se creerían dueños. La relectura es el árbitro: tras ganar el
     * `wx`, se vuelve a leer el fichero y se comprueba que el pid de dentro es el NUESTRO. Si
     * no lo es, alguien nos lo pisó entre la escritura y esta lectura, y se devuelve de quién
     * es en vez de fingir que el cerrojo sigue siendo nuestro.
     */
    tomarCerrojo() {
      mkdirSync(base, { recursive: true, mode: 0o700 });

      const intentar = (): boolean => {
        try {
          writeFileSync(cerrojo, `${JSON.stringify({ pid, desde: new Date().toISOString() })}\n`, {
            encoding: "utf8",
            mode: 0o600,
            flag: "wx",
          });
          return true;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
          throw error;
        }
      };

      const confirmar = (): { tomado: true } | { tomado: false; dePid: number } => {
        const dueño = leerDueño();
        if (dueño?.pid === pid) return { tomado: true };
        // Alguien escribió encima entre nuestro `wx` y esta relectura: perdimos la carrera.
        // -1 nunca es un pid real: es lo que se devuelve si ni siquiera el ganador se puede
        // leer, que no debería pasar en la práctica pero no es motivo para lanzar — fallar
        // aquí bloquearía al llamante sin decir por qué.
        return { tomado: false, dePid: dueño?.pid ?? -1 };
      };

      if (intentar()) return confirmar();

      const dueño = leerDueño();
      if (dueño && dueño.pid !== pid && vivo(dueño.pid)) {
        return { tomado: false, dePid: dueño.pid };
      }

      // Dueño soy yo, está muerto, o el fichero es ilegible: se recoge y se reintenta una vez.
      rmSync(cerrojo, { force: true });
      if (intentar()) return confirmar();

      // Perdimos la carrera de verdad: alguien escribió entre el borrado y este intento.
      const otro = leerDueño();
      return { tomado: false, dePid: otro?.pid ?? -1 };
    },
    soltarCerrojo() {
      // Solo el propio: soltar el de otro dejaría dos corredores.
      const dueño = leerDueño();
      if (dueño && dueño.pid === pid) rmSync(cerrojo, { force: true });
    },
    guardarAdjunto(tarea, nombre, datos) {
      if (!nombreAceptable(tarea) || !nombreAceptable(nombre)) {
        return { ok: false, motivo: "ese nombre no vale para un adjunto" };
      }
      if (datos.length > topeDeAdjunto) {
        return { ok: false, motivo: `el fichero es demasiado grande (tope ${Math.round(topeDeAdjunto / 1_000_000)} MB)` };
      }
      const carpeta = carpetaDeAdjuntos(tarea);
      mkdirSync(carpeta, { recursive: true, mode: 0o700 });
      const ya = readdirSync(carpeta).reduce((suma, f) => suma + statSync(join(carpeta, f)).size, 0);
      if (ya + datos.length > topePorTarea) {
        return { ok: false, motivo: `esta tarea ya no admite más adjuntos (tope ${Math.round(topePorTarea / 1_000_000)} MB)` };
      }
      // Un adjunto es un documento de la persona, no un dato de sistema: mismo 0600 que el
      // índice.
      writeFileSync(join(carpeta, nombre), datos, { mode: 0o600 });
      return { ok: true };
    },
    carpetaDeAdjuntos,
    borrarTarea(id) {
      if (nombreAceptable(id)) rmSync(join(base, id), { recursive: true, force: true });
      const { tareas, legible } = leerIndice();
      if (!legible) {
        // Un índice que no se pudo leer no se toca: sobrescribirlo con una lista vacía sería
        // la misma pérdida de datos que la lectura ya evita en `listar()` — sólo que por la
        // puerta de atrás. Y el aviso es el suyo propio, no el de `leerIndice`: ahí no se
        // está enseñando una cola vacía, se está BORRANDO algo y dejando el índice intacto —
        // un aviso que describe la situación equivocada manda a mirar donde no está.
        informar("la tarea se borró del disco, pero el índice no se pudo leer y se deja intacto");
        return;
      }
      guardarIndice(tareas.filter((t) => t.id !== id));
    },
  };
}

/** `kill(pid, 0)` no manda ninguna señal: solo pregunta si el proceso existe. */
function estaVivo(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
