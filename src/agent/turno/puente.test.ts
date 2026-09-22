import { describe, it, expect } from "vitest";
import { aEventos, razonamientoDe, textoDe, toolsDe, esDelPadre } from "./puente.js";
import type { DomainEvent, PendienteDeAprobacion } from "../../core/events.js";

async function recoger(chunks: unknown[]): Promise<DomainEvent[]> {
  async function* flujo(): AsyncIterable<unknown> {
    for (const c of chunks) yield c;
  }
  const salida: DomainEvent[] = [];
  for await (const e of aEventos(flujo())) salida.push(e);
  return salida;
}

/** Igual que `recoger`, pero inyectando la función de pendientes del interrupt. */
async function recogerCon(
  chunks: unknown[],
  pendientes: () => Promise<PendienteDeAprobacion[]>
): Promise<DomainEvent[]> {
  async function* flujo(): AsyncIterable<unknown> {
    for (const c of chunks) yield c;
  }
  const salida: DomainEvent[] = [];
  for await (const e of aEventos(flujo(), pendientes)) salida.push(e);
  return salida;
}

describe("textoDe", () => {
  it("lee `text` y `content` de cadena", () => {
    expect(textoDe({ text: "hola" })).toBe("hola");
    expect(textoDe({ content: "hola" })).toBe("hola");
  });

  it("con contenido en BLOQUES concatena solo el texto", () => {
    // Un `String(content)` daría el repr de la lista, razonamiento incluido: el
    // usuario vería basura donde espera una frase.
    expect(textoDe({ content: [{ type: "thinking", thinking: "…" }, { type: "text", text: "hola" }] })).toBe("hola");
  });

  it("el pensamiento NO se cuela en el texto de la respuesta", () => {
    // La forma real de Gemini (`@langchain/google-genai`): bloques `thinking` mezclados con
    // los de texto dentro del mismo `content`.
    const msg = {
      content: [
        { type: "thinking", thinking: "déjame ver el fichero" },
        { type: "text", text: "Listo." },
      ],
    };
    expect(textoDe(msg)).toBe("Listo.");
    expect(razonamientoDe(msg)).toBe("déjame ver el fichero");
  });

  it("también entiende la forma `{ text, thought: true }` de otros adaptadores", () => {
    const msg = { content: [{ text: "pensando", thought: true }, { type: "text", text: "dicho" }] };
    expect(razonamientoDe(msg)).toBe("pensando");
    expect(textoDe(msg)).toBe("dicho");
  });

  it("sin bloques de pensamiento, el razonamiento es cadena vacía y no `undefined`", () => {
    expect(razonamientoDe({ content: "solo texto" })).toBe("");
    expect(razonamientoDe(null)).toBe("");
  });

  it("lo que no sabe leer da cadena vacía, no `undefined` ni un repr", () => {
    expect(textoDe(null)).toBe("");
    expect(textoDe({ content: 42 })).toBe("");
  });
});

