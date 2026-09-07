/**
 * Qué hay en la máquina para probar una app XOne: el sistema operativo, las herramientas
 * de Android e iOS, y los dispositivos y simuladores a los que se llega.
 *
 * Aquí viven los TIPOS y los parsers PUROS —texto de una herramienta → datos—; quien lanza
 * las herramientas es `agent/dispositivosEnMaquina.ts`. Separarlo así es lo que permite
 * probar cada formato contra una salida real sin que `npm test` necesite ni adb ni Xcode.
 *
 * Tres estados por herramienta y no un booleano: «no encontrada», «falló» (con el motivo) y
 * «bien». Un cuarto, «no aplica», para lo que no se puede detectar en este sistema —Xcode
 * en Windows— y que no es lo mismo que «no hay»: el escritorio los pinta distintos, porque
 * decir «sin iOS» en un Linux sería afirmar algo que la máquina no puede saber. Y un
 * quinto, «desactivada», para el destino que la persona apagó en Ajustes
 * (`core/settings.ts#AjustesDeDispositivos`) — ese no se consulta, y decir que su
 * herramienta no está sería mentir sobre la máquina.
 */

export type SistemaOperativo = "mac" | "windows" | "linux" | "otro";

export type NombreDeHerramienta = "adb" | "emulator" | "xcrun" | "devicectl";

export interface Herramienta {
  nombre: NombreDeHerramienta;
  /**
   * Cinco estados, y los cinco dicen algo distinto: «ok», «no-encontrada», «fallo» (con el
   * motivo), «no-aplica» —lo que este sistema no puede saber, iOS en Windows— y
   * **«desactivada»**, que es el destino que la persona ha apagado en Ajustes.
   *
   * «desactivada» no se pliega en «no-aplica» ni en «no-encontrada»: una dice que la
   * máquina no puede, la otra que falta el binario, y esta que no se ha mirado a propósito
   * — y es la única de las tres que se arregla con un clic.
   */
  estado: "ok" | "no-encontrada" | "fallo" | "no-aplica" | "desactivada";
  /** Dónde se encontró, cuando se encontró. */
  ruta?: string;
  /**
   * Cómo se instala, cuando falta y se sabe cómo. **El comando no puede llevar ninguna ruta
   * de la máquina**: se pinta en la ventana y viaja por el cable, que puede ir por un túnel
   * (`--anfitrion`) — es la misma regla por la que `ruta` se queda en el host (`sinRutas`).
   * Por eso solo se propone lo que se resuelve por el PATH.
   *
   * `automatico` es si xonecode puede lanzarlo ÉL. Hoy solo `xcode-select --install`, que
   * devuelve en el acto y abre el diálogo de Apple. Lo demás se ofrece para copiar y
   * pegarlo en un terminal: `brew install --cask` puede tardar minutos y pedir la
   * contraseña de administrador, y un proceso sin terminal detrás se quedaría esperando esa
   * contraseña para siempre — un botón que se cuelga es peor que no tener botón.
   */
  instalar?: { comando: string; automatico: boolean };
  /** El motivo del fallo, o por qué no aplica. Nunca la salida cruda entera. */
  detalle?: string;
}

export interface Dispositivo {
  /** El serial de adb, el UDID del simulador o el identificador de devicectl. */
  id: string;
  nombre: string;
  plataforma: "android" | "ios";
  clase: "emulador" | "simulador" | "fisico";
  /**
   * `conectado` y `arrancado` son los dos estados en que SE LLEGA al dispositivo; el resto
   * son situaciones propias y se enseñan como tales, no se pliegan en «no».
   */
  estado: "conectado" | "arrancado" | "apagado" | "sin-autorizar" | "offline" | "no-disponible";
  detalle?: string;
}

