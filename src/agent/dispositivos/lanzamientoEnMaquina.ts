/**
 * Poner una app en el dispositivo y dejarla ARRANCADA: el recorrido entero, fase a fase.
 *
 * Es la mitad que EJECUTA lo que decide la pestaña «Ejecutar»: el túnel de `adb`, el ZIP del
 * proyecto, la subida, el reinicio del framework y —por el canal de `/hotswap`— el lanzamiento
 * con la lectura que dice si de verdad está viva.
 *
 * **Las fases, y por qué ese orden** (el de arriba abajo es el del código, y no es casual):
 *
 * 1. **`comprobando`.** El túnel PRIMERO, porque sin él `127.0.0.1:8443` no lleva a ninguna
 *    parte: el servidor escucha en el `localhost` del aparato, y quien lo trae aquí es
 *    `adb forward`. **Se aplica siempre y NO se quita al terminar**: se reaplica tras cada
 *    reconexión del cable, así que quitarlo dejaría el SIGUIENTE lanzamiento hablando con
 *    nadie. Y va antes de la comprobación del framework porque un aparato al que no se llega
 *    falla aquí con la línea de `adb`, que es justo el diagnóstico de ese caso.
 * 2. **`empaquetando`.** El ZIP, porque subir es lo que pone los ficheros nuevos en el
 *    aparato. Es síncrono y en memoria: no hay fichero temporal.
 * 3. **`subiendo`.** **Subir NO aplica**: el proceso del framework tiene cargado lo de antes,
 *    y el ZIP no limpia el destino —añade y sobrescribe, así que los `-wal` de una base vieja
 *    se quedan ahí—. Por eso no viaja `bd/`, y por eso esto no es el final del recorrido.
 * 4. **`reiniciando`.** Es lo ÚNICO que aplica lo subido. Y es `SetupActivity`, **nunca
 *    `.mainEntry`**: medido, `.mainEntry` no levanta el servidor.
 * 5. **`lanzando`.** El lanzamiento por el WebSocket, esperando el saludo del servidor. Entra
 *    por `deps.abrirSocket`, que es el CONSTRUCTOR del socket —así se llama en el módulo al que
 *    alimenta—: el cliente de `/hotswap` ya está escrito y medido en `agent/dispositivos/hotswap.ts`, y `ws`
 *    no se importa aquí.
 * 6. **`comprobando-arranque`.** La LECTURA, porque `{"result":true}` de `launchApplication`
 *    significa «aceptado», no «arrancó»: lo que dice si está viva es el árbol de controles.
 *
 * **El efecto de la subida va por `node:https`, y el porqué.** Ni `fetch` con un `dispatcher`
 * de `undici` —`undici` no es dependencia de este repo— ni `NODE_TLS_REJECT_UNAUTHORIZED=0`,
 * que desactivaría la confianza **para todo el proceso**, proveedores de modelo y CloudStudio
 * incluidos: una variable de entorno no distingue a quién le estás hablando. `node:https` deja
 * el `rejectUnauthorized` en ESTA petición (el certificado del aparato es autofirmado), deja
 * poner `Content-Length` y manda el ZIP desde memoria, sin fichero temporal.
 *
 * **El silencio es el síntoma, no la lentitud** (`TOPE_SIN_SALIDA_MS`): `adb` contesta en
 * milisegundos, y lo que no es normal es que se quede callado minutos. Con `TOPE_DE_TRABAJO_MS`
 * por encima, para que un proceso que habla sin avanzar no se quede para siempre.
 *
 * **Se mata el GRUPO y no el hijo** (`detached: true` + `kill(-pid)`): medido, un nieto
 * sobrevive a `child.kill()`.
 *
 * **Todos los efectos entran por `deps`.** `npm test` no lanza un `adb`, ni abre un socket, ni
 * toca la red: el ZIP, la subida, el framework y el canal de `/hotswap` son puertos, y sus
 * dobles viven en el test. El único `node:https` de verdad es el que se usa cuando nadie pasa
 * un doble.
 *
 * **Y el puerto 8443 es el de FÁBRICA, no una garantía**: si el del aparato está ocupado, el
 * servidor coge el siguiente libre y el real se ve en la pantalla del framework. Esto se
 * implementa contra 8443 y se anota; leer el puerto real no está implementado.
 */
