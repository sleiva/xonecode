/**
 * Los settings GLOBALES: los entornos de CloudStudio que el usuario registra, y dónde se
 * crean las copias locales.
 *
 * Un **entorno es un servidor CloudStudio**: hoy los dos oficiales, mañana el on-premise
 * de un cliente. Vive en global y no en el proyecto porque un entorno sirve a muchos
 * proyectos; el proyecto solo guarda a cuál pertenece.
 *
 * TypeScript puro: ni disco ni red. El disco lo pone `agent/config/settingsEnDisco.ts`, igual
 * que `core/config.ts` deja el I/O a `agent/config/configEnDisco.ts` y `agent/config/authEnDisco.ts`.
 */
import { posix } from "node:path";
import { type Aviso, CLAVES_DENEGADAS } from "./config.js";

export interface Entorno {
  id: string;
  nombre: string;
  /** La URL del MCP. Es lo que define el entorno. */
  url: string;
  scopes?: readonly string[];
  /**
   * Qué proyectos de este entorno se ENSEÑAN en la barra, por id.
   *
   * Es una preferencia de presentación y por eso vive con el entorno y no con el proyecto:
   * un CloudStudio con doscientos proyectos no cabe en una barra lateral, y cuáles importan
   * lo sabe la persona, no el servidor. **Ausente no es «ninguno»: es «no lo he dicho»**, y
   * entonces manda la omisión (los primeros que devuelva el listado). Distinguirlo de una
   * lista VACÍA —«no quiero ver ninguno», que es una elección legítima— es justo por lo que
   * el campo es opcional en vez de arrancar en `[]`.
   */
  proyectos?: readonly string[];
}

/**
 * Las cuatro clases de destino en que se prueba una app XOne. No son cuatro herramientas
 * —`adb` sirve a la vez a los Android físicos y a los emuladores arrancados— sino las
 * cuatro cosas distintas que una persona quiere mirar o dejar de mirar.
 */
export const PLATAFORMAS_DE_DISPOSITIVO = ["android", "androidEmulador", "ios", "iosSimulador"] as const;

export type PlataformaDeDispositivo = (typeof PLATAFORMAS_DE_DISPOSITIVO)[number];

/**
 * Qué destinos se MIRAN al medir la máquina.
 *
 * Vive en global y no en el proyecto porque describe el equipo, no la app: el mismo Mac
 * mira los mismos simuladores para todos los proyectos que se abran en él.
 *
 * **Ausente no es «no»: es «no lo he dicho»**, y entonces se miran todos — la misma
 * distinción que `Entorno.proyectos`, y por la misma razón: apagar un destino es una
 * elección legítima que hay que poder distinguir de no haber elegido nunca. Por eso cada
 * campo es opcional en vez de arrancar en `true`.
 *
 * Y apagar no es cosmético: medir cuesta procesos en el equipo del usuario —`adb devices`
 * arranca el demonio de adb y se queda vivo, `xcrun` tarda segundos—, así que un destino
 * apagado no se consulta, y su herramienta se declara «desactivada» en vez de fingir que
 * no está.
 */
export type AjustesDeDispositivos = { [K in PlataformaDeDispositivo]?: boolean };

/** ¿Se mira este destino? Ausente = sí. */
export function seMira(ajustes: AjustesDeDispositivos | undefined, plataforma: PlataformaDeDispositivo): boolean {
  return ajustes?.[plataforma] !== false;
}

/**
 * Tope máximo del selector de concurrencia de tareas en Ajustes. La omisión (sin nada
 * guardado) es `CONCURRENCIA_POR_OMISION` de `core/tareas.ts` — 2 — y vive ahí y no aquí
 * porque ese fichero es el dueño de la planificación; este solo guarda la ELECCIÓN.
 */
export const TOPE_DE_CONCURRENCIA_DE_TAREAS = 8;

