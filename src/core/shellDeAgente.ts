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
import { win32 } from "node:path";
import { VARIABLE_DE_DISPOSITIVO, type DispositivoDeLaSesion } from "./dispositivoDeSesion.js";
import { VARIABLES_SECRETAS_BYXONE } from "./byxone.js";
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
  /** El FICHERO con el dispositivo de la sesión (`core/dispositivoDeSesion.ts`). Misma
   *  condición: solo con sesión. Se da la ruta aunque el fichero no exista todavía. */
  dispositivo?: string;
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
  /**
   * El sistema: en Windows el PATH se llama `Path` y se separa con `;` (con `:` partiría `C:\…`). Por omisión, el de este
   * proceso; por parámetro para probarlo sin estar en Windows.
   */
  plataforma?: string;
}): Record<string, string> {
  // Y la credencial de byXOne (`core/byxone.ts`): no es de un proveedor de modelos, pero es igual de secreta.
  const credenciales = new Set<string>([...Object.values(VARIABLES_POR_PROVEEDOR), ...VARIABLES_SECRETAS_BYXONE]);
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
    //
    // **En Windows la variable es `Path` y el separador `;`.** Medido en la máquina Windows de un usuario: se buscaba
    // `PATH`, no estaba, y se creaba OTRA solo con los scripts y unida con `:` — el hijo de Claude Code contestaba
    // «node: command not found» y el device-controller llamaba a `adb.exe` por su ruta entera. Se busca sin mayúsculas
    // y se escribe en la MISMA clave, para que no queden dos.
    const windows = (opciones.plataforma ?? process.platform) === "win32";
    const separador = windows ? ";" : ":";
    const clave = Object.keys(limpio).find((k) => k.toUpperCase() === "PATH") ?? (windows ? "Path" : "PATH");
    const actual = limpio[clave];
    limpio[clave] = actual === undefined || actual === "" ? binarios.join(separador) : [actual, ...binarios].join(separador);
  }
  if (opciones.artefactos !== undefined) limpio[VARIABLE_DE_ARTEFACTOS] = opciones.artefactos;
  if (opciones.hotswap !== undefined) limpio[VARIABLE_DE_HOTSWAP] = opciones.hotswap;
  if (opciones.dispositivo !== undefined) limpio[VARIABLE_DE_DISPOSITIVO] = opciones.dispositivo;
  // Después de la copia del entorno heredado, así que lo que resuelve el localizador gana
  // sobre un valor que viniera de fuera: el localizador SÍ ha comprobado que el fichero está.
  Object.assign(limpio, opciones.android ?? {});

  return limpio;
}

/**
 * Por qué un comando de quien ejecuta NO se lanza, o `undefined` si se lanza: una búsqueda que recorre el DISCO ENTERO.
 *
 * Medido en calc14: el conductor buscaba un script que el plan nombraba y no existe (`xone-validate`) y lanzó
 * `find / -name "xone-validate*"`, que tardó más de cuatro minutos con el turno parado; luego otro `find /` para la carpeta
 * del plan, que es virtual y no está en el disco con ese nombre. Nada de lo que busca vive fuera del proyecto, de sus
 * variables o de su PATH, y recorrer la máquina del usuario es además mirar donde no le toca. Se reconoce `find`, `grep -r`
 * y `ls -R` / `du` cuando su punto de partida es la raíz, la casa o una carpeta del sistema; lo relativo (`find .`) y lo de
 * sus variables (`$XONECODE_…`) pasan. Es una lista de lo que se ha visto, no un filtro de shell: un límite declarado.
 */
