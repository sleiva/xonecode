/**
 * Un ÍNDICE DE CONSULTA RÁPIDA de los atributos XML de XOne por nodo, sacado de las tablas de la referencia de la skill.
 * No la sustituye: dice si un atributo está en las tablas y DÓNDE leer el detalle.
 *
 * Existe por una medida: en cuatro pasadas de la misma calculadora los agentes leyeron las referencias de la skill 45-61
 * veces, 15-25 ficheros distintos, los mismos releídos una y otra vez (`atributos-prop.md` son 34 KB), casi siempre para
 * contestar «¿existe este atributo en este nodo?». Esa pregunta es la cara del bug mudo de XOne: un atributo inventado o
 * puesto en el nodo equivocado no da error, se ignora.
 *
 * Tres reglas, para que el índice no contradiga a la skill:
 * - **Se lee de las tablas, no se escribe a mano**: una copia se desfasa y entonces miente.
 * - **Si dos ficheros de la skill no coinciden, se enseñan LOS DOS** con el aviso, en vez de quedarse con uno. La skill
 *   se contradice a sí misma (medido: `imgbk` en `<group>` está en `nodos-group-y-frame.md` y no en
 *   `atributos-coll-group-frame.md`; `border` en `<frame>` es una máscara en uno y un booleano en el otro).
 * - **Nunca afirma «no existe»**: que no esté en estas tablas no lo prueba —la skill documenta atributos también en texto,
 *   en el CSS y por tipo de control—, así que dice «no está en las tablas» y da la búsqueda en la skill.
 *
 * La forma que se reconoce: una sección `## N. Nodo \`<x>\`` (o `## N. Nodo x - …`), o el nodo del fichero entero cuando
 * su título no lo parte en secciones; filas `| \`atributo\` | …` en tablas cuya primera columna es «Atributo»; la
 * descripción es la columna «Descripción» (o la última); «Tipo» y «Default» si la cabecera las trae. Una fila puede nombrar
 * varios (`\`a\` / \`b\``). Puro: `core/` no lee disco.
 */

export interface AtributoDeNodo {
  atributo: string;
  nodo: string;
  tipo?: string;
  defecto?: string;
  descripcion: string;
  /** De dónde sale, para ir al detalle: el fichero de la skill y la subsección («§3.4 Apariencia»). */
  fichero: string;
  seccion?: string;
}

const NODO = /^##\s+\d+\.\s+Nodo\s+`?<?([a-z][a-z-]*)>?`?/i;
const SECCION = /^###\s+(\d+(?:\.\d+)*[a-z]?)\s+(.+?)\s*$/;
const TOPE_DE_DESCRIPCION = 160;

const celdas = (fila: string): string[] =>
  fila
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split(/(?<!\\)\|/)
    .map((c) => c.trim());

const limpio = (t: string): string =>
  t
    .replace(/\*\*/g, "")
    .replace(/\\\|/g, "|")
    .replace(/\s+/g, " ")
    .trim();

