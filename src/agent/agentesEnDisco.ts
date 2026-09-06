/**
 * Los subagentes en disco: `<base>/.xonecode/agentes/<nombre>.md`, uno por fichero.
 *
 * Ficheros y no una entrada en `config.json` por tres razones. El cuerpo son
 * INSTRUCCIONES, o sea prosa larga, y la prosa dentro de un JSON se vuelve inmanejable en
 * cuanto pasa de dos frases. Es la convención que ya conoce quien viene de Claude Code
 * (`.claude/agents/*.md`), así que el fichero se lee sin explicar nada. Y se edita a mano y
 * se diffea, que es lo que va a pasar de verdad con un prompt que se afina.
 *
 * `.xonecode/` hereda además dos protecciones que aquí importan: está denegada entera al
 * agente (`permisosDe`) y **no sube nunca** a CloudStudio. Un subagente es configuración de
 * la herramienta, no del proyecto XOne — no tiene por qué acabar en Studio.
 *
 * Dos sitios, con la misma precedencia que los modelos: el GLOBAL (`~/.xonecode/agentes/`)
 * y el del PROYECTO, y el de proyecto gana. Un «revisor de XOne» se quiere en todos los
 * proyectos; un «experto en esta app», solo en uno.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  escribirAgente,
  fusionarAgentes,
  leerAgente,
  type Agente,
  type Lectura,
} from "../core/agentes.js";
import { segmentoSeguro } from "../core/settings.js";
import { NOMBRE_CARPETA } from "./configEnDisco.js";

const CARPETA = "agentes";

/** La carpeta de agentes de una raíz cualquiera. */
export function rutaDeAgentes(base: string): string {
  return join(base, NOMBRE_CARPETA, CARPETA);
}

/** La global. `homedir()` en el momento de la llamada, como el resto del repo: cachearla en
 *  una constante de módulo la congelaría para los tests que la cambian. */
export function rutaGlobalDeAgentes(): string {
  return join(homedir(), NOMBRE_CARPETA, CARPETA);
}

/**
 * Lee una carpeta. Un fichero que no se puede leer o que no valida NO tumba la carga: se
 * salta, se apunta el motivo y los demás siguen — es la misma postura que `reabrirSesion`
 * con una línea corrupta del `.jsonl`, y la que evita que un `.md` a medio escribir deje la
 * consola sin ningún subagente.
 */
export function leerCarpetaDeAgentes(carpeta: string, origen: Agente["origen"]): Lectura {
  if (!existsSync(carpeta)) return { agentes: [], problemas: [] };
  const agentes: Agente[] = [];
  const problemas: string[] = [];
  for (const fichero of readdirSync(carpeta).sort()) {
    if (!fichero.endsWith(".md")) continue;
    const nombre = fichero.slice(0, -3);
    let contenido: string;
    try {
      contenido = readFileSync(join(carpeta, fichero), "utf8");
    } catch (e) {
      problemas.push(`${fichero}: no se pudo leer (${(e as Error).message})`);
      continue;
    }
    const r = leerAgente(nombre, contenido, origen);
    if ("error" in r) problemas.push(`${fichero}: ${r.error}`);
    else agentes.push(r.agente);
  }
  return { agentes, problemas };
}

/**
 * Los agentes en vigor para un proyecto: los globales, pisados por los del proyecto.
 *
 * `raizDelProyecto` es opcional porque el vestíbulo existe ANTES de que haya proyecto
 * abierto (`web/servidor/vestibulo.ts`) y la ventana de ajustes se abre desde ahí: sin
 * raíz se contestan los globales, que es la verdad, en vez de una lista vacía.
 */
export function cargarAgentes(raizDelProyecto?: string): Lectura {
  // La siembra se hace AQUÍ, y no en el arranque de cada piel. Medido: estaba en
  // `main.ts#entrarEnConsola` y la rama web devuelve antes de llegar ahí, así que
  // `npm run web` no sembraba nada — la consola arrancaba sin un solo subagente y el
  // orquestador sin nadie a quien delegar, sin que nada diera error. Colgarlo del cargador
  // lo hace imposible de olvidar: quien necesita agentes los pide por aquí, y por
  // construcción hay algo que leer. Es idempotente y no hace nada si la carpeta existe.
  sembrarAgentes();
  const global = leerCarpetaDeAgentes(rutaGlobalDeAgentes(), "global");
  const proyecto =
    raizDelProyecto === undefined
      ? { agentes: [], problemas: [] }
      : leerCarpetaDeAgentes(rutaDeAgentes(raizDelProyecto), "proyecto");
  return {
    agentes: fusionarAgentes(global.agentes, proyecto.agentes),
    problemas: [...global.problemas, ...proyecto.problemas],
  };
}

