/**
 * Tests de la LISTA BLANCA de `detalleDe`: qué puede salir de los argumentos de una
 * tool hacia la línea de estado.
 *
 * La regla que se verifica aquí es la misma que `core/events.ts` documenta: el evento
 * `tool` no lleva argumentos crudos porque `write_file` lleva el contenido del fichero y
 * una tool MCP lleva el bearer. Lo ÚNICO que sale es un campo de cada tool, elegido A
 * MANO por nombre — `file_path`, `path` o `pattern` — y nada más. Si el campo
 * permitido no existe, no hay detalle: undefined, no «el primer campo que haya».
 */

import { describe, it, expect } from "vitest";
import { detalleDe } from "./resumenDeTool.js";

describe("detalleDe", () => {
  it("las tools de fichero declaran su campo seguro, y solo ese sale", () => {
    expect(detalleDe("read_file", { file_path: "app.xne" })).toBe("app.xne");
    expect(detalleDe("write_file", { file_path: "app.xne", content: "…500 líneas…" })).toBe("app.xne");
    expect(detalleDe("edit_file", { file_path: "Login.xne", old_string: "a", new_string: "b" })).toBe("Login.xne");
    expect(detalleDe("ls", { path: "/" })).toBe("/");
    expect(detalleDe("glob", { pattern: "*.xne", path: "/" })).toBe("*.xne");
    expect(detalleDe("grep", { pattern: "realizarLogin", path: "/", glob: "*.js" })).toBe("realizarLogin");
    expect(detalleDe("regex_search", { pattern: "function\\s+(MT\\w+)", path: "/", glob: "*.js" })).toBe("function\\s+(MT\\w+)");
  });

  it("el contenido y los strings de edición NUNCA salen, aunque estén en los argumentos", () => {
    const detalle = detalleDe("edit_file", {
      file_path: "Login.xne",
      old_string: "SECRETO-VIEJO",
      new_string: "SECRETO-NUEVO",
    });
    expect(detalle).toBe("Login.xne");
    expect(detalle).not.toContain("SECRETO");
  });

  it("una tool que no está en la lista no tiene detalle, aunque sus argumentos parezcan inocentes", () => {
    // Las tools MCP de Studio no se conocen aquí, y su argumentos llevan bearer:
    // para ellas la lista blanca no tiene entrada, y sin entrada no hay detalle.
    expect(detalleDe("studio_edit_file", { file_path: "app.xne", auth: "Bearer …" })).toBeUndefined();
    expect(detalleDe("task", { description: "revisa el login" })).toBeUndefined();
    expect(detalleDe("desconocida", { path: "app.xne" })).toBeUndefined();
  });

  it("los argumentos pueden llegar como cadena JSON (así viajan en las tool_calls)", () => {
    expect(detalleDe("read_file", '{"file_path":"app.xne"}')).toBe("app.xne");
  });

  it("un JSON roto o un valor que no es cadena: sin detalle, sin lanzar", () => {
    expect(detalleDe("read_file", "{no es json")).toBeUndefined();
    expect(detalleDe("read_file", { file_path: 42 })).toBeUndefined();
    expect(detalleDe("read_file", {})).toBeUndefined();
    expect(detalleDe("read_file", "no-un-objeto")).toBeUndefined();
  });

  it("el detalle vacío no sirve para nada: undefined", () => {
    expect(detalleDe("read_file", { file_path: "" })).toBeUndefined();
  });
});
