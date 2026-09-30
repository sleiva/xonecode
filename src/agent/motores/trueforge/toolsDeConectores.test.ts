import { describe, expect, it } from "vitest";
import { ConectoresEnMemoria, type ConectoresPort } from "../../../core/ports.js";
import type { ToolConEsquema } from "../../../core/conectores.js";
import { crearConectoresDeSesion, tarjetaDeRemota } from "./toolsDeConectores.js";

const E = { type: "object" };
const backend = { write: () => ({}) };
const sinPausa = async () => {};
type Fuente = {
  listTools(): Promise<{ result: { tools: { name: string; description: string }[] } }>;
  callTool(p: { name: string; arguments?: Record<string, unknown> }): Promise<{ result: { content: { text?: string }[]; isError?: boolean } }>;
};
const fuente = (c: ReturnType<typeof crearConectoresDeSesion>, clase: "lectura" | "escritura") => c.fuente(clase, backend) as unknown as Fuente;
const texto = (r: { result: { content: { text?: string }[] } }) => r.result.content[0]?.text ?? "";

describe("las tools de los conectores en TrueForge", () => {
  const TOOLS: ToolConEsquema[] = [
    { nombre: "list_projects", soloLectura: true, esquema: E },
    { nombre: "generate", soloLectura: false, esquema: E },
    { nombre: "delete_project", soloLectura: false, esquema: E },
  ];

  it("reparte por clase, con prefijo, y deja fuera lo que el catálogo excluye", async () => {
    const c = crearConectoresDeSesion(new ConectoresEnMemoria({ stitch: { nombre: "Stitch", tools: TOOLS } }), [
      { id: "stitch", nombre: "Stitch", fueraDelAgente: ["delete_project"], camposFueraDelResultado: {} },
    ]);
    expect((await fuente(c, "lectura").listTools()).result.tools.map((t) => t.name)).toEqual(["stitch__list_projects"]);
    const escritura = (await fuente(c, "escritura").listTools()).result.tools;
    expect(escritura.map((t) => t.name)).toEqual(["stitch__generate"]);
    expect(escritura[0]?.description).toContain("espera a que una persona la apruebe");
    expect(c.remotaDe("stitch__generate")?.tool.nombre).toBe("generate");
    expect(c.remotaDe("stitch__list_projects")).toBeUndefined();
  });

  it("pregunta a la red UNA vez por sesión, y un conector que falla se queda sin tools sin tumbar nada", async () => {
    let veces = 0;
    const puerto: ConectoresPort = {
      delProyecto: () => [],
      tools: async (id) => { veces += 1; if (id === "roto") throw new Error("no responde"); return TOOLS; },
      llamar: async () => "",
    };
    const c = crearConectoresDeSesion(puerto, [
      { id: "stitch", nombre: "Stitch", fueraDelAgente: [], camposFueraDelResultado: {} },
      { id: "roto", nombre: "Roto", fueraDelAgente: [], camposFueraDelResultado: {} },
    ]);
    await fuente(c, "lectura").listTools();
    await fuente(c, "escritura").listTools();
    expect(veces).toBe(2);
  });

  it("una de LECTURA que falla se repite UNA vez; una que escribe NO (gastaría otra generación)", async () => {
    let lecturas = 0;
    let escrituras = 0;
    const puerto: ConectoresPort = {
      delProyecto: () => [],
      tools: async () => TOOLS,
      llamar: async (_id, nombre) => {
        if (nombre === "list_projects") { lecturas += 1; if (lecturas === 1) throw new Error("The service is currently unavailable."); return "ok"; }
        escrituras += 1;
        throw new Error("The service is currently unavailable.");
      },
    };
    const c = crearConectoresDeSesion(puerto, [{ id: "stitch", nombre: "Stitch", fueraDelAgente: [], camposFueraDelResultado: {} }], sinPausa);
    const r = await fuente(c, "lectura").callTool({ name: "stitch__list_projects" });
    expect(texto(r)).toBe("ok");
    expect(lecturas).toBe(2);
    const w = await fuente(c, "escritura").callTool({ name: "stitch__generate" });
    expect(w.result.isError).toBe(true);
    expect(texto(w)).toBe("Stitch: The service is currently unavailable.");
    expect(escrituras).toBe(1);
  });

  it("sin credencial no se repite: el fallo es de configuración", async () => {
    let veces = 0;
    const puerto: ConectoresPort = { delProyecto: () => [], tools: async () => TOOLS, llamar: async () => { veces += 1; throw new Error("falta autorizar"); } };
    const c = crearConectoresDeSesion(puerto, [{ id: "stitch", nombre: "Stitch", fueraDelAgente: [], camposFueraDelResultado: {} }], sinPausa);
    await fuente(c, "lectura").callTool({ name: "stitch__list_projects" });
    expect(veces).toBe(1);
  });

  it("una fuente no llama a una tool de la OTRA clase", async () => {
    const conectores = new ConectoresEnMemoria({ stitch: { nombre: "Stitch", tools: TOOLS } });
    const c = crearConectoresDeSesion(conectores, [{ id: "stitch", nombre: "Stitch", fueraDelAgente: [], camposFueraDelResultado: {} }]);
    const r = await fuente(c, "lectura").callTool({ name: "stitch__generate" });
    expect(r.result.isError).toBe(true);
    expect(conectores.llamadas).toEqual([]);
  });

  it("el resultado llega sin los campos que el catálogo recorta, y lo DICE", async () => {
    const conectores = new ConectoresEnMemoria({
      stitch: { nombre: "Stitch", tools: TOOLS, respuesta: JSON.stringify({ projects: [{ title: "Calc", designTheme: { designMd: "x".repeat(900) } }] }) },
    });
    const c = crearConectoresDeSesion(conectores, [{ id: "stitch", nombre: "Stitch", fueraDelAgente: [], camposFueraDelResultado: { list_projects: ["designTheme"] } }]);
    const r = texto(await fuente(c, "lectura").callTool({ name: "stitch__list_projects" }));
    expect(r).toContain('"title":"Calc"');
    expect(r).not.toContain("xxxx");
    expect(r).toContain("sin designTheme");
  });

  it("la tarjeta dice conector y tool, y enseña los argumentos ENTEROS como líneas añadidas", () => {
    const t = tarjetaDeRemota({ nombre: "stitch__generate", conector: { id: "stitch", nombre: "Stitch" }, tool: TOOLS[1]! }, { prompt: "una calculadora", deviceType: "MOBILE" });
    expect(t.descripcion).toBe("quiere usar Stitch: generate (escribe en tu cuenta de Stitch)");
    expect(t.lineas.every((l) => l.tipo === "anadido")).toBe(true);
    expect(t.lineas.map((l) => l.texto).join("\n")).toContain('"prompt": "una calculadora"');
  });
});