import { request, type RequestOptions } from "node:https";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import type { Dispositivo } from "../../core/dispositivos.js";
import {
  frameworkEnDispositivo,
  localizadorDeAndroid,
  type DependenciasDeDeteccion,
  type FrameworkEnDispositivo,
} from "./dispositivosEnMaquina.js";
import { lanzarYComprobar, type AbrirSocketHotswap } from "./hotswap.js";
import {
  crearEjecutor,
  TOPE_DE_TRABAJO_MS,
  TOPE_SIN_SALIDA_MS,
  unaLinea,
  type CausaDelCuelgue,
  type FinDeProceso,
  type Lanzar,
} from "./procesosEnMaquina.js";
import { empaquetarProyecto, enMegas, type PaqueteDelProyecto } from "./paqueteDelProyecto.js";

/**
 * Los dos topes son los MISMOS de la instalación, y se reexportan desde aquí para que no haya
 * una segunda copia de los números: son la misma regla —el silencio es el síntoma— sobre el
 * mismo tipo de proceso. Viven con el ejecutor que los arma (`procesosEnMaquina.ts`), que es el
 * que usan los dos módulos.
 */
export { TOPE_DE_TRABAJO_MS, TOPE_SIN_SALIDA_MS };

/**
 * El puerto del servidor del framework. El de fábrica: ver el docstring del módulo.
 *
 * El mismo número para el `adb forward` y para la subida, y no dos constantes: son las dos
 * puntas del MISMO túnel, y escribirlas por separado dejaría un lanzamiento hablando por un
 * agujero y subiendo por otro.
 */
const PUERTO_DEL_SERVIDOR = 8443;

/**
 * El nombre EXACTO del ZIP. La extracción automática se dispara **solo** con este nombre, y con
 * él `appName` pasa a ser obligatorio (sin él: `400`). Se extrae en `app_<appName-en-minúsculas>`.
 */
const NOMBRE_DEL_ZIP = "debug_app_update.zip";

/**
 * La actividad que LEVANTA el servidor del framework. **`.mainEntry` no sirve**: medido, no
 * levanta el servidor, y con él el `/hotswap` no existe y el lanzamiento se queda sin canal.
 */
const ACTIVIDAD_DEL_SERVIDOR = "com.xone.android.hotswap.activities.SetupActivity";

/**
 * Las fases del recorrido, en su orden. El tipo y la lista van juntos a propósito: quien pinte
 * las fases (o el test que las exige en orden) tiene una sola definición que leer.
 */
export type FaseDeLanzamiento =
  | "comprobando"
  | "empaquetando"
  | "subiendo"
  | "reiniciando"
  | "lanzando"
  | "comprobando-arranque";

export const FASES_DE_LANZAMIENTO: readonly FaseDeLanzamiento[] = [
  "comprobando",
  "empaquetando",
  "subiendo",
  "reiniciando",
  "lanzando",
  "comprobando-arranque",
];

/** Cómo acabó. `colgada` es «se quedó callado»: no es un fallo del proyecto ni del aparato. */
export type EstadoDeLanzamiento = "ok" | "fallo" | "cancelada" | "colgada";

/** Lo que hay que lanzar. Tres datos, y los tres son de la MEDIDA, no de una preferencia. */
export interface PeticionDeLanzamiento {
  /**
   * El aparato. Su `id` es el serial de `adb` —el `-s` de cada comando— y su `plataforma`
   * decide si esto puede empezar siquiera.
   */
  dispositivo: Dispositivo;
  /** La raíz del proyecto: de ahí sale el ZIP. */
  raiz: string;
  /**
   * El nombre de la app, el del `app.ini`. Va tal cual en `launchApplication` y escapado en la
   * query de la subida: es el mismo dato en los dos sitios.
   */
  app: string;
}

