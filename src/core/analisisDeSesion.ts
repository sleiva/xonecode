/**
 * El análisis PREVIO de un chat o de una tarea, para la pestaña Soporte: qué salió mal, dicho
 * con reglas de código y sin llamar a ningún modelo.
 *
 * ## Lo que lee, y lo que NO lee
 *
 * Solo datos ESTRUCTURADOS: el `tipo` de cada acto, sus campos (`verde`, `errores`,
 * `detalles[].nombre`, `detalles[].error`, `consumo.ventana`), las líneas de la traza por su
 * `tipo`, los registros de fallos y el estado de la tarea. **Nunca el `texto` de un acto
 * `sistema`**: su clase viaja con el acto precisamente para que nadie la deduzca de la
 * redacción (`core/actos.ts`), y una regla que buscara «no ha corrido» en un aviso se
 * rompería el día que alguien cambie la frase, sin que nada avisara.
 *
 * ## Límites declarados
 *
 * - **Una escritura que se RECHAZÓ no consta.** El acto `sistema` de clase `permiso` es una
 *   escritura aplicada SIN preguntar (modo autónomo); del rechazo no queda acto estructurado.
 * - **«Escribió y no se verificó» puede ser un artefacto**: la línea de tool no dice a qué
 *   ruta escribió como dato, así que un `write_file` a `/artefactos/` cuenta igual. Por eso es
 *   un aviso y lo dice.
 * - Solo ve lo que ESTE chat dejó con su id: las líneas de traza y de fallos sin `chat` no
 *   entran aquí (`core/paqueteDeSoporte.ts`).
 */

import type { Acto } from "./actos.js";
import type { RegistroDeFallo } from "./fallos.js";
import type { Tarea } from "./tareas.js";

export type GravedadDeHallazgo = "info" | "aviso" | "error";
export type GravedadDeAnalisis = "ok" | "aviso" | "error";

export type ReglaDeAnalisis =
  | "turno-con-error"
  | "verificador-en-rojo"
  | "escritura-sin-verificar"
  | "tools-fallidas"
  | "escrituras-sin-preguntar"
  | "pregunta-sin-contestar"
  | "corte-por-tope"
  | "tool-en-bucle"
  | "contexto-cerca-del-tope"
  | "fallo-registrado"
  | "turno-sin-terminar"
  | "tarea-requiere-atencion"
  | "juez-no-verde";

export interface HallazgoDeAnalisis {
  regla: ReglaDeAnalisis;
  gravedad: GravedadDeHallazgo;
  mensaje: string;
  /** El turno, contado desde 1 por cada mensaje de usuario. Ausente = no es de un turno. */
  turno?: number;
}

export interface AnalisisDeSesion {
  gravedad: GravedadDeAnalisis;
  hallazgos: HallazgoDeAnalisis[];
}

export interface EntradaDeAnalisis {
  actos: readonly Acto[];
  /** Las líneas de `traza-tools.jsonl` de ESTE chat, ya parseadas. */
  trazas?: readonly Record<string, unknown>[];
  /** Los registros de `fallos.jsonl` de ESTE chat. */
  fallos?: readonly RegistroDeFallo[];
  tarea?: Pick<Tarea, "estado" | "motivo" | "veredicto">;
  /** El chat tiene un turno EN VUELO: el último turno sin cerrar no es un problema todavía. */
  enVuelo?: boolean;
  /** El tope de contexto del modelo de la sesión, si se sabe. Sin él la regla no corre. */
  topeDeContexto?: number;
}

/** Cuántas llamadas IGUALES seguidas son un bucle y no una lectura en varias partes. */
export const LLAMADAS_IGUALES_PARA_BUCLE = 4;
/** A partir de qué fracción del tope la ventana está «cerca»: queda poco antes de resumir. */
export const FRACCION_DE_CONTEXTO_CERCA = 0.9;
/** Las tools que ESCRIBEN en el proyecto (las que llevan HITL, `CLAUDE.md`). */
export const TOOLS_QUE_ESCRIBEN: ReadonlySet<string> = new Set(["write_file", "edit_file", "incorporar_adjunto", "traer_fuente"]);
/** Lo que cabe de un mensaje de error en un hallazgo: se reconoce, no se reproduce. */
export const TOPE_DE_MENSAJE = 200;

function recortar(texto: string): string {
  const limpio = texto.trim().replace(/\s+/g, " ");
  return limpio.length <= TOPE_DE_MENSAJE ? limpio : `${limpio.slice(0, TOPE_DE_MENSAJE)}…`;
}

interface Turno {
  numero: number;
  actos: Acto[];
}

