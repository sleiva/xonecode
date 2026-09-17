/**
 * El INSPECTOR: qué entra de verdad al modelo en cada llamada.
 *
 * Todo lo que se ha medido en este harness hasta ahora era lo que SALE —tokens contados por el
 * proveedor, tools llamadas, ficheros leídos—, y de ahí se DEDUCÍA lo que entra. Eso llegó
 * lejos, pero se quedó corto dos veces el mismo día: cuando un especialista perdió su encargo en
 * el resumen hubo que reconstruirlo leyendo la fuente de la librería, y cuando el chat empezó a
 * enseñar ficheros enteros hubo que adivinar por dónde se colaban. Con esto se mira.
 *
 * Es un `wrapModelCall`, o sea el último sitio antes de que la petición salga: lo que ve es
 * exactamente lo que el modelo va a recibir, después de TODOS los middleware —el resumen, la
 * devolución del encargo, la conversión de los `ToolMessage`— y no lo que alguien creía haber
 * puesto.
 *
 * ## Dos niveles, y el de por omisión no lleva contenido
 *
 * - `XONECODE_TRACE_PROMPT=1` apunta la FORMA: origen, cuántos mensajes, de qué tipo, cuánto
 *   ocupa cada uno, el tamaño del prompt de sistema y cuántas tools van declaradas. Con eso se
 *   contesta la pregunta cara —a dónde se va el contexto— sin sacar a disco una línea del
 *   proyecto.
 * - `XONECODE_TRACE_PROMPT=todo` añade el TEXTO. Es lo que hace falta para ver por qué un
 *   agente contesta lo que contesta, y por eso existe; pero saca a disco el contenido de lo que
 *   se haya leído, así que se pide aparte y a sabiendas. Es la misma disciplina que
 *   `diagnosticoDeTools.ts`, que nunca guarda contenido: aquí el contenido ES la pregunta, así
 *   que no se puede prohibir — se puede hacer explícito.
 *
 * El fichero vive en `.xonecode/`, que está denegada al agente, fuera de git y fuera de lo que
 * sube a CloudStudio.
 */

import { createHash } from "node:crypto";
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createMiddleware } from "langchain";

export const VARIABLE_TRAZA_PROMPT = "XONECODE_TRACE_PROMPT";
export const NOMBRE_TRAZA_PROMPT = "traza-prompt.jsonl";

/** Ruta pública, solo para poder decirle a alguien dónde quedó su diagnóstico. */
export function rutaTrazaDePrompt(raiz: string): string {
  return join(raiz, ".xonecode", NOMBRE_TRAZA_PROMPT);
}

/** Qué se apunta de cada mensaje. El `texto` solo con el nivel `todo`. */
export interface MensajeInspeccionado {
  tipo: string;
  caracteres: number;
  /** Cuántas tool calls pide, si pide alguna. Ausente si ninguna. */
  toolCalls?: number;
  texto?: string;
}

/** Una tool declarada: su nombre y lo que ocupa su esquema. */
export interface EsquemaInspeccionado {
  nombre: string;
  caracteres: number;
}

export interface LlamadaInspeccionada {
  origen: string;
  mensajes: MensajeInspeccionado[];
  sistema: { caracteres: number; texto?: string };
  tools: number;
  /**
   * Lo que ocupan los ESQUEMAS de las tools, que es la mitad que faltaba.
   *
   * Medido el 17-09-2026 con la primera versión de esto: el inspector decía 8.151 caracteres
   * —unos 2k tokens— en la última llamada de un turno que pagó 3.900 tokens por llamada. La
   * diferencia eran los esquemas, que se reenvían ENTEROS en cada petición y aquí se contaban
   * como un número («tools: 8») en vez de como tamaño. Es lo mismo que documenta el harness de
   * deepseek: «schema tokens repeat on every request; restricting a tool removes its entire
   * schema cost for that agent».
   */
  esquemas: { caracteres: number; porTool: EsquemaInspeccionado[] };
  /**
   * La HUELLA de lo que va delante: el prompt de sistema y los esquemas, en su orden.
   *
   * Es lo que decide si la caché de un proveedor puede enganchar, porque toda caché de prompt
   * es por PREFIJO: si esto cambia entre dos llamadas, aunque sea por el orden de las tools o
   * por una descripción generada, la reutilización se rompe desde el primer byte distinto. Y se
   * contesta con un hash en vez de con el texto, así que la pregunta se puede responder sin
   * sacar una línea del proyecto a disco.
   */
  prefijo: { caracteres: number; huella: string };
  /** La suma de TODO lo que va en la petición: sistema, mensajes y esquemas. */
  caracteresTotales: number;
  /**
   * Lo que el PROVEEDOR dice que costó esa misma llamada.
   *
   * Es la otra mitad, y va en la MISMA línea a propósito: el inspector cuenta caracteres y la
   * factura viene en tokens, así que separarlos obliga a cruzar dos ficheros a ojo para
   * contestar «¿de dónde salió esta cifra?». Juntos, una línea dice lo que entró y lo que
   * costó. La primera medida con esto puesto habría enseñado de golpe que los esquemas eran el
   * 80 % del turno, en vez de deducirlo restando.
   *
   * Ausente cuando el proveedor no lo manda: un cero aquí sería una medición que nadie hizo.
   */
  uso?: { entrada: number; salida: number; cache: number };
}

