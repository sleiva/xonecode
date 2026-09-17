import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AIMessage, HumanMessage, ToolMessage } from "@langchain/core/messages";
import { FilesystemBackend } from "deepagents";
import { conservarElEncargo, resumenConEncargo, resumenDeContexto, SALIDA_DEL_TOPE_DE_TOOLS, topeDeLlamadas, TOPE_DE_LLAMADAS_DEL_ESPECIALISTA, TOPE_DE_TOOLS_DEL_ESPECIALISTA, UMBRAL_RESUMEN_TOKENS } from "./resumenDeContexto.js";

/**
 * Qué le pasa al ENCARGO cuando el especialista se pasa de contexto.
 *
 * Nace de un turno real del usuario: el orquestador delegó una pregunta, el especialista dio
 * 57 pasos y volvió con «un resumen de otra cosa» en lugar de la respuesta. La hipótesis del
 * propio modelo —«parece que trae una sesión antigua pegada»— era una hipótesis; esto mide lo
 * que de verdad ocurre, que no es ninguna sesión pegada sino nuestro propio resumen.
 */

/** Un modelo que solo sirve para resumir, y que APUNTA lo que se le pide. */
function modeloQueResume(): { modelo: unknown; visto: () => unknown[] } {
  const visto: unknown[] = [];
  const modelo = {
    invoke: async (mensajes: unknown) => {
      visto.push(mensajes);
      return new AIMessage("RESUMEN: el agente estuvo leyendo ficheros del proyecto.");
    },
    // El middleware pregunta por el perfil del modelo; sin él se queda con lo que le dimos.
    getName: () => "falso",
  };
  return { modelo, visto: () => visto };
}

/** Una conversación larga: el encargo, y detrás mucho trabajo de tools. */
function conversacionLarga(encargo: string, caracteres: number): unknown[] {
  const relleno = "x".repeat(4_000);
  const mensajes: unknown[] = [new HumanMessage(encargo)];
  for (let i = 0; i < Math.ceil(caracteres / 4_000); i++) {
    mensajes.push(new AIMessage({ content: "", tool_calls: [{ name: "read_file", args: { file_path: `/f${i}.xne` }, id: `c${i}` }] }));
    mensajes.push(new ToolMessage({ content: `${i} ${relleno}`, tool_call_id: `c${i}` }));
  }
  return mensajes;
}

describe("el resumen de contexto y el encargo del especialista", () => {
  it("por debajo del umbral no toca nada: el encargo llega tal cual", async () => {
    const raiz = mkdtempSync(join(tmpdir(), "xc-resumen-"));
    try {
      const mw = resumenDeContexto(new FilesystemBackend({ rootDir: raiz, virtualMode: true }) as never) as unknown as {
        wrapModelCall: (peticion: unknown, handler: (p: unknown) => unknown) => Promise<unknown>;
      };
      const { modelo } = modeloQueResume();
      let recibidos: unknown[] = [];
      await mw.wrapModelCall(
        { messages: [new HumanMessage("ENCARGO-UNICO-1: di cuál es el entrypoint")], state: {}, model: modelo, tools: [] },
        (p: unknown) => {
          recibidos = (p as { messages: unknown[] }).messages;
          return new AIMessage("ok");
        }
      );
      expect(JSON.stringify(recibidos)).toContain("ENCARGO-UNICO-1");
    } finally {
      rmSync(raiz, { recursive: true, force: true });
    }
  });

  it("al cruzar el umbral, el ENCARGO se va dentro del resumen y ya no llega al modelo", async () => {
    const raiz = mkdtempSync(join(tmpdir(), "xc-resumen-"));
    try {
      const mw = resumenDeContexto(new FilesystemBackend({ rootDir: raiz, virtualMode: true }) as never) as unknown as {
        wrapModelCall: (peticion: unknown, handler: (p: unknown) => unknown) => Promise<unknown>;
      };
      const { modelo } = modeloQueResume();
      let recibidos: unknown[] = [];
      // Holgado por encima del umbral: cuatro caracteres por token es la estimación habitual.
      const mensajes = conversacionLarga("ENCARGO-UNICO-2: di cuál es el entrypoint", UMBRAL_RESUMEN_TOKENS * 6);
      await mw.wrapModelCall({ messages: mensajes, state: {}, model: modelo, tools: [] }, (p: unknown) => {
        recibidos = (p as { messages: unknown[] }).messages;
        return new AIMessage("ok");
      });

      const texto = JSON.stringify(recibidos);
      expect(recibidos.length).toBeLessThan(mensajes.length);
      expect(texto).toContain("RESUMEN:");
      // **Lo que se viene a medir.** Si esto se pone en verde algún día, será porque la
      // librería ha empezado a conservar el encargo, y entonces este test hay que leerlo, no
      // borrarlo: el defecto que documenta habrá desaparecido.
      expect(texto).not.toContain("ENCARGO-UNICO-2");
    } finally {
      rmSync(raiz, { recursive: true, force: true });
    }
  });
});