describe("toolsDe", () => {
  it("saca las tool calls de un chunk de updates: nombre y detalle de la lista blanca", () => {
    const dato = {
      agent: {
        messages: [
          {
            tool_calls: [
      { name: "read_file", args: { file_path: "app.xne", offset: 20, limit: 80 } },
      { name: "grep", args: { pattern: "realizarLogin", path: "/src", max_count: 10 } },
              // Sin entrada en la lista blanca: nombre sí, detalle no.
              { name: "studio_read", args: { file_path: "app.xne", auth: "Bearer x" } },
            ],
          },
        ],
      },
    };
    expect(toolsDe(dato)).toEqual([
      { nombre: "read_file", detalle: "app.xne", parametros: { file_path: "app.xne", offset: 20, limit: 80 } },
      { nombre: "grep", detalle: "realizarLogin", parametros: { pattern: "realizarLogin", path: "/src", max_count: 10 } },
      { nombre: "studio_read" },
    ]);
  });

  it("un chunk sin tool calls no inventa ninguna", () => {
    expect(toolsDe({ agent: { messages: [{ content: "hola" }] } })).toEqual([]);
    expect(toolsDe(null)).toEqual([]);
  });

  it("para una escritura conserva la ruta pero nunca el contenido", () => {
    const dato = {
      agent: {
        messages: [{ tool_calls: [{ name: "write_file", args: { file_path: "/MEMORIA.md", content: "token-secreto" } }] }],
      },
    };
    expect(toolsDe(dato)).toEqual([{ nombre: "write_file", detalle: "/MEMORIA.md", parametros: { file_path: "/MEMORIA.md" } }]);
    expect(JSON.stringify(toolsDe(dato))).not.toContain("token-secreto");
  });

  /**
   * **De que RESPUESTA salio cada tool, que es lo unico que decide si van en paralelo.**
   *
   * Sin este campo la traza no podia contestarlo y habia que adivinarlo con dos heuristicas
   * que se contradicen. Medido sobre un turno real de 69 tools: por el reloj exacto salian 18
   * en rafaga —el milisegundo PARTE una rafaga— y por los contadores del tracker salian 38,
   * con dos grupos de 1.000 ms de span, o sea rezagados FUNDIDOS en una respuesta ajena. La
   * conclusion que se saco de ahi (siete ediciones simultaneas sobre el mismo fichero) resulto
   * ser cierta, pero no por el metodo: hubo que cruzar los dos criterios para defenderla.
   */
  it("las tools de UNA respuesta comparten el id del mensaje, y las de otra no", () => {
    const dato = {
      agent: {
        messages: [
          {
            id: "msg-1",
            tool_calls: [
              { name: "edit_file", args: { file_path: "/f.js", old_string: "a", new_string: "b" } },
              { name: "edit_file", args: { file_path: "/f.js", old_string: "c", new_string: "d" } },
            ],
          },
          { id: "msg-2", tool_calls: [{ name: "read_file", args: { file_path: "/f.js" } }] },
        ],
      },
    };
    const [a, b, c] = toolsDe(dato);
    expect(a?.respuesta).toBe("msg-1");
    expect(b?.respuesta).toBe("msg-1");
    expect(a?.respuesta).toBe(b?.respuesta); // dos ediciones PEDIDAS A LA VEZ
    expect(c?.respuesta).toBe("msg-2");
    expect(c?.respuesta).not.toBe(a?.respuesta);
  });

  /** Un mensaje sin id no inventa uno: ausente es "no consta", como en todo lo demas. */
  it("sin id del mensaje, el campo no sale", () => {
    const sinId = toolsDe({ agent: { messages: [{ tool_calls: [{ name: "read_file", args: { file_path: "/f.js" } }] }] } });
    expect(sinId[0]).not.toHaveProperty("respuesta");
    const vacio = toolsDe({ agent: { messages: [{ id: "", tool_calls: [{ name: "read_file", args: { file_path: "/f.js" } }] }] } });
    expect(vacio[0]).not.toHaveProperty("respuesta");
  });
});

describe("esDelPadre", () => {
  it("el padre es ns vacío o de UN segmento", () => {
    expect(esDelPadre([])).toBe(true);
    expect(esDelPadre(["model_request:abc"])).toBe(true);
  });

  it("dos segmentos ya es un especialista", () => {
    expect(esDelPadre(["tools:abc", "model_request:def"])).toBe(false);
    expect(esDelPadre(["tools:abc", "tools:def"])).toBe(false);
  });
});

