/**
 * El ENTORNO con el que corre la shell de un subagente con ejecución.
 *
 * TypeScript puro: aquí se decide QUÉ variables ve esa shell, y quien la monta es
 * `agent/grafo/proyecto.ts`. Separado por lo de siempre —compuesto dentro del montaje, que
 * todos los tests doblan, la regla quedaría escrita y no probada—, y porque esto es una
 * decisión sobre secretos, que es justo lo que no puede depender de acordarse.
 *
 * **Lo que se quita, y por qué es obligatorio quitarlo.** `guardarCredencial` escribe la
 * clave de API TAMBIÉN en `process.env`, a propósito (`agent/config/authEnDisco.ts`). Un
 * `inheritEnv: true` a secas le pasaría esas claves a la shell del modelo, y entonces un
 * `printenv` —que es lo primero que hace cualquiera para orientarse— las deja en el
 * resultado de la tool, o sea en el contexto y en el `.jsonl` de la sesión. No es una fuga
 * hipotética: es la salida normal de un comando normal.
 *
 * Se quitan **por la tabla** (`VARIABLES_POR_PROVEEDOR`, el único sitio donde vive el nombre
 * de la variable de cada proveedor — hubo cuatro copias y ya habían divergido) más el
 * prefijo `XONECODE_CLAVE_`, que es el de los proveedores PERSONALIZADOS y por definición no
 * puede estar en ninguna tabla: el slug lo elige el usuario. Y no se quita todo lo que
 * empiece por `XONECODE_`, que se llevaría `XONECODE_TRACE_TOOLS` y `XONECODE_MODELO` sin
 * que sean secretos de nadie.
 *
 * **Límite declarado, y conviene no engañarse con él**: esto quita NUESTRAS credenciales,
 * las que xonecode puso ahí. El entorno de quien arranca el proceso puede traer un
 * `GITHUB_TOKEN` o un `AWS_SECRET_ACCESS_KEY` suyos, y eso no se filtra — ni se podría con
 * honestidad, porque «lo que parece una clave» es una heurística y una heurística que falla
 * en silencio es peor que una regla declarada. Quien concede ejecución concede leer el
 * entorno y el disco; lo que esto evita es que el harness REGALE lo que él mismo escribió.
 *
 * **Y los scripts de una skill se ponen en el PATH, que es lo que quita el problema en vez de
 * explicarlo.** Medido corriéndolo: el agente tenía DOS espacios de rutas —las virtuales de
 * `read_file` y las reales de sus comandos— y se pasó decenas de llamadas mezclándolos, leyendo
 * con `read_file` rutas absolutas que no existen para esa tool y no van a existir nunca. Con los
 * `scripts/` de cada skill montada en el PATH, un script se llama por su NOMBRE
 * (`xone-hotswap …`) y no hay ninguna ruta que acertar, ni que meter en el prompt, ni que viaje
 * en el evento. Un aparato nuevo mañana trae su skill con sus scripts y quedan disponibles solos.
 *
 * **Se AÑADEN al final, no al principio.** Prepender dejaría que una skill —que puede venir en
 * un `.zip` de cualquier sitio— sombreara un binario del sistema llamando a un script suyo `ls`
 * o `git`. Al final, lo que ya existe gana.
 *
 * **Y lo que se AÑADE además son rutas, una variable por cosa.** Una shell ve el disco de verdad,
 * no nuestras rutas virtuales: `/skills/xone-hotswap/` no existe para ella. Pero meter la
 * ruta absoluta en el prompt tendría dos precios —el comando que el modelo componga sería el
 * `detalle` del evento, y ahí no puede viajar una ruta de la máquina (`sinRutas`), y la
 * raíz no es UNA sino tres con la del proyecto ganando—. Con una variable por skill, el
 * prompt dice `$XONECODE_SKILL_XONE_HOTSWAP/scripts/android.mjs` y ni el contexto ni el
 * cable ven una ruta.
 */
import { VARIABLES_POR_PROVEEDOR } from "./modelos.js";

/** El prefijo de las claves de un proveedor personalizado (`core/modelos.ts#variableDeProveedor`). */
const PREFIJO_DE_CLAVE = "XONECODE_CLAVE_";

/**
 * La variable que nombra la carpeta donde dejar lo que se quiera enseñar a una persona.
 *
 * Sin ella, un script escribe en el `cwd` —la raíz del proyecto— que es justo lo que
 * `artefactoFueraDeSitio` prohíbe a las tools de fichero, y una shell no pasa por ahí.
 */
export const VARIABLE_DE_ARTEFACTOS = "XONECODE_ARTEFACTOS";

/**
 * Y la que nombra la carpeta donde dejar lo que **no** se le enseña a nadie: lo que un script
 * saca del contexto para no metérselo al agente en el hilo (`core/hotswap.ts`).
 *
 * Son dos variables y no una porque son dos preguntas: la de arriba dice «dónde dejo lo que
 * quiero que vea», ésta «dónde dejo lo que quiero poder releer». Con una sola, el script
 * escribía sus volcados donde se anuncian — medido: diez tarjetas en el hilo, seis de ellas
 * de ficheros que nadie volvió a abrir.
 */
export const VARIABLE_DE_HOTSWAP = "XONECODE_HOTSWAP";

/**
 * Cómo se llama la variable que lleva la ruta real de una skill.
 *
 * La MISMA derivación que `variableDeProveedor` para un personalizado (mayúsculas y los
 * guiones a guión bajo): dos formas de convertir un slug en variable son dos formas de
 * discrepar. El prefijo es otro a propósito — `XONECODE_SKILL_` frente a
 * `XONECODE_CLAVE_`—, así que una skill no puede fabricarse el nombre de una credencial.
 */
