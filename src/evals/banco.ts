/**
 * El banco: `npm run banco [-- --pasadas 3] [--modelos a/b,c/d] [--solo entrypoint] [--json f]`
 * `[--contra base.json]`.
 *
 * Corre las mismas preguntas VARIAS veces contra uno o varios modelos y dice lo que cuestan,
 * con su dispersión y con el veredicto de un juez. Existe por una lección cara del 17-09-2026
 * (`docs/DECISIONES.md`): tres ejecuciones del MISMO prompt dieron 10.644, 26.711 y 31.534
 * tokens de entrada, o sea que **una sola pasada no puede decidir un cambio de prompt** — y
 * estuvo a punto de venderse como un −73 % lo que era una tirada de dados.
 *
 * Qué hace por pasada: copia el esqueleto «Hola Mundo» a un temporal, abre una sesión REAL con
 * el agente de verdad, hace la pregunta, y mide. Al acabar borra el temporal.
 *
 * Tres decisiones que no son de forma:
 *
 * - **La aprobación RECHAZA**, no aprueba como en `correr.ts`. Estas son preguntas: un turno
 *   que quiera escribir es un turno que se ha ido de la pregunta, y aprobarle la escritura
 *   mediría otra cosa. Rechazar es además el lado seguro si alguien apunta esto a un proyecto.
 * - **El reparto por origen sale de la TRAZA**, encendiéndola en el temporal
 *   (`XONECODE_TRACE_TOOLS`) y leyéndola con `resumirTraza`: así el banco sabe si una pasada
 *   DELEGÓ o si contestó el orquestador solo, que es otro camino y no el mismo más barato.
 * - **No acepta una raíz.** Como el corredor de evals: se mide sobre un proyecto que se tira.
 *
 * No es un test y no corre en `npm test`: necesita modelo y clave. Lo que SÍ corre en `npm test`
 * son los jueces (`preguntas.test.ts`) y la estadística (`medidas.test.ts`), que son quienes
 * pueden invalidar el banco entero en silencio.
 */

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crearProyecto } from "../agent/config/crearProyecto.js";
import { inspeccionar } from "../agent/config/entorno.js";
import { SkillsEnDisco } from "../agent/grafo/skills.js";
import { Modelos } from "../agent/config/modelos.js";
import { abrirSesionReal } from "../agent/turno/turnoReal.js";
import { proveedoresPersonalizados } from "../agent/config/configEnDisco.js";
import { hidratarFuentesDeDisco } from "../cli/fuentesDeDisco.js";
import { rutaTrazaDeTools, VARIABLE_TRAZA_TOOLS } from "../agent/turno/diagnosticoDeTools.js";
import { resumirTraza } from "../agent/turno/informeDeTraza.js";
import { PREGUNTAS, type Pregunta } from "./preguntas.js";
import { comparar, pintarCelda, resumirCelda, type Pasada, type ResumenDeCelda } from "./medidas.js";
import type { Piel } from "../core/turno.js";
import type { Decision } from "../vendor/hitl.js";
import type { PendienteDeAprobacion } from "../core/events.js";

/** Cuánto se guarda de una respuesta SUSPENDIDA, para poder mirarla sin archivar el turno. */
const TOPE_DE_RESPUESTA = 700;

/** Tope por pasada. Una pasada colgada no puede colgar el banco entero. */
const TOPE_MS = 5 * 60 * 1000;

/** Los datos del proyecto del banco. Con login, porque una de las preguntas va de eso. */
const PROYECTO = { nombre: "Banco", titulo: "Banco", orientacion: "portrait" as const, login: true };