export interface Settings {
  entornos: Entorno[];
  /** La carpeta donde se bajan las copias locales. La disposición de DENTRO la fija
   *  `rutaDeWorkspace` y no es configurable. Ausente = `~/.xonecode/workspace`. */
  workspace?: string;
  /** Qué destinos se miran al medir la máquina. Ausente = todos. */
  dispositivos?: AjustesDeDispositivos;
  /**
   * El tope de concurrencia de la cola de tareas en background: cuántas corren a la vez EN
   * ESTA MÁQUINA. Vive aquí y no en el índice de tareas (`~/.xonecode/tareas/indice.json`)
   * por el mismo motivo que `dispositivos`: describe el EQUIPO, no una tarea concreta, y el
   * mismo Mac soporta la misma concurrencia para cualquier cola que corra en él.
   *
   * **Ausente no es «cero»: es «no lo he dicho»**, y entonces manda
   * `core/tareas.ts#CONCURRENCIA_POR_OMISION` (2) — la misma distinción que
   * `AjustesDeDispositivos` y que `Entorno.proyectos`. Cero SÍ se guarda: es una elección
   * legítima (pausar la cola) y no se puede confundir con «no lo he dicho».
   */
  concurrenciaDeTareas?: number;
}


/**
 * Misma disciplina que `config.json` (`CLAVES_DENEGADAS`, reexportada de `config.ts` como
 * fuente ÚNICA — dos listas de nombres de credencial ya divergieron una vez, medido: «key»,
 * el campo exacto de `auth.json`, faltaba aquí), más las formas en castellano que solo
 * hacían falta en este fichero. Comparación en minúsculas: quien escribe «apiKey» a mano
 * también escribe «apikey».
 */
const CAMPOS_DE_CREDENCIAL: readonly string[] = [
  ...CLAVES_DENEGADAS,
  "clave",
  "password",
  "contrasena",
].map((c) => c.toLowerCase());

function esCampoDeCredencial(campo: string): boolean {
  return CAMPOS_DE_CREDENCIAL.includes(campo.toLowerCase());
}

/**
 * Un aviso «grave» que nombra el CAMPO y nunca el valor: el mensaje acaba en logs y
 * capturas, y ahí es donde menos se quiere ver una clave.
 */
function avisoCredencial(campo: string, donde: string): Aviso {
  return {
    texto: `settings.json: el campo «${campo}»${donde} parece una clave de API y no se acepta; las claves van en ~/.xonecode/auth.json. Se descarta.`,
    severidad: "grave",
  };
}

/**
 * Un entorno con campos de credencial se sigue cargando si el resto es válido — el campo
 * sospechoso simplemente no se copia, como cualquier campo desconocido —, pero SIEMPRE
 * deja un aviso: la asimetría con «entorno mal formado, se descarta en silencio» es
 * deliberada, porque una credencial es el fallo que hay que ver y un `url` vacío no.
 */
function validarEntorno(candidato: unknown, avisos: Aviso[]): Entorno | undefined {
  if (typeof candidato !== "object" || candidato === null) return undefined;
  const e = candidato as Record<string, unknown>;
  const idParaElAviso = typeof e.id === "string" && e.id !== "" ? ` (entorno «${e.id}»)` : "";
  for (const campo of Object.keys(e)) {
    if (esCampoDeCredencial(campo)) avisos.push(avisoCredencial(campo, idParaElAviso));
  }
  if (typeof e.id !== "string" || e.id === "") return undefined;
  if (typeof e.nombre !== "string" || e.nombre === "") return undefined;
  if (typeof e.url !== "string" || e.url === "") return undefined;
  return {
    id: e.id,
    nombre: e.nombre,
    url: e.url,
    ...(Array.isArray(e.scopes) ? { scopes: e.scopes.filter((s) => typeof s === "string") } : {}),
    // Igual que `scopes`: si viene, se filtra a cadenas; si no, no se inventa una lista —
    // y ahí la diferencia importa, porque `[]` significa «ninguno» y ausente «no lo he
    // dicho».
    ...(Array.isArray(e.proyectos) ? { proyectos: e.proyectos.filter((p) => typeof p === "string") } : {}),
  };
}

/**
 * Un entorno mal formado se DESCARTA en silencio; una credencial deja un AVISO grave y
 * sigue. La asimetría es deliberada: un entorno roto es un dato de menos y el arranque
 * puede seguir sin decir nada, pero una credencial en el fichero equivocado es un fallo de
 * seguridad que tiene que verse — igual que hace `config.json` (`config.ts`, línea 112):
 * un aviso «grave» que descarta el campo, no una excepción que tumbe el arranque. Este
 * fichero antes lanzaba (`SettingsConCredencial`); se cambió a aviso porque `CLAUDE.md`
 * exige que un fallo de CloudStudio no pueda tumbar el arranque de la consola.
 */
