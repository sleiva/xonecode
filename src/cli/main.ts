/**
 * El despachador. Cada comando expone `cmdX(...)` y se registra aquí.
 *
 * Sin librería de argumentos a propósito: hoy hay un comando y una bandera, y una
 * dependencia más es una dependencia más que fijar y vigilar. Cuando haya cinco, se mete.
 */
import * as readline from "node:readline";
import { randomUUID } from "node:crypto";
import { basename } from "node:path";
import { cmdRun } from "./run.js";
import { cmdDescribe } from "./describe.js";
import { cmdConfig } from "./config.js";
import { cmdDoctor } from "./doctor.js";
import { cmdVerify } from "./verify.js";
import { type FuentesDeEleccion, ModeloMalEscrito, parsear, resolver } from "../core/modelos.js";
import { topeResuelto } from "../core/contextos.js";
import { aplicarAuth, cargar, guardarCloudStudioDeProyecto, guardarModeloGlobal, guardarTemaDeProyecto } from "../agent/configEnDisco.js";
import { conectarCloudStudio } from "../agent/cloudstudioMcp.js";
import {
  COMANDOS,
  correrConsola,
  crearCompleter,
  hayEstadoDeProyecto,
  MENSAJE_BIENVENIDA,
  MENSAJE_REANUDANDO,
  PETICION_REANUDAR_PROYECTO,
  type Consola,
  type EjecutorDeTurno,
  type EstadoDeSesion,
} from "./consola.js";
import { crearLeerSecreto, crearPreguntar, crearPielStdio, escribirEnStdout, type Escribir } from "./stdio.js";
import { crearTema, esTema, seleccionarTema } from "./tema.js";
import { pedirDecisiones } from "./aprobar.js";
import { modeloDeAcuse } from "./acuseDeModelo.js";
import { inspeccionar } from "../agent/entorno.js";
import { SkillsEnDisco } from "../agent/skills.js";
import { Modelos } from "../agent/modelos.js";
import { CatalogoModelos } from "../agent/catalogoModelos.js";
import { abrirSesionReal, ficherosDelProyecto, type SesionReal } from "../agent/turnoReal.js";
import { crearProyecto } from "../agent/crearProyecto.js";
import { type DatosDelProyecto } from "../core/esqueleto.js";
import { createTokenTracker, type TokenTracker } from "../vendor/tokenTracking.js";
import { compacto, formatearTokens, formatearTope } from "./tokens.js";

/**
 * Estilo, y solo con TTY detrás.
 *
 * Los códigos viven en `cli/tema.ts` — el único fichero con ANSI de todo `src/`,
 * vigilado por `cli/tema.test.ts` — y este fichero pide SIGNIFICADO (`tema.mudo`),
 * nunca color. Sin TTY el tema apagado lo convierte todo en cadena vacía, así que
 * las tuberías y los logs de CI quedan limpios sin ramificar por aquí.
 */
const CON_COLOR = process.stdout.isTTY === true;
const tema = crearTema(CON_COLOR);
const DIM = tema.mudo;
const BOLD = tema.negrita;
const RESET = tema.reset;

/** El prompt. Se ve dónde acaba la respuesta y empieza lo que uno escribe. */
const PROMPT = CON_COLOR ? `${tema.prompt}❯${tema.reset} ` : "> ";

/** El arranque automático falla como un turno normal: informa y deja la consola viva. */
function describirError(e: unknown): string {
  return e instanceof Error ? `${e.constructor.name}: ${e.message}` : String(e);
}

/**
 * Envuelve las líneas de `readline` para pintar la barra y el prompt ANTES de cada una.
 *
 * Hace falta un envoltorio porque `readline.Interface` es un `AsyncIterable` que NO pinta
 * el prompt por su cuenta al iterarlo: hay que llamar a `rl.prompt()` a mano, y el sitio
 * correcto es justo antes de esperar cada línea. Iterándolo a pelo —como estaba— la consola
 * no enseña nada y parece colgada.
 *
 * Sin TTY no se pinta ni barra ni prompt: en una tubería son ruido que ensucia la salida
 * que alguien va a comparar o a parsear.
 */
async function* conPrompt(
  rl: readline.Interface,
  escribir: Escribir,
  barra: () => string
): AsyncIterable<string> {
  if (CON_COLOR) {
    escribir(barra());
    rl.prompt();
  }
  for await (const linea of rl) {
    yield linea;
    // Tras el turno o el comando, la barra vuelve a decir dónde estás: el modelo puede
    // haber cambiado con /modelo y los tokens haber subido.
    if (CON_COLOR) {
      escribir(barra());
      rl.prompt();
    }
  }
}

