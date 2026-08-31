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
import { type FuentesDeEleccion, ModeloMalEscrito, resolver } from "../core/modelos.js";
import {
  COMANDOS,
  correrConsola,
  crearCompleter,
  type Consola,
  type EjecutorDeTurno,
  type EstadoDeSesion,
} from "./consola.js";
import { crearLeerSecreto, crearPreguntar, crearPielStdio, escribirEnStdout, type Escribir } from "./stdio.js";
import { pedirDecisiones } from "./aprobar.js";
import { inspeccionar } from "../agent/entorno.js";
import { SkillsEnDisco } from "../agent/skills.js";
import { Modelos } from "../agent/modelos.js";
import { abrirSesionReal, type SesionReal } from "../agent/turnoReal.js";
import { createTokenTracker, type TokenTracker } from "../vendor/tokenTracking.js";

/**
 * Estilo, y solo con TTY detrás.
 *
 * Sin la guarda, los códigos ANSI se cuelan en las tuberías y en los logs de CI como
 * basura (`\x1b[2m─ …`). Y esta consola se prueba con pipes, así que pasaría siempre.
 */
const CON_COLOR = process.stdout.isTTY === true;
const DIM = CON_COLOR ? "\x1b[2m" : "";
const BOLD = CON_COLOR ? "\x1b[1m" : "";
const RESET = CON_COLOR ? "\x1b[0m" : "";

/** El prompt. Se ve dónde acaba la respuesta y empieza lo que uno escribe. */
const PROMPT = CON_COLOR ? "\x1b[36m❯\x1b[0m " : "> ";

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

  xonecode run "<peticion>"      un turno, de un disparo (pipeable)
  xonecode run --real "<peticion>"   el agente real sobre el proyecto del cwd
  xonecode describe              qué hay montado y qué es de pega (sin red)
  xonecode config                qué config y credenciales cogería (sin claves)
  xonecode config --json         lo mismo, en JSON parseable
  xonecode doctor                ¿hay un proyecto aquí? ¿responde el simulador?
  xonecode verify [ruta]         valida el proyecto con xone-simulator (por omisión, aquí)
  xonecode --guion               la consola con el agente de pega, sin gastar
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
 * Token compacto para la línea de estado: `0 tokens` hasta 999, `12.8K tokens` a partir
 * de 1000. Un decimal basta para un indicador de cabecera; la cifra exacta la da quien
 * la necesita (printTokenUsage al final de los experimentos).
 */
