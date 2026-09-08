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
import {
  conAutorizadas,
  conEstado,
  conVeredicto,
  siguientesAEjecutar,
  TOPE_DE_RONDAS_DE_TAREA,
  type Tarea,
} from "../../core/tareas.js";
import {
  condicionesDeEntrega,
  decisionDeEntrega,
  medidaDeEntrega,
  type ResultadoDeTurno,
  type VeredictoDeTarea,
} from "../../core/entrega.js";
import type { JuezDeTareaPort } from "../../core/ports.js";
import type { Entrega } from "../../core/entrega.js";
import { crearConsolaDeTarea } from "./consolaDeTarea.js";
import { ErrorDelJuezDeTarea } from "../../agent/juezDeTarea.js";
import type { Consola } from "../../cli/consola.js";
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
/**
 * Lo que git sabe de una sesión, y que la puerta de la entrega necesita entero.
 *
 * Las dos cosas salen de UNA pregunta (`cambiosDeSesion`): si hay «antes» con que comparar,
 * y si la sesión cambió algo. `escribio` solo se puede afirmar con marca — sin ella no es
 * que no escribiera, es que no hay con qué mirarlo (ver `MedidaDeEntrega.escribio`).
 */
export interface RevisionDeSesion {
  revisable: boolean;
  escribio?: boolean;
}

/**
 * La `revisable` de PRODUCCIÓN, sobre `cambiosDeSesion`.
 *
 * Vive aquí y no en un cierre de `arrancarConsolaWeb` por la razón de siempre en este repo:
 * ahí dentro no se puede llamar, y todos los tests de esa función doblan lo que la rodea —
 * así que esta derivación podía quedarse mal con todo en verde. Medido: una mutación que
 * hacía `escribio: true` a fuego sobrevivió a las 25 mutaciones de la tanda anterior.
 *
 * Las tres respuestas posibles, y la del medio es la que sostiene todo:
 *  - `via: "git"` con ficheros → hay «antes» con que comparar y la sesión cambió algo.
 *  - `via: "git"` sin ficheros → hay «antes» y la sesión NO cambió nada. Es lo único que
 *    permite entregar una tarea de solo lectura, y viene de git y nunca de `autorizadas`,
 *    que es la intención del agente y no el hecho.
 *  - `sin-marca` → no hay con qué mirarlo, así que **no se afirma nada** sobre si escribió:
 *    el campo se queda ausente y la condición del verificador se exige como siempre.
 */
export function revisionConGit(
  cambiosDeSesion: (raiz: string, sesion: string) => Promise<{ via: string; ficheros: readonly unknown[] }>
): (raiz: string, sesion: string) => Promise<RevisionDeSesion> {
  return async (raiz, sesion) => {
    const cambios = await cambiosDeSesion(raiz, sesion);
    if (cambios.via !== "git") return { revisable: false };
    return { revisable: true, escribio: cambios.ficheros.length > 0 };
  };
}

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

/**
 * Lo que se espera, como MUCHO, a que el juez de QA conteste.
 *
 * Es la regla de siempre en este repo —«cada proceso lleva tope», y «un cuelgue se dice
 * como *no respondió*, nunca se queda el panel en *consultando…*»— aplicada a una llamada
 * de modelo: los SDK traen plazos por omisión del orden de diez minutos, y durante todo ese
 * rato la tarea diría «en proceso» ocupando el hueco y el proyecto sin que nadie pueda
 * saber por qué. Dos minutos es de sobra para un veredicto de dos frases sobre una lista de
 * nombres.
 *
 * Al agotarse NO se entrega: la consulta se abandona (la llamada sigue viva en segundo
 * plano, no hay con qué abortarla desde aquí) y la tarea queda esperando feedback con el
 * motivo — que es lo mismo que hace `parar()` cuando su plazo se agota: no mentir.
 */
export const TOPE_DEL_JUEZ_MS = 120_000;