const AYUDA = `xonecode — harness de XOne

  xonecode                       lanza la consola TUI (por defecto)
  xonecode --no-tui              consola clásica (stdio)
  xonecode run "<peticion>"      un turno, de un disparo (pipeable)
  xonecode run --real "<peticion>"   el agente real sobre el proyecto del cwd
  xonecode describe              qué hay montado y qué es de pega (sin red)
  xonecode config                qué config y credenciales cogería (sin claves)
  xonecode config --json         lo mismo, en JSON parseable
  xonecode doctor                ¿hay un proyecto aquí? ¿responde el simulador?
  xonecode verify [ruta]         valida el proyecto con xone-simulator (por omisión, aquí)
  xonecode --guion               la consola con el agente de pega, sin gastar
  xonecode --tui                 fuerza la interfaz de terminal (TUI)
  xonecode --sin-raton           TUI sin capturar el ratón (la rueda vuelve al terminal)
  xonecode --help                esto

Modelo:
  --modelo <proveedor>/<modelo>          fija los tres papeles
  --modelo-rapido / --modelo-trabajo / --modelo-afilado <p>/<m>   fija uno
  XONECODE_MODELO=<p>/<m>                por entorno

  Proveedores: gemini, openai, anthropic, ollama
`;

/**
 * Las banderas de modelo llevan valor suelto (`--modelo x`, no `--modelo=x`), y ese
 * valor NO empieza por `--`: si no se quita aquí, el join de la petición en `run` lo
 * comería como texto. Devuelve las fuentes ya resueltas y el argv SIN las banderas ni
 * sus valores sueltos, para que `--lento` y el filtro de `--` sigan funcionando igual.
 */
export function extraerBanderasDeModelo(argv: string[]): { fuentes: FuentesDeEleccion; resto: string[] } {
  let bandera: string | undefined;
  const porPapel: Partial<Record<"rapido" | "trabajo" | "afilado", string>> = {};
  const resto: string[] = [];

  /** Qué papel fija cada bandera específica. `undefined` = no es una de ellas. */
  const papelDeBandera = (n: string): "rapido" | "trabajo" | "afilado" | undefined =>
    n === "--modelo-rapido" ? "rapido" : n === "--modelo-trabajo" ? "trabajo" : n === "--modelo-afilado" ? "afilado" : undefined;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    const nombre = a.slice(0, a.indexOf("=") === -1 ? undefined : a.indexOf("="));
    const valorConIgual = a.indexOf("=") === -1 ? undefined : a.slice(a.indexOf("=") + 1);

    const papel = papelDeBandera(nombre);
    if (nombre === "--modelo" || papel) {
      if (valorConIgual !== undefined) {
        // Forma con '=': el valor viene pegado a la bandera.
        if (nombre === "--modelo") bandera = valorConIgual;
        else porPapel[papel!] = valorConIgual;
      } else {
        // Forma con espacio: el valor suelto siguiente se consume, sea o sea '--'.
        const valor = argv[i + 1];
        if (valor === undefined) {
          throw new ModeloMalEscrito(`la bandera «${nombre}» necesita un valor <proveedor>/<modelo>`);
        }
        if (nombre === "--modelo") bandera = valor;
        else porPapel[papel!] = valor;
        i++;
      }
      continue;
    }
    resto.push(a);
  }

  return {
    fuentes: { bandera, porPapel, entorno: { XONECODE_MODELO: process.env.XONECODE_MODELO } },
    resto,
  };
}

/**
 * El formato compacto ya no vive aquí: `tokens.ts` lo comparte con la sidebar de la
 * TUI, para que las dos pieles digan la misma cifra (ver el comentario de allí).
 */

/** Las piezas de la barra de estado, ya resueltas: aquí solo queda darles formato. */
export interface PiezasDeBarra {
  proyecto: string;
  colecciones: number;
  /** El modelo de la sesión, «proveedor/modelo». */
  modelo: string;
  /** Tokens acumulados de la sesión (input + output). */
  tokens: number;
  /** Cuánto ocupa AHORA la ventana del modelo; 0 antes de la primera llamada. */
  contexto: number;
  /** El tope de la ventana, si se sabe (`core/contextos.ts` + config). */
  tope?: number;
}

/**
 * La barra de estado como función PURA: la compone quien tiene los valores y
 * la pinta quien tiene el color. Así la barra se puede probar sin TTY — y es
 * que solo se pinta con TTY, que es justo el caso que los tests no pueden ser.
 *
 * La sección `ctx` solo existe si hay algo que medir, y el porcentaje solo si
 * hay tope: sin tope conocido, la cifra va pelada antes que calcular un
 * porcentaje sobre un número inventado.
 */