export function motivoDeComandoRechazado(comando: string): string | undefined {
  const raices = String.raw`(?:\/|~|\$HOME|\$\{HOME\}|\/Users|\/private|\/System|\/Library|\/Applications|\/Volumes|\/opt|\/usr|\/var|\/tmp)(?:\/)?`;
  const fin = String.raw`(?=\s|$|;|\||&|\))`;
  const inicio = String.raw`(?:^|[;&|(]\s*|&&\s*|\s)`;
  const porElDisco = [
    new RegExp(String.raw`${inicio}find\s+(?:-[HLP]\s+)*["']?${raices}["']?${fin}`),
    new RegExp(String.raw`${inicio}(?:grep|rg)\s+(?:-\S+\s+)*(?:-[a-zA-Z]*[rR][a-zA-Z]*\s+)(?:-\S+\s+|"[^"]*"\s+|'[^']*'\s+|\S+\s+)*["']?${raices}["']?${fin}`),
    new RegExp(String.raw`${inicio}(?:ls\s+-[a-zA-Z]*R[a-zA-Z]*|du)\s+(?:-\S+\s+)*["']?${raices}["']?${fin}`),
  ];
  const tools =
    "Para buscar un fichero por NOMBRE usa la tool `glob` (`pattern: \"**/*.xne\"`, y `path` para acotar), para buscar TEXTO en " +
    "ficheros la tool `grep`, y para listar una carpeta la tool `ls`: ven el proyecto, `/skills/`, `/planes/`, `/artefactos/` y " +
    "`/hotswap/` por su ruta virtual y no salen de ahí.";
  if (porElDisco.some((p) => p.test(comando))) {
    return (
      "No se lanza: recorre el disco entero de la máquina (se vio tardar más de 4 minutos con el turno parado), y nada de lo que " +
      `buscas vive ahí. ${tools} Tus scripts están en el PATH (\`xone-*\`, se llaman por su nombre; \`--help\` dice cómo); la ` +
      "documentación de tus skills, en `$XONECODE_SKILL_<NOMBRE>`. Si algo que te nombran no aparece ahí, NO existe: dilo."
    );
  }
  // Buscar FICHEROS desde la shell, aunque sea en una carpeta: lo mismo que las tools de fichero, sin su confinamiento. Un
  // `grep` que filtra la salida de otro comando (`xone-log-android --app | grep CALC`) no busca ficheros y pasa.
  const buscaFicheros = [
    new RegExp(String.raw`${inicio}find\s`),
    new RegExp(String.raw`${inicio}(?:grep|rg)\s+(?:-\S+\s+)*-[a-zA-Z]*[rR][a-zA-Z]*\s`),
    new RegExp(String.raw`${inicio}ls\s+(?:-\S+\s+)*-[a-zA-Z]*R[a-zA-Z]*(?:\s|$)`),
  ];
  if (buscaFicheros.some((p) => p.test(comando))) {
    return `No se lanza: para buscar ficheros no uses la shell. ${tools} Si lo que buscas es un script de tus skills, está en el PATH.`;
  }
  // El túnel de hotswap es del APARATO (su puerto está en Ajustes → Dispositivos) y lo ponen los
  // scripts. Medido: un `adb forward` al mismo puerto local le QUITA el túnel al aparato de otra
  // sesión sin dar error. `--list` solo mira, y pasa. `reverse` tampoco se rechaza: no toca puertos LOCALES del
  // Mac (abre uno en el aparato) y tiene usos legítimos.
  const adb = String.raw`(?:adb|"?\$\{?XONECODE_ADB\}?"?)`;
  const tunelAMano = new RegExp(String.raw`${inicio}${adb}\s+(?:-[de]\s+|-\S+\s+\S+\s+)*forward\s+(?!--list${fin})`);
  /**
   * La captura a mano (`adb exec-out screencap -p > x.png`). El prompt del conductor ya lo prohibía y, medido en la
   * calculadora de MyAllXOne, la compuso a mano en las cuatro capturas: sin el script no se guarda el árbol de controles
   * del mismo instante, y el crítico no puede MEDIR nada (qué está tapado, qué fila, qué ancho). Se rechaza `screencap`
   * por `adb`, sea `exec-out` o `shell`.
   */
  const capturaAMano = new RegExp(String.raw`${inicio}${adb}\s+(?:-[de]\s+|-\S+\s+\S+\s+)*(?:exec-out|shell)\s+(?:\S+\s+)*?screencap\b`);
  if (capturaAMano.test(comando)) {
    return (
      "No se lanza: captura con `xone-captura-android --nombre <nombre>.png` (o `xone-hotswap shot`), no con `adb … screencap`. " +
      "El script la deja en `/artefactos/` y guarda a la vez el árbol de controles de ESE instante, que es lo que deja al " +
      "crítico visual medir qué está tapado, en qué fila va cada control y cuánto mide. Para comparar dos capturas usa " +
      "`diferencia_de_capturas`, no `md5` ni scripts de imagen."
    );
  }
  /**
   * Una ruta VIRTUAL en la shell. Las tools de fichero ven `/hotswap/x` o `/EntryPoint.xne`; la shell ve el disco de verdad,
   * donde esas rutas no existen. Medido en Maset: cinco comandos así en un turno (`grep … /hotswap/…json 2>/dev/null`,
   * `base64 /EntryPoint.xne`), que salían VACÍOS sin error y el conductor sacaba conclusiones de la nada.
   */
  const MONTAJES = "hotswap|artefactos|adjuntos|planes|skills|diseno|large_tool_results|conversation_history";
  const rutaVirtual = new RegExp(String.raw`(?:^|[\s"'=(:])\/(?:${MONTAJES})\/|(?:^|[\s"'=(:])\/[\w.-]+\.(?:xne|xml|js|css|ini)(?=[\s"')]|$)`);
  if (rutaVirtual.test(comando)) {
    return (
      "No se lanza: en la shell las rutas son las del DISCO, y esa es una ruta virtual de las tools de fichero (allí no existe; " +
      `el comando saldría vacío sin error). \`/hotswap/x\` es \`"$${VARIABLE_DE_HOTSWAP}/x"\`, \`/artefactos/x\` es ` +
      `\`"$${VARIABLE_DE_ARTEFACTOS}/x"\`, y un fichero del proyecto va SIN la barra (\`EntryPoint.xne\`): la shell arranca en ` +
      "la raíz del proyecto. Para leer o buscar en ficheros, mejor las tools `read_file`, `grep` y `glob`."
    );
  }
  /**
   * SQL que ESCRIBE en la base de la app del aparato. Medido en Maset: el conductor hizo un `UPDATE … SET ACTIVO=0` para
   * que un contador saliera distinto. Son los datos de la app —y con la replicación activa, los del servidor—, y cambiarlos
   * no es probar: es decidir por alguien. Consultar (`SELECT`) sí se puede.
   */
  const sqlQueEscribe = /\bxone-hotswap\b[^|;&]*\b(?:sql|runSql)\b[^|;&]*\b(?:insert|update|delete|replace|drop|alter|create|truncate)\b/i;
  if (sqlQueEscribe.test(comando)) {
    return (
      "No se lanza: ese SQL CAMBIA los datos de la app en el aparato (y, si la app replica, los del servidor). Probar es mirar: " +
      "consulta con `SELECT`. Si para probar algo hace falta otro dato, dilo en tu informe y que lo decida quien te lo encargó."
    );
  }
  if (tunelAMano.test(comando)) {
    return (
      "No se lanza: el túnel al aparato lo ponen `xone-desplegar-android` y `xone-reiniciar-android`, con el puerto que " +
      "tiene ESTE aparato; un `adb forward` a mano puede quitarle el túnel al aparato de otra sesión sin avisar. Para " +
      "hablar con la app usa `xone-hotswap`, que ya sabe a qué puerto ir. Mirar los túneles (`adb forward --list`) sí se puede."
    );
  }
  return undefined;
}

