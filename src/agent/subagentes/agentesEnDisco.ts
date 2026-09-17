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
  type AgenteCargado,
  type Carga,
  type Lectura,
} from "../../core/agentes.js";
import { segmentoSeguro } from "../../core/settings.js";
import { NOMBRE_CARPETA } from "../config/configEnDisco.js";

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
export function cargarAgentes(raizDelProyecto?: string): Carga {
  // La siembra se hace AQUÍ, y no en el arranque de cada piel. Medido: estaba en
  // `main.ts#entrarEnConsola` y la rama web devuelve antes de llegar ahí, así que
  // `npm run web` no sembraba nada — la consola arrancaba sin un solo subagente y el
  // orquestador sin nadie a quien delegar, sin que nada diera error. Colgarlo del cargador
  // lo hace imposible de olvidar: quien necesita agentes los pide por aquí, y por
  // construcción hay algo que leer. Es idempotente y no hace nada si la carpeta existe.
  const { desactualizados, retirados } = sembrarAgentes();
  const global = leerCarpetaDeAgentes(rutaGlobalDeAgentes(), "global");
  const proyecto =
    raizDelProyecto === undefined
      ? { agentes: [], problemas: [] }
      : leerCarpetaDeAgentes(rutaDeAgentes(raizDelProyecto), "proyecto");
  // Los que se quedaron atrás NO van a `problemas`, y eso es un cambio medido: iban, y por
  // el mismo canal que un `.md` que no carga, así que la consola pintaba en rojo y arriba del
  // todo dos agentes que están perfectamente. Y su frase —«bórralo si quieres el nuevo»—
  // mandaba a usar una escapatoria que no existe: borrar uno de serie no lo resiembra (la
  // marca recuerda que se entregó), así que dejaba sin ninguno de los dos y para siempre.
  // Ahora el estado viaja POR AGENTE (`marcarSemilla`) y se dice en su tarjeta, que es donde
  // está el botón que lo arregla — `restaurarAgente`. `problemas` vuelve a significar solo
  // «este fichero no se pudo cargar»; comprobado que nadie más lo lee (`turnoReal` y los
  // evals se quedan con `.agentes`).
  // Y los renombrados, por el mismo canal y por la misma razón: el especialista cambia de
  // nombre (o se va con él), y enterarse por la lista sin que nadie lo explique es la clase de
  // sorpresa silenciosa que este módulo existe para no dar. El que se retiró se dice UNA vez
  // —la clave se va con el fichero—; el que se respeta, cada arranque, porque queda decidir.
  const renombrados = retirados.map(({ nombre, ahoraSeLlama, borrado }) =>
    borrado
      ? `${nombre}.md: se ha retirado —ese agente se llama ahora \`${ahoraSeLlama}\`— y el nuevo ya está sembrado.`
      : `${nombre}.md: ese agente se llama ahora \`${ahoraSeLlama}\`, y el tuyo se respeta. Bórralo si quieres quedarte solo con el de serie.`
  );
  return {
    agentes: marcarSemilla(fusionarAgentes(global.agentes, proyecto.agentes), desactualizados),
    problemas: [...renombrados, ...global.problemas, ...proyecto.problemas],
  };
}

/** ¿Es uno de los que trae xonecode? La guarda del `borrar`, y la lista de la pantalla. */
export function esDeSerie(nombre: string): boolean {
  return AGENTES_DE_SERIE.some((a) => a.nombre === nombre);
}

/**
 * De quién es cada `.md`: ausente si lo escribió el usuario, `intacta`/`modificada` si es
 * uno de los nuestros. Ver `AgenteCargado` para los tres estados y qué se hace con cada uno.
 *
 * Pura y exportada a propósito, no compuesta dentro de `cargarAgentes`: es el patrón de
 * fallo de esta arquitectura —una regla que vive en un cierre que todos los tests doblan—, y
 * la trampa de abajo es justo la que se queda sin probar así.
 *
 * **La regla es «de serie Y del GLOBAL», y el segundo requisito no es decorativo.** La
 * siembra solo toca el global, así que un `docs.md` en `.xonecode/agentes/` DEL PROYECTO lo
 * escribió el usuario aunque se llame igual que uno nuestro. Con `nombre ∈ AGENTES_DE_SERIE`
 * a secas se quedaría sin botón de borrar —un fichero suyo que no puede borrar— y con un
 * «Restaurar el de serie» que le pisaría el suyo con el global.
 */