/**
 * Escribe un agente.
 *
 * `segmentoSeguro` por lo mismo que en `sesiones.ts`: el nombre llega del cliente por HTTP,
 * y un `../../.env` compondría una ruta fuera de la carpeta. Misma función que usa
 * `rutaDeWorkspace`, no una copia — dos guardas es cómo una se corrige y la otra no. LANZA
 * en vez de limpiar, y está bien: limpiar el nombre hasta hacerlo válido guardaría el
 * agente con uno que nadie pidió, y quien lo mandó creería que se llama de otra forma.
 *
 * La validación va ANTES del `mkdirSync`, y no es cosmético: al revés, un nombre rechazado
 * dejaba la carpeta creada de todas formas — y la carpeta es justo la marca de «ya se
 * sembró» (`sembrarAgentes`), así que un intento fallido en el global habría impedido para
 * siempre que se sembraran los cuatro de serie.
 */
export function guardarAgente(base: string, agente: Agente): void {
  const seguro = segmentoSeguro(agente.nombre, "nombre de agente");
  const carpeta = rutaDeAgentes(base);
  mkdirSync(carpeta, { recursive: true });
  writeFileSync(join(carpeta, `${seguro}.md`), escribirAgente({ ...agente, nombre: seguro }), "utf8");
}

/** Borra uno. Devuelve si existía: la interfaz no puede decir «borrado» de algo que no estaba. */
export function borrarAgente(base: string, nombre: string): boolean {
  const ruta = join(rutaDeAgentes(base), `${segmentoSeguro(nombre, "nombre de agente")}.md`);
  if (!existsSync(ruta)) return false;
  rmSync(ruta);
  return true;
}

/**
 * Los cuatro de siempre, sembrados en el GLOBAL la primera vez.
 *
 * Dejan de ser un `Record` a fuego en `agent/perfiles.ts` y pasan a ser los mismos ficheros
 * que puede escribir el usuario. Lo pidió él, y además arregla algo que estaba señalado
 * como provisional en `xoneAgent.ts#promptDe` desde que se escribió: los prompts de los
 * especialistas vivían en código con un `nombre === "planner"` dentro para las
 * particularidades de uno de ellos.
 *
 * **Se siembra UNA VEZ, y la marca es la propia carpeta.** Si `agentes/` existe, no se
 * toca nada — ni siquiera para reponer uno que falte. La alternativa evidente («escribe los
 * que no estén») está mal medida: borrar `mockup` es una decisión, y reponerlo en el
 * siguiente arranque convierte el botón de eliminar en uno que no hace nada hasta que
 * reinicias. Y el mismo razonamiento vale para el que se AFINA: el usuario que reescribe el
 * prompt de `dev` no puede encontrárselo pisado al arrancar.
 *
 * No hace falta un fichero de marca para saber si ya se sembró: la carpeta ES la marca, y
 * un estado menos que mantener es un estado menos que puede quedarse mintiendo. Borrarla
 * entera vuelve a traer los cuatro, que es un «reiniciar» razonable y no un accidente
 * —hay que ir a por ella a propósito.
 */
export function sembrarAgentes(base: string = homedir()): string[] {
  const carpeta = rutaDeAgentes(base);
  if (existsSync(carpeta)) return [];
  mkdirSync(carpeta, { recursive: true });
  const sembrados: string[] = [];
  for (const agente of AGENTES_DE_SERIE) {
    writeFileSync(join(carpeta, `${agente.nombre}.md`), escribirAgente(agente), "utf8");
    sembrados.push(agente.nombre);
  }
  return sembrados;
}

/**
 * El bloque de skills visuales, que los cuatro comparten.
 *
 * Va en el CUERPO de los sembrados y no en `REGLAS_XONE`: no es una regla del dominio, es
 * cómo usar dos skills concretas. Un agente que el usuario escriba sin `archify` ni
 * `artifacts-builder` no tiene por qué leer instrucciones sobre tools que no tiene —
 * hablarle de una capacidad que no posee es la misma clase de mentira que un botón muerto.
 */
const SKILLS_VISUALES = [
  "SKILLS VISUALES:",
  "- REGLA DE PRIORIDAD: para un diagrama, esquema, arquitectura, flujo, secuencia, datos o estados,",
  "  usa solamente `archify`. No cargues ni uses `artifacts-builder` como sustituto.",
  "- Solo si, ADEMÁS del diagrama, el usuario pide un contenedor HTML interactivo, usa `artifacts-builder`",
  "  después de decidir el diagrama con `archify`. Guárdalo en `/artifacts/<nombre>.html`; no escribas",
  "  jamás dentro de `/skills` ni menciones una tool que no tienes.",
  "- Si te piden un dashboard, informe, tabla o artefacto HTML interactivo, carga primero `artifacts-builder`.",
  "- Apóyate en el código real antes de dibujar: no inventes nombres, componentes ni flujos.",
].join("\n");

/**
 * La memoria del proyecto, y quién la lee y la escribe.
 *
 * También vivía en `promptDe`, repartida en dos ternarios sobre el nombre del perfil. Va al
 * cuerpo del fichero y no a `REGLAS_XONE` porque es una POLÍTICA de estos cuatro, no una
 * regla del dominio: un agente que el usuario escriba puede querer no leerla, y `docs`
 * —que contesta de la plataforma y no del proyecto— tampoco la lee.
 */
