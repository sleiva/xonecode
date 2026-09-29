import { describe, expect, it } from "vitest";
import { MAX_CARACTERES_DE_ARGUMENTO, MAX_CARACTERES_DE_RESULTADO, TOPE_COMPLETA_TOKENS, TOPE_REDUCIDA_TOKENS, crearMemoriaDeEspecialistas, reducirHistorial } from "./memoriaDeEspecialistas.js";

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

  it("si ni reducido cabe, se olvida, y se dice por qué", () => {
    const m = crearMemoriaDeEspecialistas({ completa: 10, reducida: 5 });
    m.abrir("device-controller", "h1");
    expect(m.cerrar("h1", { bien: true, mensajes: CON_FICHERO, tokens: 101 })).toBe("olvidada-por-tope");
    expect(m.abrir("device-controller", "h2")).toEqual({ sin: "olvidada-por-tope" });
  });

  it("recorta el contenido largo de los argumentos de una llamada y conserva la ruta", () => {
    const codigo = "y".repeat(MAX_CARACTERES_DE_ARGUMENTO * 20);
    const args = JSON.stringify({ file_path: "/Calculadora.css", content: codigo });
    const r = reducirHistorial([{ role: "assistant", content: "", tool_calls: [{ id: "c1", function: { name: "write_file", arguments: args } }] }]) as {
      tool_calls: { function: { arguments: string } }[];
    }[];
    const recortado = JSON.parse(r[0]!.tool_calls[0]!.function.arguments) as { file_path: string; content: string };
    expect(recortado.file_path).toBe("/Calculadora.css");
    expect(recortado.content.length).toBeLessThan(codigo.length / 10);
    expect(recortado.content).toContain("recortado");
  });

  it("unos argumentos que no son JSON se dejan tal cual", () => {
    const m = { role: "assistant", tool_calls: [{ id: "c1", function: { name: "x", arguments: "no es json" } }] };
    expect(reducirHistorial([m])).toEqual([m]);
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