export function formatearBarra(p: PiezasDeBarra): string {
  const ctx =
    p.contexto > 0
      ? ` · ctx ${compacto(p.contexto)}` +
        (p.tope !== undefined
          ? `/${formatearTope(p.tope)} (${Math.round((p.contexto / p.tope) * 100)}%)`
          : "")
      : "";
  return `─ ${p.proyecto} (${p.colecciones} colls) · ${p.modelo} · ${formatearTokens(p.tokens)}${ctx} · /ayuda`;
}

/**
 * El tope de la ventana del modelo ACTUAL: tabla de `core/contextos.ts` + lo que el
 * usuario haya fijado en `config.json` (lo de proyecto gana a lo global, como los
 * modelos). Fábrica PORQUE la barra lo lee en cada llamada y no en el arranque:
 * /modelo cambia el modelo en caliente, y un tope del modelo equivocado es un
 * porcentaje que miente. Si el id no parsea —no debería, viene de `resolver`—, no hay
 * tope y no pasa nada.
 *
 * Exportada para que la TUI calcule su `ctx` con LA MISMA función que usa la barra de
 * stdio y la que /config declara: dos pieles no pueden divergir en el tope.
 */
export function crearTopeDelModelo(raiz: string): (id: string) => number | undefined {
  return (id: string) => {
    try {
      const { proveedor, modelo } = parsear(id);
      const { config } = cargar(raiz);
      // Misma resolución que /config (`topeResuelto`): proyecto gana a global, y la
      // tabla es el último recurso. El origen aquí no se mira, pero así no puede
      // divergir entre lo que la barra calcula y lo que /config declara.
      return topeResuelto(proveedor, modelo, {
        proyecto: config.proyecto?.contextos,
        global: config.global?.contextos,
      })?.tope;
    } catch {
      return undefined;
    }
  };
}

/**
 * ¿TUI o stdio? `--no-tui` gana siempre (el usuario pidió explícitamente la consola
 * clásica); después `--tui` fuerza la TUI aunque no haya TTY (quien la pide, la tiene:
 * sin TTY el raw mode no funciona y el resultado es suyo); por omisión, AMBOS lados
 * TTY → TUI (solo mirar stdout monta la TUI con stdin de tubería — «echo /salir |
 * xonecode» en un terminal real — y los bytes del pipe se consumen como teclas mientras
 * el EOF del pipe no termina el lazo) y cualquier tubería → stdio, que es lo que
 * mantiene el e2e de pipe byte-idéntico.
 */
/**
 * ¿Captura la TUI el ratón? Con él, la rueda mueve el transcript y no el scrollback del
 * terminal, a cambio de que seleccionar texto sea Alt/Shift + arrastre. `--sin-raton` lo
 * apaga. Pura, para probarla.
 */
export function quiereRaton(argv: string[] = []): boolean {
  return !argv.includes("--sin-raton");
}

export function decidirTui(argv: string[] = []): boolean {
  if (argv.includes("--no-tui")) return false;
  if (argv.includes("--tui")) return true;
  return process.stdout.isTTY === true && process.stdin.isTTY === true;
}

/**
 * El ejecutor de turno REAL de la consola: cada línea de prosa corre sobre una `SesionReal`
 * que sobrevive entre turnos (mismo agente, mismo hilo).
 *
 * La sesión se construye PEREZOSA, en el primer turno de prosa y no al arrancar
 * `entrarEnConsola`, por dos razones:
 *  - El `Entorno` completo lo pide `inspeccionar` (el real de `agent/entorno.js`), no el
 *    doble `{colecciones}` de la cabecera, y abrir la sesión construye el grafo: hacerlo en
 *    el arranque gastaría en una consola que quizá solo se use para `/ayuda` o `/config`.
 *  - El detector de `/modelo` y `/nuevo` es la comparación de `estado` entre turnos: los
 *    manejadores de `consola.ts` no tocan la sesión (no la conocen), así que la única
 *    costura es el `estado` que este ejecutor recibe en cada llamada.
 *
 * `alAbrirSesion` se llama UNA vez, justo tras `abrirSesionReal`, y es la costura por la
 * que `entrarEnConsola` apunta la barra de estado al tracker de la sesión (que alimenta
 * el agente; el de `createTokenTracker()` de cabecera se descarta al reasignarse).
 */