/**
 * La subida, vista por este módulo. Entra por parámetro porque `npm test` no puede abrir una
 * conexión —ni contra un puerto que quizá no exista— y porque el cuerpo del cuerpo HTTP no es
 * asunto de quien decide las fases.
 */
export interface PeticionDeSubida {
  host: string;
  puerto: number;
  /** La ruta CON su query: `/file_upload?file=…&appName=…`. */
  ruta: string;
  metodo: "POST";
  /** `Content-Length` va aquí dentro: sin ella el servidor contesta `411` y no lee nada. */
  cabeceras: Record<string, string>;
  /** El ZIP entero, en memoria. */
  cuerpo: Uint8Array;
}

export interface RespuestaDeSubida {
  /**
   * El código HTTP, y nada más. **El cuerpo no se lee**: ninguna frase de este módulo lo lleva,
   * porque lo que contesta un servidor puede traer de todo y una línea de log no es un volcado.
   */
  codigo: number;
}

/**
 * Sube el paquete. La `senal` es la cancelación: una subida de 500 MB por un túnel lento es la
 * fase más larga del recorrido, y un «Cancelar» que no corta hasta que acabe no es un cancelar.
 */
export type SubirPaquete = (peticion: PeticionDeSubida, senal?: AbortSignal) => Promise<RespuestaDeSubida>;

export interface DependenciasDeLanzamiento {
  /** De dónde se resuelve el `adb`, como en el resto del módulo de dispositivos. */
  plataforma?: string;
  entorno?: Record<string, string | undefined>;
  home?: string;
  existe?: (ruta: string) => boolean;
  /** Cómo se lanza un proceso. Sin él, `spawn` con `detached: true` (ver `instalacionEnMaquina`). */
  lanzar?: Lanzar;
  /**
   * Matar un GRUPO de procesos. Entra por parámetro porque el real es `process.kill(-pid)`, y
   * un test que lo llamara de verdad mataría el grupo de quien corre `npm test`.
   */
  matarGrupo?: (pid: number, senal: string) => void;
  frameworkEnDispositivo?: (
    dispositivo: Dispositivo,
    deps?: Pick<DependenciasDeDeteccion, "plataforma" | "entorno" | "home" | "existe" | "ejecutar">
  ) => Promise<FrameworkEnDispositivo>;
  empaquetarProyecto?: (raiz: string, tope?: number) => PaqueteDelProyecto;
  subir?: SubirPaquete;
  /**
   * El constructor del socket de `/hotswap` — así se llama en `hotswap.ts`, que es el módulo al
   * que alimenta—. Sin él se usa `ws`, y eso pasa DENTRO de `hotswap.ts`: aquí no se importa ni
   * se abre ningún socket.
   */
  abrirSocket?: AbrirSocketHotswap;
  /** Cada línea que merezca contarse, con la fase a la que pertenece. */
  alFase?: (fase: FaseDeLanzamiento, linea: string) => void;
  ahora?: () => number;
}

export interface ResultadoDeLanzamiento {
  estado: EstadoDeLanzamiento;
  /** La fase en la que acabó: la que falló, o la última si fue bien. */
  fase: FaseDeLanzamiento;
  /** UNA línea. Ausente si acabó bien o si lo canceló alguien. */
  motivo?: string;
  ms: number;
}

export interface LanzamientoEnCurso {
  /** Corta lo que esté en vuelo: el proceso de `adb`, la subida y la espera del canal. */
  cancelar: () => void;
  terminado: Promise<ResultadoDeLanzamiento>;
}

/**
 * Los motivos de la tabla medida (`skills/xone-hotswap/references/conexion-y-despliegue.md` §7),
 * uno por código. **Ninguna frase lleva el cuerpo de la respuesta**, y ninguna dice «error»:
 * cada una dice qué pasó y de quién es el problema.
 */
