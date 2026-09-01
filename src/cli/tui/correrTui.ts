/**
 * El montaje de la TUI: la Consola que la app Ink implementa y el arranque/desmontaje.
 * Todo lo demás (el lazo de comandos, el estado de sesión, el ejecutor real) es EL MISMO de
 * `consola.ts` y `main.ts` — entra INYECTADO, porque `main.ts` importa este fichero y un
 * import al revés sería un ciclo: la TUI solo aporta piel, entrada, preguntas y
 * aprobaciones.
 */
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { basename } from "node:path";
import { execFileSync } from "node:child_process";
import { render } from "ink";
import { createElement } from "react";
import { createTokenTracker, type TokenTracker } from "../../vendor/tokenTracking.js";
import { PAPELES, parsear, resolver, type FuentesDeEleccion } from "../../core/modelos.js";
import type { Papel } from "../../core/ports.js";
import type { Piel } from "../../core/turno.js";
import { ficherosDelProyecto, type SesionReal } from "../../agent/turnoReal.js";
import { inspeccionar } from "../../agent/entorno.js";
import {
  correrConsola,
  crearCompleter,
  type Consola,
  type EjecutorDeTurno,
  type EstadoDeSesion,
} from "../consola.js";
import { crearStore, crearRanura, vistaInicial, type Acto, type VistaDeTui } from "./store.js";
import { crearPielTui } from "./pielTui.js";
import { pedirDecisionesTui } from "./aprobarTui.js";
import type { DatosDeSidebar } from "./sidebar.js";
import { App } from "./app.js";

/**
 * La versión, para la sidebar. Tres niveles arriba tanto desde `src/cli/tui/` (tsx en
 * desarrollo) como desde `dist/cli/tui/` (el build): misma profundidad, misma lectura.
 */
function versionDePaquete(): string {
  try {
    const paquete = JSON.parse(readFileSync(new URL("../../../package.json", import.meta.url), "utf8")) as {
      version?: string;
    };
    return paquete.version ?? "?";
  } catch {
    return "?";
  }
}
const VERSION = versionDePaquete();

/**
 * La rama git del proyecto, leída UNA vez al montar (una sesión no cambia de rama sin
 * que el agente pase por ahí, y refrescarla en cada repintado sería un `git` por frame).
 * Un fallo —no es repo, no hay git— es simplemente «sin rama»: la sidebar la omite.
 */
function ramaDeGit(raiz: string): string | undefined {
  try {
    return (
      execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
        cwd: raiz,
        stdio: ["ignore", "pipe", "ignore"],
      })
        .toString()
        .trim() || undefined
    );
  } catch {
    return undefined;
  }
}

export interface OpcionesDeConsolaTui {
  raiz: string;
  /** Fuentes del modelo de sesión: deciden el modelo que la sidebar enseña al arrancar. */
  fuentes?: FuentesDeEleccion;
  /** Costura de test: los tests no preguntan a git. */
  rama?: string;
  /** El tope de contexto del modelo actual (proyecto > global), como lo declara /config. */
  topeDe?: (id: string) => number | undefined;
}

/**
 * La Consola completa que la TUI implementa: una cola async de líneas (lo que entra por
 * la Entrada), un `escribir` que cae en el store, la piel TUI, las preguntas por la
 * misma entrada y las aprobaciones por el modal. Devuelve también las piezas que `App`
 * necesita pintar, porque todas comparten ESTE cierre (store, cola, historial): quien
 * reparte a mano acabarían siendo dos mundos.
 */
