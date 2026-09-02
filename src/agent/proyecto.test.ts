import { describe, it, expect } from "vitest";
import { esVistaAplanada, porQueNo, sinVistasAplanadas, backendConSkills, backendDelProyecto, exponerMemoriaDeProyecto } from "./proyecto.js";
import { RUTA_MEMORIA_VIRTUAL } from "./memoriaDeProyecto.js";

const TODAS = new Set(["/p/Clientes.xne", "/p/Clientes.xml", "/p/app.xml", "/p/config.xml"]);

describe("esVistaAplanada", () => {
  it("un .xml con hermano .xne lo es", () => {
    expect(esVistaAplanada("/p/Clientes.xml", TODAS)).toBe(true);
  });

  it("app.xml NO lo es: no tiene hermano y ES fuente", () => {
    expect(esVistaAplanada("/p/app.xml", TODAS)).toBe(false);
  });

  it("un .xml suelto tampoco", () => {
    expect(esVistaAplanada("/p/config.xml", TODAS)).toBe(false);
  });

  it("el .xne nunca lo es: es lo que SÍ se edita", () => {
    expect(esVistaAplanada("/p/Clientes.xne", TODAS)).toBe(false);
  });
});

describe("porQueNo", () => {
  it("dice dónde está la fuente, no solo que no", () => {
    // Un «no encontrado» hace que el modelo pruebe otra ruta o se invente que el
    // cambio no hacía falta. Con la ruta buena, corrige a la primera.
    const m = porQueNo("/p/Clientes.xml");
    expect(m).toContain("/p/Clientes.xne");
    expect(m).toContain("Studio");
  });
});

describe("sinVistasAplanadas", () => {
  function backendFalso() {
    const visto: string[] = [];
    return {
      visto,
      backend: {
        async read(ruta: string) { visto.push(`read:${ruta}`); return { content: "x" }; },
        async write(ruta: string) { visto.push(`write:${ruta}`); return { ok: true }; },
        async edit(ruta: string) { visto.push(`edit:${ruta}`); return { ok: true }; },
        async ls() { return { files: ["/p/Clientes.xne", "/p/Clientes.xml", "/p/app.xml"] }; },
        async grep() { return { matches: [{ file: "/p/Clientes.xml" }, { file: "/p/Clientes.xne" }] }; },
      },
    };
  }

  it("leer una vista aplanada se rechaza, y NO llega al backend", async () => {
    const { backend, visto } = backendFalso();
    const g = sinVistasAplanadas(backend, TODAS);
    await expect(g.read("/p/Clientes.xml")).rejects.toThrow(/Clientes\.xne/);
    expect(visto).toEqual([]);
  });

  it("escribirla y editarla también", async () => {
    const { backend } = backendFalso();
    const g = sinVistasAplanadas(backend, TODAS);
    await expect(g.write("/p/Clientes.xml")).rejects.toThrow(/aplanada/i);
    await expect(g.edit("/p/Clientes.xml")).rejects.toThrow(/aplanada/i);
  });

  it("el .xne pasa sin tocar", async () => {
    const { backend, visto } = backendFalso();
    await sinVistasAplanadas(backend, TODAS).read("/p/Clientes.xne");
    expect(visto).toEqual(["read:/p/Clientes.xne"]);
  });

  it("app.xml pasa: es fuente", async () => {
    const { backend, visto } = backendFalso();
    await sinVistasAplanadas(backend, TODAS).read("/p/app.xml");
    expect(visto).toEqual(["read:/p/app.xml"]);
  });

  it("un listado no las enseña siquiera", async () => {
    const r = (await sinVistasAplanadas(backendFalso().backend, TODAS).ls()) as { files: string[] };
    expect(r.files).toEqual(["/p/Clientes.xne", "/p/app.xml"]);
  });

  it("un grep las filtra por su campo `file`", async () => {
    const r = (await sinVistasAplanadas(backendFalso().backend, TODAS).grep()) as {
      matches: Array<{ file: string }>;
    };
    expect(r.matches.map((m) => m.file)).toEqual(["/p/Clientes.xne"]);
  });
});

describe("backendDelProyecto", () => {
  it("confina: `virtualMode` va en true y NO es configurable", async () => {
    // El agujero medido: con `virtualMode: false` (el default de la librería) el
    // backend leyó una ruta absoluta de FUERA de la raíz.
    const be = backendDelProyecto("/tmp") as unknown as { virtualMode: boolean };
    expect(be.virtualMode).toBe(true);
    expect(backendDelProyecto.length).toBe(1); // solo la raíz: no hay parámetro que lo apague
  });
});

describe("backendConSkills", () => {
  it("monta el catálogo del harness en /skills para carga progresiva", async () => {
    const backend = backendConSkills(backendDelProyecto(process.cwd())) as unknown as {
      routePrefixes: string[];
      read(path: string): Promise<unknown>;
    };
    expect(backend.routePrefixes).toContain("/skills/");
    const skill = await backend.read("/skills/archify/SKILL.md");
    expect(JSON.stringify(skill)).toContain("Archify");
  });
});

describe("exponerMemoriaDeProyecto", () => {
  it("traduce solo la fachada de memoria a su ruta interna", async () => {
    const visto: string[] = [];
    const backend = {
      async read(ruta: string) { visto.push(`read:${ruta}`); return { content: "memoria" }; },
      async write(ruta: string) { visto.push(`write:${ruta}`); return { ok: true }; },
      async edit(ruta: string) { visto.push(`edit:${ruta}`); return { ok: true }; },
    };
    const memoria = exponerMemoriaDeProyecto(backend);
    await memoria.read(RUTA_MEMORIA_VIRTUAL);
    await memoria.write(RUTA_MEMORIA_VIRTUAL);
    await memoria.edit(RUTA_MEMORIA_VIRTUAL);
    expect(visto).toEqual([
      "read:/.xonecode/memoria.md",
      "write:/.xonecode/memoria.md",
      "edit:/.xonecode/memoria.md",
    ]);
  });
});