export function validarSettings(bruto: unknown): { settings: Settings; avisos: Aviso[] } {
  const avisos: Aviso[] = [];

  if (typeof bruto !== "object" || bruto === null || Array.isArray(bruto)) {
    return { settings: { entornos: [] }, avisos };
  }
  const objeto = bruto as Record<string, unknown>;

  for (const campo of Object.keys(objeto)) {
    if (esCampoDeCredencial(campo)) avisos.push(avisoCredencial(campo, ""));
  }

  const lista = Array.isArray(objeto.entornos) ? objeto.entornos : [];
  const entornos: Entorno[] = [];
  for (const candidato of lista) {
    const entorno = validarEntorno(candidato, avisos);
    if (entorno !== undefined) entornos.push(entorno);
  }

  const workspace = typeof objeto.workspace === "string" ? objeto.workspace : undefined;
  const dispositivos = validarDispositivos(objeto.dispositivos);
  const concurrenciaDeTareas = validarConcurrenciaDeTareas(objeto.concurrenciaDeTareas);
  return {
    settings: {
      entornos,
      ...(workspace === undefined ? {} : { workspace }),
      ...(dispositivos === undefined ? {} : { dispositivos }),
      ...(concurrenciaDeTareas === undefined ? {} : { concurrenciaDeTareas }),
    },
    avisos,
  };
}


/**
 * Solo BOOLEANOS, y solo los cuatro nombres conocidos: lo que no lo sea se descarta sin
 * aviso, como cualquier campo desconocido. Un `"false"` de cadena NO se toma por falso —es
 * verdadero en JavaScript, y esa es la trampa que este repo ya pagó con el `soloLectura`
 * de un subagente y con el `compartido` de CloudStudio—; se descarta, y entonces manda la
 * omisión, que es mirar. Un objeto sin ningún campo válido se devuelve como ausente: `{}`
 * y «no lo he dicho» significan lo mismo aquí, mirar todo, y guardar un objeto vacío solo
 * ensuciaría el fichero.
 */
function validarDispositivos(candidato: unknown): AjustesDeDispositivos | undefined {
  if (typeof candidato !== "object" || candidato === null) return undefined;
  const c = candidato as Record<string, unknown>;
  const salida: AjustesDeDispositivos = {};
  for (const plataforma of PLATAFORMAS_DE_DISPOSITIVO) {
    if (typeof c[plataforma] === "boolean") salida[plataforma] = c[plataforma] as boolean;
  }
  return Object.keys(salida).length === 0 ? undefined : salida;
}

/**
 * Solo un entero entre 0 y `TOPE_DE_CONCURRENCIA_DE_TAREAS`. Cero SÍ vale —es cómo se
 * pausa la cola, una elección tan legítima como cualquier otra— así que lo que se descarta
 * no es «cero», es lo que no tiene forma de entero en rango: una cadena, un decimal, un
 * negativo o un número por encima del tope.
 */
function validarConcurrenciaDeTareas(candidato: unknown): number | undefined {
  if (typeof candidato !== "number" || !Number.isInteger(candidato)) return undefined;
  if (candidato < 0 || candidato > TOPE_DE_CONCURRENCIA_DE_TAREAS) return undefined;
  return candidato;
}

/**
 * Un segmento que no puede salirse de su carpeta ni inventar niveles.
 *
 * Exportada porque `web/servidor/sesiones.ts` necesita la misma guarda para el id de
 * sesión, que llega del cliente y no puede componer una ruta: una segunda copia habría
 * divergido de esta la primera vez que una se corrigiera y la otra no.
 */
export function segmentoSeguro(valor: string, que: string): string {
  if (valor === "" || valor === "." || valor === ".." || /[/\\]/.test(valor)) {
    throw new Error(`«${valor}» no vale como ${que}: no puede llevar separadores ni ser «..»`);
  }
  return valor;
}