/** Lo que `adb` hace sin tocar ningún aparato: listar, versión, el servidor, emparejar. */
const ADB_SIN_APARATO = new Set(["devices", "version", "help", "start-server", "kill-server", "reconnect", "mdns", "pair", "connect", "disconnect", "keygen"]);
/** Opciones globales de `adb` que llevan VALOR detrás. */
const ADB_CON_VALOR = new Set(["-s", "-t", "-H", "-P", "-L"]);

const esAdb = (palabra: string): boolean => /^(?:"?\$\{?XONECODE_ADB\}?"?|(?:\S*\/)?adb(?:\.exe)?)$/.test(palabra);
const esEmulator = (palabra: string): boolean => /^(?:"?\$\{?XONECODE_EMULATOR\}?"?|(?:\S*\/)?emulator(?:\.exe)?)$/.test(palabra);

/**
 * Un comando que iría a OTRO aparato que el de la sesión (IXCODE-32), o `undefined` si no.
 *
 * El síntoma, de un usuario: con un móvil físico elegido, a mitad de sesión el trabajo pasó al
 * emulador. Los scripts de `xone-hotswap` ya se niegan (`lib/dispositivo.mjs`); esto cierra la otra
 * puerta, que es `adb` a mano en la shell. La regla es la que se pidió: **el aparato elegido se pasa
 * SIEMPRE** —todo `adb` que actúe sobre un aparato lleva el `-s` de la sesión—, y con un físico o un
 * iPhone elegido no se lanza un emulador. Lo que no toca un aparato (`adb devices`, `version`…) pasa.
 *
 * Como `motivoDeComandoRechazado`, mira palabras y no es un intérprete de shell: un `adb` dentro de
 * un script propio, o un `ANDROID_SERIAL=` puesto a mano, no se ven. Límite declarado; tampoco mira
 * el `--udid` de un `xcrun simctl` (los scripts de iOS sí).
 */