function crearEjecutorReal(alAbrirSesion: (sesion: SesionReal) => void): EjecutorDeTurno {
  let sesion: SesionReal | undefined;
  let fuentesVistas: FuentesDeEleccion | undefined;
  let hiloVisto: string | undefined;

  return async (peticion, estado, consolaReal) => {
    if (sesion === undefined) {
      // Mismo diagnóstico y mismas frases que `run --real`: no se construye NADA sobre un
      // sitio que no es un proyecto XOne, y la consola sigue viva para otros comandos.
      const entorno = await inspeccionar(estado.raiz);
      if (!entorno.esProyectoXone) {
        consolaReal.escribir(`${entorno.raiz}  (no hay app.xml aquí)\n`);
        consolaReal.escribir("✗ falta algo imprescindible: xonecode no puede trabajar aquí.\n");
        return;
      }
      sesion = await abrirSesionReal({
        raiz: estado.raiz,
        modelos: new Modelos(estado.fuentes),
        skills: new SkillsEnDisco(),
        entorno,
        // Las aprobaciones entran por el `preguntar` de la propia consola: el turno para
        // y pregunta DENTRO de la sesión, sin salir de ella ni montar otro lector de stdin.
        // Si la consola aporta su propio puerto (`aprobacionesTui`, el modal de la TUI),
        // manda: mismo contrato que este `pedirDecisiones` por readline.
        pedirAprobacion: async (lista, ficheros, diffs) =>
          consolaReal.aprobacionesTui !== undefined
            ? consolaReal.aprobacionesTui(lista, ficheros, diffs)
            : pedirDecisiones(lista, consolaReal.preguntar, consolaReal.escribir, {
                interactive: consolaReal.interactivo,
                fichero: (id) => ficheros.get(id),
                diff: (id) => diffs.get(id),
              }),
      });
      alAbrirSesion(sesion);
      // Recién construida: no hay cambio que detectar en esta primera vuelta.
      fuentesVistas = estado.fuentes;
      hiloVisto = estado.hilo;
    } else {
      // `/modelo` solo actualizó `estado.fuentes`; aquí es donde deja de ser un cambio
      // cosmético: el agente se reconstruye con el modelo nuevo y el hilo SE CONSERVA.
      if (JSON.stringify(estado.fuentes) !== JSON.stringify(fuentesVistas)) {
        await sesion.cambiarModelos(new Modelos(estado.fuentes));
        consolaReal.escribir("  (agente reconstruido con el modelo nuevo — el hilo se conserva)\n");
        fuentesVistas = estado.fuentes;
      }
      // `/nuevo` generó su propio UUID, que no coincide con el hilo interno de la sesión:
      // lo que importa es que CAMBIÓ, y se abre uno nuevo. El aviso ya lo imprimió el
      // manejador de consola.ts.
      if (estado.hilo !== hiloVisto) {
        // **Se le pasa el id de la consola.** Sin esto había DOS ids para un mismo hilo —
        // el de la consola y el que generaba la sesión— y `/hilo` enseñaba el que NO usaba
        // el grafo. Un identificador que no identifica es peor que no darlo.
        sesion.nuevoHilo(estado.hilo);
        hiloVisto = estado.hilo;
      }
    }

    // La piel del turno: la de la consola si la aporta (la TUI), y el render stdio de
    // siempre si no — mismo reparto que `ejecutarTurnoGuionizado`.
    await sesion.turno(peticion, consolaReal.piel?.() ?? crearPielStdio(consolaReal.escribir));
  };
}

/**
 * La sesión interactiva: `xonecode` a secas.
 *
 * Mismo patrón de inyección que `cmdDescribe(fuentes, escribir, raiz)`: todo lo que toca
 * el exterior (cwd, stdout, el proceso del simulador dentro de `inspeccionar`, y el
 * propio stdin a través de readline) entra como parámetro con su valor de producción por
 * omisión, así el test la recorre entera sin TTY ni procesos externos.
 *
 * Devuelve el código de salida, que es el que devuelva `correrConsola` (0 tanto por
 * `/salir` como por EOF).
 */
/** ¿La respuesta a una pregunta sí/no es SÍ? Enter a secas y cualquier otra cosa: NO. */
function esSi(respuesta: string): boolean {
  return ["s", "si", "y", "yes"].includes(respuesta.trim().toLowerCase());
}

/**
 * El asistente de creación de proyecto: cuatro preguntas y el esqueleto en disco.
 *
 * La oferta inicial es sí/no con **omisión No**, como las aprobaciones: crear
 * ficheros en la carpeta del usuario es opt-in, y quien no ha entendido la
 * pregunta no ha pedido nada. Lo que se escribe es `core/esqueleto.ts` (el
 * «Hola Mundo» de la documentación XOne, nada inventado), a través de
 * `agent/crearProyecto.ts`, que no pisa lo que ya exista.
 */