/** El mismo motivo, diciendo qué proceso la tenía. Ver `MOTIVO_CORTADA_POR_CIERRE`. */
const motivoDeReconciliacion = (pid: number | undefined): string =>
  pid === undefined ? MOTIVO_CORTADA_POR_CIERRE : `${MOTIVO_CORTADA_POR_CIERRE} (era el pid ${pid})`;

/** Lo que el corredor necesita de una consola de proyecto abierta para una tarea. */
export interface ConsolaParaTarea {
  raiz: string;
  idDeHilo: string;
  /**
   * Corre el encargo.
   *
   * `aparcar` es lo que la consola de tarea llama al toparse con algo que necesita a una
   * persona; `autorizado` es lo que llama al AUTORIZAR escrituras sin aprobación, con las
   * rutas relativas. Los dos son callbacks y no un valor de retorno porque el turno puede
   * LANZAR después de haber autorizado —eso es justo lo que hace `preguntar`—, y un retorno
   * se perdería con la excepción. `autorizado` puede llamarse varias veces: un turno
   * autoriza en varias rondas de aprobación.
   */
  correrTarea(
    encargo: string,
    aparcar: (motivo: string) => void,
    autorizado?: (ficheros: readonly string[]) => void
  ): Promise<ResultadoDeTurno | void>;
  cerrar(): Promise<void>;
  /**
   * Espera a que la marca de git de la sesión esté escrita.
   *
   * Opcional porque los dobles de test no la tienen, y su ausencia es inofensiva: lo único
   * que pasa es que la medida de «revisable» puede llegar antes que la ref. En producción
   * la aporta `consolaParaTarea`, y es lo que cierra una carrera MEDIDA — sin ella
   * `cambiosDeSesion` decía `sin-marca` y TODA tarea se aparcaba diciendo que nadie podía
   * revisarla. La espera vive aquí y no en `cerrar()` para no cobrársela a quien cierra un
   * proyecto estando sentado delante.
   */
  esperarMarca?(): Promise<void>;
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
    correrTarea: async (encargo, aparcar, autorizado) => {
      // Una consola de tarea por TURNO: su «se aparca una vez» vale por turno, y reusarla
      // para un segundo turno lo dejaría mudo.
      const deTarea: Consola = {
        ...crearConsolaDeTarea({
        aparcar,
        // Lo que la tarea autorice sin aprobación sube al corredor, que lo guarda con el
        // estado final. Se reenvía o no está, como la piel: `autorizado: undefined` haría
        // que un `"autorizado" in opciones` dijera que sí.
        ...(autorizado === undefined ? {} : { autorizado }),
        // Lo que escriba el turno va al transcript de SU sesión.
        escribir: (texto) => dentro.escribir(texto),
        ...(dentro.piel === undefined ? {} : { piel: dentro.piel.bind(dentro) }),
          catalogoModelos: dentro.catalogoModelos,
          guardarModeloGlobal: dentro.guardarModeloGlobal,
        }),
        /**
         * **El tope de rondas de una TAREA, que no es el de la persona.**
         *
         * Se cablea aquí y no dentro de `crearConsolaDeTarea` porque este es el punto de
         * MONTAJE —el mismo motivo por el que esta función vive en este fichero y no en el
         * cierre de `arranque.ts`—: quién está detrás lo sabe quien junta las piezas.
         *
         * El porqué del número está en `TOPE_DE_RONDAS_DE_TAREA`. El porqué de que haga
         * falta está medido: con las escrituras aprobándose solas, cada tanda gastaba una de
         * las cinco rondas de la persona, y un turno acabó con cuatro ficheros escritos, una
         * escritura abandonada y el verificador sin correr ni una vez.
         */
        topeDeAprobaciones: TOPE_DE_RONDAS_DE_TAREA,
      };
      // Se DEVUELVE lo que el turno informe: es con lo que el corredor mide si el trabajo
      // se puede dar por bueno. Sin este `return`, la puerta de la entrega no tendría datos
      // y toda tarea acabaría esperando feedback — la dirección segura, pero inútil.
      return await consola.ejecutarTurno(encargo, consola.estadoDeSesion, deTarea);
    },
    cerrar: () => consola.cerrar(),
    esperarMarca: () => consola.esperarMarca(),
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
  /** Cuánto se espera al juez. Por parámetro por lo mismo que `esperaAlParar`: `npm test`
   *  no puede esperar un tope de verdad. Ver `TOPE_DEL_JUEZ_MS`. */
  esperaDelJuez?: number;
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
  /**
   * El juez de QA que decide si el trabajo hace lo que se pedía.
   *
   * **Es OBLIGATORIO, fail-closed por TIPO**, igual que `PoliticaDeAprobacion` en
   * `core/cloudstudio.ts`: «no se puede invocar sin decir quién autoriza». Un puerto
   * opcional con omisión conservadora compilaría sin el cableado de producción, y entonces
   * la pieza estaría sin montar con todo en verde — que es exactamente el agujero que
   * `construirCorredorDeTareasCableado` y `backendDeAgente` existen para cerrar.
   */
  juez: JuezDeTareaPort;
  /**
   * ¿Se puede REVISAR lo que la tarea escribió en esa sesión?
   *
   * En producción es `cambiosDeSesion(raiz, sesion).via === "git"` — la MISMA función que
   * pinta la pestaña Revisión, no una parecida, así que «revisable» significa literalmente
   * «Revisión lo enseña». Entra por parámetro porque es git y `npm test` no puede
   * necesitarlo en cada caso.
   *
   * **No es «el árbol está limpio», y eso está medido**: una tarea que escribe un fichero
   * deja el árbol sucio por definición (`git status --porcelain` → `?? Clientes.xne`), así
   * que con esa condición ninguna tarea se entregaría nunca. Ver `core/entrega.ts`.
   *
   * Devuelve DOS cosas y no una porque las dos salen de la misma pregunta a git: si hay
   * «antes» con que comparar, y **cuántos ficheros cambió la sesión** — de lo segundo
   * depende que una tarea de solo lectura se pueda entregar, y tiene que salir de git y no
   * de `autorizadas` (ver `MedidaDeEntrega.escribio`).
   */
  revisable: (raiz: string, sesion: string) => Promise<RevisionDeSesion>;
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
    /**
     * Las escrituras que el turno AUTORIZÓ sin aprobación, con ruta relativa.
     *
     * **Vive en la entrada y no dentro de `correr` para que el ÚLTIMO RECURSO también las
     * escriba.** El `.catch` que envuelve a `correr` es un camino de error, y el registro de
     * unas escrituras que nadie aprobó es justo lo que no puede perderse ahí: es el mismo
     * argumento de la regla de `sesion` —lo que se pierde cuando algo falla es lo que nadie
     * podrá revisar después—.
     *
     * `undefined` mientras el turno no ha arrancado, y eso es la mitad de «ausente no es
     * vacío»: una tarea cuyo proyecto ya no está nunca llega a tener lista, así que su campo
     * se queda sin escribir en vez de afirmar que no autorizó nada.
     */
    autorizadas?: string[];
    /**
     * El veredicto del juez, si se llegó a preguntar.
     *
     * Vive en la entrada por el mismo motivo que `autorizadas`: para que el ÚLTIMO RECURSO
     * también lo escriba. El `.catch` que envuelve a `correr` es un camino de error, y un
     * veredicto que se consiguió y se pierde ahí obliga a gastar otra llamada del modelo
     * más caro para volver a saber lo mismo.
     */
    veredicto?: VeredictoDeTarea;
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
  const aparcarMirandoLaSesion = async (
    tarea: Tarea,
    motivo: string,
    /** Lo que el turno autorizó, si llegó a correr. Ver `EnVuelo.autorizadas`. */
    autorizadas?: readonly string[],
    /** Lo que dijo el juez, si se llegó a preguntar. Ver `EnVuelo.veredicto`. */
    veredicto?: VeredictoDeTarea
  ): Promise<void> => {
    const actual = opciones.disco.listar().find((t) => t.id === tarea.id);
    const limpiar = await olvidarSiNoSePuedeAbrir(tarea.proyecto.raiz, actual?.sesion);
    // Las TRES reglas, aquí también: por este camino se llega cuando `correr` se rompió por
    // su cuenta, y era el único de los cuatro que perdía el registro de lo autorizado.
    const conLoQueQuede = (t: Tarea): Tarea =>
      conVeredicto(conAutorizadas(limpiar ? sinSesion(t) : t, autorizadas), veredicto);
    aparcar(tarea.id, motivo, conLoQueQuede);
  };

