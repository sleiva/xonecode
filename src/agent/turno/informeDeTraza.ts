/**
 * El LECTOR de `.xonecode/traza-tools.jsonl`: a dónde se fueron los tokens.
 *
 * La traza la escribe `diagnosticoDeTools.ts` y hasta ahora no la leía nadie — un fichero
 * que solo se escribe es un fichero que no contesta nada. Esto la agrega por ORIGEN (el
 * orquestador y cada especialista) y por TOOL, que son las dos preguntas con las que se
 * decide qué recortar: quién gasta, y qué se está leyendo dos veces.
 *
 * Es código PURO —recibe líneas, devuelve un resumen— y por eso lleva test: un contador que
 * cuenta mal invalida en silencio todo lo que se decida mirándolo, igual que un juez de los
 * evals. Quien toca disco es `cli/traza.ts`.
 *
 * **La trampa del formato, y es la razón de la primera prueba**: en una línea `modelo`,
 * `input`, `output` y `cache` son los de ESA llamada, pero `llamadas` es el acumulado del
 * tracker en ese instante (1, 2, 3…) y además es GLOBAL, no del origen. Sumarlo daría seis
 * llamadas donde hubo tres. Las llamadas se cuentan por línea.
 */

import type { ConsumoDeSesion, ConsumoDeSesionPorCuenta } from "../../core/ports.js";

/** Lo que gastó un origen: el orquestador, o un especialista por su nombre. */
export interface GastoDeOrigen {
  origen: string;
  llamadas: number;
  input: number;
  output: number;
  cache: number;
  /** La MAYOR ventana alcanzada, no la última: tras un resumen el contexto baja. */
  contexto: number;
  /**
   * Cuántas veces a ESTE origen se le agotó el presupuesto de llamadas.
   *
   * Cero y ausente son lo mismo aquí a propósito: un origen que nunca se cortó no tiene nada
   * que decir. Lo que NO puede pasar es que un corte no aparezca — «15 llamadas» se lee
   * exactamente igual viniendo de un agente que terminó que de uno al que cortaron, y esa
   * confusión costó una sesión entera de diagnóstico equivocado.
   */
  cortes: number;
}

/**
 * Sobre QUÉ actuó una tool: la ruta o el patrón, y el trozo que pidió.
 *
 * **La identidad es ruta + rango, no la ruta.** La instrucción que el agente recibe es «no
 * releas la misma ruta y el mismo rango» (`DESCRIPCIONES_FICHEROS.read_file`), así que otra
 * página del mismo fichero es trabajo NUEVO: colapsarla con la primera la disfrazaría de
 * desperdicio y mandaría a arreglar lo que está bien.
 */
export interface BlancoDeTool {
  detalle: string;
  /** `offset+limit`, cuando la tool los lleva. Ausente si no los declaró. */
  rango?: string;
  veces: number;
}

/** Una tool, cuántas veces, y sobre qué. */
export interface UsoDeTool {
  nombre: string;
  veces: number;
  /** Ordenados por veces: lo repetido primero, que es lo que se viene a buscar. */
  blancos: BlancoDeTool[];
  /** Cuántos blancos DISTINTOS: «seis lecturas» y «seis ficheros» no son lo mismo. */
  distintos: number;
}

/**
 * **Que pidio el modelo EN LA MISMA respuesta**, que es lo unico que decide si dos tools
 * corren a la vez: langgraph ejecuta las tool_calls de un mensaje concurrentemente.
 *
 * Esto existe porque la pregunta se contesto dos veces con dos metodos y dieron dos numeros.
 * Sobre un turno real de 69 tools, agrupar por el RELOJ exacto daba 18 en rafaga —el
 * milisegundo parte una rafaga por la mitad— y agrupar por los CONTADORES del tracker daba
 * 38, con dos grupos de 1.000 ms de span, o sea rezagados fundidos en una respuesta ajena.
 * Hubo que cruzar los dos criterios para defender un numero, y eso es la señal de que
 * faltaba el dato: ahora cada tool dice de qué mensaje salió.
 */
