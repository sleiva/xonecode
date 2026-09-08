/**
 * La cola de tareas en disco: `~/.xonecode/tareas/`.
 *
 * **De la MÁQUINA, no de un proyecto**, y esa es la decisión de este fichero. El kanban es
 * global y no puede depender de tener descargados los dieciocho proyectos del entorno: con
 * la cola dentro de cada uno, listar las tareas obligaría a abrirlos todos. Es el mismo
 * reparto que ya existe entre `settings.json` y el `config.json` de proyecto.
 *
 * Los ADJUNTOS también van aquí y no en el proyecto: una tarea puede crearse para uno que
 * no se ha abierto nunca, y guardar ahí un adjunto sería estrenarle el `.xonecode/` por la
 * puerta de atrás. Fuera del proyecto se gana además gratis lo que importaba — no entran en
 * git y no suben a CloudStudio — sin depender de ninguna exclusión.
 */
import { chmodSync, existsSync, linkSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { conFeedback, type Tarea } from "../core/tareas.js";

/** Bytes que se aceptan por adjunto y por tarea. */
export const TOPE_DE_ADJUNTO = 20_000_000;
export const TOPE_DE_ADJUNTOS_POR_TAREA = 50_000_000;

/** Un nombre de adjunto: un segmento llano y nada más. La misma lista BLANCA de forma que
 *  `esRutaDeArtefacto`, y por lo mismo — de ella depende que esto no escriba fuera. */
const SEGMENTO = /^[A-Za-z0-9._-]+$/;
const nombreAceptable = (n: string): boolean => SEGMENTO.test(n) && n !== "." && n !== "..";

export interface ResultadoDeAdjunto {
  ok: boolean;
  /** Una frase, sin ninguna ruta de la máquina. */
  motivo?: string;
}

export interface TareasEnDisco {
  listar(): Tarea[];
  guardar(tareas: readonly Tarea[]): void;
  /** Concede el cerrojo, o dice de quién es. Ver `tomarCerrojo` abajo. */
  tomarCerrojo(): { tomado: true } | { tomado: false; dePid: number };
  /**
   * ¿El cerrojo en disco sigue siendo NUESTRO? Hay que preguntarlo antes de cada cosa
   * consecuente —despachar una tarea—, no solo al tomarlo: `tomarCerrojo` no puede
   * garantizar por sí solo que no haya dos dueños (ver su comentario), y esto es lo que
   * hace que el que perdió se entere ANTES de arrancar nada.
   */
  sigoSiendoDueño(): boolean;
  soltarCerrojo(): void;
  guardarAdjunto(tarea: string, nombre: string, datos: Buffer): ResultadoDeAdjunto;
  /** La carpeta REAL de los adjuntos de una tarea, para montarla en el backend. Se queda
   *  en el host: es una ruta de la máquina. */
  carpetaDeAdjuntos(tarea: string): string;
  borrarTarea(id: string): void;
}

export function crearTareasEnDisco(opciones: {
  /** La base (`~/.xonecode` por omisión). Entra por parámetro para probar sin tocar el home. */
  base?: string;
  pid?: number;
  /** ¿Vive ese proceso? Por omisión, `process.kill(pid, 0)`. */
  vivo?: (pid: number) => boolean;
  informar?: (texto: string) => void;
  topeDeAdjunto?: number;
  topePorTarea?: number;
  /**
   * Cómo se APARTA un cerrojo caduco al recogerlo. Por omisión, `renameSync` de verdad.
   * Entra por parámetro por lo mismo que `vivo`: un test necesita poder provocar que OTRO
   * proceso gane esa carrera (el `rename` lanzando `ENOENT`), y eso no se puede pedir de
   * verdad sin dos procesos reales.
   */
  renombrar?: (origen: string, destino: string) => void;
  /**
   * Cómo se RESTITUYE un cerrojo VIVO que se apartó por error (ver `tomarCerrojo`). Por
   * omisión, `linkSync` de verdad. Entra por el mismo motivo que `renombrar`: un test
   * necesita poder intercalar la recogida COMPLETA de otro proceso en medio de la propia, y
   * eso no se puede pedir de verdad sin dos procesos reales.
   */
  enlazar?: (existente: string, nuevo: string) => void;
  /**
   * Cómo se BORRA la cuarentena al final de la recogida. Por omisión, `rmSync` de verdad.
   * Entra por el mismo motivo que `renombrar` y `enlazar`: es el único punto desde el que se
   * puede provocar el orden en que la cuarentena COMPARTIDA se llevaba por delante un
   * cerrojo vivo (ver `tomarCerrojo`), y ese orden no se puede pedir de verdad sin dos
   * procesos reales.
   */
  borrar?: (ruta: string) => void;
}): TareasEnDisco {
  const base = join(opciones.base ?? join(homedir(), ".xonecode"), "tareas");
  const pid = opciones.pid ?? process.pid;
  const vivo = opciones.vivo ?? estaVivo;
  const informar = opciones.informar ?? (() => {});
  const topeDeAdjunto = opciones.topeDeAdjunto ?? TOPE_DE_ADJUNTO;
  const topePorTarea = opciones.topePorTarea ?? TOPE_DE_ADJUNTOS_POR_TAREA;
  const renombrar = opciones.renombrar ?? renameSync;
  const enlazar = opciones.enlazar ?? linkSync;
  const borrar = opciones.borrar ?? ((ruta: string) => rmSync(ruta, { force: true }));
  const indice = join(base, "indice.json");
  const cerrojo = join(base, "corredor.lock");

  const carpetaDeAdjuntos = (tarea: string): string => join(base, tarea, "adjuntos");

  /**
   * **El índice lleva el ENCARGO entero del usuario**, así que la carpeta y el fichero van a
   * 0600/0700: la misma regla que ya sigue `checkpoint.sqlite`, y por el mismo motivo — es
   * contenido de una persona, no un dato de sistema.
   */
  function guardarIndice(tareas: readonly Tarea[]): void {
    // El `mode` de estas dos llamadas solo se aplica al CREAR: si la carpeta o el índice ya
    // existían con permisos más flojos —los dejó una versión anterior, o un `umask` raro—,
    // seguirían flojos para siempre. Es la lección de `checkpoint.sqlite`, y aquí importa
    // por lo mismo: el índice lleva el encargo que escribió una persona. El `chmod` es
    // aparte y no falla el guardado si no se puede aplicar (un sistema de ficheros sin
    // permisos POSIX): el aviso sería inútil y la escritura sí valió.
    mkdirSync(base, { recursive: true, mode: 0o700 });
    asegurarModo(base, 0o700);
    writeFileSync(indice, `${JSON.stringify(tareas, null, 1)}\n`, { encoding: "utf8", mode: 0o600 });
    asegurarModo(indice, 0o600);
  }

  /**
   * Lee el índice y dice además si se PUDO leer — pero NO avisa por su cuenta: quien la
   * llama sabe qué está haciendo (enseñar la cola, o borrar una tarea) y es quien tiene que
   * elegir las palabras. Avisar aquí dentro con un solo mensaje fijo fue el propio error que
   * esto corrige: `borrarTarea` heredaba el «la cola se enseña vacía» de `listar()`, que
   * describe la situación de otro sitio — un aviso que manda a mirar donde no está el
   * problema es peor que ninguno.
   *
   * Un índice sintácticamente válido pero que no es una lista (`{}`, por ejemplo) es tan
   * ilegible como uno con JSON roto: las dos formas de «esto no es la cola» devuelven vacío
   * y ninguna se sobrescribe sola.
   */
  function leerIndice(): { tareas: Tarea[]; legible: boolean } {
    if (!existsSync(indice)) return { tareas: [], legible: true };
    try {
      const leido = JSON.parse(readFileSync(indice, "utf8")) as unknown;
      if (!Array.isArray(leido)) return { tareas: [], legible: false };
      return { tareas: leido as Tarea[], legible: true };
    } catch {
      // No se sobrescribe: perder la cola de alguien por no saber leerla sería peor que
      // no enseñarla. Misma postura que una línea corrupta del `.jsonl` de una sesión.
      return { tareas: [], legible: false };
    }
  }

  /**
   * Quién aparece en un fichero de cerrojo, si se puede leer y trae un pid. Por omisión, el
   * cerrojo vigente; tras una recogida hace falta leer el `.caduco` en su lugar en vez del
   * `cerrojo` (que puede que ni exista todavía) — es la única lectura AUTORITATIVA de qué
   * era lo que se apartó, porque en cuanto el `rename` tiene éxito ese inodo es nuestro y
   * nadie más puede tocarlo.
   */
  function asegurarModo(ruta: string, modo: number): void {
    try {
      chmodSync(ruta, modo);
    } catch {
      // Ver el comentario de `guardar`.
    }
  }

  function leerDueño(ruta: string = cerrojo): { pid: number } | undefined {
    try {
      const dueño = JSON.parse(readFileSync(ruta, "utf8")) as { pid?: unknown };
      return typeof dueño.pid === "number" ? { pid: dueño.pid } : undefined;
    } catch {
      return undefined;
    }
  }

  function intentar(): boolean {
    try {
      writeFileSync(cerrojo, `${JSON.stringify({ pid, desde: new Date().toISOString() })}\n`, {
        encoding: "utf8",
        mode: 0o600,
        flag: "wx",
      });
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
      throw error;
    }
  }

  function confirmar(): { tomado: true } | { tomado: false; dePid: number } {
    const dueño = leerDueño();
    if (dueño?.pid === pid) return { tomado: true };
    // Alguien escribió encima entre nuestro `wx` y esta relectura: perdimos la carrera.
    // -1 nunca es un pid real: es lo que se devuelve si ni siquiera el ganador se puede
    // leer, que no debería pasar en la práctica pero no es motivo para lanzar — fallar
    // aquí bloquearía al llamante sin decir por qué.
    return { tomado: false, dePid: dueño?.pid ?? -1 };
  }

  /**
   * Recoge un cerrojo que la FOTO de `tomarCerrojo` dio por caduco: lo aparta, comprueba
   * con autoridad qué era, y lo restituye si resultó estar vivo.
   *
   * **La recogida de un cerrojo MUERTO usa `renameSync` para apartarlo, y una relectura
   * de confirmación tras cada `wx` ganado — pero esas dos piezas, SOLAS, no bastan.** Un
   * commit anterior de este mismo fichero afirmó que sí bastaban («cierra las dos
   * direcciones de la carrera»), y no era cierto — quedó sin medir, y se midió después con
   * un script que reproduce el orden que sigue: A y B ven los dos al mismo dueño muerto; A
   * recoge, gana su `wx` y CONFIRMA (`{tomado:true}`); SOLO ENTONCES B, que ya había
   * decidido apartar el cerrojo que vio muerto, ejecuta su `renameSync` — y ese `rename`
   * tiene éxito igual, porque `rename` arbitra QUIÉN aparta un inodo dado, no si ESE
   * inodo se podía apartar. B se lleva por delante el cerrojo VIVO de A, hace su propio
   * `wx` sobre la ruta que él mismo dejó libre, relee, confirma con su propio pid — y los
   * dos procesos terminan con `{tomado:true}`. Medido con un script de dos instancias
   * (`vivo` de B disparando la recogida completa de A a mitad de su propia decisión):
   * `deA` y `deB` salían los dos `{tomado:true}`.
   *
   * **Lo que de verdad falta es comprobar DESPUÉS del `rename`, no solo antes.** Antes del
   * `rename` solo se puede leer una FOTO (`dueño`, más abajo) que puede quedarse vieja en
   * el instante que tarda el propio `rename` en correr. Tras un `rename` con éxito, en
   * cambio, se tiene acceso EXCLUSIVO al inodo que se acaba de apartar — nadie más puede
   * ya estar escribiéndolo — así que ES el único momento en que leerlo vale con autoridad:
   * - Si el `.caduco` nombra un pid VIVO que no es el nuestro, apartamos un cerrojo que no
   *   estaba muerto de verdad, y hay que DEVOLVERLO. `linkSync(caduco, cerrojo)` crea un
   *   segundo nombre para el MISMO inodo del `.caduco` en la ruta del cerrojo: si esa ruta
   *   sigue libre (nadie más ha escrito ahí desde que la dejamos vacía con el `rename`),
   *   tiene éxito y el cerrojo vivo queda restituido tal cual estaba. Si un TERCERO ya
   *   escribió un cerrojo nuevo en esa ruta mientras tanto, `link` falla con `EEXIST` —esa
   *   es una carrera de orden superior, exige un tercer proceso en el mismo instante— y
   *   entonces no se restituye nada (machacar el cerrojo del tercero sería la misma pérdida
   *   que se intenta evitar): se dice el dueño que haya. El `.caduco` se borra al final de
   *   las dos ramas.
   * - Si el `.caduco` nombra un pid muerto, el nuestro, o es ilegible, la recogida era
   *   legítima y sigue el camino de siempre: `wx` sobre la ruta que quedó libre, y
   *   relectura de confirmación.
   *
   * **Y queda un residuo que esta capa NO puede cerrar, dicho aquí en vez de prometido de
   * más.** Decidir «el dueño está muerto» es una observación de un INSTANTE, y con
   * primitivas de sistema de ficheros no hay forma de actuar sobre ella atómicamente: no
   * existe un «renombra solo si sigue siendo este inodo». Así que toda recogida de un
   * cerrojo caduco puede apartar uno que revivió entre la observación y el `rename`. La
   * restitución con `link` cubre ese caso salvo cuando un TERCER proceso ocupó la ruta en
   * el hueco — entonces `link` falla con `EEXIST`, no se restituye (machacar al tercero
   * sería la misma pérdida) y el dueño apartado se queda creyéndose dueño mientras el
   * tercero también lo es. Un `flock` del núcleo no tendría este problema —el sistema lo
   * suelta al morir el proceso, así que no hay cerrojo caduco que recoger— pero Node no lo
   * expone sin un módulo nativo.
   *
   * Lo que hace verdad «un solo corredor» no es entonces esta función sola: es
   * `sigoSiendoDueño`, que el corredor pregunta antes de cada cosa consecuente. Todo lo de
   * arriba estrecha la ventana; la comprobación del dueño es la que hace que el perdedor se
   * entere antes de arrancar una tarea.
   */
  function recoger(): { tomado: true } | { tomado: false; dePid: number } {
    // Dueño soy yo según esta FOTO, está muerto, o el fichero es ilegible: se aparta para
    // poder comprobar con autoridad qué era, después — esa foto puede haberse quedado
    // vieja mientras el `rename` corría (ver el comentario de esta función).
    // La cuarentena lleva el PID, y eso NO es cosmético: con un nombre compartido
    // (`.caduco` a secas) la propia limpieza de más abajo se llevaba por delante el
    // cerrojo vivo de otro. Medido: A recoge —`rename` a la cuarentena, `wx`, confirma— y,
    // en el hueco entre su confirmación y su limpieza, el `rename` de B mete el cerrojo
    // VIVO de A en esa misma ruta compartida (POSIX `rename` reemplaza el destino sin
    // chistar); el `rmSync` de A borra entonces su PROPIO cerrojo creyendo borrar el
    // muerto de antes, y B —que ya no encuentra nada que leer ahí— se cree la recogida
    // legítima. A decía `{tomado:true}` sin fichero en disco y B se lo llevaba: dos
    // dueños. Con la ruta por proceso, el `rename` de B solo puede aterrizar en la
    // cuarentena de B, donde la lectura autoritativa de abajo ve a A vivo y lo restituye.
    const caduco = `${cerrojo}.caduco-${pid}`;
    try {
      renombrar(cerrojo, caduco);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      // Otro proceso ya apartó el mismo cerrojo: nos ganó la recogida. Puede que ya tenga
      // el suyo escrito, o que lo esté escribiendo en este instante — un solo reintento
      // del `wx` y, si sigue ocupado, se dice de quién es.
      if (intentar()) return confirmar();
      const otro = leerDueño();
      return { tomado: false, dePid: otro?.pid ?? -1 };
    }

    // El `rename` tuvo éxito: el inodo apartado es EXCLUSIVAMENTE nuestro ya, así que esta
    // lectura sí vale con autoridad — al contrario que la de `dueño`, de antes del rename.
    const apartado = leerDueño(caduco);
    if (apartado && apartado.pid !== pid && vivo(apartado.pid)) {
      // Nos llevamos por delante un cerrojo VIVO: hay que devolverlo. `link` falla con
      // `EEXIST` si un TERCERO ya escribió un cerrojo nuevo en esa ruta mientras tanto, y
      // ahí NO se restituye nada: machacar el del tercero sería la misma pérdida que se
      // intenta evitar. Y esa rama es el residuo que no se puede cerrar aquí — el dueño
      // que apartamos sigue creyéndose dueño y el tercero también lo es. Se dice el dueño
      // que haya, y lo que hace que el perdedor se entere es `sigoSiendoDueño`.
      try {
        enlazar(caduco, cerrojo);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        const tercero = leerDueño();
        borrar(caduco);
        return { tomado: false, dePid: tercero?.pid ?? -1 };
      }
      borrar(caduco);
      return { tomado: false, dePid: apartado.pid };
    }

    // El `.caduco` nombraba un cerrojo muerto de verdad, el nuestro, o era ilegible: la
    // recogida es legítima. La ruta quedó libre con el `rename` de arriba. Si alguien crea
    // un cerrojo nuevo en el hueco minúsculo entre eso y nuestro `wx` de abajo (un tercer
    // proceso arrancando desde cero, sin dueño previo que recoger), nuestro propio `wx` lo
    // ve como cualquier otro «ya hay uno» y no hace falta un caso especial.
    const resultado = intentar() ? confirmar() : { tomado: false as const, dePid: leerDueño()?.pid ?? -1 };
    // Basura de un cuelgue ajeno: se borra tras resolver, y si el borrado falla da igual —
    // nadie vuelve a mirar esa ruta. Un proceso que muera entre el `rename` y esta línea
    // deja su `.caduco-<pid>` ahí para siempre: es un fichero de basura y no un cerrojo,
    // porque `tomarCerrojo` solo mira `corredor.lock` — que ese `rename` dejó libre.
    borrar(caduco);
    return resultado;
  }

  return {
    listar() {
      const { tareas, legible } = leerIndice();
      if (!legible) informar("el índice de tareas no se pudo leer; la cola se enseña vacía");
      return tareas;
    },
    guardar(tareas) {
      guardarIndice(tareas);
    },
    /**
     * **Un solo corredor por máquina.** Dos consolas abiertas serían dos ejecutores sobre la
     * misma cola, y con ellos dos turnos del mismo proyecto a la vez — que es exactamente lo
     * que el cerrojo por proyecto existe para evitar.
     *
     * La toma tiene dos caminos, y solo el primero es atómico de verdad: `wx` cuando no hay
     * cerrojo, y `recoger()` cuando hay uno cuyo dueño parece muerto. El segundo NO se puede
     * hacer atómico con primitivas de ficheros y deja un residuo declarado —está escrito en
     * `recoger`, con el orden exacto—, así que «un solo corredor» no lo sostiene esta función
     * sola: lo sostiene `sigoSiendoDueño`, que el corredor pregunta antes de cada cosa
     * consecuente.
     *
     * **La toma directa es atómica**: `flag: "wx"` crea el fichero solo si no existe, y falla
     * con `EEXIST` si ya está — comprobar con `existsSync` y escribir después, como antes,
     * deja una ventana entre las dos llamadas donde dos procesos que arrancan a la vez pueden
     * leer los dos «no hay cerrojo» y escribir los dos.
     */
    tomarCerrojo() {
      mkdirSync(base, { recursive: true, mode: 0o700 });
      asegurarModo(base, 0o700);

      if (intentar()) return confirmar();

      const dueño = leerDueño();
      if (dueño && dueño.pid !== pid && vivo(dueño.pid)) {
        return { tomado: false, dePid: dueño.pid };
      }
      return recoger();
    },

    sigoSiendoDueño() {
      return leerDueño()?.pid === pid;
    },
    soltarCerrojo() {
      // Solo el propio: soltar el de otro dejaría dos corredores.
      const dueño = leerDueño();
      if (dueño && dueño.pid === pid) rmSync(cerrojo, { force: true });
    },
    guardarAdjunto(tarea, nombre, datos) {
      if (!nombreAceptable(tarea) || !nombreAceptable(nombre)) {
        return { ok: false, motivo: "ese nombre no vale para un adjunto" };
      }
      if (datos.length > topeDeAdjunto) {
        return { ok: false, motivo: `el fichero es demasiado grande (tope ${Math.round(topeDeAdjunto / 1_000_000)} MB)` };
      }
      const carpeta = carpetaDeAdjuntos(tarea);
      mkdirSync(carpeta, { recursive: true, mode: 0o700 });
      const ya = readdirSync(carpeta).reduce((suma, f) => suma + statSync(join(carpeta, f)).size, 0);
      if (ya + datos.length > topePorTarea) {
        return { ok: false, motivo: `esta tarea ya no admite más adjuntos (tope ${Math.round(topePorTarea / 1_000_000)} MB)` };
      }
      // Un adjunto es un documento de la persona, no un dato de sistema: mismo 0600 que el
      // índice.
      writeFileSync(join(carpeta, nombre), datos, { mode: 0o600 });
      return { ok: true };
    },
    carpetaDeAdjuntos,
    borrarTarea(id) {
      if (nombreAceptable(id)) rmSync(join(base, id), { recursive: true, force: true });
      const { tareas, legible } = leerIndice();
      if (!legible) {
        // Un índice que no se pudo leer no se toca: sobrescribirlo con una lista vacía sería
        // la misma pérdida de datos que la lectura ya evita en `listar()` — sólo que por la
        // puerta de atrás. Y el aviso es el suyo propio, no el de `leerIndice`: ahí no se
        // está enseñando una cola vacía, se está BORRANDO algo y dejando el índice intacto —
        // un aviso que describe la situación equivocada manda a mirar donde no está.
        informar("la tarea se borró del disco, pero el índice no se pudo leer y se deja intacto");
        return;
      }
      guardarIndice(tareas.filter((t) => t.id !== id));
    },
  };
}

export interface ResultadoDeFeedback {
  hecho: boolean;
  /** Por qué no, si `hecho` es falso. Una frase para enseñar, nunca una excepción cruda. */
  motivo?: string;
}

/**
 * Añade un feedback a una tarea «esperando feedback» y la devuelve al lazo (`nuevo`).
 *
 * §0 del diseño, textual: «se edita la tarea y se agrega el feedback del usuario». Esto es
 * exactamente eso — y nada más: no toca el proyecto, no abre ninguna consola, solo escribe
 * el índice. Quien lo recoge es el corredor, en su siguiente `revisar()`.
 *
 * Solo toma `listar`/`guardar` del puerto, no la interfaz entera: es lo mínimo que hace
 * falta, y es lo que ya usa `atenderCrearTarea`/`atenderAccionDeTarea` en `arranque.ts`
 * (`Pick<TareasEnDisco, "listar" | "guardar" | "borrarTarea">`) — con esto, `aplicarFeedback`
 * encaja ahí sin ensanchar ese tipo.
 *
 * **El rechazo se DEVUELVE, nunca se lanza.** Es la misma regla que `write_file`
 * (`agent/proyecto.ts`): quien llama —el cable, o un test— necesita poder decir por qué sin
 * envolver esto en un `try`, y un `{hecho:false}` es más fácil de propagar hasta una persona
 * que una excepción.
 *
 * **Dos motivos de rechazo, y los dos pasan por `conFeedback`/`conEstado` sin duplicar la
 * lógica aquí**: un feedback en blanco —devolvería la tarea al lazo sin nada nuevo que
 * decirle, el mismo argumento que rechaza un título vacío en `sesiones.ts#renombrarSesion`—
 * y una tarea que no está `requiere-atencion` —no hay pregunta que este feedback esté
 * contestando—. `conEstado` ya sabe decir la segunda (`«nuevo» no puede pasar a «nuevo»`,
 * etc.); repetir esa comprobación aquí sería la misma regla en dos sitios que divergen.
 */
export function aplicarFeedback(
  disco: Pick<TareasEnDisco, "listar" | "guardar">,
  id: string,
  texto: string
): ResultadoDeFeedback {
  const tareas = disco.listar();
  const actual = tareas.find((t) => t.id === id);
  if (actual === undefined) {
    return { hecho: false, motivo: "la tarea ya no está en la cola" };
  }
  let siguiente: Tarea;
  try {
    siguiente = conFeedback(actual, texto);
  } catch (error) {
    return { hecho: false, motivo: error instanceof Error ? error.message : String(error) };
  }
  disco.guardar(tareas.map((t) => (t.id === id ? siguiente : t)));
  return { hecho: true };
}

/** `kill(pid, 0)` no manda ninguna señal: solo pregunta si el proceso existe. */
function estaVivo(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
