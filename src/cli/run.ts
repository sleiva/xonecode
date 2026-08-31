import { correrTurno } from "../core/turno.js";
import { pedirDecisiones, preguntarPorStdin } from "./aprobar.js";
import { crearPielStdio, escribirEnStdout, type Escribir } from "./stdio.js";
import { AgenteGuionizado } from "../agent/guionizado.js";
import { esDoble } from "../core/ports.js";
import { inspeccionar, type Entorno } from "../agent/entorno.js";
import { tomarInstantanea, type Instantanea, type Cambio } from "../agent/instantanea.js";
import { SkillsEnDisco } from "../agent/skills.js";
import { Modelos } from "../agent/modelos.js";
import { abrirSesionReal } from "../agent/turnoReal.js";
import type { FuentesDeEleccion } from "../core/modelos.js";
import type { Papel } from "../core/ports.js";

export interface OpcionesRun {
  peticion: string;
  escribir?: Escribir;
  retardoMs?: number;
  /** `--real`: corre el agente real sobre el proyecto del cwd, no el guion. */
  real?: boolean;
  /** Las fuentes de modelo resueltas en `main.ts`, para construir los clientes reales. */
  fuentes?: FuentesDeEleccion;
}

/** La cabecera del turno real: qué hay detrás antes de que empiece a gastar. */
function cabecera(
  escribir: Escribir,
  modelos: Modelos,
  skills: SkillsEnDisco,
  instantanea: Instantanea,
  entorno: Entorno
): void {
  const desc = modelos.descripcion();
  const papeles: Papel[] = ["rapido", "trabajo", "afilado"];
  escribir("--- turno real ---\n");
  for (const p of papeles) escribir(`  ${p.padEnd(8)} ${desc[p]}\n`);
  escribir(`  skills: ${skills.catalogo().length}\n`);
  escribir(`  foto del ANTES: ${instantanea.via === "git" ? "git" : "huellas de fichero"}\n`);
  if (entorno.vistasAplanadas.length > 0) {
    escribir(`  ${entorno.vistasAplanadas.length} vista(s) aplanada(s) .xml ocultas al agente\n`);
  }
  escribir("\n");
}

/**
 * Un disparo: una petición, un turno, y a la calle. Pipeable.
 *
 * Devuelve el código de salida. **Una pausa sin humano no es un éxito**: en modo un
 * disparo no hay a quién preguntar, así que se sale con código distinto de cero para que
 * CI no lea como «hecho» un turno que se quedó esperando una aprobación que nadie iba a
 * dar. No se aprueba por omisión: aprobar EJECUTA, y ante la duda va la opción recuperable.
 */
export async function cmdRun(opciones: OpcionesRun): Promise<number> {
  const escribir = opciones.escribir ?? escribirEnStdout;

  if (opciones.real) return correrReal(opciones, escribir);

  const agente = new AgenteGuionizado(opciones.retardoMs ?? 0);
  const piel = crearPielStdio(escribir);

  if (esDoble(agente)) {
    escribir("⚠  AGENTE DE PEGA: esto es un guion, no ha corrido ningún modelo.\n\n");
  }

  let pausado = false;
  const pielQueApunta = {
    ...piel,
    pausa: (pendientes: Parameters<typeof piel.pausa>[0]) => {
      pausado = true;
      piel.pausa(pendientes);
    },
  };

  const bitacora = await correrTurno(agente.turno(opciones.peticion), pielQueApunta, {
    avisos: (b) => (b.corrio("verify") && esDoble(agente) ? ["⚠  El veredicto es de pega."] : []),
  });

  if (pausado) {
    escribir("\n(sin humano en modo `run`: nada se aprobó y nada se aplicó)\n");
    return 2;
  }
  return bitacora.corrio("bloqueado") ? 1 : 0;
}

/**
 * Excepción centinela del corte «sin humano»: privada a este fichero, nunca una genérica
 * (un `Error` suelto se confundiría con un fallo real del turno).
 *
 * Para qué existe: `sesion.turno` SIEMPRE reanuda el grafo tras `pedirAprobacion`, incluso
 * si todas las decisiones son rechazos —es lo correcto para la consola, donde el modelo
 * tiene que saber que se rechazó. Pero el `run` de un disparo sin terminal es otro caso:
 * los rechazos no los dio un humano sino el fail-closed, reanudar gastaría una llamada más
 * al modelo sin que nadie vaya a cambiar de respuesta, y el comportamiento exigido es NO
 * reanudar, dar el diff y salir con 2. La única forma de colgar la reanudación sin tocar
 * `turnoReal.ts` es lanzar en el callback: el corte ocurre DESPUÉS de preguntar y decidir,
 * o sea la pregunta y el «→ rechazado» se ven igual que siempre.
 */
class CorteSinHumano extends Error {}