export interface Paralelismo {
  /** Respuestas que pidieron MAS DE UNA tool. */
  respuestas: number;
  /** Tools pedidas dentro de una respuesta multiple. */
  tools: number;
  /** El maximo pedido de una vez. */
  maximo: number;
  /**
   * Tools sin `respuesta`: de una traza anterior a este campo. No se cuentan a ningun lado.
   * Ausente no es `sola`, la misma regla que `toolsDelOrquestador`.
   */
  sinRespuesta: number;
  /**
   * **El hallazgo que esto vino a buscar**: un fichero escrito mas de una vez en la MISMA
   * respuesta. Son escrituras concurrentes sobre el mismo contenido, y ahi se pierden
   * cambios — medido con el backend de verdad, cuatro ediciones simultaneas dejaron UNA.
   */
  escriturasALaVez: Array<{ detalle: string; veces: number }>;
}

/**
 * **Cuánto METIÓ en el contexto lo que devolvió una tool, que no es cuántas veces se llamó.**
 *
 * Dos `read_file` son dos líneas iguales en el reparto de arriba y pueden ser doscientos
 * caracteres o veinte mil. Lo que se paga es esto. Salió de buscar por qué un turno costaba
 * mucho más que el mismo turno de por la mañana: se podía contar cuántas veces se leía el
 * `SKILL.md` de una skill, pero no lo que pesaba — y por eliminación no se llega.
 *
 * **Son CARACTERES y no se convierten a tokens**: la razón cambia con el modelo y con lo que
 * haya dentro, así que dar tokens aquí sería inventarse una precisión que no se tiene. Para
 * comparar dos turnos sirve igual.
 */
export interface PesoEnContexto {
  /** La tool, si consta de que llamada era su resultado. */
  nombre?: string;
  /** El BLANCO de la lista blanca: la ruta, el patrón, el comando. */
  detalle?: string;
  /** Caracteres devueltos, sumados. */
  chars: number;
  /** Cuantas veces. `chars` entre `veces` dice si es una gorda o muchas pequeñas. */
  veces: number;
}

export interface SesionDeTraza {
  id: string;
  llamadas: number;
  input: number;
  output: number;
  cache: number;
  contexto: number;
  origenes: GastoDeOrigen[];
  tools: UsoDeTool[];
  /**
   * Cuántas tools gastó el ORQUESTADOR. El resto son de los especialistas.
   *
   * Dos cubos y no cinco porque el dato solo da para dos: el namespace del stream dice si un
   * chunk es del padre o de un especialista, pero no de CUÁL —sus segmentos son ids opacos—.
   * Repartir entre los cinco pedía una heurística que ya se vio fallar (daba 21 tools a uno
   * cuyo tope son 20), y un número que parece un dato y es una inferencia es peor que no
   * tenerlo. El cubo que hacía falta para decidir el presupuesto del orquestador es uno de
   * estos dos.
   */
  toolsDelOrquestador: number;
  paralelismo: Paralelismo;
  /** De dónde sale el contexto, lo más gordo primero. Ver `PesoEnContexto`. */
  pesos: PesoEnContexto[];
  /** Todo lo que devolvieron las tools, sumado. */
  charsDeTools: number;
  /** Líneas que no se pudieron leer. Se dicen: una traza a medias no se disimula. */
  ilegibles: number;
}

/**
 * Tokens EQUIVALENTES para comparar dos ejecuciones del mismo modelo, no una factura.
 *
 * Asume la caché a un décimo, que es el orden de magnitud que declaran los proveedores que
 * la cobran. La misma cuenta que imprime el corredor de evals, y vive aquí para que sea UNA:
 * dos fórmulas para el mismo número son dos números que acaban divergiendo.
 */
export function costeEfectivo(uso: { input: number; output: number; cache: number }): number {
  return Math.round(uso.input - 0.9 * uso.cache + uso.output);
}

