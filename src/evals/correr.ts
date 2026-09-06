/**
 * El corredor de evals:
 * `npm run eval [-- --solo nombre] [--modelo proveedor/modelo] [--json ruta] [--conservar] [--agentes serie|carpeta]`.
 *
 * `--conservar` deja en disco el proyecto de cada tarea que FALLA e imprime su ruta. Sin
 * él no se puede saber si un ✗ es del agente o del juez: la primera ejecución real tiró
 * dos tareas buenas por dos jueces mal escritos, y no había fichero que mirar para saberlo.
 * Los que aprueban se borran igual — no hay nada que inspeccionar en un ✓. Salvo con
 * `--conservar-todo`, que existe para UNA cosa: un ✓ que costó de más. Con
 * `XONECODE_TRACE_TOOLS=1` el proyecto conservado trae `.xonecode/traza-tools.jsonl`, el uso
 * por origen y por tool, que es la única forma de saber a dónde se fueron los tokens.
 *
 * Por cada tarea: proyecto limpio (el esqueleto, en un temporal) → `preparar` si la tarea
 * parte de algo roto → sesión REAL con el agente de verdad, el simulador de verdad y una
 * aprobación que aprueba todo → turno → veredicto del simulador medido aquí, no fiado del
 * turno → juez → fila de la tabla. Al final, un resumen y opcionalmente un JSON.
 *
 * **NO es un test y no corre en `npm test`**: necesita modelo, clave y `xone-simulator`. Ese
 * invariante no se toca. Vive en `src/evals/` para que se tipee con el resto y no se
 * empaquete (`tsconfig.build.json` lo excluye), y su nombre no acaba en `.test.ts`.
 *
 * **La aprobación aprueba TODO, y está escrito con todas las letras**: es lo que convierte
 * un turno con humano en uno medible sin humano. Solo tiene sentido sobre un proyecto
 * temporal que se tira al acabar — nunca sobre uno real, y este corredor no acepta una raíz.
 *
 * El modelo es el que tenga configurado quien lo corre (config global, `XONECODE_MODELO`) o
 * el de `--modelo`. Los subagentes son los suyos: los cuatro de serie más los que tenga en
 * `~/.xonecode/agentes/`. Se imprime cuáles, porque el resultado depende de ello.
 */

import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crearProyecto } from "../agent/crearProyecto.js";
import { inspeccionar } from "../agent/entorno.js";
import { SkillsEnDisco } from "../agent/skills.js";
import { Modelos } from "../agent/modelos.js";
import { abrirSesionReal } from "../agent/turnoReal.js";
import { SimuladorVerifier } from "../agent/verificador.js";
import { cargar, aplicarAuth } from "../agent/configEnDisco.js";
import { AGENTES_DE_SERIE, cargarAgentes } from "../agent/agentesEnDisco.js";
import { escribirAgente } from "../core/agentes.js";
import type { Piel } from "../core/turno.js";
import type { Decision } from "../vendor/hitl.js";
import type { PendienteDeAprobacion } from "../core/events.js";
import { TAREAS, type Tarea, type Veredicto } from "./tareas.js";

/** Tope por tarea. Un agente colgado no puede colgar el eval entero. */
const TOPE_MS = 8 * 60 * 1000;

interface Resultado {
  tarea: string;
  mide: string;
  ok: boolean;
  motivo: string;
  ms: number;
  llamadas: number;
  tokensEntrada: number;
  /** De la entrada, cuántos vinieron de caché del proveedor: cuestan ~10 veces menos. */
  tokensCache: number;
  tokensSalida: number;
  reparaciones: number;
  bloqueado: boolean;
  error?: string;
}

/**
 * Con qué subagentes corre la tarea.
 *
 * Por omisión, los del que ejecuta: su carpeta global, ya sembrada. Pero la siembra se hace
 * UNA vez (la carpeta es la marca), así que un cambio en `AGENTES_DE_SERIE` no llega a esa
 * carpeta y el eval seguiría midiendo el texto viejo. `--agentes serie` escribe los de serie
 * como agentes de PROYECTO en el temporal —pisan a los globales por nombre, que es la regla
 * de siempre— y mide lo que se ENVÍA; `--agentes <carpeta>` hace lo mismo con cualquier
 * variante, para comparar dos prompts sin tocar los ficheros de nadie.
 */