/**
 * Dónde queda la copia local de un proyecto: `<workspace>/<entorno>/<proyecto>`.
 *
 * El WORKSPACE es configurable (`settings.workspace`); la disposición de dentro NO, porque
 * es lo que hace predecible encontrar una copia sin consultar un índice.
 *
 * **El literal `workspace` vivía aquí, en MEDIO** (`<base>/<entorno>/workspace/<proyecto>`),
 * y se ha mudado a la omisión de la base (`~/.xonecode/workspace`). Dos motivos medidos:
 * con la base en `~/.xonecode`, los ids de los entornos quedaban de HERMANOS de `agentes/`,
 * `skills/`, `tareas/` y `auth.json` —la casa del harness mezclada con el trabajo—; y quien
 * eligiera una carpeta suya se encontraba un nivel `workspace/` que no había pedido. Con el
 * literal en la base, lo que se configura ES el workspace.
 *
 * **El segmento del ENTORNO se queda, y no es decoración**: el mismo nombre de proyecto
 * existe a la vez en dos entornos, y sin ese nivel serían la misma carpeta (ver
 * `Wizard.tsx`, que ya explica por qué un on-premise necesita id propio).
 */
/**
 * ¿Esa raíz es una copia que creó xonecode, o una carpeta del usuario?
 *
 * De esto depende si el harness puede COMMITEAR solo al cerrar cada turno. En
 * `<workspace>/<entorno>/<proyecto>` la carpeta la creó él y es suya; en la que abrió
 * una persona —un proyecto offline, o `./bin/xonecode` dentro de su propio repo— un commit
 * por turno sería ensuciarle el historial cada vez que habla con el agente.
 *
 * Compara por SEGMENTOS y no por prefijo de texto: `/casa/.xonecodeX` empieza por
 * `/casa/.xonecode` y no tiene nada que ver. Y normaliza antes, porque una barra final o un
 * `..` por medio hacen que dos rutas equivalentes no se parezcan como cadenas. La base a
 * secas devuelve `false`: ahí no hay ningún proyecto, solo la carpeta que los contiene.
 */
export function dentroDelWorkspace(raiz: string, base: string): boolean {
  const normal = (r: string): string[] => posix.normalize(r).replace(/\/+$/, "").split("/");
  const dentro = normal(raiz);
  const fuera = normal(base);
  return dentro.length > fuera.length && fuera.every((seg, i) => dentro[i] === seg);
}

/**
 * Un `~/…` tecleado, resuelto contra la casa. Solo `~` y `~/…`: un `~otro` es la casa de
 * OTRA persona en la sintaxis del shell, y aquí no se resuelve — se deja tal cual y se
 * rechaza después por no ser absoluta.
 *
 * Es una comodidad de ENTRADA y nada más. **Lo que se enseña y lo que se guarda es la ruta
 * ENTERA**: se probó a mandarla abreviada por el cable, para que el caso normal no llevara
 * el nombre de la cuenta del sistema, y no se sostiene — la cabecera de esa misma consola ya
 * saluda por el nombre del usuario, así que el `~` no tapaba nada que no estuviera ya, y a
 * cambio dejaba en pantalla una ruta que no se puede comprobar de un vistazo, que es justo
 * para lo que ese campo existe. `casa` entra por parámetro: este módulo es puro.
 */
export function expandirConCasa(ruta: string, casa: string): string {
  const limpio = ruta.trim();
  if (limpio === "~") return casa;
  return limpio.startsWith("~/") ? posix.join(casa, limpio.slice(2)) : limpio;
}

/**
 * ¿Vale eso como workspace? Ausente = sí.
 *
 * Se comprueba sobre la ruta ya EXPANDIDA. Tres noes, y ninguno es de estilo: vacío no es
 * una elección, una ruta relativa dependería del directorio desde el que se arrancó la
 * consola —que no es el proyecto ni nada estable— y la raíz del disco convertiría cada id de
 * entorno en una carpeta de primer nivel del sistema.
 */
export function motivoDeWorkspaceInaceptable(ruta: string): string | undefined {
  const limpio = ruta.trim();
  if (limpio === "") return "escribe una carpeta: en blanco no es una elección";
  if (!posix.isAbsolute(limpio)) {
    return "tiene que ser una ruta absoluta, que empiece por «/» o por «~/»";
  }
  if (posix.normalize(limpio).replace(/\/+$/, "") === "") {
    return "la raíz del disco no: ahí cada entorno sería una carpeta de primer nivel del sistema";
  }
  return undefined;
}

export function rutaDeWorkspace(base: string, entorno: string, proyecto: string): string {
  return posix.join(base, segmentoSeguro(entorno, "id de entorno"), segmentoSeguro(proyecto, "nombre de proyecto"));
}