describe("aEventos", () => {
  it("los tokens del grafo PADRE se emiten", () => {
    // ns vacío = el padre.
    return expect(recoger([[[], "messages", [{ text: "hola", id: "r1" }, {}]]])).resolves.toEqual([
      { tipo: "token", texto: "hola", msgId: "r1" },
    ]);
  });

  it("los tokens del padre llegan con ns [model_request:…], NO vacío", async () => {
    // El fallo mudo que esto cierra: dar por hecho `ns: []` para el padre descartaba
    // TODOS los tokens. El turno corría, enseñaba sus tools, decía «sin cambios»… y no
    // contestaba nada.
    const e = await recoger([[["model_request:abc"], "messages", [{ text: "hola", id: "r1" }, {}]]]);
    expect(e).toEqual([{ tipo: "token", texto: "hola", msgId: "r1" }]);
  });

  it("los de un ESPECIALISTA no: son su razonamiento, no la respuesta", async () => {
    // Medido: un especialista siempre lleva `tools:` delante, porque se le invoca con
    // la tool `task`. Son 745 chunks frente a 148 del padre.
    const e = await recoger([[["tools:abc", "model_request:def"], "messages", [{ text: "pensando…", id: "x" }, {}]]]);
    expect(e).toEqual([]);
  });

  it("el RESULTADO de una tool no se emite como respuesta, por más que venga por `messages`", async () => {
    /**
     * El agujero que esto cierra, visto en la consola web del usuario: bajo el tramo de
     * «Trabajo del agente» aparecía el fichero ENTERO leído, con sus números de línea y el
     * pie `[Read 12 lines (lines 1-12 of 164 total)…]` — o sea la salida cruda de
     * `read_file`, pintada como si fuera lo que contesta el asistente.
     *
     * Rompía el invariante de `core/events.ts` («ningún evento lleva argumentos de tool, ni
     * truncados»), y lo destapó el cambio que hace al orquestador leer en vez de delegarlo
     * todo: antes solo se colaba el resultado de `task`, que casualmente ERA una respuesta.
     */
    const contenido = "1  <?xml version=\"1.0\"?>\n2  <coll name=\"EntradaApp\">";
    expect(await recoger([[["model_request:abc"], "messages", [{ type: "tool", content: contenido, id: "t1", tool_call_id: "c1" }, {}]]])).toEqual(
      []
    );
    // Y por las dos vías con las que se reconoce un `ToolMessage`, no solo por `type`.
    expect(await recoger([[[], "messages", [{ content: contenido, id: "t2", tool_call_id: "c2" }, {}]]])).toEqual([]);
  });

  it("pero SU trabajo sí se cuenta, por las tools", async () => {
    const dato = { agent: { messages: [{ tool_calls: [{ name: "read_file" }] }] } };
    expect(await recoger([[["dev:abc"], "updates", dato]])).toEqual([{ tipo: "tool", nombre: "read_file" }]);
  });

  it("puede observar una tool sin alterar el evento que pinta la consola", async () => {
    const vistas: unknown[] = [];
    const dato = { agent: { messages: [{ tool_calls: [{ name: "grep", args: { pattern: "MTLogin" } }] }] } };
    async function* flujo(): AsyncIterable<unknown> {
      yield [["tools:abc"], "updates", dato];
    }
    const e: DomainEvent[] = [];
    for await (const evento of aEventos(flujo(), undefined, (tool) => vistas.push(tool))) e.push(evento);
    // El `origen` va en lo OBSERVADO y NO en el evento: la consola pinta una línea de tool
    // igual venga de donde venga —el colapsador las agrupa a todas—, y meterlo ahí sería un
    // dato de diagnóstico colándose en la piel.
    expect(vistas).toEqual([
      { nombre: "grep", detalle: "MTLogin", parametros: { pattern: "MTLogin" }, origen: "especialista" },
    ]);
    expect(e).toEqual([{ tipo: "tool", nombre: "grep", detalle: "MTLogin" }]);
  });

  it("una tool del ORQUESTADOR se marca como tal: en `updates` llega con namespace VACÍO", async () => {
    // El error que esto fija: `esDelPadre` es la longitud del namespace y vale para `messages`,
    // donde el padre llega como `["model_request:…"]`. En `updates` el padre llega con `[]` y un
    // especialista con `["tools:…"]` — las dos de longitud 1 y 0. Usar la longitud aquí imputaba
    // al orquestador TODAS las tools: el informe decía «orquestador 70 de 70».
    const vistas: Array<{ origen?: string }> = [];
    const dato = { agent: { messages: [{ tool_calls: [{ name: "grep", args: { pattern: "x" } }] }] } };
    async function* flujo(): AsyncIterable<unknown> {
      yield [[], "updates", dato];
    }
    for await (const _ of aEventos(flujo(), undefined, (tool) => vistas.push(tool))) void _;
    expect(vistas[0]?.origen).toBe("orquestador");
  });

  it("una tool de un ESPECIALISTA se marca como tal, y es exacto", async () => {
    // Un especialista SIEMPRE lleva un segmento `tools:` delante porque se le invoca con
    // `task`, así que la frontera es la LONGITUD del namespace (`esDelPadre`, medido). No es
    // una heurística: es la misma regla con la que se decide qué tokens se emiten.
    const vistas: Array<{ origen?: string }> = [];
    const dato = { agent: { messages: [{ tool_calls: [{ name: "grep", args: { pattern: "x" } }] }] } };
    async function* flujo(): AsyncIterable<unknown> {
      yield [["tools:abc", "model_request:def"], "updates", dato];
    }
    for await (const _ of aEventos(flujo(), undefined, (tool) => vistas.push(tool))) void _;
    expect(vistas[0]?.origen).toBe("especialista");
  });

  it("acepta las dos formas de chunk, con y sin namespace", async () => {
    const e = await recoger([["messages", [{ text: "a", id: "r1" }, {}]]]);
    expect(e).toEqual([{ tipo: "token", texto: "a", msgId: "r1" }]);
  });

  it("una reemisión del mismo mensaje NO se pinta dos veces", async () => {
    // La forma medida que duplica: el modo `messages` emite los trozos del LLM y
    // además el mensaje entero que el nodo añade al estado.
    const e = await recoger([
      [[], "messages", [{ text: "respuesta", id: "r1" }, {}]],
      [[], "messages", [{ text: "aviso", id: "a1" }, {}]],
      [[], "messages", [{ text: "respuesta", id: "r1" }, {}]],
    ]);
    expect(e.map((x) => (x.tipo === "token" ? x.texto : x.tipo))).toEqual(["respuesta", "aviso"]);
  });

  it("un trozo vacío no produce evento", async () => {
    expect(await recoger([[[], "messages", [{ text: "", id: "r1" }, {}]]])).toEqual([]);
  });

  it("un chunk que no sabe leer se salta sin romper el flujo", async () => {
    const e = await recoger([null, { no: "es un array" }, [[], "messages", [{ text: "ok", id: "r" }, {}]]]);
    expect(e).toEqual([{ tipo: "token", texto: "ok", msgId: "r" }]);
  });

  it("con un pendiente emite un evento pausa con la lista", async () => {
    const pendiente: PendienteDeAprobacion = {
      id: "i1",
      origen: "dev",
      descripcion: "quiere escribir un fichero",
      decisionesPermitidas: ["approve", "reject"],
    };
    const e = await recogerCon([], async () => [pendiente]);
    expect(e).toEqual([{ tipo: "pausa", pendientes: [pendiente] }]);
  });

  it("sin pendientes no emite ninguna pausa", async () => {
    const e = await recogerCon([], async () => []);
    expect(e).toEqual([]);
    expect(e.some((x) => x.tipo === "pausa")).toBe(false);
  });

  it("si leer pendientes falla, avisa grave en vez de propagar", async () => {
    const e = await recogerCon([], async () => {
      throw new Error("no se pudo leer el estado");
    });
    const avisos = e.filter((x): x is Extract<DomainEvent, { tipo: "aviso" }> => x.tipo === "aviso" && x.severidad === "grave");
    expect(avisos).toHaveLength(1);
    expect(typeof avisos[0].texto).toBe("string");
    expect(avisos[0].texto.length).toBeGreaterThan(0);
  });

  it("con dos pendientes emite UNA sola pausa con los dos", async () => {
    const uno: PendienteDeAprobacion = {
      id: "i1",
      origen: "dev",
      descripcion: "quiere escribir un fichero",
      decisionesPermitidas: ["approve", "reject"],
    };
    const dos: PendienteDeAprobacion = {
      id: "i2",
      origen: "research",
      descripcion: "quiere leer el correo",
      decisionesPermitidas: ["approve", "reject", "skip"],
    };
    const e = await recogerCon([], async () => [uno, dos]);
    const pausas = e.filter((x): x is Extract<DomainEvent, { tipo: "pausa" }> => x.tipo === "pausa");
    expect(pausas).toHaveLength(1);
    expect(pausas[0].pendientes).toHaveLength(2);
  });
});

