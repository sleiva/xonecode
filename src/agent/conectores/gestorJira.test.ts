import { describe, expect, it, vi } from "vitest";
import { crearGestorJira } from "./gestorJira.js";
import type { Vinculo } from "../../core/gestorDeTareas.js";

/** Las formas MEDIDAS contra `https://mcp.atlassian.com/v1/mcp` (28-09-2026, ver `restricciones.md`). */
const SITIOS = [{ id: "cloud-1", url: "https://xone.atlassian.net", name: "XOne", scopes: ["read:jira-work"], avatarUrl: "https://x/a.png" }];

const PROYECTOS = {
  values: [{ id: "10001", key: "IXCODE", name: "xonecode" }],
  total: 1,
  isLast: true,
  startAt: 0,
  maxResults: 100,
};

const ISSUES = {
  issues: [
    {
      id: "20001",
      key: "IXCODE-11",
      fields: {
        summary: "Panel del proyecto",
        status: { name: "En curso", statusCategory: { key: "indeterminate" } },
        assignee: { displayName: "Sergio Leiva", emailAddress: "sleiva@xone.es", accountId: "abc123" },
      },
    },
    {
      id: "20002",
      key: "IXCODE-12",
      fields: {
        summary: "Sin asignar",
        status: { name: "Por hacer", statusCategory: { key: "new" } },
        assignee: null,
      },
    },
  ],
  isLast: true,
};

const ISSUE = {
  id: "20001",
  key: "IXCODE-11",
  fields: {
    summary: "Panel del proyecto",
    description: "El **plan** completo",
    status: { name: "En curso", statusCategory: { key: "indeterminate" } },
    assignee: { displayName: "Sergio Leiva", emailAddress: "sleiva@xone.es", accountId: "abc123" },
  },
};

const TRANSICIONES = {
  transitions: [
    { id: "21", name: "Empezar", to: { name: "En curso", statusCategory: { key: "indeterminate" } }, isAvailable: true },
    { id: "31", name: "Terminar", to: { name: "Terminado", statusCategory: { key: "done" } }, isAvailable: false },
    { id: "41", name: "Probar", to: { name: "Probar", statusCategory: { key: "indeterminate" } } },
  ],
};

const V: Vinculo = { conector: "jira", sitio: "cloud-1", proyecto: "IXCODE" };

function llamarDoble(respuestas: Record<string, unknown>) {
  const llamadas: { nombre: string; args: Record<string, unknown> }[] = [];
  const llamar = vi.fn(async (nombre: string, args: Record<string, unknown>) => {
    llamadas.push({ nombre, args });
    if (!(nombre in respuestas)) throw new Error(`sin fixture para ${nombre}`);
    return JSON.stringify(respuestas[nombre]);
  });
  return { llamar, llamadas };
}

describe("sitios y proyectos", () => {
  it("sitios() lee getAccessibleAtlassianResources", async () => {
    const { llamar } = llamarDoble({ getAccessibleAtlassianResources: SITIOS });
    const g = crearGestorJira(llamar);
    expect(await g.sitios()).toEqual([{ id: "cloud-1", nombre: "XOne", url: "https://xone.atlassian.net" }]);
    expect(llamar).toHaveBeenCalledWith("getAccessibleAtlassianResources", {});
  });

  it("proyectos() lee getVisibleJiraProjects con cloudId y maxResults", async () => {
    const { llamar, llamadas } = llamarDoble({ getVisibleJiraProjects: PROYECTOS });
    const g = crearGestorJira(llamar);
    expect(await g.proyectos("cloud-1")).toEqual([{ clave: "IXCODE", nombre: "xonecode" }]);
    // 50, no más: el esquema de la tool declara `maximum: 50` y rechaza 100 con un -32602.
    expect(llamadas[0]).toEqual({ nombre: "getVisibleJiraProjects", args: { cloudId: "cloud-1", maxResults: 50, startAt: 0 } });
    expect(llamadas).toHaveLength(1);
  });

  it("proyectos() sigue las páginas con startAt hasta isLast", async () => {
    const proyecto = (n: number) => ({ id: String(n), key: `P${n}`, name: `Proyecto ${n}` });
    const paginas = [
      { values: Array.from({ length: 50 }, (_, i) => proyecto(i)), isLast: false },
      { values: [proyecto(50), proyecto(51)], isLast: true },
    ];
    const llamadas: Record<string, unknown>[] = [];
    const llamar = vi.fn(async (_nombre: string, args: Record<string, unknown>) => {
      llamadas.push(args);
      return JSON.stringify(paginas[llamadas.length - 1]);
    });
    const lista = await crearGestorJira(llamar).proyectos("cloud-1");
    expect(lista).toHaveLength(52);
    expect(lista[51]).toEqual({ clave: "P51", nombre: "Proyecto 51" });
    expect(llamadas.map((a) => a.startAt)).toEqual([0, 50]);
    expect(llamadas.every((a) => a.maxResults === 50)).toBe(true);
  });

  it("proyectos() no se queda en bucle si Jira nunca dice isLast", async () => {
    const llamar = vi.fn(async () => JSON.stringify({ values: [{ id: "1", key: "A1", name: "a" }], isLast: false }));
    await crearGestorJira(llamar).proyectos("cloud-1");
    expect(llamar.mock.calls.length).toBeLessThanOrEqual(20);
  });
});

