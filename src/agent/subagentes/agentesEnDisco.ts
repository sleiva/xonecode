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
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  escribirAgente,
  fusionarAgentes,
  leerAgente,
  motivoDeNombreInaceptable,
  nombreSugerido,
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
    if ("error" in r) {
      problemas.push(`${fichero}: ${r.error}`);
      continue;
    }
    /**
     * Un nombre que no es un slug se DICE y el agente se CARGA.
     *
     * Rechazarlo aquí haría desaparecer un subagente que funciona, que es lo contrario de lo
     * que hace todo este módulo — y el usuario no tendría ni el nombre para buscarlo. Quien
     * lo rechaza es el guardado (`arranque.ts#atenderAgente`), que es el único momento con
     * alguien delante para arreglarlo. El aviso va por `problemas`, y ahí sí encaja: esto no
     * es un estado del agente, es trabajo pendiente sobre su fichero.
     *
     * Y lleva el nombre que SÍ valdría, porque un aviso que no se puede obedecer no sirve:
     * «renómbralo a `documentador`» se arregla en el mismo formulario donde se lee.
     */
    const malNombre = motivoDeNombreInaceptable(nombre);
    if (malNombre !== undefined) {
      const sugerido = nombreSugerido(nombre);
      problemas.push(
        `${fichero}: el nombre ${malNombre}` +
          (sugerido === undefined ? ". Renómbralo." : `. Renómbralo a \`${sugerido}\`.`)
      );
    }
    agentes.push(r.agente);
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

/** Los tres desenlaces de un renombrado. Tres situaciones distintas, tres valores. */
export type Renombrado = "hecho" | "sin-origen" | "destino-ocupado";

/**
 * Renombra un subagente, escribiendo a la vez lo que se haya cambiado de él.
 *
 * **`renameSync` y LUEGO escribir**, nunca escribir y luego borrar: un fallo entre los dos
 * pasos deja UN fichero —el renombrado, con el contenido de antes—, nunca dos con el mismo
 * prompt ni cero. Al revés, una excepción entre el `write` y el `rm` deja los DOS, que es
 * justo lo que el campo deshabilitado del formulario evitaba: dos subagentes con la misma
 * descripción y ninguna forma de saber a cuál delega el orquestador.
 *
 * Las dos cosas en el mismo paso porque el formulario permite cambiar el nombre Y el resto en
 * la misma pulsación; guardar solo una dejaría la pantalla mintiendo.
 *
 * **El destino ocupado es un NO**, sea de serie o del usuario: sin esta guarda, renombrar
 * `advisor` a `docs` se llevaba por delante el `docs.md` sembrado —o el otro subagente— sin
 * decir nada. Un caso especial para los de serie diría un motivo menos cierto.
 *
 * **Pero «existe» no es «es otro fichero», y eso está MEDIDO en una máquina de verdad.** APFS
 * es insensible a mayúsculas, así que con un `Documentador.md` en disco el `existsSync` de
 * `documentador.md` contesta SÍ —es el mismo fichero— y esta guarda rechazaba justo el arreglo
 * que el aviso del cargador propone, que es el renombrado más común de todos. Se compara por
 * INODO (`dev` + `ino`): si el destino ES el origen, no hay nada ocupado. En un sistema
 * sensible a mayúsculas son dos ficheros con dos inodos, así que la comparación sigue diciendo
 * la verdad ahí — y si el otro existe de verdad, se sigue rechazando.
 *
 * Que un de serie NO se pueda renombrar no se decide aquí: esto mueve un fichero, y la regla
 * del producto vive donde ya vive la de que no se borra (`arranque.ts#atenderAgente`). Dos
 * sitios donde decidir lo mismo es cómo uno de los dos se queda sin la regla.
 */
export function renombrarAgente(base: string, viejo: string, agente: Agente): Renombrado {
  // Antes de mover nada: el nombre viene del cliente por HTTP, y `segmentoSeguro` LANZA en
  // vez de limpiarlo — limpiarlo guardaría el agente con un nombre que nadie pidió.
  const seguro = segmentoSeguro(agente.nombre, "nombre de agente");
  const carpeta = rutaDeAgentes(base);
  const origen = join(carpeta, `${segmentoSeguro(viejo, "nombre de agente")}.md`);
  const destino = join(carpeta, `${seguro}.md`);
  if (!existsSync(origen)) return "sin-origen";
  if (existsSync(destino) && !elMismoFichero(origen, destino)) return "destino-ocupado";
  renameSync(origen, destino);
  writeFileSync(destino, escribirAgente({ ...agente, nombre: seguro }), "utf8");
  return "hecho";
}