async function ofrecerCrearProyecto(raiz: string, consola: Consola): Promise<boolean> {
  const respuesta = await consola.preguntar("¿Creo un proyecto XOne aquí? (s/N) ");
  if (!esSi(respuesta)) return false;

  const datos = await preguntarDatos(consola);
  const informe = crearProyecto(raiz, datos);

  consola.escribir(
    `✓ proyecto creado: ${informe.creados.length} ficheros` +
      `${informe.saltados.length > 0 ? ` (${informe.saltados.length} existentes no tocados: ${informe.saltados.join(", ")})` : ""}\n`
  );
  // Las carpetas del runtime van VACÍAS a propósito, y eso hay que decirlo: quien
  // no sepa que el .db lo genera el simulador pensará que falta algo.
  consola.escribir(
    "  (bd/, icons/ y files/ están vacías: la base de datos la genera el simulador y los iconos se añaden a mano)\n"
  );
  return true;
}

/** Las cuatro preguntas, cada una re-preguntada hasta que la respuesta sirva. */
async function preguntarDatos(consola: Consola): Promise<DatosDelProyecto> {
  // El nombre interno no admite espacios (es `Name=` del app.ini y el prefijo de
  // las clases de pantallas): re-preguntar, no «arreglarlo» por debajo.
  let nombre = "";
  for (;;) {
    nombre = (await consola.preguntar("Nombre interno de la app (sin espacios): ")).trim();
    if (nombre.length > 0 && !/\s/.test(nombre)) break;
    consola.escribir("  (sin espacios y no vacío)\n");
  }

  const titulo =
    (await consola.preguntar(`Título visible [${nombre}]: `)).trim() || nombre;

  let orientacion: "portrait" | "landscape" = "portrait";
  for (;;) {
    const respuesta = (
      await consola.preguntar("Orientación (portrait/landscape) [portrait]: ")
    )
      .trim()
      .toLowerCase();
    if (respuesta === "") break;
    if (respuesta === "portrait" || respuesta === "landscape") {
      orientacion = respuesta;
      break;
    }
    consola.escribir("  (portrait o landscape)\n");
  }

  const login = esSi(await consola.preguntar("¿La app lleva login? (s/N) "));

  return { nombre, titulo, orientacion, login };
}

/**
 * El completer que monta la consola: comandos Y, tras una «@», ficheros del proyecto.
 *
 * Los ficheros se piden en el momento del Tab (`() => ficherosDelProyecto(raiz)`, no la
 * lista ya hecha): el completer se construye una sola vez al arrancar el rl y la lista
 * quedaría congelada en el primer instante de la sesión.
 */
export function crearCompleterDelProyecto(raiz: string, escribir: Escribir = escribirEnStdout) {
  return crearCompleter(escribir, () => ficherosDelProyecto(raiz));
}