export function motivoDeOtroAparato(comando: string, d: DispositivoDeLaSesion | undefined): string | undefined {
  if (d === undefined) return undefined;
  const nombre = `«${d.nombre}» (${d.id})`;
  const otro =
    "Si hace falta otro aparato, que la persona lo cambie en la pastilla del chat; los scripts `xone-*` ya van al de la sesión.";
  for (const tramo of comando.split(/;|&&|\|\||\||\n|\$\(|`|&/)) {
    const palabras = tramo.trim().split(/\s+/).filter((p) => p !== "");
    // Las asignaciones de variables delante del comando (`X=1 adb …`) no son el comando.
    while (palabras.length > 0 && /^[A-Za-z_][A-Za-z0-9_]*=/.test(palabras[0]!)) palabras.shift();
    const primera = palabras[0];
    if (primera === undefined) continue;
    if (esEmulator(primera) && palabras.includes("-avd") && !(d.plataforma === "android" && d.clase === "emulador")) {
      return `No se lanza: la sesión usa ${nombre} y no se levanta un emulador por su cuenta. ${otro}`;
    }
    if (!esAdb(primera)) continue;
    let serie: string | undefined;
    let i = 1;
    while (i < palabras.length && palabras[i]!.startsWith("-")) {
      const opcion = palabras[i]!;
      if (opcion === "-s") serie = palabras[i + 1];
      i += ADB_CON_VALOR.has(opcion) ? 2 : 1;
    }
    const sub = palabras[i];
    if (sub === undefined || ADB_SIN_APARATO.has(sub)) continue;
    if (d.plataforma === "ios") return `No se lanza: la sesión usa ${nombre}, un aparato de iOS, y \`adb\` es de Android. ${otro}`;
    if (serie !== d.id) {
      return (
        `No se lanza: la sesión usa ${nombre}${serie === undefined ? "" : ` y esto iba a ${serie}`}. Con \`adb\` el aparato ` +
        `se pasa SIEMPRE: \`adb -s ${d.id} ${sub} …\`. ${otro}`
      );
    }
  }
  return undefined;
}

/**
 * Lo que la traza dice del entorno de la shell de un agente (`DiagnosticoDeTools.entorno`), sin copiar el entorno: la
 * clave del PATH (en Windows es `Path`), cuántas carpetas, si alguna tiene `node`/`adb` y cuántas son de scripts. `existe`
 * mira el disco: entra por parámetro para que esto siga siendo puro.
 */
export function resumenDelEntorno(
  entorno: Readonly<Record<string, string>>,
  opciones: { plataforma: string; existe: (ruta: string) => boolean; scripts?: number; nodeDelServidor?: string }
): Record<string, string | number | boolean> {
  const windows = opciones.plataforma === "win32";
  const clave = Object.keys(entorno).find((k) => k.toUpperCase() === "PATH");
  const claves = Object.keys(entorno).filter((k) => k.toUpperCase() === "PATH");
  const carpetas = clave === undefined ? [] : (entorno[clave] ?? "").split(windows ? ";" : ":").filter((c) => c !== "");
  const sep = windows ? "\\" : "/";
  const tiene = (binario: string): boolean =>
    carpetas.some((c) => (windows ? [`${binario}.exe`, `${binario}.cmd`, binario] : [binario]).some((n) => opciones.existe(`${c.replace(/[\\/]$/, "")}${sep}${n}`)));
  return {
    plataforma: opciones.plataforma,
    clavePath: clave ?? "(ninguna)",
    // Dos claves (`Path` y `PATH`) en Windows es justo el fallo medido: el hijo hereda una de las dos sin saber cuál.
    clavesPath: claves.length,
    carpetas: carpetas.length,
    node: tiene("node"),
    adb: tiene("adb"),
    // Qué shell corre las órdenes (IXCODE-72): en Windows, el Git Bash si está; si no, `cmd.exe`.
    shell: lanzamientoDeShell("", { plataforma: opciones.plataforma, ...bashSiWindows(entorno, opciones) }).nombre,
    ...(opciones.scripts === undefined ? {} : { scripts: opciones.scripts }),
    ...(opciones.nodeDelServidor === undefined ? {} : { nodeDelServidor: opciones.existe(opciones.nodeDelServidor) }),
  };
}

/**
 * La orden del agente, ¿con qué shell? (IXCODE-72). Fuera de Windows, la de siempre: `spawn(orden, { shell: true })`, que es
 * `/bin/sh`. **En Windows `shell: true` es `cmd.exe`, y el modelo escribe bash**: medido en la máquina de un usuario, la raíz
 * del proyecto se llenaba de ficheros sin extensión (`6612`, `@getsdsd`), `.txt` y `.json`, porque `cmd` no entiende las
 * comillas simples y toma cada `>` de un `x => x > 6612` por una redirección a fichero. Tampoco corre los scripts `xone-*`,
 * que no tienen extensión. Con el bash de Git para Windows —git es obligatorio, así que está— la orden es bash de verdad.
 *
 * `MSYS_NO_PATHCONV` y `MSYS2_ARG_CONV_EXCL`: sin ellos MSYS «traduce» lo que parece una ruta POSIX al pasarlo a un programa
 * nativo, y un `adb push x /sdcard/…` acabaría en `C:/Program Files/Git/sdcard/…`. `-c` y no `-lc`: un login rehace el PATH.
 */
export function lanzamientoDeShell(
  orden: string,
  opciones: { plataforma: string; bash?: string }
): { programa: string; argumentos: string[]; shell: boolean; entorno: Record<string, string>; nombre: "sh" | "cmd.exe" | "git-bash" } {
  if (opciones.plataforma !== "win32") return { programa: orden, argumentos: [], shell: true, entorno: {}, nombre: "sh" };
  if (opciones.bash === undefined) return { programa: orden, argumentos: [], shell: true, entorno: {}, nombre: "cmd.exe" };
  return {
    programa: opciones.bash,
    argumentos: ["-c", orden],
    shell: false,
    entorno: { MSYS_NO_PATHCONV: "1", MSYS2_ARG_CONV_EXCL: "*" },
    nombre: "git-bash",
  };
}

/**
 * El `bash.exe` de Git para Windows, buscado desde el `git.exe` del PATH (`…\Git\cmd`, `…\Git\bin` o
 * `…\Git\mingw64\bin`) y, si no, en la carpeta de siempre. **Nunca el de WSL** (`C:\Windows\System32\bash.exe` y
 * parecidos): corre en OTRA máquina, con otro disco, y el proyecto no estaría donde la orden lo busca. Puro: `existe` mira
 * el disco.
 */
export function bashDeGit(opciones: { entorno: Readonly<Record<string, string | undefined>>; existe: (ruta: string) => boolean }): string | undefined {
  const clave = Object.keys(opciones.entorno).find((k) => k.toUpperCase() === "PATH");
  const carpetas = (clave === undefined ? "" : (opciones.entorno[clave] ?? "")).split(";").filter((c) => c !== "");
  const deWindows = (ruta: string): boolean => /\\windows\\|\\windowsapps\\/i.test(ruta);
  const candidatas: string[] = [];
  for (const carpeta of carpetas) {
    const c = carpeta.replace(/[\\/]+$/, "");
    if (!opciones.existe(win32.join(c, "git.exe"))) continue;
    candidatas.push(win32.join(c, "..", "bin", "bash.exe"), win32.join(c, "bash.exe"), win32.join(c, "..", "..", "bin", "bash.exe"));
  }
  const programas = opciones.entorno["ProgramFiles"] ?? opciones.entorno["PROGRAMFILES"] ?? "C:\\Program Files";
  candidatas.push(win32.join(programas, "Git", "bin", "bash.exe"));
  return candidatas.find((r) => !deWindows(r) && opciones.existe(r));
}

/** El `bash` para `lanzamientoDeShell`, buscado solo en Windows. */
function bashSiWindows(
  entorno: Readonly<Record<string, string>>,
  opciones: { plataforma: string; existe: (ruta: string) => boolean }
): { bash?: string } {
  if (opciones.plataforma !== "win32") return {};
  const bash = bashDeGit({ entorno, existe: opciones.existe });
  return bash === undefined ? {} : { bash };
}

/**
 * ¿La salida dice que el script NO ARRANCÓ (no se encontró él o su intérprete)? Devuelve la causa en pocas palabras, sin
 * ninguna ruta, o `undefined`. Es un fallo de la MÁQUINA, no del trabajo: medido en el soporte de una tarea en Windows, los
 * siete `xone-*` fallaron así y la persona no se enteró, porque solo lo decía de pasada el cierre del agente.
 */
export function scriptQueNoArranca(salida: string): string | undefined {
  if (/Cannot find module/.test(salida)) return "Cannot find module";
  if (/command not found/.test(salida)) return "command not found";
  if (/['"]?node['"]?: No such file or directory/.test(salida)) return "node no encontrado";
  if (/is not recognized as an internal or external command|no se reconoce como un comando interno o externo/.test(salida)) return "orden no reconocida";
  return undefined;
}

/** El aviso a la PERSONA, una vez por turno: sin rutas (viaja al chat). */
export function textoDeScriptsQueNoArrancan(causa: string): string {
  return (
    `⚠ los scripts del aparato NO arrancan en esta máquina («${causa}»): lo que se haga en este turno no se ha podido probar ` +
    "en el aparato. Es un fallo del entorno (Node, la shell o la instalación de xonecode), no del proyecto: con «Depurar» " +
    "encendido la traza guarda cada orden; mándala a soporte."
  );
}
