/**
 * El corredor: coge tareas de la cola, las corre y escribe sus transiciones.
 *
 * **Un solo corredor por máquina**, con cerrojo de pid: dos consolas abiertas serían dos
 * ejecutores sobre la misma cola, y con ellos dos turnos del mismo proyecto a la vez. El
 * segundo proceso sirve el dashboard y NO ejecuta, y lo dice (`corriendoAqui()`): un kanban
 * que se ve igual en dos ventanas pero solo avanza en una tiene que decir en cuál.
 *
 * **Y el cerrojo solo no basta.** Su recogida cuando el dueño parece muerto no se puede
 * hacer atómica con primitivas de sistema de ficheros —«está muerto» es la observación de
 * un instante— y deja un residuo declarado en `agent/tareasEnDisco.ts#recoger` en el que
 * dos procesos pueden creerse dueños. Lo que hace verdad «un solo corredor» son las DOS
 * comprobaciones de aquí, y hacen falta las dos:
 *  - `sigoSiendoDueño()` **antes de despachar cada tarea**, no solo al arrancar: es lo que
 *    hace que el que perdió el cerrojo se entere ANTES de abrir una consola.
 *  - y la ESCRITURA final condicionada a que la tarea siga siendo la nuestra (ver
 *    `escribirSiSigueSiendoNuestra`): la comprobación del despacho no cubre el momento de
 *    escribir el resultado, que llega minutos después.
 *
 * La política de QUÉ arranca no está aquí: es `core/tareas.ts#siguientesAEjecutar`, pura y
 * con sus tests. Aquí está el lazo, que es lo que no se puede probar sin dobles.
 */
import { conEstado, siguientesAEjecutar, type Tarea } from "../../core/tareas.js";
import { crearConsolaDeTarea } from "./consolaDeTarea.js";
import type { ConsolaDeProyecto } from "./vestibulo.js";
import type { TareasEnDisco } from "../../agent/tareasEnDisco.js";

/**
 * Lo que le pasa a una tarea cuya consola se cierra debajo: al parar el proceso, y al
 * encontrarla «en proceso» sin nadie detrás en el arranque siguiente.
 *
 * Es UN texto y no dos porque es UNA situación —el turno se cortó a mitad y no hay
 * resultado— y dos redacciones para lo mismo se leerían como dos problemas distintos. Lo
 * que dice sale de lo MEDIDO: `volcar()` corre en el `finally` del turno, así que un corte
 * a mitad no deja transcript ni entrada en el índice de sesiones, mientras el hilo del
 * checkpointer sí queda escrito — o sea que el agente recuerda una conversación que no se
 * puede leer. Decirlo es lo que hace la tarjeta accionable: reintentar no repite un trabajo
 * ya hecho a medias, lo continúa.
 */
export const MOTIVO_CORTADA_POR_CIERRE =
  "la consola se cerró a mitad del turno: no quedó respuesta guardada, aunque el agente " +
  "recuerda el hilo. Reintenta cuando quieras.";

/**
 * Lo que se espera como mucho a que un turno cortado devuelva, al parar el proceso.
 *
 * Generoso pero FINITO: un Ctrl-C que se cuelga para siempre es lo peor que puede hacer este
 * camino, y el repo ya trata esta clase con tope (el `TOPE_MS` de Codex, los `TOPES_MS` de
 * los dispositivos). Al agotarse no se miente diciendo que se paró: la tarea se queda «en
 * proceso» y la reconciliación del siguiente arranque la aparca, que es justo para lo que
 * existe.
 */
export const TOPE_DE_PARADA_MS = 30_000;

/** El mismo motivo, diciendo qué proceso la tenía. Ver `MOTIVO_CORTADA_POR_CIERRE`. */
const motivoDeReconciliacion = (pid: number | undefined): string =>
  pid === undefined ? MOTIVO_CORTADA_POR_CIERRE : `${MOTIVO_CORTADA_POR_CIERRE} (era el pid ${pid})`;

/** Lo que el corredor necesita de una consola de proyecto abierta para una tarea. */
export interface ConsolaParaTarea {
  raiz: string;
  idDeHilo: string;
  /** Corre el encargo. `aparcar` es lo que la consola de tarea llama al toparse con algo
   *  que necesita a una persona. */
  correrTarea(encargo: string, aparcar: (motivo: string) => void): Promise<void>;
  cerrar(): Promise<void>;
}