const MOTIVO_POR_CODIGO: Record<number, string> = {
  400: "el servidor rechazó la subida: falta el nombre de la app o el tamaño no cuadra",
  403: "el servidor rechazó el nombre de la app o la ruta",
  405: "el servidor no acepta POST en esa ruta",
  409: "en el dispositivo hay un directorio donde iba la app",
  411: "el servidor pidió el tamaño del cuerpo y no se lo mandamos",
  413: "el ZIP pasa de 512 MiB",
  500: "el dispositivo no pudo crear el directorio, extraer o mover el fichero",
};

/** El `200` es el único que no es un rechazo. Y un código que no está en la tabla se CUENTA. */
export function motivoDeSubida(codigo: number): string | undefined {
  if (codigo === 200) return undefined;
  return MOTIVO_POR_CODIGO[codigo] ?? `subida rechazada (${codigo})`;
}

/**
 * La ruta de la subida, con la query. `appName` va escapado: un nombre con un espacio, un `&`
 * o un `#` partiría la query y el servidor leería otro nombre —o ninguno— sin decir nada.
 */
export function rutaDeSubida(app: string): string {
  return `/file_upload?file=${NOMBRE_DEL_ZIP}&appName=${encodeURIComponent(app)}`;
}

/**
 * Las cabeceras de la subida. `Content-Length` es obligatoria (sin ella: `411`).
 *
 * Y el `Content-Type` **está medido**, no supuesto: el comando que se midió funcionando la primera
 * vez era un `curl --data-binary`, cuyo `Content-Type` por omisión es
 * `application/x-www-form-urlencoded`, así que durante una pasada esto se declaró sin afirmarse.
 * Ya se subió de verdad con `application/octet-stream` y el servidor contestó `200` **con los bytes
 * enteros** — el `md5` de `LoginColl.xne` y de `app.xml` en el aparato coincide con el del proyecto
 * en disco, y con eso subido la app arranca—, así que el cuerpo no se interpreta como formulario.
 * Es lo correcto para bytes y es lo que vale; la medida entera está en `docs/DECISIONES.md`.
 */
export function cabecerasDeSubida(bytes: Uint8Array): Record<string, string> {
  return {
    "Content-Length": String(bytes.length),
    "Content-Type": "application/octet-stream",
  };
}

/**
 * Las opciones de la petición, en UNA función que se puede mirar sin abrir nada.
 *
 * Existe para que la decisión de TLS y de método sea comprobable: `rejectUnauthorized: false`
 * es el certificado autofirmado del aparato, y el destino es un túnel de `adb` en loopback.
 * Un test que hablara con un servidor de verdad para comprobarlo necesitaría red y un
 * certificado; esto se lee.
 */
export function opcionesDeSubida(peticion: PeticionDeSubida, senal?: AbortSignal): RequestOptions {
  return {
    host: peticion.host,
    port: peticion.puerto,
    path: peticion.ruta,
    method: peticion.metodo,
    headers: peticion.cabeceras,
    timeout: TOPE_DE_TRABAJO_MS,
    signal: senal,
    rejectUnauthorized: false,
  };
}

/** Cómo acabó un proceso. El motivo solo existe donde hay algo que decir. */
type Desenlace = { estado: "ok" } | { estado: "fallo" | "colgada"; motivo: string } | { estado: "cancelada" };

/**
 * El recorrido entero, lanzado. Devuelve el trabajo en curso: se puede cancelar mientras corre.
 *
 * **Nunca lanza.** Todo lo que puede ir mal —no hay `adb`, no hay framework, el paquete no se
 * puede montar, el servidor contesta un código, el proceso se queda callado— vuelve como un
 * `ResultadoDeLanzamiento` con su fase y su línea de motivo: quien llama está atendiendo una
 * petición del navegador y un aparato que no contesta no es una excepción del programa.
 */