/**
 * Lo que ocupa el esquema de una tool, tal y como viaja.
 *
 * Se serializa lo que la librería expone —nombre, descripción y esquema de parámetros— porque
 * una tool de LangChain no publica su forma de red. Es una ESTIMACIÓN y se dice: sirve para
 * comparar unas tools con otras y para ver cuánto pesa la cabecera, no para cuadrar con la
 * factura del proveedor.
 */
/**
 * El esquema de una tool como TEXTO: nombre, descripción y parámetros.
 *
 * Es lo que se mide y lo que se huele, y tiene que ser el CONTENIDO y no un resumen: la primera
 * versión hacía la huella sobre `{nombre, caracteres}`, o sea sobre la propia medida, y entonces
 * una descripción que cambiara conservando el largo habría dado la misma huella. Una huella que
 * no cambia cuando cambia lo que representa no vale para nada.
 */
export function textoDeEsquema(t: unknown): string {
  const tool = (t ?? {}) as { name?: unknown; description?: unknown; schema?: unknown };
  const nombre = typeof tool.name === "string" ? tool.name : "?";
  const descripcion = typeof tool.description === "string" ? tool.description : "";
  let esquema = "";
  try {
    esquema = JSON.stringify(tool.schema) ?? "";
  } catch {
    // Un esquema con referencias circulares no se puede medir, y no medirlo es mejor que
    // tumbar el turno por un diagnóstico.
    esquema = "";
  }
  return `${nombre}\u0000${descripcion}\u0000${esquema}`;
}

export function esquemaDeTool(t: unknown): EsquemaInspeccionado {
  const nombre = typeof (t as { name?: unknown } | null)?.name === "string" ? ((t as { name: string }).name) : "?";
  // La MISMA función que la huella: dos formas de contar lo mismo son dos cifras que divergen.
  return { nombre, caracteres: textoDeEsquema(t).length - 2 };
}

/** El tipo de un mensaje, venga como venga: langchain no lo expone igual en todos. */
export function tipoDeMensaje(msg: unknown): string {
  if (!msg || typeof msg !== "object") return "?";
  const m = msg as Record<string, unknown>;
  if (typeof m.type === "string") return m.type;
  if (typeof m.role === "string") return m.role;
  if (typeof m.tool_call_id === "string") return "tool";
  const clase = (m.constructor as { name?: string } | undefined)?.name;
  return typeof clase === "string" ? clase : "?";
}

/**
 * El consumo que declara una respuesta del modelo, si lo declara.
 *
 * Se mira `usage_metadata` (el estándar de LangChain, que los tres adaptadores que usamos
 * rellenan) y su `input_token_details.cache_read`. Lo que no venga se queda AUSENTE en vez de
 * volverse cero: ya hay bastantes ceros inventados en este oficio.
 */
export function usoDeRespuesta(respuesta: unknown): { entrada: number; salida: number; cache: number } | undefined {
  const u = (respuesta as { usage_metadata?: unknown } | null)?.usage_metadata as Record<string, unknown> | undefined;
  if (u === undefined || u === null) return undefined;
  const n = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  const detalles = u.input_token_details as Record<string, unknown> | undefined;
  return { entrada: n(u.input_tokens), salida: n(u.output_tokens), cache: n(detalles?.cache_read) };
}

/** El texto de un mensaje, con los bloques concatenados. Nunca `undefined`. */
export function textoDeMensaje(msg: unknown): string {
  const c = (msg as { content?: unknown } | null)?.content;
  if (typeof c === "string") return c;
  if (Array.isArray(c)) {
    return c
      .map((b) => (typeof b === "string" ? b : typeof b === "object" && b !== null && "text" in b ? String((b as { text: unknown }).text) : ""))
      .join("");
  }
  return "";
}

