/**
 * Los settings GLOBALES: los entornos de CloudStudio que el usuario registra, y dónde se
 * crean las copias locales.
 *
 * Un **entorno es un servidor CloudStudio**: hoy los dos oficiales, mañana el on-premise
 * de un cliente. Vive en global y no en el proyecto porque un entorno sirve a muchos
 * proyectos; el proyecto solo guarda a cuál pertenece.
 *
 * TypeScript puro: ni disco ni red. El disco lo pone `agent/settingsEnDisco.ts`, igual
 * que `core/config.ts` deja el I/O a `agent/configEnDisco.ts` y `agent/authEnDisco.ts`.
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
 * Proyectos en los que el usuario ha decidido que las escrituras NO le pidan permiso.
 *
 * **Vive aquí y no en el `config.json` del proyecto, y eso es la mitad de la decisión.**
 * Este repo ya rechaza `proveedores` en el config de proyecto por un motivo que vale
 * exactamente igual aquí: «un `config.json` de proyecto es un fichero que puede venir de
 * fuera». Si la marca viajara con la carpeta, quien te pasa un zip decidiría si TÚ revisas
 * lo que el agente escribe dentro — y ponerle `modo: "offline"` al lado no arregla nada,
 * porque es el mismo fichero. En `settings.json` la decisión es del dueño de la máquina.
 *
 * La clave es la RUTA ABSOLUTA del proyecto. Es frágil a propósito: renombrar la carpeta
 * pierde el ajuste y las escrituras vuelven a pedir permiso. Falla CERRADO, que es la única
 * dirección en la que un ajuste así puede fallar.
 *
 * Solo `true` cuenta. Un `"true"` de cadena se descarta como cualquier otra cosa: es la
 * trampa que este repo ya pagó con el `soloLectura` de un subagente y con el `compartido`
 * de CloudStudio, y aquí concedería justo lo que hay que conceder a mano.
 */
export type AprobacionPorProyecto = Record<string, boolean>;

/**
 * Tope máximo del selector de concurrencia de tareas en Ajustes. La omisión (sin nada
 * guardado) es `CONCURRENCIA_POR_OMISION` de `core/tareas.ts` — 2 — y vive ahí y no aquí
 * porque ese fichero es el dueño de la planificación; este solo guarda la ELECCIÓN.
 */
export const TOPE_DE_CONCURRENCIA_DE_TAREAS = 8;

export interface Settings {
  entornos: Entorno[];
  /** La BASE del workspace. La disposición de dentro la fija `rutaDeWorkspace`. */
  workspace?: string;
  /** Qué destinos se miran al medir la máquina. Ausente = todos. */
  dispositivos?: AjustesDeDispositivos;
  /** En qué proyectos las escrituras se aplican sin preguntar. Ausente = en ninguno. */
  sinAprobacion?: AprobacionPorProyecto;
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
 * ¿Se aplican las escrituras de este proyecto SIN pedir aprobación?
 *
 * Las tres condiciones son AND, y ninguna es redundante:
 *
 * - **Lo ha dicho el dueño de la máquina**, para esta ruta, en `settings.json`.
 * - **El proyecto es OFFLINE de verdad**, y eso NO se le pregunta al `modo` del
 *   `config.json`: se mira si hay un bloque `cloudstudio`. Un proyecto conectado escribe en
 *   una copia que después sube a CloudStudio, o sea al trabajo de otras personas, y ahí la
 *   aprobación no es una preferencia. Mirar el `modo` sería creerle a un campo que puede
 *   venir en la misma carpeta que la marca.
 * - **Hay alguien delante.** Auto-aprobar significa «el humano que está aquí ha decidido no
 *   pulsar», no «no hace falta humano». Sin interactivo —`xonecode run` en CI, una tubería—
 *   se sigue sin aplicar nada, que es lo que esos caminos hacen hoy: cambiar eso volcaría
 *   el significado de un código de salida del contrato por un ajuste que nadie escribió
 *   pensando en CI.
 */
export function seAplicaSinAprobacion(opciones: {
  raiz: string;
  sinAprobacion: AprobacionPorProyecto | undefined;
  /** El bloque `cloudstudio` del `config.json` del proyecto, si lo hay. */
  cloudstudio: unknown;
  interactivo: boolean;
}): boolean {
  if (opciones.sinAprobacion?.[opciones.raiz] !== true) return false;
  if (opciones.cloudstudio !== undefined) return false;
  return opciones.interactivo;
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
  const sinAprobacion = validarSinAprobacion(objeto.sinAprobacion);
  const concurrenciaDeTareas = validarConcurrenciaDeTareas(objeto.concurrenciaDeTareas);
  return {
    settings: {
      entornos,
      ...(workspace === undefined ? {} : { workspace }),
      ...(dispositivos === undefined ? {} : { dispositivos }),
      ...(sinAprobacion === undefined ? {} : { sinAprobacion }),
      ...(concurrenciaDeTareas === undefined ? {} : { concurrenciaDeTareas }),
    },
    avisos,
  };
}

/**
 * Solo rutas absolutas con valor booleano `true`, y nada más.
 *
 * Un `false` no se guarda: significa lo mismo que no estar —pedir aprobación— y dejarlo
 * escrito solo daría dos formas de decir que no. Un `"true"` de CADENA se descarta, por lo
 * de siempre. Y una clave que no sea una ruta absoluta tampoco entra: la comparación de
 * `seAplicaSinAprobacion` es exacta contra la raíz, así que una relativa no casaría nunca y
 * quedaría en el fichero pareciendo que hace algo.
 */
function validarSinAprobacion(candidato: unknown): AprobacionPorProyecto | undefined {
  if (typeof candidato !== "object" || candidato === null || Array.isArray(candidato)) return undefined;
  const salida: AprobacionPorProyecto = {};
  for (const [ruta, valor] of Object.entries(candidato as Record<string, unknown>)) {
    if (valor === true && (ruta.startsWith("/") || /^[A-Za-z]:[\\/]/.test(ruta))) salida[ruta] = true;
  }
  return Object.keys(salida).length === 0 ? undefined : salida;
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
 * Dónde queda la copia local de un proyecto.
 *
 * La BASE es configurable (`settings.workspace`); la disposición de dentro NO, porque es
 * lo que hace predecible encontrar una copia sin consultar un índice.
 */
/**
 * ¿Esa raíz es una copia que creó xonecode, o una carpeta del usuario?
 *
 * De esto depende si el harness puede COMMITEAR solo al cerrar cada turno. En
 * `<base>/<entorno>/workspace/<proyecto>` la carpeta la creó él y es suya; en la que abrió
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

export function rutaDeWorkspace(base: string, entorno: string, proyecto: string): string {
  return posix.join(
    base,
    segmentoSeguro(entorno, "id de entorno"),
    "workspace",
    segmentoSeguro(proyecto, "nombre de proyecto")
  );
}