export function lanzarEnDispositivo(
  peticion: PeticionDeLanzamiento,
  deps: DependenciasDeLanzamiento = {}
): LanzamientoEnCurso {
  const plataforma = deps.plataforma ?? process.platform;
  const entorno = deps.entorno ?? process.env;
  const home = deps.home ?? homedir();
  const existe = deps.existe ?? existsSync;
  const marco = deps.frameworkEnDispositivo ?? frameworkEnDispositivo;
  const empaquetar = deps.empaquetarProyecto ?? empaquetarProyecto;
  const subir = deps.subir ?? subirReal;
  const ahora = deps.ahora ?? (() => Date.now());
  const t0 = ahora();
  // El ejecutor de procesos es el MISMO de la receta de instalación (`procesosEnMaquina.ts`):
  // los `adb` de aquí necesitan exactamente los topes, el troceado por líneas y el `kill` del
  // grupo que ya estaban escritos allí. `lanzar` y `matarGrupo` siguen siendo puertos de este
  // módulo, y entran por aquí.
  const ejecutor = crearEjecutor({ lanzar: deps.lanzar, matarGrupo: deps.matarGrupo, entorno });

  const decir = (fase: FaseDeLanzamiento, linea: string): void => deps.alFase?.(fase, linea);
  const acabar = (fase: FaseDeLanzamiento, desenlace: Desenlace): ResultadoDeLanzamiento => {
    // El motivo ES una línea que merece contarse: el log de la pestaña acabaría sin decir por
    // qué, y un recorrido que se para en silencio se lee como que se ha colgado.
    const motivo = desenlace.estado === "fallo" || desenlace.estado === "colgada" ? desenlace.motivo : undefined;
    if (motivo !== undefined) decir(fase, motivo);
    return { estado: desenlace.estado, fase, ...(motivo === undefined ? {} : { motivo }), ms: ahora() - t0 };
  };

  let cancelado = false;
  /** La subida en vuelo, para poder abortarla. */
  let abortar: AbortController | undefined;
  /**
   * El aviso de cancelación, y el porqué: `lanzarYComprobar` es dueño de su socket y no acepta
   * una cancelación, así que sin esto un «Cancelar» durante el sondeo esperaría hasta 60 s. Y lo
   * mismo vale para el reintento con que abre el canal —el que espera a que el framework
   * reiniciado escuche—, que se rige por su propio tope.
   * El precio, declarado: el canal se cierra con SU tope, no con el nuestro.
   */
  let avisarCancelacion: (() => void) | undefined;
  const cancelacion = new Promise<void>((cumplir) => {
    avisarCancelacion = cumplir;
  });

  const terminado = (async (): Promise<ResultadoDeLanzamiento> => {
    // ---- 1. comprobando: el túnel, y luego el framework --------------------------------
    const adb = localizadorDeAndroid({ plataforma, entorno, home, existe }).enSdk("adb", "platform-tools");
    if (adb === undefined) {
      return acabar("comprobando", { estado: "fallo", motivo: "no está adb: sin él no se llega al dispositivo" });
    }

    const serial = peticion.dispositivo.id;
    const tunel = await unProceso("comprobando", adb, [
      "-s",
      serial,
      "forward",
      `tcp:${PUERTO_DEL_SERVIDOR}`,
      `tcp:${PUERTO_DEL_SERVIDOR}`,
    ]);
    if (tunel.estado !== "ok") return acabar("comprobando", tunel);
    decir("comprobando", `túnel aplicado: 127.0.0.1:${PUERTO_DEL_SERVIDOR} es el aparato ${serial}`);

    const instalado = await marco(peticion.dispositivo, { plataforma, entorno, home, existe });
    if (!instalado.instalado || instalado.paquete === undefined) {
      // El `detalle` es una línea que ya existe y dice qué se buscó y qué se encontró.
      return acabar("comprobando", { estado: "fallo", motivo: instalado.detalle });
    }
    // El paquete del framework es lo que reinicia, y sale de la MEDIDA de este aparato: los dos
    // flavors tienen nombres distintos y un valor a fuego lanzaría el de otro.
    const delFramework = instalado.paquete;
    decir("comprobando", instalado.detalle);

    // ---- 2. empaquetando ----------------------------------------------------------------
    let paquete: PaqueteDelProyecto;
    try {
      paquete = empaquetar(peticion.raiz);
    } catch (error) {
      return acabar("empaquetando", { estado: "fallo", motivo: unaLineaDeLaSubida(error) });
    }
    if (cancelado) return acabar("empaquetando", { estado: "cancelada" });
    decir("empaquetando", `el paquete son ${enMegas(paquete.total)} en ${paquete.ficheros.length} ficheros`);

    // ---- 3. subiendo --------------------------------------------------------------------
    const bytes = paquete.bytes;
    decir("subiendo", `subiendo ${NOMBRE_DEL_ZIP} (${enMegas(bytes.length)}) a 127.0.0.1:${PUERTO_DEL_SERVIDOR}`);
    abortar = new AbortController();
    let respuesta: RespuestaDeSubida;
    try {
      respuesta = await subir(
        {
          host: "127.0.0.1",
          puerto: PUERTO_DEL_SERVIDOR,
          ruta: rutaDeSubida(peticion.app),
          metodo: "POST",
          cabeceras: cabecerasDeSubida(bytes),
          cuerpo: bytes,
        },
        abortar.signal
      );
    } catch (error) {
      if (cancelado) return acabar("subiendo", { estado: "cancelada" });
      return acabar("subiendo", { estado: "fallo", motivo: unaLineaDeLaSubida(error) });
    } finally {
      abortar = undefined;
    }
    if (cancelado) return acabar("subiendo", { estado: "cancelada" });
    const rechazo = motivoDeSubida(respuesta.codigo);
    if (rechazo !== undefined) return acabar("subiendo", { estado: "fallo", motivo: rechazo });
    decir("subiendo", "el servidor aceptó la subida: los ficheros están en el aparato, sin aplicar");

    // ---- 4. reiniciando: lo único que APLICA lo subido ----------------------------------
    decir("reiniciando", `parando ${delFramework}`);
    const parada = await unProceso("reiniciando", adb, ["-s", serial, "shell", "am", "force-stop", delFramework]);
    if (parada.estado !== "ok") return acabar("reiniciando", parada);

    decir("reiniciando", "arrancando la pantalla del servidor de hotswap, que levanta el canal");
    const arranqueDeLaPantalla = await unProceso("reiniciando", adb, [
      "-s",
      serial,
      "shell",
      "am",
      "start",
      "-n",
      `${delFramework}/${ACTIVIDAD_DEL_SERVIDOR}`,
    ]);
    if (arranqueDeLaPantalla.estado !== "ok") return acabar("reiniciando", arranqueDeLaPantalla);

    // ---- 5 y 6. lanzando, y la LECTURA que decide ---------------------------------------
    decir("lanzando", `lanzando ${peticion.app} por el canal /hotswap`);
    const veredicto = await Promise.race([
      lanzarYComprobar(peticion.app, {
        abrirSocket: deps.abrirSocket,
        // Las líneas del canal se cuelgan de la fase del lanzamiento: son suyas, y el saludo
        // del servidor con su `protocol_version` es parte de lo que hay que poder leer.
        alLinea: (linea) => decir("lanzando", linea),
      }),
      cancelacion.then(() => undefined),
    ]);
    if (veredicto === undefined || cancelado) return acabar("lanzando", { estado: "cancelada" });
    if (!veredicto.viva) {
      // El motivo es la frase LITERAL del framework, sin traducir: es lo único que dice QUÉ
      // pasó, y traducirla perdería justo el dato que hace falta para diagnosticar.
      return acabar("comprobando-arranque", { estado: "fallo", motivo: veredicto.motivo ?? "no arrancó" });
    }
    decir("comprobando-arranque", "la app está viva: el framework contestó su árbol de controles");
    return acabar("comprobando-arranque", { estado: "ok" });
  })();

  /**
   * Un `adb` y su salida en vivo, por el ejecutor COMPARTIDO (`procesosEnMaquina.ts`): los
   * topes, el troceado por líneas y el `kill` del GRUPO son los mismos que los de la receta, y
   * por los mismos motivos. Aquí solo se le dice a qué fase pertenecen sus líneas y se traduce
   * su desenlace; el que esté en vuelo lo cancela el propio ejecutor.
   */
  function unProceso(fase: FaseDeLanzamiento, bin: string, args: string[]): Promise<Desenlace> {
    return ejecutor.correr(bin, args, { alSalirLinea: (linea) => decir(fase, linea) }).then(desenlaceDe);
  }

  return {
    cancelar: () => {
      cancelado = true;
      avisarCancelacion?.();
      abortar?.abort();
      ejecutor.cancelar();
    },
    terminado,
  };
}