interface EnConstruccion {
  /** Lo devuelto por cada (tool, blanco). */
  porPeso: Map<string, PesoEnContexto>;
  /** Las tools de cada respuesta del modelo, por su id de mensaje. */
  porRespuesta: Map<string, Array<{ nombre: string; detalle?: string }>>;
  sesion: SesionDeTraza;
  porOrigen: Map<string, GastoDeOrigen>;
  porTool: Map<string, { uso: UsoDeTool; blancos: Map<string, BlancoDeTool> }>;
}

/**
 * `offset+limit` de los parámetros, o nada.
 *
 * Se piden los DOS: un `offset` suelto no dice cuánto se leyó, y es justo lo que hay que ver
 * para saber si una lectura fue un fragmento o el fichero entero.
 */
function rangoDe(parametros: unknown): string | undefined {
  if (typeof parametros !== "object" || parametros === null) return undefined;
  const p = parametros as Record<string, unknown>;
  if (typeof p.offset !== "number" || typeof p.limit !== "number") return undefined;
  return `${p.offset}+${p.limit}`;
}

function numero(valor: unknown): number {
  return typeof valor === "number" && Number.isFinite(valor) ? valor : 0;
}

function texto(valor: unknown): string | undefined {
  return typeof valor === "string" && valor !== "" ? valor : undefined;
}

/**
 * Agrupa las líneas por sesión, en el orden en que aparece cada una.
 *
 * El fichero es append-only y una máquina acumula varias ejecuciones: sin partir por
 * `sesion` el informe sumaría el turno de ayer al de ahora y nadie lo notaría, porque la
 * cifra resultante es perfectamente plausible.
 */