function cuantasToolCalls(msg: unknown): number {
  const llamadas = (msg as { tool_calls?: unknown } | null)?.tool_calls;
  return Array.isArray(llamadas) ? llamadas.length : 0;
}

/**
 * La FOTO de una petición al modelo, sin tocar disco: pura, y por eso con test.
 *
 * `conTexto` decide si se lleva el contenido. Separar el cálculo de la escritura es lo que
 * permite comprobar que la forma es correcta sin montar un agente ni escribir un fichero.
 */
export function inspeccionarLlamada(origen: string, peticion: unknown, conTexto: boolean): LlamadaInspeccionada {
  const p = (peticion ?? {}) as { messages?: unknown; systemMessage?: unknown; systemPrompt?: unknown; tools?: unknown };
  const mensajes = Array.isArray(p.messages) ? p.messages : [];
  const sistema = typeof p.systemPrompt === "string" ? p.systemPrompt : textoDeMensaje(p.systemMessage);

  const inspeccionados = mensajes.map((m) => {
    const texto = textoDeMensaje(m);
    const toolCalls = cuantasToolCalls(m);
    return {
      tipo: tipoDeMensaje(m),
      caracteres: texto.length,
      ...(toolCalls > 0 ? { toolCalls } : {}),
      ...(conTexto ? { texto } : {}),
    };
  });

  const tools = Array.isArray(p.tools) ? p.tools : [];
  const porTool = tools.map(esquemaDeTool).sort((a, b) => b.caracteres - a.caracteres);
  const esquemas = porTool.reduce((a, t) => a + t.caracteres, 0);

  // El orden cuenta: dos peticiones con las mismas tools en distinto orden son dos prefijos
  // distintos para la caché, así que la huella se toma de `tools` tal y como viaja, no de la
  // lista ordenada por tamaño que se guarda para leerla.
  const prefijo = `${sistema}\u0000${tools.map(textoDeEsquema).join("\u0000")}`;

  return {
    origen,
    mensajes: inspeccionados,
    prefijo: { caracteres: prefijo.length, huella: createHash("sha1").update(prefijo).digest("hex").slice(0, 12) },
    sistema: { caracteres: sistema.length, ...(conTexto ? { texto: sistema } : {}) },
    tools: tools.length,
    esquemas: { caracteres: esquemas, porTool },
    // El prompt de sistema y los esquemas se reenvían en CADA llamada: sin sumarlos aquí, la
    // cifra diría que una conversación corta es barata cuando su cabecera es lo que cuesta.
    caracteresTotales: sistema.length + esquemas + inspeccionados.reduce((a, m) => a + m.caracteres, 0),
  };
}

/**
 * El middleware. Devuelve `undefined` si la traza no está pedida, para no montarlo.
 *
 * Se pone al FINAL de la lista de cada agente: el primero envuelve al siguiente, así que el
 * último es el que ve la petición ya pasada por todos los demás — que es justo lo que se quiere
 * inspeccionar. Puesto delante mentiría enseñando lo que otros van a cambiar después.
 */
export function inspectorDePrompt(
  raiz: string,
  origen: string,
  entorno: NodeJS.ProcessEnv = process.env
): ReturnType<typeof createMiddleware> | undefined {
  const nivel = entorno[VARIABLE_TRAZA_PROMPT];
  if (nivel !== "1" && nivel !== "todo") return undefined;
  const conTexto = nivel === "todo";
  const ruta = rutaTrazaDePrompt(raiz);
  const sesion = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  return createMiddleware({
    name: "InspectorDePromptMiddleware",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    wrapModelCall: async (request: any, handler: any) => {
      const foto = (() => {
        try {
          return inspeccionarLlamada(origen, request, conTexto);
        } catch {
          return undefined;
        }
      })();
      // La llamada va PRIMERO y su fallo se propaga intacto: inspeccionar no puede cambiar lo
      // que le pasa al turno, ni siquiera para apuntarlo.
      const respuesta = await handler(request);
      try {
        const uso = usoDeRespuesta(respuesta);
        if (foto !== undefined) {
          mkdirSync(join(raiz, ".xonecode"), { recursive: true });
          const linea = { v: 1, sesion, at: new Date().toISOString(), ...foto, ...(uso === undefined ? {} : { uso }) };
          appendFileSync(ruta, `${JSON.stringify(linea)}\n`, "utf8");
        }
      } catch {
        // Inspeccionar no puede impedir que el agente conteste: es un modo de diagnóstico,
        // no parte del camino del turno. La misma regla que `diagnosticoDeTools`.
      }
      return respuesta;
    },
  });
}
