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
   * devuelve en el acto y abre el diálogo de Apple. Lo demás se ofrece para copiar, y **el
   * motivo NO es la contraseña de administrador**: eso está desmentido —medido, `sudo` sin
   * terminal de control falla en el acto en vez de colgarse, y por eso los `brew` de la
   * RECETA sí se lanzan—. Es que este camino
   * (`agent/dispositivosEnMaquina.ts#instalarHerramientaDeDispositivos`) no tiene canal de
   * progreso: un `execFile` con su tope, sin log en vivo. `brew install --cask` tarda
   * minutos, y un botón mudo durante diez se lee como que se ha colgado — que es justo lo
   * que la fase de la receta existe para evitar.
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
  /**
   * Lo que contestó el dispositivo cuando alguien pidió VERIFICAR la conexión.
   *
   * Es otra pregunta que `estado`, y por eso es otro campo: `estado` sale de LISTAR
   * (`adb devices`, `simctl list`), o sea de lo que el intermediario cree; esto sale de
   * hablar CON el dispositivo y esperar respuesta. Un `adb devices` que dice «device» y un
   * `adb shell` que se queda colgado son la situación que esto distingue.
   *
   * **Ausente es «nadie lo ha verificado», nunca «no responde».** Y vive con el informe, así
   * que una medida nueva se lo lleva por construcción: una verificación de hace media hora
   * pegada a una foto de ahora afirmaría algo que nadie ha comprobado.
   */
  verificado?: {
    ok: boolean;
    /** Una línea: lo que contestó, o por qué no. Nunca la salida entera. */
    detalle: string;
    /** Cuándo se verificó (ISO). Se dice al lado: la foto y la verificación son dos horas. */
    medido: string;
  };
}

/**
 * Un paso de una RECETA: lo que hay que hacer una vez para que una capacidad exista.
 *
 * Todos se pueden COPIAR; los que además se pueden LANZAR llevan `ejecutable`. La regla es
 * «se ofrece ejecutar lo que se puede cumplir», aplicada por COMANDO y no por herramienta.
 *
 * **Y el criterio dejó de ser «puede pedir la contraseña» para ser «puede COLGARSE
 * pidiéndola», que está medido.** Aquí decía que `brew` no se lanzaba porque un hijo sin
 * terminal detrás se quedaría esperando la contraseña de administrador para siempre. Es
 * falso con la forma en que este harness lanza: `sudo` lee la contraseña de `/dev/tty`, no
 * de `stdin`, así que sin terminal de control **falla en el acto** — medido el 10-09-2026,
 * `sudo -k true` con `stdio[0] = "ignore"` sale con código 1 en 57 ms diciendo «a terminal
 * is required to read the password». O sea que el modo de fallo no es un botón colgado: es
 * un botón que dice en dos segundos qué hace falta. Con eso, los pasos de `brew` pasan a
 * ejecutables — y son justo los que faltaban para que la receta de Android tuviera algún
 * botón vivo en una máquina nueva, porque los otros dos dependen de este.
 *
 * Lo que sigue siendo copiable es lo que pide entrada por un camino que NO falla rápido: un
 * `sudo` escrito a mano en el comando (la licencia de Xcode) y una autorización que el
 * sistema pide en una VENTANA (`xcodebuild -downloadPlatform`). Ahí un botón fallaría
 * siempre, que es la otra forma del botón muerto.
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
  /**
   * ¿Lo puede lanzar xonecode él, con log en vivo?
   *
   * Solo lo que no puede quedarse ESPERANDO a nadie. `sdkmanager` y `avdmanager` preguntan
   * las licencias y el perfil de hardware, y las dos respuestas se alimentan por `stdin` de
   * forma determinista; `brew` no pregunta nada en modo no interactivo y, si algo suyo
   * pidiera la contraseña, sin terminal de control falla en el acto (medido, arriba).
   *
   * Un paso ejecutable lo es SI Y SOLO SI está en la tabla cerrada de
   * `agent/instalacionEnMaquina.ts#PASOS_EJECUTABLES`: este campo dice que se ofrezca el
   * botón, y esa tabla es la que decide qué se lanza. Que las dos coincidan lo ata un test.
   */
  ejecutable: boolean;
  /**
   * Por qué no se puede lanzar. Dos formas, y las dos se dicen: que falte otro paso —«hace
   * falta el paso 1»— o que ese comando no se lance nunca desde aquí, como el `sudo` de la
   * licencia de Xcode. Sin el motivo, un paso sin botón se lee como que la ventana está rota.
   */
  porQueNo?: string;
  /**
   * Lo que se acepta al pulsar, si al pulsar se acepta algo. Va aparte del `nota` porque
   * aceptar una licencia en nombre de alguien no puede ser un efecto de rebote de un botón
   * que dice «Ejecutar»: se enseña al lado, y pulsar ES la aceptación.
   */
  acepta?: string;
}