describe("la historia acumulada de un subgrafo no se cuenta dos veces", () => {
  /** Un chunk de `updates` tal como llega: con TODOS los mensajes del subgrafo, no solo el nuevo. */
  const actualizacion = (llamadas: Array<{ id: string; name: string; args: unknown }>) => ({
    agente: { messages: [{ tool_calls: llamadas }] },
  });

  it("una tool solo sale UNA vez aunque su `tool_call` vuelva a llegar", async () => {
    // Medido contra un turno real: 286 eventos `execute` para 10 comandos distintos, con el
    // primero repetido 43 veces. Se veía en la pantalla, en la traza y en el contador de pasos.
    const uno = { id: "call_1", name: "execute", args: { command: "adb devices" } };
    const dos = { id: "call_2", name: "execute", args: { command: "xone-hotswap" } };
    const stream = (async function* () {
      yield [[], "updates", actualizacion([uno])];
      yield [[], "updates", actualizacion([uno, dos])];
      yield [[], "updates", actualizacion([uno, dos])];
    })();

    const eventos = [];
    for await (const e of aEventos(stream)) if (e.tipo === "tool") eventos.push(e);

    expect(eventos).toHaveLength(2);
  });

  it("dos llamadas IGUALES con ids distintos son dos: no se colapsa por contenido", async () => {
    // Repetir un comando es trabajo de verdad —y a veces el síntoma de un bucle—: esconderlo
    // por parecerse al anterior sería maquillar justo lo que hay que ver.
    const stream = (async function* () {
      yield [
        [],
        "updates",
        actualizacion([
          { id: "call_1", name: "execute", args: { command: "adb devices" } },
          { id: "call_2", name: "execute", args: { command: "adb devices" } },
        ]),
      ];
    })();

    const eventos = [];
    for await (const e of aEventos(stream)) if (e.tipo === "tool") eventos.push(e);

    expect(eventos).toHaveLength(2);
  });

  it("sin `id` se emite: la dirección segura es contar de más, no callar una llamada", async () => {
    const stream = (async function* () {
      yield [[], "updates", { agente: { messages: [{ tool_calls: [{ name: "read_file", args: {} }] }] } }];
      yield [[], "updates", { agente: { messages: [{ tool_calls: [{ name: "read_file", args: {} }] }] } }];
    })();

    const eventos = [];
    for await (const e of aEventos(stream)) if (e.tipo === "tool") eventos.push(e);

    expect(eventos).toHaveLength(2);
  });
});