/**
 * Un paso de una RECETA: lo que hay que hacer una vez para que una capacidad exista.
 *
 * Los comandos se pintan para COPIAR, no se ejecutan: `brew` puede pedir la contraseña de
 * administrador y un hijo sin terminal detrás se quedaría esperándola para siempre. La
 * regla de esta casa era «se ofrece ejecutar lo que se puede cumplir», aplicada por
 * herramienta; aquí se aplica más fina, por COMANDO — y los dos de `brew` caen del lado
 * que se copia. (Lo que sí se puede ejecutar sin pedir entrada, `sdkmanager` y
 * `avdmanager`, es la fase siguiente: necesita un canal de progreso, porque son 2-3 GB.)
 *
 * **Ningún comando puede llevar una ruta de la máquina.** Se pinta en la ventana y viaja por
 * el cable, que puede ir por un túnel: es la misma regla por la que `Herramienta.ruta` se
 * queda en el host. Por eso el prefijo de Homebrew se deriva con `$(brew --prefix)` en vez
 * de escribirse — y de paso vale igual en Intel que en Apple Silicon, que lo tienen distinto.
 */
export interface PasoDeReceta {
  /** Qué consigue este paso, en una frase. */
  titulo: string;
  /** Las líneas a pegar en un terminal, en orden. */
  comandos: string[];
  /** Lo que hay que saber ANTES de pegarlo: que pregunta algo, que pesa, qué se acepta. */
  nota?: string;
  /**
   * ¿Ya está hecho? Sale de la MEDIDA, nunca de recordar que alguien pulsó: una marca
   * guardada seguiría diciendo «hecho» después de que el usuario desinstalara el SDK, que
   * es exactamente cuando hay que decirle que falta.
   */
  hecho: boolean;
}

/** Cómo conseguir una capacidad que esta máquina no tiene. Hoy hay una. */
export interface Receta {
  id: "android-emulador";
  titulo: string;
  descripcion: string;
  pasos: PasoDeReceta[];
  /** Todo hecho: la receta se pliega y se dice que ya está. */
  completa: boolean;
  /** Lo que viene DESPUÉS de instalar y que esta consola no hace por ti. */
  despues: string;
}

/** Lo medido que decide qué pasos están hechos. Entra ya resuelto: esto es `core/`. */
export interface EstadoDeAndroid {
  /** ¿Hay `brew`? Sin él la receta se puede leer igual, pero el primer paso no valdrá. */
  brew: boolean;
  sdkmanager: boolean;
  emulator: boolean;
  /** `ANDROID_HOME` puesta en el entorno del proceso, que es lo único que se puede saber
   *  de la shell del usuario: la que lanzó xonecode. */
  androidHome: boolean;
  avds: readonly string[];
}

/**
 * La receta del emulador de Android en macOS.
 *
 * **Solo macOS, y a propósito.** En Windows y en Linux los gestores y las rutas son otros,
 * así que serán otra receta; devolver esta con otro título sería el botón muerto de siempre,
 * y el panel prefiere decir que aún no la hay.
 *
 * Sale de los pasos que el usuario verificó a mano en su máquina, no de la documentación.
 */
export function recetaDeEmuladorAndroid(plataforma: string, estado: EstadoDeAndroid): Receta | undefined {
  if (plataforma !== "darwin") return undefined;

  const pasos: PasoDeReceta[] = [
    {
      titulo: "Instalar las herramientas: el JDK y el SDK de línea de comandos",
      comandos: [
        "brew install openjdk@17",
        "brew install --cask android-commandlinetools android-platform-tools",
      ],
      nota: "Puede pedirte la contraseña de administrador, así que se pega en un terminal y no se lanza desde aquí.",
      // `sdkmanager` es lo que instala el cask: si está, el paso está hecho.
      hecho: estado.sdkmanager,
    },
    {
      titulo: "Declarar las variables en tu shell",
      comandos: [
        'export ANDROID_HOME="$(brew --prefix)/share/android-commandlinetools"',
        'export PATH="$PATH:$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools"',
        'export JAVA_HOME="$(brew --prefix openjdk@17)"',
      ],
      nota:
        "Va en `~/.zshrc`, y luego abre un terminal nuevo o haz `source ~/.zshrc`. " +
        "xonecode NO lo necesita —ya mira la carpeta de Homebrew para encontrar el SDK—: " +
        "esto es para que los comandos de abajo funcionen en tu terminal.",
      hecho: estado.androidHome,
    },
    {
      titulo: "Descargar el emulador y la imagen del sistema",
      comandos: [
        'sdkmanager --install "emulator" "platforms;android-35" "system-images;android-35;google_apis;arm64-v8a"',
      ],
      nota: "Son 2-3 GB y te pedirá aceptar las licencias del SDK de Android: responde `y`.",
      hecho: estado.emulator,
    },
    {
      titulo: "Crear el dispositivo virtual",
      comandos: ['avdmanager create avd -n pixel8 -k "system-images;android-35;google_apis;arm64-v8a" -d pixel_8'],
      nota: "Si pregunta por un perfil de hardware personalizado, responde `no`.",
      hecho: estado.avds.length > 0,
    },
  ];

  return {
    id: "android-emulador",
    titulo: "Instalar el emulador de Android",
    descripcion:
      "Cuatro pasos, una vez por máquina. Los comandos se pegan en un terminal; cada paso se " +
      "marca solo cuando la medida lo encuentra, no cuando lo pulsas.",
    pasos,
    completa: pasos.every((p) => p.hecho),
    // Arrancar un emulador es un proceso de vida larga y otra capacidad; hoy no está
    // cableado, así que se da el comando en vez de prometer un botón.
    despues:
      "Para arrancarlo: `emulator -avd pixel8`. Con él abierto, `adb devices` lista " +
      "`emulator-5554` y aparecerá aquí. Arrancarlo desde esta ventana todavía no está cableado.",
  };
}