export interface Corredor {
  arrancar(): Promise<void>;
  /** Corta lo que esté en vuelo —un turno tarda minutos— y suelta el cerrojo si es nuestro. */
  parar(): Promise<void>;
  /** ¿Ejecuta ESTE proceso? Falso si el cerrojo lo tiene otro, o si lo hemos perdido. */
  corriendoAqui(): boolean;
  /** Vuelve a mirar la cola: se llama al crear una tarea, al terminar una, y al abrir o
   *  cerrar un proyecto (que es lo que bloquea y desbloquea su raíz). */
  revisar(): void;
  /** Para los tests: espera a que se asiente lo que el lazo tenga lanzado. */
  asentar(): Promise<void>;
}

/**
 * Del `ConsolaDeProyecto` que abre el vestíbulo al `ConsolaParaTarea` que el corredor pide.
 *
 * Aquí se junta todo: la segunda puerta (que no mueve el cable), la consola que APARCA en
 * vez de contestar por nadie, y el ejecutor de siempre — el mismo que corre un turno de una
 * persona, con las mismas barreras.
 *
 * **Vive aquí y no en el cierre de `arranque.ts`** —donde el plan la puso— por una razón
 * medible: desde ahí no se puede llamar, y la propiedad que sostiene (que la sesión de la
 * tarea se GUARDE) es justo la que se rompe en silencio. El `MEDIDO:` de `vestibulo.test.ts`
 * no la vigila: el agujero está en qué piel se le pasa, así que ese test se queda verde
 * tanto con el arreglo como sin él.
 *
 * **La PIEL es la que hace que el turno se guarde**, y es el único motivo de que esta
 * función sea algo más que tres campos reenviados. `volcar()` (`vestibulo.ts`) lee los actos
 * de la consola de PROYECTO, así que un turno corrido con una `Consola` ajena no vuelca
 * nada: la conversación se pinta en un objeto que nadie lee y la tarea acaba con su sesión
 * vacía. Pasándole `consola.consola.consola.piel` —la misma que usa una persona— el turno
 * escribe actos de asistente, de razonamiento y las tarjetas de artefacto en el transcript
 * de SU sesión, que es lo que hace que atender la tarea sea abrir su conversación.
 */
export function consolaParaTarea(consola: ConsolaDeProyecto): ConsolaParaTarea {
  const dentro = consola.consola.consola;
  return {
    raiz: consola.raiz,
    idDeHilo: consola.idDeHilo,
    correrTarea: async (encargo, aparcar) => {
      // Una consola de tarea por TURNO: su «se aparca una vez» vale por turno, y reusarla
      // para un segundo turno lo dejaría mudo.
      const deTarea = crearConsolaDeTarea({
        aparcar,
        // Lo que escriba el turno va al transcript de SU sesión.
        escribir: (texto) => dentro.escribir(texto),
        ...(dentro.piel === undefined ? {} : { piel: dentro.piel.bind(dentro) }),
        catalogoModelos: dentro.catalogoModelos,
        guardarModeloGlobal: dentro.guardarModeloGlobal,
      });
      await consola.ejecutarTurno(encargo, consola.estadoDeSesion, deTarea);
    },
    cerrar: () => consola.cerrar(),
  };
}

