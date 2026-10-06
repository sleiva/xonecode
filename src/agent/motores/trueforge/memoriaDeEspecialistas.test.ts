import { describe, expect, it } from "vitest";
import { MAX_CARACTERES_DE_ARGUMENTO, MAX_CARACTERES_DE_RESULTADO, TOPE_COMPLETA_TOKENS, TOPE_REDUCIDA_TOKENS, crearMemoriaDeEspecialistas, reducirHistorial, ventanaDeHistorial } from "./memoriaDeEspecialistas.js";

const MSGS = [{ role: "user", content: "haz" }, { role: "assistant", content: "hecho" }];

describe("la memoria de cada especialista en la sesión", () => {
  it("la primera vez no hay; tras acabar bien, la siguiente arranca con su historial", () => {
    const m = crearMemoriaDeEspecialistas();
    expect(m.abrir("designer-xone", "h1")).toEqual({ sin: "primera" });
    expect(m.cerrar("h1", { bien: true, mensajes: MSGS, tokens: 1000 })).toBe("guardada");
    const r = m.abrir("designer-xone", "h2");
    expect("previa" in r && r.previa.mensajes).toEqual(MSGS);
  });

  it("cada especialista tiene la suya", () => {
    const m = crearMemoriaDeEspecialistas();
    m.abrir("designer-xone", "h1");
    m.cerrar("h1", { bien: true, mensajes: MSGS, tokens: 1 });
    expect(m.abrir("developer-xone", "h2")).toEqual({ sin: "primera" });
  });

  it("con una encarnación viva, la segunda arranca de cero (una memoria no se reparte entre dos hilos)", () => {
    const m = crearMemoriaDeEspecialistas();
    m.abrir("designer-xone", "h1");
    m.cerrar("h1", { bien: true, mensajes: MSGS, tokens: 1 });
    expect("previa" in m.abrir("designer-xone", "h2")).toBe(true);
    expect(m.abrir("designer-xone", "h3")).toEqual({ sin: "hilo-vivo" });
  });

  const GRANDE = "x".repeat(MAX_CARACTERES_DE_RESULTADO * 4);
  const CON_FICHERO = [
    { role: "user", content: "mira" },
    { role: "assistant", content: "leo el css", reasoning_content: "pienso mucho", tool_calls: [{ id: "c1", function: { name: "read_file", arguments: "{\"file_path\":\"/a.css\"}" } }] },
    { role: "tool", tool_call_id: "c1", content: GRANDE },
    { role: "assistant", content: "el css define .tecla" },
  ];

  it("si no cabe entero se guarda REDUCIDO: lo dicho y lo pedido enteros, lo devuelto por las tools recortado", () => {
    const m = crearMemoriaDeEspecialistas({ completa: 10, reducida: 100_000 });
    m.abrir("consultant-xone", "h1");
    expect(m.cerrar("h1", { bien: true, mensajes: CON_FICHERO, tokens: 65_000 })).toBe("guardada-reducida");
    const r = m.abrir("consultant-xone", "h2");
    const ms = ("previa" in r ? r.previa.mensajes : []) as { role: string; content?: string; reasoning_content?: unknown }[];
    expect(ms[2]!.content!.length).toBeLessThan(GRANDE.length);
    expect(ms[2]!.content).toContain("vuelve a leerlo");
    expect(ms[3]!.content).toBe("el css define .tecla");
    expect(ms[1]!.reasoning_content).toBeUndefined();
    expect(JSON.stringify(ms[1])).toContain("/a.css");
  });

  /** Tres delegaciones seguidas, cada una con su encargo, una llamada a tool y su respuesta, y lo que dijo al cerrar. */
  const delegacion = (n: number, peso = 200) => [
    { role: "user", content: `encargo ${String(n)}` },
    { role: "assistant", content: "", tool_calls: [{ id: `c${String(n)}`, function: { name: "read_file", arguments: "{}" } }] },
    { role: "tool", tool_call_id: `c${String(n)}`, content: "z".repeat(peso) },
    { role: "assistant", content: `hecho ${String(n)}` },
  ];
  const TRES = [...delegacion(1), ...delegacion(2), ...delegacion(3)];

  it("la ventana descarta delegaciones ENTERAS, las más antiguas primero, y nunca parte una llamada de su respuesta", () => {
    const una = JSON.stringify(delegacion(3)).length / 4;
    const v = ventanaDeHistorial(TRES, Math.ceil(una * 2.2)) as { role: string; content?: string; tool_call_id?: string }[];
    expect(v[0]).toMatchObject({ role: "user", content: "encargo 2" });
    expect(v.some((m) => m.content === "encargo 1")).toBe(false);
    // cada tool tiene su llamada delante
    for (const m of v) if (m.role === "tool") expect(v.some((x) => (x as { tool_calls?: { id: string }[] }).tool_calls?.some((t) => t.id === m.tool_call_id))).toBe(true);
  });

  it("si nada cabe entero, la última delegación se queda con su encargo y lo último que dijo", () => {
    const v = ventanaDeHistorial(TRES, 1) as { role: string; content?: string }[];
    expect(v.map((m) => m.content)).toEqual(["encargo 3", "hecho 3"]);
  });

  it("sin mensajes de usuario no hay por dónde cortar y se deja tal cual", () => {
    const sin = [{ role: "assistant", content: "a" }];
    expect(ventanaDeHistorial(sin, 1)).toEqual(sin);
  });

  it("si ni reducido cabe, guarda la VENTANA en vez de olvidar todo", () => {
    const m = crearMemoriaDeEspecialistas({ completa: 10, reducida: 300 });
    m.abrir("device-controller", "h1");
    expect(m.cerrar("h1", { bien: true, mensajes: TRES, tokens: 10_000 })).toBe("guardada-ventana");
    const r = m.abrir("device-controller", "h2");
    const ms = ("previa" in r ? r.previa.mensajes : []) as { content?: string }[];
    expect(ms.length).toBeGreaterThan(0);
    expect(ms.at(-1)!.content).toBe("hecho 3");
  });

  it("reducirHistorial no toca lo corto ni al usuario", () => {
    const corto = [{ role: "user", content: "hola" }, { role: "tool", content: "ok" }];
    expect(reducirHistorial(corto)).toEqual(corto);
  });

  it("uno que falló no deja memoria y borra la que hubiera", () => {
    const m = crearMemoriaDeEspecialistas();
    m.abrir("designer-xone", "h1");
    m.cerrar("h1", { bien: true, mensajes: MSGS, tokens: 1 });
    m.abrir("designer-xone", "h2");
    expect(m.cerrar("h2", { bien: false, mensajes: MSGS, tokens: 1 })).toBe("olvidada-por-fallo");
    expect(m.abrir("designer-xone", "h3")).toEqual({ sin: "olvidada-por-fallo" });
  });

  it("una tool call sin respuesta al final se salda antes de guardar", () => {
    const m = crearMemoriaDeEspecialistas();
    m.abrir("designer-xone", "h1");
    m.cerrar("h1", { bien: true, mensajes: [{ role: "assistant", tool_calls: [{ id: "c1" }] }], tokens: 1 });
    const r = m.abrir("designer-xone", "h2");
    const ms = "previa" in r ? (r.previa.mensajes as { role?: string; tool_call_id?: string }[]) : [];
    expect(ms.at(-1)).toMatchObject({ role: "tool", tool_call_id: "c1" });
  });

  it("darPorMuertos libera los hilos vivos y conserva la memoria; olvidar lo borra todo", () => {
    const m = crearMemoriaDeEspecialistas();
    m.abrir("designer-xone", "h1");
    m.cerrar("h1", { bien: true, mensajes: MSGS, tokens: 1 });
    m.abrir("designer-xone", "h2"); // vivo
    m.darPorMuertos();
    expect("previa" in m.abrir("designer-xone", "h3")).toBe(true);
    m.olvidar();
    expect(m.abrir("designer-xone", "h4")).toEqual({ sin: "primera" });
  });

  it("los topes por omisión son los declarados", () => {
    expect([TOPE_COMPLETA_TOKENS, TOPE_REDUCIDA_TOKENS]).toEqual([48_000, 40_000]);
  });
});