/** El turno real, en el orden del plan: entorno → foto → sesión → cabecera → turno → cambios. */
async function correrReal(opciones: OpcionesRun, escribir: Escribir): Promise<number> {
  const raiz = process.cwd();
  const piel = crearPielStdio(escribir);

  // 1. ¿Hay un proyecto aquí? Mismo diagnóstico que `doctor`, misma frase: no construir
  //    NADA sobre un sitio que no es un proyecto XOne.
  const entorno = await inspeccionar(raiz);
  if (!entorno.esProyectoXone) {
    escribir(`${entorno.raiz}  (no hay app.xml aquí)\n`);
    escribir("✗ falta algo imprescindible: xonecode no puede trabajar aquí.\n");
    return 1;
  }

  // 2. La foto del ANTES, ANTES de construir nada: además de anunciarla en la cabecera, es
  //    la fuente del diff de la rama «sin humano» —esa rama sale por la centinela ANTES de
  //    que el turno devuelva nada, así que no puede usar el diff por-turno de la sesión.
  const instantanea = await tomarInstantanea(raiz, entorno.git);

  // 3. Lo que la sesión necesita. Los ficheros del proyecto NO se calculan aquí: los
  //    recorre la propia sesión al construir el agente.
  const skills = new SkillsEnDisco();
  const modelos = new Modelos(opciones.fuentes ?? {});

  // 4. La cabecera va ANTES del turno: qué modelo, cuántas skills, cómo se tomó la foto.
  cabecera(escribir, modelos, skills, instantanea, entorno);

  // Con TTY el Enter aprueba; sin él NO, y es deliberado: en un pipe o en CI una línea en
  // blanco no demuestra que haya nadie mirando, y esto aprueba escrituras sobre un
  // proyecto real. La regla vive en `interpretAnswer`; aquí solo se le dice si hay TTY.
  const interactivo = process.stdin.isTTY === true;
  const preguntar = preguntarPorStdin();
  let sinHumano = false;

  const sesion = await abrirSesionReal({
    raiz,
    modelos,
    skills,
    entorno,
    pedirAprobacion: async (lista, ficheros) => {
      // **Se pregunta SIEMPRE, con TTY o sin él.** Cortar aquí sin preguntar dejaría
      // muerto el conjunto de respuestas sin-TTY de `interpretAnswer`, que existe
      // precisamente para que en un pipe o en CI se pueda aprobar con un `s` EXPLÍCITO.
      // La garantía no la da negarse a preguntar, la da la asimetría: sin un sí
      // explícito, es rechazo. Y si stdin está cerrado, `preguntarPorStdin` resuelve con
      // cadena vacía — o sea, rechazo.
      if (!interactivo) {
        escribir(`\n⏸  ${lista.length} escritura(s) piden aprobación, y no hay terminal.\n`);
        escribir("   Sin un «s» explícito se rechazan (una línea en blanco NO aprueba).\n");
      }
      const decisiones = await pedirDecisiones(lista, preguntar, escribir, {
        interactive: interactivo,
        fichero: (id) => ficheros.get(id),
      });
      if (!interactivo && [...decisiones.values()].every((d) => d.type === "reject")) {
        sinHumano = true;
        throw new CorteSinHumano();
      }
      return decisiones;
    },
  });

  // 5-6. El turno: la sesión conduce el stream y el bucle de aprobación — el tope de
  // rondas lo controla ella. La centinela recorta el caso «sin humano» antes de la
  // reanudación; cualquier otro throw sigue siendo un fallo real y se propaga.
  let bitacora = null as Awaited<ReturnType<typeof sesion.turno>>["bitacora"] | null;
  let cambios: Cambio[];
  let cortadoPorTope = false;
  try {
    ({ bitacora, cambios, cortadoPorTope } = await sesion.turno(opciones.peticion, piel));
  } catch (e) {
    if (!(e instanceof CorteSinHumano)) throw e;
    cambios = await instantanea.cambios();
  }

  // 7. El diff contra la foto. Un turno que no tocó nada TIENE que verse igual.
  escribir("\n--- cambios en el proyecto ---\n");
  if (cambios.length === 0) {
    escribir("sin cambios en el proyecto\n");
  } else {
    for (const c of cambios) escribir(`  [${c.clase}] ${c.ruta}\n`);
  }

  if (sinHumano) {
    escribir("\n(sin humano en modo `run`: nada se aprobó y nada se aplicó)\n");
    return 2;
  }
  // Agotar el tope de rondas es el MISMO desenlace que quedarse sin humano: hay escrituras
  // sin resolver y nada se aplicó. Sin esta línea caía al camino normal y salía 0 — o sea,
  // CI habría leído como éxito un turno que se quedó a medias.
  if (cortadoPorTope) return 2;
  return bitacora!.corrio("bloqueado") ? 1 : 0;
}
