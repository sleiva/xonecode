import { describe, it, expect } from "vitest";
import { aPendiente, cambioDe, ficheroDe, type PendingInterrupt } from "./interrupts.js";

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
  /**
   * El origen sale de los corchetes —`hitlDe()` mete ahí el nombre del perfil porque el
   * interrupt NO dice de qué subagente viene, y `dev` y `mockup` comparten `write_file`— y
   * una vez extraído se QUITA de la descripción: las tres pieles pintan los dos campos uno
   * debajo del otro, así que dejarlo decía lo mismo dos veces pegado («[dev] quiere
   * modificar un fichero del proyecto» y debajo «quién: dev»). Medido en la pantalla.
   */
  it("saca el origen de los corchetes y lo QUITA de la descripción: no se dice dos veces", () => {
    const p = aPendiente(pendiente({ description: "[dev] quiere escribir un fichero" }));
    expect(p).toEqual({
      id: "i1",
      origen: "dev",
      descripcion: "quiere escribir un fichero",
      decisionesPermitidas: ["approve", "reject"],
    });
  });

  it("sin corchetes en la description, cae al nombre de la tool y la descripción se queda tal cual", () => {
    // Es el `Ejecutar <tool>` de reserva de `collectPending`: no pasó por `hitlDe`, así que
    // no hay prefijo que quitar y quitar algo sería recortarle el texto a un caso distinto.
    const p = aPendiente(pendiente({ tool: "write_file", description: "Ejecutar write_file" }));
    expect(p.origen).toBe("write_file");
    expect(p.descripcion).toBe("Ejecutar write_file");
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

describe("cambioDe", () => {
  /** Un `leer` de pega con un «disco» en memoria: el ANTES es lo que hay en la ruta. */
  function disco(contenido: Record<string, string>): (ruta: string) => string {
    return (ruta) => contenido[ruta] ?? "";
  }

  it("write_file sobre un fichero EXISTENTE difa disco contra el contenido nuevo", () => {
    const vista = cambioDe(
      pendiente({ args: { file_path: "app.xml", content: "<app>\nnuevo\n</app>" } }),
      disco({ "app.xml": "<app>\nviejo\n</app>" })
    );
    expect(vista?.ruta).toBe("app.xml");
    expect(vista?.lineas).toEqual([
      { tipo: "igual", texto: "<app>" },
      { tipo: "quitado", texto: "viejo" },
      { tipo: "anadido", texto: "nuevo" },
      { tipo: "igual", texto: "</app>" },
    ]);
  });

  it("write_file de un fichero NUEVO sale entero como añadido", () => {
    const vista = cambioDe(
      pendiente({ args: { file_path: "Login.xne", content: "<coll>\n</coll>" } }),
      disco({})
    );
    expect(vista?.ruta).toBe("Login.xne");
    expect(vista?.lineas.every((l) => l.tipo === "anadido")).toBe(true);
  });

  it("edit_file aplica el reemplazo viejo→nuevo y difa el resultado", () => {
    const vista = cambioDe(
      pendiente({ tool: "edit_file", args: { file_path: "app.xml", old_string: "viejo", new_string: "nuevo" } }),
      disco({ "app.xml": "uno\nviejo\ndos" })
    );
    expect(vista?.lineas).toEqual([
      { tipo: "igual", texto: "uno" },
      { tipo: "quitado", texto: "viejo" },
      { tipo: "anadido", texto: "nuevo" },
      { tipo: "igual", texto: "dos" },
    ]);
  });

  it("edit_file cuyo old_string NO está en disco enseña el reemplazo tal cual, sin fingir contexto", () => {
    const vista = cambioDe(
      pendiente({ tool: "edit_file", args: { file_path: "app.xml", old_string: "ausente", new_string: "nuevo" } }),
      disco({ "app.xml": "lo que sea" })
    );
    expect(vista?.lineas).toEqual([
      { tipo: "quitado", texto: "ausente" },
      { tipo: "anadido", texto: "nuevo" },
    ]);
  });

  it("una tool que no escribe ficheros no tiene vista", () => {
    expect(cambioDe(pendiente({ tool: "ls", args: { path: "/" } }), disco({}))).toBeUndefined();
  });

  it("args sin ruta o sin contenido: sin vista, sin lanzar", () => {
    expect(cambioDe(pendiente({ args: {} }), disco({}))).toBeUndefined();
    expect(
      cambioDe(pendiente({ args: { file_path: "a", content: 42 } }), disco({}))
    ).toBeUndefined();
    expect(
      cambioDe(pendiente({ tool: "edit_file", args: { file_path: "a", old_string: "x" } }), disco({ a: "x" }))
    ).toBeUndefined();
  });
});