export function resumirTraza(lineas: Iterable<string>): SesionDeTraza[] {
  const sesiones = new Map<string, EnConstruccion>();
  let ultima: EnConstruccion | undefined;
  /**
   * Lo ilegible no trae `sesion`, así que se apunta en la última abierta — y si aún no hay
   * ninguna, ESPERA a la siguiente. Abrir una sesión «?» para alojarlo metería en la lista
   * una ejecución que nunca ocurrió, y una traza se lee contando sesiones.
   */
  let ilegiblesSinDueño = 0;

  const abrir = (id: string): EnConstruccion => {
    const ya = sesiones.get(id);
    if (ya !== undefined) return ya;
    const nueva: EnConstruccion = {
      sesion: {
        id, llamadas: 0, input: 0, output: 0, cache: 0, contexto: 0, origenes: [], tools: [], toolsDelOrquestador: 0,
        paralelismo: { respuestas: 0, tools: 0, maximo: 0, sinRespuesta: 0, escriturasALaVez: [] },
        pesos: [],
        charsDeTools: 0,
        ilegibles: 0,
      },
      porOrigen: new Map(),
      porTool: new Map(),
      porRespuesta: new Map(),
      porPeso: new Map(),
    };
    sesiones.set(id, nueva);
    nueva.sesion.ilegibles += ilegiblesSinDueño;
    ilegiblesSinDueño = 0;
    return nueva;
  };

  for (const linea of lineas) {
    if (linea.trim() === "") continue;
    let evento: Record<string, unknown>;
    try {
      const leido: unknown = JSON.parse(linea);
      if (typeof leido !== "object" || leido === null) throw new Error("no es un objeto");
      evento = leido as Record<string, unknown>;
    } catch {
      if (ultima === undefined) ilegiblesSinDueño += 1;
      else ultima.sesion.ilegibles += 1;
      continue;
    }

    const actual = abrir(texto(evento.sesion) ?? ultima?.sesion.id ?? "?");
    ultima = actual;

    if (evento.tipo === "modelo") {
      const input = numero(evento.input);
      const output = numero(evento.output);
      const cache = numero(evento.cache);
      const contexto = numero(evento.contexto);
      const origen = texto(evento.origen) ?? "(sin origen)";

      actual.sesion.llamadas += 1;
      actual.sesion.input += input;
      actual.sesion.output += output;
      actual.sesion.cache += cache;
      actual.sesion.contexto = Math.max(actual.sesion.contexto, contexto);

      const gasto = actual.porOrigen.get(origen) ?? { origen, llamadas: 0, input: 0, output: 0, cache: 0, contexto: 0, cortes: 0 };
      gasto.llamadas += 1;
      gasto.input += input;
      gasto.output += output;
      gasto.cache += cache;
      gasto.contexto = Math.max(gasto.contexto, contexto);
      actual.porOrigen.set(origen, gasto);
      continue;
    }

    if (evento.tipo === "corte") {
      // Un corte puede llegar ANTES que cualquier línea de modelo de ese origen, así que la
      // entrada se crea aquí si falta: si no, el corte se perdería por llegar el primero.
      const origen = texto(evento.origen) ?? "(sin origen)";
      const gasto = actual.porOrigen.get(origen) ?? { origen, llamadas: 0, input: 0, output: 0, cache: 0, contexto: 0, cortes: 0 };
      gasto.cortes += 1;
      actual.porOrigen.set(origen, gasto);
      continue;
    }

    if (evento.tipo === "resultado") {
      const chars = numero(evento.chars);
      const nombre = texto(evento.nombre);
      const detalle = texto(evento.detalle);
      actual.sesion.charsDeTools += chars;
      const clave = `${nombre ?? ""}\u0000${detalle ?? ""}`;
      const ya = actual.porPeso.get(clave);
      if (ya === undefined) {
        actual.porPeso.set(clave, {
          ...(nombre === undefined ? {} : { nombre }),
          ...(detalle === undefined ? {} : { detalle }),
          chars,
          veces: 1,
        });
      } else {
        ya.chars += chars;
        ya.veces += 1;
      }
      continue;
    }

    if (evento.tipo === "tool") {
      const nombre = texto(evento.nombre) ?? "(sin nombre)";
      // Ausente NO se cuenta como del orquestador: una traza vieja, de antes de que esto se
      // registrara, diría que el orquestador gastó cero — que es «no consta», no «ninguna».
      if (texto(evento.origen) === "orquestador") actual.sesion.toolsDelOrquestador += 1;
      const entrada = actual.porTool.get(nombre) ?? {
        uso: { nombre, veces: 0, blancos: [], distintos: 0 },
        blancos: new Map<string, BlancoDeTool>(),
      };
      entrada.uso.veces += 1;
      const detalle = texto(evento.detalle);
      if (detalle !== undefined) {
        const rango = rangoDe(evento.parametros);
        const clave = `${detalle}\u0000${rango ?? ""}`;
        const ya = entrada.blancos.get(clave);
        if (ya === undefined) entrada.blancos.set(clave, { detalle, ...(rango === undefined ? {} : { rango }), veces: 1 });
        else ya.veces += 1;
      }
      actual.porTool.set(nombre, entrada);

      const respuesta = texto(evento.respuesta);
      if (respuesta === undefined) actual.sesion.paralelismo.sinRespuesta += 1;
      else {
        const juntas = actual.porRespuesta.get(respuesta) ?? [];
        juntas.push({ nombre, ...(detalle === undefined ? {} : { detalle }) });
        actual.porRespuesta.set(respuesta, juntas);
      }
    }
  }

  // Un fichero ENTERO ilegible sí tiene que decir algo: ahí la sesión sin nombre no compite
  // con ninguna de verdad, y devolver una lista vacía se leería como «no hay traza».
  if (ilegiblesSinDueño > 0 && sesiones.size === 0) abrir("?");

  return [...sesiones.values()].map(({ sesion, porOrigen, porTool, porRespuesta, porPeso }) => ({
    ...sesion,
    paralelismo: resumirParalelismo(porRespuesta, sesion.paralelismo.sinRespuesta),
    // Lo más gordo primero, que es lo que se viene a buscar. Desempate por nombre para que
    // dos pesos iguales no salgan en orden distinto en dos lecturas del mismo fichero.
    pesos: [...porPeso.values()].sort(
      (a, b) => b.chars - a.chars || (a.detalle ?? "").localeCompare(b.detalle ?? ""),
    ),
    origenes: [...porOrigen.values()].sort((a, b) => costeEfectivo(b) - costeEfectivo(a)),
    tools: [...porTool.values()].map(({ uso, blancos }) => ({
      ...uso,
      // Estable: `sort` conserva el orden de llegada entre iguales, así que dentro de los
      // que salieron una vez se leen en el orden en que ocurrieron.
      blancos: [...blancos.values()].sort((a, b) => b.veces - a.veces),
      distintos: blancos.size,
    })),
  }));
}