/**
 * Cómo conseguir una capacidad que esta máquina no tiene. Hoy hay dos, las dos de macOS.
 *
 * El `id` es una UNIÓN y no una cadena: viaja por el cable y es la clave con que
 * `agent/instalacionEnMaquina.ts` busca en su tabla cerrada de pasos ejecutables, así que un
 * id nuevo tiene que aparecer aquí para que el compilador obligue a decidir qué se lanza y
 * qué se copia.
 */
export interface Receta {
  id: "android-emulador" | "ios-simulador";
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
  /** Un JDK con el que correr `sdkmanager`, que es un programa Java. */
  jdk: boolean;
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

  // Lo que xonecode puede lanzar él necesita las herramientas del paso 1: el binario y el
  // JDK con el que corre. Sin ellos el botón no se ofrece y se dice por qué — un botón que
  // no puede cumplir es el botón muerto de siempre.
  const puedeLanzar = estado.sdkmanager && estado.jdk;

  const pasos: PasoDeReceta[] = [
    {
      titulo: "Instalar las herramientas: el JDK y el SDK de línea de comandos",
      comandos: [
        "brew install openjdk@17",
        "brew install --cask android-commandlinetools android-platform-tools",
      ],
      nota:
        "Son unos cientos de MB. Ni la fórmula ni el cask piden la contraseña de " +
        "administrador —instalan dentro del prefijo de Homebrew, que es tuyo—, así que " +
        "puedes pegarlo en un terminal o dejar que lo haga xonecode.",
      // `sdkmanager` es lo que instala el cask: si está, el paso está hecho.
      hecho: estado.sdkmanager,
      // **Este es el paso del que colgaban los otros dos.** Sin él, en una máquina nueva la
      // receta entera no tenía un solo botón vivo: los pasos 3 y 4 exigen `sdkmanager`, que
      // es justo lo que instala este. Se ofrece si hay `brew`, que es lo único que necesita.
      ejecutable: estado.brew,
      ...(estado.brew ? {} : { porQueNo: "hace falta Homebrew (brew.sh)" }),
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
      // Escribir en la shell de alguien es lo único de esta receta que no sabríamos deshacer.
      ejecutable: false,
    },
    {
      titulo: "Descargar el emulador y la imagen del sistema",
      comandos: [
        'sdkmanager --install "emulator" "platforms;android-35" "system-images;android-35;google_apis;arm64-v8a"',
      ],
      nota: "Son 2-3 GB. Puedes pegarlo en un terminal o dejar que lo haga xonecode.",
      hecho: estado.emulator,
      // Se puede lanzar en cuanto están las herramientas del paso 1: no pide contraseña.
      ejecutable: puedeLanzar,
      ...(puedeLanzar ? {} : { porQueNo: "hace falta el paso 1" }),
      acepta: "las licencias del SDK de Android de Google",
    },
    {
      titulo: "Crear el dispositivo virtual",
      comandos: ['avdmanager create avd -n pixel8 -k "system-images;android-35;google_apis;arm64-v8a" -d pixel_8'],
      nota: "Si lo pegas en un terminal y pregunta por un perfil de hardware, responde `no`.",
      hecho: estado.avds.length > 0,
      // Necesita la imagen del sistema, que la trae el paso 3.
      ejecutable: puedeLanzar && estado.emulator,
      ...(puedeLanzar && estado.emulator ? {} : { porQueNo: puedeLanzar ? "hazlo después del paso 3" : "hace falta el paso 1" }),
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

/** Lo medido que decide los pasos de la receta de iOS. Entra ya resuelto: esto es `core/`. */
export interface EstadoDeIos {
  /**
   * Xcode COMPLETO, no las Command Line Tools: `xcode-select -p` apunta dentro de un
   * `Xcode.app`. La distinción es la mitad de esta receta — las CLT traen `xcrun` y
   * `simctl`, así que `xcode-select -p` contesta y `xcrun simctl list` no falla, pero **no
   * traen ni un simulador**. Sin separarlas, alguien con solo las CLT vería «Xcode: ok» y
   * una lista de simuladores vacía sin nada que le dijera qué le falta.
   */
  xcode: boolean;
  /** La licencia aceptada y la ruta activa puesta: `xcodebuild -version` contesta. */
  licencia: boolean;
  /** Los runtime de iOS instalados, por versión (`xcrun simctl runtime list -j`). */
  runtimes: readonly string[];
}

/**
 * La receta del simulador de iOS en macOS.
 *
 * **Solo macOS, y no por elección**: los simuladores de iOS los da Xcode, que no existe en
 * ningún otro sistema. Fuera de macOS la respuesta no es otra receta, es que no hay ninguna.
 *
 * Los tres pasos son COPIABLES y ninguno se lanza desde aquí, al contrario que la de
 * Android. Es la regla de siempre —se ofrece ejecutar lo que se puede cumplir— aplicada a lo
 * que cada comando necesita de verdad:
 * - **Xcode se instala del App Store.** No hay comando que lo haga; lo que se da es el que
 *   abre su ficha. Un botón «Ejecutar este paso» que solo abriera una ventana del App Store
 *   diría que ha hecho el paso, y no lo ha hecho.
 * - **La licencia lleva `sudo` escrito en el comando.** Sin terminal de control `sudo` falla
 *   en el acto (medido), así que el botón no se colgaría — fallaría SIEMPRE, que es la otra
 *   forma del botón muerto.
 * - **El runtime pide autorización de administrador en una VENTANA del sistema.** Eso no se
 *   puede contestar por `stdin` ni fallar rápido: se queda esperando a alguien que está
 *   mirando el navegador, no el escritorio.
 *
 * Y hay que decir lo que se mide de esta máquina: aquí, el 10-09-2026, los tres pasos están
 * hechos (Xcode 26.6, licencia aceptada, tres runtime de iOS), así que la receta sale
 * `completa` y el panel dice «ya está» en vez de cuatro pasos que sobran.
 */
export function recetaDeSimuladorIos(plataforma: string, estado: EstadoDeIos): Receta | undefined {
  if (plataforma !== "darwin") return undefined;

  const pasos: PasoDeReceta[] = [
    {
      titulo: "Instalar Xcode completo (no solo las herramientas de línea de comandos)",
      // `open` con el esquema del App Store: es lo máximo que un comando puede hacer aquí.
      comandos: ['open "macappstore://apps.apple.com/app/id497799835"'],
      nota:
        "Son unos 10 GB del App Store y no hay comando que lo instale: esto solo abre su " +
        "ficha. Las Command Line Tools por sí solas no traen ningún simulador.",
      hecho: estado.xcode,
      ejecutable: false,
      porQueNo: "Xcode se instala desde el App Store, no con un comando",
    },
    {
      titulo: "Aceptar la licencia y apuntar a Xcode",
      // `/Applications/Xcode.app` es una constante de macOS —igual en todas—, no una ruta
      // MEDIDA de esta máquina: no es la excepción a la regla de arriba, que existe para que
      // no viaje el home de nadie ni un prefijo que cambia entre Intel y Apple Silicon.
      comandos: [
        "sudo xcode-select -s /Applications/Xcode.app/Contents/Developer",
        "sudo xcodebuild -license accept",
      ],
      nota:
        "Pide la contraseña de administrador, y eso solo se teclea en un terminal: un " +
        "proceso lanzado desde aquí no tiene dónde leerla y falla en el acto. Por eso este " +
        "paso no lleva botón.",
      hecho: estado.licencia,
      ejecutable: false,
      porQueNo: "lleva `sudo`, y la contraseña solo se puede teclear en un terminal",
    },
    {
      titulo: "Descargar el runtime de iOS del simulador",
      comandos: ["xcodebuild -downloadPlatform iOS"],
      nota:
        "Son varios GB y puede pedirte autorización de administrador en una ventana del " +
        "sistema, así que se pega en un terminal. Con `-downloadAllPlatforms` se traen " +
        "también watchOS, tvOS y visionOS, que aquí no hacen falta.",
      hecho: estado.runtimes.length > 0,
      ejecutable: false,
      porQueNo: "pide autorización en una ventana del sistema, que un proceso de aquí no puede contestar",
    },
  ];

  return {
    id: "ios-simulador",
    titulo: "Instalar el simulador de iOS",
    descripcion:
      "Tres pasos, una vez por máquina. Los comandos se pegan en un terminal; cada paso se " +
      "marca solo cuando la medida lo encuentra, no cuando lo pulsas.",
    pasos,
    completa: pasos.every((p) => p.hecho),
    // Xcode crea un simulador por modelo con cada runtime que instalas, así que «crear» no
    // es un paso: con el runtime puesto ya hay lista. Arrancar uno todavía no está cableado.
    despues:
      estado.runtimes.length === 0
        ? "Con el runtime instalado, Xcode ya deja una lista de simuladores hecha: aparecerán aquí. Para arrancar uno, `xcrun simctl boot <UDID>`; arrancarlo desde esta ventana todavía no está cableado."
        : `Runtime de iOS instalados: ${estado.runtimes.join(", ")}. Para arrancar un simulador, \`xcrun simctl boot <UDID>\`; arrancarlo desde esta ventana todavía no está cableado.`,
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
 * Los runtime de iOS del simulador, del MISMO `xcrun simctl list -j` que ya trae los
 * dispositivos: se le añade el dominio `runtimes` y con eso viene en la misma respuesta.
 *
 * Eso es lo que hace que saber si falta el runtime no cueste NI UN proceso más, que es la
 * regla de esta pantalla: medir cuesta procesos en el equipo del usuario. La otra forma,
 * `xcrun simctl runtime list -j`, existe y contesta lo mismo —medido: un objeto indexado por
 * uuid con `platformIdentifier` y `state: "Ready"`— pero es una llamada aparte.
 *
 * Forma MEDIDA aquí (Xcode 26.6):
 *
 *     { "runtimes": [ { "name": "iOS 26.0", "version": "26.0.1", "isAvailable": true,
 *                       "platform": "iOS", "identifier": "…SimRuntime.iOS-26-0" } ],
 *       "devices": { … } }
 *
 * Solo los de **iOS** y solo los `isAvailable`: uno a medio descargar no arranca nada, y con
 * watchOS o tvOS instalados la cifra diría que hay iOS cuando no lo hay. `isAvailable` se
 * mira como booleano de verdad —la trampa del `"false"` de cadena— y **ausente cuenta como
 * disponible**: este listado ya se pide con `available`, así que quien no lo esté no llega
 * hasta aquí, y descartar lo que no lo declara diría que no hay runtime teniéndolos.
 */
export function parsearRuntimesDeIos(json: string): string[] {
  let datos: unknown;
  try {
    datos = JSON.parse(json);
  } catch {
    return [];
  }
  const lista = (datos as { runtimes?: unknown } | null)?.runtimes;
  if (!Array.isArray(lista)) return [];
  const salida: string[] = [];
  for (const entrada of lista as Array<Record<string, unknown>>) {
    if (entrada === null || typeof entrada !== "object") continue;
    if (entrada.platform !== "iOS") continue;
    if (entrada.isAvailable === false) continue;
    const version = typeof entrada.version === "string" ? entrada.version : undefined;
    const nombre = typeof entrada.name === "string" ? entrada.name : undefined;
    if (version === undefined && nombre === undefined) continue;
    salida.push(nombre ?? `iOS ${version!}`);
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

/**
 * La línea que EXPLICA un fallo de `simctl`, de entre las que escribe.
 *
 * Medido el 10-09-2026 con `xcrun simctl spawn <udid>` sobre un simulador apagado: la
 * primera línea es papeleo y la segunda es lo que hay que leer.
 *
 *     An error was encountered processing the command (domain=com.apple.CoreSimulator.SimError, code=405):
 *     Process spawn via launchd failed because device is not booted.
 *     Underlying error (domain=com.apple.SimLaunchHostService.RequestError, code=3):
 *
 * `describirFallo` se queda con la PRIMERA línea de stderr, que aquí es justo la que no dice
 * nada —un dominio y un número—, así que esta elige la primera que no sea de papeleo. Sin
 * esto, verificar un simulador apagado contestaba con un código de error en vez de con
 * «no está arrancado».
 */
export function motivoDeSimctl(texto: string): string | undefined {
  for (const linea of texto.split(/\r?\n/)) {
    const l = linea.trim();
    if (l === "") continue;
    if (/^An error was encountered/i.test(l)) continue;
    if (/^Underlying error/i.test(l)) continue;
    return l;
  }
  return undefined;
}

/** Con qué dispositivos SE LLEGA ahora mismo: es lo que el escritorio lista por nombre. */
export function alcanzables(informe: InformeDeDispositivos): Dispositivo[] {
  return informe.dispositivos.filter((d) => d.estado === "conectado" || d.estado === "arrancado");
}