export function crearCorredorDeTareas(opciones: {
  disco: TareasEnDisco;
  abrirParaTarea: (raiz: string) => Promise<ConsolaParaTarea>;
  /** Se lee en cada pasada: cambiar el tope en Ajustes tiene que notarse sin reiniciar. */
  concurrencia: () => number;
  /**
   * Las raíces donde NO se puede arrancar nada ahora mismo: hoy, la del proyecto que tiene
   * abierto una persona. Se lee en cada pasada por lo mismo que la concurrencia — abrir y
   * cerrar un proyecto no reinicia nada. Ver `siguientesAEjecutar#bloqueados` para el por
   * qué («gana la persona»).
   */
  bloqueados?: () => readonly string[];
  /**
   * ¿Hay algo que una persona pueda ABRIR con ese id de sesión? O sea: ¿está en el índice
   * de sesiones del proyecto, con su transcript volcado?
   *
   * Ausente = **no se sabe**, y entonces no se toca nada: quitar la `sesion` y olvidar un
   * hilo son destructivos, así que sin nadie que pueda afirmar que no hay nada abrible se
   * conserva — la misma dirección conservadora que `historica` cuando no se le puede
   * preguntar al checkpointer. Ver `conSesionSoloSiSePuedeAbrir`.
   */
  sesionAbrible?: (raiz: string, sesion: string) => boolean;
  /** Olvida el hilo del agente de una sesión que no nombra nada abrible
   *  (`agent/checkpointer.ts#olvidarHilo`). Ver `conSesionSoloSiSePuedeAbrir`. */
  olvidarHilo?: (raiz: string, sesion: string) => Promise<void>;
  /**
   * Cuánto se espera, como MUCHO, a que los turnos cortados devuelvan en `parar()`. Entra
   * por parámetro como el `msDeEspera` de la consola web y por lo mismo: `npm test` no puede
   * esperar un tope de verdad. Ver `TOPE_DE_PARADA_MS`.
   */
  esperaAlParar?: number;
  pid?: number;
  /** Se llama en cada cambio, para que el cable emita la cola nueva. */
  alCambiar?: (tareas: readonly Tarea[]) => void;
  /**
   * A dónde van los avisos SOBRE ESTE PROCESO —«las tareas las ejecuta otro»—, y solo
   * esos. Lo que le pasa a una TAREA no sale por aquí: `informar` escribe un acto de
   * sistema en la pantalla de una persona, y el sitio de un fallo de tarea es el registro
   * de la tarea (su `motivo`, y su transcript). Un aviso sobre la tarea de otro proyecto
   * en medio de la conversación de alguien es ruido que además no es accionable ahí.
   */
  informar?: (texto: string) => void;
}): Corredor {
  const pid = opciones.pid ?? process.pid;
  const informar = opciones.informar ?? (() => {});
  let miCerrojo = false;
  let parando = false;

  /**
   * Las que este proceso no vuelve a coger porque no pudo escribir su estado.
   *
   * Es el freno de un lazo que no tiene temporizador: `revisar` se dispara al terminar cada
   * tarea, así que una tarea que se queda en `nuevo` porque el índice no se puede escribir
   * (disco lleno, permisos) se elegiría otra vez, y otra, sin decir nada — medido con la
   * transición que faltaba: no es un error que se lee, es una CPU al 100%. Solo se renuncia
   * cuando se ha COMPROBADO que sigue en `nuevo` tras intentar moverla; que ya no esté o que
   * la tenga otro no es renunciar, es que no era nuestra. Se olvida al reiniciar el proceso,
   * que es cuando el disco pudo cambiar.
   */
  const renunciadas = new Set<string>();

  /** Lo que este proceso tiene EN VUELO, por id de tarea. */
  interface EnVuelo {
    /** La tarea tal como se despachó. Hace falta entera y no solo su raíz: si la descartan
     *  del índice mientras corre, sigue ocupando su hueco y su proyecto (ver `revisar`). */
    tarea: Tarea;
    trabajo: Promise<void>;
    /** Corta el turno. Memoizado: cerrar dos veces la misma consola no puede volver a
     *  abortar nada ni volver a volcar. */
    cortar: () => Promise<void>;
  }
  const enVuelo = new Map<string, EnVuelo>();

  /**
   * Escribe UNA tarea, releyendo el índice y **solo si en disco sigue siendo la nuestra**.
   *
   * Releer hace falta porque entre medias la cola pudo cambiar por el cable (otra pestaña
   * renombra el encargo, descarta la tarea) o por el otro corredor. Y la CONDICIÓN es lo
   * que evita el daño: si la tarea ya no está —descartada—, escribirla la resucitaría; si
   * está «en proceso» con otro pid, el otro corredor la está corriendo de verdad y poner
   * «terminada» encima la daría por buena sin que nadie la haya hecho.
   *
   * Devuelve si escribió, porque quien despacha necesita saberlo: una marca de «en proceso»
   * que no se pudo escribir significa que esa tarea ya no es nuestra y no hay que correrla.
   */
  const escribirSiSigueSiendoNuestra = (
    id: string,
    siguiente: (actual: Tarea) => Tarea | undefined
  ): boolean => {
    const lista = opciones.disco.listar();
    const actual = lista.find((t) => t.id === id);
    if (actual === undefined) return false;
    const cambiada = siguiente(actual);
    if (cambiada === undefined) return false;
    const nueva = lista.map((t) => (t.id === id ? cambiada : t));
    opciones.disco.guardar(nueva);
    opciones.alCambiar?.(nueva);
    return true;
  };

  /**
   * El código de un error, nunca su mensaje.
   *
   * El mensaje de Node lleva la ruta absoluta («ENOENT: … open '/Users/…/app.xne'») y el
   * motivo se pinta en el kanban, que viaja por el cable — que puede ir por un túnel. Es la
   * misma regla y el mismo apaño que `codigoDe` en `arranque.ts`.
   */
  const codigoDe = (error: unknown): string => {
    if (typeof error === "object" && error !== null && "code" in error && typeof error.code === "string") {
      return error.code;
    }
    return error instanceof Error ? error.name : "error";
  };

  /**
   * El mensaje si lo escribimos nosotros, y el código si lo escribió el sistema.
   *
   * Un error de Node trae `code` y su mensaje trae la ruta absoluta; uno escrito a mano en
   * este repo no trae `code` y su mensaje es justo lo que hay que leer. Es la única forma de
   * quedarse con «falta su .xonecode/config.json» sin quedarse también con
   * «…, open '/Users/quien-sea/…'».
   */
  const sinRutas = (error: unknown): string =>
    typeof error === "object" && error !== null && "code" in error ? codigoDe(error) : unaLinea(error);

  /**
   * La tarea con su `sesion`, **si y solo si hay algo que una persona pueda abrir**; y si no
   * la hay, se OLVIDA el hilo del agente.
   *
   * Con transcript volcado, la entrada está en el índice del proyecto y la conversación se
   * lee desde la barra lateral: se conserva. Sin transcript —el corte a mitad de turno que
   * se midió: checkpoint sí, transcript no— ese id no nombra nada abrible, así que se olvida
   * el hilo y se limpia `sesion`. Un campo que apunta a algo que no se puede abrir es la
   * misma mentira que un control sin dato detrás.
   *
   * Y olvidarlo no es cosmético: un checkpoint es la lista de mensajes ENTERA —contenido de
   * ficheros incluido— y CRECE (medido en CLAUDE.md: cinco turnos, 370 checkpoints, 30 MB).
   * Dejarlo vivo e inalcanzable desde la interfaz es exactamente lo que `borrarSesion` evita
   * al borrar una conversación.
   */
  const olvidarSiNoSePuedeAbrir = async (raiz: string, sesion: string | undefined): Promise<boolean> => {
    if (sesion === undefined || opciones.sesionAbrible === undefined) return false;
    try {
      if (opciones.sesionAbrible(raiz, sesion)) return false;
    } catch {
      // Preguntarlo puede fallar (en producción lee el índice del proyecto). Entonces no se
      // sabe, y no se borra nada: la misma dirección que el puerto ausente.
      return false;
    }
    // Primero olvidar y después escribir: si la escritura falla, el hilo que se ha olvidado
    // era inalcanzable de todas formas. Un fallo al olvidar no puede impedir la limpieza del
    // campo — el mismo trato que `olvidarHilo` le da a `borrarSesion`.
    await opciones.olvidarHilo?.(raiz, sesion).catch(() => undefined);
    return true;
  };

  /** La tarea sin su `sesion`. Ver la regla de arriba. */
  const sinSesion = (tarea: Tarea): Tarea => {
    const limpia = { ...tarea };
    delete limpia.sesion;
    return limpia;
  };

  /**
   * Aparca una tarea pasando por la regla de `sesion`, releyendo del disco el id con el que
   * quedó marcada.
   *
   * Existe para que el camino de ERROR pase por las MISMAS dos cosas que el bueno: una regla
   * que se cumple salvo cuando algo falla no es una regla. Y relee el id en vez de recibirlo
   * porque desde el último recurso del lazo no se sabe con qué hilo se marcó.
   */
  const aparcarMirandoLaSesion = async (tarea: Tarea, motivo: string): Promise<void> => {
    const actual = opciones.disco.listar().find((t) => t.id === tarea.id);
    const limpiar = await olvidarSiNoSePuedeAbrir(tarea.proyecto.raiz, actual?.sesion);
    aparcar(tarea.id, motivo, limpiar ? sinSesion : (t) => t);
  };

  /**
   * Comprueba que la tarea salió de `nuevo`, y si no, renuncia a ella. Ver `renunciadas`.
   */
  const renunciarSiSigueNueva = (id: string, error?: unknown): void => {
    if (opciones.disco.listar().find((t) => t.id === id)?.estado !== "nuevo") return;
    renunciadas.add(id);
    // Esto SÍ es del proceso y no de la tarea: su cola no se puede escribir, así que ni el
    // motivo llegaría al kanban. Es el mismo criterio que el aviso del cerrojo.
    informar(`no se pudo escribir el estado de una tarea (${codigoDe(error)}); esta consola no la vuelve a coger`);
  };

  /**
   * Aparca la tarea, y si no se puede aparcar no se insiste.
   *
   * `conEstado` LANZA ante una transición imposible, y aquí eso solo puede pasar si la
   * tarea cambió de estado por debajo — o sea, justo el caso en el que no hay que escribir.
   */
  const aparcar = (id: string, motivo: string, antes: (actual: Tarea) => Tarea = (t) => t): void => {
    try {
      escribirSiSigueSiendoNuestra(id, (actual) =>
        actual.estado === "en-proceso" && actual.pid === pid
          ? conEstado(antes(actual), "requiere-atencion", motivo)
          : undefined
      );
    } catch (error) {
      // Ver arriba: si no se puede, es porque ya no es nuestra… o porque el índice no se
      // puede escribir, y eso sí hay que frenarlo.
      renunciarSiSigueNueva(id, error);
    }
  };

  const correr = async (tarea: Tarea, entrada: EnVuelo): Promise<void> => {
    let consola: ConsolaParaTarea | undefined;
    try {
      consola = await opciones.abrirParaTarea(tarea.proyecto.raiz);
    } catch (error) {
      /**
       * El proyecto ya no está donde la tarea dice. Se aparca: la dirección de fallo aquí es
       * no ejecutar, nunca ejecutar contra otra carpeta.
       *
       * Aquí el mensaje SÍ se usa, y es la única excepción — pero solo el de la guarda de
       * `abrirParaTarea` (`vestibulo.ts`), que está escrito para subir al registro de la
       * tarea y no lleva ninguna ruta a propósito: es el que dice qué hacer (falta el
       * `config.json`). Lo que viene DETRÁS de esa guarda no es nuestro —
       * `dependenciasDeProyecto`, `crearEjecutor`, la foto de git— y puede lanzar un error de
       * Node con el home dentro. Se distinguen por lo mismo que en todo el repo: un error del
       * sistema trae `code`, y uno escrito a mano no. Ver `codigoDe`.
       */
      try {
        escribirSiSigueSiendoNuestra(tarea.id, (actual) =>
          actual.estado === "nuevo"
            ? conEstado(actual, "requiere-atencion", `no se pudo abrir el proyecto: ${sinRutas(error)}`)
            : undefined
        );
      } finally {
        // Si sigue en `nuevo`, este proceso no la vuelve a coger: `revisar` se dispara al
        // acabar cada tarea, así que reintentarla sería un lazo caliente. Ver `renunciadas`.
        renunciarSiSigueNueva(tarea.id, error);
      }
      return;
    }

    let cerrada = false;
    const cortar = async (): Promise<void> => {
      if (cerrada) return;
      cerrada = true;
      await consola.cerrar().catch(() => {});
    };
    // Desde aquí, `parar()` sabe cómo cortar ESTE turno. Antes de esta línea la consola no
    // existía todavía y no había nada que cortar.
    entrada.cortar = cortar;
    // Y si el corte llegó mientras se abría, no se arranca nada: marcar «en proceso» ahora
    // dejaría una tarea corriendo justo cuando el proceso se está yendo.
    if (parando) {
      await cortar();
      return;
    }

    const hilo = consola.idDeHilo;
    let motivo: string | undefined;
    /** ¿Devolvió el turno por su cuenta? Distingue «acabó» de «se lo cortamos». */
    let terminoLimpio = false;
    let marcada = false;
    try {
      /**
       * La marca de «en proceso», y es una PUERTA: si no se puede escribir, esta tarea ya no
       * es nuestra —la descartaron, o el otro corredor se la llevó— y no se corre. Sin esa
       * puerta el turno arrancaría igual sobre una tarea que en el kanban ya no existe.
       *
       * El id del hilo ES la sesión: es lo que hace que atender la tarea sea abrir su
       * conversación.
       */
      marcada = escribirSiSigueSiendoNuestra(tarea.id, (actual) =>
        actual.estado === "nuevo" ? conEstado({ ...actual, sesion: hilo }, "en-proceso", undefined, { pid }) : undefined
      );
      if (marcada) {
        await consola.correrTarea(tarea.encargo, (m) => void (motivo ??= m));
        terminoLimpio = true;
      }
    } catch (error) {
      // El `motivo ??=` conserva el primero: la consola de tarea aparca ANTES de lanzar, así
      // que cuando el error llega aquí el motivo bueno ya está puesto. Y si lo que reventó
      // fue la propia marca, `marcada` sigue en falso y de aquí no sale ningún estado: no hay
      // ninguna tarea nuestra que contar.
      if (marcada) motivo ??= parando ? MOTIVO_CORTADA_POR_CIERRE : `el turno falló (${codigoDe(error)})`;
      else renunciarSiSigueNueva(tarea.id, error);
    } finally {
      /**
       * **Cerrar ANTES de escribir el estado, y el orden es load-bearing.** Solo las tareas
       * `en-proceso` ocupan su proyecto (`siguientesAEjecutar`), así que si esto se aparcara
       * con la sesión todavía abierta, el planificador dejaría arrancar otra tarea sobre el
       * mismo proyecto — dos turnos a la vez sobre el mismo disco, git y checkpointer, que
       * es exactamente lo que el cerrojo por proyecto existe para evitar. Hay test del orden.
       *
       * Y es también lo que VUELCA el transcript de la sesión: `cerrar()` llama a `volcar()`.
       * En el `finally` porque **ningún** camino puede dejar la consola abierta: la marca que
       * no se pudo escribir y el turno que revienta son un handle filtrado por tarea, y con un
       * lazo corriendo eso se acumula.
       */
      await cortar();
    }
    if (!marcada) {
      renunciarSiSigueNueva(tarea.id);
      return;
    }
    // Un turno que devolvió porque le cerramos la consola no está «terminado»: se dice, con
    // las mismas palabras que la reconciliación, porque es la misma situación. Se mira si
    // devolvió LIMPIO y no solo si estamos parando: un turno que acaba su trabajo en el mismo
    // instante en que alguien pulsa Ctrl-C acabaría con un motivo falso en el kanban.
    if (motivo === undefined && !terminoLimpio) motivo = MOTIVO_CORTADA_POR_CIERRE;
    /**
     * El estado final, y **el camino de error pasa por lo mismo que el bueno**: la regla de
     * `sesion` y la consola cerrada. Aquí ya se sabe si el turno dejó conversación —`cortar()`
     * acaba de volcarla—: uno que no emitió un solo acto cierra sin volcar nada, y entonces su
     * id no nombra nada abrible (ver `olvidarSiNoSePuedeAbrir`).
     */
    // La regla se resuelve UNA vez y fuera del `try` de la escritura: así el camino de error
    // reusa la decisión en vez de volver a preguntar —y a olvidar— el mismo hilo dos veces.
    let conLoQueQuede: (t: Tarea) => Tarea = (t) => t;
    try {
      if (await olvidarSiNoSePuedeAbrir(tarea.proyecto.raiz, hilo)) conLoQueQuede = sinSesion;
    } catch {
      // Ni preguntar se pudo: no se sabe, y entonces no se borra nada.
    }
    try {
      // Aparcada si algo pidió a una persona; terminada si acabó limpia. «Terminada» significa
      // que el turno acabó, no que el resultado sea correcto: eso lo mira quien la lea.
      if (motivo === undefined) {
        escribirSiSigueSiendoNuestra(tarea.id, (actual) =>
          actual.estado === "en-proceso" && actual.pid === pid
            ? conEstado(conLoQueQuede(actual), "terminada")
            : undefined
        );
      } else {
        aparcar(tarea.id, motivo, conLoQueQuede);
      }
    } catch (error) {
      // Ni escribir el final puede dejarla «en proceso» sin nadie detrás: se intenta aparcar
      // diciéndolo, con la MISMA regla ya resuelta arriba.
      aparcar(tarea.id, motivo ?? `el corredor no pudo cerrarla (${codigoDe(error)})`, conLoQueQuede);
      renunciarSiSigueNueva(tarea.id, error);
    }
  };

  /**
   * ¿Seguimos mandando? Se pregunta AL DISCO, al empezar cada pasada y antes de cada
   * despacho, y al perderlo se para el lazo sin soltar nada.
   *
   * Las dos veces hacen falta y no son la misma: la de la pasada mantiene honesto
   * `corriendoAqui()` —que es lo que el kanban pinta— incluso cuando no hay hueco para
   * despachar nada, y la de cada despacho es la que impide abrir una consola con el
   * cerrojo ya en otras manos. Y NO se llama a `soltarCerrojo`: solo borra el propio, y
   * ese fichero es ya de otro proceso.
   */
  const sigoMandando = (): boolean => {
    if (opciones.disco.sigoSiendoDueño()) return true;
    if (miCerrojo) informar("el cerrojo de las tareas lo tiene ya otro proceso: aquí se dejan de ejecutar");
    miCerrojo = false;
    return false;
  };

  const revisar = (): void => {
    if (!miCerrojo || parando) return;
    if (!sigoMandando()) return;
    /**
     * Lo que este proceso tiene EN VUELO se le cuenta al planificador como «en proceso»,
     * lo diga el disco o no, y esas dos correcciones cubren dos ventanas distintas:
     *  - la tarea despachada cuya marca todavía no está escrita —abrir la consola es
     *    asíncrono—: sin esto, dos revisiones en el mismo tick (el arranque y un `crear`
     *    que llega del cable) elegirían la misma tarea y abrirían dos consolas sobre el
     *    mismo proyecto;
     *  - y la que DESCARTARON del índice mientras corría: su turno sigue vivo, así que su
     *    hueco y su proyecto siguen ocupados hasta que devuelva.
     * Contarlas por su estado, y no restando `enVuelo.size` del tope, es lo que evita
     * descontarlas DOS veces (el disco ya dice «en proceso» de casi todas).
     */
    const enDisco = opciones.disco.listar();
    const enElIndice = new Set(enDisco.map((t) => t.id));
    const lista: Tarea[] = [
      ...enDisco.map((t) => (enVuelo.has(t.id) ? { ...t, estado: "en-proceso" as const } : t)),
      ...[...enVuelo.values()]
        .filter((e) => !enElIndice.has(e.tarea.id))
        .map((e) => ({ ...e.tarea, estado: "en-proceso" as const })),
    ];
    for (const tarea of siguientesAEjecutar(lista.filter((t) => !renunciadas.has(t.id)), {
      concurrencia: opciones.concurrencia(),
      bloqueados: opciones.bloqueados?.() ?? [],
    })) {
      // Antes de CADA tarea, no solo al arrancar ni una vez por pasada: ver la cabecera.
      if (!sigoMandando()) return;
      /**
       * La entrada se registra ANTES de arrancar el trabajo, y su `cortar` lo rellena
       * `correr` en cuanto tiene la consola: hasta ese momento no hay nada que cortar, y un
       * `parar()` que llegue en esa ventana lo ve el propio `correr` y no arranca el turno.
       */
      const entrada: EnVuelo = { tarea, trabajo: Promise.resolve(), cortar: async () => {} };
      enVuelo.set(tarea.id, entrada);
      entrada.trabajo = correr(tarea, entrada)
        // Nada de `informar`: lo que le pasa a una tarea va a su registro. Si `correr` se
        // rompe fuera del turno, la tarea se queda aparcada diciéndolo — nunca «en proceso»
        // sin nadie detrás.
        .catch(async (error: unknown) => {
          // El último recurso, y pasa por la MISMA regla de `sesion` que el camino bueno:
          // dejar escrito aquí un id que no nombra nada abrible sería la regla cumpliéndose
          // solo cuando todo va bien.
          await aparcarMirandoLaSesion(tarea, `el corredor no pudo con ella (${codigoDe(error)})`).catch(
            () => undefined
          );
          // Y si tras intentarlo SIGUE en `nuevo`, este proceso no puede moverla de sitio:
          // renuncia, o el `revisar()` de abajo la vuelve a coger en el acto y otra vez.
          // Medido: sin esto, un índice que no se puede escribir es una CPU al 100%.
          renunciarSiSigueNueva(tarea.id, error);
        })
        .finally(() => {
          enVuelo.delete(tarea.id);
          revisar();
        });
    }
  };

  /** El arranque de verdad. Lo envuelve `arrancar`, que es quien no puede lanzar. */
  const arrancarDeVerdad = async (): Promise<void> => {
    const cerrojo = opciones.disco.tomarCerrojo();
    if (!cerrojo.tomado) {
      miCerrojo = false;
      informar(`las tareas las ejecuta otro proceso (pid ${cerrojo.dePid}); aquí solo se ven`);
      return;
    }
    miCerrojo = true;
    /**
     * RECONCILIACIÓN. Toda tarea «en proceso» se aparca, **sin mirar el pid**.
     *
     * La cola sobrevive a parar el proceso, pero el turno en vuelo no, y al ARRANCAR este
     * proceso no tiene ninguna tarea en vuelo por construcción: así que toda «en proceso»
     * que haya en disco es vieja, y dejarla así sería afirmar lo que no se sabe. Mirar el
     * pid —«las que no son mías»— parece más fino y es un agujero medido: los pid se
     * REUSAN, y la tarea del proceso muerto que casualmente tenía este número se quedaba
     * «en proceso» para siempre, sin nadie ejecutándola, sin transición posible desde ahí
     * y con su proyecto ocupado para el planificador.
     *
     * Solo con el cerrojo NUESTRO: si lo tiene otro proceso, sus «en proceso» están
     * corriendo de verdad y aparcarlas sería matarlas desde fuera.
     */
    const lista = opciones.disco.listar();
    const reconciliada: Tarea[] = [];
    for (const t of lista) {
      if (t.estado !== "en-proceso") {
        reconciliada.push(t);
        continue;
      }
      // El hilo de un turno cortado a mitad no nombra nada abrible: se olvida antes de
      // aparcar. Ver `conSesionSoloSiSePuedeAbrir`.
      const limpiar = await olvidarSiNoSePuedeAbrir(t.proyecto.raiz, t.sesion);
      reconciliada.push(
        conEstado(limpiar ? sinSesion(t) : t, "requiere-atencion", motivoDeReconciliacion(t.pid))
      );
    }
    if (reconciliada.some((t, i) => t !== lista[i])) {
      opciones.disco.guardar(reconciliada);
      opciones.alCambiar?.(reconciliada);
    }
    revisar();
  };

  return {
    async arrancar() {
      /**
       * Un fallo aquí NO puede tumbar la consola web, que es la misma regla que ya siguen la
       * conexión con CloudStudio y la apertura del navegador: las tareas de fondo son una
       * pieza más, y quien está delante viene a trabajar en su proyecto. `tomarCerrojo`
       * lanza ante cualquier cosa que no sea `EEXIST`/`ENOENT` —un `~/.xonecode/tareas` que
       * no se puede escribir— y la reconciliación escribe el índice, así que las dos pueden
       * reventar. Se dice con el código (esto es del PROCESO, no de ninguna tarea: es el
       * canal del aviso del cerrojo) y este proceso se queda sin ejecutar, que es lo mismo
       * que le pasa al segundo.
       */
      try {
        await arrancarDeVerdad();
      } catch (error) {
        /**
         * **Y se SUELTA el cerrojo, no solo se olvida.** Poner `miCerrojo = false` y dejar el
         * fichero en disco era el peor fallo posible de esta pieza: `corriendoAqui()` mentía,
         * `parar()` no soltaba nada —creía que no lo tenía— y las tareas de TODA la máquina se
         * quedaban congeladas hasta que el proceso muriera. Un cerrojo que existe para que no
         * haya dos corredores acabando con que no haya ninguno.
         *
         * Llamarlo es seguro aunque el fallo ocurriera ANTES de tomarlo: `soltarCerrojo` solo
         * borra el cerrojo cuyo pid es el nuestro.
         */
        try {
          opciones.disco.soltarCerrojo();
        } catch {
          // Si tampoco se puede soltar, no hay nada más que hacer: lo de abajo lo dice.
        }
        miCerrojo = false;
        informar(`las tareas de fondo no se pueden ejecutar aquí (${codigoDe(error)}); la consola sigue`);
      }
    },

    async parar() {
      parando = true;
      /**
       * Se CORTA lo que esté en vuelo, no se espera: un turno tarda minutos y quien pulsa
       * Ctrl-C espera que el proceso se vaya. Cerrar la consola es lo que hace que el turno
       * devuelva (aborta el stream del grafo), y el `finally` de `correr` la aparca diciendo
       * qué pasó. Se cortan TODAS antes de esperar a ninguna: al revés, la última esperaría
       * a que la primera acabara de cerrarse.
       */
      const cortando = [...enVuelo.values()].map((e) => e.cortar());
      const trabajos = [...enVuelo.values()].map((e) => e.trabajo);
      const cuantas = trabajos.length;
      /**
       * Con PLAZO, y el plazo cubre las dos esperas: el cierre de la consola puede colgarse
       * igual que el turno. Al agotarse **no se miente** — la tarea se queda «en proceso» y
       * la reconciliación del siguiente arranque la aparca, que es exactamente para lo que
       * existe. Se DICE, porque una tarea que se queda diciendo «en proceso» sin nadie
       * detrás y sin explicación es el estado más confuso que puede quedar en el kanban.
       */
      const aTiempo = await conPlazo(
        (async () => {
          await Promise.allSettled(cortando);
          await Promise.allSettled(trabajos);
        })(),
        opciones.esperaAlParar ?? TOPE_DE_PARADA_MS
      );
      if (!aTiempo) {
        informar(
          `${cuantas} tarea(s) no han devuelto al cerrar: se quedan «en proceso» y el próximo ` +
            `arranque las reconcilia`
        );
      }
      // El cerrojo se suelta igual: este proceso se va, y dejarlo puesto obligaría al
      // siguiente a recogerlo por el camino que no es atómico.
      if (miCerrojo) opciones.disco.soltarCerrojo();
      miCerrojo = false;
    },
    corriendoAqui: () => miCerrojo,
    revisar,
    /**
     * Deja que se asiente lo lanzado. Vive en producción y no en el test porque solo el
     * corredor sabe qué está en vuelo, y las tres vueltas de `setImmediate` son lo que
     * drena las microtareas Y las devoluciones de E/S que un turno de mentira encadena.
     * No es el reloj del lazo: el lazo no tiene ninguno — se revisa por evento.
     */
    async asentar() {
      for (let i = 0; i < 3; i += 1) await new Promise<void>((r) => setImmediate(r));
    },
  };
}

/**
 * Espera una promesa con plazo. Devuelve si llegó a tiempo.
 *
 * El temporizador se limpia SIEMPRE: uno vivo mantiene el proceso en pie, y esto corre justo
 * en el camino por el que el proceso se está yendo — un `setTimeout` de treinta segundos sin
 * `clearTimeout` haría que el Ctrl-C tardara treinta segundos aunque todo hubiera cerrado ya.
 */
async function conPlazo(promesa: Promise<unknown>, ms: number): Promise<boolean> {
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  const plazo = new Promise<false>((resuelto) => {
    temporizador = setTimeout(() => resuelto(false), ms);
  });
  try {
    return await Promise.race([promesa.then(() => true), plazo]);
  } finally {
    if (temporizador !== undefined) clearTimeout(temporizador);
  }
}

/** Una línea, nunca una traza con rutas de la máquina. */
function unaLinea(error: unknown): string {
  const mensaje = error instanceof Error ? error.message : String(error);
  return mensaje.split(/\r?\n/)[0]!.slice(0, 160);
}