/** Parte los actos por turno: cada mensaje de usuario abre uno. Lo de antes es el turno 0. */
function turnosDe(actos: readonly Acto[]): Turno[] {
  const turnos: Turno[] = [{ numero: 0, actos: [] }];
  for (const acto of actos) {
    if (acto.tipo === "usuario") turnos.push({ numero: turnos.length, actos: [] });
    turnos[turnos.length - 1]!.actos.push(acto);
  }
  return turnos.filter((t) => t.actos.length > 0);
}

function conTurno(numero: number): { turno?: number } {
  return numero === 0 ? {} : { turno: numero };
}

function analizarTurno(turno: Turno, esElUltimo: boolean, entrada: EntradaDeAnalisis): HallazgoDeAnalisis[] {
  const hallazgos: HallazgoDeAnalisis[] = [];
  const n = conTurno(turno.numero);

  for (const acto of turno.actos) {
    if (acto.tipo === "error") {
      hallazgos.push({ regla: "turno-con-error", gravedad: "error", mensaje: `El turno terminó en error: ${recortar(acto.texto)}`, ...n });
    }
  }

  const veredictos = turno.actos.filter((a): a is Extract<Acto, { tipo: "verificacion" }> => a.tipo === "verificacion");
  const ultimo = veredictos[veredictos.length - 1];
  if (ultimo !== undefined && !ultimo.verde) {
    const rojos = veredictos.filter((v) => !v.verde).length;
    const intentos = rojos > 1 ? ` (${rojos} veredictos en rojo en el turno: la reparación no lo arregló)` : "";
    hallazgos.push({
      regla: "verificador-en-rojo",
      gravedad: "error",
      mensaje: `El verificador terminó en rojo con ${ultimo.errores} error(es)${intentos}.`,
      ...n,
    });
  }

  const detalles = turno.actos.flatMap((a) =>
    a.tipo === "herramientas" ? a.lineas.map((linea, i) => ({ linea, detalle: a.detalles?.[i] })) : []
  );
  const escribio = detalles.some((d) => d.detalle?.nombre !== undefined && TOOLS_QUE_ESCRIBEN.has(d.detalle.nombre) && d.detalle.error === undefined);
  if (escribio && veredictos.length === 0) {
    hallazgos.push({
      regla: "escritura-sin-verificar",
      gravedad: "aviso",
      mensaje: "Hubo escrituras y no consta ningún veredicto del verificador (puede ser solo un artefacto).",
      ...n,
    });
  }

  const fallidas = detalles.filter((d) => d.detalle?.error !== undefined);
  if (fallidas.length > 0) {
    const ejemplos = fallidas
      .slice(0, 3)
      .map((d) => `${d.detalle?.nombre ?? "tool"}: ${recortar(d.detalle!.error!)}`)
      .join(" · ");
    hallazgos.push({ regla: "tools-fallidas", gravedad: "aviso", mensaje: `${fallidas.length} llamada(s) a tools fallaron. ${ejemplos}`, ...n });
  }

  // Un bucle es la MISMA línea (tool + lo que tocó) seguida, no la misma tool: leer un
  // fichero en cuatro rangos da cuatro líneas distintas.
  let racha = 1;
  let peor = 1;
  let peorLinea = "";
  for (let i = 1; i < detalles.length; i++) {
    const igual = detalles[i]!.linea === detalles[i - 1]!.linea && detalles[i]!.detalle?.nombre === detalles[i - 1]!.detalle?.nombre;
    racha = igual ? racha + 1 : 1;
    if (racha > peor) {
      peor = racha;
      peorLinea = detalles[i]!.detalle?.nombre ?? "tool";
    }
  }
  if (peor >= LLAMADAS_IGUALES_PARA_BUCLE) {
    hallazgos.push({ regla: "tool-en-bucle", gravedad: "aviso", mensaje: `La misma llamada a ${peorLinea} se repitió ${peor} veces seguidas.`, ...n });
  }

  const sinPreguntar = turno.actos.filter((a) => a.tipo === "sistema" && a.clase === "permiso").length;
  if (sinPreguntar > 0) {
    hallazgos.push({ regla: "escrituras-sin-preguntar", gravedad: "info", mensaje: `${sinPreguntar} escritura(s) aplicadas sin preguntar (modo autónomo).`, ...n });
  }

  const fin = turno.actos.find((a): a is Extract<Acto, { tipo: "fin" }> => a.tipo === "fin");
  const ventana = fin?.consumo?.ventana;
  if (ventana !== undefined && entrada.topeDeContexto !== undefined && entrada.topeDeContexto > 0) {
    const fraccion = ventana / entrada.topeDeContexto;
    if (fraccion >= FRACCION_DE_CONTEXTO_CERCA) {
      hallazgos.push({
        regla: "contexto-cerca-del-tope",
        gravedad: "aviso",
        mensaje: `El contexto llegó al ${Math.round(fraccion * 100)} % del tope del modelo.`,
        ...n,
      });
    }
  }

  const huboError = turno.actos.some((a) => a.tipo === "error");
  if (turno.numero > 0 && fin === undefined && !huboError && !(esElUltimo && entrada.enVuelo === true)) {
    hallazgos.push({ regla: "turno-sin-terminar", gravedad: "aviso", mensaje: "El turno no llegó a cerrar (se paró, se cayó el proceso o sigue esperando).", ...n });
  }

  return hallazgos;
}