export async function entrarEnConsola(
  fuentes: FuentesDeEleccion,
  raiz: string = process.cwd(),
  escribir: Escribir = escribirEnStdout,
  inspeccionarProyecto: (raiz: string) => Promise<{ colecciones: number; esProyectoXone: boolean }> =
    inspeccionar,
  crearRl: () => readline.Interface = () =>
    readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: process.stdin.isTTY === true,
      completer: crearCompleterDelProyecto(raiz),
      // **El prompt.** Sin él la consola es un cursor pelado: no se sabe que espera, ni
      // dónde acaba la respuesta y empieza lo que uno escribió. `readline` no lo pinta si
      // no se le da uno Y se llama a `rl.prompt()` — las dos cosas hacen falta.
      prompt: PROMPT,
    }),
  guion = false,
  /** Costura de test del «¿hay alguien al otro lado?»: sin TTY no se pregunta nada. */
  interactivo: boolean = process.stdin.isTTY === true,
  /**
   * ¿Arranca la TUI? Costura de test: los tests corren sin TTY y pasan `false` (o no
   * la pasan, y `decidirTui` sin banderas cae en el `isTTY` del proceso). En la rama
   * TUI este parámetro de `interactivo` no se usa: la TUI es interactiva por diseño.
   */
  usarTui: boolean = decidirTui(),
  /** ¿Ratón en la TUI? Solo la rama TUI lo mira. */
  raton: boolean = true,
  /** Adaptadores compartidos por stdio y TUI; `main` construye una sola instancia real. */
  dependencias: Pick<Consola, "catalogoModelos" | "guardarModeloGlobal" | "conectarCloudStudio"> = {
    catalogoModelos: new CatalogoModelos(),
    guardarModeloGlobal,
    conectarCloudStudio: (url, scopes, informar) => conectarCloudStudio(url, { informar, scopes }),
  }
): Promise<number> {
  // La elección de modelo y las credenciales se hidratan ANTES de decidir la piel:
  // stdio y TUI reciben exactamente las mismas fuentes y el catálogo leerá la clave
  // ya aplicada solo cuando `/modelos` provoque su primera consulta.
  const cargado = cargar(raiz);
  aplicarAuth(cargado.auth);
  // El tema es una preferencia del proyecto: un config global no puede cambiar cómo se
  // presenta otro repositorio. Un valor manual desconocido conserva XOne por omisión.
  seleccionarTema("xone");
  const temaDeProyecto = cargado.config.proyecto?.tema;
  if (temaDeProyecto !== undefined && esTema(temaDeProyecto)) seleccionarTema(temaDeProyecto);
  const fuentesHidratadas: FuentesDeEleccion = {
    ...fuentes,
    proyecto: cargado.config.proyecto,
    global: cargado.config.global,
  };

  if (usarTui) {
    // La TUI es la MISMA consola: `entrarEnConsola` no la duplica, le entrega las
    // piezas que son de esta capa (la inspección, el asistente de creación, el
    // ejecutor real, el tope compartido) y el montaje vive en `tui/correrTui.ts`,
    // que no puede importar de aquí porque sería un ciclo.
    //
    // Import DINÁMICO: `correrTui.ts` arrastra ink y react, y un import estático los
    // cargaría también en `run`, `describe`, `config` y en cada pipe — que no los
    // necesitan ni los van a pintar. Solo la rama TUI paga el módulo.
    const { correrConsolaTui } = await import("./tui/correrTui.js");
    return correrConsolaTui({
      fuentes: fuentesHidratadas,
      raiz,
      guion,
      ...dependencias,
      guardarTemaDeProyecto: (tema) => guardarTemaDeProyecto(raiz, tema),
      guardarCloudStudioDeProyecto: (url) => guardarCloudStudioDeProyecto(raiz, url),
      inspeccionarProyecto,
      ofrecer: ofrecerCrearProyecto,
      crearEjecutor: guion ? undefined : crearEjecutorReal,
      topeDe: crearTopeDelModelo(raiz),
      raton,
    });
  }
  // `let` porque el asistente de creación puede cambiarlo TODO: si el usuario acepta,
  // la carpeta pasa de «0 colls, sin app.xml» a proyecto de verdad, y la cabecera se
  // re-inspecciona para no mentir en la primera línea que se ve.
  let entorno = await inspeccionarProyecto(raiz);

  // El papel `trabajo` es el que representa a la sesión. Sin el sufijo `(origen)` que
  // añade `Modelos.descripcion()`: la cabecera es breve y la procedencia se puede ver
  // con /describe. `let` porque /modelo <p>/<m> la cambia EN CALIENTE dentro de la sesión.
  let modeloTrabajo: string;
  {
    const { proveedor, modelo } = resolver(fuentesHidratadas).trabajo;
    modeloTrabajo = `${proveedor}/${modelo}`;
  }

  /**
   * Los tokens acumulados de la sesión. Con `--guion` se queda en 0 a propósito: el turno
   * guionizado no corre ningún modelo. Sin ella, la sesión real se construye PEREZOSA (al
   * primer turno de prosa) y entonces esta variable se REASIGNA al tracker de la sesión —
   * `let` y no `const` por eso: `barraDeEstado` y `cabecera` leen la variable en cada
   * llamada (no una copia congelada), así que empiezan a leer del tracker real en cuanto
   * la sesión existe. Lo que importa es que el OBJETO no se copia: el agente sigue
   * alimentando ese mismo tracker, y la barra lo refleja sin tocar nada más.
   */
  let tracker: TokenTracker = createTokenTracker();

  // Las dos líneas de cabecera, construidas por una función porque se emiten DOS veces:
  // al arrancar y tras cada /nuevo o /modelo. La lista de comandos se GENERA recorriendo
  // el registro — una lista escrita a mano se queda vieja en cuanto alguien añade uno.
  /**
   * El tope de la ventana del modelo ACTUAL. La lógica vive en `crearTopeDelModelo`
   * (módulo, y compartida con la TUI): la barra la llama en cada emisión porque
   * /modelo cambia el modelo en caliente.
   */
  const topeDelModelo = crearTopeDelModelo(raiz);

  /**
   * La barra de estado, al estilo de la de opencode: lo que uno necesita tener delante sin
   * pedirlo. En stdio no se puede clavar al fondo de la pantalla —eso pide control de
   * cursor, y es lo que trae la TUI de Ink— así que se emite ANTES de cada prompt, que es
   * el sitio donde de verdad se mira.
   *
   * Lleva el modelo porque es lo que uno olvida haber cambiado, el proyecto porque la
   * consola se lanza desde donde toque y equivocarse de carpeta es fácil, los tokens
   * porque es el coste acumulándose, y el contexto porque es el margen que va
   * consumiéndose — la cifra que dice si toca resumir el hilo.
   */
  const barraDeEstado = (): string =>
    `${DIM}${formatearBarra({
      proyecto: basename(raiz),
      colecciones: entorno.colecciones,
      modelo: modeloTrabajo,
      tokens: tracker.input + tracker.output,
      contexto: tracker.contexto,
      tope: topeDelModelo(modeloTrabajo),
    })}${RESET}\n`;

  /** La cabecera larga: solo al arrancar y tras /nuevo o /modelo, nunca por turno. */
  const cabecera = (): string => {
    const comandos = Object.keys(COMANDOS)
      .map((nombre) => `/${nombre}`)
      .join(" ");
    return (
      `${BOLD}xonecode${RESET} · ${basename(raiz)} (${entorno.colecciones} colls) · ${modeloTrabajo} · ` +
      `${formatearTokens(tracker.input + tracker.output)}\n` +
      `${DIM}${Object.keys(COMANDOS).length} comandos: ${comandos}${RESET}\n`
    );
  };
  const lineaDeEstado = cabecera; // el nombre que ya usan los tests

  // El rl y la consola se crean ANTES de la cabecera: si la carpeta no es un proyecto
  // XOne, la oferta de crearlo se pregunta aquí mismo, y para preguntar hace falta
  // el `preguntar` de la consola (que comparte este rl con el lazo de líneas).
  const rl = crearRl();

  const consola: Consola = {
    // Envuelto para que pinte la barra de estado y el prompt antes de cada línea. Ver
    // `conPrompt`: `readline` no pinta el prompt solo al iterarlo como AsyncIterable.
    lineas: conPrompt(rl, escribir, barraDeEstado),
    escribir: (t: string) => {
      escribir(t);
      // La TUI usa el mismo parser: un acuse de los tres papeles, o el del papel
      // `trabajo` individual de `/modelos`, actualiza la cabecera sin duplicar regex.
      const acuse = modeloDeAcuse(t);
      if (acuse !== undefined && (acuse.papel === undefined || acuse.papel === "trabajo")) {
        modeloTrabajo = acuse.modelo;
        escribir(lineaDeEstado());
      } else if (/^hilo nuevo: /.test(t)) {
        escribir(lineaDeEstado());
      }
    },
    preguntar: crearPreguntar(rl),
    interactivo,
    leerSecreto: crearLeerSecreto(rl),
    catalogoModelos: dependencias.catalogoModelos,
    guardarModeloGlobal: dependencias.guardarModeloGlobal,
    guardarTemaDeProyecto: (tema) => guardarTemaDeProyecto(raiz, tema),
    conectarCloudStudio: dependencias.conectarCloudStudio,
    guardarCloudStudioDeProyecto: (url) => guardarCloudStudioDeProyecto(raiz, url),
  };

  // El asistente de creación: la única escritura fuera de un turno del agente, y
  // por eso la única que pregunta ANTES de escribir. Si se crea, la carpeta ya ES
  // un proyecto XOne y `entorno` se re-inspecciona; si no, la consola sigue viva
  // para /config, /doctor o lo que haga falta (el control del primer turno de
  // prosa sigue ahí como red de seguridad).
  if (!entorno.esProyectoXone) {
    consola.escribir(`✗ ${basename(raiz)} no es un proyecto XOne (falta app.xml)\n`);
    if (interactivo && (await ofrecerCrearProyecto(raiz, consola))) {
      entorno = await inspeccionarProyecto(raiz);
    }
  }

  escribir(cabecera());

  // Mismo patrón de prefijo que run.ts y el manejador /nuevo de consola.ts.
  const estado: EstadoDeSesion = {
    hilo: `xonecode-${randomUUID()}`,
    raiz,
    fuentes: fuentesHidratadas,
  };

  // `--guion` conserva el agente de pega (el valor por omisión de `correrConsola`): es lo
  // que permite ver la consola correr sin gastar. Sin ella, el ejecutor real corre cada
  // línea de prosa sobre una sesión que se abre en el PRIMER turno y sobrevive a los demás.
  const ejecutar = guion
    ? undefined
    : crearEjecutorReal((sesion) => {
        tracker = sesion.tracker;
      });

  // Una memoria .xonecode pertenece al PROYECTO y significa que hay trabajo que
  // retomar. El saludo de primera visita no debe ocultar ese contexto. `--guion` no
  // simula esta lectura: no hay modelo real que pueda analizarlo.
  if (hayEstadoDeProyecto(raiz) && !guion) {
    consola.escribir(MENSAJE_REANUDANDO);
    try {
      await ejecutar!(PETICION_REANUDAR_PROYECTO, estado, consola);
    } catch (e) {
      consola.escribir(`${describirError(e)}\n`);
    }
  } else {
    consola.escribir(MENSAJE_BIENVENIDA);
  }

  const codigo = await correrConsola(consola, estado, ejecutar);
  // Siempre, tanto si se sale por /salir como por EOF: sin rl.close() el proceso queda
  // escuchando stdin y `xonecode` no vuelve nunca a la shell.
  rl.close();
  return codigo;
}