describe("los argumentos largos de sus llamadas, en la memoria reducida (Maset: el desarrollador imitaba la marca)", () => {
  const llamada = (name: string, args: Record<string, unknown>) => ({
    role: "assistant",
    content: "",
    tool_calls: [{ id: "c1", function: { name, arguments: JSON.stringify(args) } }],
  });
  const argsDe = (m: unknown) =>
    JSON.parse((m as { tool_calls: { function: { arguments: string } }[] }).tool_calls[0]!.function.arguments) as Record<string, string>;

  it("un ENCARGO a otro especialista se guarda entero", () => {
    const encargo = "Maset, emulador 1080x2400. Comprueba los tres bordes: ".repeat(15);
    const [m] = reducirHistorial([llamada("create_sub_agent", { name: "device-controller", input: encargo })]);
    expect(argsDe(m).input).toBe(encargo);
  });

  it("lo demás largo se omite ENTERO con una nota que dice que no se copie: nada de principio + marca de recorte", () => {
    const contenido = "<coll name='X'>".repeat(100);
    const [m] = reducirHistorial([llamada("write_file", { file_path: "/X.xne", content: contenido })]);
    const a = argsDe(m);
    expect(a.file_path).toBe("/X.xne");
    expect(a.content).not.toContain("<coll");
    expect(a.content).not.toContain("[recortado");
    expect(a.content).toContain(`${String(contenido.length)} caracteres`);
    expect(a.content).toContain("no lo copies");
    expect(MAX_CARACTERES_DE_ARGUMENTO).toBe(300);
  });
});
