/**
 * Qué hay en la máquina para probar una app XOne: el sistema operativo, las herramientas
 * de Android e iOS, y los dispositivos y simuladores a los que se llega.
 *
 * Aquí viven los TIPOS y los parsers PUROS —texto de una herramienta → datos—; quien lanza
 * las herramientas es `agent/dispositivos/dispositivosEnMaquina.ts`. Separarlo así es lo que permite
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
   * A qué plataforma sirve. **Es un DATO y no una adivinanza del nombre**: la ventana de
   * Ajustes tiene una pestaña por plataforma y agrupa por esto. Deducirlo allí de
   * «`adb` suena a Android» sería una segunda copia de una regla que ya está aquí — y el
   * día que una herramienta sirviera a las dos, la copia callaría.
   */
  plataforma: "android" | "ios";
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
   * (`agent/dispositivos/dispositivosEnMaquina.ts#instalarHerramientaDeDispositivos`) no tiene canal de
   * progreso: un `execFile` con su tope, sin log en vivo. `brew install --cask` tarda
   * minutos, y un botón mudo durante diez se lee como que se ha colgado — que es justo lo
   * que la fase de la receta existe para evitar.
   */
  instalar?: { comando: string; automatico: boolean };
  /** El motivo del fallo, o por qué no aplica. Nunca la salida cruda entera. */
  detalle?: string;
}

/**
 * A qué plataforma sirve una herramienta, **en un solo sitio y exhaustivo por TIPO**.
 *
 * Es lo que rellena `Herramienta.plataforma`, y el `switch` sin `default` es lo que hace que
 * una herramienta nueva no compile hasta que alguien decida de quién es. Escribir la
 * plataforma a mano en cada fila de la medida habría sido la misma respuesta catorce veces,
 * y bastaba con olvidarla en una para que esa fila cayera en la pestaña equivocada —o en
 * ninguna— sin que nada diera error.
 */
export function plataformaDe(nombre: NombreDeHerramienta): "android" | "ios" {
  switch (nombre) {
    case "adb":
    case "emulator":
      return "android";
    case "xcrun":
    case "devicectl":
      return "ios";
  }
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
  /**
   * De qué AVD es este emulador. Solo para `clase === "emulador"` de Android.
   *
   * **Es el único dato que ata un emulador en marcha a su definición**, y hay que MEDIRLO
   * aparte: `adb devices -l` no lo dice por ningún lado —la imagen `google_apis` contesta
   * `model:sdk_gphone64_arm64` mientras el AVD se llama `pixel8`—, así que emparejar por el
   * nombre visible no puede acertar nunca. Sin este campo, el AVD arrancado se listaba
   * ADEMÁS como apagado: dos filas para un aparato y una diciendo lo contrario de la verdad.
   *
   * Ausente es «no se pudo identificar», no «no tiene»: un emulador de terceros o una
   * consola que no contesta. Quien empareja tiene que tratarlo como desconocido y no como
   * «este AVD está apagado».
   */
  avd?: string;
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
   * `agent/dispositivos/instalacionEnMaquina.ts#PASOS_EJECUTABLES`: este campo dice que se ofrezca el
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
  /**
   * Con el paso YA HECHO, si volver a lanzarlo sirve para algo, cómo se llama entonces el
   * botón. **Ausente significa que no se ofrece.**
   *
   * Medido en la ventana: un paso marcado como hecho seguía enseñando «Ejecutar este paso»,
   * o sea que la receta ofrecía instalar lo que su propia marca decía que ya estaba. Eso es
   * el botón muerto otra vez, y en la dirección que más desgasta: enseña a pulsar sin leer.
   * Pero quitarlo de todos habría borrado la única vía de ACTUALIZAR: `sdkmanager --install`
   * sobre un paquete instalado lo sube de versión, así que ahí repetir es una operación
   * distinta y con otro nombre — y con su `porQue` al lado, porque un botón sobre un paso
   * hecho, sin motivo, se lee como el mismo error al revés.
   */
  repetir?: { etiqueta: string; porQue: string };
}

