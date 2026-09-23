/**
 * Las reglas del verificador que comparten los DOS motores.
 *
 * Vivían dentro de `turnoReal.ts#conVerificacion`, un cierre que solo sirve al grafo de
 * deepagents. Con un segundo motor que también escribe, copiarlas sería un segundo sitio donde
 * decidir qué hallazgo es del turno o cuándo un intento no avanza — y esas son justo las reglas
 * que no pueden divergir sin que nadie lo note. Así que salen aquí, puras, y las llaman los dos.
 */
import { relative, resolve } from "node:path";
import type { HallazgoDelTurno } from "../../core/events.js";
import type { InformeVerificacion } from "../../core/ports.js";

/**
 * Los hallazgos, repartidos entre los ficheros que ESTE turno tocó y los demás.
 *
 * El simulador mira el proyecto entero —es su API—, y un error que ya estaba en un fichero que
 * el agente no abrió no es del agente. Un hallazgo sin fichero no se puede atribuir: se enseña
 * con los del turno, que es el lado conservador. Las rutas salen RELATIVAS: esto viaja al cable.
 */
export function repartirHallazgos(
  raiz: string,
  informe: InformeVerificacion,
  tocadosRelativos: readonly string[]
): { hallazgos: HallazgoDelTurno[]; preexistentes: number; errores: number } {
  const tocados = new Set(tocadosRelativos.map((r) => resolve(raiz, r)));
  const delTurno = informe.hallazgos.filter((h) => h.fichero === undefined || tocados.has(resolve(h.fichero)));
  const hallazgos: HallazgoDelTurno[] = delTurno.map((h) => ({
    code: h.code,
    severidad: h.severidad,
    mensaje: h.mensaje,
    ...(h.fichero === undefined ? {} : { fichero: relative(raiz, h.fichero) }),
    ...(h.linea === undefined ? {} : { linea: h.linea }),
  }));
  return {
    hallazgos,
    preexistentes: informe.hallazgos.length - delTurno.length,
    errores: delTurno.filter((h) => h.severidad === "error").length,
  };
}

/**
 * La huella de un veredicto rojo: sus ERRORES, no todos los hallazgos.
 *
 * Un aviso que va y viene no dice nada de si el error se está arreglando. Y se compara con la
 * del veredicto anterior y no con «¿bajó el número?»: dos errores distintos en vez de dos
 * iguales también es avance, y un modelo que arregla uno y rompe otro no debe quedarse
 * bloqueado como si no hubiera hecho nada.
 */
export function huellaDeErrores(hallazgos: readonly HallazgoDelTurno[]): string {
  return hallazgos
    .filter((h) => h.severidad === "error")
    .map((h) => `${h.code}|${h.fichero ?? ""}|${h.linea ?? ""}`)
    .sort()
    .join("\n");
}

/** Lo que cuenta como fichero del PROYECTO para verificar: ni borrados ni `.xonecode/`. */
export function cambiosQueSeVerifican<T extends { ruta: string; clase?: string }>(cambios: readonly T[]): T[] {
  return cambios.filter((c) => c.clase !== "borrado" && !c.ruta.startsWith(".xonecode/") && c.ruta !== ".xonecode");
}
