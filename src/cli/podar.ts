/**
 * `xonecode podar`: adelgazar de una vez la memoria del agente de los proyectos que ya están
 * gordos.
 *
 * **Existe porque el mantenimiento automático no alcanza a lo que ya pasó.** La poda del
 * cierre de turno (`web/servidor/vestibulo.ts`) solo corre cuando alguien vuelve a trabajar
 * en ese proyecto, y cuando esto se escribió había 1,5 GB repartidos en siete copias del
 * workspace, la mayoría sin tocar desde hacía días. Un comando lo resuelve hoy; el
 * automático evita que vuelva.
 *
 * **La autorización es teclear el comando**, como `/pdf` o crear una tarea: esto borra, y lo
 * pide quien está delante — no el modelo, que ni siquiera lo alcanza.
 *
 * Y se dice lo que se hizo POR PROYECTO, no un total: un total no deja comprobar nada.
 */
import {
  crearCheckpointerDeProyecto,
  hayPendientesEnLaBase,
  podarCheckpointer,
  tamanoDelCheckpointer,
} from "../agent/sesiones/checkpointer.js";
import { resumenDePoda } from "../core/podaDeCheckpoint.js";
import { readdirSync } from "node:fs";
import { join } from "node:path";

export interface ProyectoQuePodar {
  /** Cómo se llama para una persona. Lo que se ENSEÑA: la ruta no se pinta. */
  nombre: string;
  raiz: string;
}

export function cmdPodar(
  proyectos: ProyectoQuePodar[],
  escribirCrudo: (texto: string) => void,
  deps?: {
    podar?: typeof podarCheckpointer;
    checkpointer?: typeof crearCheckpointerDeProyecto;
    tamano?: typeof tamanoDelCheckpointer;
    pendientes?: typeof hayPendientesEnLaBase;
  },
): number {
  /**
   * **El `\n` lo pone quien escribe.** `escribirEnStdout` vuelca el texto tal cual —es la
   * convención de `cmdTraza` y de todo `cli/`— así que sin esto las seis líneas del informe
   * salían pegadas en una sola. Medido corriendo el comando de verdad.
   */
  const escribir = (linea: string) => escribirCrudo(`${linea}\n`);
  const podar = deps?.podar ?? podarCheckpointer;
  const abrir = deps?.checkpointer ?? crearCheckpointerDeProyecto;
  const tamano = deps?.tamano ?? tamanoDelCheckpointer;
  const pendientes = deps?.pendientes ?? hayPendientesEnLaBase;

  if (proyectos.length === 0) {
    escribir("No hay ningún proyecto en el workspace todavía.");
    return 0;
  }

  let liberado = 0;
  let tocados = 0;
  for (const p of proyectos) {
    const antes = tamano(p.raiz);
    if (antes === undefined) {
      // Sin base no hay nada que podar, y eso no es un fallo: es un proyecto con el que
      // nadie ha hablado todavía.
      continue;
    }
    /**
     * **La COTA no aplica aquí, pero la guarda de «a medias» SÍ**, y la diferencia importa.
     *
     * Teclear el comando autoriza a limpiar un proyecto por pequeño que sea —para eso se
     * teclea—, pero no autoriza a romper una sesión que puede continuar: un subagente parado
     * en una aprobación vive en su espacio y podarlo se lleva la reanudación por delante.
     * Eso no es una preferencia de tamaño, es corrección, y ningún comando la levanta.
     *
     * Se DICE, y con el remedio: encontrado sobre el workspace real, un proyecto de 422 MB
     * tenía trabajo a medias mientras otro de 882 MB no. Saltárselo en silencio se leería
     * como que el comando no funciona.
     */
    const conexion = abrir(p.raiz);
    if (pendientes(conexion)) {
      escribir(`${p.nombre}: tiene trabajo a medias (una aprobación sin contestar) — no se toca`);
      continue;
    }
    const hecho = podar(conexion, p.raiz);
    if (hecho === undefined) {
      escribir(`${p.nombre}: no se pudo podar (¿hay otra consola abierta en él?)`);
      continue;
    }
    const dicho = resumenDePoda(hecho);
    if (dicho === undefined) {
      // Ya estaba limpio. Se dice, porque en un comando que el usuario acaba de teclear el
      // silencio se lee como «no funcionó» — al revés que en el mantenimiento automático.
      escribir(`${p.nombre}: ya estaba al día`);
      continue;
    }
    escribir(`${p.nombre}: ${dicho}`);
    liberado += hecho.antes - hecho.despues;
    tocados += 1;
  }

  escribir(
    tocados === 0
      ? "Nada que liberar."
      : `Liberados ${Math.round((liberado / 1024 / 1024) * 10) / 10} MB en ${tocados} proyecto(s).`,
  );
  return 0;
}

/**
 * Los proyectos que hay bajo el workspace, `<workspace>/<entorno>/<proyecto>`.
 *
 * Se recorre el DISCO y no el `settings.json`: lo que hay que podar es lo que está bajado,
 * y un entorno dado de baja deja sus copias ahí igual. Lo que no se pueda leer se salta —
 * este comando no puede fallar por una carpeta rara.
 *
 * El nombre que se enseña es `entorno/proyecto`, que es como el usuario los distingue, y
 * NUNCA la ruta: es el mismo trato que le da el cable (`sinRutas`).
 */
export function proyectosDelWorkspace(base: string): ProyectoQuePodar[] {
  const encontrados: ProyectoQuePodar[] = [];
  for (const entorno of carpetasDe(base)) {
    for (const proyecto of carpetasDe(join(base, entorno))) {
      encontrados.push({ nombre: `${entorno}/${proyecto}`, raiz: join(base, entorno, proyecto) });
    }
  }
  return encontrados;
}

function carpetasDe(ruta: string): string[] {
  try {
    return readdirSync(ruta, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith("."))
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
}