  /**
   * Que el juez no se pueda usar es fallo del ENTORNO, y el motivo tiene que decirlo.
   *
   * `ErrorDelJuezDeTarea` ya se nombra a sí mismo y ya trae, cuando lo hay, el mensaje
   * accionable —el de CONSTRUIR el modelo: «falta la credencial para nvidia
   * (NVIDIA_API_KEY); usa /provider nvidia»—, así que se usa tal cual y no se le pone otro
   * prefacio encima. Cualquier otra cosa que lance el puerto se nombra desde aquí: un
   * motivo que no dijera quién falló mandaría a buscar el problema en el trabajo del
   * agente.
   */
  const motivoDelJuez = (error: unknown): string =>
    error instanceof ErrorDelJuezDeTarea
      ? unaLinea(error)
      : `no se pudo consultar al juez de QA (${sinRutas(error)})`;

  /**
   * **LA PUERTA DE LA ENTREGA**: qué impide dar la tarea por terminada, o `undefined` si
   * nada lo impide.
   *
   * Las condiciones las comprueba el CÓDIGO y el juez opina, y hacen falta las dos: es la
   * regla que este repo ya tenía escrita para la subida autónoma
   * (`core/cloudstudio.ts#PoliticaDeAprobacion`), y el motivo es el mismo por el que los
   * avisos de honestidad son código y no prompt — a un modelo se le puede pedir que avise y
   * a veces no avisa. Quién DECIDE es `core/entrega.ts`, que es puro; aquí solo se mide.
   *
   * **Al juez se le pregunta DESPUÉS de medir, y solo si las condiciones pasan.** Cada
   * consulta es una llamada al modelo del papel `afilado`, el más caro del reparto, y
   * gastarla para tapar un hecho que ya se sabe es gastarla para nada. `decisionDeEntrega`
   * vuelve a comprobar las condiciones de todas formas: la garantía no puede depender de
   * que quien llama lo haya hecho en este orden.
   */
  const puertaDeEntrega = async (
    tarea: Tarea,
    sesion: string,
    entrada: EnVuelo,
    resultado: ResultadoDeTurno | undefined,
    /** Espera a que la ref de la sesión esté escrita, si quien abrió sabe hacerlo. */
    esperarMarca?: () => Promise<void>
  ): Promise<Entrega> => {
    /**
     * Antes de preguntarle a git, esperar a que git haya acabado de escribir.
     *
     * `volcar()` (`vestibulo.ts`) apunta la ref de la sesión sin aguardarla, y medido con
     * git de verdad la ref todavía no estaba cuando esto medía: `cambiosDeSesion` devolvía
     * `sin-marca` y **toda** tarea se aparcaba diciendo que nadie podía revisarla, en
     * proyectos donde sí se podía. La espera está AQUÍ y no en `cerrar()` porque quien la
     * necesita es esto: cerrar un proyecto estando sentado delante no puede pasar a
     * aguardar un `write-tree` del árbol entero.
     */
    await esperarMarca?.().catch(() => undefined);
    let revision: RevisionDeSesion = { revisable: false };
    try {
      revision = await opciones.revisable(tarea.proyecto.raiz, sesion);
    } catch {
      // Ni preguntarlo se pudo (en producción es git). Entonces no se sabe, y no se
      // entrega: la única dirección posible aquí, y la misma que toma el resto del fichero.
      revision = { revisable: false };
    }
    const medida = medidaDeEntrega(resultado, revision);
    const condiciones = condicionesDeEntrega(medida);
    if (!condiciones.entregable) return condiciones;
    /**
     * Y si el proceso se está yendo, NO se pregunta — y se dice la verdad de este caso, que
     * no es ninguna de las otras.
     *
     * Sin esta guarda, un Ctrl-C durante la consulta dejaba a la tarea colgada del plazo de
     * `parar()`; al agotarse se queda «en proceso» y la reconciliación del arranque
     * siguiente la aparca con `MOTIVO_CORTADA_POR_CIERRE`, que aquí sería FALSO: dice que
     * no quedó respuesta guardada, y el turno acabó y `volcar()` ya escribió su transcript.
     * Lo único que se interrumpió fue el juicio, y eso es lo que hay que poder leer.
     */
    if (parando) {
      return {
        entregable: false,
        motivo:
          "la consola se cerró antes de evaluar la entrega: el turno acabó y su conversación " +
          "está guardada; reintenta para que el juez la mire",
      };
    }
    let veredicto: VeredictoDeTarea | undefined;
    let fallo: unknown;
    let reventó = false;
    /**
     * La consulta, con PLAZO. Ver `TOPE_DEL_JUEZ_MS`: una llamada de modelo colgada dejaría
     * la tarea diciendo «en proceso» durante el plazo del SDK, con su hueco y su proyecto
     * ocupados y sin que nadie pueda saber por qué.
     */
    const consulta = opciones.juez
      .juzgar({
        encargo: tarea.encargo,
        // Normalizadas por el MISMO sitio que las guarda en el índice, así que el juez ve
        // exactamente las rutas que verá la persona — relativas, sin repetidos y sin la
        // barra del backend virtual.
        autorizadas: conAutorizadas(tarea, entrada.autorizadas ?? []).autorizadas ?? [],
        verificador: medida.verificador,
        ...(medida.hallazgos === undefined ? {} : { hallazgos: medida.hallazgos }),
      })
      .then((v) => void (veredicto = v))
      .catch((error: unknown) => {
        reventó = true;
        fallo = error;
      });
    if (!(await conPlazo(consulta, opciones.esperaDelJuez ?? TOPE_DEL_JUEZ_MS))) {
      return {
        entregable: false,
        motivo: `el juez de QA no contestó en ${Math.round((opciones.esperaDelJuez ?? TOPE_DEL_JUEZ_MS) / 1000)} s`,
      };
    }
    if (reventó) return { entregable: false, motivo: motivoDelJuez(fallo) };
    entrada.veredicto = veredicto;
    return decisionDeEntrega(medida, veredicto);
  };

