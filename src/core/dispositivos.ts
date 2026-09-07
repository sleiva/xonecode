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

export interface InformeDeDispositivos {
  sistema: SistemaOperativo;
  herramientas: Herramienta[];
  dispositivos: Dispositivo[];
  /** Los AVD de Android definidos (imágenes de emulador), estén arrancados o no. */
  avds: string[];
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