/**
 * La subida de verdad, en una petición y sin fichero temporal. El cuerpo NO se lee —solo el
 * código—, y por eso no hay nada que pueda acabar en una frase de log.
 */
const subirReal: SubirPaquete = (peticion, senal) =>
  new Promise<RespuestaDeSubida>((resolver, fallar) => {
    const peticionHttp = request(opcionesDeSubida(peticion, senal), (respuesta) => {
      // Se drena la respuesta para que el socket se cierre: dejarla a medias mantiene la
      // conexión abierta y el servidor esperando.
      respuesta.resume();
      resolver({ codigo: respuesta.statusCode ?? 0 });
    });
    peticionHttp.on("error", fallar);
    peticionHttp.on("timeout", () => {
      peticionHttp.destroy(new Error(`no respondió en ${Math.round(TOPE_DE_TRABAJO_MS / 60_000)} min`));
    });
    peticionHttp.end(peticion.cuerpo);
  });

/**
 * Una línea, con la frase que solo tiene sentido en ESTE canal encima de la genérica.
 *
 * El caso de `ECONNREFUSED` —el servidor vive dentro de la app, y sin app no hay servidor— es
 * la MISMA frase, palabra por palabra, que la de `hotswap.ts`. Y es a propósito: es el mismo
 * hecho, y leerlo de dos formas distintas según en qué fase se descubriera haría pensar que son
 * dos fallos. `hotswap.ts` conserva la suya —su socket no es un proceso y allí se lee entera—
 * y esta envuelve a la del ejecutor (`procesosEnMaquina.ts`) en vez de repetirla, que es como
 * estas dos frases dejaron de ser dos copias que divergen.
 */
