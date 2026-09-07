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

import { createHash } from "node:crypto";
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
  const { desactualizados } = sembrarAgentes();
  const global = leerCarpetaDeAgentes(rutaGlobalDeAgentes(), "global");
  const proyecto =
    raizDelProyecto === undefined
      ? { agentes: [], problemas: [] }
      : leerCarpetaDeAgentes(rutaDeAgentes(raizDelProyecto), "proyecto");
  // Los que se quedaron atrás se DICEN por el mismo canal que un `.md` roto, y por la misma
  // razón: quien lo tiene que arreglar está mirando la ventana de subagentes, y un agente
  // que se quedó en una versión anterior sin que nadie lo diga es exactamente el fallo que
  // esta tanda viene a cerrar. No se pisa: el mensaje dice qué hacer si lo quiere nuevo.
  const atrasados = desactualizados.map(
    (n) => `${n}.md: no es el de serie y la versión de serie ha cambiado; se respeta el tuyo. Bórralo si quieres el nuevo.`
  );
  return {
    agentes: fusionarAgentes(global.agentes, proyecto.agentes),
    problemas: [...atrasados, ...global.problemas, ...proyecto.problemas],
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
 * Los especialistas de serie, sembrados en el GLOBAL.
 *
 * Dejan de ser un `Record` a fuego en `agent/perfiles.ts` y pasan a ser los mismos ficheros
 * que puede escribir el usuario. Lo pidió él, y además arregla algo que estaba señalado
 * como provisional en `xoneAgent.ts#promptDe` desde que se escribió: los prompts de los
 * especialistas vivían en código con un `nombre === "planner"` dentro para las
 * particularidades de uno de ellos.
 *
 * Lo que sigue siendo intocable, y por lo que la regla anterior existía: **el prompt que el
 * usuario afina no se pisa, y el agente que borra no se resucita.** Lo que cambió es cómo
 * se sabe cuál es cuál — ver `sembrarAgentes`.
 */
/** Lo que la marca guarda de cada agente sembrado: el hash de lo que ESCRIBIMOS nosotros. */
const AJENO = "ajeno";

/** El nombre de la marca. Empieza por punto y no acaba en `.md`: el cargador la ignora. */
export const FICHERO_DE_SEMILLA = ".semilla.json";

function rutaDeSemilla(carpeta: string): string {
  return join(carpeta, FICHERO_DE_SEMILLA);
}

function huella(contenido: string): string {
  return createHash("sha256").update(contenido, "utf8").digest("hex").slice(0, 16);
}

/** La marca en disco. Ausente o rota = no hay marca: se ADOPTA lo que haya (ver abajo). */
function leerSemilla(carpeta: string): Record<string, string> | undefined {
  const ruta = rutaDeSemilla(carpeta);
  if (!existsSync(ruta)) return undefined;
  try {
    const bruto: unknown = JSON.parse(readFileSync(ruta, "utf8"));
    if (typeof bruto !== "object" || bruto === null || Array.isArray(bruto)) return undefined;
    const salida: Record<string, string> = {};
    for (const [nombre, valor] of Object.entries(bruto as Record<string, unknown>)) {
      if (typeof valor === "string") salida[nombre] = valor;
    }
    return salida;
  } catch {
    // Una marca rota se trata como ausente y se REESCRIBE adoptando lo que hay. Es lo
    // conservador: lo contrario —darla por vacía y sembrar— pisaría ficheros del usuario.
    return undefined;
  }
}

function escribirSemilla(carpeta: string, marca: Record<string, string>): void {
  writeFileSync(rutaDeSemilla(carpeta), JSON.stringify(marca, null, 2) + "\n", "utf8");
}

export interface Siembra {
  /** Los que se han escrito ahora: nuevos, o actualizados porque nadie los había tocado. */
  escritos: string[];
  /**
   * Los que se quedan atrás: existen, no coinciden con lo que sembramos, y la versión de
   * serie ha cambiado. No se pisan —puede ser trabajo del usuario— pero se DICEN: callarlo
   * es lo que dejaba a un `docs.md` sin la consulta acotada durante semanas.
   */
  desactualizados: string[];
}

/**
 * Siembra los agentes de serie, y ACTUALIZA los que nadie ha tocado.
 *
 * La regla anterior era «la carpeta es la marca»: si existía, no se escribía nada nunca más.
 * Respetaba el prompt afinado por el usuario —que es lo que había que respetar— pero eligió
 * un cuerno del dilema y el otro acabó mordiendo: **ningún agente nuevo, y ninguna
 * corrección a uno existente, alcanzaba a quien ya hubiera arrancado una vez**. Medido: el
 * `docs.md` de un usuario llevaba semanas sin la consulta acotada, y `probador` no le habría
 * llegado jamás.
 *
 * Ahora la marca es un fichero, `.semilla.json`, con el HASH DE LO QUE ESCRIBIMOS NOSOTROS
 * para cada agente. Con eso se distinguen los cuatro casos que antes eran uno solo:
 *
 * | en disco | en la marca | qué se hace |
 * |---|---|---|
 * | no está | no está | es un agente NUEVO: se escribe |
 * | no está | está | lo BORRÓ el usuario: no se resucita |
 * | está, y su hash es el nuestro | está | nadie lo tocó: se actualiza |
 * | está, y su hash NO es el nuestro | cualquiera | es suyo: se deja, y se DICE |
 *
 * **Y una carpeta sin marca se ADOPTA, no se siembra.** Es la de quien ya venía de la regla
 * vieja, y ahí no se puede saber qué borró a propósito: dar por nuevo lo que falta le
 * resucitaría un agente que eliminó. Así que se anota lo que hay —como nuestro si coincide
 * con la versión de serie de hoy, como `ajeno` si no— y no se escribe ningún `.md` esa vez.
 * Desde la siguiente, todo lo de arriba funciona. El coste es una ronda de retraso para las
 * instalaciones viejas; la alternativa es pisar o resucitar sin permiso.
 *
 * El fichero de marca empieza por punto y no acaba en `.md`, así que `leerCarpetaDeAgentes`
 * ni lo mira — no hace falta excluirlo a mano en dos sitios.
 */
export function sembrarAgentes(base: string = homedir()): Siembra {
  const carpeta = rutaDeAgentes(base);
  const escritos: string[] = [];
  const desactualizados: string[] = [];

  if (!existsSync(carpeta)) {
    mkdirSync(carpeta, { recursive: true });
    const marca: Record<string, string> = {};
    for (const agente of AGENTES_DE_SERIE) {
      const contenido = escribirAgente(agente);
      writeFileSync(join(carpeta, `${agente.nombre}.md`), contenido, "utf8");
      marca[agente.nombre] = huella(contenido);
      escritos.push(agente.nombre);
    }
    escribirSemilla(carpeta, marca);
    return { escritos, desactualizados };
  }

  const previa = leerSemilla(carpeta);
  const marca: Record<string, string> = { ...(previa ?? {}) };
  /**
   * Sin marca hay DOS carpetas distintas, y confundirlas cuesta caro en los dos sentidos.
   *
   * La de quien viene de la regla vieja tiene agentes dentro: ahí se adopta, porque no se
   * puede saber qué borró a propósito. Pero una carpeta sin NINGUNO de los de serie no
   * viene de ninguna siembra —la deja, por ejemplo, un `guardarAgente` con un nombre
   * inválido— y adoptarla anotaría los cinco como entregados sin escribir uno solo: ese
   * usuario se quedaría sin ningún subagente para siempre. Se siembra, que es lo que
   * habría pasado si la carpeta no existiera.
   */
  const hayDeSerie = AGENTES_DE_SERIE.some((a) => existsSync(join(carpeta, `${a.nombre}.md`)));
  const adoptando = previa === undefined && hayDeSerie;

  for (const agente of AGENTES_DE_SERIE) {
    const ruta = join(carpeta, `${agente.nombre}.md`);
    const contenido = escribirAgente(agente);
    const nuestro = huella(contenido);
    let enDisco: string | undefined;
    try {
      enDisco = existsSync(ruta) ? huella(readFileSync(ruta, "utf8")) : undefined;
    } catch {
      // Un `.md` que no se puede leer no se puede comparar, y tampoco se pisa: el cargador
      // ya dirá por qué no se pudo leer.
      continue;
    }

    if (adoptando) {
      // La ronda de adopción: se anota lo que hay y no se escribe nada.
      if (enDisco === undefined) marca[agente.nombre] = nuestro;
      else if (enDisco === nuestro) marca[agente.nombre] = nuestro;
      else {
        marca[agente.nombre] = AJENO;
        desactualizados.push(agente.nombre);
      }
      continue;
    }

    if (enDisco === undefined) {
      // Sin fichero: nuevo si no consta que lo hubiéramos entregado; borrado si consta.
      if (marca[agente.nombre] === undefined) {
        writeFileSync(ruta, contenido, "utf8");
        marca[agente.nombre] = nuestro;
        escritos.push(agente.nombre);
      }
      continue;
    }
    if (enDisco === nuestro) {
      marca[agente.nombre] = nuestro;
      continue;
    }
    if (marca[agente.nombre] !== undefined && marca[agente.nombre] !== AJENO && marca[agente.nombre] === enDisco) {
      // Es exactamente lo que escribimos la última vez y la versión de serie ha cambiado:
      // nadie lo ha tocado, así que se actualiza.
      writeFileSync(ruta, contenido, "utf8");
      marca[agente.nombre] = nuestro;
      escritos.push(agente.nombre);
      continue;
    }
    marca[agente.nombre] = AJENO;
    desactualizados.push(agente.nombre);
  }

  escribirSemilla(carpeta, marca);
  return { escritos, desactualizados };
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

/**
 * La consulta acotada de `docs`, medida antes de escribirla.
 *
 * Trazado (`docs/EVALS.md`, «El coste, medido»): para decir que un atributo NO existe,
 * `docs` hizo 26 llamadas y 317k tokens de entrada — tres `ls` y tres `glob` para
 * inventariar `/skills`, ocho `grep` con `max_count: 30` en modo contenido (uno solo metió
 * 1,4k tokens), y seis referencias leídas por páginas. Y nunca abrió
 * `references/indice-completo.md`, que es el índice de las 55 referencias y la primera
 * fila de `SKILL.md`. La regla no le quita capacidad: le dice dónde está el índice y
 * cuándo la respuesta ya es «no está documentado» — que en XOne significa «no existe, no
 * lo uses», y seguir buscando sinónimos no lo hace existir.
 */
const CONSULTA_ACOTADA_DOCS = [
  "CONSULTA ACOTADA DE LAS REFERENCIAS:",
  "- `/skills/<skill>/SKILL.md` es la regla corta y `references/indice-completo.md` es el índice de TODAS las",
  "  referencias: léelo antes de buscar. No hagas `ls` ni `glob` sobre `/skills`; el índice ya dice qué hay y dónde.",
  "- Abre como máximo tres referencias por pregunta, las que el índice señale para el tema, con `offset=0` y",
  "  `limit=100`; pide otra página solo si el índice o el propio fichero dicen que lo buscado sigue ahí.",
  "- Un `grep` por hipótesis concreta (un atributo, una función, una clase), con `max_count=5` y sobre la carpeta",
  "  de su familia. Nunca dos sinónimos seguidos de lo mismo, ni una búsqueda sin hipótesis, ni repetir una",
  "  lectura de la misma ruta y rango.",
  "- Si el índice y las referencias del tema no nombran lo que se pregunta, la respuesta es que NO está",
  "  documentado y por tanto no existe para XOne: dilo, nombra las referencias que miraste, y para.",
  "- En cuanto tengas la evidencia para contestar, deja de llamar tools y responde.",
].join("\n");

const HANDOFF_MOCKUP = [
  "HANDOFF PARA DIAGRAMAS:",
  "- Si la descripción de tu tarea incluye `HANDOFF DE PLANNER`, ese bloque es tu evidencia de código real.",
  "- Úsalo como fuente para el diagrama y NO vuelvas a leer, buscar ni reconstruir las rutas ya documentadas.",
  "- Solo inspecciona un fichero si el handoff marca una laguna o dos evidencias se contradicen; explica cuál es la laguna.",
].join("\n");

/**
 * El probador de Android. Su conocimiento del protocolo NO va aquí: va en la skill
 * `xone-android-hotswap`, que son 1.200 líneas de referencia y se cargan solo cuando hacen
 * falta. Aquí queda lo que tiene que saber SIEMPRE, que es qué puede y qué no.
 *
 * **Y lo que hoy no puede es hablar con el dispositivo.** Este agente no tiene shell ni
 * cliente del servidor hotswap: las tools que lo harían son el paso siguiente. Decirlo aquí
 * —y decirlo en la `descripcion`, que es lo que el orquestador lee para delegar— es lo que
 * evita el peor botón muerto de todos: uno dentro del grafo, que pulsa el modelo y del que
 * se cree el resultado. Mientras tanto sirve para lo que sí puede: escribir el procedimiento
 * exacto y leer lo que vuelva.
 */
const PROBADOR_ANDROID = [
  "LO QUE PUEDES Y LO QUE NO, HOY:",
  "- NO tienes conexión con el dispositivo: no puedes lanzar adb, ni abrir el WebSocket del",
  "  servidor hotswap, ni subir un fichero, ni capturar una pantalla. No lo intentes ni digas",
  "  que lo has hecho.",
  "- Sí puedes leer el proyecto, y con eso escribir el PROCEDIMIENTO exacto: los comandos en",
  "  orden, con el nombre real de cada colección y de cada control, y qué tiene que valer cada",
  "  comprobación para dar la prueba por pasada.",
  "- Y puedes LEER lo que te devuelvan: un volcado de `getAllElements`, un logcat, la salida de",
  "  un `runSql`. Ahí sí diagnosticas.",
  "",
  "CÓMO ESCRIBES UNA PRUEBA:",
  "- Un paso es una acción y su comprobación. Una acción sin comprobación no prueba nada.",
  "- Por NOMBRE de control, nunca por coordenadas.",
  "- Espera a un control (`waitForElement`), nunca a un número de segundos.",
  "- Di qué evidencia esperas de cada comprobación (`getText` devuelve X, `isVisible` true) en",
  "  vez de «comprobar que se ve bien».",
  "- Si el proyecto no tiene el control que la prueba necesitaría, DILO: no inventes un nombre.",
].join("\n");

/**
 * Los cinco. Nacieron como una mudanza de los textos que había en código; desde entonces
 * `docs` lleva además la consulta acotada, y `probador` llegó con la documentación del
 * protocolo hotswap. Cada regla que se añade aquí se mide antes con los evals, porque un
 * prompt más largo es coste en TODAS las llamadas.
 */
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
    instrucciones: `${SKILLS_VISUALES}\n\n${CONSULTA_ACOTADA_DOCS}`,
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
    nombre: "probador",
    descripcion:
      "Pruebas en un dispositivo ANDROID local, sobre la app XOneStudio del móvil o del " +
      "emulador. Hoy NO se conecta al dispositivo: escribe el procedimiento de prueba con " +
      "los comandos y las comprobaciones exactas, y diagnostica los volcados de controles, " +
      "los logcat y las consultas que se le peguen. No modifica el proyecto.",
    motor: "modelo",
    soloLectura: true,
    skills: ["xone-android-hotswap", "xone-debugging"],
    instrucciones: PROBADOR_ANDROID,
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