/**
 * Lo que va APARTE de los pasos: consejo que NO se mide, no se lanza desde aquí y **no
 * decide si la receta está completa**.
 *
 * Existe por un paso que había aquí: «declarar las variables en tu shell» era un paso —con
 * su número, su marca y su peso en `completa`— cuyo `hecho` se medía en el ENTORNO DE ESTE
 * PROCESO y no en la shell de nadie, y cuya propia nota decía que xonecode no lo necesita.
 * El resultado, medido en una máquina con el emulador ya instalado: la receta seguía abierta
 * enseñando pasos hechos, y no podía cerrarse nunca por un consejo que nadie está obligado a
 * seguir. El consejo se sigue dando —los `export` hacen falta para que `emulator` y `adb`
 * funcionen en un terminal— pero deja de ser un requisito.
 */
export interface Aparte {
  titulo: string;
  comandos: string[];
  /** Lo que hay que saber antes de pegarlo, igual que en un paso. */
  nota?: string;
}

/**
 * Cómo conseguir una capacidad que esta máquina no tiene. Hoy hay dos, las dos de macOS.
 *
 * El `id` es una UNIÓN y no una cadena: viaja por el cable y es la clave con que
 * `agent/dispositivos/instalacionEnMaquina.ts` busca en su tabla cerrada de pasos ejecutables, así que un
 * id nuevo tiene que aparecer aquí para que el compilador obligue a decidir qué se lanza y
 * qué se copia.
 */
export interface Receta {
  id: "android-emulador" | "ios-simulador";
  /** A qué plataforma sirve. Dato, como en `Herramienta`: de aquí sale su pestaña. */
  plataforma: "android" | "ios";
  titulo: string;
  descripcion: string;
  pasos: PasoDeReceta[];
  /** Todo hecho: la receta se pliega y se dice que ya está. */
  completa: boolean;
  /**
   * Consejo que NO es un paso y no cuenta para `completa`. Ver `Aparte`.
   *
   * Solo Android lo tiene hoy: son los `export` de la shell, que hacen falta para que el
   * comando de `despues` funcione en un terminal pero que xonecode no necesita para nada.
   */
  aparte?: Aparte;
  /** Lo que viene DESPUÉS de instalar y que esta consola no hace por ti. */
  despues: string;
}