  /**
   * Comprueba que la tarea salió de `nuevo`, y si no, renuncia a ella. Ver `renunciadas`.
   */
  const renunciarSiSigueNueva = (id: string, error?: unknown): void => {
    // Renunciar dos veces es renunciar una: el camino de la marca que no se pudo escribir
    // pasa por aquí con el error de verdad y otra vez, más abajo, sin él — y ese segundo
    // aviso salía con «error» en vez del `EACCES` que es justo el dato que sirve. Dos avisos
    // para un hecho, y el segundo peor que el primero, es cómo se enseña a no leerlos.
    if (renunciadas.has(id)) return;
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
    /**
     * Lo que el turno informó de sí mismo, o `undefined` si no informó — que es «no se
     * sabe» y NO «todo bien» (`medidaDeEntrega`). De aquí sale la medida de la entrega.
     */
    let resultado: ResultadoDeTurno | undefined;
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
        // La lista nace AQUÍ, cuando ya se sabe que el turno va a correr: hasta este punto
        // «no consta» es la verdad. Se acumula aunque el turno reviente —`preguntar` corta
        // lanzando— porque lo que se autorizó antes se autorizó.
        entrada.autorizadas = [];
        resultado =
          (await consola.correrTarea(
            tarea.encargo,
            (m) => void (motivo ??= m),
            (ficheros) => void entrada.autorizadas?.push(...ficheros)
          )) ?? undefined;
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
     * **Y aquí «terminada» deja de significar «el turno acabó».**
     *
     * Solo se pasa por la puerta si no hay ya un motivo: una tarea que se aparcó por su
     * cuenta —el agente preguntó y no había nadie, la consola se cerró a mitad— ya tiene el
     * motivo que explica de verdad qué pasó, y preguntarle al juez sobre un trabajo que se
     * cortó a mitad gastaría una llamada del modelo más caro para taparlo.
     */
    if (motivo === undefined) {
      const entrega = await puertaDeEntrega(tarea, hilo, entrada, resultado, consola.esperarMarca?.bind(consola));
      motivo = entrega.motivo;
      // Con qué condición de MENOS se entregó, si fue el caso: viaja pegada al veredicto,
      // porque una entrega con una condición menos no puede parecer una entrega normal y el
      // `motivo` de una tarea terminada no existe (`conEstado` lo borra, a propósito).
      if (entrega.salvedad !== undefined && entrada.veredicto !== undefined) {
        entrada.veredicto = { ...entrada.veredicto, salvedad: entrega.salvedad };
      }
    }
    /**
     * El estado final, y **el camino de error pasa por lo mismo que el bueno**: la regla de
     * `sesion` y la consola cerrada. Aquí ya se sabe si el turno dejó conversación —`cortar()`
     * acaba de volcarla—: uno que no emitió un solo acto cierra sin volcar nada, y entonces su
     * id no nombra nada abrible (ver `olvidarSiNoSePuedeAbrir`).
     */
    // La regla se resuelve UNA vez y fuera del `try` de la escritura: así el camino de error
    // reusa la decisión en vez de volver a preguntar —y a olvidar— el mismo hilo dos veces.
    //
    // Y lo AUTORIZADO se compone en la misma transformación, por el mismo motivo por el que
    // la regla de `sesion` vive aquí: los CUATRO finales —terminada, aparcada, el error de la
    // escritura final y el último recurso de `revisar`— pasan por lo mismo, así que ninguno
    // puede quedarse sin registrar lo que la tarea autorizó. Va sobre la tarea RELEÍDA del
    // disco (`escribirSiSigueSiendoNuestra` le pasa la actual), no sobre la que se despachó,
    // para no pisar lo que el cable cambiara entre medias.
    let conLoQueQuede: (t: Tarea) => Tarea = (t) =>
      conVeredicto(conAutorizadas(t, entrada.autorizadas), entrada.veredicto);
    try {
      if (await olvidarSiNoSePuedeAbrir(tarea.proyecto.raiz, hilo)) {
        conLoQueQuede = (t) =>
          sinSesion(conVeredicto(conAutorizadas(t, entrada.autorizadas), entrada.veredicto));
      }
    } catch {
      // Ni preguntar se pudo: no se sabe, y entonces no se borra nada.
    }
    try {
      // Aparcada si algo pidió a una persona o si la puerta de la entrega no la dejó pasar;
      // terminada si acabó limpia Y pasó la puerta. «Terminada» ya NO significa «el turno
      // acabó»: significa que las tres condiciones se midieron en verde y que el juez de QA
      // dijo que el trabajo hace lo que se pedía. Ver `puertaDeEntrega`.
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
      // Sin `autorizadas`: no está puesta hasta que el turno arranca, que es lo que
      // distingue «no consta» de «no autorizó nada».
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
          await aparcarMirandoLaSesion(
            tarea,
            `el corredor no pudo con ella (${codigoDe(error)})`,
            entrada.autorizadas,
            entrada.veredicto
          ).catch(() => undefined);
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
