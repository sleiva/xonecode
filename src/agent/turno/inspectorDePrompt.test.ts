import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
import {
  inspeccionarLlamada,
  inspectorDePrompt,
  rutaTrazaDePrompt,
  textoDeMensaje,
  tipoDeMensaje,
  VARIABLE_TRAZA_PROMPT,
} from "./inspectorDePrompt.js";

const peticion = {
  messages: [
    new HumanMessage("el encargo"),
    new AIMessage({ content: "", tool_calls: [{ name: "read_file", args: { file_path: "/a.xne" }, id: "c1" }] }),
    new ToolMessage({ content: "1  <coll name=\"A\">", tool_call_id: "c1" }),
  ],
  systemMessage: new SystemMessage("REGLAS DE XONE…"),
  tools: [
    { name: "read_file", description: "Lee un fichero.", schema: { type: "object" } },
    { name: "grep", description: "Busca texto literal.", schema: { type: "object" } },
  ],
};

describe("inspeccionar una llamada", () => {
  it("por omisión apunta la FORMA y ni una letra del contenido", () => {
    const foto = inspeccionarLlamada("analyst-xone", peticion, false);
    const texto = JSON.stringify(foto);
    expect(texto).not.toContain("el encargo");
    expect(texto).not.toContain("coll name");
    expect(texto).not.toContain("REGLAS DE XONE");
    expect(foto.mensajes.map((m) => m.tipo)).toEqual(["human", "ai", "tool"]);
    expect(foto.mensajes[0].caracteres).toBe("el encargo".length);
    expect(foto.tools).toBe(2);
  });

  it("cuenta el SISTEMA dentro del total, que es donde se va el contexto", () => {
    // El prompt de sistema y los esquemas se reenvían en cada llamada: sin sumarlo, una
    // conversación corta parecería barata cuando su cabecera es justo lo que cuesta.
    const foto = inspeccionarLlamada("orquestador", peticion, false);
    expect(foto.sistema.caracteres).toBe("REGLAS DE XONE…".length);
    expect(foto.caracteresTotales).toBe(
      foto.sistema.caracteres + foto.esquemas.caracteres + foto.mensajes.reduce((a, m) => a + m.caracteres, 0)
    );
    // Los esquemas también se reenvían en cada llamada, y eran la mitad que faltaba: el
    // inspector decía 2k tokens en una llamada que pagó 3.900.
    expect(foto.esquemas.caracteres).toBeGreaterThan(0);
    // Ordenados por tamaño: la primera es la que hay que mirar para recortar.
    expect(foto.esquemas.porTool[0].caracteres).toBeGreaterThanOrEqual(foto.esquemas.porTool[1].caracteres);
  });

  it("dice cuántas tool calls pide un mensaje, y no lo pone cuando no pide ninguna", () => {
    const foto = inspeccionarLlamada("x", peticion, false);
    expect(foto.mensajes[1].toolCalls).toBe(1);
    expect(foto.mensajes[0].toolCalls).toBeUndefined();
  });

  it("con texto SÍ lleva el contenido: es lo que se viene a ver", () => {
    const foto = inspeccionarLlamada("x", peticion, true);
    expect(foto.mensajes[0].texto).toBe("el encargo");
    expect(foto.sistema.texto).toContain("REGLAS DE XONE");
  });

  it("no revienta con una petición rara ni inventa campos", () => {
    const foto = inspeccionarLlamada("x", {}, false);
    expect(foto).toMatchObject({ mensajes: [], tools: 0, caracteresTotales: 0 });
    expect(foto.esquemas).toEqual({ caracteres: 0, porTool: [] });
  });
});

describe("el tipo y el texto de un mensaje", () => {
  it("lee el tipo venga como venga", () => {
    expect(tipoDeMensaje(new HumanMessage("a"))).toBe("human");
    expect(tipoDeMensaje({ role: "user" })).toBe("user");
    expect(tipoDeMensaje({ tool_call_id: "c1" })).toBe("tool");
    expect(tipoDeMensaje(null)).toBe("?");
  });

  it("concatena los bloques de texto y no se inventa nada con lo demás", () => {
    expect(textoDeMensaje({ content: [{ type: "text", text: "ho" }, { type: "text", text: "la" }] })).toBe("hola");
    expect(textoDeMensaje({ content: 7 })).toBe("");
  });
});

describe("el middleware", () => {
  it("SOLO se monta si se pide, y con el valor exacto", () => {
    const raiz = mkdtempSync(join(tmpdir(), "xc-insp-"));
    try {
      expect(inspectorDePrompt(raiz, "x", {})).toBeUndefined();
      expect(inspectorDePrompt(raiz, "x", { [VARIABLE_TRAZA_PROMPT]: "si" })).toBeUndefined();
      expect(inspectorDePrompt(raiz, "x", { [VARIABLE_TRAZA_PROMPT]: "1" })).toBeDefined();
      expect(inspectorDePrompt(raiz, "x", { [VARIABLE_TRAZA_PROMPT]: "todo" })).toBeDefined();
    } finally {
      rmSync(raiz, { recursive: true, force: true });
    }
  });

  it("escribe una línea por llamada y deja pasar la petición INTACTA", async () => {
    const raiz = mkdtempSync(join(tmpdir(), "xc-insp-"));
    try {
      const mw = inspectorDePrompt(raiz, "analyst-xone", { [VARIABLE_TRAZA_PROMPT]: "1" }) as unknown as {
        wrapModelCall: (p: unknown, h: (p: unknown) => unknown) => unknown;
      };
      let vista: unknown;
      await mw.wrapModelCall(peticion, (p: unknown) => {
        vista = p;
        return new AIMessage("ok");
      });
      // Intacta e IDÉNTICA: un inspector que copie la petición cambiaría lo que mide.
      expect(vista).toBe(peticion);

      const linea = JSON.parse(readFileSync(rutaTrazaDePrompt(raiz), "utf8").trim()) as Record<string, unknown>;
      expect(linea).toMatchObject({ origen: "analyst-xone", tools: 2 });
      expect(JSON.stringify(linea)).not.toContain("el encargo");
    } finally {
      rmSync(raiz, { recursive: true, force: true });
    }
  });

  it("un disco que falla no tumba la llamada", async () => {
    const mw = inspectorDePrompt("/no/existe/y/no/se/puede/crear", "x", { [VARIABLE_TRAZA_PROMPT]: "1" }) as unknown as {
      wrapModelCall: (p: unknown, h: (p: unknown) => unknown) => unknown;
    };
    // El middleware devuelve lo que devuelva el handler, tal cual: si este no es una promesa,
    // tampoco lo es la vuelta. Se comprueba el VALOR, que es lo que le llega al agente.
    expect(await mw.wrapModelCall(peticion, () => new AIMessage("ok"))).toBeDefined();
  });
});