export function variableDeSkill(nombre: string): string {
  return `XONECODE_SKILL_${nombre.toUpperCase().replace(/-/g, "_")}`;
}

/**
 * Las dos rutas de Android que la shell necesita y no puede deducir.
 *
 * **Medido en la máquina de desarrollo**: `adb` está en el PATH (`/opt/homebrew/bin/adb`) y
 * `emulator` **no** —vive en `.../share/android-commandlinetools/emulator/`— con
 * `ANDROID_HOME` y `ANDROID_SDK_ROOT` vacías. O sea que el caso normal de un Mac con
 * Homebrew es justo el que deja al agente sin el binario que arranca un emulador.
 *
 * Quien sabe dónde está el SDK es `localizadorDeAndroid` (`agent/dispositivos/`), que ya
 * mira las dos variables de entorno y las raíces por omisión de cada plataforma. Pasarlo por
 * aquí es lo que evita que el script tenga que adivinarlo: **una segunda regla sobre dónde
 * vive el SDK es una segunda regla que puede divergir**, y ésta es la clase de cosa que falla
 * en silencio —el script no encuentra el binario, el modelo se apaña por su cuenta—.
 *
 * Va por VARIABLE y no por el prompt por lo mismo que las skills: el comando que el modelo
 * componga sale como `detalle` del evento, y ahí no puede viajar una ruta de la máquina
 * (`sinRutas`).
 */
export const VARIABLE_DE_EMULATOR = "XONECODE_EMULATOR";
export const VARIABLE_DE_ADB = "XONECODE_ADB";

/**
 * De un localizador de binarios del SDK a las variables que ve la shell.
 *
 * PURA y con el localizador por parámetro: así se prueba sin disco, y sobre todo así la
 * composición de producción no vive dentro de `entornoDeLaShellDelProyecto` —que toca
 * `process.env` y `existsSync`, y por tanto ningún test suyo podría ver si el localizador
 * llegó a estar cableado—. Es el patrón de fallo que este repo lleva contadas nueve veces.
 *
 * Lo que no se encuentra **no sale**, ni siquiera como cadena vacía: la misma regla que el
 * resto del módulo. Un `XONECODE_EMULATOR=""` no es «no consta», es una ruta rota que el
 * script tomaría por buena.
 */
export function variablesDeAndroid(
  enSdk: (nombre: string, subcarpeta: string) => string | undefined,
): Record<string, string> {
  const variables: Record<string, string> = {};
  const emulator = enSdk("emulator", "emulator");
  if (emulator !== undefined) variables[VARIABLE_DE_EMULATOR] = emulator;
  const adb = enSdk("adb", "platform-tools");
  if (adb !== undefined) variables[VARIABLE_DE_ADB] = adb;
  return variables;
}

/** Una skill montada: su nombre de catálogo y dónde está DE VERDAD en el disco. */
export interface SkillEnDisco {
  nombre: string;
  dir: string;
}

export function entornoDeShell(opciones: {
  entorno: Readonly<Record<string, string | undefined>>;
  skills?: readonly SkillEnDisco[];
  /** La carpeta de artefactos de la sesión, si la sesión tiene una. */
  artefactos?: string;
  /** Y su hermana, la de los volcados que no se anuncian. Misma condición: si la hay. */
  hotswap?: string;
  /**
   * Las carpetas de scripts que hay que poner al alcance, ya comprobadas por quien toca el
   * disco: esto es puro y no mira si existen. Una que no exista no rompe nada, pero ensucia
   * el PATH con una promesa vacía.
   */
  binarios?: readonly string[];
  /**
   * Las rutas de Android ya resueltas (`variablesDeAndroid`). Entran hechas y no como un
   * localizador para que esto siga sin tocar disco.
   */
  android?: Readonly<Record<string, string>>;
}): Record<string, string> {
  const credenciales = new Set<string>(Object.values(VARIABLES_POR_PROVEEDOR));
  const limpio: Record<string, string> = {};

  for (const [clave, valor] of Object.entries(opciones.entorno)) {
    // Una variable sin valor se DESCARTA en vez de pasarse como cadena vacía: un `PATH=""`
    // no es «no consta», es un PATH roto.
    if (valor === undefined) continue;
    if (credenciales.has(clave)) continue;
    if (clave.startsWith(PREFIJO_DE_CLAVE)) continue;
    limpio[clave] = valor;
  }

  for (const skill of opciones.skills ?? []) {
    limpio[variableDeSkill(skill.nombre)] = skill.dir;
  }
  const binarios = opciones.binarios ?? [];
  if (binarios.length > 0) {
    // Sin PATH heredado no se parte de vacío: `sh` se inventaría el suyo y perderíamos el del
    // proceso, que es donde están el `adb` y el `node` del usuario.
    const actual = limpio["PATH"];
    limpio["PATH"] = actual === undefined || actual === "" ? binarios.join(":") : [actual, ...binarios].join(":");
  }
  if (opciones.artefactos !== undefined) limpio[VARIABLE_DE_ARTEFACTOS] = opciones.artefactos;
  if (opciones.hotswap !== undefined) limpio[VARIABLE_DE_HOTSWAP] = opciones.hotswap;
  // Después de la copia del entorno heredado, así que lo que resuelve el localizador gana
  // sobre un valor que viniera de fuera: el localizador SÍ ha comprobado que el fichero está.
  Object.assign(limpio, opciones.android ?? {});

  return limpio;
}