/** Las filas de atributos de UN fichero de referencia. `nodoDelFichero`: el nodo cuando el fichero no lo parte por secciones. */
export function interpretarReferenciaDeAtributos(texto: string, fichero: string, nodoDelFichero?: string): AtributoDeNodo[] {
  const salida: AtributoDeNodo[] = [];
  let nodo: string | undefined = nodoDelFichero;
  let seccion: string | undefined;
  let cabecera: string[] | undefined;
  for (const linea of texto.split("\n")) {
    const n = NODO.exec(linea);
    if (n !== null) {
      nodo = n[1]!.toLowerCase();
      seccion = undefined;
      cabecera = undefined;
      continue;
    }
    if (/^##\s/.test(linea) && nodoDelFichero === undefined) {
      // Otra sección de nivel 2 que no es un nodo (introducción, ejemplos): sus tablas no son de un nodo.
      nodo = undefined;
      cabecera = undefined;
      continue;
    }
    const s = SECCION.exec(linea);
    if (s !== null) {
      seccion = `§${s[1]} ${s[2]}`;
      cabecera = undefined;
      continue;
    }
    if (!linea.trim().startsWith("|")) {
      cabecera = undefined;
      continue;
    }
    const c = celdas(linea);
    if (cabecera === undefined) {
      cabecera = c.map((x) => limpio(x).toLowerCase());
      continue;
    }
    if (c.every((x) => /^:?-+:?$/.test(x))) continue;
    if (nodo === undefined || !/^atributo/.test(cabecera[0] ?? "")) continue;
    const nombres = [...(c[0] ?? "").matchAll(/`([^`]+)`/g)].map((m) => m[1]!.trim()).filter((x) => /^[a-z][\w-]*$/i.test(x));
    if (nombres.length === 0) continue;
    const col = (...nombresDeColumna: string[]): string | undefined => {
      const i = cabecera!.findIndex((h) => nombresDeColumna.includes(h));
      const v = i > 0 ? limpio(c[i] ?? "") : undefined;
      return v === undefined || v === "" || v === "—" ? undefined : v.replace(/`/g, "");
    };
    let descripcion = col("descripción", "descripcion") ?? limpio(c[c.length - 1] ?? "").replace(/`/g, "");
    if (descripcion.length > TOPE_DE_DESCRIPCION) descripcion = `${descripcion.slice(0, TOPE_DE_DESCRIPCION - 1).trimEnd()}…`;
    const tipo = col("tipo");
    const defecto = col("default");
    for (const atributo of nombres) {
      salida.push({
        atributo,
        nodo,
        descripcion,
        fichero,
        ...(tipo === undefined ? {} : { tipo }),
        ...(defecto === undefined ? {} : { defecto }),
        ...(seccion === undefined ? {} : { seccion }),
      });
    }
  }
  return salida;
}

export interface IndiceDeAtributos {
  /** atributo (en minúsculas) → nodo → lo que dice cada fichero que lo documenta. */
  porAtributo: ReadonlyMap<string, ReadonlyMap<string, readonly AtributoDeNodo[]>>;
  porNodo: ReadonlyMap<string, readonly AtributoDeNodo[]>;
  ficheros: readonly string[];
}

export function indiceDeAtributos(entradas: readonly AtributoDeNodo[]): IndiceDeAtributos {
  const porAtributo = new Map<string, Map<string, AtributoDeNodo[]>>();
  const porNodo = new Map<string, AtributoDeNodo[]>();
  for (const e of entradas) {
    const a = e.atributo.toLowerCase();
    const nodos = porAtributo.get(a) ?? new Map<string, AtributoDeNodo[]>();
    const lista = nodos.get(e.nodo) ?? [];
    if (!lista.some((x) => x.fichero === e.fichero)) lista.push(e);
    nodos.set(e.nodo, lista);
    porAtributo.set(a, nodos);
    const deNodo = porNodo.get(e.nodo) ?? [];
    if (!deNodo.some((x) => x.atributo === e.atributo)) deNodo.push(e);
    porNodo.set(e.nodo, deNodo);
  }
  return { porAtributo, porNodo, ficheros: [...new Set(entradas.map((e) => e.fichero))] };
}

const tipoNormal = (t: string | undefined): string | undefined => t?.toLowerCase().replace(/\s+/g, " ").trim();

/** ¿Los ficheros que documentan este atributo en este nodo dicen TIPOS distintos? */
export function tiposQueNoCoinciden(fuentes: readonly AtributoDeNodo[]): boolean {
  const tipos = new Set(fuentes.map((f) => tipoNormal(f.tipo)).filter((t): t is string => t !== undefined));
  return tipos.size > 1;
}

const donde = (e: AtributoDeNodo): string => `${e.fichero}${e.seccion === undefined ? "" : ` ${e.seccion}`}`;

function lineas(nodo: string, fuentes: readonly AtributoDeNodo[]): string[] {
  const [primera, ...otras] = fuentes;
  if (primera === undefined) return [];
  const detalle = (e: AtributoDeNodo): string =>
    `${e.tipo === undefined ? "" : `${e.tipo}${e.defecto === undefined ? "" : `, por omisión ${e.defecto}`}: `}${e.descripcion}`;
  return [
    `- \`${primera.atributo}\` en <${nodo}> — ${detalle(primera)} [${donde(primera)}]`,
    ...otras.map((e) => `    también en ${donde(e)}: ${detalle(e)}`),
    ...(tiposQueNoCoinciden(fuentes) ? ["    ⚠ la skill NO coincide en el tipo entre esos ficheros: lee los dos antes de usarlo."] : []),
  ];
}

