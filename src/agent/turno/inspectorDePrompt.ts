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
  /** La suma de TODO lo que va en la petición: sistema, mensajes y esquemas. */
  caracteresTotales: number;
}

/**
 * Lo que ocupa el esquema de una tool, tal y como viaja.
 *
 * Se serializa lo que la librería expone —nombre, descripción y esquema de parámetros— porque
 * una tool de LangChain no publica su forma de red. Es una ESTIMACIÓN y se dice: sirve para
 * comparar unas tools con otras y para ver cuánto pesa la cabecera, no para cuadrar con la
 * factura del proveedor.
 */
export function esquemaDeTool(t: unknown): EsquemaInspeccionado {
  const tool = (t ?? {}) as { name?: unknown; description?: unknown; schema?: unknown };
  const nombre = typeof tool.name === "string" ? tool.name : "?";
  let esquema = "";
  try {
    esquema = JSON.stringify(tool.schema) ?? "";
  } catch {
    // Un esquema con referencias circulares no se puede medir, y no medirlo es mejor que
    // tumbar el turno por un diagnóstico.
    esquema = "";
  }
  const descripcion = typeof tool.description === "string" ? tool.description : "";
  return { nombre, caracteres: nombre.length + descripcion.length + esquema.length };
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

  return {
    origen,
    mensajes: inspeccionados,
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
    wrapModelCall: (request: any, handler: any) => {
      try {
        mkdirSync(join(raiz, ".xonecode"), { recursive: true });
        const foto = inspeccionarLlamada(origen, request, conTexto);
        appendFileSync(ruta, `${JSON.stringify({ v: 1, sesion, at: new Date().toISOString(), ...foto })}\n`, "utf8");
      } catch {
        // Inspeccionar no puede impedir que el agente conteste: es un modo de diagnóstico,
        // no parte del camino del turno. La misma regla que `diagnosticoDeTools`.
      }
      return handler(request);
    },
  });
}