/**
 * **Que una tool no se cuente dos veces porque hubo dos rondas.**
 *
 * `turnoReal.ts` llama a `aEventos` DENTRO del bucle de rondas: una aprobación termina la
 * ronda, se reanuda con un `Command` y el stream vuelve a entregar la historia acumulada. Con
 * el dedupe local, cada ronda empezaba en blanco y recontaba las tools de las anteriores.
 *
 * Medido sobre una sesión real: la traza decía OCHO `edit_file` sobre el mismo fichero, seis
 * de ellas «en la misma respuesta», y en la pantalla se había pedido UN permiso y escrito UNA
 * vez. Las reemisiones caían 15 ms después de cada ronda y con el MISMO id de mensaje. Eso
 * mandó a diagnosticar escrituras concurrentes que la traza se había inventado.
 */
describe("el dedupe entre RONDAS", () => {
  // La forma del stream con `subgraphs: true`: [namespace, modo, dato].
  const chunk = () => [
    [],
    "updates",
    { agent: { messages: [{ id: "msg-1", tool_calls: [{ id: "call-1", name: "edit_file", args: { file_path: "/f.js" } }] }] } },
  ];
  const correr = async (vistas?: Set<string>) => {
    const salida: string[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for await (const e of aEventos((async function* () { yield chunk(); })() as any, undefined, (t) => salida.push(t.nombre), vistas)) void e;
    return salida;
  };

  it("con el conjunto del TURNO, la segunda ronda no la vuelve a contar", async () => {
    const vistas = new Set<string>();
    expect(await correr(vistas)).toEqual(["edit_file"]);
    expect(await correr(vistas)).toEqual([]); // la MISMA tool, reentregada: no se cuenta
    expect(await correr(vistas)).toEqual([]);
  });

  it("sin el conjunto se cuenta otra vez — que es el fallo que esto cierra", async () => {
    expect(await correr()).toEqual(["edit_file"]);
    expect(await correr()).toEqual(["edit_file"]);
  });
});