/** Las escrituras, que son las unicas tools donde coincidir en el mismo fichero pierde datos. */
const ESCRIBE = new Set(["write_file", "edit_file"]);

function resumirParalelismo(
  porRespuesta: Map<string, Array<{ nombre: string; detalle?: string }>>,
  sinRespuesta: number
): Paralelismo {
  const multiples = [...porRespuesta.values()].filter((g) => g.length > 1);
  const choques = new Map<string, number>();
  for (const grupo of porRespuesta.values()) {
    const porFichero = new Map<string, number>();
    for (const t of grupo) {
      if (!ESCRIBE.has(t.nombre) || t.detalle === undefined) continue;
      porFichero.set(t.detalle, (porFichero.get(t.detalle) ?? 0) + 1);
    }
    // Se queda el MAXIMO de una respuesta, no la suma de todas: lo que se cuenta es
    // `cuantas a la vez`, y sumar dos respuestas de dos daria cuatro, que nunca ocurrio.
    for (const [fichero, veces] of porFichero) {
      if (veces > 1) choques.set(fichero, Math.max(choques.get(fichero) ?? 0, veces));
    }
  }
  return {
    respuestas: multiples.length,
    tools: multiples.reduce((a, g) => a + g.length, 0),
    maximo: multiples.reduce((a, g) => Math.max(a, g.length), 0),
    sinRespuesta,
    escriturasALaVez: [...choques.entries()]
      .map(([detalle, veces]) => ({ detalle, veces }))
      .sort((a, b) => b.veces - a.veces || a.detalle.localeCompare(b.detalle)),
  };
}

function cifra(n: number): string {
  return n.toLocaleString("es-ES");
}

/** Cuántos blancos se enseñan por tool antes de contar el resto. */
const TOPE_DE_BLANCOS = 10;

/**
 * La entrada que NO venía de caché: texto nuevo que el modelo no había visto.
 *
 * **Se pinta al lado del total porque el total solo se lee bien con ella.** `entrada` es lo
 * MANDADO, caché incluida, y en un turno con varias rondas la mayor parte es el historial
 * reenviado — así que medio millón de entrada puede ser cuarenta mil de texto nuevo. Sin este
 * número al lado hay que hacer la resta con el porcentaje, y se lee mal en las DOS
 * direcciones: el total solo parece un gasto enorme que no lo es, y el efectivo solo esconde
 * el volumen que de verdad viajó. Las dos cifras son ciertas y contestan preguntas distintas.
 *
 * Y es la única sobre la que se puede ACTUAR: lo fresco de un turno es casi todo lo que
 * devuelven las tools, y eso se acota. El reenvío es consecuencia de cuántas llamadas haya.
 */
function frescos(uso: { input: number; cache: number }): number {
  return Math.max(0, uso.input - uso.cache);
}

function porcentajeDeCache(uso: { input: number; cache: number }): number {
  return uso.input === 0 ? 0 : Math.round((100 * uso.cache) / uso.input);
}