describe("pendientes", () => {
  it("llama a searchJiraIssuesUsingJql con la JQL de jqlDePendientes y los campos justos", async () => {
    const { llamar, llamadas } = llamarDoble({ searchJiraIssuesUsingJql: ISSUES });
    const g = crearGestorJira(llamar);
    const tareas = await g.pendientes(V);
    expect(llamadas[0]).toEqual({
      nombre: "searchJiraIssuesUsingJql",
      args: {
        cloudId: "cloud-1",
        jql: 'project = "IXCODE" AND statusCategory != Done ORDER BY updated DESC',
        // El máximo de la tool: el panel filtra y cuenta en el cliente sobre esta lista.
        maxResults: 100,
        fields: ["summary", "status", "assignee"],
      },
    });
    expect(tareas).toEqual([
      { clave: "IXCODE-11", titulo: "Panel del proyecto", estado: "En curso", categoria: "en-curso", asignado: "Sergio Leiva" },
      { clave: "IXCODE-12", titulo: "Sin asignar", estado: "Por hacer", categoria: "por-hacer" },
    ]);
  });

  it("nunca deja escapar emailAddress ni accountId del assignee", async () => {
    const { llamar } = llamarDoble({ searchJiraIssuesUsingJql: ISSUES });
    const g = crearGestorJira(llamar);
    const tareas = await g.pendientes(V);
    const cable = JSON.stringify(tareas);
    expect(cable).not.toContain("@");
    expect(cable).not.toContain("sleiva");
    expect(cable).not.toContain("abc123");
  });

  it("compone la url con la del sitio (cacheada por sitios())", async () => {
    const { llamar } = llamarDoble({ getAccessibleAtlassianResources: SITIOS, searchJiraIssuesUsingJql: ISSUES });
    const g = crearGestorJira(llamar);
    await g.sitios();
    const tareas = await g.pendientes(V);
    expect(tareas[0].url).toBe("https://xone.atlassian.net/browse/IXCODE-11");
  });

  it("sin haber pedido sitios() antes, la url queda ausente (no se inventa)", async () => {
    const { llamar } = llamarDoble({ searchJiraIssuesUsingJql: ISSUES });
    const g = crearGestorJira(llamar);
    const tareas = await g.pendientes(V);
    expect(tareas[0].url).toBeUndefined();
  });

  it("una clave de proyecto inválida lanza SIN llamar", async () => {
    const { llamar } = llamarDoble({ searchJiraIssuesUsingJql: ISSUES });
    const g = crearGestorJira(llamar);
    await expect(g.pendientes({ ...V, proyecto: "ixcode minúsculas" })).rejects.toThrow(/proyecto/);
    expect(llamar).not.toHaveBeenCalled();
  });

  it("pasa el texto de búsqueda a jqlDePendientes", async () => {
    const { llamar, llamadas } = llamarDoble({ searchJiraIssuesUsingJql: ISSUES });
    const g = crearGestorJira(llamar);
    await g.pendientes(V, "panel");
    expect((llamadas[0].args as { jql: string }).jql).toContain('text ~ "panel"');
  });

  it("«asignadas a mí» llega a la JQL como currentUser(), sin ningún dato de la persona", async () => {
    const { llamar, llamadas } = llamarDoble({ searchJiraIssuesUsingJql: ISSUES });
    const g = crearGestorJira(llamar);
    await g.pendientes(V, "panel", { mias: true });
    expect((llamadas[0].args as { jql: string }).jql).toBe(
      'project = "IXCODE" AND statusCategory != Done AND assignee = currentUser() AND text ~ "panel" ORDER BY updated DESC'
    );
  });
});

