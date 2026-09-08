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

  return {
    listar() {
      if (!existsSync(indice)) return [];
      try {
        const leido = JSON.parse(readFileSync(indice, "utf8")) as unknown;
        return Array.isArray(leido) ? (leido as Tarea[]) : [];
      } catch {
        // No se sobrescribe: perder la cola de alguien por no saber leerla sería peor que
        // no enseñarla. Misma postura que una línea corrupta del `.jsonl` de una sesión.
        informar("el índice de tareas no se pudo leer; la cola se enseña vacía");
        return [];
      }
    },
    guardar(tareas) {
      mkdirSync(base, { recursive: true });
      writeFileSync(indice, `${JSON.stringify(tareas, null, 1)}\n`, "utf8");
    },
    /**
     * **Un solo corredor por máquina.** Dos consolas abiertas serían dos ejecutores sobre la
     * misma cola, y con ellos dos turnos del mismo proyecto a la vez — que es exactamente lo
     * que el cerrojo por proyecto existe para evitar.
     *
     * Un cerrojo de un proceso MUERTO se recoge: si no, un cuelgue o un `kill -9` dejaría la
     * cola parada para siempre y sin forma de arrancarla salvo borrando un fichero a mano.
     */
    tomarCerrojo() {
      mkdirSync(base, { recursive: true });
      if (existsSync(cerrojo)) {
        try {
          const dueño = JSON.parse(readFileSync(cerrojo, "utf8")) as { pid?: unknown };
          if (typeof dueño.pid === "number" && dueño.pid !== pid && vivo(dueño.pid)) {
            return { tomado: false, dePid: dueño.pid };
          }
        } catch {
          // Un cerrojo ilegible se trata como libre: lo escribimos nosotros, así que uno roto
          // es basura, no el reclamo de otro proceso.
        }
      }
      writeFileSync(cerrojo, `${JSON.stringify({ pid, desde: new Date().toISOString() })}\n`, "utf8");
      return { tomado: true };
    },
    soltarCerrojo() {
      try {
        const dueño = JSON.parse(readFileSync(cerrojo, "utf8")) as { pid?: unknown };
        // Solo el propio: soltar el de otro dejaría dos corredores.
        if (dueño.pid === pid) rmSync(cerrojo, { force: true });
      } catch {
        // No había, o estaba roto: nada que soltar.
      }
    },
    guardarAdjunto(tarea, nombre, datos) {
      if (!nombreAceptable(tarea) || !nombreAceptable(nombre)) {
        return { ok: false, motivo: "ese nombre no vale para un adjunto" };
      }
      if (datos.length > topeDeAdjunto) {
        return { ok: false, motivo: `el fichero es demasiado grande (tope ${Math.round(topeDeAdjunto / 1_000_000)} MB)` };
      }
      const carpeta = carpetaDeAdjuntos(tarea);
      mkdirSync(carpeta, { recursive: true });
      const ya = readdirSync(carpeta).reduce((suma, f) => suma + statSync(join(carpeta, f)).size, 0);
      if (ya + datos.length > topePorTarea) {
        return { ok: false, motivo: `esta tarea ya no admite más adjuntos (tope ${Math.round(topePorTarea / 1_000_000)} MB)` };
      }
      writeFileSync(join(carpeta, nombre), datos);
      return { ok: true };
    },
    carpetaDeAdjuntos,
    borrarTarea(id) {
      if (nombreAceptable(id)) rmSync(join(base, id), { recursive: true, force: true });
      this.guardar(this.listar().filter((t) => t.id !== id));
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