function unaLineaDeLaSubida(error: unknown): string {
  const e = error as { code?: unknown } | null;
  if (e !== null && typeof e === "object" && e.code === "ECONNREFUSED") {
    return "no hay nadie escuchando ahí: el servidor vive dentro de la app, y sin app no hay servidor";
  }
  return unaLinea(error);
}

/**
 * La frase de un cuelgue. **No es lo mismo callarse que dar vueltas**: un proceso que no dice
 * nada está esperando a alguien que no está —un prompt, un permiso—, y uno que habla y no
 * acaba está dando vueltas. La causa la devuelve el ejecutor y la frase se escribe aquí, que es
 * de quien es el diagnóstico.
 */
function motivoDelCuelgue(causa: CausaDelCuelgue): string {
  return causa === "silencio"
    ? `no dijo nada en ${Math.round(TOPE_SIN_SALIDA_MS / 60_000)} min`
    : `no terminó en ${Math.round(TOPE_DE_TRABAJO_MS / 60_000)} min`;
}

/** Lo que dijo el ejecutor, en el vocabulario de este recorrido. La fase la pone quien llama. */
function desenlaceDe(fin: FinDeProceso): Desenlace {
  if (fin.estado === "colgada") return { estado: "colgada", motivo: motivoDelCuelgue(fin.cuelgue) };
  return fin;
}