export function crearConsolaTui(opciones: OpcionesDeConsolaTui) {
  const { raiz, fuentes = {}, rama, topeDe } = opciones;
  const store = crearStore();
  const vista = crearRanura<VistaDeTui>(vistaInicial());

  // La cola de `lineas`: lo que la Entrada envía y `correrConsola` consume. Si nadie
  // espera todavía, la línea espera en `cola`; si hay un `next` colgado, se despierta.
  const cola: string[] = [];
  const esperando: ((r: IteratorResult<string>) => void)[] = [];

  // Contrato de Entrada: historial[0] es la MÁS RECIENTE. Se guarda ya invertido y se
  // pasa por REFERENCIA (la app lo lee en cada render, no una copia congelada).
  const historial: string[] = [];

  // Lo que la sidebar enseña. `tracker` empieza en cero y se REASIGNA al de la sesión
  // real cuando el ejecutor la abre (mismo patrón que `entrarEnConsola`); el modelo
  // cambia EN CALIENTE con /modelo, y el eco de `escribir` es la única costura que
  // tienen los manejadores de consola.ts para avisar — las mismas frases que stdio.
  const elegido = resolver(fuentes).trabajo;
  let modeloTrabajo = `${elegido.proveedor}/${elegido.modelo}`;
  const papeles: Partial<Record<Papel, string>> = { trabajo: modeloTrabajo };
  let tracker: TokenTracker = createTokenTracker();

  const enviar = (linea: string): void => {
    historial.unshift(linea);
    // El eco de lo escrito: el turno no repite la petición, y el transcript se lo debe
    // a quien la tecleó, no al motor.
    store.usuario(linea);
    const despertar = esperando.shift();
    if (despertar !== undefined) despertar({ value: linea, done: false });
    else cola.push(linea);
  };

  // Ctrl-C durante un turno: no hay AbortController en el motor, así que la cancelación
  // es un PUNTO DE CANCELACIÓN en la piel — el siguiente acto del turno lanza y el
  // motor aborta el consumo (el paso en marcha termina; nada suyo se pierde a medias).
  let cancelarPendiente = false;
  const puntoDeCancelacion = (): void => {
    if (!cancelarPendiente) return;
    cancelarPendiente = false;
    throw new Error("turno cancelado (Ctrl-C)");
  };

  const detectarCambiosDeModelo = (texto: string): void => {
    // Las MISMAS frases que el `escribir` de stdio mira para reimprimir su barra: aquí
    // actualizan la sidebar. El acuse de /modelo es una sola llamada a `escribir`.
    const losTres = /^modelo \(los tres papeles\): (.+)\n$/.exec(texto);
    if (losTres) {
      modeloTrabajo = losTres[1]!;
      for (const p of PAPELES) papeles[p] = modeloTrabajo;
      return;
    }
    const uno = /^modelo (rapido|trabajo|afilado): (.+)\n$/.exec(texto);
    if (uno) {
      const papel = uno[1] as Papel;
      papeles[papel] = uno[2]!;
      if (papel === "trabajo") modeloTrabajo = uno[2]!;
    }
  };

  const consola: Consola = {
    interactivo: true,
    lineas: {
      [Symbol.asyncIterator]() {
        return {
          next: () =>
            cola.length > 0
              ? Promise.resolve({ value: cola.shift()!, done: false as const })
              : new Promise<IteratorResult<string>>((resuelto) => esperando.push(resuelto)),
        };
      },
    },
    escribir: (texto) => {
      if (texto === "") return;
      detectarCambiosDeModelo(texto);
      // El chunk de consola puede traer varias líneas (los comandos escriben bloques):
      // cada una es un acto, como lo sería en el scrollback de stdio.
      for (const linea of texto.replace(/\n$/, "").split("\n")) store.linea(linea, "sistema");
    },
    preguntar: async (pregunta) => {
      // El enunciado queda en el transcript (como el prompt de stdio) y la respuesta
      // entra por la misma TUI: un solo teclado a la vez.
      store.linea(pregunta, "sistema");
      return new Promise<string>((resuelto) => {
        vista.mutar({ pregunta: { texto: pregunta, oculto: false, responder: resuelto } });
      });
    },
    leerSecreto: async (pregunta) => {
      store.linea(pregunta, "sistema");
      return new Promise<string>((resuelto) => {
        vista.mutar({ pregunta: { texto: pregunta, oculto: true, responder: resuelto } });
      });
    },
    piel: (): Piel => {
      // REARME por turno: ambos ejecutores (real y guionizado) llaman `piel()` UNA vez
      // al empezar el turno y antes de ningún acto, así que este es el inicio exacto del
      // turno nuevo. Una Ctrl-C que aterrizó tarde en el turno ANTERIOR (tras su último
      // acto) muere aquí en vez de matar el primer acto del turno que no la pidió; y una
      // Ctrl-C DURANTE el turno actual vuelve a poner el flag después de este rearme.
      cancelarPendiente = false;
      const base = crearPielTui(store);
      return {
        token: (t) => {
          puntoDeCancelacion();
          base.token(t);
        },
        linea: (t) => {
          puntoDeCancelacion();
          base.linea(t);
        },
        fase: (t) => {
          puntoDeCancelacion();
          base.fase?.(t);
        },
        fin: (ms) => {
          puntoDeCancelacion();
          base.fin(ms);
        },
        notificacion: (t) => {
          puntoDeCancelacion();
          base.notificacion?.(t);
        },
        // cerrarLinea NUNCA cancela: la llama el `finally` del motor para no dejar la
        // línea de tokens abierta, y un lanzamiento ahí sustituiría el error real.
        cerrarLinea: () => base.cerrarLinea(),
        // En la pausa manda el MODAL: su Ctrl-C ya es fail-closed (rechazo).
        pausa: (p) => base.pausa(p),
      };
    },
    aprobacionesTui: (pendientes, ficheros, diffs) =>
      pedirDecisionesTui(pendientes, ficheros, diffs, (props) => {
        // El cierre del modal es quien sabe que ya no hay nada pendiente: desmonta el
        // modal y rearma el store. Tolerante a doble `alTerminar` (ráfaga de teclas).
        vista.mutar({
          modal: {
            ...props,
            alTerminar: (decisiones) => {
              vista.mutar({ modal: null });
              store.rearmar();
              props.alTerminar(decisiones);
            },
          },
        });
        store.pausa();
      }),
  };

  const datosSidebar = (): DatosDeSidebar => {
    const tope = topeDe?.(modeloTrabajo);
    return {
      contexto: tracker.contexto,
      // Un tope 0 es un tope que no se sabe: porcentaje sobre cero es NaN, así que no
      // hay tope — la regla «porcentaje SOLO con tope» de core/contextos.ts.
      tope: tope !== undefined && tope > 0 ? tope : undefined,
      modelo: modeloTrabajo,
      modelosPorPapel: { ...papeles },
      proyecto: basename(raiz),
      rama,
      version: VERSION,
    };
  };

  return {
    consola,
    store,
    vista,
    enviar,
    /** Lo que la Entrada/Pregunta llama con la línea final: resuelve la pregunta viva. */
    responder: (linea: string): void => {
      const pregunta = vista.ver().pregunta;
      if (pregunta === null) return;
      vista.mutar({ pregunta: null });
      pregunta.responder(linea);
    },
    /** Ctrl-C durante un turno: la piel del turno en curso lanza en su próximo acto. */
    cancelar: (): void => {
      cancelarPendiente = true;
    },
    /** La costura por la que el ejecutor real apunta la sidebar a su tracker. */
    alAbrirSesion: (sesion: SesionReal): void => {
      tracker = sesion.tracker;
    },
    actos: (): Acto[] => store.estado().actos,
    historial,
    // El completer SIN voz propia: `crearCompleter` pinta las pistas él mismo cuando hay
    // varios candidatos, y aquí las pinta la Entrada — escribir nulo, o saldrían dos veces.
    completa: crearCompleter(() => {}, () => ficherosDelProyecto(raiz)),
    datosSidebar,
  };
}