/** Una línea por origen y una por tool. Sin colores: esto es un informe, no una piel. */
/**
 * Cuantas filas de peso se pintan. Lo que no cabe se CUENTA, igual que los blancos: una lista
 * recortada en silencio se lee como la lista entera.
 */
const TOPE_DE_PESOS = 12;

export function pintarSesion(sesion: SesionDeTraza): string[] {
  const lineas: string[] = [];
  lineas.push(`--- traza ${sesion.id} ---`);
  lineas.push(
    `  ${sesion.llamadas} llamada(s) · entrada ${cifra(sesion.input)} (fresca ${cifra(frescos(sesion))}) · ` +
      `salida ${cifra(sesion.output)} · caché ${porcentajeDeCache(sesion)}% · ` +
      `efectivo ≈${cifra(costeEfectivo(sesion))} · ventana máx ${cifra(sesion.contexto)}`
  );

  if (sesion.origenes.length > 0) {
    lineas.push("  por origen (lo que más cuesta, primero)");
    for (const o of sesion.origenes) {
      const parte = sesion.input + sesion.output === 0 ? 0 : Math.round((100 * costeEfectivo(o)) / costeEfectivo(sesion));
      lineas.push(
        `    ${o.origen.padEnd(18)} ${String(o.llamadas).padStart(3)} llam · entrada ${cifra(o.input)} (fresca ${cifra(frescos(o))}) · ` +
          `salida ${cifra(o.output)} · caché ${porcentajeDeCache(o)}% · efectivo ≈${cifra(costeEfectivo(o))} (${parte}%)` +
          // Al FINAL de su línea y no en una aparte: lo que hay que poder leer de un vistazo es
          // «estas llamadas no son las de un agente que terminó». Separado en otra línea se lee
          // como una nota al pie de algo que ya se dio por bueno.
          (o.cortes > 0 ? `  ⚠ CORTADO por tope${o.cortes > 1 ? ` ×${o.cortes}` : ""}` : "")
      );
    }
  }

  if (sesion.tools.length > 0) {
    // El reparto solo se dice si CONSTA. Una traza de antes de que el origen se registrara
    // daría cero, y un cero medido y un cero por ausencia no se distinguirían.
    const total = sesion.tools.reduce((s, x) => s + x.veces, 0);
    const orq = sesion.toolsDelOrquestador;
    lineas.push(
      orq === 0
        ? "  tools"
        : `  tools (orquestador ${orq} de ${total}, el resto de los especialistas)`
    );
    for (const t of sesion.tools) {
      // «Seis lecturas» y «seis ficheros» no son lo mismo, así que se dicen los dos: lo
      // primero es el trabajo y lo segundo el alcance, y solo juntos se ve una relectura.
      const alcance = t.distintos === 0 ? "" : ` · ${t.distintos} distinto${t.distintos === 1 ? "" : "s"}`;
      lineas.push(`    ${t.nombre.padEnd(18)} ×${t.veces}${alcance}`);
      for (const b of t.blancos.slice(0, TOPE_DE_BLANCOS)) {
        lineas.push(`        ${b.detalle}${b.rango === undefined ? "" : ` ${b.rango}`}${b.veces > 1 ? `   ×${b.veces}` : ""}`);
      }
      // Lo que no cabe se CUENTA, nunca se calla: una lista recortada en silencio se lee
      // como la lista entera, y aquí eso sería «solo tocó estos diez ficheros».
      const fuera = t.blancos.length - TOPE_DE_BLANCOS;
      if (fuera > 0) lineas.push(`        … y ${fuera} más`);
    }
  }

  if (sesion.pesos.length > 0) {
    // Solo si CONSTA: una traza anterior a este campo daria cero, y un cero se leeria como
    // «no metio nada en el contexto». La misma regla que el reparto por origen.
    lineas.push(`  lo que METIÓ en el contexto: ${cifra(sesion.charsDeTools)} caracteres devueltos por las tools`);
    for (const w of sesion.pesos.slice(0, TOPE_DE_PESOS)) {
      const cuantas = w.veces > 1 ? `  ×${w.veces}` : "";
      // La MEDIA solo con mas de una: dice si es una respuesta gorda o muchas pequeñas, que
      // se arreglan de forma distinta —acotar la que devuelve mucho, o dejar de pedirla—.
      const media = w.veces > 1 ? `  (media ${cifra(Math.round(w.chars / w.veces))})` : "";
      lineas.push(`    ${cifra(w.chars).padStart(9)}  ${(w.nombre ?? "(sin nombre)").padEnd(18)} ${w.detalle ?? ""}${cuantas}${media}`);
    }
    const fuera = sesion.pesos.length - TOPE_DE_PESOS;
    if (fuera > 0) lineas.push(`    … y ${fuera} más`);
  }

  const par = sesion.paralelismo;
  // Solo si CONSTA: una traza anterior a este campo daría cero respuestas múltiples, y eso
  // se leería como «no hubo paralelismo» cuando es «no se registró». La misma regla que el
  // reparto de tools por origen, dos bloques más arriba.
  if (par.respuestas > 0 || par.escriturasALaVez.length > 0) {
    lineas.push(`  en paralelo: ${par.tools} tool(s) en ${par.respuestas} respuesta(s) · máximo ${par.maximo} a la vez`);
    for (const e of par.escriturasALaVez) {
      // Al final de la sección y con el aviso delante: esto no es una estadística, es el
      // sitio donde se pierden cambios. Dos escrituras del mismo mensaje sobre el mismo
      // fichero se resuelven contra el MISMO contenido de partida, y gana la última.
      lineas.push(`    ⚠ ${e.veces} escrituras sobre ${e.detalle} en UNA respuesta`);
    }
  }
  if (par.sinRespuesta > 0) {
    lineas.push(`  ${par.sinRespuesta} tool(s) sin respuesta anotada: traza anterior a ese campo, no contadas`);
  }

  if (sesion.ilegibles > 0) lineas.push(`  ${sesion.ilegibles} línea(s) ilegibles, no contadas`);
  return lineas;
}

