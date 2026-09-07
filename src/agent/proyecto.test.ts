import { describe, it, expect } from "vitest";
import { esVistaAplanada, porQueNo, sinArtefactosEnElProyecto, sinVistasAplanadas, backendConArtefactos, backendConSkills, backendDeAgente, backendDelProyecto, exponerMemoriaDeProyecto } from "./proyecto.js";
import { mkdtempSync, existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFilesystemMiddleware } from "deepagents";
import type { Artefacto } from "../core/artefactos.js";
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

  /**
   * El rechazo se DEVUELVE como `{error}`, no se lanza — y no es un detalle de estilo.
   *
   * Esto lanzaba. Leído en deepagents 1.13.2, los cuatro tools de fichero hacen
   * `const result = await backend.write(...); if (result.error) return result.error`: un
   * error DEVUELTO vuelve al modelo como resultado de la tool y puede reintentar, mientras
   * que una excepción se sale de la tool y se lleva el turno por delante. Medido en vivo el
   * 2026-09-07 con la guarda hermana: el mensaje salía impecable en el chat, el fichero no
   * se escribía, y el agente NO reintentaba porque el turno ya había muerto.
   */
  it("leer una vista aplanada se rechaza con `{error}`, y NO llega al backend", async () => {
    const { backend, visto } = backendFalso();
    const g = sinVistasAplanadas(backend, TODAS);
    expect(await g.read("/p/Clientes.xml")).toEqual({ error: expect.stringContaining("Clientes.xne") });
    expect(visto).toEqual([]);
  });

  it("escribirla y editarla también", async () => {
    const { backend, visto } = backendFalso();
    const g = sinVistasAplanadas(backend, TODAS);
    expect(await g.write("/p/Clientes.xml")).toEqual({ error: expect.stringMatching(/aplanada/i) });
    expect(await g.edit("/p/Clientes.xml")).toEqual({ error: expect.stringMatching(/aplanada/i) });
    expect(visto).toEqual([]);
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

describe("sinArtefactosEnElProyecto", () => {
  function backendFalso() {
    const visto: string[] = [];
    return {
      visto,
      backend: {
        async read(ruta: string) { visto.push(`read:${ruta}`); return { content: "x" }; },
        async write(ruta: string) { visto.push(`write:${ruta}`); return { ok: true }; },
        async edit(ruta: string) { visto.push(`edit:${ruta}`); return { ok: true }; },
      },
    };
  }

  /**
   * Se DEVUELVE `{error}` y no se lanza: es lo único que hace que el modelo lo lea y
   * reintente. Ver el bloque equivalente en `sinVistasAplanadas` para lo medido.
   */
  it("escribir en la carpeta inventada se rechaza con `{error}`, NO llega al disco, y dice la ruta buena", async () => {
    const { backend, visto } = backendFalso();
    const g = sinArtefactosEnElProyecto(backend);
    expect(await g.write("/artifacts/login_flow.html")).toEqual({
      error: expect.stringContaining("/artefactos/login_flow.html"),
    });
    expect(await g.edit("/artifacts/login_flow.html")).toEqual({
      error: expect.stringContaining("/artefactos/login_flow.html"),
    });
    // Lo que importa: no se escribió nada. El otro lado de este error es un diagrama
    // dentro de la app XOne del cliente, subido a CloudStudio.
    expect(visto).toEqual([]);
  });

  it("el motivo nombra las tres consecuencias, que es lo que hace que reintente", async () => {
    const g = sinArtefactosEnElProyecto(backendFalso().backend);
    const { error } = (await g.write("/artifacts/x.html")) as unknown as { error: string };
    expect(error).toMatch(/aprobación/i);
    expect(error).toMatch(/git/i);
    expect(error).toMatch(/CloudStudio/i);
  });

  it("LEER no se toca: si ya hay uno mal puesto de antes, hay que poder mirarlo", async () => {
    const { backend, visto } = backendFalso();
    await sinArtefactosEnElProyecto(backend).read("/artifacts/viejo.html");
    expect(visto).toEqual(["read:/artifacts/viejo.html"]);
  });

  it("un fichero del proyecto que solo se llama parecido pasa sin enterarse", async () => {
    const { backend, visto } = backendFalso();
    const g = sinArtefactosEnElProyecto(backend);
    await g.write("/src/artifacts.js");
    await g.write("/app.xml");
    expect(visto).toEqual(["write:/src/artifacts.js", "write:/app.xml"]);
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

describe("backendConArtefactos", () => {
  /** Un proyecto y una carpeta de artefactos que TODAVÍA no existe: es el caso normal. */
  function montar() {
    const proyecto = mkdtempSync(join(tmpdir(), "xc-proy-"));
    const carpeta = join(mkdtempSync(join(tmpdir(), "xc-sesion-")), "artefactos");
    const apuntados: Artefacto[] = [];
    const backend = backendConArtefactos(
      backendDelProyecto(proyecto),
      carpeta,
      (a) => apuntados.push(a)
    ) as unknown as { routePrefixes: string[]; write(p: string, c: string): Promise<unknown> };
    return { proyecto, carpeta, apuntados, backend };
  }

  it("lo escrito en /artefactos/ NO cae en el proyecto, y la carpeta se crea sola", async () => {
    // Es el fallo que esto arregla: hoy un diagrama del `mockup` acaba en la raíz del
    // proyecto, pasa por aprobación, entra en git y sube a CloudStudio.
    const { proyecto, carpeta, backend } = montar();
    expect(backend.routePrefixes).toContain("/artefactos/");
    expect(existsSync(carpeta)).toBe(false); // no se crea al montar: la mayoría no dibuja nada

    await backend.write("/artefactos/flujo.html", "<h1>hola</h1>");

    expect(readdirSync(carpeta)).toEqual(["flujo.html"]);
    expect(readFileSync(join(carpeta, "flujo.html"), "utf8")).toBe("<h1>hola</h1>");
    expect(readdirSync(proyecto)).toEqual([]);
  });

  it("apunta lo que se escribe: nombre, mime y tamaño MEDIDO del disco", async () => {
    // Un artefacto que nadie nombra es un fichero en una carpeta que nadie abre. Y el
    // tamaño sale del disco y no del argumento porque por aquí pasa también `edit`, cuyo
    // segundo argumento es el texto a sustituir y no el fichero resultante.
    const { apuntados, backend } = montar();
    await backend.write("/artefactos/flujo.html", "<h1>hola</h1>");

    expect(apuntados).toEqual([
      { ruta: "/artefactos/flujo.html", nombre: "flujo.html", mime: "text/html", bytes: 13 },
    ]);
  });

  it("un fichero del proyecto sigue yendo al proyecto y no se apunta", async () => {
    const { proyecto, apuntados, backend } = montar();
    await backend.write("/Clientes.xne", "<coll/>");
    expect(readdirSync(proyecto)).toEqual(["Clientes.xne"]);
    expect(apuntados).toEqual([]);
  });
});

/**
 * El CABLEADO, que es lo que no miraba nadie.
 *
 * Cada envoltorio tiene su test arriba, y `construirAgente` se simula en todos los tests
 * que lo tocan: una regla podía dejar de estar montada con todo en verde. Esto compone el
 * backend de verdad sobre un proyecto en un temporal y le pide las cosas por su ruta
 * virtual, que es como se las pide el agente.
 */
describe("backendDeAgente — las reglas están MONTADAS, no solo escritas", () => {
  function proyecto() {
    const raiz = mkdtempSync(join(tmpdir(), "xonecode-backend-"));
    writeFileSync(join(raiz, "app.xml"), "<app/>");
    writeFileSync(join(raiz, "Clientes.xne"), "<coll/>");
    writeFileSync(join(raiz, "Clientes.xml"), "<coll/>");
    const carpeta = join(raiz, ".xonecode", "sesiones", "s1", "artefactos");
    const escritos: Artefacto[] = [];
    const backend = backendDeAgente({
      raiz,
      ficheros: new Set(["/app.xml", "/Clientes.xne", "/Clientes.xml"]),
      artefactos: { carpeta, alEscribir: (a) => escritos.push(a) },
    }) as unknown as {
      read(ruta: string): Promise<unknown>;
      write(ruta: string, contenido: string): Promise<unknown>;
    };
    return { raiz, carpeta, escritos, backend };
  }

  it("un artefacto en el PROYECTO se rechaza con la ruta buena, y no toca el disco", async () => {
    const { raiz, backend } = proyecto();
    expect(await backend.write("/artifacts/login_flow.html", "<html/>")).toEqual({
      error: expect.stringContaining("/artefactos/login_flow.html"),
    });
    expect(existsSync(join(raiz, "artifacts"))).toBe(false);
  });

  it("y en `/artefactos/` se escribe de verdad, sin pasar por esa guarda", async () => {
    const { carpeta, escritos, backend } = proyecto();
    await backend.write("/artefactos/login_flow.html", "<html/>");
    expect(readFileSync(join(carpeta, "login_flow.html"), "utf8")).toBe("<html/>");
    // Y se ANUNCIA: es la única escritura del turno que nadie aprueba.
    expect(escritos).toEqual([
      { ruta: "/artefactos/login_flow.html", nombre: "login_flow.html", bytes: 7, mime: "text/html" },
    ]);
  });

  it("las vistas aplanadas siguen sin existir, y la memoria sigue expuesta", async () => {
    const { backend } = proyecto();
    expect(await backend.read("/Clientes.xml")).toEqual({ error: expect.stringMatching(/aplanada/i) });
    await backend.write(RUTA_MEMORIA_VIRTUAL, "recordar esto");
    expect(await backend.read(RUTA_MEMORIA_VIRTUAL)).toBeDefined();
  });

  it("`/skills/` sigue colgada: se lee el catálogo del harness", async () => {
    const { backend } = proyecto();
    expect(await backend.read("/skills/xone-development/SKILL.md")).toBeDefined();
  });
});

/**
 * La COSTURA con deepagents, que es lo único que prueba que el mensaje LLEGA.
 *
 * Los tests de arriba afirman que la guarda devuelve `{error}`; este afirma lo que de eso
 * depende: que el tool de fichero de la librería convierte ese `{error}` en el RESULTADO de
 * la llamada —una cadena que el modelo lee y sobre la que puede reintentar— y no en una
 * excepción que se lleve el turno.
 *
 * Hace falta medirlo aquí y no confiar en la lectura de su código, porque es un contrato de
 * una dependencia: el día que `createWriteFileTool` deje de comprobar `result.error` y
 * empiece a lanzar, estas dos reglas se convertirían en «el turno revienta» sin que nada
 * más chistara. Se monta el middleware de verdad; no hay red, ni clave, ni modelo.
 */
describe("la costura con deepagents: el rechazo llega como RESULTADO, no como excepción", () => {
  function tools(raiz: string, ficheros: ReadonlySet<string>) {
    const backend = backendDeAgente({ raiz, ficheros });
    const middleware = createFilesystemMiddleware({ backend } as never) as unknown as {
      tools: { name: string; invoke: (entrada: unknown) => Promise<unknown> }[];
    };
    return middleware.tools;
  }

  function proyecto() {
    const raiz = mkdtempSync(join(tmpdir(), "xonecode-costura-"));
    writeFileSync(join(raiz, "app.xml"), "<app/>");
    writeFileSync(join(raiz, "Clientes.xne"), "<coll/>");
    writeFileSync(join(raiz, "Clientes.xml"), "<coll/>");
    return { raiz, ficheros: new Set(["/app.xml", "/Clientes.xne", "/Clientes.xml"]) };
  }

  it("write_file a `/artifacts/` devuelve el motivo como texto, y no escribe", async () => {
    const { raiz, ficheros } = proyecto();
    const write = tools(raiz, ficheros).find((x) => x.name === "write_file")!;
    const resultado = await write.invoke({ file_path: "/artifacts/x.html", content: "<html/>" });
    // Una CADENA, no un lanzamiento: es lo que el modelo recibe y lee.
    expect(typeof resultado).toBe("string");
    expect(resultado).toContain("/artefactos/x.html");
    expect(existsSync(join(raiz, "artifacts"))).toBe(false);
  });

  it("y una vista aplanada, igual: el motivo es texto y el .xne se nombra", async () => {
    const { raiz, ficheros } = proyecto();
    const write = tools(raiz, ficheros).find((x) => x.name === "write_file")!;
    const resultado = await write.invoke({ file_path: "/Clientes.xml", content: "<coll/>" });
    expect(typeof resultado).toBe("string");
    expect(resultado).toContain("Clientes.xne");
  });

  it("y lo que sí vale se escribe de verdad: la guarda no está de más en el camino bueno", async () => {
    const { raiz, ficheros } = proyecto();
    const write = tools(raiz, ficheros).find((x) => x.name === "write_file")!;
    await write.invoke({ file_path: "/Clientes.xne", content: "<coll nuevo/>" });
    expect(readFileSync(join(raiz, "Clientes.xne"), "utf8")).toBe("<coll nuevo/>");
  });
});