/** Los parecidos a un nombre que no está: el mismo prefijo, o el nombre dentro de otro. */
function parecidos(indice: IndiceDeAtributos, nombre: string): string[] {
  const n = nombre.toLowerCase();
  const raiz = n.split("-")[0] ?? n;
  return [...indice.porAtributo.keys()].filter((a) => a !== n && (a.includes(n) || n.includes(a) || a.startsWith(raiz))).slice(0, 8);
}

export const PIE_DEL_INDICE =
  "(Índice de consulta rápida de las tablas de la skill: el detalle, los ejemplos y lo que cambia por tipo de control están en el fichero citado, y si discrepan manda la skill.)";

/**
 * La respuesta, en texto para el modelo. Con `atributo` (y opcionalmente `nodo`): en qué nodos está, con tipo, omisión,
 * descripción corta y fichero; si otro fichero dice otra cosa, también. Con solo `nodo`: sus atributos por nombre,
 * agrupados por subsección. `busqueda` compone la búsqueda en la skill para cuando no está (la da quien monta la tool).
 */
export function consultarAtributos(
  indice: IndiceDeAtributos,
  pregunta: { atributo?: string; nodo?: string },
  busqueda: (atributo: string) => string = (a) => `busca \`${a}\` en las referencias de la skill`
): string {
  const nodo = pregunta.nodo?.replace(/[<>]/g, "").trim().toLowerCase();
  const nodos = [...indice.porNodo.keys()];
  if (nodo !== undefined && nodo !== "" && !indice.porNodo.has(nodo)) {
    return `Las tablas indexadas no traen el nodo <${nodo}>. Traen: ${nodos.map((x) => `<${x}>`).join(", ")}.\n${PIE_DEL_INDICE}`;
  }
  const atributo = pregunta.atributo?.trim();
  if (atributo !== undefined && atributo !== "") {
    const todos = indice.porAtributo.get(atributo.toLowerCase()) ?? new Map<string, readonly AtributoDeNodo[]>();
    const elegidos = [...todos.entries()].filter(([n]) => nodo === undefined || nodo === "" || n === nodo);
    if (elegidos.length > 0) return [...elegidos.flatMap(([n, f]) => lineas(n, f)), PIE_DEL_INDICE].join("\n");
    const otros = [...todos.keys()].map((n) => `<${n}>`);
    const cerca = parecidos(indice, atributo);
    return [
      `\`${atributo}\` no aparece en las tablas de atributos${nodo === undefined || nodo === "" ? "" : ` de <${nodo}>`} que indexo. Eso NO prueba que no exista: ` +
        "la skill documenta atributos también en su texto, en el CSS y por tipo de control.",
      ...(otros.length > 0 ? [`En las tablas sí está en: ${otros.join(", ")}.`] : []),
      ...(cerca.length > 0 ? [`Parecidos que sí están: ${cerca.map((x) => `\`${x}\``).join(", ")}.`] : []),
      `Antes de usarlo, o de descartarlo: ${busqueda(atributo)}. Si la skill tampoco lo trae, no lo pongas: XOne ignora en silencio lo que no conoce.`,
    ].join("\n");
  }
  if (nodo === undefined || nodo === "") {
    return `Pregunta por \`atributo\` (en qué nodos está y qué hace) o por \`nodo\` (${nodos.map((x) => `<${x}>`).join(", ")}: su lista de atributos).`;
  }
  const porSeccion = new Map<string, string[]>();
  for (const e of indice.porNodo.get(nodo) ?? []) {
    const s = `${e.fichero}${e.seccion === undefined ? "" : ` ${e.seccion}`}`;
    porSeccion.set(s, [...(porSeccion.get(s) ?? []), e.atributo]);
  }
  return [
    `Atributos de <${nodo}> en las tablas de la skill (${indice.porNodo.get(nodo)?.length ?? 0}), por fichero y sección; pregunta por uno para su tipo y descripción:`,
    ...[...porSeccion.entries()].map(([s, as]) => `${s}: ${as.join(", ")}`),
    PIE_DEL_INDICE,
  ].join("\n");
}
