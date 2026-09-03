/**
 * El montaje de la TUI: la Consola que la app Ink implementa y el arranque/desmontaje.
 * Todo lo demás (el lazo de comandos, el estado de sesión, el ejecutor real) es EL MISMO de
 * `consola.ts` y `main.ts` — entra INYECTADO, porque `main.ts` importa este fichero y un
 * import al revés sería un ciclo: la TUI solo aporta piel, entrada, preguntas y
 * aprobaciones.
 */
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { basename, sep } from "node:path";
import { homedir } from "node:os";
import { execFileSync } from "node:child_process";
import { render } from "ink";
import { createElement } from "react";
import { createTokenTracker, type TokenTracker } from "../../vendor/tokenTracking.js";
import { PAPELES, parsear, resolver, type FuentesDeEleccion } from "../../core/modelos.js";
import type { CatalogoModelosPort, Papel } from "../../core/ports.js";
import type { Piel } from "../../core/turno.js";
import { ficherosDelProyecto, type SesionReal } from "../../agent/turnoReal.js";
import { inspeccionar } from "../../agent/entorno.js";
import {
  correrConsola,
  configurarModoInicial,
  crearCompleter,
  ejecutarTurnoGuionizado,
  hayCredencial,
  hayEstadoDeProyecto,
  MENSAJE_BIENVENIDA,
  MENSAJE_REANUDANDO,
  PETICION_REANUDAR_PROYECTO,
  type Consola,
  type EjecutorDeTurno,
  type EstadoDeSesion,
} from "../consola.js";
import { asistenteDeModelo } from "../wizardInicial.js";
import { guardarCredencial } from "../../agent/authEnDisco.js";
import { cargar } from "../../agent/configEnDisco.js";
import { modeloDeAcuse } from "../acuseDeModelo.js";
import { crearStore, crearRanura, vistaInicial, type Acto, type VistaDeTui } from "./store.js";
import { crearPielTui } from "./pielTui.js";
import { aplicarTemaInk } from "./temaInk.js";
import { seleccionarTema, temaActivo } from "../tema.js";
import { pedirDecisionesTui } from "./aprobarTui.js";
import type { DatosDeSidebar } from "./sidebar.js";
import { App } from "./app.js";
import { crearEmisorDeRueda, crearStdinSinRaton, entrarEnModos, type StdinParaInk } from "./raton.js";

/**
 * La raíz con el HOME abreviado a `~`, para el pie: `/Users/x/dev/MinitMT` sale como
 * `~/dev/MinitMT`. La ruta absoluta entera es ruido —y en una captura de pantalla, el
 * nombre de usuario— y el pie tiene sitio contado. Pura, con `home` inyectable: así se
 * prueba sin depender del HOME de quien corre los tests.
 *
 * Solo el PREFIJO, y solo si es el home entero o el home seguido de separador:
 * `/Users/xy` no empieza por `/Users/x` como carpeta, aunque sí como texto.
 */
export function abreviarHome(ruta: string, home: string = homedir()): string {
  if (ruta === home) return "~";
  if (home !== "" && ruta.startsWith(home + sep)) return `~${ruta.slice(home.length)}`;
  return ruta;
}

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
  /** El montaje de `main` comparte esta instancia con la consola stdio. */
  catalogoModelos: CatalogoModelosPort;
  /** Persistencia inyectada: la piel no conoce el adaptador de disco de `agent/`. */
  guardarModeloGlobal: Consola["guardarModeloGlobal"];
  guardarTemaDeProyecto?: NonNullable<Consola["guardarTemaDeProyecto"]>;
  conectarCloudStudio?: Consola["conectarCloudStudio"];
  guardarCloudStudioDeProyecto?: Consola["guardarCloudStudioDeProyecto"];
  guardarModoDeProyecto?: Consola["guardarModoDeProyecto"];
  guardarProyectoCloudStudioDeProyecto?: Consola["guardarProyectoCloudStudioDeProyecto"];
  ramasDeCloudStudio?: Consola["ramasDeCloudStudio"];
  guardarRamaDeProyecto?: Consola["guardarRamaDeProyecto"];
  guardarModelosDeProyecto?: Consola["guardarModelosDeProyecto"];
  /** Sincronización con CloudStudio inyectada desde `main.ts`: la TUI no conoce MCP ni git. */
  sincronizar?: Consola["sincronizar"];
  /** Fuentes del modelo de sesión: deciden el modelo que la sidebar enseña al arrancar. */
  fuentes?: FuentesDeEleccion;
  /** Costura de test: los tests no preguntan a git. */
  rama?: string;
  /** El tope de contexto del modelo actual (proyecto > global), como lo declara /config. */
  topeDe?: (id: string) => number | undefined;
}

