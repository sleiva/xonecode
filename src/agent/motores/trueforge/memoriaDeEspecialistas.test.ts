import { describe, expect, it } from "vitest";
import { TOPE_DE_MEMORIA_TOKENS, crearMemoriaDeEspecialistas } from "./memoriaDeEspecialistas.js";

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

  it("pasado el tope se olvida, y se dice por qué", () => {
    const m = crearMemoriaDeEspecialistas(100);
    m.abrir("device-controller", "h1");
    expect(m.cerrar("h1", { bien: true, mensajes: MSGS, tokens: 101 })).toBe("olvidada-por-tope");
    expect(m.abrir("device-controller", "h2")).toEqual({ sin: "olvidada-por-tope" });
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

  it("el tope por omisión es el declarado", () => {
    expect(TOPE_DE_MEMORIA_TOKENS).toBe(48_000);
  });
});