export function marcarSemilla<T extends Agente>(
  agentes: readonly T[],
  desactualizados: readonly string[]
): (T & AgenteCargado)[] {
  return agentes.map((a) =>
    a.origen === "global" && esDeSerie(a.nombre)
      ? { ...a, semilla: desactualizados.includes(a.nombre) ? ("modificada" as const) : ("intacta" as const) }
      : a
  );
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

/**
 * Devuelve un agente de serie a como lo entregamos, pisando lo que el usuario tuviera.
 *
 * Es lo que ocupa el sitio del borrado en un agente sembrado, y existe porque el borrado
 * NO hacía lo que la consola prometía: la marca recuerda que se entregó, así que
 * `sembrarAgentes` no lo resiembra (ver «uno BORRADO no se resucita») — o sea que el
 * «bórralo si quieres el nuevo» dejaba sin ninguno de los dos y para siempre.
 *
 * **No escribe la marca, y es deliberado.** La reanota la siembra siguiente, que corre ANTES
 * de cualquier lectura —`cargarAgentes` la llama primero— y que ya sabe reconocer su propio
 * hash. Escribirla aquí sería un segundo sitio donde decidir sobre la marca, y el único que
 * podría resucitar un agente que el usuario borró a propósito: con una marca ilegible, este
 * camino la reescribiría con una sola clave y las demás pasarían por «nunca entregadas».
 *
 * Devuelve si pudo, como `borrarAgente`: de algo que no es de serie no hay versión nuestra
 * que poner, y la interfaz no puede decir «restaurado» de eso.
 */
export function restaurarAgente(base: string, nombre: string): boolean {
  const agente = AGENTES_DE_SERIE.find((a) => a.nombre === nombre);
  if (agente === undefined) return false;
  const carpeta = rutaDeAgentes(base);
  mkdirSync(carpeta, { recursive: true });
  writeFileSync(join(carpeta, `${agente.nombre}.md`), escribirAgente(agente), "utf8");
  return true;
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
 * Dejan de ser un `Record` a fuego en `agent/grafo/perfiles.ts` y pasan a ser los mismos ficheros
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
  /**
   * Los que se RETIRARON por un renombrado. Es el quinto caso, y el único que no puede salir
   * del bucle de serie: habla de una clave de la marca que ya no nombra a ningún agente.
   */
  retirados: Retirado[];
}

/**
 * Un agente de serie que cambió de nombre.
 *
 * Los dos desenlaces no se cuentan igual, y por eso viaja cuál fue: al nuestro intacto se le
 * retira el fichero —y hay que decirlo, o el especialista desaparece de la lista sin que nada
 * lo explique—, mientras que al que el usuario afinó se le deja donde está.
 */
export interface Retirado {
  /** El nombre que ya no es de serie. */
  nombre: string;
  /** El que tiene ahora. */
  ahoraSeLlama: string;
  /** Cierto si era nuestra semilla intacta y se ha borrado del disco. */
  borrado: boolean;
}

/**
 * Los renombrados: nombre viejo → nombre nuevo.
 *
 * Hace falta porque la marca guarda el hash **por nombre**: renombrar deja una clave que ya no
 * es de serie, y `sembrarAgentes` no la miraba — quien ya tuviera `probador.md` se quedaba con
 * los DOS especialistas, uno de ellos sin mantenimiento.
 *
 * La alternativa era retirar toda clave desconocida cuyo hash fuera el nuestro. Funcionaría
 * hoy y sería una trampa mañana: borraría cualquier entrada rara que un fallo dejara en la
 * marca. Aquí solo se retira lo que consta que renombramos.
 */
const RENOMBRADOS: Readonly<Record<string, string>> = { probador: "xone-device-tester" };

/**
 * Siembra los agentes de serie, y ACTUALIZA los que nadie ha tocado.
 *
 * La regla anterior era «la carpeta es la marca»: si existía, no se escribía nada nunca más.
 * Respetaba el prompt afinado por el usuario —que es lo que había que respetar— pero eligió
 * un cuerno del dilema y el otro acabó mordiendo: **ningún agente nuevo, y ninguna
 * corrección a uno existente, alcanzaba a quien ya hubiera arrancado una vez**. Medido: el
 * `docs.md` de un usuario llevaba semanas sin la consulta acotada, y el probador de
 * dispositivos no le habría llegado jamás.
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
 * Y un quinto, que aparece el día que un agente se RENOMBRA y que no puede salir de ese bucle
 * porque habla de una clave que ya no nombra a ninguno: ver `RENOMBRADOS` y `Retirado`.
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
    return { escritos, desactualizados, retirados: [] };
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

  /**
   * El quinto caso: una clave de la marca que ya no nombra a ningún agente de serie.
   *
   * Solo la deja un renombrado, y solo se mira la de los nombres que constan en `RENOMBRADOS`.
   * El desenlace se decide con el mismo dato que todo lo demás: si el fichero sigue siendo
   * exactamente lo que escribimos, es nuestra semilla y se retira; si no, es del usuario y se
   * queda. Sin marca no se puede saber —esa es la carpeta que se adopta, y ahí el huérfano se
   * queda y no se dice: es el límite, y es el lado que no borra nada ajeno.
   */
  const retirados: Retirado[] = [];
  for (const [viejo, ahoraSeLlama] of Object.entries(RENOMBRADOS)) {
    const anotado = marca[viejo];
    if (anotado === undefined) continue;
    const ruta = join(carpeta, `${viejo}.md`);
    let enDisco: string | undefined;
    try {
      enDisco = existsSync(ruta) ? huella(readFileSync(ruta, "utf8")) : undefined;
    } catch {
      // Sin comparación no hay borrado: un `.md` ilegible se queda, y el cargador dirá por qué.
      continue;
    }
    if (enDisco === undefined) {
      // El fichero ya no está: la clave se va con él, y no hay nada que contarle a nadie.
      delete marca[viejo];
      continue;
    }
    if (enDisco === anotado) {
      rmSync(ruta);
      delete marca[viejo];
      retirados.push({ nombre: viejo, ahoraSeLlama, borrado: true });
      continue;
    }
    // Afinado por el usuario: se queda, y se DICE cada arranque mientras siga ahí — queda algo
    // que decidir, que es borrarlo o quedarse con los dos.
    marca[viejo] = AJENO;
    retirados.push({ nombre: viejo, ahoraSeLlama, borrado: false });
  }

  escribirSemilla(carpeta, marca);
  return { escritos, desactualizados, retirados };
}

