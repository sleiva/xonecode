import { describe, expect, it } from "vitest";
import { herramientaDeProyectos, invocarSobre, proyectosDeResultado } from "./cloudstudioMcp.js";

describe("proyectosDeResultado", () => {
  it("extrae identidades de una respuesta estructurada sin conservar el resto", () => {
    expect(proyectosDeResultado({
      projects: [
        { id: "a", name: "Ventas", secreto: "nunca llega a config" },
        { projectId: "b", title: "Inventario" },
        { id: "a", name: "Duplicado" },
      ],
    })).toEqual([
      { id: "a", nombre: "Ventas" },
      { id: "b", nombre: "Inventario" },
    ]);
  });

  it("admite JSON textual y descarta una respuesta que no representa proyectos", () => {
    expect(proyectosDeResultado('{"items":[{"project_id":"a","nombre":"Ventas"}]}')).toEqual([
      { id: "a", nombre: "Ventas" },
    ]);
    expect(proyectosDeResultado("texto libre")).toEqual([]);
  });

  it("extrae el JSON textual del bloque MCP sin filtrar su contenido al resto de la app", () => {
    expect(proyectosDeResultado({
      content: [{ type: "text", text: '{"projects":[{"id":"a","name":"Ventas"}]}' }],
    })).toEqual([{ id: "a", nombre: "Ventas" }]);
  });
});

describe("invocarSobre", () => {
  // El SDK MCP no lanza cuando una tool falla: `isError: true` es una respuesta RPC
  // válida, con el motivo dentro de `content`. Sin esta conversión, «No project is
  // open» nunca llegaría a un catch y `clienteCloudStudio` no podría reabrir la
  // sesión — un `invocarSobre` que se limitara a `return callTool(...)` pasaría los
  // dos primeros tests igual, pero jamás rechazaría en el tercero.
  it("convierte isError en una excepción con el texto del servidor", async () => {
    const invocar = invocarSobre(async () => ({
      isError: true,
      content: [{ type: "text", text: "No project is open. Use the studio_open_project tool" }],
    }));
    await expect(invocar("studio_get_file", { filePath: "a.js" }))
      .rejects.toThrow(/No project is open/);
  });

  it("un isError sin texto no deja el mensaje vacío", async () => {
    const invocar = invocarSobre(async () => ({ isError: true, content: [] }));
    await expect(invocar("studio_get_context", {})).rejects.toThrow(/./);
  });

  it("una respuesta sin isError se devuelve tal cual, sin tocarla", async () => {
    const bruto = { content: [{ type: "text", text: "contenido" }] };
    const invocar = invocarSobre(async () => bruto);
    expect(await invocar("studio_get_file", { filePath: "a.js" })).toBe(bruto);
  });

  it("pasa nombre y argumentos al callTool subyacente sin transformarlos", async () => {
    const peticiones: unknown[] = [];
    const invocar = invocarSobre(async (peticion) => {
      peticiones.push(peticion);
      return { content: [] };
    });
    await invocar("studio_open_project", { project: "AppForTest" });
    expect(peticiones).toEqual([{ name: "studio_open_project", arguments: { project: "AppForTest" } }]);
  });
});

describe("herramientaDeProyectos", () => {
  it("prefiere el nombre real del servidor XOne sobre cualquier heurística", () => {
    const elegida = herramientaDeProyectos([
      { name: "studio_get_project_structure" },
      { name: "studio_list_projects", description: "Lista los proyectos" },
      { name: "project_list" },
    ]);
    expect(elegida?.name).toBe("studio_list_projects");
  });

  it("acepta los alias históricos cuando el servidor no publica el nombre nuevo", () => {
    expect(herramientaDeProyectos([{ name: "project_list" }])?.name).toBe("project_list");
    expect(herramientaDeProyectos([{ name: "list_projects" }])?.name).toBe("list_projects");
  });

  it("cae en una heurística solo con tools sin argumentos obligatorios", () => {
    expect(herramientaDeProyectos([
      { name: "studio_projects_listing", inputSchema: { type: "object", required: ["id"] } },
    ])).toBeUndefined();
    expect(herramientaDeProyectos([{ name: "studio_projects_listing" }])?.name)
      .toBe("studio_projects_listing");
  });

  it("no confunde otra tool de proyecto con el listado", () => {
    expect(herramientaDeProyectos([
      { name: "studio_open_project" },
      { name: "studio_download_project" },
    ])).toBeUndefined();
  });
});

describe("proyectosDeResultado · forma real de studio_list_projects", () => {
  // Medido contra el servidor: no es una lista, es un MAPA indexado por id bajo
  // «recents», y el identificador viaja en «pid». Los demás campos (permisos, correo
  // del propietario, fechas) no salen de aquí.
  const respuestaReal = {
    recents: {
      "5cd2327f_53f3_40b9_9bb4_e6973fd0a938": {
        name: "AppDemo",
        pid: "5cd2327f_53f3_40b9_9bb4_e6973fd0a938",
        shared: false,
        last: "2026-09-02T04:41:38",
        rights: "{remove:true,download:true,edit:true}",
        suser: "alguien@ejemplo.es",
        studiopermissions: [{ show: false }],
      },
      "e01d2abe_25e7_47a0_9654_7bee94878a35": {
        name: "AppDeve",
        pid: "e01d2abe_25e7_47a0_9654_7bee94878a35",
        shared: true,
      },
    },
  };

  it("extrae los proyectos de un mapa indexado por id", () => {
    expect(proyectosDeResultado(respuestaReal)).toEqual([
      { id: "5cd2327f_53f3_40b9_9bb4_e6973fd0a938", nombre: "AppDemo" },
      { id: "e01d2abe_25e7_47a0_9654_7bee94878a35", nombre: "AppDeve" },
    ]);
  });

  it("no deja escapar ningún otro campo del proyecto", () => {
    const extraidos = proyectosDeResultado(respuestaReal);
    // Sin esto la comprobación de abajo pasaría también con una lista vacía.
    expect(extraidos).toHaveLength(2);
    const serializado = JSON.stringify(extraidos);
    for (const filtrado of ["suser", "ejemplo.es", "rights", "studiopermissions", "last"]) {
      expect(serializado).not.toContain(filtrado);
    }
  });

  it("usa la clave del mapa como id cuando la entrada no repite «pid»", () => {
    expect(proyectosDeResultado({ recents: { abc: { name: "SinPid" } } })).toEqual([
      { id: "abc", nombre: "SinPid" },
    ]);
  });

  it("llega igual envuelto en el bloque de texto del SDK MCP", () => {
    expect(proyectosDeResultado({
      content: [{ type: "text", text: JSON.stringify(respuestaReal) }],
    })).toHaveLength(2);
  });
});
