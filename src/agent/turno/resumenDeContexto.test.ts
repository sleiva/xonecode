import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AIMessage, HumanMessage, ToolMessage } from "@langchain/core/messages";
import { FilesystemBackend } from "deepagents";
import { createAgent, FakeToolCallingModel } from "langchain";
import { conservarElEncargo, ETIQUETA_DEL_RESUMEN, resumenConEncargo, resumenDeContexto, SALIDA_DEL_TOPE_DE_TOOLS, topeDeLlamadas, TOPE_DE_LLAMADAS_DEL_ESPECIALISTA, topeDeTools, TOPE_DE_TOOLS_DEL_ESPECIALISTA, TOPE_DE_TOOLS_DEL_ORQUESTADOR, UMBRAL_RESUMEN_TOKENS } from "./resumenDeContexto.js";


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
      // La etiqueta ABRAZA al resumen: `fuera` delante para marcar sus llamadas y `dentro`
      // detrás para que la respuesta de verdad salga sin marca.
      expect(par.map((m) => (m as { name: string }).name)).toEqual([
        "EtiquetaDelResumenMiddleware", "SummarizationMiddleware", "SinEtiquetaDelResumenMiddleware", "ConservarElEncargoMiddleware",
      ]);
    } finally {
      rmSync(raiz, { recursive: true, force: true });
    }
  });
});