/**
 * ¿Las dos rutas son el MISMO fichero? Por `dev` + `ino`, no por texto.
 *
 * Por texto no se puede: en un sistema insensible a mayúsculas `Documentador.md` y
 * `documentador.md` son el mismo y sus nombres no se parecen bajo `===`; y comparar en
 * minúsculas mentiría en un sistema sensible, donde sí son dos. El inodo contesta la pregunta
 * de verdad en los dos. Lo que no se puede mirar se da por DISTINTO, que es el lado que no
 * pisa nada.
 */
function elMismoFichero(a: string, b: string): boolean {
  try {
    const ea = statSync(a);
    const eb = statSync(b);
    return ea.dev === eb.dev && ea.ino === eb.ino;
  } catch {
    return false;
  }
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
const RENOMBRADOS: Readonly<Record<string, string>> = {
  // Los cinco de serie pasaron a `<rol>-xone`, en inglés. El sufijo no es decoración: estos
  // nombres viajan como `subagent_type` a los motores externos, donde el hijo tiene sus
  // propios agentes, y ahí es lo que los distingue.
  docs: "consultant-xone",
  planner: "analyst-xone",
  dev: "developer-xone",
  mockup: "designer-xone",
  "xone-device-tester": "device-controller",
  /**
   * Y el de antes se ACTUALIZA, no se deja: apuntaba a `xone-device-tester`, que ya no es de
   * serie, así que a quien conserve un `probador.md` afinado se le habría seguido diciendo
   * que «ese agente se llama ahora `xone-device-tester`» — un nombre que no existe. Esto se
   * lee de un solo salto, no como una cadena.
   *
   * Dos claves pueden apuntar al mismo nombre nuevo sin chocar: cada entrada se resuelve por
   * separado contra el hash de SU fichero.
   */
  probador: "device-controller",
  /**
   * Y `tester-xone` se convirtió en `device-controller` cuando dejó de escribir pruebas para
   * CONDUCIR el aparato: con `ejecucion: true` ya no es el que dice cómo se probaría, es el
   * que lo hace. El nombre viejo describía lo que podía hacer cuando no tenía manos.
   *
   * **Se sale de la convención `<rol>-xone` a propósito**, y es decisión del usuario: lo que
   * conduce no es propio de XOne —mañana es otro aparato con otra skill—, y el sufijo estaba
   * para distinguir nuestros nombres de los agentes del hijo en un motor externo. Este no
   * viaja a ninguno: con motor externo la ejecución no se concede (`puedeEjecutar`).
   */
  "tester-xone": "device-controller",
};

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
/**
 * **Ya no existe, y su hueco se deja escrito a propósito.**
 *
 * Era un bloque de ~1.400 caracteres —cómo elegir entre `archify` y `artifacts-builder`, dónde
 * se guarda un artefacto y qué no funciona dentro del iframe— que iba en el prompt de CUATRO
 * especialistas y por tanto viajaba en cada una de sus llamadas, hablaran o no de diagramas. Se
 * midió lo que costaba con `inspectorDePrompt`: en un turno normal, la cabecera es el 87 % de
 * la petición.
 *
 * Nació de una lección buena: un turno leyó `archify/SKILL.md` y una referencia, se saltó
 * `estilo.md` —donde estaba la regla— y escribió un artefacto con `localStorage` que se mató
 * solo. Pero la conclusión correcta de eso no era «repítelo en todos los prompts», era
 * **ponerlo en el fichero que sí se abre**: hoy la regla encabeza el cuerpo de
 * `skills/archify/SKILL.md` y `skills/artifacts-builder/SKILL.md`.
 *
 * Y hay una segunda razón para no nombrar las skills aquí: `SkillsMiddleware` ya las anuncia
 * con su descripción y su ruta, y nombrarlas otra vez —con instrucciones de uso— es lo que
 * llevaba al especialista a cargarlas antes de saber si le hacían falta.
 */


/**
 * La memoria del proyecto, y quién la lee y la escribe.
 *
 * También vivía en `promptDe`, repartida en dos ternarios sobre el nombre del perfil. Va al
 * cuerpo del fichero y no a `REGLAS_XONE` porque es una POLÍTICA de estos cuatro, no una
 * regla del dominio: un agente que el usuario escriba puede querer no leerla, y `docs`
 * —que contesta de la plataforma y no del proyecto— tampoco la lee.
 */
/**
 * Trabajar CON un plan, cuando lo hay.
 *
 * El plan no es un documento que alguien entrega y se archiva: es el estado compartido entre
 * quien planifica y quien desarrolla, y por eso vive en `/planes/<nombre>/` —fuera del proyecto,
 * fuera de git y fuera de CloudStudio— y sobrevive a la sesión. Sin esta instrucción el plan se
 * escribía y nadie volvía a mirarlo: medido, los ocho proyectos del usuario tenían CERO.
 *
 * **Se marca lo COMPROBADO, no lo escrito**, que es la misma regla que gobierna todo lo demás
 * aquí: un comando que devuelve 0 no dice que la app arrancara, y un fichero guardado no dice
 * que el criterio se cumpla.
 */
const TRABAJAR_CON_PLAN = [
  "SI TU ENCARGO NOMBRA UN PLAN (`/planes/<nombre>/`):",
  "- Lee su `TASKS.md` ANTES de tocar nada y trabaja la tarea que te toque, no el plan entero.",
  "  Su `PLAN.md` y su `CONTEXT.md` están al lado si te falta contexto; no los redescubras.",
  "- Y ACTUALÍZALO en el mismo sitio cuando termines: `**Estado:**` a `hecha`, y las casillas",
  "  de los criterios a `- [x]` solo si los has COMPROBADO — no por haber escrito el código que",
  "  debería cumplirlos. Lo que no puedas comprobar se queda sin marcar y lo dices.",
  "- Si el plan se contradice con lo que ves en el código, no lo sigas a ciegas: dilo y para.",
].join("\n");

const MEMORIA_LEER = [
  "Para una tarea sobre este proyecto, lee una sola vez `/MEMORIA_PROYECTO.md` antes de inspeccionarlo.",
  "No la uses para preguntas generales de plataforma.",
].join(" ");

const MEMORIA_LEER_CON_HANDOFF =
  "Lee `/MEMORIA_PROYECTO.md` solo si la tarea NO incluye un `HANDOFF DE ANÁLISIS`. Con handoff, no la leas: sus hechos pertinentes ya vienen resumidos.";

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
  "- Si el resultado alimenta un diagrama o artefacto, termina con un `HANDOFF DE ANÁLISIS` compacto:",
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
  "- Si la descripción de tu tarea incluye `HANDOFF DE ANÁLISIS`, ese bloque es tu evidencia de código real.",
  "- Úsalo como fuente para el diagrama y NO vuelvas a leer, buscar ni reconstruir las rutas ya documentadas.",
  "- Solo inspecciona un fichero si el handoff marca una laguna o dos evidencias se contradicen; explica cuál es la laguna.",
].join("\n");