export async function main(argv: string[]): Promise<number> {
  const [comando, ...resto] = argv;

  try {
    // Las banderas de la consola (`--guion` y las de modelo) no son subcomandos:
    // `xonecode --guion` entra en la consola igual que `xonecode` a secas, pero con el
    // agente de pega. `--help`/`-h` NO entran aquí: son el subcomando de ayuda de abajo.
    // El resto de banderas (`--real`, `--json`, …) pertenecen a otros subcomandos y siguen
    // cayendo en «no conozco el comando».
    // `--guion` se quita del argv ANTES de extraerBanderasDeModelo: no es una bandera de
    // modelo y no debe llegar como `resto` a ninguna parte.
    if (
      !comando ||
      comando === "--guion" ||
      comando === "--tui" ||
      comando === "--no-tui" ||
      comando === "--sin-raton" ||
      comando.startsWith("--modelo")
    ) {
      const guion = argv.includes("--guion");
      const pedirTui = argv.includes("--tui");
      // Por defecto, TUI siempre. `--no-tui` fuerza stdio; sin banderas, TUI.
      const usarTui = !argv.includes("--no-tui");
      // `--tui` fuerza la TUI, pero no puede fabricar un terminal: sin stdin interactivo
      // no hay teclado que leer, y sin stdout TTY ink pintaría códigos de escape en la
      // tubería. Error de USO (64), no un crash — la bandera fue imposible, no el entorno.
      if (pedirTui && usarTui && (process.stdin.isTTY !== true || process.stdout.isTTY !== true)) {
        process.stderr.write("la TUI necesita un terminal interactivo: usa --no-tui o corre sin tubería\n");
        return 64;
      }
      // extraerBanderasDeModelo también con argv vacío, para que fuentes.entorno
      // .XONECODE_MODELO se rellene igual que en todos los demás subcomandos: la consola
      // no puede ser la única vía que ignora esa variable.
      const { fuentes } = extraerBanderasDeModelo(argv.filter((a) => a !== "--guion" && a !== "--sin-raton"));
      const catalogoModelos = new CatalogoModelos();
      // Por defecto, TUI siempre. `--no-tui` fuerza stdio.
      return await entrarEnConsola(
        fuentes,
        undefined,
        undefined,
        undefined,
        undefined,
        guion,
        undefined,
        !argv.includes("--no-tui"),
        quiereRaton(argv),
        {
          catalogoModelos,
          guardarModeloGlobal,
          conectarCloudStudio: (url, scopes, informar) => conectarCloudStudio(url, { informar, scopes }),
        }
      );
    }
    if (comando === "--help" || comando === "-h") {
      process.stdout.write(AYUDA);
      return 0;
    }

    if (comando === "run") {
      const { fuentes, resto: sinModelo } = extraerBanderasDeModelo(resto);
      const peticion = sinModelo.filter((a) => !a.startsWith("--")).join(" ");
      if (!peticion) {
        process.stderr.write("run necesita una petición: xonecode run \"...\"\n");
        return 64; // EX_USAGE
      }
      const lento = sinModelo.includes("--lento");
      const real = sinModelo.includes("--real");
      return cmdRun({ peticion, retardoMs: lento ? 120 : 0, real, fuentes });
    }

    if (comando === "describe") {
      const { fuentes } = extraerBanderasDeModelo(resto);
      return cmdDescribe(fuentes);
    }

    if (comando === "config") {
      const { fuentes, resto: sinModelo } = extraerBanderasDeModelo(resto);
      const json = sinModelo.includes("--json");
      return cmdConfig(fuentes, { json });
    }

    if (comando === "doctor") {
      return await cmdDoctor();
    }

    if (comando === "verify") {
      const ruta = resto.filter((a) => !a.startsWith("--"))[0] ?? process.cwd();
      return await cmdVerify(ruta);
    }
  } catch (e) {
    // Un modelo mal escrito es un error del USUARIO, no del harness: su mensaje, sin
    // traza, y código de uso (64). No se propaga como un fallo de software.
    if (e instanceof ModeloMalEscrito) {
      process.stderr.write(`${e.message}\n`);
      return 64; // EX_USAGE
    }
    throw e;
  }

  process.stderr.write(`no conozco el comando «${comando}». xonecode --help\n`);
  return 64;
}