describe("el tope de llamadas del especialista", () => {
  it("acaba el encargo en vez de TUMBARLO", async () => {
    // Con `error` la delegación entera se cae y el orquestador se queda sin nada, que es como
    // empieza el bucle de reintentos que costó 1,5M. Tiene que terminar devolviendo algo.
    //
    // Se comprueba la CONDUCTA y no el nombre del middleware: antes esto miraba que fuera el
    // de la librería, y esa comprobación pasaba en verde el día que lo que la librería DEJA
    // como respuesta era el defecto. Lo que hay que atar es que no lance y que conteste.
    const agente = createAgent({
      model: new FakeToolCallingModel({ responses: [] } as never),
      tools: [],
      middleware: [topeDeLlamadas(0)],
    } as never) as { invoke: (x: unknown) => Promise<{ messages: unknown[] }> };
    const r = await agente.invoke({ messages: [new HumanMessage("hola")] });
    expect(r.messages.length).toBeGreaterThan(0);
  });

  it("el tope sale de una MEDIDA, no de una intuición", () => {
    // 3-7 llamadas una pregunta de estructura, 10 la cara terminando bien, 32 y subiendo la
    // descarrilada. El tope va por encima de lo que funciona y por debajo de lo que no.
    expect(TOPE_DE_LLAMADAS_DEL_ESPECIALISTA).toBeGreaterThan(10);
    expect(TOPE_DE_LLAMADAS_DEL_ESPECIALISTA).toBeLessThan(32);
  });

  /**
   * **El que ENTREGA tiene que llegar a entregar, y por eso este test existe.**
   *
   * Medido el 21-09-2026 sobre MyAllXOne: con el tope en 15, `analyst-xone` se delegó dos
   * veces, agotó las quince las dos y **no escribió ni un fichero** — no por no entender el
   * encargo (abrió `xone-spec-builder` y `xone-plan-builder` en sus llamadas 2 y 3), sino
   * porque una pasada de reconocimiento sobre un proyecto real cuesta ya esas quince.
   *
   * Un tope calibrado con PREGUNTAS aplicado a quien deja un entregable corta el trabajo
   * justo antes de producirlo, y en SILENCIO: el síntoma es un plan que no existe, no un
   * error que leer. Por eso la frontera se ata por abajo además de por arriba — tiene que
   * caber el reconocimiento medido MÁS los ficheros que el entregable son.
   *
   * **Lo que este test NO afirma, porque se midió y es falso**: que con el tope más alto
   * aparezca el plan. Se probó con 30/35 la misma tarde y el analista gastó las treinta en
   * reconocimiento y siguió sin escribir nada. Esto ata un mínimo necesario, no suficiente;
   * lo que falta está en `PLAN_DE_DESARROLLO`, donde escribir es el último paso.
   */
  it("cabe un reconocimiento entero MÁS escribir el entregable", () => {
    // Lo que se contó en esa pasada, y por eso son tres sumandos y no un número redondo:
    const RECONOCIMIENTO_MEDIDO = 15; // lo que gastó orientándose, y no había terminado
    const SKILLS_QUE_ABRE = 2; // xone-spec-builder y xone-plan-builder, sus llamadas 2 y 3
    const FICHEROS_DEL_PLAN = 3; // PLAN.md, CONTEXT.md, TASKS.md
    const UNA_ENTREGA = RECONOCIMIENTO_MEDIDO + SKILLS_QUE_ABRE + FICHEROS_DEL_PLAN;
    // Estrictamente MAYOR: con el tope justo en la cuenta, la última escritura es la que cae.
    expect(TOPE_DE_LLAMADAS_DEL_ESPECIALISTA).toBeGreaterThan(UNA_ENTREGA);
    expect(TOPE_DE_TOOLS_DEL_ESPECIALISTA).toBeGreaterThan(UNA_ENTREGA);
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

  it("es un GUARDA y no una economía: por encima de lo que gasta un encargo que escribe", () => {
    // Medido el 23-09-2026 en MyAllXOne (una calculadora a partir de una maqueta): con 35, el
    // developer gastó 39, 39 y 49 tools en tres encargos y NINGUNO llegó a escribir, porque
    // con `continue` el tope bloquea también `write_file` y `edit_file`. Se pagaba la
    // exploración entera y la entrega no salía. Ahora el número se sitúa por encima de lo
    // observado, como el del orquestador: solo para un encargo desbocado.
    const MEDIDO_EN_UN_ENCARGO_QUE_NO_LLEGO_A_ESCRIBIR = 49;
    expect(TOPE_DE_TOOLS_DEL_ESPECIALISTA).toBeGreaterThan(MEDIDO_EN_UN_ENCARGO_QUE_NO_LLEGO_A_ESCRIBIR);
  });
});


/**
 * Lo que un especialista DEVUELVE cuando se le agota el presupuesto.
 *
 * Contra la librería DE VERDAD y sin red: `FakeToolCallingModel` y un tope de cero o uno. Es
 * lo único que ata que el corte siga ocurriendo donde creemos y dejando lo que creemos.
 */
describe("topeDeLlamadas, contra la librería real", () => {
  const correr = async (middleware: unknown[], mensaje = "hola") => {
    const agente = createAgent({
      model: new FakeToolCallingModel({ responses: [] } as never),
      tools: [],
      middleware,
    } as never) as { invoke: (x: unknown) => Promise<{ messages: Array<{ content?: unknown; text?: string }> }> };
    return agente.invoke({ messages: [new HumanMessage(mensaje)] });
  };
  const ultimo = (r: { messages: Array<{ content?: unknown; text?: string }> }): string => {
    const m = r.messages[r.messages.length - 1];
    return typeof m?.content === "string" ? m.content : (m?.text ?? "");
  };

  it("al agotarse deja NUESTRO mensaje, no la jerga de la librería", async () => {
    // `extractLastMessage` de deepagents devuelve SOLO el último mensaje, así que esto es
    // literalmente lo que recibe quien delegó. Antes era «Model call limits exceeded: …».
    const r = await correr([topeDeLlamadas(0)]);
    const texto = ultimo(r);
    expect(texto).not.toContain("Model call limits exceeded");
    expect(texto).toContain("[harness]");
    expect(texto).toContain("HANDOFF DE ANÁLISIS");
  });

  it("dice el tope que se agotó de verdad, no una cifra fija", async () => {
    expect(ultimo(await correr([topeDeLlamadas(0)]))).toContain("0 llamadas");
  });

  it("no corta un turno que cabe en su presupuesto", async () => {
    // Con margen no hay nada que decir, y apilar un aviso donde no lo hay sería inventarse
    // que un especialista se quedó a medias.
    expect(ultimo(await correr([topeDeLlamadas(50)]))).not.toContain("[harness]");
  });

  it("AVISA de que cortó, que es lo que la traza no sabía", async () => {
    // Sin esto el único sitio donde consta el corte es el mensaje que recibe quien delegó, y
    // la traza sigue diciendo «15 llamadas» como si el agente hubiera terminado. Leer eso mal
    // costó una sesión entera de diagnóstico equivocado.
    const avisos: number[] = [];
    await correr([topeDeLlamadas(0, () => avisos.push(1))]);
    expect(avisos).toHaveLength(1);
  });

  it("no avisa cuando NO cortó", async () => {
    const avisos: number[] = [];
    await correr([topeDeLlamadas(50, () => avisos.push(1))]);
    expect(avisos).toHaveLength(0);
  });

  it("devuelve el trabajo PARCIAL que el corte iba a tirar", async () => {
    // El defecto entero: quince llamadas de trabajo perdidas porque la respuesta era la
    // frase del corte. Aquí lo único que hay en la conversación es la petición, y aun así
    // tiene que volver: si no vuelve lo poco, tampoco volvería lo mucho.
    const texto = ultimo(await correr([topeDeLlamadas(0)], "el titulo sale cortado"));
    expect(texto).toContain("el titulo sale cortado");
    expect(texto).toContain("PARCIAL");
  });
});


describe("el tope de tools del ORQUESTADOR", () => {
  it("está POR ENCIMA de lo medido: es un guarda, no una economía", () => {
    // Medido sobre turnos reales: 41 tools en un encargo visual normal (18 lecturas, 15 grep,
    // 5 de navegación, 3 delegaciones), y de 14 a 49 llamadas al modelo según el turno. Si este
    // número bajara hasta morder en un turno normal dejaría de ser un guarda y empezaría a
    // recortar el trabajo — que es justo lo que no queremos, porque esas lecturas SON el trabajo.
    expect(TOPE_DE_TOOLS_DEL_ORQUESTADOR).toBeGreaterThan(41);
  });

  it("no le corta la respuesta: sale por `continue`, no por `end`", async () => {
    // El argumento contra caparle las LLAMADAS sigue en pie —«el que contesta al usuario no
    // puede quedarse a medias»— y este tope lo respeta: le quita la pala, no la palabra.
    expect(SALIDA_DEL_TOPE_DE_TOOLS).toBe("continue");
    const agente = createAgent({
      model: new FakeToolCallingModel({ responses: [] } as never),
      tools: [],
      middleware: [topeDeTools(TOPE_DE_TOOLS_DEL_ORQUESTADOR)],
    } as never) as { invoke: (x: unknown) => Promise<{ messages: unknown[] }> };
    const r = await agente.invoke({ messages: [new HumanMessage("hola")] });
    expect(r.messages.length).toBeGreaterThan(0);
  });
});


/**
 * La ETIQUETA del resumen, contra la librería DE VERDAD y su stream `messages`.
 *
 * Los dos sentidos, porque los dos fallan en silencio: sin la etiqueta el resumen se pinta en
 * el chat como si fuera la respuesta (medido en MyAllXOne, un `## Summary` en inglés en el
 * `.jsonl`); y si la etiqueta se colara en la llamada real, la RESPUESTA entera se iría al
 * plegable y el chat se quedaría mudo.
 */
describe("la etiqueta del resumen, en el stream de la librería", () => {
  it("marca los chunks del RESUMEN y deja sin marca los de la RESPUESTA, y el prompt va en castellano", async () => {
    const raiz = mkdtempSync(join(tmpdir(), "xc-etiqueta-"));
    try {
      const { FakeListChatModel } = await import("@langchain/core/utils/testing");
      const prompts: string[] = [];
      class ConTools extends FakeListChatModel {
        bindTools() { return this; }
        override async invoke(entrada: unknown, config?: unknown) {
          prompts.push(JSON.stringify(entrada));
          return super.invoke(entrada as never, config as never);
        }
      }
      const modelo = new ConTools({ responses: ["## Resumen\n- hecho", "RESPUESTA-FINAL"] });
      const agente = createAgent({
        model: modelo as never,
        tools: [],
        middleware: resumenConEncargo(new FilesystemBackend({ rootDir: raiz, virtualMode: true }) as never) as never,
      });
      const largo = "x ".repeat(UMBRAL_RESUMEN_TOKENS * 3);
      const stream = await agente.stream(
        { messages: [new HumanMessage("encargo"), new AIMessage(largo), new HumanMessage("sigue")] } as never,
        { streamMode: ["messages"], subgraphs: true } as never
      );
      let delResumen = "";
      let deLaRespuesta = "";
      for await (const trozo of stream as AsyncIterable<unknown[]>) {
        const [, , dato] = trozo as [string[], string, [{ content: unknown }, { tags?: string[] }]];
        const [msg, meta] = dato;
        if ((meta.tags ?? []).includes(ETIQUETA_DEL_RESUMEN)) delResumen += String(msg.content);
        else deLaRespuesta += String(msg.content);
      }
      expect(delResumen).toBe("## Resumen\n- hecho");
      expect(deLaRespuesta).toBe("RESPUESTA-FINAL");
      expect(prompts.join("")).toContain("EN CASTELLANO");
    } finally {
      rmSync(raiz, { recursive: true, force: true });
    }
  }, 30_000);
});