export interface OpcionesDeMontaje {
  fuentes: FuentesDeEleccion;
  raiz: string;
  guion: boolean;
  /** La inspección del prólogo; el real ejecuta el simulador y entra por omisión. */
  inspeccionarProyecto?: (raiz: string) => Promise<{ colecciones: number; esProyectoXone: boolean }>;
  /** El asistente de creación de proyecto; desde `main.ts`, para no duplicarlo. */
  ofrecer?: (raiz: string, consola: Consola) => Promise<boolean>;
  /**
   * La fábrica del ejecutor REAL (`crearEjecutorReal` en main.ts), inyectada y llamada
   * UNA vez: su cierre guarda la sesión entre turnos. Con `--guion` (o sin fábrica) el
   * lazo cae en `ejecutarTurnoGuionizado`, el valor por omisión de `correrConsola`.
   */
  crearEjecutor?: (alAbrirSesion: (sesion: SesionReal) => void) => EjecutorDeTurno;
  topeDe?: (id: string) => number | undefined;
}

export async function correrConsolaTui(opciones: OpcionesDeMontaje): Promise<number> {
  const { fuentes, raiz, guion, inspeccionarProyecto = inspeccionar, ofrecer, crearEjecutor, topeDe } = opciones;
  const montaje = crearConsolaTui({ raiz, fuentes, rama: ramaDeGit(raiz), topeDe });
  const { consola, store, vista, enviar, responder, cancelar, completa, historial, datosSidebar } = montaje;

  // exitOnCtrlC: false OBLIGATORIO — Ctrl-C es un gesto con significado aquí (cancelar
  // el turno, rechazar en el modal), no «mata la app y deja la promesa del modal colgada».
  const instancia = render(
    createElement(App, {
      store: montaje.store,
      vista,
      alEnviar: enviar,
      responder,
      completa,
      historial,
      datosSidebar,
      alCancelarTurno: cancelar,
    }),
    { exitOnCtrlC: false }
  );

  try {
    // El prólogo que `entrarEnConsola` hace en stdio, pero contra la TUI YA montada:
    // los avisos y las preguntas del asistente de creación salen por el store y la
    // ranura de pregunta, no por stdout (que ensuciaría la pantalla de ink).
    let entorno = await inspeccionarProyecto(raiz);
    if (!entorno.esProyectoXone) {
      consola.escribir(`✗ ${basename(raiz)} no es un proyecto XOne (falta app.xml)\n`);
      if (ofrecer !== undefined && process.stdin.isTTY === true && (await ofrecer(raiz, consola))) {
        entorno = await inspeccionarProyecto(raiz);
      }
    }

    // Mismo patrón de prefijo que run.ts y el manejador /nuevo de consola.ts.
    const estado: EstadoDeSesion = { hilo: `xonecode-${randomUUID()}`, raiz, fuentes };

    const ejecutorBase =
      guion || crearEjecutor === undefined ? undefined : crearEjecutor(montaje.alAbrirSesion);
    // La envoltura de ocupación: un turno más, y la Entrada se desactiva y Ctrl-C pasa
    // a cancelar. La fábrica se creó UNA vez arriba; aquí solo se envuelve.
    const ejecutar: EjecutorDeTurno | undefined =
      ejecutorBase === undefined
        ? undefined
        : (peticion, estadoTurno, consolaTurno) => {
            vista.mutar({ ocupado: true });
            return ejecutorBase(peticion, estadoTurno, consolaTurno).finally(() => {
              vista.mutar({ ocupado: false });
            });
          };

    return await correrConsola(consola, estado, ejecutar);
  } finally {
    // Nunca un terminal roto: se desmonta también si revienta el prólogo o un turno.
    instancia.unmount();
  }
}
