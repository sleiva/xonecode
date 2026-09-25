/**
 * EL EJECUTOR DE PROCESOS DE LA MÁQUINA: lanzar, contar lo que dice, y saber en qué acabó.
 *
 * Existe por una duplicación MEDIDA y no por una intuición: `instalacionEnMaquina.ts` y
 * `lanzamientoEnMaquina.ts` tenían este mismo ejecutor escrito dos veces —el `kill` del grupo
 * con su caída al hijo, los dos topes, el troceado por líneas y la decisión de qué es
 * «colgada»—, y ya habían empezado a divergir: la frase de `ECONNREFUSED` estaba en una y no
 * en la otra, y el motivo del cuelgue lo distinguía una y la otra no. Un segundo sitio donde
 * se decide CUÁNDO se mata a un proceso es un segundo sitio donde esa decisión puede dejar de
 * estar, y ese es el patrón de fallo de esta casa.
 *
 * **Lo que NO unifica, y es a propósito: las FRASES.** De aquí sale la CAUSA del cuelgue
 * —`silencio` o `total`— y cada módulo escribe la suya, porque no dicen lo mismo: «no dijo
 * nada en N min» es un proceso esperando a alguien que no está, y «no terminó en N min» es uno
 * que habla y da vueltas. Aplanarlas perdería justo el dato que se mira para saber qué pasó.
 * El motivo de un código distinto de cero sí es el mismo en los dos, y vive aquí.
 *
 * **Todos los efectos entran por parámetro.** `npm test` no lanza un proceso: `lanzar` y
 * `matarGrupo` son puertos, y sus valores POR OMISIÓN —los únicos de verdad, y los mismos para
 * los dos módulos— son los que nadie pasa cuando esto corre sobre una máquina.
 */
import { execFileSync, spawn } from "node:child_process";

/**
 * Cuánto se aguanta SIN una sola línea de salida antes de darlo por colgado.
 *
 * No es un tope de duración: `sdkmanager` habla mientras descarga (porcentajes) y `adb`
 * contesta en milisegundos, así que mientras diga algo se le espera lo que haga falta — una
 * descarga de 3 GB por una línea lenta puede tardar media hora, y matarla por ser lenta sería
 * peor que esperarla. Lo que no es normal es el SILENCIO: eso es un prompt esperando a alguien
 * que no está.
 */
export const TOPE_SIN_SALIDA_MS = 5 * 60_000;

/** Y un tope total, para que un proceso que habla sin avanzar no se quede para siempre. */
export const TOPE_DE_TRABAJO_MS = 60 * 60_000;

/** El hijo, visto por este módulo. Entra por parámetro para poder probarlo sin lanzar nada. */
export interface ProcesoHijo {
  stdout: { on: (evento: "data", cb: (dato: unknown) => void) => void };
  stderr: { on: (evento: "data", cb: (dato: unknown) => void) => void };
  stdin: { write: (texto: string) => void; end: () => void };
  on: (evento: "close" | "error", cb: (valor: never) => void) => void;
  kill: (senal?: string) => boolean;
  /**
   * Con `detached` el hijo es LÍDER de su grupo, y su pid es el del grupo. Es lo que
   * permite matar también a los nietos; ausente, se cae a matar solo al hijo.
   */
  pid?: number;
}

export type Lanzar = (
  binario: string,
  args: string[],
  opciones: { env: Record<string, string | undefined> }
) => ProcesoHijo;

/**
 * Por qué se dio por colgado. Se devuelve como CAUSA y no como frase: cada módulo escribe la
 * suya, porque el silencio y las vueltas no son el mismo hecho.
 */
export type CausaDelCuelgue = "silencio" | "total";

/**
 * En qué acabó un proceso.
 *
 * Es una unión discriminada y no un `motivo?` suelto a propósito: un `fallo` SIEMPRE trae su
 * línea —es lo único que hay que enseñar—, y un `colgada` trae su causa pero no su frase, que
 * la pone quien llama. Así el tipo no deja escribir un fallo mudo ni un cuelgue ya redactado.
 */
export type FinDeProceso =
  | { estado: "ok" }
  | { estado: "cancelada" }
  | { estado: "fallo"; motivo: string }
  | { estado: "colgada"; cuelgue: CausaDelCuelgue };