describe("conservar el encargo", () => {
  const mw = () =>
    conservarElEncargo() as unknown as { wrapModelCall: (p: unknown, h: (p: unknown) => unknown) => unknown };

  const correr = async (peticion: unknown): Promise<unknown[]> => {
    let recibidos: unknown[] = [];
    await mw().wrapModelCall(peticion, (p: unknown) => {
      recibidos = (p as { messages: unknown[] }).messages;
      return new AIMessage("ok");
    });
    return recibidos;
  };

  it("lo DEVUELVE cuando el resumen se lo ha llevado", async () => {
    const encargo = new HumanMessage("ENCARGO: di cuál es el entrypoint");
    const trasElResumen = [new HumanMessage("RESUMEN: estuvo leyendo ficheros"), new AIMessage("sigo")];
    const recibidos = await correr({ messages: trasElResumen, state: { messages: [encargo, new AIMessage("…")] } });
    expect(JSON.stringify(recibidos)).toContain("ENCARGO: di cuál es el entrypoint");
    // Delante: es lo primero que el modelo tiene que leer, y el resumen viene detrás.
    expect(recibidos[0]).toBe(encargo);
  });

  it("devuelve el encargo VIGENTE, no el primero de la conversación", async () => {
    // En el orquestador la conversación es multiturno: el primer humano es la pregunta de hace
    // tres turnos. Devolver ESA sería reintroducir a mano el fallo que esto arregla.
    const vieja = new HumanMessage("PREGUNTA VIEJA: cuál es la ventana de inicio");
    const vigente = new HumanMessage("PREGUNTA DE AHORA: sirve XOne para un CRM");
    const recibidos = await correr({
      messages: [new HumanMessage("RESUMEN: estuvo leyendo ficheros")],
      state: { messages: [vieja, new AIMessage("…"), vigente, new AIMessage("…")] },
    });
    expect(recibidos[0]).toBe(vigente);
    expect(JSON.stringify(recibidos)).not.toContain("PREGUNTA VIEJA");
  });

  it("no lo duplica cuando todavía está, ni por identidad ni por CONTENIDO", async () => {
    const encargo = new HumanMessage("ENCARGO: di cuál es el entrypoint");
    const mismoTexto = new HumanMessage("ENCARGO: di cuál es el entrypoint");
    expect(await correr({ messages: [encargo], state: { messages: [encargo] } })).toHaveLength(1);
    // La lista efectiva se RECONSTRUYE, así que el mensaje puede ser otro objeto igual: sin la
    // comparación por contenido, el encargo se duplicaría en cada llamada.
    expect(await correr({ messages: [mismoTexto], state: { messages: [encargo] } })).toHaveLength(1);
  });

  it("sin historial o sin encargo humano no inventa nada", async () => {
    expect(await correr({ messages: [new AIMessage("a")], state: {} })).toHaveLength(1);
    expect(await correr({ messages: [new AIMessage("a")], state: { messages: [new AIMessage("b")] } })).toHaveLength(1);
  });
});

describe("el par", () => {
  it("van juntos y EN ESE ORDEN: el que devuelve el encargo tiene que ver lo ya resumido", () => {
    const raiz = mkdtempSync(join(tmpdir(), "xc-par-"));
    try {
      const par = resumenConEncargo(new FilesystemBackend({ rootDir: raiz, virtualMode: true }) as never);
      expect(par.map((m) => (m as { name: string }).name)).toEqual(["SummarizationMiddleware", "ConservarElEncargoMiddleware"]);
    } finally {
      rmSync(raiz, { recursive: true, force: true });
    }
  });
});

describe("el tope de llamadas del especialista", () => {
  it("acaba el encargo en vez de TUMBARLO", () => {
    // Con `error` la delegación entera se cae y el orquestador se queda sin nada, que es como
    // empieza el bucle de reintentos que costó 1,5M. Con `end` devuelve lo que tenga.
    const mw = topeDeLlamadas() as unknown as { name: string };
    expect(mw.name).toContain("ModelCallLimit");
  });

  it("el tope sale de una MEDIDA, no de una intuición", () => {
    // 3-7 llamadas una pregunta de estructura, 10 la cara terminando bien, 32 y subiendo la
    // descarrilada. El tope va por encima de lo que funciona y por debajo de lo que no.
    expect(TOPE_DE_LLAMADAS_DEL_ESPECIALISTA).toBeGreaterThan(10);
    expect(TOPE_DE_LLAMADAS_DEL_ESPECIALISTA).toBeLessThan(32);
  });
});

describe("el tope de TOOLS", () => {
  it("sale con `continue`, porque `end` no admite varias tools a la vez", async () => {
    /**
     * Las dos reglas vivían en el repo sin hablarse: le pedimos al especialista que agrupe las
     * lecturas independientes en un mismo mensaje, y le poníamos un tope que al saltar con
     * varias en vuelo lanza «Cannot end execution with other tool calls pending». Medido en el
     * primer turno con el tope puesto. Este test las ata: si alguien vuelve a poner `end`, o
     * quita la petición de agrupar, esto se pone rojo.
     */
    expect(SALIDA_DEL_TOPE_DE_TOOLS).toBe("continue");
    const { promptDeAgente } = await import("../../core/agentes.js");
    const prompt = promptDeAgente(
      { nombre: "x", descripcion: "d", motor: "modelo", soloLectura: true, instrucciones: "", skills: [], origen: "global" },
      { suyas: [], faltan: [] }
    );
    expect(prompt).toContain("en el MISMO mensaje");
  });

  it("veinte es generoso contra su propia regla de tres referencias", () => {
    expect(TOPE_DE_TOOLS_DEL_ESPECIALISTA).toBeGreaterThan(10);
    // Y por debajo de los 43 que acumuló el turno que lo motivó.
    expect(TOPE_DE_TOOLS_DEL_ESPECIALISTA).toBeLessThan(43);
  });
});
