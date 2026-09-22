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
import { CAMPOS_SEGUROS, parametrosDe, detalleDe } from "./resumenDeTool.js";

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

describe("`task`: sale QUIÉN, nunca el encargo", () => {
  const args = {
    subagent_type: "Documentador",
    description: "documenta la colección Clientes; su .xne dice fieldsize=80 y la clave va en /bd",
  };

  it("el detalle es el NOMBRE del especialista", () => {
    // Medido en la pantalla del usuario: la línea decía «⚙ task» a secas, así que con un
    // motor externo no había NADA en la interfaz que dijera a quién se delegó — y un hijo de
    // Claude Code son minutos en otro proceso, sin una sola tool que cruce.
    expect(detalleDe("task", args)).toBe("Documentador");
  });

  it("y la `description` NO sale: es el encargo entero, con contenido del proyecto dentro", () => {
    // La cabecera de este fichero ya la nombraba como el ejemplo de lo que no sale. El
    // nombre sí puede: es el de un fichero que escribió el usuario, y ya viaja como `origen`
    // en cada petición de aprobación.
    const p = parametrosDe("task", args);
    // Lo que sale es el nombre y la HUELLA del encargo —cuánto mide y un hash—, nunca una
    // línea de su texto: eso es lo que distingue tres delegaciones simultáneas distintas de
    // la misma repetida, sin guardar el encargo.
    expect(Object.keys(p ?? {}).sort()).toEqual(["encargoChars", "encargoHuella", "subagent_type"]);
    const serializado = JSON.stringify(p);
    for (const secreto of ["fieldsize", "Clientes", "/bd", "documenta", ".xne"]) {
      expect(serializado, secreto).not.toContain(secreto);
    }
  });
});

describe("xone_navegacion", () => {
  it("deja la OPERACIÓN, que es lo que hacía falta para poder medir", () => {
    // Siete operaciones bajo un solo nombre es no poder contestar cuál de las siete se usa. Se
    // descubrió al añadir `estilos`: no hubo forma de comprobar si el modelo llegaba a usarla.
    expect(parametrosDe("xone_navegacion", { operacion: "estilos", nombre: "AcercaDe.MAP_APP_NAME" }))
      .toEqual({ operacion: "estilos" });
  });

  it("y NUNCA el `nombre`, que es una colección del proyecto", () => {
    // Es contenido, y por aquí no pasa contenido: la misma regla que deja fuera la
    // `description` de `task`.
    const p = parametrosDe("xone_navegacion", { operacion: "detalle", nombre: "Clientes" });
    expect(JSON.stringify(p)).not.toContain("Clientes");
  });
});

/**
 * El `detalle` que se PINTA, que no es lo mismo que lo que se guarda en la traza.
 *
 * Toda esta batería miraba `parametrosDe` —lo que va al `.jsonl` de la traza— y ninguna
 * miraba `detalleDe`, que es lo que sale en la línea de la pantalla. Por ahí se coló el
 * fallo: tres filas de la tabla (`execute`, `xone_navegacion`, `Skill`) estaban puestas,
 * con su porqué escrito encima, y `detalleDe` no las leía porque elegía el campo con una
 * cadena de `if` aparte. No fallaba: callaba.
 */
describe("el detalle de la línea", () => {
  it("el comando de `execute` sale ENTERO: es lo que sustituye a preguntar antes de cada uno", () => {
    // Medido en las sesiones reales: «$ corre ×14» sin un solo comando a la vista.
    expect(detalleDe("execute", { command: "adb shell am start -n com.xone/.Main" }))
      .toBe("adb shell am start -n com.xone/.Main");
  });

  it("la operación de `xone_navegacion`, que es el instrumento para saber cuál de las siete se usa", () => {
    expect(detalleDe("xone_navegacion", { operacion: "estilos", nombre: "Clientes" })).toBe("estilos");
  });

  it("y la skill que carga un motor externo", () => {
    expect(detalleDe("Skill", { skill: "xone-hotswap" })).toBe("xone-hotswap");
  });

  it("de `write_file` sale la RUTA y jamás el contenido", () => {
    expect(detalleDe("write_file", { file_path: "/a.xne", content: "SECRETO" })).toBe("/a.xne");
  });

  it("lo que no está en la tabla no tiene detalle", () => {
    expect(detalleDe("studio_edit_file", { path: "/x" })).toBeUndefined();
  });

  /**
   * La prueba que cierra la CLASE de fallo, y no el caso: mientras el campo se elija en un
   * sitio distinto de la tabla, una fila nueva puede nacer muda igual que nacieron estas
   * tres. Con esto, añadir una fila sin que su primer campo se pinte da rojo.
   */
  it("NINGUNA fila de la tabla puede quedarse muda", () => {
    for (const [tool, campos] of Object.entries(CAMPOS_SEGUROS)) {
      const primero = campos[0]!;
      expect(detalleDe(tool, { [primero]: "valor" }), tool).toBe("valor");
    }
  });
});


/**
 * **La huella del encargo de un `task`, que es lo que deja diagnosticar el paralelismo.**
 *
 * Medido en un turno real: DeepSeek lanzó 37 de 69 tools en ráfagas simultáneas, y una
 * llevaba TRES `task` a la vez, dos al mismo especialista. Con solo el nombre en la traza no
 * se puede saber si eran tres encargos distintos o el mismo repetido — que es justo la
 * diferencia entre paralelismo útil y trabajo tirado.
 */
describe("la huella del encargo de un task", () => {
  const dePrueba = (description: string) =>
    parametrosDe("task", { subagent_type: "device-controller", description });

  it("dos encargos IGUALES dan la misma huella", () => {
    expect(dePrueba("despliega y mira el log")).toEqual(dePrueba("despliega y mira el log"));
  });

  it("dos encargos DISTINTOS dan huellas distintas", () => {
    expect(dePrueba("despliega y mira el log")?.["encargoHuella"]).not.toBe(
      dePrueba("otra cosa")?.["encargoHuella"],
    );
  });

  /** La regla de arriba no se toca: lo que no puede salir a disco, sigue sin salir. */
  it("el TEXTO del encargo no sale", () => {
    const p = dePrueba("abre /Clientes.xne y arregla el onload");
    const serializado = JSON.stringify(p);
    expect(serializado).not.toContain("Clientes");
    expect(serializado).not.toContain("onload");
    expect(p?.["encargoChars"]).toBe("abre /Clientes.xne y arregla el onload".length);
  });

  /** Un `task` sin descripción sigue trayendo a quién delega, como antes. */
  it("sin descripción no estorba", () => {
    expect(parametrosDe("task", { subagent_type: "developer-xone" })).toEqual({
      subagent_type: "developer-xone",
    });
  });
});
