import { describe, it, expect } from "vitest";
import { Colapsador, type EventoTool } from "./notify.js";

const ok = (nombre: string): EventoTool => ({ nombre });

describe("Colapsador", () => {
  it("anuncia la primera de una racha y calla las siguientes", () => {
    const c = new Colapsador();
    expect(c.lineas(ok("grep"))).toEqual(["🔧 grep"]);
    expect(c.lineas(ok("grep"))).toEqual([]);
    expect(c.lineas(ok("grep"))).toEqual([]);
  });

  it("al cambiar de tool dice cuántas fueron, en DOS líneas separadas", () => {
    // Este es el caso que se pagó: devolver las dos pegadas en una cadena hacía que
    // quien pinta escribiera una sola línea con basura en medio.
    const c = new Colapsador();
    c.lineas(ok("read_file"));
    c.lineas(ok("read_file"));
    c.lineas(ok("read_file"));
    expect(c.lineas(ok("glob"))).toEqual(["🔧 read_file ×3", "🔧 glob"]);
  });

  it("una racha de UNA no se repite como ×1", () => {
    const c = new Colapsador();
    expect(c.lineas(ok("glob"))).toEqual(["🔧 glob"]);
    expect(c.lineas(ok("grep"))).toEqual(["🔧 grep"]);
  });

  it("el cierre no pierde la cuenta de la última racha", () => {
    const c = new Colapsador();
    c.lineas(ok("grep"));
    c.lineas(ok("grep"));
    expect(c.cierre()).toBe("🔧 grep ×2");
  });

  it("el cierre de una racha de una sola no dice nada", () => {
    const c = new Colapsador();
    c.lineas(ok("grep"));
    expect(c.cierre()).toBeNull();
  });

  it("un error NUNCA se colapsa y cierra la racha en curso", () => {
    const c = new Colapsador();
    c.lineas(ok("grep"));
    c.lineas(ok("grep"));
    expect(c.lineas({ nombre: "grep", error: "ENOENT" })).toEqual([
      "🔧 grep ×2",
      "✗ grep: ENOENT",
    ]);
  });

  it("dos errores seguidos salen los dos", () => {
    const c = new Colapsador();
    expect(c.lineas({ nombre: "x", error: "a" })).toEqual(["✗ x: a"]);
    expect(c.lineas({ nombre: "x", error: "b" })).toEqual(["✗ x: b"]);
  });
});