export interface OpcionesDeUnaEjecucion {
  /** El entorno del hijo. Sin él, el del ejecutor. */
  env?: Record<string, string | undefined>;
  /** Lo que se le escribe por `stdin`; sin TTY, un prompt sin respuesta cuelga el proceso. */
  teclear?: readonly string[];
  /** Cuántas veces se repite el tecleo. Las licencias del SDK son una pregunta por licencia. */
  repetir?: number;
  /** Cada línea de salida, ya partida y sin el salto, en cuanto sale. */
  alSalirLinea?: (linea: string) => void;
}

export interface Ejecutor {
  /**
   * Corre un proceso y espera a que acabe. **Uno a la vez**: el que esté en vuelo es al que
   * cancela `cancelar()`, que es como lo usan los dos módulos —una receta encadena procesos,
   * y un lanzamiento también.
   */
  correr: (binario: string, args: string[], opciones?: OpcionesDeUnaEjecucion) => Promise<FinDeProceso>;
  /**
   * Mata al que esté en vuelo, con `SIGTERM`, y lo deja cancelado: lo que se pida después no
   * llega a arrancar. Es pegajoso a propósito — cancelar durante un paso de dos procesos no
   * puede dejar el segundo corriendo.
   */
  cancelar: () => void;
}

export interface DependenciasDeProcesos {
  lanzar?: Lanzar;
  /**
   * Matar un GRUPO de procesos. Entra por parámetro porque el real es `process.kill(-pid)`, y
   * un test que lo llamara de verdad mataría el grupo de quien corre `npm test`.
   */
  matarGrupo?: (pid: number, senal: string) => void;
  /** El entorno del hijo, cuando quien llama no trae el suyo. */
  entorno?: Record<string, string | undefined>;
}

/**
 * Mata un árbol de procesos por PID, en las DOS plataformas. Es la ÚNICA función que decide
 * CUÁNDO y CÓMO se mata un árbol — la comparte `agent/grafo/ejecucionCancelable.ts`.
 *
 * En Windows no hay grupos de proceso POSIX ni `SIGTERM`/`SIGKILL` de verdad: `taskkill /T`
 * recorre el árbol real por PID (no depende de `detached`) y `/F` es el único modo forzoso
 * que hay — no existe un equivalente "amable".
 *
 * `plataforma`/`taskkill` inyectables por lo de siempre: un test en macOS/Linux no puede
 * ejecutar `taskkill` de verdad, pero sí puede comprobar que se construye la invocación
 * correcta.
 */
export function matarGrupoReal(
  pid: number,
  senal: string,
  opciones: { plataforma?: NodeJS.Platform; taskkill?: (args: string[]) => void } = {}
): void {
  const plataforma = opciones.plataforma ?? process.platform;
  if (plataforma === "win32") {
    const taskkill =
      opciones.taskkill ??
      ((args: string[]) => void execFileSync("taskkill", args, { stdio: "ignore", windowsHide: true }));
    taskkill(["/PID", String(pid), "/T", "/F"]);
    return;
  }
  process.kill(-pid, senal as NodeJS.Signals);
}