function formatearTokens(total: number): string {
  return total < 1000 ? `${total} tokens` : `${(total / 1000).toFixed(1)}K tokens`;
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
        pedirAprobacion: (lista, ficheros) =>
          pedirDecisiones(lista, consolaReal.preguntar, consolaReal.escribir, {
            interactive: consolaReal.interactivo,
            fichero: (id) => ficheros.get(id),
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

    await sesion.turno(peticion, crearPielStdio(consolaReal.escribir));
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
export async function entrarEnConsola(
  fuentes: FuentesDeEleccion,
  raiz: string = process.cwd(),
  escribir: Escribir = escribirEnStdout,
  inspeccionarProyecto: (raiz: string) => Promise<{ colecciones: number }> = inspeccionar,
  crearRl: () => readline.Interface = () =>
    readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: process.stdin.isTTY === true,
      completer: crearCompleter(escribirEnStdout),
      // **El prompt.** Sin él la consola es un cursor pelado: no se sabe que espera, ni
      // dónde acaba la respuesta y empieza lo que uno escribió. `readline` no lo pinta si
      // no se le da uno Y se llama a `rl.prompt()` — las dos cosas hacen falta.
      prompt: PROMPT,
    }),
  guion = false
): Promise<number> {
  const entorno = await inspeccionarProyecto(raiz);

  // El papel `trabajo` es el que representa a la sesión. Sin el sufijo `(origen)` que
  // añade `Modelos.descripcion()`: la cabecera es breve y la procedencia se puede ver
  // con /describe. `let` porque /modelo <p>/<m> la cambia EN CALIENTE dentro de la sesión.
  let modeloTrabajo: string;
  {
    const { proveedor, modelo } = resolver(fuentes).trabajo;
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
   * La barra de estado, al estilo de la de opencode: lo que uno necesita tener delante sin
   * pedirlo. En stdio no se puede clavar al fondo de la pantalla —eso pide control de
   * cursor, y es lo que trae la TUI de Ink— así que se emite ANTES de cada prompt, que es
   * el sitio donde de verdad se mira.
   *
   * Lleva el modelo porque es lo que uno olvida haber cambiado, el proyecto porque la
   * consola se lanza desde donde toque y equivocarse de carpeta es fácil, y los tokens
   * porque es el coste acumulándose.
   */
  const barraDeEstado = (): string =>
    `${DIM}─ ${basename(raiz)} (${entorno.colecciones} colls) · ${modeloTrabajo} · ` +
    `${formatearTokens(tracker.input + tracker.output)} · /ayuda${RESET}\n`;

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

  escribir(cabecera());

  const rl = crearRl();

  const consola: Consola = {
    // Envuelto para que pinte la barra de estado y el prompt antes de cada línea. Ver
    // `conPrompt`: `readline` no pinta el prompt solo al iterarlo como AsyncIterable.
    lineas: conPrompt(rl, escribir, barraDeEstado),
    escribir: (t: string) => {
      escribir(t);
      // La línea de estado se reimprime tras /nuevo y /modelo (los DOS, no
      // /modelo-rapido/-trabajo/-afilado: así lo pide la tarea). Ambos manejadores
      // escriben su resultado en UNA sola llamada a escribir, así que basta con anclar
      // al principio de esa cadena exacta:
      //   "modelo (los tres papeles): <p>/<m>\n"   → /modelo
      //   "hilo nuevo: <id>\n"                     → /nuevo
      const comoModelo = /^modelo \(los tres papeles\): (.+)\n$/.exec(t);
      if (comoModelo) {
        modeloTrabajo = comoModelo[1]!;
        escribir(lineaDeEstado());
      } else if (/^hilo nuevo: /.test(t)) {
        escribir(lineaDeEstado());
      }
    },
    preguntar: crearPreguntar(rl),
    interactivo: process.stdin.isTTY === true,
    leerSecreto: crearLeerSecreto(rl),
  };

  // Mismo patrón de prefijo que run.ts y el manejador /nuevo de consola.ts.
  const estado: EstadoDeSesion = { hilo: `xonecode-${randomUUID()}`, raiz, fuentes };

  // `--guion` conserva el agente de pega (el valor por omisión de `correrConsola`): es lo
  // que permite ver la consola correr sin gastar. Sin ella, el ejecutor real corre cada
  // línea de prosa sobre una sesión que se abre en el PRIMER turno y sobrevive a los demás.
  const ejecutar = guion
    ? undefined
    : crearEjecutorReal((sesion) => {
        tracker = sesion.tracker;
      });

  const codigo = await correrConsola(consola, estado, ejecutar);
  // Siempre, tanto si se sale por /salir como por EOF: sin rl.close() el proceso queda
  // escuchando stdin y `xonecode` no vuelve nunca a la shell.
  rl.close();
  return codigo;
}

export async function main(argv: string[]): Promise<number> {
  const [comando, ...resto] = argv;

  // Las banderas de la consola (`--guion` y las de modelo) no son subcomandos:
  // `xonecode --guion` entra en la consola igual que `xonecode` a secas, pero con el
  // agente de pega. `--help`/`-h` NO entran aquí: son el subcomando de ayuda de abajo.
  // El resto de banderas (`--real`, `--json`, …) pertenecen a otros subcomandos y siguen
  // cayendo en «no conozco el comando».
  // `--guion` se quita del argv ANTES de extraerBanderasDeModelo: no es una bandera de
  // modelo y no debe llegar como `resto` a ninguna parte.
  if (!comando || comando === "--guion" || comando.startsWith("--modelo")) {
    const guion = argv.includes("--guion");
    // extraerBanderasDeModelo también con argv vacío, para que fuentes.entorno
    // .XONECODE_MODELO se rellene igual que en todos los demás subcomandos: la consola
    // no puede ser la única vía que ignora esa variable.
    const { fuentes } = extraerBanderasDeModelo(argv.filter((a) => a !== "--guion"));
    return entrarEnConsola(fuentes, undefined, undefined, undefined, undefined, guion);
  }
  if (comando === "--help" || comando === "-h") {
    process.stdout.write(AYUDA);
    return 0;
  }

  try {
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