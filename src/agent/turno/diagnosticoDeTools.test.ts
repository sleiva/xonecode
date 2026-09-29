import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { crearDiagnosticoDeTools, NOMBRE_TRAZA_TOOLS, rutaTrazaDeTools, TOPE_DEL_ENCARGO_EN_TRAZA, VARIABLE_TRAZA_TOOLS } from "./diagnosticoDeTools.js";
import { createTokenTracker } from "../../vendor/tokenTracking.js";

describe("diagnóstico de tools", () => {
  it("solo se activa de forma explícita", () => {
    const raiz = mkdtempSync(join(tmpdir(), "xc-traza-"));
    expect(crearDiagnosticoDeTools(raiz, {})).toBeUndefined();
    expect(rutaTrazaDeTools(raiz)).toBe(join(raiz, ".xonecode", NOMBRE_TRAZA_TOOLS));
  });

  it("registra coste y detalle seguro, nunca argumentos completos", () => {
    const raiz = mkdtempSync(join(tmpdir(), "xc-traza-"));
    const log = crearDiagnosticoDeTools(raiz, { [VARIABLE_TRAZA_TOOLS]: "1" });
    const tracker = createTokenTracker();
    tracker.input = 120;
    tracker.output = 8;
    tracker.calls = 2;
    log!.modelo("planner", { input: 80, output: 6, cache: 40, llamadas: 2, contexto: 80 });
    log!.herramienta("grep", "function MTLogin", { pattern: "function MTLogin", path: "/", max_count: 10 }, tracker);

    const lineas = readFileSync(rutaTrazaDeTools(raiz), "utf8").trim().split("\n").map((linea) => JSON.parse(linea)) as Array<Record<string, unknown>>;
    expect(lineas.map((l) => l.tipo)).toEqual(["sesion", "modelo", "tool"]);
    expect(lineas[1]).toMatchObject({ origen: "planner", input: 80, cache: 40 });
    expect(lineas[2]).toMatchObject({
      nombre: "grep",
      detalle: "function MTLogin",
      parametros: { pattern: "function MTLogin", path: "/", max_count: 10 },
      inputAcumulado: 120,
    });
    expect(JSON.stringify(lineas)).not.toContain("contenido");
  });

  it("cada línea lleva el CHAT, leído en el momento de escribirla", () => {
    // `sesion` es la apertura; el chat es la conversación, y cambia con `/nuevo` sin
    // reconstruir la traza. Sin él, el zip de soporte de UN chat no puede elegir sus líneas.
    const raiz = mkdtempSync(join(tmpdir(), "xc-traza-"));
    let chat = "chat-1";
    const log = crearDiagnosticoDeTools(raiz, { [VARIABLE_TRAZA_TOOLS]: "1" }, () => chat);
    log!.modelo("planner", { input: 1, output: 1, cache: 0, llamadas: 1, contexto: 1 });
    chat = "chat-2";
    log!.modelo("planner", { input: 1, output: 1, cache: 0, llamadas: 1, contexto: 1 });
    const lineas = readFileSync(rutaTrazaDeTools(raiz), "utf8").trim().split("\n").map((l) => JSON.parse(l)) as Array<Record<string, unknown>>;
    expect(lineas.map((l) => l.chat)).toEqual(["chat-1", "chat-1", "chat-2"]);
  });

  it("un chat que aún no se puede leer deja la línea SIN chat, sin tumbar nada", () => {
    const raiz = mkdtempSync(join(tmpdir(), "xc-traza-"));
    const log = crearDiagnosticoDeTools(raiz, { [VARIABLE_TRAZA_TOOLS]: "1" }, () => {
      throw new ReferenceError("hilo antes de declararse");
    });
    expect(log).toBeDefined();
    const [primera] = readFileSync(rutaTrazaDeTools(raiz), "utf8").trim().split("\n").map((l) => JSON.parse(l)) as Array<Record<string, unknown>>;
    expect(primera).not.toHaveProperty("chat");
  });

  it("anota un corte con su ORIGEN y su límite", () => {
    // Sin el origen, saber que hubo un corte no dice a quién le pasó — y eso es justo lo que
    // hace falta para calibrar el presupuesto por papel.
    const raiz = mkdtempSync(join(tmpdir(), "xc-traza-"));
    const log = crearDiagnosticoDeTools(raiz, { [VARIABLE_TRAZA_TOOLS]: "1" });
    log!.corte!("designer-xone", 15);
    const lineas = readFileSync(rutaTrazaDeTools(raiz), "utf8").trim().split("\n").map((l) => JSON.parse(l)) as Array<Record<string, unknown>>;
    expect(lineas.map((l) => l.tipo)).toEqual(["sesion", "corte"]);
    expect(lineas[1]).toMatchObject({ origen: "designer-xone", limite: 15 });
  });

  it("la línea de una tool lleva el NOMBRE del agente que la llamó, cuando se sabe", () => {
    const raiz = mkdtempSync(join(tmpdir(), "xc-traza-"));
    const log = crearDiagnosticoDeTools(raiz, { [VARIABLE_TRAZA_TOOLS]: "1" })!;
    const tracker = createTokenTracker();
    log.herramienta("write_file", "/a", undefined, tracker, "especialista", undefined, "designer-xone");
    log.herramienta("read_file", "/b", undefined, tracker, "orquestador");
    const lineas = readFileSync(rutaTrazaDeTools(raiz), "utf8").trim().split("\n").map((l) => JSON.parse(l) as Record<string, unknown>);
    const tools = lineas.filter((l) => l["tipo"] === "tool");
    expect(tools[0]).toMatchObject({ nombre: "write_file", agente: "designer-xone" });
    expect(tools[1]).not.toHaveProperty("agente");
  });

  it("una delegación guarda el encargo, RECORTADO, y su longitud entera", () => {
    const raiz = mkdtempSync(join(tmpdir(), "xc-traza-"));
    const log = crearDiagnosticoDeTools(raiz, { [VARIABLE_TRAZA_TOOLS]: "1" })!;
    log.delegacion?.("orquestador", "developer-xone", "haz X");
    log.delegacion?.("orquestador", "designer-xone", "y".repeat(TOPE_DEL_ENCARGO_EN_TRAZA + 500));
    const d = readFileSync(rutaTrazaDeTools(raiz), "utf8").trim().split("\n").map((l) => JSON.parse(l) as Record<string, unknown>).filter((l) => l["tipo"] === "delegacion");
    expect(d[0]).toMatchObject({ de: "orquestador", a: "developer-xone", chars: 5, encargo: "haz X" });
    expect(d[1]!["chars"]).toBe(TOPE_DEL_ENCARGO_EN_TRAZA + 500);
    expect(String(d[1]!["encargo"]).length).toBe(TOPE_DEL_ENCARGO_EN_TRAZA + 1);
  });

  it("sin la traza encendida no se escribe nada, tampoco de las delegaciones", () => {
    const raiz = mkdtempSync(join(tmpdir(), "xc-traza-"));
    const log = crearDiagnosticoDeTools(raiz, {});
    expect(log).toBeUndefined();
  });

  it("la línea del modelo lleva el razonamiento cuando se sabe, y NO lo inventa cuando no", () => {
    const raiz = mkdtempSync(join(tmpdir(), "xc-traza-"));
    const log = crearDiagnosticoDeTools(raiz, { [VARIABLE_TRAZA_TOOLS]: "1" })!;
    log.modelo("designer-xone", { input: 10, output: 900, cache: 0, llamadas: 1, contexto: 10, razonamiento: 800 });
    log.modelo("orquestador", { input: 10, output: 50, cache: 0, llamadas: 2, contexto: 10 });
    const m = readFileSync(rutaTrazaDeTools(raiz), "utf8").trim().split("\n").map((l) => JSON.parse(l) as Record<string, unknown>).filter((l) => l["tipo"] === "modelo");
    expect(m[0]).toMatchObject({ origen: "designer-xone", razonamiento: 800 });
    expect(m[1]).not.toHaveProperty("razonamiento");
  });
});