const MEMORIA_LEER = [
  "Para una tarea sobre este proyecto, lee una sola vez `/MEMORIA_PROYECTO.md` antes de inspeccionarlo.",
  "No la uses para preguntas generales de plataforma.",
].join(" ");

const MEMORIA_LEER_CON_HANDOFF =
  "Lee `/MEMORIA_PROYECTO.md` solo si la tarea NO incluye un `HANDOFF DE PLANNER`. Con handoff, no la leas: sus hechos pertinentes ya vienen resumidos.";

const MEMORIA_ESCRIBIR = [
  "Al terminar trabajo relevante, actualiza esa memoria solo con hechos comprobados, decisiones aprobadas",
  "o pendientes útiles. Nunca copies transcripciones, salidas de tools, secretos ni ficheros completos.",
].join(" ");

const RECONOCIMIENTO_PLANNER = [
  "RECONOCIMIENTO RÁPIDO DEL PROYECTO:",
  "- Para preguntas generales como «qué hace esta app», busca evidencia suficiente, no un inventario completo.",
  "- Lee `/app.xml` y, como máximo, tres ficheros representativos que ese contexto señale.",
  "- En cada primera lectura usa exactamente `offset=0` y `limit=50`; usa otra página solo si una evidencia concreta lo exige.",
  "- No repitas una lectura de la misma ruta y rango, ni hagas búsquedas genéricas como `function ` sin una hipótesis.",
  "- Cuando puedas identificar el propósito y los módulos principales con evidencia, deja de llamar tools y responde.",
  "- Solo amplía la exploración si el usuario pide detalle exhaustivo o si las evidencias son insuficientes o contradictorias; explica brevemente qué faltaba.",
  "- Si el resultado alimenta un diagrama o artefacto, termina con un `HANDOFF DE PLANNER` compacto:",
  "  propósito; nodos; aristas `origen → destino`; evidencia `ruta:líneas`; y lagunas. No incluyas transcript ni lecturas crudas.",
].join("\n");

const HANDOFF_MOCKUP = [
  "HANDOFF PARA DIAGRAMAS:",
  "- Si la descripción de tu tarea incluye `HANDOFF DE PLANNER`, ese bloque es tu evidencia de código real.",
  "- Úsalo como fuente para el diagrama y NO vuelvas a leer, buscar ni reconstruir las rutas ya documentadas.",
  "- Solo inspecciona un fichero si el handoff marca una laguna o dos evidencias se contradicen; explica cuál es la laguna.",
].join("\n");

/** Los cuatro, con los MISMOS textos que tenían en código: esto es una mudanza, no un rediseño. */
export const AGENTES_DE_SERIE: readonly Agente[] = [
  {
    nombre: "docs",
    descripcion:
      "Responde preguntas técnicas de la plataforma XOne (XML/.xne, JavaScript, CSS, " +
      "eventos, patrones). Puede leer el proyecto para no contradecir el código real. " +
      "No modifica nada.",
    motor: "modelo",
    soloLectura: true,
    skills: ["xone-development", "archify", "artifacts-builder"],
    instrucciones: SKILLS_VISUALES,
    origen: "semilla",
  },
  {
    nombre: "planner",
    descripcion:
      "Inspecciona el proyecto real para anclar planes y diagnósticos: estructura, " +
      "colecciones y búsqueda de código. No modifica nada.",
    motor: "modelo",
    soloLectura: true,
    skills: ["xone-spec-builder", "xone-plan-builder", "archify", "artifacts-builder"],
    instrucciones: `${SKILLS_VISUALES}\n\n${RECONOCIMIENTO_PLANNER}\n\n${MEMORIA_LEER}`,
    origen: "semilla",
  },
  {
    nombre: "dev",
    descripcion:
      "Desarrolla: crea y modifica colecciones, escribe scripts y edita ficheros. " +
      "Las modificaciones requieren aprobación humana.",
    motor: "modelo",
    soloLectura: false,
    skills: ["xone-development", "xone-debugging", "archify", "artifacts-builder"],
    instrucciones: `${SKILLS_VISUALES}\n\n${MEMORIA_LEER}\n\n${MEMORIA_ESCRIBIR}`,
    origen: "semilla",
  },
  {
    nombre: "mockup",
    descripcion:
      "Trabajo visual: layouts, CSS y recursos. Las modificaciones requieren " +
      "aprobación humana.",
    motor: "modelo",
    soloLectura: false,
    skills: ["xone-development", "archify", "artifacts-builder"],
    instrucciones: `${SKILLS_VISUALES}\n\n${HANDOFF_MOCKUP}\n\n${MEMORIA_LEER_CON_HANDOFF}\n\n${MEMORIA_ESCRIBIR}`,
    origen: "semilla",
  },
];
