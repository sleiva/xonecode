import { describe, it, expect } from "vitest";
import { aPendiente, ficheroDe, type PendingInterrupt } from "./interrupts.js";

/** Un pendiente de forma válida, con lo que cada test quiere sobreescribir. */
function pendiente(sobre: Partial<PendingInterrupt> = {}): PendingInterrupt {
  return {
    id: "i1",
    tool: "write_file",
    args: {},
    description: "quiere escribir un fichero",
    allowedDecisions: ["approve", "reject"],
    ...sobre,
  };
}

describe("aPendiente", () => {
  it("saca el origen de los corchetes de la description", () => {
    // `hitlDe()` mete el nombre del perfil ahí porque el interrupt NO dice de qué
    // subagente viene, y `dev` y `mockup` comparten `write_file`.
    const p = aPendiente(pendiente({ description: "[dev] quiere escribir un fichero" }));
    expect(p).toEqual({
      id: "i1",
      origen: "dev",
      descripcion: "[dev] quiere escribir un fichero",
      decisionesPermitidas: ["approve", "reject"],
    });
  });

  it("sin corchetes en la description, cae al nombre de la tool", () => {
    const p = aPendiente(pendiente({ tool: "write_file", description: "Ejecutar write_file" }));
    expect(p.origen).toBe("write_file");
  });
});

describe("ficheroDe", () => {
  it.each(["file_path", "path", "filePath", "file"] as const)(
    "encuentra la ruta en la clave «%s»",
    (clave) => {
      expect(ficheroDe(pendiente({ args: { [clave]: "/p/Clientes.xne" } }))).toBe("/p/Clientes.xne");
    }
  );

  it("devuelve undefined si ninguna clave la trae, sin inventarse una", () => {
    expect(ficheroDe(pendiente({ args: { content: "el contenido entero" } }))).toBeUndefined();
    expect(ficheroDe(pendiente({ args: {} }))).toBeUndefined();
  });

  it("una ruta VACÍA no cuenta como encontrada", () => {
    expect(ficheroDe(pendiente({ args: { file_path: "" } }))).toBeUndefined();
  });
});