describe("ficha", () => {
  it("lee getJiraIssue con los campos declarados y descripcion es la del issue", async () => {
    const { llamar, llamadas } = llamarDoble({ getJiraIssue: ISSUE });
    const g = crearGestorJira(llamar);
    const f = await g.ficha(V, "IXCODE-11");
    expect(llamadas[0]).toEqual({
      nombre: "getJiraIssue",
      args: { cloudId: "cloud-1", issueIdOrKey: "IXCODE-11", fields: ["summary", "status", "assignee", "description"] },
    });
    expect(f).toEqual({
      clave: "IXCODE-11",
      titulo: "Panel del proyecto",
      estado: "En curso",
      categoria: "en-curso",
      asignado: "Sergio Leiva",
      descripcion: "El **plan** completo",
    });
  });

  it("una descripción ausente da cadena vacía, no undefined", async () => {
    const { llamar } = llamarDoble({ getJiraIssue: { ...ISSUE, fields: { ...ISSUE.fields, description: undefined } } });
    const g = crearGestorJira(llamar);
    const f = await g.ficha(V, "IXCODE-11");
    expect(f.descripcion).toBe("");
  });
});

describe("transiciones", () => {
  it("filtra las isAvailable === false y traduce categoria", async () => {
    const { llamar, llamadas } = llamarDoble({ getTransitionsForJiraIssue: TRANSICIONES });
    const g = crearGestorJira(llamar);
    const ts = await g.transiciones(V, "IXCODE-11");
    expect(llamadas[0]).toEqual({ nombre: "getTransitionsForJiraIssue", args: { cloudId: "cloud-1", issueIdOrKey: "IXCODE-11" } });
    expect(ts).toEqual([
      { id: "21", nombre: "Empezar", destino: "En curso", categoria: "en-curso" },
      { id: "41", nombre: "Probar", destino: "Probar", categoria: "en-curso" },
    ]);
  });
});

describe("escrituras", () => {
  it("transicionar llama a transitionJiraIssue con transition.id", async () => {
    const { llamar, llamadas } = llamarDoble({ transitionJiraIssue: {} });
    const g = crearGestorJira(llamar);
    await g.transicionar(V, "IXCODE-11", "21");
    expect(llamadas[0]).toEqual({
      nombre: "transitionJiraIssue",
      args: { cloudId: "cloud-1", issueIdOrKey: "IXCODE-11", transition: { id: "21" } },
    });
  });

  it("comentar llama a addCommentToJiraIssue con contentFormat markdown", async () => {
    const { llamar, llamadas } = llamarDoble({ addCommentToJiraIssue: {} });
    const g = crearGestorJira(llamar);
    await g.comentar(V, "IXCODE-11", "hola");
    expect(llamadas[0]).toEqual({
      nombre: "addCommentToJiraIssue",
      args: { cloudId: "cloud-1", issueIdOrKey: "IXCODE-11", commentBody: "hola", contentFormat: "markdown" },
    });
  });
});

describe("respuestas raras", () => {
  it("un texto que no es JSON lanza con el nombre de la tool, nunca una lista vacía", async () => {
    const llamar = vi.fn(async () => "no es json");
    const g = crearGestorJira(llamar);
    await expect(g.sitios()).rejects.toThrow("Jira contestó algo que no se entiende (getAccessibleAtlassianResources)");
  });

  it("un JSON que no es la forma esperada (falta issues) también lanza", async () => {
    const { llamar } = llamarDoble({ searchJiraIssuesUsingJql: { algoDistinto: true } });
    const g = crearGestorJira(llamar);
    await expect(g.pendientes(V)).rejects.toThrow(/no se entiende/);
  });

  it("una lista JSON válida pero no un objeto también lanza en sitios()", async () => {
    const llamar = vi.fn(async () => JSON.stringify("una cadena"));
    const g = crearGestorJira(llamar);
    await expect(g.sitios()).rejects.toThrow(/no se entiende/);
  });

  it("un getJiraIssue malformado lanza nombrando SU tool, no la de otra operación", async () => {
    const { llamar } = llamarDoble({ getJiraIssue: { key: "IXCODE-11", fields: { status: {} } } });
    const g = crearGestorJira(llamar);
    await expect(g.ficha(V, "IXCODE-11")).rejects.toThrow("Jira contestó algo que no se entiende (getJiraIssue)");
  });
});
