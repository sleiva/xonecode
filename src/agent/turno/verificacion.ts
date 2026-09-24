/**
 * Las reglas del verificador que comparten los DOS motores.
 *
 * Vivían dentro de `turnoReal.ts#conVerificacion`, un cierre que solo sirve al grafo de
 * deepagents. Con ellas están el tope de reparaciones, cuándo toca el crítico de pantalla y el
 * texto que se le devuelve al agente para que repare: los dos motores los usan, y si vivieran en
 * `turnoReal.ts` TrueForge tendría que importarlo — que es el ciclo que había. Con un segundo motor que también escribe, copiarlas sería un segundo sitio donde
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

/**
 * Cuántas veces se le devuelven los hallazgos al agente para que los corrija. Dos: tres
 * verificaciones en total. Un modelo que no arregla algo en dos intentos con el error
 * delante no lo arregla al quinto, y cada intento son escrituras que pasan por aprobación
 * humana — o sea, tiempo de una persona. La guarda de «no progresa» (misma huella dos
 * veces) corta antes de llegar aquí cuando el modelo repite el mismo cambio.
 */
export const TOPE_REPARACIONES = 2;

/**
 * ¿Toca criticar la pantalla en esta pasada?
 *
 * PURA y exportada a propósito: la condición vivía dentro de `conVerificacion`, que es un
 * cierre que TODOS los tests de este fichero doblan, y ahí una regla de producción se queda
 * escrita y no probada — el patrón de fallo que este repo ha pagado nueve veces.
 *
 * Cuatro condiciones, y cada una dice algo distinto: sin crítico esta ejecución no puede
 * preguntar (y eso NO es «la pantalla está bien»); sin capturas no hay nada que mirar; una vez
 * por turno porque sus observaciones no son una huella y no hay forma de saber si una segunda
 * vuelta avanza; y nunca por encima del tope de reparaciones, que es de todo el turno.
 */
export function tocaCriticarPantalla(estado: {
  hayCritico: boolean;
  capturas: number;
  yaDisparo: boolean;
  intento: number;
}): boolean {
  return (
    estado.hayCritico &&
    estado.capturas > 0 &&
    !estado.yaDisparo &&
    estado.intento < TOPE_REPARACIONES
  );
}

/**
 * El texto que se le devuelve al agente para que repare, de las DOS fuentes.
 *
 * Fuera del cierre por lo mismo que `tocaCriticarPantalla`. Y no se le dice CÓMO arreglarlo
 * —eso lo sabe él o no lo sabe—, solo lo que se ha medido y lo único que importa aquí: que no
 * invente nada para que el error desaparezca, que es justo lo que XOne no le reprocha.
 */
/**
 * Lo que se le pide al agente cuando el verificador o el crítico ven algo.
 *
 * **Lleva el OBJETIVO delante, y ése es el arreglo.** Esta petición entra como
 * `HumanMessage` en el mismo hilo (ver abajo), así que a partir de ese momento pasa a ser
 * «el último humano» — y `conservarElEncargo` protege justo ése. O sea que sin el objetivo
 * dentro, el encargo del usuario deja de estar protegido y lo sustituye la lista de
 * hallazgos: el agente no se despista, le hemos cambiado el encargo por debajo y encima se
 * lo recordamos en cada llamada.
 *
 * MEDIDO en un turno real: se pidió «tengo un error al ejecutar la app, arréglalo», se
 * arregló (faltaba un `;` en `funciones.js`), y entonces el crítico visual vio tres textos
 * recortados en otra pantalla —rotos desde antes, y sin relación con el arreglo—. El turno
 * se fue a rediseñar el menú.
 *
 * **Y el objetivo es lo que decide si un hallazgo es trabajo o es ruido.** El mismo
 * «BASICOS PLUS se corta» es ruido si el objetivo era arrancar la app, y es EL trabajo si
 * el objetivo era arreglar los fallos visuales. Eso no lo dice el fichero que se tocó —el
 * heurístico que se descartó— ni lo puede decidir el harness: lo decide el objetivo, y por
 * eso viaja con la petición en vez de quedarse fuera.
 */
export function textoDeReparacion(
  hallazgos: readonly HallazgoDelTurno[],
  observaciones: readonly string[],
  /** El encargo ORIGINAL de este turno. Ausente = no se pudo saber, y entonces no se afirma. */
  objetivo?: string
): string {
  const lineas: string[] = [];
  if (objetivo !== undefined && objetivo.trim() !== "") {
    lineas.push(
      "TU OBJETIVO EN ESTE TURNO SIGUE SIENDO ÉSTE, y no ha cambiado:",
      "",
      objetivo.trim(),
      "",
      "Lo que viene debajo es lo que han visto las comprobaciones AL PASAR. No es un encargo",
      "nuevo.",
      "",
    );
  }
  if (hallazgos.length > 0) {
    const errores = hallazgos.filter((h) => h.severidad === "error").length;
    lineas.push(
      `El simulador de XOne ha revisado lo que acabas de escribir y ha encontrado ${errores} error(es):`,
      ...hallazgos.map(
        (h) =>
          `- ${h.severidad === "error" ? "ERROR" : "aviso"} ${h.code}${h.fichero === undefined ? "" : ` en ${h.fichero}${h.linea === undefined ? "" : `:${h.linea}`}`}: ${h.mensaje}`
      )
    );
  }
  if (observaciones.length > 0) {
    if (lineas.length > 0) lineas.push("");
    /**
     * **El aviso sobre la redacción está MEDIDO y no es cortesía.** Seis vueltas del crítico
     * describieron un texto CORTADO como «girado 180°». A dónde apunta sí lo acertó las seis.
     * Sin esta línea, el desarrollador busca una rotación que no existe y gasta la única
     * vuelta que hay.
     */
    lineas.push(
      "Y mirando una captura de la pantalla en el aparato se ve esto (la REDACCIÓN no es de",
      "fiar: describe mal la causa. Fíate de QUÉ control señala, no de su explicación, y",
      "míralo tú en el código):",
      ...observaciones.map((o) => `- ${o}`)
    );
  }
  lineas.push(
    "",
    // El reparto: lo que sirve al objetivo se arregla, y lo demás se CUENTA. Sin esta
    // frase, una lista de hallazgos se lee como la tarea entera — que es lo que pasó.
    ...(objetivo === undefined || objetivo.trim() === ""
      ? ["Corrige lo que puedas."]
      : [
          "Arregla lo que haga falta PARA CUMPLIR TU OBJETIVO. Lo que no tenga que ver con él",
          "—algo que ya estaba roto antes y que tu cambio no ha causado— NO lo toques: dilo en",
          "tu respuesta para que lo decida quien te lo encargó. Nadie te ha pedido eso.",
        ]),
    "No inventes atributos, funciones ni propiedades para que",
    "desaparezcan: XOne ignora lo desconocido en silencio y el simulador lo detecta.",
    "Si algo no sabes cómo corregirlo, dilo en vez de intentar otra cosa."
  );
  return lineas.join("\n");
}