/**
 * El bloque de skills visuales, que los cuatro comparten.
 *
 * Va en el CUERPO de los sembrados y no en `REGLAS_XONE`: no es una regla del dominio, es
 * cómo usar dos skills concretas. Un agente que el usuario escriba sin `archify` ni
 * `artifacts-builder` no tiene por qué leer instrucciones sobre tools que no tiene —
 * hablarle de una capacidad que no posee es la misma clase de mentira que un botón muerto.
 */
/**
 * Las dos skills visuales, dónde se GUARDA lo que dibujan y qué NO funciona donde se VE.
 *
 * La última regla —los almacenes del navegador— está aquí y no en la skill por una razón
 * medida: `artifacts-builder/SKILL.md` la explica con detalle y **el modelo no lo abre**. En
 * las tres delegaciones medidas leyó `archify/SKILL.md` y `reference/diagramas.md`, y ni una
 * vez el `SKILL.md` ni `reference/estilo.md`. El resultado, en vivo el 2026-09-07: un
 * artefacto recién escrito puso un interruptor de tema con `localStorage.getItem` en la
 * última línea de su arranque, lanzó `SecurityError` dentro del iframe y se llevó consigo el
 * `setAttribute` del tema — página perfecta y botón muerto. Es la misma lección que la
 * carpeta `/artefactos/`: lo que tiene que cumplirse va donde el modelo mira SIEMPRE, no en
 * una skill que hay que cargar.
 */