function argumento(nombre: string): string | undefined {
  const i = process.argv.indexOf(nombre);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** Una piel que solo recuerda el texto: el banco no pinta el turno, lo mide. */
function pielQueRecuerda(): { piel: Piel; texto: () => string } {
  let todo = "";
  let colchon = "";
  const piel: Piel = {
    token: (t) => {
      colchon += t;
    },
    cerrarLinea: () => {
      todo += `${colchon}\n`;
      colchon = "";
    },
    linea: (t) => {
      todo += `${t}\n`;
    },
    pausa: () => {},
    fin: () => {},
  };
  return { piel, texto: () => todo + colchon };
}

/** Rechaza TODO: esto son preguntas, no encargos. Ver la cabecera. */
const rechazarTodo = async (pendientes: PendienteDeAprobacion[]): Promise<Map<string, Decision>> =>
  new Map(pendientes.map((p) => [p.id, { type: "reject", message: "el banco no aprueba escrituras: esto es una pregunta" } as Decision]));

async function unaPasada(pregunta: Pregunta, modelos: Modelos, skills: SkillsEnDisco): Promise<Pasada> {
  const raiz = mkdtempSync(join(tmpdir(), `xonecode-banco-${pregunta.nombre}-`));
  const base: Pasada = { entrada: 0, salida: 0, cache: 0, llamadas: 0, ms: 0, correcta: false, delego: false };
  const t0 = Date.now();
  // La traza se enciende POR PASADA y en el temporal: es de donde sale el reparto por origen,
  // y el proceso es el mismo, así que se restaura al acabar.
  const antes = process.env[VARIABLE_TRAZA_TOOLS];
  process.env[VARIABLE_TRAZA_TOOLS] = "1";
  /**
   * La sesión vive FUERA del `try` para poder leer su tracker aunque la pasada reviente.
   *
   * Un turno cortado por el tope ha gastado lo que ha gastado, y devolver cero ahí es la cifra
   * inventada de siempre — la misma regla que ya rige en el contador de la web («se cuenta
   * también cuando el turno acaba en ERROR»), y que aquí faltaba: la primera medida de la
   * pregunta cara se cortó a los cinco minutos y el banco dijo «0 tokens», que es justo lo que
   * no había pasado.
   */
  let sesion: Awaited<ReturnType<typeof abrirSesionReal>> | undefined;
  try {
    crearProyecto(raiz, PROYECTO);
    const entorno = await inspeccionar(raiz);
    sesion = await abrirSesionReal({ raiz, modelos, skills, entorno, pedirAprobacion: rechazarTodo });
    const { piel, texto } = pielQueRecuerda();
    // **Quién canceló se APUNTA**, porque el mensaje de la librería dice «cancelado por el
    // usuario» y aquí no hay ningún usuario: lo cancela este reloj. Medido en la primera base,
    // donde una pasada de `login` se pasó de los cinco minutos y la tabla acusó a una persona
    // que no estaba. Un banco que miente en un error es lo único que no puede hacer.
    let porElTope = false;
    const viva = sesion;
    const reloj = setTimeout(() => {
      porElTope = true;
      viva.cancelar();
    }, TOPE_MS);
    try {
      await viva.turno(pregunta.texto, piel);
    } catch (e) {
      throw porElTope ? new Error(`se pasó del tope de ${TOPE_MS / 60000} min`) : e;
    } finally {
      clearTimeout(reloj);
      sesion.cerrar();
    }

    // Quién trabajó: si aparece cualquier origen que no sea el orquestador, delegó.
    let delego = false;
    try {
      const [traza] = resumirTraza(readFileSync(rutaTrazaDeTools(raiz), "utf8").split("\n"));
      delego = traza !== undefined && traza.origenes.some((o) => o.origen !== "orquestador");
    } catch {
      // Sin traza no se afirma que delegó: `false` aquí significa «no consta», y la tabla
      // solo avisa cuando unas pasadas delegan y otras no.
    }

    const respuesta = texto();
    const correcta = pregunta.correcta(respuesta);
    return {
      ...base,
      ms: Date.now() - t0,
      llamadas: sesion.tracker.calls,
      entrada: sesion.tracker.input,
      salida: sesion.tracker.output,
      cache: sesion.tracker.cache,
      correcta,
      delego,
      // Solo la suspendida, y recortada: para poder decidir si falló el agente o el juez.
      ...(correcta ? {} : { respuesta: respuesta.trim().slice(0, TOPE_DE_RESPUESTA) }),
    };
  } catch (e) {
    return {
      ...base,
      ms: Date.now() - t0,
      // Lo gastado hasta el corte, que es un dato: la pasada no entra en las medias (la
      // decide `error`), pero lo que costó se dice.
      llamadas: sesion?.tracker.calls ?? 0,
      entrada: sesion?.tracker.input ?? 0,
      salida: sesion?.tracker.output ?? 0,
      cache: sesion?.tracker.cache ?? 0,
      error: e instanceof Error ? e.message : String(e),
    };
  } finally {
    if (antes === undefined) delete process.env[VARIABLE_TRAZA_TOOLS];
    else process.env[VARIABLE_TRAZA_TOOLS] = antes;
    rmSync(raiz, { recursive: true, force: true });
  }
}

async function main(): Promise<number> {
  const solo = argumento("--solo");
  const json = argumento("--json");
  const contra = argumento("--contra");
  const pasadas = Number(argumento("--pasadas") ?? 3);
  if (!Number.isInteger(pasadas) || pasadas < 1) {
    console.error("`--pasadas` tiene que ser un entero positivo");
    return 64; // EX_USAGE
  }

  const preguntas = solo === undefined ? [...PREGUNTAS] : PREGUNTAS.filter((p) => p.nombre === solo);
  if (preguntas.length === 0) {
    console.error(`no hay ninguna pregunta llamada «${solo}». Las que hay: ${PREGUNTAS.map((p) => p.nombre).join(", ")}`);
    return 64;
  }

  // Un modelo por celda; sin `--modelos`, el que tenga configurado quien lo corre.
  const lista = (argumento("--modelos") ?? "").split(",").filter((m) => m.trim() !== "");
  const modelosAProbar = lista.length === 0 ? [undefined] : lista;
  const skills = new SkillsEnDisco();

  console.log(`banco: ${preguntas.length} pregunta(s) × ${modelosAProbar.length} modelo(s) × ${pasadas} pasada(s)`);
  if (pasadas < 2) console.log("⚠  con UNA pasada no hay dispersión que medir: esto no decide nada, solo mira.");

  const resumenes = [];
  for (const bandera of modelosAProbar) {
    // Las fuentes se hidratan por modelo y con el MISMO cuerpo que la consola y `run --real`:
    // config del disco más credenciales aplicadas al proceso.
    const { fuentes } = hidratarFuentesDeDisco(process.cwd(), bandera === undefined ? {} : { bandera });
    const modelos = new Modelos(fuentes, proveedoresPersonalizados);
    const nombre = modelos.descripcion().trabajo;

    for (const pregunta of preguntas) {
      const medidas: Pasada[] = [];
      for (let i = 0; i < pasadas; i++) {
        // El progreso va por STDERR: así la tabla se puede pipear o volcar sin que el
        // carrusel de «pasada 2/3…» se cuele en lo que alguien va a leer o a guardar.
        process.stderr.write(`  ${pregunta.nombre} · ${nombre} · pasada ${i + 1}/${pasadas}…\r`);
        medidas.push(await unaPasada(pregunta, modelos, skills));
      }
      const resumen = resumirCelda(nombre, pregunta.nombre, medidas);
      resumenes.push({ ...resumen, mide: pregunta.mide, pasadas: medidas });
      process.stderr.write(`${" ".repeat(72)}\r`);
      for (const linea of pintarCelda(resumen)) console.log(linea);
    }
  }

  // **La comparación es el punto de todo esto**, y la hace `comparar()`, que se NIEGA a
  // concluir con los rangos solapados. Se empareja por modelo y pregunta: una celda que no
  // esté en la base se DICE, en vez de compararla contra nada.
  if (contra !== undefined) {
    console.log(`\ncontra ${contra}:`);
    const base = JSON.parse(readFileSync(contra, "utf8")) as { celdas: ResumenDeCelda[] };
    for (const ahora of resumenes) {
      const antes = base.celdas.find((c) => c.modelo === ahora.modelo && c.pregunta === ahora.pregunta);
      if (antes === undefined) {
        console.log(`  ${ahora.pregunta} · ${ahora.modelo}: no estaba en la base`);
        continue;
      }
      const v = comparar(antes, ahora);
      const cambio = v.diferencia === undefined ? "?" : `${v.diferencia > 0 ? "+" : ""}${Math.round(100 * v.diferencia)}%`;
      console.log(`  ${ahora.pregunta} · ${ahora.modelo}: ${cambio} — ${v.concluyente ? "CONCLUYENTE" : "no concluyente"}, ${v.motivo}`);
    }
  }

  if (json !== undefined) {
    const { writeFileSync } = await import("node:fs");
    writeFileSync(json, `${JSON.stringify({ cuando: new Date().toISOString(), celdas: resumenes }, null, 2)}\n`, "utf8");
    console.log(`\nguardado en ${json} — la línea base con la que comparar el próximo cambio`);
  }

  // Una respuesta incorrecta NO tumba el banco: es un dato de la tabla, y el banco mide. Lo
  // que sale con error es que no se pudo medir nada.
  return resumenes.every((r) => r.validas === 0) ? 70 : 0;
}

main()
  .then((c) => process.exit(c))
  .catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(70);
  });