export interface InformeDeDispositivos {
  sistema: SistemaOperativo;
  herramientas: Herramienta[];
  dispositivos: Dispositivo[];
  /** Los AVD de Android definidos (imágenes de emulador), estén arrancados o no. */
  avds: string[];
  /**
   * Cómo conseguir lo que a esta máquina le falta. Vacío cuando no hay ninguna receta para
   * este sistema —Windows y Linux son otras— o cuando no hace falta ninguna.
   */
  recetas: Receta[];
  /** Cuándo se midió (ISO). Lo que se enseña es una foto, no un estado en vivo. */
  medido: string;
}

/** El sistema, a partir de `process.platform`. */
export function sistemaDe(platform: string): SistemaOperativo {
  if (platform === "darwin") return "mac";
  if (platform === "win32") return "windows";
  if (platform === "linux") return "linux";
  return "otro";
}

export function nombreDelSistema(sistema: SistemaOperativo): string {
  return { mac: "macOS", windows: "Windows", linux: "Linux", otro: "sistema desconocido" }[sistema];
}

/**
 * `adb devices -l`. Formato estable desde hace años:
 *
 *     List of devices attached
 *     emulator-5554          device product:sdk_gphone64_arm64 model:sdk_gphone64_arm64 device:emu64a transport_id:1
 *     R58M12ABCDE            unauthorized transport_id:2
 *     192.168.1.20:5555      offline
 *
 * El nombre sale de `model:` (con los guiones bajos como espacios) y, sin él, del serial.
 * Un serial `emulator-N` es un emulador; lo demás, físico (incluido un dispositivo por red).
 */
export function parsearAdbDevices(texto: string): Dispositivo[] {
  const salida: Dispositivo[] = [];
  for (const linea of texto.split(/\r?\n/)) {
    const l = linea.trim();
    if (l === "" || /^List of devices/i.test(l) || l.startsWith("*")) continue;
    const [serial, estadoCrudo, ...resto] = l.split(/\s+/);
    if (serial === undefined || estadoCrudo === undefined) continue;
    const campos = new Map<string, string>();
    for (const parte of resto) {
      const i = parte.indexOf(":");
      if (i > 0) campos.set(parte.slice(0, i), parte.slice(i + 1));
    }
    const estado: Dispositivo["estado"] =
      estadoCrudo === "device"
        ? "conectado"
        : estadoCrudo === "unauthorized"
          ? "sin-autorizar"
          : estadoCrudo === "offline"
            ? "offline"
            : "no-disponible";
    const modelo = campos.get("model");
    salida.push({
      id: serial,
      nombre: modelo === undefined ? serial : modelo.replace(/_/g, " "),
      plataforma: "android",
      clase: serial.startsWith("emulator-") ? "emulador" : "fisico",
      estado,
      ...(estado === "no-disponible" ? { detalle: `estado «${estadoCrudo}»` } : {}),
      ...(estado === "sin-autorizar" ? { detalle: "acepta la depuración USB en el dispositivo" } : {}),
    });
  }
  return salida;
}

/**
 * `emulator -list-avds`: un nombre por línea. Las versiones recientes mezclan líneas
 * `INFO | …` (van a stderr, pero por si acaso se descartan también aquí).
 */
