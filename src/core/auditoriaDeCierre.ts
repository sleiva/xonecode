/**
 * **La auditoría de cierre (F2): ¿la prueba ENSEÑA lo que pide el criterio?** Puro.
 *
 * F1 (`fichaDeTrabajo.ts`) comprueba que una casilla marcada tiene una prueba de la versión actual; no que esa prueba diga
 * lo que el criterio pide. Medido: en una pasada de la calculadora una sola captura respaldó 21 casillas de tres tareas, y
 * una captura vigente puede enseñar justo lo contrario («4,850.50 ÷ 2.5» fijo donde el criterio pide el visor limpio). Eso
 * es un juicio, y se le pregunta a un modelo (papel `afilado`) con la prueba delante; pero el juicio solo puede BAJAR el
 * estado de una tarea, nunca subirlo, y lo que no se entiende es «no se ve», nunca «cumple».
 *
 * Diseño y medida: `docs/superpowers/specs/2026-11-03-ficha-de-trabajo-design.md` §8.
 */
import { vigente, type Evidencia, type FichaDeTrabajo } from "./fichaDeTrabajo.js";
import type { TareaDelPlan } from "./tareasDelPlan.js";

export type VeredictoDeCriterio = "cumple" | "contradice" | "no-se-ve";

export interface CriterioAAuditar {
  /** `<plan>/<tarea>/<n>`: el que vuelve en la respuesta. */
  id: string;
  plan: string;
  tarea: string;
  criterio: number;
  texto: string;
  /** La ficha de su tarea, recortada a `TOPE_DE_FICHA_EN_AUDITORIA`. */
  ficha: string;
  evidencia: Evidencia;
  /** Las demás pruebas vigentes de su respaldo (`Respaldo.otras`): los casos van en texto; las capturas, nombradas. */
  otras?: Evidencia[];
}

export interface CriterioAuditado {
  veredicto: VeredictoDeCriterio;
  porque: string;
  /** Solo con `contradice`: lo que la prueba enseña en contra, literal. */
  cita?: string;
}

/** Cuántas capturas se le enseñan como mucho: las más recientes. Lo que no cabe, «no se ve», dicho. */
export const TOPE_DE_IMAGENES_DE_AUDITORIA = 2;
export const TOPE_DE_FICHA_EN_AUDITORIA = 600;
const TOPE_DE_PORQUE = 300;

const CASILLA_MARCADA = /^\s*[-*]\s+\[[xX]\]\s+(.*)$/;
const CASILLA = /^\s*[-*]\s+\[( |x|X)\]\s+/;

/** El texto de la casilla `n` (desde 1) de una tarea, si está MARCADA. La numeración es la de `marcarCriterios`. */
export function textoDeCasillaMarcada(cuerpo: string, n: number): string | undefined {
  const casillas = cuerpo.split("\n").filter((l) => CASILLA.test(l));
  const m = CASILLA_MARCADA.exec(casillas[n - 1] ?? "");
  return m === null ? undefined : m[1]!.trim();
}