function preguntaPendiente(actos: readonly Acto[]): HallazgoDeAnalisis[] {
  let pendiente: string | undefined;
  for (const acto of actos) {
    if (acto.tipo === "consulta") pendiente = acto.pregunta;
    else if (acto.tipo === "usuario") pendiente = undefined;
  }
  return pendiente === undefined
    ? []
    : [{ regla: "pregunta-sin-contestar", gravedad: "aviso", mensaje: `El agente preguntó y nadie contestó: ${recortar(pendiente)}` }];
}

function deLasTrazas(trazas: readonly Record<string, unknown>[]): HallazgoDeAnalisis[] {
  const cortes = new Map<string, { veces: number; limite?: number }>();
  for (const linea of trazas) {
    if (linea.tipo !== "corte") continue;
    const origen = typeof linea.origen === "string" ? linea.origen : "?";
    const previo = cortes.get(origen) ?? { veces: 0 };
    cortes.set(origen, { veces: previo.veces + 1, ...(typeof linea.limite === "number" ? { limite: linea.limite } : {}) });
  }
  return [...cortes].map(([origen, { veces, limite }]) => ({
    regla: "corte-por-tope" as const,
    gravedad: "aviso" as const,
    mensaje: `A ${origen} se le agotó el presupuesto de llamadas${limite === undefined ? "" : ` (${limite})`}${veces > 1 ? `, ${veces} veces` : ""}.`,
  }));
}

function deLosFallos(fallos: readonly RegistroDeFallo[]): HallazgoDeAnalisis[] {
  return fallos.map((f) => {
    const causa = f.causas[f.causas.length - 1];
    const texto = causa === undefined ? "sin causa" : `${causa.nombre}: ${causa.mensaje}`;
    return { regla: "fallo-registrado" as const, gravedad: "error" as const, mensaje: `Fallo registrado (${f.at}): ${recortar(texto)}` };
  });
}

function deLaTarea(tarea: NonNullable<EntradaDeAnalisis["tarea"]>): HallazgoDeAnalisis[] {
  const hallazgos: HallazgoDeAnalisis[] = [];
  if (tarea.estado === "requiere-atencion") {
    hallazgos.push({
      regla: "tarea-requiere-atencion",
      gravedad: "aviso",
      mensaje: `La tarea espera feedback${tarea.motivo === undefined ? "." : `: ${recortar(tarea.motivo)}`}`,
    });
  }
  const veredicto = tarea.veredicto;
  if (veredicto !== undefined && veredicto.veredicto !== "verde") {
    hallazgos.push({
      regla: "juez-no-verde",
      gravedad: veredicto.veredicto === "rojo" ? "error" : "aviso",
      mensaje: `El juez de QA dijo «${veredicto.veredicto}»: ${recortar(veredicto.resumen)}`,
    });
  }
  return hallazgos;
}

/** La gravedad del conjunto: la del peor hallazgo. Un `info` solo no es un problema. */
export function gravedadDe(hallazgos: readonly HallazgoDeAnalisis[]): GravedadDeAnalisis {
  if (hallazgos.some((h) => h.gravedad === "error")) return "error";
  if (hallazgos.some((h) => h.gravedad === "aviso")) return "aviso";
  return "ok";
}

export function analizarSesion(entrada: EntradaDeAnalisis): AnalisisDeSesion {
  const turnos = turnosDe(entrada.actos);
  const hallazgos: HallazgoDeAnalisis[] = [
    ...turnos.flatMap((t, i) => analizarTurno(t, i === turnos.length - 1, entrada)),
    ...preguntaPendiente(entrada.actos),
    ...deLasTrazas(entrada.trazas ?? []),
    ...deLosFallos(entrada.fallos ?? []),
    ...(entrada.tarea === undefined ? [] : deLaTarea(entrada.tarea)),
  ];
  return { gravedad: gravedadDe(hallazgos), hallazgos };
}