/**
 * La envoltura de ocupación: un turno más, Ctrl-C pasa a cancelarlo y la Entrada puede
 * encolar seguimiento. Exportada para probarla sin montar Ink — y aplicada a LOS DOS caminos de
 * ejecutor (el real y el guionizado por omisión): `--guion` fuerza `crearEjecutor` a
 * undefined, y un envoltorio solo para la rama real dejaba el turno guionizado sin
 * ocupación nunca.
 */
export function envolverConOcupacion(
  ejecutor: EjecutorDeTurno,
  ocupar: (ocupado: boolean) => void
): EjecutorDeTurno {
  return (peticion, estadoTurno, consolaTurno) => {
    ocupar(true);
    return ejecutor(peticion, estadoTurno, consolaTurno).finally(() => ocupar(false));
  };
}

/**
 * La Consola completa que la TUI implementa: una cola async de líneas (lo que entra por
 * la Entrada), un `escribir` que cae en el store, la piel TUI, las preguntas por la
 * misma entrada y las aprobaciones por el modal. Devuelve también las piezas que `App`
 * necesita pintar, porque todas comparten ESTE cierre (store, cola, historial): quien
 * reparte a mano acabarían siendo dos mundos.
 */
export function crearConsolaTui(opciones: OpcionesDeConsolaTui) {
  const {
    raiz,
    fuentes = {},
    rama,
    topeDe,
    catalogoModelos,
    guardarModeloGlobal,
    guardarTemaDeProyecto,
    conectarCloudStudio,
    guardarCloudStudioDeProyecto,
    guardarModoDeProyecto,
    guardarProyectoCloudStudioDeProyecto,
    ramasDeCloudStudio,
    guardarRamaDeProyecto,
    guardarModelosDeProyecto,
    sincronizar,
  } = opciones;
  const store = crearStore();
  const vista = crearRanura<VistaDeTui>(vistaInicial());
  // main ya resolvió el tema del config de proyecto antes de cargar Ink.
  aplicarTemaInk(temaActivo());

  // La cola de `lineas`: lo que la Entrada envía y `correrConsola` consume. Si nadie
  // espera todavía, la línea espera en `cola`; si hay un `next` colgado, se despierta.
  const cola: Array<{ linea: string; diferida: boolean }> = [];
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
  let cancelarReal: (() => void) | undefined;
  let cancelarPendiente = false;
  const cancelarTurno = (): void => {
    cancelarPendiente = true;
    cancelarReal?.();
  };

  const enviar = (linea: string): void => {
    const enCola = vista.ver().ocupado;
    historial.unshift(linea);
    // Salir no puede quedarse detrás de una llamada al modelo que ya no progresa. Se
    // descartan los seguimientos y se deja este comando el primero que verá el lazo tras
    // abortar el stream activo.
    if (enCola && linea.trim() === "/salir") {
      cola.length = 0;
      cola.push({ linea, diferida: false });
      vista.mutar({ enCola: [] });
      cancelarTurno();
      return;
    }
    // El eco de lo escrito: el turno no repite la petición, y el transcript se lo debe
    // a quien la tecleó, no al motor.
    // Una petición diferida NO entra aún en el transcript: el turno actual puede seguir
    // escribiendo durante minutos y separaría su futura respuesta de la pregunta.
    if (enCola) {
      cola.push({ linea, diferida: true });
      vista.mutar({ enCola: [...vista.ver().enCola, linea] });
      return;
    }
    store.usuario(linea);
    const despertar = esperando.shift();
    if (despertar !== undefined) despertar({ value: linea, done: false });
    else cola.push({ linea, diferida: false });
  };

  // La piel conserva este punto cooperativo para el guionizado; la sesión real además
  // recibe un AbortSignal, que corta incluso si el modelo no produce más eventos.
  const puntoDeCancelacion = (): void => {
    if (!cancelarPendiente) return;
    cancelarPendiente = false;
    throw new Error("turno cancelado (Ctrl-C)");
  };

  const detectarCambiosDeModelo = (texto: string): void => {
    // El acuse de /modelo se escribe y se lee por el MISMO módulo que `consola.ts`
    // (`acuseDeModelo.ts`): aquí solo se le aplica a la sidebar.
    const acuse = modeloDeAcuse(texto);
    if (acuse === undefined) return;
    if (acuse.papel === undefined) {
      modeloTrabajo = acuse.modelo;
      for (const p of PAPELES) papeles[p] = modeloTrabajo;
      return;
    }
    papeles[acuse.papel] = acuse.modelo;
    if (acuse.papel === "trabajo") modeloTrabajo = acuse.modelo;
  };

  const consola: Consola = {
    interactivo: true,
    lineas: {
      [Symbol.asyncIterator]() {
        return {
          next: () =>
            cola.length > 0
              ? Promise.resolve().then(() => {
                  const entrada = cola.shift()!;
                  if (entrada.diferida) {
                    store.usuario(entrada.linea);
                    vista.mutar({ enCola: vista.ver().enCola.slice(1) });
                  }
                  return { value: entrada.linea, done: false as const };
                })
              : new Promise<IteratorResult<string>>((resuelto) => esperando.push(resuelto)),
        };
      },
    },
    catalogoModelos,
    guardarModeloGlobal,
    guardarTemaDeProyecto,
    conectarCloudStudio,
    guardarCloudStudioDeProyecto,
    guardarModoDeProyecto,
    guardarProyectoCloudStudioDeProyecto,
    ramasDeCloudStudio,
    guardarRamaDeProyecto,
    guardarModelosDeProyecto,
    sincronizar,
    aplicarTema: (tema) => {
      seleccionarTema(tema);
      aplicarTemaInk(tema);
      // La paleta Ink es un objeto estable; esta mutación observable obliga a React a
      // repintar todos los consumidores que lo importan.
      vista.mutar({ ocupado: vista.ver().ocupado });
    },
    seleccionar: async (selector) =>
      new Promise<string | undefined>((resuelto) => {
        vista.mutar({
          selector: {
            ...selector,
            responder: resuelto,
          },
        });
      }),
    escribir: (texto) => {
      // El guard cubre whitespace, no solo la cadena vacía: un `escribir("\n")`
      // (la forma de «línea sin contenido») partía en un acto sistema vacío.
      if (texto.trim() === "") return;
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
      // El modelo que etiqueta el «■ modelo · Ns» del fin: el de trabajo VIGENTE, leído
      // cuando el fin ocurre (ver pielTui.ts).
      const base = crearPielTui(store, () => modeloTrabajo);
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
      tokenIn: tracker.input,
      tokenOut: tracker.output,
      // Un tope 0 es un tope que no se sabe: porcentaje sobre cero es NaN, así que no
      // hay tope — la regla «porcentaje SOLO con tope» de core/contextos.ts.
      tope: tope !== undefined && tope > 0 ? tope : undefined,
      modelo: modeloTrabajo,
      modelosPorPapel: { ...papeles },
      proyecto: basename(raiz),
      ruta: abreviarHome(raiz),
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
    /** Resuelve el selector visible; Enter entrega un id y Escape `undefined`. */
    seleccionar: (id: string | undefined): void => {
      const selector = vista.ver().selector;
      if (selector === null) return;
      vista.mutar({ selector: null });
      selector.responder(id);
    },
    /** Ctrl-C durante un turno: la piel del turno en curso lanza en su próximo acto. */
    cancelar: (): void => {
      cancelarTurno();
    },
    /** La costura por la que el ejecutor real apunta la sidebar a su tracker. */
    alAbrirSesion: (sesion: SesionReal): void => {
      tracker = sesion.tracker;
      cancelarReal = () => sesion.cancelar();
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
  catalogoModelos: CatalogoModelosPort;
  guardarModeloGlobal: Consola["guardarModeloGlobal"];
  guardarTemaDeProyecto?: NonNullable<Consola["guardarTemaDeProyecto"]>;
  conectarCloudStudio?: Consola["conectarCloudStudio"];
  guardarCloudStudioDeProyecto?: Consola["guardarCloudStudioDeProyecto"];
  guardarModoDeProyecto?: Consola["guardarModoDeProyecto"];
  guardarProyectoCloudStudioDeProyecto?: Consola["guardarProyectoCloudStudioDeProyecto"];
  ramasDeCloudStudio?: Consola["ramasDeCloudStudio"];
  guardarRamaDeProyecto?: Consola["guardarRamaDeProyecto"];
  guardarModelosDeProyecto?: Consola["guardarModelosDeProyecto"];
  sincronizar?: Consola["sincronizar"];
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
  /** ¿Se captura el ratón para que la rueda mueva el transcript? `--sin-raton` lo apaga. Por omisión, sí. */
  raton?: boolean;
  /** `main` lo activa solo al entrar realmente por la TUI; los montajes de test no preguntan. */
  asistenteInicial?: boolean;
}

export async function correrConsolaTui(opciones: OpcionesDeMontaje): Promise<number> {
  const {
    fuentes,
    raiz,
    guion,
    catalogoModelos,
    guardarModeloGlobal,
    guardarTemaDeProyecto,
    conectarCloudStudio,
    guardarCloudStudioDeProyecto,
    guardarModoDeProyecto,
    guardarProyectoCloudStudioDeProyecto,
    ramasDeCloudStudio,
    guardarRamaDeProyecto,
    guardarModelosDeProyecto,
    sincronizar,
    inspeccionarProyecto = inspeccionar,
    ofrecer,
    crearEjecutor,
    topeDe,
    raton = true,
    asistenteInicial = false,
  } = opciones;
  const montaje = crearConsolaTui({
    raiz,
    fuentes,
    catalogoModelos,
    guardarModeloGlobal,
    guardarTemaDeProyecto,
    conectarCloudStudio,
    guardarCloudStudioDeProyecto,
    guardarModoDeProyecto,
    guardarProyectoCloudStudioDeProyecto,
    ramasDeCloudStudio,
    guardarRamaDeProyecto,
    guardarModelosDeProyecto,
    sincronizar,
    rama: ramaDeGit(raiz),
    topeDe,
  });
  const { consola, store, vista, enviar, responder, seleccionar, cancelar, completa, historial, datosSidebar } = montaje;

  // Los modos de terminal (pantalla alternativa y ratón) ANTES de montar Ink, para que el
  // primer frame ya caiga en la pantalla alternativa. Sin stdout TTY no escribe nada.
  const conRaton = raton && process.stdin.isTTY === true;
  const salirDeModos = entrarEnModos(process.stdout, { raton: conRaton });
  // «Nunca un terminal roto» también si el proceso muere por una excepción que no pasa
  // por aquí o por un `process.exit()` ajeno: sin esto el usuario se queda en la pantalla
  // alternativa, sin scrollback y con cada clic escupiendo secuencias. `exit` cubre eso
  // (los writes a un TTY son síncronos y llegan antes de morir); no cubre SIGTERM, y
  // Ctrl-C en modo crudo no es SIGINT sino una tecla. `salirDeModos` es idempotente.
  process.once("exit", salirDeModos);
  // El stdin que Ink lee lleva el ratón ya quitado: una secuencia de rueda que llegara a
  // `useInput` acabaría como texto en la Entrada. Sin ratón, el stdin real tal cual.
  const rueda = conRaton ? crearEmisorDeRueda() : undefined;
  const stdin =
    rueda === undefined ? undefined : crearStdinSinRaton(process.stdin as unknown as StdinParaInk, rueda.emitir);

  // exitOnCtrlC: false OBLIGATORIO — Ctrl-C es un gesto con significado aquí (cancelar
  // el turno, rechazar en el modal), no «mata la app y deja la promesa del modal colgada».
  const instancia = render(
    createElement(App, {
      store: montaje.store,
      vista,
      alEnviar: enviar,
      responder,
      responderSelector: seleccionar,
      completa,
      historial,
      datosSidebar,
      alCancelarTurno: cancelar,
      rueda,
    }),
    { exitOnCtrlC: false, ...(stdin === undefined ? {} : { stdin: stdin as unknown as NodeJS.ReadStream }) }
  );

  try {
    // El prólogo que `entrarEnConsola` hace en stdio, pero contra la TUI YA montada:
    // los avisos y las preguntas del asistente de creación salen por el store y la
    // ranura de pregunta, no por stdout (que ensuciaría la pantalla de ink).
    //
    // El asistente de cuenta va ANTES del alta de proyecto: es configuración de la
    // persona, no de la carpeta. Aquí (a diferencia de stdio) `consola.seleccionar` SÍ
    // existe, así que es la única piel donde este paso llega a preguntar algo hoy.
    // `let`: si el asistente o el alta escriben modelo (global o de proyecto), la sesión
    // tiene que arrancar sobre las fuentes YA recargadas, no las de antes de esa escritura
    // — es la misma regla que sigue `entrarEnConsola` en stdio.
    let fuentesDeSesion = fuentes;
    if (asistenteInicial) {
      await asistenteDeModelo(consola, {
        origenDeTrabajo: resolver(fuentes).trabajo.origen,
        hayCredencial: (proveedor) => hayCredencial(proveedor, raiz),
        guardarCredencial: (proveedor, clave) => guardarCredencial(proveedor, clave),
      });
      await configurarModoInicial(raiz, consola);
      const recargado = cargar(raiz);
      fuentesDeSesion = { ...fuentes, proyecto: recargado.config.proyecto, global: recargado.config.global };
    }
    let entorno = await inspeccionarProyecto(raiz);
    if (!entorno.esProyectoXone) {
      consola.escribir(`✗ ${basename(raiz)} no es un proyecto XOne (falta app.xml)\n`);
      if (ofrecer !== undefined && process.stdin.isTTY === true && (await ofrecer(raiz, consola))) {
        entorno = await inspeccionarProyecto(raiz);
      }
    }

    // Mismo patrón de prefijo que run.ts y el manejador /nuevo de consola.ts.
    const estado: EstadoDeSesion = { hilo: `xonecode-${randomUUID()}`, raiz, fuentes: fuentesDeSesion };

    const ejecutorBase =
      guion || crearEjecutor === undefined ? undefined : crearEjecutor(montaje.alAbrirSesion);
    // La envoltura de ocupación cubre LOS DOS caminos: el ejecutor real si lo hay, y
    // el guionizado por omisión si no — `--guion` fuerza `crearEjecutor` a undefined,
    // y sin envolver el default no habría turno marcado como activo ni cola durante ese modo.
    const ejecutar = envolverConOcupacion(
      ejecutorBase ?? ejecutarTurnoGuionizado,
      (ocupado) => vista.mutar({ ocupado })
    );

    // El estado de proyecto decide el prólogo. La petición de reanudación es de lectura
    // acotada y se pinta como un turno normal; nunca entra como mensaje del usuario.
    if (hayEstadoDeProyecto(raiz) && !guion && ejecutorBase !== undefined) {
      consola.escribir(MENSAJE_REANUDANDO);
      try {
        await ejecutar(PETICION_REANUDAR_PROYECTO, estado, consola);
      } catch (e) {
        consola.escribir(`${e instanceof Error ? `${e.constructor.name}: ${e.message}` : String(e)}\n`);
      }
    } else {
      // Saludo estático, común a stdio y TUI. No llega al LLM ni consume tokens.
      consola.escribir(MENSAJE_BIENVENIDA);
    }

    return await correrConsola(consola, estado, ejecutar);
  } finally {
    // Nunca un terminal roto: se desmonta también si revienta el prólogo o un turno, y
    // DESPUÉS se sale de los modos — el último frame de Ink debe caer aún en la pantalla
    // alternativa, y el terminal recuperar lo que tenía con el ratón ya suelto.
    try {
      instancia.unmount();
    } finally {
      salirDeModos();
      process.off("exit", salirDeModos);
    }
  }
}