/** Un ejecutor con los efectos que le pasen. Sin nada, los de verdad. */
export function crearEjecutor(deps: DependenciasDeProcesos = {}): Ejecutor {
  const lanzar = deps.lanzar ?? lanzarReal;
  const matarGrupo = deps.matarGrupo ?? ((pid: number, senal: string) => matarGrupoReal(pid, senal));
  const entorno = deps.entorno ?? process.env;

  let cancelado = false;
  /** El que esté VIVO ahora. Se limpia al cerrarse: matar a un muerto no arregla nada. */
  let matarAlVivo: (() => void) | undefined;

  /**
   * **NO es `async`, y es deliberado.** Devuelve la promesa que resuelve el CIERRE, tal cual:
   * un envoltorio `async` —o un `.then()` de más— mete un tick de microtarea entre el `close`
   * de un proceso y lo que quien llama hace después, y hay un paso de la receta que son dos
   * procesos encadenados, donde ese tick es la diferencia entre seguir en el mismo turno o
   * dejar un hueco.
   */
  const correr = (
    binario: string,
    args: string[],
    opciones: OpcionesDeUnaEjecucion = {}
  ): Promise<FinDeProceso> => {
    // Cancelado antes de arrancar: no se lanza nada, que es lo que se pidió. Un proceso que
    // nace muerto gasta un `spawn` y ensucia el log de la ventana con una línea que no es.
    if (cancelado) return Promise.resolve({ estado: "cancelada" });

    const alSalirLinea = opciones.alSalirLinea;
    const env = opciones.env ?? entorno;
    const teclear = opciones.teclear ?? [];

    return new Promise<FinDeProceso>((resolver) => {
      let hijo: ProcesoHijo;
      try {
        hijo = lanzar(binario, args, { env });
      } catch (error) {
        resolver({ estado: "fallo", motivo: unaLinea(error) });
        return;
      }

      /**
       * Matar el GRUPO y no solo al hijo. Medido: `brew` lanza `curl` y `sdkmanager` lanza
       * `java`, y con `child.kill()` el nieto seguía vivo descargando después de cancelar.
       * Sin pid —los dobles de los tests no lo tienen— se cae a matar al hijo, que es lo que
       * esto hacía siempre.
       */
      const matarArbol = (senal: string): void => {
        const pid = hijo.pid;
        if (pid !== undefined) {
          try {
            matarGrupo(pid, senal);
            return;
          } catch {
            // El grupo ya no está o el sistema no deja: se intenta con el hijo.
          }
        }
        hijo.kill(senal);
      };

      let cuelgue: CausaDelCuelgue | undefined;
      let sinSalida: ReturnType<typeof setTimeout> | undefined;
      const rearmar = (): void => {
        clearTimeout(sinSalida);
        sinSalida = setTimeout(() => {
          cuelgue = "silencio";
          matarArbol("SIGKILL");
        }, TOPE_SIN_SALIDA_MS);
      };
      const total = setTimeout(() => {
        cuelgue = "total";
        matarArbol("SIGKILL");
      }, TOPE_DE_TRABAJO_MS);
      rearmar();

      matarAlVivo = () => matarArbol("SIGTERM");
      if (cancelado) matarAlVivo();

      // Las líneas se parten aquí: un `data` no es una línea —puede traer media o tres—, y
      // emitir trozos dejaría el log cortado por la mitad en la ventana.
      let resto = "";
      let ultima = "";
      const trocear = (dato: unknown): void => {
        rearmar();
        resto += String(dato);
        const partes = resto.split(/\r?\n/);
        resto = partes.pop() ?? "";
        for (const linea of partes) {
          const limpia = linea.trimEnd();
          if (limpia === "") continue;
          ultima = limpia;
          alSalirLinea?.(limpia);
        }
      };
      hijo.stdout.on("data", trocear);
      hijo.stderr.on("data", trocear);

      // Lo que hay que teclear, de una vez: el prompt puede aparecer antes de que nadie mire.
      // El lazo corre al menos una vez aunque no haya nada que teclear: el `stdin` se cierra
      // igual, que es lo que hace un proceso sin entrada.
      for (let i = 0; i < Math.max(1, opciones.repetir ?? 1); i++) {
        for (const t of teclear) hijo.stdin.write(t);
      }
      hijo.stdin.end();

      hijo.on("error", ((error: Error) => {
        clearTimeout(sinSalida);
        clearTimeout(total);
        matarAlVivo = undefined;
        resolver({ estado: "fallo", motivo: unaLinea(error) });
      }) as never);
      hijo.on("close", ((codigo: number | null) => {
        clearTimeout(sinSalida);
        clearTimeout(total);
        matarAlVivo = undefined;
        // El cuelgue manda sobre el código: a un proceso al que se le mandó SIGKILL se le
        // ocurre salir con cualquier cosa, y eso no es lo que pasó.
        if (cuelgue !== undefined) {
          resolver({ estado: "colgada", cuelgue });
          return;
        }
        if (cancelado) {
          resolver({ estado: "cancelada" });
          return;
        }
        if (codigo === 0) {
          resolver({ estado: "ok" });
          return;
        }
        resolver({ estado: "fallo", motivo: motivoDelCodigo(codigo, ultima) });
      }) as never);
    });
  };

  return {
    correr,
    cancelar: () => {
      cancelado = true;
      matarAlVivo?.();
    },
  };
}

