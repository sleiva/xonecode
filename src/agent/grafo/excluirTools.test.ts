import { describe, expect, it } from "vitest";
import { AIMessage } from "@langchain/core/messages";
import { excluirTools, toolsQueNoUsa } from "./excluirTools.js";

const mw = (nombres: readonly string[]) =>
  excluirTools(nombres) as unknown as {
    wrapModelCall: (p: unknown, h: (p: unknown) => unknown) => unknown;
    wrapToolCall: (p: unknown, h: (p: unknown) => unknown) => unknown;
  };

const TOOLS = [{ name: "read_file" }, { name: "write_file" }, { name: "delete" }, { name: "grep" }];

describe("excluir tools del prompt", () => {
  it("las quita de la petición, que es lo que ahorra el esquema", async () => {
    let vista: unknown;
    await mw(["write_file", "delete"]).wrapModelCall({ tools: TOOLS }, (p: unknown) => {
      vista = p;
      return new AIMessage("ok");
    });
    expect((vista as { tools: { name: string }[] }).tools.map((t) => t.name)).toEqual(["read_file", "grep"]);
  });

  it("si no sobra ninguna, la petición pasa IDÉNTICA", async () => {
    const peticion = { tools: TOOLS };
    let vista: unknown;
    await mw(["glob"]).wrapModelCall(peticion, (p: unknown) => {
      vista = p;
      return new AIMessage("ok");
    });
    // Idéntica y no una copia: copiar de balde cambiaría lo que los middleware de abajo miden.
    expect(vista).toBe(peticion);
  });

  it("una tool sin nombre legible NO se descarta", async () => {
    // Quitar de más deja al agente sin capacidades en silencio, que es peor que el esquema.
    let vista: unknown;
    await mw(["write_file"]).wrapModelCall({ tools: [{}, { name: "write_file" }] }, (p: unknown) => {
      vista = p;
      return new AIMessage("ok");
    });
    expect((vista as { tools: unknown[] }).tools).toHaveLength(1);
  });

  it("y RECHAZA la llamada aunque el modelo se invente el nombre", async () => {
    // Solo quitarla del prompt sería fiar la barrera a que el modelo no nombre lo que no ha
    // visto, y en este repo eso no es una barrera.
    let llamado = false;
    const respuesta = await mw(["delete"]).wrapToolCall({ toolCall: { name: "delete", id: "c1" } }, () => {
      llamado = true;
      return new AIMessage("no debería");
    });
    expect(llamado).toBe(false);
    expect(String((respuesta as { content: unknown }).content)).toContain("no está disponible");
  });

  it("deja pasar las que no están en la lista", async () => {
    let llamado = false;
    await mw(["delete"]).wrapToolCall({ toolCall: { name: "read_file", id: "c1" } }, () => {
      llamado = true;
      return new AIMessage("ok");
    });
    expect(llamado).toBe(true);
  });
});

describe("qué tools no usa un perfil", () => {
  it("se DERIVA de lo que el perfil concede, no se escribe a mano", () => {
    // Escrita a mano sería una segunda lista que hay que acordarse de actualizar: el día que un
    // perfil gane una capacidad se quedaría sin ella en silencio.
    expect(toolsQueNoUsa({ nombre: "x", soloLectura: true }).sort()).toEqual(["delete", "edit_file", "write_file"]);
    // A uno que escribe solo le sobra `delete`, que no concede ningún perfil nuestro.
    expect(toolsQueNoUsa({ nombre: "x", soloLectura: false })).toEqual(["delete"]);
  });

  it("nunca excluye una que el perfil SÍ puede usar", () => {
    for (const soloLectura of [true, false]) {
      const fuera = new Set(toolsQueNoUsa({ nombre: "x", soloLectura }));
      for (const t of ["ls", "read_file", "glob", "grep"]) expect(fuera.has(t)).toBe(false);
    }
  });
});