function sembrarAgentesDelEval(raiz: string, agentes: string | undefined): void {
  if (agentes === undefined) return;
  const carpeta = join(raiz, ".xonecode", "agentes");
  mkdirSync(carpeta, { recursive: true });
  if (agentes === "serie") {
    for (const a of AGENTES_DE_SERIE) writeFileSync(join(carpeta, `${a.nombre}.md`), escribirAgente(a), "utf8");
    return;
  }
  for (const f of readdirSync(agentes)) if (f.endsWith(".md")) copyFileSync(join(agentes, f), join(carpeta, f));
}

function argumento(nombre: string): string | undefined {
  const i = process.argv.indexOf(nombre);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** Una piel que solo recuerda: nada de esto se pinta en vivo. */
function pielQueRecuerda(): { piel: Piel; lineas: string[] } {
  const lineas: string[] = [];
  let colchon = "";
  const piel: Piel = {
    token: (t) => {
      colchon += t;
    },
    cerrarLinea: () => {
      if (colchon !== "") lineas.push(colchon);
      colchon = "";
    },
    linea: (t) => {
      lineas.push(t);
    },
    pausa: () => {},
    fin: () => {},
  };
  return { piel, lineas };
}

/** Aprueba TODO. Solo para un proyecto temporal que se tira: ver la cabecera. */
const aprobarTodo = async (pendientes: PendienteDeAprobacion[]): Promise<Map<string, Decision>> =>
  new Map(pendientes.map((p) => [p.id, { type: "approve" } as Decision]));

async function correrTarea(
  tarea: Tarea,
  modelos: Modelos,
  skills: SkillsEnDisco,
  conservar: boolean,
  agentes: string | undefined
): Promise<Resultado & { proyecto?: string }> {
  const raiz = mkdtempSync(join(tmpdir(), `xonecode-eval-${tarea.nombre}-`));
  const base: Resultado = {
    tarea: tarea.nombre,
    mide: tarea.mide,
    ok: false,
    motivo: "",
    ms: 0,
    llamadas: 0,
    tokensEntrada: 0,
    tokensCache: 0,
    tokensSalida: 0,
    reparaciones: 0,
    bloqueado: false,
  };
  const t0 = Date.now();
  try {
    crearProyecto(raiz, { nombre: "Eval", titulo: "Eval", orientacion: "portrait", login: false });
    tarea.preparar?.(raiz);
    sembrarAgentesDelEval(raiz, agentes);

    const entorno = await inspeccionar(raiz);
    const sesion = await abrirSesionReal({
      raiz,
      modelos,
      skills,
      entorno,
      pedirAprobacion: aprobarTodo,
      verifier: new SimuladorVerifier(),
    });
    const { piel, lineas } = pielQueRecuerda();
    const reloj = setTimeout(() => sesion.cancelar(), TOPE_MS);
    let bitacora;
    let cambios;
    try {
      ({ bitacora, cambios } = await sesion.turno(tarea.peticion, piel));
    } finally {
      clearTimeout(reloj);
      sesion.cerrar();
    }

    // El veredicto se MIDE aquí, con el simulador, y no se lee del turno: el juez no puede
    // depender de que el lazo haya hecho bien su parte — precisamente es lo que se evalúa.
    const informe = await new SimuladorVerifier().verificar(raiz);
    const veredicto: Veredicto = tarea.juzgar({ raiz, cambios, informe, lineas });

    return {
      ...base,
      ...(conservar ? { proyecto: raiz } : {}),
      ok: veredicto.ok,
      motivo: veredicto.motivo,
      ms: Date.now() - t0,
      llamadas: sesion.tracker.calls,
      tokensEntrada: sesion.tracker.input,
      tokensCache: sesion.tracker.cache,
      tokensSalida: sesion.tracker.output,
      reparaciones: bitacora.todo.filter((l) => l.startsWith("reparacion:")).length,
      bloqueado: bitacora.corrio("bloqueado"),
    };
  } catch (e) {
    return { ...base, ms: Date.now() - t0, motivo: "reventó", error: e instanceof Error ? e.message : String(e), ...(conservar ? { proyecto: raiz } : {}) };
  } finally {
    // Se borra salvo que se haya pedido conservar; lo que aprobó lo borra el bucle de fuera,
    // que es quien sabe el veredicto.
    if (!conservar) rmSync(raiz, { recursive: true, force: true });
  }
}

async function main(): Promise<number> {
  const solo = argumento("--solo");
  const bandera = argumento("--modelo");
  const json = argumento("--json");
  const conservarTodo = process.argv.includes("--conservar-todo");
  const conservar = conservarTodo || process.argv.includes("--conservar");
  const agentesDelEval = argumento("--agentes");

  // La config del que corre, igual que la consola: credenciales al entorno, modelo global.
  const cargado = cargar(process.cwd());
  aplicarAuth(cargado.auth);
  const modelos = new Modelos({
    ...(bandera === undefined ? {} : { bandera }),
    entorno: { ...(process.env["XONECODE_MODELO"] === undefined ? {} : { XONECODE_MODELO: process.env["XONECODE_MODELO"] }) },
    ...(cargado.config.global === undefined ? {} : { global: cargado.config.global }),
  });
  const skills = new SkillsEnDisco();

  const tareas = solo === undefined ? TAREAS : TAREAS.filter((t) => t.nombre === solo);
  if (tareas.length === 0) {
    console.error(`no hay ninguna tarea llamada «${solo}». Las que hay: ${TAREAS.map((t) => t.nombre).join(", ")}`);
    return 64;
  }

  const agentes = cargarAgentes().agentes.map((a) => `${a.nombre}(${a.motor})`).join(", ");
  console.log(`modelo de trabajo: ${modelos.descripcion().trabajo}`);
  console.log(`subagentes: ${agentes}`);
  if (agentesDelEval !== undefined) {
    const pisan = agentesDelEval === "serie" ? AGENTES_DE_SERIE.map((a) => a.nombre) : readdirSync(agentesDelEval).filter((f) => f.endsWith(".md")).map((f) => f.slice(0, -3));
    console.log(`  pisados por los de ${agentesDelEval === "serie" ? "SERIE" : agentesDelEval}: ${pisan.join(", ")}`);
  }
  console.log(`tareas: ${tareas.length}\n`);

  const resultados: Resultado[] = [];
  for (const tarea of tareas) {
    process.stdout.write(`▶ ${tarea.nombre} — ${tarea.mide} … `);
    const r = await correrTarea(tarea, modelos, skills, conservar, agentesDelEval);
    resultados.push(r);
    // Lo que aprobó no se conserva ni con `--conservar`: no hay nada que inspeccionar en un ✓.
    if (r.ok && r.proyecto !== undefined && !conservarTodo) rmSync(r.proyecto, { recursive: true, force: true });
    console.log(
      // El `input` bruto engaña: lo cacheado cuesta mucho menos. Se dice cuánto hay de caché y
      // un coste EFECTIVO (input − 0,9·cache + output): tokens equivalentes para comparar dos
      // ejecuciones del mismo modelo, no una factura — asume la caché a un décimo (la cifra de
      // Anthropic; OpenAI descuenta ~la mitad, Gemini no la publica) y la salida 1:1.
      `${r.ok ? "✓" : "✗"} ${(r.ms / 1000).toFixed(0)}s · ${r.llamadas} llamadas · ${r.tokensEntrada + r.tokensSalida} tokens` +
        ` (caché ${r.tokensEntrada === 0 ? 0 : Math.round((100 * r.tokensCache) / r.tokensEntrada)}% · efectivo ≈${Math.round(r.tokensEntrada - 0.9 * r.tokensCache + r.tokensSalida)})` +
        `${r.reparaciones > 0 ? ` · ${r.reparaciones} reparación(es)` : ""}${r.bloqueado ? " · bloqueado" : ""}` +
        `\n   ${r.error === undefined ? r.motivo : `ERROR: ${r.error}`}` +
        `${(!r.ok || conservarTodo) && r.proyecto !== undefined ? `\n   proyecto conservado en ${r.proyecto}` : ""}`
    );
  }

  const aprobadas = resultados.filter((r) => r.ok).length;
  console.log(`\n${aprobadas}/${resultados.length} aprobadas`);
  if (json !== undefined) {
    writeFileSync(json, JSON.stringify({ fecha: new Date().toISOString(), modelo: modelos.descripcion().trabajo, resultados }, null, 2));
    console.log(`resultados en ${json}`);
  }
  return aprobadas === resultados.length ? 0 : 1;
}

main().then(
  (codigo) => process.exit(codigo),
  (e) => {
    console.error(e instanceof Error ? e.stack ?? e.message : String(e));
    process.exit(70);
  }
);
