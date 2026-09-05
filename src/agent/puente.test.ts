import { describe, it, expect } from "vitest";
import { aEventos, razonamientoDe, textoDe, toolsDe, esDelPadre } from "./puente.js";
import type { DomainEvent, PendienteDeAprobacion } from "../core/events.js";

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
    expect(vistas).toEqual([{ nombre: "grep", detalle: "MTLogin", parametros: { pattern: "MTLogin" } }]);
    expect(e).toEqual([{ tipo: "tool", nombre: "grep", detalle: "MTLogin" }]);
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