/** Lo medido que decide qué pasos están hechos. Entra ya resuelto: esto es `core/`. */
export interface EstadoDeAndroid {
  /** ¿Hay `brew`? Sin él la receta se puede leer igual, pero el primer paso no valdrá. */
  brew: boolean;
  sdkmanager: boolean;
  emulator: boolean;
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
        "puedes pegarlo en un terminal o dejar que lo haga XOneCode.",
      // `sdkmanager` es lo que instala el cask: si está, el paso está hecho.
      hecho: estado.sdkmanager,
      // **Este es el paso del que colgaban los otros dos.** Sin él, en una máquina nueva la
      // receta entera no tenía un solo botón vivo: los pasos 3 y 4 exigen `sdkmanager`, que
      // es justo lo que instala este. Se ofrece si hay `brew`, que es lo único que necesita.
      ejecutable: estado.brew,
      ...(estado.brew ? {} : { porQueNo: "hace falta Homebrew (brew.sh)" }),
    },
    {
      titulo: "Descargar el emulador y la imagen del sistema",
      // **`platform-tools` no es un extra de esta línea: sin ellos el emulador no ARRANCA.**
      // Se niega a dar por buena la raíz del SDK que no los tenga dentro —«guessed sdk root …
      // does not seem to be valid» y después `Cannot find AVD system path`, con `ANDROID_HOME`
      // apuntando a la raíz correcta—, y el cask `android-commandlinetools` no los trae: el
      // `adb` del PATH viene del cask APARTE `android-platform-tools`, que los deja fuera de
      // la raíz. Medido el 16-sep-2026 en un Mac con la receta entera hecha: sin esta palabra
      // los tres pasos salían «hechos» y `emulator -avd pixel8` fallaba. Es la misma cuenta
      // que ya hace `dispositivosEnMaquina.ts#comoInstalar`, que para un `adb` que falta
      // propone justo `sdkmanager --install "platform-tools"`.
      comandos: [
        'sdkmanager --install "platform-tools" "emulator" "platforms;android-35" "system-images;android-35;google_apis;arm64-v8a"',
      ],
      nota: "Son 2-3 GB. Puedes pegarlo en un terminal o dejar que lo haga XOneCode.",
      hecho: estado.emulator,
      // Se puede lanzar en cuanto están las herramientas del paso 1: no pide contraseña.
      ejecutable: puedeLanzar,
      ...(puedeLanzar ? {} : { porQueNo: "hace falta el paso 1" }),
      // **Este es el único paso que se repite a propósito**, y por eso lleva nombre propio
      // cuando ya está hecho: aquí «volver a pulsar» no es instalar lo mismo, es subir de
      // versión. Sin esto, quitarle el botón a los pasos hechos habría borrado la única vía
      // de actualizar la imagen del sistema.
      repetir: {
        etiqueta: "Actualizar",
        porQue:
          "volver a pedirlo sube de versión lo que ya está: `sdkmanager --install` sobre un paquete instalado lo actualiza",
      },
      acepta: "las licencias del SDK de Android de Google",
    },
    {
      titulo: "Crear el dispositivo virtual",
      comandos: ['avdmanager create avd -n pixel8 -k "system-images;android-35;google_apis;arm64-v8a" -d pixel_8'],
      nota: "Si lo pegas en un terminal y pregunta por un perfil de hardware, responde `no`.",
      hecho: estado.avds.length > 0,
      // Necesita la imagen del sistema, que la trae el paso 2.
      ejecutable: puedeLanzar && estado.emulator,
      ...(puedeLanzar && estado.emulator ? {} : { porQueNo: puedeLanzar ? "hazlo después del paso 2" : "hace falta el paso 1" }),
    },
  ];

  return {
    id: "android-emulador",
    plataforma: "android",
    titulo: "Instalar el emulador de Android",
    descripcion:
      "Tres pasos, una vez por máquina. Los comandos se pegan en un terminal; cada paso se " +
      "marca solo cuando la medida lo encuentra, no cuando lo pulsas.",
    pasos,
    completa: pasos.every((p) => p.hecho),
    // El consejo de la shell, fuera de los pasos: ver `Aparte`. Va aquí y no entre ellos
    // porque no se mide, no se lanza desde esta ventana y no puede dejar la receta a medias
    // — que es exactamente lo que hacía cuando era el paso 2.
    aparte: {
      titulo: "Declarar las variables en tu shell",
      comandos: [
        'export ANDROID_HOME="$(brew --prefix)/share/android-commandlinetools"',
        'export PATH="$PATH:$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools"',
        'export JAVA_HOME="$(brew --prefix openjdk@17)"',
      ],
      nota:
        "Va en `~/.zshrc`, y luego abre un terminal nuevo o haz `source ~/.zshrc`. " +
        "XOneCode NO lo necesita —ya mira la carpeta de Homebrew para encontrar el SDK—: " +
        "esto es para que `emulator` y `adb` te funcionen en tu terminal, y sin ello el " +
        "comando de abajo hay que escribirlo con la ruta entera. No es un paso: no se mide, " +
        "no se lanza desde aquí y la receta no espera a que lo hagas.",
    },
    // Arrancar un emulador es un proceso de vida larga y otra capacidad; hoy no está
    // cableado, así que se da el comando en vez de prometer un botón.
    despues:
      "Con el AVD creado aparece abajo, en «Simuladores y emuladores», con su botón de " +
      "«Arrancar»: se lanza desde aquí y la fila se pone en verde cuando el aparato responde. " +
      "A mano sería `emulator -avd pixel8`, que es lo mismo que hace ese botón.",
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
    plataforma: "ios",
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
 * El motivo de una verificación fallida, dicho sin vocabulario de máquina.
 *
 * Lo que devuelve `adb` viene con el SERIAL dentro —«adb: device 'emulator-5554' not found»— y
 * eso acaba en una fila que se llama `pixel8`: el serial es un puerto que cambia entre
 * arranques, es lo que esta interfaz esconde a propósito en todas partes, y encima deja al
 * usuario leyendo dos nombres del mismo aparato. Se sustituye por el nombre que se le enseña.
 *
 * Y el caso de «no está» se DICE en vez de traducirse palabra por palabra: «not found» de adb
 * significa que el aparato ya no aparece en su lista, o sea que se apagó o se desenchufó desde
 * la última medida. Eso es lo accionable —la lista está vieja, vuelve a mirar— y es lo que
 * explica por qué la fila decía «arrancado» mientras la verificación dice que no.
 */
export function motivoDeVerificacion(
  crudo: string,
  dispositivo: Pick<Dispositivo, "id" | "nombre">
): string {
  const sinSerial = crudo.split(dispositivo.id).join(dispositivo.nombre);
  if (/\bnot found\b|\bdevice offline\b|\bno devices?\b/i.test(crudo)) {
    return `ya no está: se apagó o se desenchufó desde la última medida`;
  }
  return sinSerial;
}

/**
 * `adb -s <serial> emu avd name`: el nombre del AVD que hay detrás de un emulador en marcha.
 *
 * Forma MEDIDA con `pixel8` arrancado — son DOS líneas, el nombre y el acuse de la consola:
 *
 *     pixel8
 *     OK
 *
 * Se usa la consola del emulador y no `getprop ro.boot.qemu.avd_name` (que contesta lo mismo,
 * medido) porque `getprop` lee una propiedad de la IMAGEN y podría no estar en un emulador de
 * terceros, mientras que la consola es el emulador mismo contestando.
 *
 * Fail-closed: `undefined` ante cualquier cosa que no sea un nombre de AVD. El nombre es una
 * carpeta de `~/.android/avd`, así que no lleva espacios ni barras; y el `OK` del acuse se
 * descarta explícitamente porque llegar a tomarlo por nombre sería emparejar por una cadena
 * que no existe, o sea el mismo fallo de antes con otra forma.
 */
export function nombreDeAvdDeConsola(texto: string): string | undefined {
  for (const linea of texto.split(/\r?\n/)) {
    const l = linea.trim();
    if (l === "" || l === "OK" || /^(KO|error)\b/i.test(l)) continue;
    // Misma clase que acepta el arranque (`agent/dispositivos/arranqueDeEmulador.ts`), guion
    // inicial incluido: ahí un nombre que empiece por `-` lo tomaría `emulator` por bandera, y
    // dos reglas distintas para el mismo nombre es como se acaba colando por el lado flojo.
    return /^[A-Za-z0-9._][A-Za-z0-9._-]*$/.test(l) ? l : undefined;
  }
  return undefined;
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

/**
 * ¿Este estado es «se puede hablar con él»? El criterio vive AQUÍ y en un solo sitio.
 *
 * Estaba escrito a mano dentro de `alcanzables()`, y el veredicto de lanzamiento
 * (`core/puedeLanzarse.ts`) necesitaba lo mismo: una segunda definición de «alcanzable» es un
 * segundo sitio donde puede dejar de significar lo mismo —el día que un estado nuevo contara
 * como llegada, uno de los dos se enteraría y el otro no—, que es como se ha roto este repo
 * nueve veces. El test que ata las dos respuestas estado a estado es lo que impide que la copia
 * vuelva.
 */
export function esAlcanzable(estado: Dispositivo["estado"]): boolean {
  return estado === "conectado" || estado === "arrancado";
}

/** Con qué dispositivos SE LLEGA ahora mismo: es lo que el escritorio lista por nombre. */
export function alcanzables(informe: InformeDeDispositivos): Dispositivo[] {
  return informe.dispositivos.filter((d) => esAlcanzable(d.estado));
}