/**
 * Una línea, nunca la salida entera ni una traza con rutas.
 *
 * Es la de un proceso: `ENOENT` tiene frase propia porque «el ejecutable no existe» es lo que
 * hay que leer, y el resto se corta en la primera línea. Un canal de RED pone su caso encima y
 * cae aquí para lo demás (`lanzamientoEnMaquina.ts`), que es como se evita tener dos copias
 * que ya divergieron una vez.
 */
export function unaLinea(error: unknown): string {
  const e = error as { code?: unknown; message?: unknown } | null;
  if (e !== null && typeof e === "object" && e.code === "ENOENT") return "el ejecutable no existe";
  const mensaje = e !== null && typeof e === "object" && typeof e.message === "string" ? e.message : String(error);
  return mensaje.split(/\r?\n/)[0]!.slice(0, 160);
}

/**
 * El motivo de un código distinto de cero. La última línea si dijo algo, y si no el código
 * — que es todo lo que hay.
 */
export function motivoDelCodigo(codigo: number | null, ultima: string): string {
  return ultima === "" ? `terminó con código ${codigo}` : ultima;
}

/**
 * `sdkmanager`/`avdmanager` son `.bat` en Windows (`localizadorDeAndroid` ya lo sabe, ver
 * `extensionDeBinario`), y desde que Node cerró el CVE-2024-27980 —la inyección de comandos
 * por `.bat`/`.cmd`— un `spawn` a secas sobre uno de estos revienta con `spawn EINVAL` en
 * vez de arrancar: medido en la máquina del usuario, «No salió bien: spawn EINVAL» al pulsar
 * el paso 4 de la receta de Windows. La forma sancionada por Node de arreglarlo es `shell:
 * true`, y aquí es seguro dárselo —a diferencia del caso general que el CVE cerraba—: los
 * `args` de estos dos binarios NUNCA llevan nada que no sea un literal de nuestra propia
 * tabla (`PASOS_EJECUTABLES`), nunca una cadena que haya escrito un usuario.
 */
export function necesitaShell(binario: string, plataforma: string = process.platform): boolean {
  return plataforma === "win32" && /\.(bat|cmd)$/i.test(binario);
}

/**
 * El hijo de verdad. Dos decisiones, las dos medidas:
 *
 * - **`detached: true`**, para que sea líder de su grupo y `kill(-pid)` se lleve también a
 *   los nietos: sin ello, cancelar dejaba el `curl` de `brew` descargando.
 * - **`stdio[0]` sigue siendo un `pipe`**, porque `sdkmanager` necesita que se le teclee.
 *   Lo que hace que un `sudo` de dentro no cuelgue no es cerrar `stdin`: es no tener
 *   terminal de CONTROL, que es de donde `sudo` lee la contraseña — y con `detached` no lo
 *   tiene ni por herencia.
 * - **`shell: true` SOLO para `.bat`/`.cmd`** (`necesitaShell`, arriba): para `adb`/`emulator`
 *   y para `brew` —los binarios que lanza el resto de este módulo, incluido el lanzamiento en
 *   el dispositivo— nada cambia, exactamente el mismo `spawn` de siempre.
 *
 * Es el valor POR OMISIÓN de `crearEjecutor`, y el único `spawn` de los dos módulos: la receta
 * de instalación y el `adb` del lanzamiento necesitan exactamente estas dos cosas por los
 * mismos motivos, y un segundo `spawn` sería un segundo sitio donde el `detached` puede dejar
 * de estar —y ese día el `kill(-pid)` de un sitio mataría a un grupo que no existe—.
 */
export const lanzarReal: Lanzar = (binario, args, opciones) =>
  spawn(binario, args, {
    env: opciones.env,
    stdio: ["pipe", "pipe", "pipe"],
    detached: true,
    ...(necesitaShell(binario) ? { shell: true } : {}),
  }) as unknown as ProcesoHijo;