/**
 * El que CONDUCE el aparato. Su conocimiento del protocolo NO va aquí: va en la skill
 * `xone-hotswap`, que son 1.100 líneas de referencia sobre las dos plataformas y se cargan
 * solo cuando hacen falta. Y las reglas de método —por nombre y no por coordenadas, esperar
 * a un control y no a un temporizador, un `result:false` es el resultado— tampoco: están en
 * esa misma skill, y aquí se pagarían en cada llamada, dibuje o no.
 *
 * **Lo que queda es lo que la skill no puede saber: cómo es ESTA casa.** Dónde están sus
 * ficheros cuando se mira el disco de verdad, dónde se deja lo que una persona va a ver, y
 * qué hacer con un comando que no termina. Nada de eso es de XOne ni de Android: es del
 * harness, y por eso vive en código y no en una skill que mañana se sustituye por otra.
 *
 * Este bloque vale para CUALQUIER agente con `ejecucion: true`, no solo para éste. Está
 * escrito así a propósito: el día que haya un segundo, lo hereda sin copiarse.
 */
const EJECUCION_EN_LA_MAQUINA = [
  "CONDUCES UN APARATO Y EJECUTAS COMANDOS EN ESTA MÁQUINA (`execute`).",
  "",
  "Los scripts de tus skills están EN EL PATH: se llaman por su nombre, sin ruta ninguna.",
  "Los de `xone-hotswap` son `xone-arrancar-android` (levanta el emulador y ESPERA a que",
  "esté listo; ya arrancado, lo dice y no hace nada), `xone-reiniciar-android` (déjalo en",
  "estado conocido: es lo primero que hay que probar si el canal no contesta),",
  "`xone-desplegar-android`,",
  "`xone-hotswap`, `xone-log-android` (las excepciones del aparato, que es donde está el",
  "porqué cuando algo no se pinta), `xone-captura-android` y `xone-arrancar-ios`;",
  "cualquiera con `--help` o sin argumentos te dice cómo se usa. Úsalos: hacen lo que te piden",
  "y no hay que reescribirlos.",
  "",
  "`read_file`, `ls`, `glob` y `grep` ven rutas VIRTUALES —la raíz `/` es el proyecto—, así que",
  "una ruta absoluta del disco no existe para ellas y no va a funcionar por mucho que la",
  "reintentes. Para mirar un fichero de una skill usa `cat`, que sí ve el disco de verdad.",
  "",
  "SI LA APP PIDE LOGIN Y NO SABES ENTRAR, no lo deduzcas leyendo el código: pregúntaselo al",
  "APARATO, que tiene la base de datos de verdad —`runSql` con",
  "`select LOGIN, PWD from <prefijo>_usuarios`, donde `<prefijo>` es el `prefix` del `<app>`",
  "de `app.xml`—. Mira también si `autologon` está puesto. Y si aun así no entras, PÁRATE:",
  "cuenta qué probaste y qué te falta. Quien lee tu respuesta puede darte las credenciales;",
  "gastar el turno probando contraseñas no.",
  "",
  "PARA LLEGAR A UNA PANTALLA CONCRETA, no vayas a ciegas: `xone_navegacion` con",
  "`operacion: \"referencias\"` y el nombre de la colección te dice QUÉ control lleva hasta ella",
  "y en qué fichero está. Y si ese control no aparece en el árbol, no es que no exista: es que",
  "todavía no se ve — mira el árbol, abre lo que haga falta (un cajón, un menú, la pantalla de",
  "antes) y vuelve a mirar, en vez de repetir el mismo clic.",
  "",
  "CÓMO TRABAJAS, QUE ES LO QUE DECIDE SI ESTO SALE BARATO O CARO:",
  "- UN comando, miras su salida, y entonces decides el siguiente. Nada de disparar diez a la",
  "  vez para ver cuál pega: la salida del primero cambia lo que hay que hacer después.",
  "- Pero pide de una vez lo que sabes que vas a necesitar: lo caro no es lo que un comando",
  "  devuelve, es cada ida y vuelta, que reenvía toda la conversación. `xone-hotswap` acepta",
  "  varios comandos seguidos, y `xone-desplegar-android --captura` lanza Y captura en una.",
  "- Si uno falla, cambia de hipótesis en vez de repetirlo. Dos intentos iguales dan lo mismo.",
  "- No escribas ficheros sueltos en la raíz del proyecto: es la app del usuario, y ahí va a",
  "  aprobación, a git y a CloudStudio. Lo que quieras ENSEÑAR va a `$XONECODE_ARTEFACTOS`, y",
  "  los scripts ya lo hacen por ti. Una captura es `xone-hotswap '{\"command\":\"getScreenshot\"}'`",
  "  y, si el canal no contesta, `xone-captura-android` — nunca un `adb … screencap > fichero`,",
  "  que el `cwd` es la raíz del proyecto.",
  "- EMPIEZA por mirar qué hay: `adb devices`. Sin ningún aparato, `xone-arrancar-android`",
  "  ANTES de nada más — no lo compongas a mano, que `emulator` no suele estar en el PATH.",
  "- Un comando que no termina cuelga el turno: lo que no vuelve va al fondo (`… &`) y se",
  "  espera a una CONDICIÓN acotada, no a un número de segundos.",
  "",
  "LO QUE CUENTAS:",
  "- La salida literal de lo que corriste, no tu interpretación. Un comando que devuelve 0 no",
  "  dice que la app arrancara.",
  "- Y no digas que hiciste un paso que no hiciste: si capturaste lo que ya había en pantalla",
  "  sin desplegar el proyecto, eso es lo que hay que contar.",
  "- Si no pudiste comprobar algo, dilo en vez de deducirlo.",
].join("\n");