/** La ruta de la captura que guarda una evidencia (`/artefactos/…`), si la guarda. */
export function rutaDeCaptura(e: Evidencia): string | undefined {
  if (e.tipo !== "captura") return undefined;
  return /^\/artefactos\/[^\s"'<>]+\.(?:png|jpe?g|webp)$/.exec(e.resumen.trim())?.[0];
}

/**
 * Lo que hay que auditar: cada casilla MARCADA con un respaldo cuya prueba sigue VIGENTE. Lo demás ya lo decide el código
 * (sin prueba vigente la tarea no pasa de «implementada»), así que preguntar por ello sería gastar una llamada en nada.
 */
export function criteriosAAuditar(
  f: FichaDeTrabajo,
  tareasPorPlan: ReadonlyMap<string, readonly TareaDelPlan[]>,
  huellasActuales: Readonly<Record<string, string | undefined>>
): CriterioAAuditar[] {
  const salida: CriterioAAuditar[] = [];
  for (const r of f.respaldos) {
    const t = tareasPorPlan.get(r.plan)?.find((x) => x.numero === r.tarea);
    const e = f.evidencias.find((x) => x.id === r.evidencia);
    if (t === undefined || e === undefined || !vigente(e, huellasActuales)) continue;
    const texto = textoDeCasillaMarcada(t.cuerpo, r.criterio);
    if (texto === undefined) continue;
    const id = `${r.plan}/${r.tarea}/${String(r.criterio)}`;
    if (salida.some((c) => c.id === id)) continue;
    const cabecera = `${t.numero} — ${t.titulo}\n${t.cuerpo}`;
    const otras = (r.otras ?? [])
      .map((id) => f.evidencias.find((x) => x.id === id))
      .filter((x): x is Evidencia => x !== undefined && x.id !== e.id && vigente(x, huellasActuales));
    salida.push({
      id,
      plan: r.plan,
      tarea: r.tarea,
      criterio: r.criterio,
      texto,
      ficha: cabecera.length > TOPE_DE_FICHA_EN_AUDITORIA ? `${cabecera.slice(0, TOPE_DE_FICHA_EN_AUDITORIA - 1)}…` : cabecera,
      evidencia: e,
      ...(otras.length === 0 ? {} : { otras }),
    });
  }
  return salida;
}

/**
 * Qué capturas se le enseñan: las `TOPE_DE_IMAGENES_DE_AUDITORIA` más recientes entre las que citan los criterios. Un
 * criterio con una captura que no cabe —o que no guardó su ruta— no se pregunta: queda «no se ve», con el motivo.
 */
export function repartoDeImagenes(criterios: readonly CriterioAAuditar[]): { rutas: string[]; sinImagen: Map<string, string> } {
  const porFecha = [...new Map(criterios.filter((c) => rutaDeCaptura(c.evidencia) !== undefined).map((c) => [rutaDeCaptura(c.evidencia)!, c.evidencia.cuando])).entries()]
    .sort((a, b) => b[1].localeCompare(a[1]))
    .map(([ruta]) => ruta);
  const rutas = porFecha.slice(0, TOPE_DE_IMAGENES_DE_AUDITORIA);
  const sinImagen = new Map<string, string>();
  for (const c of criterios) {
    if (c.evidencia.tipo !== "captura") continue;
    const ruta = rutaDeCaptura(c.evidencia);
    if (ruta === undefined) sinImagen.set(c.id, "su captura no guardó la ruta de la imagen");
    else if (!rutas.includes(ruta)) sinImagen.set(c.id, "su captura no cabe entre las que se le enseñan al auditor");
  }
  return { rutas, sinImagen };
}

/**
 * El prompt MEDIDO (spec §8): con el primero refutaba en falso un criterio de casos dos de cada cuatro veces, escribiendo
 * «no hay contradicción» y contestando «no». Tres cambios lo dejaron en 30 de 30: el porqué ANTES del veredicto, etiquetas
 * que no chocan con la negación del castellano, y la cita obligatoria para refutar (la exige además `leerAuditoria`).
 */
export const PROMPT_DEL_AUDITOR = [
  "Eres el auditor de cierre de un harness de desarrollo de apps móviles XOne. Para CADA criterio de aceptación de abajo",
  "tienes la PRUEBA que el harness guardó (una captura del aparato o los casos ejecutados en él) y decides UNA cosa: si esa",
  "prueba ENSEÑA que el criterio se cumple.",
  "",
  "- «cumple»: la prueba lo enseña.",
  "- «contradice»: la prueba enseña lo CONTRARIO, y lo CITAS en `cita` tal como sale (un texto de la pantalla, una salida de un",
  "  caso). Si dudas, o no puedes citar nada que lo contradiga, es «no-se-ve».",
  "- «no-se-ve»: la prueba no basta para decirlo: no enseña esa parte, es demasiado débil o indirecta, o el trabajo se ve",
  "  a medias. Di en el porqué cuál de las tres.",
  // De la «completion audit» de Codex (`codex-rs/ext/goal/templates/goals/continuation.md`): una comprobación estrecha no
  // prueba un criterio amplio. Medido aquí: una sola captura respaldó 21 casillas de tres tareas.
  "La prueba tiene que cubrir TODO lo que pide el criterio: una captura de la pantalla recién abierta no prueba lo que pasa al",
  "pulsar, y una comprobación de una parte no prueba el criterio entero.",
  "Un criterio puede traer VARIAS pruebas de la misma versión: juzga lo que enseñan JUNTAS.",
  "Juzga SOLO lo que pide el criterio: lo que no pide (otra línea, otro detalle) no cuenta ni a favor ni en contra. No juzgues",
  "si es bonito ni propongas mejoras. Que el agente lo marcara no cuenta: juzga solo la prueba.",
  "Los CASOS son líneas «pasos → textos nuevos»: los textos nuevos son los que aparecen en la pantalla respecto a cómo estaba",
  "ANTES DEL PRIMER caso (no respecto al anterior), así que un caso puede arrastrar lo que dejó otro (una línea de historial).",
  "El resultado de un caso es el texto nuevo que corresponde a sus pasos.",
  "",
  'Contesta SOLO este JSON: {"criterios":[{"id":"…","porque":"una frase: qué enseña la prueba sobre lo que pide el criterio",' +
    '"cita":"solo con «contradice»: lo que la prueba enseña en contra, literal","veredicto":"cumple|contradice|no-se-ve"}]} — en ESE',
  "orden: primero el porqué, el veredicto al final y de acuerdo con él.",
].join("\n");

/** El bloque de texto de un criterio, delante de su prueba (la imagen va detrás, la pone quien llama). */
export function textoDeCriterioParaAuditar(c: CriterioAAuditar): string {
  const prueba = c.evidencia.tipo === "captura" ? "una captura del aparato (la imagen de abajo)" : `${c.evidencia.tipo}: ${c.evidencia.resumen}`;
  const otras = (c.otras ?? []).map((e) =>
    e.tipo === "captura" ? `- otra captura, ${e.resumen} (no se enseña)` : `- ${e.tipo}: ${e.resumen}`
  );
  return (
    `\n---\nCRITERIO ${c.id}: ${c.texto}\nFicha de su tarea:\n${c.ficha}\nPrueba: ${prueba}${c.evidencia.pantalla === undefined ? "" : ` (pantalla ${c.evidencia.pantalla})`}` +
    (otras.length === 0 ? "" : `\nOtras pruebas de esta misma versión:\n${otras.join("\n")}`)
  );
}

/**
 * La respuesta del auditor, criterio a criterio, para los `ids` preguntados. Fail-closed hacia «no se ve»: lo que no se
 * entiende, lo que falta y un «contradice» SIN cita no refutan nada (medido: refutaba escribiendo que no había contradicción).
 */
export function leerAuditoria(texto: string, ids: readonly string[]): Map<string, CriterioAuditado> {
  const salida = new Map<string, CriterioAuditado>();
  let lista: unknown[] = [];
  try {
    const crudo = JSON.parse(texto.slice(texto.indexOf("{"), texto.lastIndexOf("}") + 1)) as { criterios?: unknown };
    if (Array.isArray(crudo.criterios)) lista = crudo.criterios;
  } catch {
    // Sin JSON legible, todo queda «no se ve».
  }
  for (const item of lista) {
    const c = item as { id?: unknown; veredicto?: unknown; porque?: unknown; cita?: unknown };
    if (typeof c.id !== "string" || !ids.includes(c.id) || salida.has(c.id)) continue;
    const porque = typeof c.porque === "string" ? c.porque.trim().slice(0, TOPE_DE_PORQUE) : "";
    const cita = typeof c.cita === "string" ? c.cita.trim() : "";
    if (c.veredicto === "cumple") salida.set(c.id, { veredicto: "cumple", porque });
    else if (c.veredicto === "contradice" && cita !== "") salida.set(c.id, { veredicto: "contradice", porque, cita: cita.slice(0, TOPE_DE_PORQUE) });
    else salida.set(c.id, { veredicto: "no-se-ve", porque: porque === "" ? "el auditor no lo dejó claro" : porque });
  }
  for (const id of ids) if (!salida.has(id)) salida.set(id, { veredicto: "no-se-ve", porque: "el auditor no lo contestó" });
  return salida;
}

/** Las líneas del cierre: solo lo que NO se sostiene, con su motivo. Un criterio que cumple no se dice. */
export function lineasDeAuditoria(auditados: ReadonlyMap<string, CriterioAuditado>): string[] {
  const lineas: string[] = [];
  for (const [id, a] of auditados) {
    if (a.veredicto === "contradice") lineas.push(`${id} marcado, y su prueba enseña lo contrario: «${a.cita ?? ""}» (${a.porque})`);
    else if (a.veredicto === "no-se-ve") lineas.push(`${id} marcado, y su prueba no basta para decirlo: ${a.porque}`);
  }
  return lineas;
}