const SKILLS_VISUALES = [
  "SKILLS VISUALES:",
  "- REGLA DE PRIORIDAD: para un diagrama, esquema, arquitectura, flujo, secuencia, datos o estados,",
  "  usa solamente `archify`. No cargues ni uses `artifacts-builder` como sustituto.",
  "- Solo si, ADEMÁS del diagrama, el usuario pide un contenedor HTML interactivo, usa `artifacts-builder`",
  "  después de decidir el diagrama con `archify`. No menciones jamás una tool que no tienes.",
  "- DÓNDE se guarda: `/artefactos/<nombre>.html`, y nunca en la raíz del proyecto ni dentro de",
  "  `/skills`. `/artefactos/` es la carpeta de esta sesión: no es del proyecto, no pasa por",
  "  aprobación, no entra en git y no sube a CloudStudio. Un diagrama escrito fuera de ella acaba",
  "  dentro de la app XOne del usuario.",
  "- Si te piden un dashboard, informe, tabla o artefacto HTML interactivo, carga primero `artifacts-builder`.",
  "- DÓNDE se VE, y qué NO funciona ahí: la consola lo pinta en un iframe sin `allow-same-origin`.",
  "  `localStorage`, `sessionStorage` e `indexedDB` LANZAN, y se llevan el resto de tu `<script>`:",
  "  nada de interruptor de tema ni de recordar nada — el tema se resuelve con `matchMedia`, y ya.",
  "  Y no se llega al origen de la consola, así que hornea los datos dentro del HTML.",
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
 * El probador de dispositivos. Su conocimiento del protocolo NO va aquí: va en la skill
 * `xone-hotswap`, que son 1.100 líneas de referencia sobre las dos plataformas y se cargan
 * solo cuando hacen falta. Aquí queda lo que tiene que saber SIEMPRE, que es qué puede y qué
 * no.
 *
 * **Y lo que hoy no puede es hablar con el dispositivo.** Este agente no tiene shell ni
 * cliente del servidor hotswap: las tools que lo harían son el paso siguiente. Decirlo aquí
 * —y decirlo en la `descripcion`, que es lo que el orquestador lee para delegar— es lo que
 * evita el peor botón muerto de todos: uno dentro del grafo, que pulsa el modelo y del que
 * se cree el resultado. Mientras tanto sirve para lo que sí puede: escribir el procedimiento
 * exacto y leer lo que vuelva.
 *
 * Los ejemplos del cuerpo son de Android (`adb`, `logcat`, `runSql`) porque es lo que hay
 * medido; no acotan el agente, que es de las dos plataformas. La que dice cuál tiene qué,
 * comando a comando, es la skill.
 */
const PROCEDIMIENTO_DE_PRUEBA = [
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
 * `docs` lleva además la consulta acotada, y `xone-device-tester` llegó con la documentación
 * del protocolo hotswap —con el nombre viejo, `probador`, ver `RENOMBRADOS`—. Cada regla que
 * se añade aquí se mide antes con los evals, porque un prompt más largo es coste en TODAS las
 * llamadas.
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
    nombre: "xone-device-tester",
    descripcion:
      "Pruebas en un dispositivo o emulador LOCAL —Android o iOS— sobre la app host XOne " +
      "instalada. Hoy NO se conecta al dispositivo: escribe el procedimiento de prueba con " +
      "los comandos y las comprobaciones exactas, y diagnostica los volcados de controles, " +
      "los log y las consultas que se le peguen. No modifica el proyecto.",
    motor: "modelo",
    soloLectura: true,
    skills: ["xone-hotswap", "xone-debugging"],
    instrucciones: PROCEDIMIENTO_DE_PRUEBA,
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