/**
 * Lo que costó UN turno, para cerrarlo con una cifra en vez de con un silencio.
 *
 * **Las dos cuentas no se suman**, y por eso son dos filas: los tokens del grafo van contra
 * la clave de API de quien corre y los del agente EXTERNO contra su suscripción. Un token es
 * un token, pero su precio no, así que un total sería una cifra que no significa nada.
 *
 * La cuenta externa **ausente se calla**: una fila de ceros afirma que se midió un agente
 * externo que no corrió. Y una `ventana` de cero es «no se pudo medir», no «cabe todo»:
 * misma regla que `consumoPersistible`, que tampoco la estampa.
 *
 * Vive aquí y no en `cli/run.ts` por el patrón de fallo de este repo: compuesta dentro de
 * `correrReal` —que todos sus tests doblan— la regla quedaría escrita y sin nadie mirándola.
 */
export function pintarGasto(consumo: ConsumoDeSesionPorCuenta, llamadas: number): string[] {
  const fila = (nombre: string, c: ConsumoDeSesion, llam?: number): string =>
    `  ${nombre.padEnd(8)}${llam === undefined ? "        " : `${String(llam).padStart(3)} llam `}· ` +
    `entrada ${cifra(c.entrada)} · salida ${cifra(c.salida)} · caché ${porcentajeDeCache({ input: c.entrada, cache: c.cache })}% · ` +
    `efectivo ≈${cifra(costeEfectivo({ input: c.entrada, output: c.salida, cache: c.cache }))}`;

  const lineas = ["--- gasto del turno ---", fila("modelo", consumo.modelo, llamadas)];
  const e = consumo.externo;
  if (e.entrada > 0 || e.salida > 0) lineas.push(fila("externo", e));
  if (consumo.contexto > 0) lineas.push(`  ventana  ${cifra(consumo.contexto)} de entrada en la última llamada`);
  return lineas;
}