/**
 * Los cinco. Nacieron como una mudanza de los textos que había en código; desde entonces
 * `docs` lleva además la consulta acotada, y el que conduce aparatos llegó con la documentación
 * del protocolo hotswap y pasó por dos nombres más antes de `device-controller` (ver
 * `RENOMBRADOS`). Cada regla que
 * se añade aquí se mide antes con los evals, porque un prompt más largo es coste en TODAS las
 * llamadas.
 */
export const AGENTES_DE_SERIE: readonly Agente[] = [
  {
    nombre: "consultant-xone",
    descripcion:
      "Para preguntas técnicas de la plataforma XOne: XML/.xne, JavaScript, CSS, eventos y " +
      "patrones. Úsalo cuando la duda sea «¿cómo se hace esto en XOne?» o «¿este atributo " +
      "existe?», no para averiguar qué hay en el proyecto. Dale la pregunta concreta y el " +
      "contexto que ya hayas visto. Devuelve la respuesta anclada en la documentación de la " +
      "plataforma, y dice cuándo no lo sabe en vez de deducirlo.",
    motor: "modelo",
    soloLectura: true,
    /**
     * **Sin las visuales, y eso es una DECISIÓN de reparto, no un recorte a ciegas.**
     *
     * Cada skill asignada mete en su prompt de sistema el nombre, la descripción y la ruta que
     * pone `SkillsMiddleware`, y la descripción de `archify` sola son ~700 caracteres de inglés
     * sobre diagramas, ETL y Mermaid — en CADA llamada, dibuje o no. Este contesta preguntas de
     * la plataforma; la regla del orquestador ya manda los diagramas a `designer-xone`, así que
     * dárselas era pagar una capacidad que no le toca ejercer.
     */
    skills: ["xone-development"],
    instrucciones: `${CONSULTA_ACOTADA_DOCS}`,
    origen: "semilla",
  },
  {
    nombre: "analyst-xone",
    descripcion:
      "Para enterarte de cómo es ESTE proyecto antes de tocarlo: qué colecciones hay, dónde " +
      "se declara algo, quién usa qué. Úsalo como PRIMER paso de un encargo que vaya a " +
      "cambiar código, y no para preguntas de la plataforma. Dale qué hay que averiguar y " +
      "para qué, que es lo que acota cuánto busca. Devuelve hechos con su fichero y su " +
      "línea, listos para pasárselos al siguiente en un bloque HANDOFF DE ANÁLISIS. Para un " +
      "desarrollo grande puede además dejar un PLAN escrito en `/planes/<nombre>/` —spec, " +
      "tareas y glosario— y entonces te dice el nombre: pásaselo a quien desarrolle.",
    motor: "modelo",
    soloLectura: true,
    skills: ["xone-spec-builder", "xone-plan-builder", "archify", "artifacts-builder"],
    instrucciones: `${RECONOCIMIENTO_PLANNER}\n\n${MEMORIA_LEER}`,
    origen: "semilla",
  },
  {
    nombre: "developer-xone",
    descripcion:
      "Para CAMBIAR el proyecto: crear o modificar colecciones, escribir scripts, editar " +
      "ficheros. Dale los hechos ya averiguados —no le hagas redescubrirlos— y QUÉ tiene que " +
      "conseguir, no cómo. Si hay un plan en `/planes/<nombre>/`, dale el nombre y la tarea " +
      "concreta: lo lee y marca ahí lo que deja hecho. Devuelve los ficheros que cambió; cada " +
      "escritura para el turno y pide aprobación, así que un encargo enorme son muchas " +
      "paradas: pártelo.",
    motor: "modelo",
    soloLectura: false,
    // `artifacts-builder` se queda: escribe documentos e informes. `archify` no, que los
    // diagramas son de `designer-xone` y su descripción son ~700 caracteres por llamada.
    skills: ["xone-development", "xone-debugging", "artifacts-builder"],
    instrucciones: `${TRABAJAR_CON_PLAN}\n\n${MEMORIA_LEER}\n\n${MEMORIA_ESCRIBIR}`,
    origen: "semilla",
  },
  {
    nombre: "device-controller",
    descripcion:
      "Para PROBAR en un móvil o emulador de verdad: despliega, navega hasta una pantalla y " +
      "mira qué pasa. Es el único que ve lo que ninguna comprobación estática puede ver. " +
      "Dile SIEMPRE a qué pantalla o colección llegar y qué comprobar ahí: «pruébalo» a " +
      "secas le hace improvisar y sale caro. Levanta el emulador si no hay ninguno. Devuelve " +
      "lo que MIDIÓ —salida literal, captura y excepciones del log—, y dice lo que no pudo " +
      "comprobar en vez de deducirlo. No lo uses para cambiar el proyecto: eso es de " +
      "developer-xone.",
    motor: "modelo",
    /**
     * **NO es de solo lectura, y decirlo importa por dos cosas distintas.**
     *
     * La primera es honestidad: tiene una shell, así que puede escribir el disco entero. Una
     * pastilla verde de «solo lectura» sobre el único agente que alcanza la máquina es
     * exactamente el tipo de etiqueta que enseña a no mirarlas.
     *
     * La segunda es que ese campo DECIDE EL MODELO: `rapido` para quien solo lee, `trabajo`
     * para quien escribe. Conducir un aparato —leer un log, entender una excepción de Rhino,
     * decidir el siguiente comando— no es trabajo de modelo barato, y medido con uno rápido se
     * quedaba en bucles: probaba lo mismo dos veces, mezclaba rutas virtuales con reales y
     * tardaba tres turnos en hacer lo que hace en uno. `soloLectura` se refería a los FICHEROS
     * y aquí se estaba leyendo como «tarea sencilla», que es otra cosa.
     *
     * Lo que NO cambia: sigue sin `write_file` ni `edit_file` (`TOOLS_CON_EJECUCION`), para que
     * el camino normal de tocar el proyecto siga siendo el que pasa por la aprobación y el diff.
     */
    soloLectura: false,
    /**
     * **El único de serie con ejecución**, y lo que concede no es «correr un comando»: una
     * shell no pasa por `permisosDe` ni por el `virtualMode`, así que alcanza el disco
     * entero. Se le da porque es lo único que contesta «lanza la app»: el canal del aparato
     * es un WebSocket —`curl` no lo habla— y el despliegue es `adb` más una subida HTTP.
     * Ninguna de las dos cosas se compone leyendo, y un prompt no las suple.
     */
    ejecucion: true,
    skills: ["xone-hotswap", "xone-debugging"],
    instrucciones: EJECUCION_EN_LA_MAQUINA,
    origen: "semilla",
  },
  {
    nombre: "designer-xone",
    descripcion:
      "Para cambiar cómo se VE algo: el layout de una pantalla, el CSS, los recursos, y los " +
      "diagramas de la app. La frontera con developer-xone no es el fichero sino la PREGUNTA: " +
      "si lo que falla es la colocación, el tamaño, el color o la legibilidad es suyo aunque " +
      "se arregle en un `.xne`; si es qué hace un botón al pulsarlo, es de developer-xone " +
      "aunque se toque el CSS. Dale la pantalla, qué se ve mal y qué tendría que verse — y si " +
      "el arreglo depende del código real, el análisis ya hecho. Devuelve los ficheros que " +
      "cambió, con aprobación como cualquier otra escritura.",
    motor: "modelo",
    soloLectura: false,
    skills: ["xone-development", "archify", "artifacts-builder"],
    instrucciones: `${TRABAJAR_CON_PLAN}\n\n${HANDOFF_MOCKUP}\n\n${MEMORIA_LEER_CON_HANDOFF}\n\n${MEMORIA_ESCRIBIR}`,
    origen: "semilla",
  },
];