export function parsearAvds(texto: string): string[] {
  return texto
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== "" && !/^(INFO|WARNING|ERROR)\b/.test(l));
}

/**
 * `xcrun simctl list -j devices available`. Forma MEDIDA en esta máquina (Xcode con iOS 26):
 *
 *     { "devices": { "com.apple.CoreSimulator.SimRuntime.iOS-26-0": [
 *         { "udid": "EF39…", "isAvailable": true, "state": "Shutdown", "name": "iPhone 17 Pro", … } ] } }
 *
 * El runtime se lee de la clave: «iOS-26-0» → «iOS 26.0». `Booted` es el único estado en que
 * se llega al simulador; `Shutdown` es apagado, y cualquier otro se enseña como no disponible
 * con su valor.
 */
export function parsearSimctl(json: string): Dispositivo[] {
  let datos: unknown;
  try {
    datos = JSON.parse(json);
  } catch {
    return [];
  }
  const devices = (datos as { devices?: Record<string, unknown> } | null)?.devices;
  if (devices === undefined || devices === null || typeof devices !== "object") return [];
  const salida: Dispositivo[] = [];
  for (const [runtime, lista] of Object.entries(devices)) {
    if (!Array.isArray(lista)) continue;
    const version = runtime.split(".").pop() ?? runtime; // «iOS-26-0»
    const legible = version.replace(/^([A-Za-z]+)-(\d+)-(\d+)$/, "$1 $2.$3").replace(/-/g, " ");
    for (const d of lista as Array<Record<string, unknown>>) {
      if (typeof d.udid !== "string" || typeof d.name !== "string") continue;
      if (d.isAvailable === false) continue;
      const estado: Dispositivo["estado"] =
        d.state === "Booted" ? "arrancado" : d.state === "Shutdown" ? "apagado" : "no-disponible";
      salida.push({
        id: d.udid,
        nombre: `${d.name} · ${legible}`,
        plataforma: "ios",
        clase: "simulador",
        estado,
        ...(estado === "no-disponible" ? { detalle: `estado «${String(d.state)}»` } : {}),
      });
    }
  }
  return salida;
}

/**
 * `xcrun devicectl list devices --json-output <fichero>`. Forma DOCUMENTADA (Xcode 15+),
 * no medida: en esta máquina no hay ningún dispositivo iOS físico, y el fichero real
 * trae `result.devices: []`. Campos: `identifier`, `deviceProperties.name`,
 * `connectionProperties.tunnelState` («connected» | «unavailable» | …) y
 * `hardwareProperties.platform`.
 */
export function parsearDevicectl(json: string): Dispositivo[] {
  let datos: unknown;
  try {
    datos = JSON.parse(json);
  } catch {
    return [];
  }
  const lista = (datos as { result?: { devices?: unknown } } | null)?.result?.devices;
  if (!Array.isArray(lista)) return [];
  const salida: Dispositivo[] = [];
  for (const d of lista as Array<Record<string, unknown>>) {
    const id = d.identifier;
    if (typeof id !== "string") continue;
    const props = (d.deviceProperties ?? {}) as Record<string, unknown>;
    const conexion = (d.connectionProperties ?? {}) as Record<string, unknown>;
    const hardware = (d.hardwareProperties ?? {}) as Record<string, unknown>;
    const nombre = typeof props.name === "string" ? props.name : id;
    const tunel = typeof conexion.tunnelState === "string" ? conexion.tunnelState : "";
    const estado: Dispositivo["estado"] = tunel === "connected" ? "conectado" : "no-disponible";
    const plataforma = typeof hardware.platform === "string" ? hardware.platform : "";
    salida.push({
      id,
      nombre: plataforma === "" ? nombre : `${nombre} · ${plataforma}`,
      plataforma: "ios",
      clase: "fisico",
      estado,
      ...(estado === "no-disponible" ? { detalle: tunel === "" ? "sin túnel" : `túnel «${tunel}»` } : {}),
    });
  }
  return salida;
}

/** Con qué dispositivos SE LLEGA ahora mismo: es lo que el escritorio lista por nombre. */
export function alcanzables(informe: InformeDeDispositivos): Dispositivo[] {
  return informe.dispositivos.filter((d) => d.estado === "conectado" || d.estado === "arrancado");
}
