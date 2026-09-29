import { describe, expect, it, vi } from "vitest";
import { comentarioParaNotion, crearGestorNotion, descripcionDePagina, esquemaDeFetch, TOPE_DE_DESCRIPCION } from "./gestorNotion.js";
import { comentarioDeCierre, transicionPropuesta, type Vinculo } from "../../core/gestorDeTareas.js";

/**
 * Las formas MEDIDAS contra `https://mcp.notion.com/mcp` (29-09-2026, IXCODE-15), recortadas a lo
 * que el adaptador lee. Los nombres de persona y los correos son inventados: la medida solo guardó
 * la ESTRUCTURA.
 */
const FUENTE = "collection://ea517d0b-bf30-4b08-8681-dc9c30f5e783";
const BASE = "06aeb13b-13aa-442f-876d-55626fa55b9f";
const PAGINA = "087e117f-9478-4c60-871d-b5d76c2a7e30";
const YO = "47b38fa1-cb9d-4dd5-acdb-f23e9ed54a28";
const ANA = "d6d7b31c-7e3b-4a5c-afc0-71f0167f1d50";

const ESTADO_DE_FUENTE = {
  icon: "/icons/cursor-click_gray.svg",
  name: "Tasks",
  schema: {
    Assigned: { description: "", name: "Assigned", type: "person" },
    Due: { description: "", name: "Due", type: "date" },
    Name: { description: "", name: "Name", type: "title" },
    "Parent task": { dataSourceUrl: FUENTE, name: "Parent task", type: "relation" },
    Status: {
      description: "",
      groups: {
        complete: [{ color: "green", description: "", name: "Done", url: "collectionPropertyOption://x/1" }],
        current: [],
        future: [],
        in_progress: [{ color: "blue", description: "", name: "In progress", url: "collectionPropertyOption://x/2" }],
        to_do: [{ description: "", name: "Not started", url: "collectionPropertyOption://x/3" }],
      },
      name: "Status",
      type: "status",
    },
  },
  url: FUENTE,
};

const fuenteEnTexto = (estado: unknown) =>
  `<data-source url="{{${FUENTE}}}">\nThe title of this Data Source is: Tasks\n<data-source-state>\n${JSON.stringify(estado)}\n</data-source-state>\n<sqlite-table>…</sqlite-table>\n</data-source>`;

const FETCH_BASE = {
  metadata: { type: "database" },
  title: "Tasks",
  url: `https://app.notion.com/p/${BASE.replace(/-/g, "")}?pvs=204`,
  text: `<database url="{{https://app.notion.com/p/x}}" inline="true">\nThe title of this Database is: Tasks\n<data-sources>\n${fuenteEnTexto(ESTADO_DE_FUENTE)}\n</data-sources>\n<views>…</views>\n</database>`,
};

const FETCH_FUENTE = { metadata: { type: "data_source" }, title: "Tasks", url: FETCH_BASE.url, text: fuenteEnTexto(ESTADO_DE_FUENTE) };

/** Medido: «My Tasks» es una base sin data source propio; su fetch solo trae vistas. */
const FETCH_VISTA = {
  metadata: { type: "database" },
  title: "My Tasks",
  url: "https://app.notion.com/p/1bd9…",
  text: '<database url="{{https://app.notion.com/p/1bd9}}" inline="false">\n<views>\n<view url="{{view://c10d}}">\n{"dataSourceUrl":""}\n</view>\n</views>\n</database>',
};

const SEARCH = {
  results: [
    { id: BASE, title: "Tasks", url: "https://app.notion.com/p/06aeb13b?pvs=204", type: "database", timestamp: "2024-06-10T07:58:00.000Z", path: "Hypergraph / Projects & Tasks", verification: { state: "unverified" } },
    { id: "8abf497d-5c0f-4529-bfde-d6f9a851340c", title: "Projects & Tasks", url: "https://app.notion.com/p/8abf", type: "page", path: "Hypergraph" },
    { id: "37889791-ec6c-4bc1-b49c-6f4b922e7417", title: "Hypergraph", url: "https://app.notion.com/p/3788", type: "database" },
  ],
  type: "workspace_search",
};

const QUERY = {
  results: [
    { id: "ca8b3e28-d89c-4b37-a819-66f6b571f11c", url: "https://app.notion.com/ca8b3e28d89c4b37a81966f6b571f11c", Status: "In progress", Name: "Model to production", Assigned: `["user://${ANA}"]` },
    { id: "909ed273-8725-4638-99ee-99081ceda6e0", url: "https://app.notion.com/909ed2738725463899ee99081ceda6e0", Status: null, Name: "", Assigned: null },
  ],
  has_more: false,
  data_source_ids: ["ea517d0b-bf30-4b08-8681-dc9c30f5e783"],
};

const USUARIOS = {
  results: [
    { type: "person", id: YO, name: "Sergio", email: "yo@example.com" },
    { type: "person", id: ANA, name: "Ana Pérez", email: "ana@example.com" },
    { type: "bot", id: "b0b0b0b0-0000-4000-8000-000000000000", name: "Integración" },
  ],
  has_more: false,
};

const FETCH_PAGINA = {
  metadata: { type: "page" },
  title: "Model to production",
  url: `https://app.notion.com/p/${PAGINA.replace(/-/g, "")}?pvs=204`,
  text: `Here is the result of "fetch" for the Page…\n<page url="https://app.notion.com/p/087e">\n<ancestor-path>\n<parent-data-source url="${FUENTE}" name="Tasks"/>\n<ancestor-2-database url="https://app.notion.com/p/06ae" title=""/>\n</ancestor-path>\n<properties>\n${JSON.stringify({
    Assigned: [`<mention-user url="user://${ANA}"></mention-user>`],
    Name: "Model to production",
    Status: "In progress",
    url: "https://app.notion.com/p/087e",
  })}\n</properties>\n<iconMetadata>null</iconMetadata>\n<content>\n<empty-block/>\n## Plan\n---\n- paso **uno**\n<empty-block/>\n</content>\n</page>`,
};

const V: Vinculo = { conector: "notion", sitio: "notion", proyecto: FUENTE };

function llamarDoble(respuestas: Record<string, unknown | ((args: Record<string, unknown>) => unknown)>) {
  const llamadas: { nombre: string; args: Record<string, unknown> }[] = [];
  const llamar = vi.fn(async (nombre: string, args: Record<string, unknown>) => {
    llamadas.push({ nombre, args });
    if (!(nombre in respuestas)) throw new Error(`sin fixture para ${nombre}`);
    const r = respuestas[nombre];
    return JSON.stringify(typeof r === "function" ? (r as (a: Record<string, unknown>) => unknown)(args) : r);
  });
  return { llamar, llamadas, de: (n: string) => llamadas.filter((l) => l.nombre === n) };
}

const fetchPor = (args: Record<string, unknown>) => (args.id === PAGINA ? FETCH_PAGINA : args.id === FUENTE ? FETCH_FUENTE : args.id === BASE ? FETCH_BASE : FETCH_VISTA);
const usuarios = (args: Record<string, unknown>) => (args.user_id === "self" ? { results: [USUARIOS.results[0]], has_more: false } : USUARIOS);

describe("buscar y describir", () => {
  it("sitios() es LOCAL: un espacio por cuenta, sin llamada", async () => {
    const { llamar } = llamarDoble({});
    expect(await crearGestorNotion(llamar).sitios()).toEqual([{ id: "notion", nombre: "Notion" }]);
    expect(llamar).not.toHaveBeenCalled();
  });

  it("proyectos() LANZA con un motivo: una lista vacía diría que no hay bases", async () => {
    await expect(crearGestorNotion(llamarDoble({}).llamar).proyectos("notion")).rejects.toThrow("se buscan por nombre");
  });

  it("buscarProyectos() pide notion-search y se queda SOLO con las bases, con su ruta si la hay", async () => {
    const { llamar, de } = llamarDoble({ "notion-search": SEARCH });
    expect(await crearGestorNotion(llamar).buscarProyectos!("  task ")).toEqual([
      { proyecto: BASE, nombre: "Tasks", ruta: "Hypergraph / Projects & Tasks" },
      { proyecto: "37889791-ec6c-4bc1-b49c-6f4b922e7417", nombre: "Hypergraph" },
    ]);
    expect(de("notion-search")[0]!.args).toEqual({ query: "task", query_type: "internal", page_size: 50, max_highlight_length: 0 });
  });

  it("buscarProyectos() con texto vacío no llama y lo dice", async () => {
    const { llamar } = llamarDoble({});
    await expect(crearGestorNotion(llamar).buscarProyectos!("   ")).rejects.toThrow("escribe algo");
    expect(llamar).not.toHaveBeenCalled();
  });

  it("describir una BASE resuelve su data source y entiende estado, título y asignado", async () => {
    const { llamar, de } = llamarDoble({ "notion-fetch": fetchPor });
    expect(await crearGestorNotion(llamar).describirProyecto!({ ...V, proyecto: BASE })).toEqual({
      esquema: {
        proyecto: FUENTE,
        nombre: "Tasks",
        estado: {
          propiedad: "Status",
          opciones: [
            { nombre: "Not started", categoria: "por-hacer" },
            { nombre: "In progress", categoria: "en-curso" },
            { nombre: "Done", categoria: "terminada" },
          ],
        },
        titulo: "Name",
        asignado: "Assigned",
      },
    });
    expect(de("notion-fetch")[0]!.args).toEqual({ id: BASE });
  });

  it("describir un DATA SOURCE también vale (es lo que queda vinculado)", async () => {
    const { llamar } = llamarDoble({ "notion-fetch": fetchPor });
    const d = await crearGestorNotion(llamar).describirProyecto!(V);
    expect("esquema" in d && d.esquema.proyecto).toBe(FUENTE);
  });

  it("una referencia que no es de Notion NO se pide", async () => {
    const { llamar } = llamarDoble({});
    await expect(crearGestorNotion(llamar).describirProyecto!({ ...V, proyecto: "https://evil.example" })).rejects.toThrow("no es una base");
    expect(llamar).not.toHaveBeenCalled();
  });

  it("una base sin data source propio (medido: «My Tasks») se describe con su MOTIVO", async () => {
    const { llamar } = llamarDoble({ "notion-fetch": FETCH_VISTA });
    expect(await crearGestorNotion(llamar).describirProyecto!({ ...V, proyecto: "1bd92005-83d0-451e-8771-c7e2c2b398d1" })).toEqual({
      motivo: "esta base no tiene un data source propio (es una vista)",
    });
  });

  it("sin propiedad de estado o de título, el motivo; sin persona, sin asignado", () => {
    const { Status: _s, ...sinEstado } = ESTADO_DE_FUENTE.schema;
    expect(esquemaDeFetch("t", fuenteEnTexto({ ...ESTADO_DE_FUENTE, schema: sinEstado }))).toEqual({ motivo: "esta base no tiene una propiedad de estado" });
    const { Name: _n, ...sinTitulo } = ESTADO_DE_FUENTE.schema;
    expect(esquemaDeFetch("t", fuenteEnTexto({ ...ESTADO_DE_FUENTE, schema: sinTitulo }))).toEqual({ motivo: "esta base no tiene una propiedad de título" });
    const { Assigned: _a, ...sinPersona } = ESTADO_DE_FUENTE.schema;
    const d = esquemaDeFetch("t", fuenteEnTexto({ ...ESTADO_DE_FUENTE, schema: sinPersona }));
    expect("esquema" in d).toBe(true);
    expect("esquema" in d && "asignado" in d.esquema).toBe(false);
  });

  it("con VARIOS data sources usa el primero y dice cuántos hay", () => {
    const d = esquemaDeFetch("t", `${fuenteEnTexto(ESTADO_DE_FUENTE)}\n${fuenteEnTexto({ ...ESTADO_DE_FUENTE, url: "collection://00000000-0000-4000-8000-000000000000" })}`);
    expect("esquema" in d && d.esquema.proyecto).toBe(FUENTE);
    expect("esquema" in d && d.esquema.fuentes).toBe(2);
  });

  it.each([
    ["no es JSON", "hola"],
    ["un JSON sin metadata", JSON.stringify({ title: "x" })],
  ])("una respuesta que no se entiende LANZA con el nombre de la tool (%s)", async (_c, bruto) => {
    const llamar = vi.fn(async () => bruto);
    await expect(crearGestorNotion(llamar).describirProyecto!(V)).rejects.toThrow("Notion contestó algo que no se entiende (notion-fetch)");
  });

  it("un data source cuyo estado no trae una URL collection:// no se entiende", () => {
    expect(() => esquemaDeFetch("notion-fetch", fuenteEnTexto({ ...ESTADO_DE_FUENTE, url: "https://x" }))).toThrow("no se entiende (notion-fetch)");
  });
});

describe("pendientes", () => {
  it("pide el SQL con params al data source, y del asignado solo el NOMBRE", async () => {
    const { llamar, de } = llamarDoble({ "notion-fetch": fetchPor, "notion-query-data-sources": QUERY, "notion-get-users": usuarios });
    const lista = await crearGestorNotion(llamar).pendientes(V, "model");
    expect(lista).toEqual([
      {
        clave: "ca8b3e28-d89c-4b37-a819-66f6b571f11c",
        etiqueta: "ca8b3e28",
        titulo: "Model to production",
        estado: "In progress",
        categoria: "en-curso",
        asignado: "Ana Pérez",
        url: "https://app.notion.com/ca8b3e28d89c4b37a81966f6b571f11c",
      },
      {
        clave: "909ed273-8725-4638-99ee-99081ceda6e0",
        etiqueta: "909ed273",
        titulo: "Sin título",
        estado: "Sin estado",
        categoria: "por-hacer",
        url: "https://app.notion.com/909ed2738725463899ee99081ceda6e0",
      },
    ]);
    const q = de("notion-query-data-sources")[0]!.args as { data: { data_source_urls: string[]; query: string; params: string[] } };
    expect(q.data.data_source_urls).toEqual([FUENTE]);
    expect(q.data.params).toEqual(["Done", "%model%"]);
    expect(q.data.query).not.toContain("model");
    expect(JSON.stringify(lista)).not.toContain("@");
  });

  it("un asignado que no se resuelve queda AUSENTE, nunca el id; un fallo de usuarios no tumba la lista", async () => {
    const { llamar } = llamarDoble({
      "notion-fetch": fetchPor,
      "notion-query-data-sources": QUERY,
      "notion-get-users": () => { throw new Error("caído"); },
    });
    const lista = await crearGestorNotion(llamar).pendientes(V);
    expect(lista[0]!.asignado).toBeUndefined();
    expect(JSON.stringify(lista)).not.toContain(ANA);
  });

  it("el esquema se pide UNA vez y se reutiliza; un SQL que falla lo TIRA", async () => {
    let falla = true;
    const { llamar, de } = llamarDoble({
      "notion-fetch": fetchPor,
      "notion-get-users": usuarios,
      "notion-query-data-sources": () => {
        if (falla) { falla = false; throw new Error("no such column"); }
        return QUERY;
      },
    });
    const g = crearGestorNotion(llamar);
    await expect(g.pendientes(V)).rejects.toThrow();
    await g.pendientes(V);
    await g.pendientes(V);
    expect(de("notion-fetch")).toHaveLength(2);
  });

  it("«mías» pregunta quién es «self» y filtra por su id, por parámetro", async () => {
    const { llamar, de } = llamarDoble({ "notion-fetch": fetchPor, "notion-query-data-sources": QUERY, "notion-get-users": usuarios });
    await crearGestorNotion(llamar).pendientes(V, undefined, { mias: true });
    expect(de("notion-get-users")[0]!.args).toEqual({ user_id: "self" });
    const q = de("notion-query-data-sources")[0]!.args as { data: { query: string; params: string[] } };
    expect(q.data.params).toContain(`%user://${YO}%`);
    expect(q.data.query).toContain(`"Assigned" LIKE ?`);
  });

  it("«mías» sobre una base sin persona LANZA con motivo, sin consultar", async () => {
    const { Assigned: _a, ...sinPersona } = ESTADO_DE_FUENTE.schema;
    const { llamar, de } = llamarDoble({ "notion-fetch": { ...FETCH_FUENTE, text: fuenteEnTexto({ ...ESTADO_DE_FUENTE, schema: sinPersona }) } });
    const g = crearGestorNotion(llamar);
    await expect(g.pendientes(V, undefined, { mias: true })).rejects.toThrow("no tiene una propiedad de persona");
    expect(de("notion-query-data-sources")).toHaveLength(0);
  });

  it("un vínculo que no es un data source no se consulta", async () => {
    const { llamar } = llamarDoble({});
    await expect(crearGestorNotion(llamar).pendientes({ ...V, proyecto: "IXCODE" })).rejects.toThrow("collection://");
    expect(llamar).not.toHaveBeenCalled();
  });

  it("una respuesta de filas sin forma LANZA, nunca lista vacía", async () => {
    const { llamar } = llamarDoble({ "notion-fetch": fetchPor, "notion-query-data-sources": { rows: [] } });
    await expect(crearGestorNotion(llamar).pendientes(V)).rejects.toThrow("no se entiende (notion-query-data-sources)");
  });
});

describe("ficha", () => {
  it("lee la página: propiedades, asignado por NOMBRE, y la descripción es su contenido", async () => {
    const { llamar } = llamarDoble({ "notion-fetch": fetchPor, "notion-get-users": usuarios });
    expect(await crearGestorNotion(llamar).ficha(V, PAGINA)).toEqual({
      clave: PAGINA,
      etiqueta: "087e117f",
      titulo: "Model to production",
      estado: "In progress",
      categoria: "en-curso",
      asignado: "Ana Pérez",
      url: FETCH_PAGINA.url,
      descripcion: "## Plan\n---\n- paso **uno**",
    });
  });

  it("una página de OTRA base no se abre como tarea del proyecto", async () => {
    const { llamar } = llamarDoble({ "notion-fetch": fetchPor });
    await expect(crearGestorNotion(llamar).ficha({ ...V, proyecto: "collection://00000000-0000-4000-8000-000000000000" }, PAGINA)).rejects.toThrow("no es de la base vinculada");
  });

  it("una clave que no es un id de página no se pide", async () => {
    const { llamar } = llamarDoble({});
    await expect(crearGestorNotion(llamar).ficha(V, "IXCODE-11")).rejects.toThrow("no es una página de Notion");
    expect(llamar).not.toHaveBeenCalled();
  });

  it("descripcionDePagina: en blanco es vacío, y lo largo se recorta", () => {
    expect(descripcionDePagina("<page>\n<blank-page>This page is blank.</blank-page>\n</page>")).toBe("");
    const largo = descripcionDePagina(`<content>\n${"x".repeat(TOPE_DE_DESCRIPCION + 50)}\n</content>`);
    expect(largo).toHaveLength(TOPE_DE_DESCRIPCION + 1);
    expect(largo.endsWith("…")).toBe(true);
  });
});

describe("transiciones, transicionar y comentar", () => {
  it("las transiciones son las OPCIONES del estado, con su nombre como id; la propuesta sigue valiendo", async () => {
    const { llamar } = llamarDoble({ "notion-fetch": fetchPor });
    const ts = await crearGestorNotion(llamar).transiciones(V, PAGINA);
    expect(ts).toEqual([
      { id: "Not started", nombre: "Not started", destino: "Not started", categoria: "por-hacer" },
      { id: "In progress", nombre: "In progress", destino: "In progress", categoria: "en-curso" },
      { id: "Done", nombre: "Done", destino: "Done", categoria: "terminada" },
    ]);
    expect(transicionPropuesta(ts, "empezar")?.id).toBe("In progress");
    expect(transicionPropuesta(ts, "cerrar")?.id).toBe("Done");
  });

  it("CERRAR con el proyecto ya desvinculado (`proyecto: \"\"`): el data source sale de la PROPIA página", async () => {
    const { llamar, de } = llamarDoble({ "notion-fetch": fetchPor, "notion-update-page": { ok: true } });
    const g = crearGestorNotion(llamar);
    const huerfano = { ...V, proyecto: "" };
    expect((await g.transiciones(huerfano, PAGINA)).map((t) => t.id)).toContain("Done");
    await g.transicionar(huerfano, PAGINA, "Done");
    expect(de("notion-update-page")[0]!.args).toEqual({ page_id: PAGINA, command: "update_properties", properties: { Status: "Done" } });
    // La página y su esquema se preguntan una vez, no en cada paso.
    expect(de("notion-fetch").map((l) => l.args.id)).toEqual([PAGINA, FUENTE]);
  });

  it("transicionar a un estado que la base NO tiene no escribe", async () => {
    const { llamar, de } = llamarDoble({ "notion-fetch": fetchPor, "notion-update-page": {} });
    await expect(crearGestorNotion(llamar).transicionar(V, PAGINA, "Inventado")).rejects.toThrow("no es un estado de esa base");
    expect(de("notion-update-page")).toHaveLength(0);
  });

  it("comentar manda a notion-create-comment el texto PASADO por comentarioParaNotion", async () => {
    const { llamar, de } = llamarDoble({ "notion-create-comment": { ok: true } });
    await crearGestorNotion(llamar).comentar(V, PAGINA, "## Qué cambió\n\n- a");
    expect(de("notion-create-comment")[0]!.args).toEqual({ page_id: PAGINA, markdown: "Qué cambió:\n\n• a" });
  });

  it("comentarioParaNotion: solo los marcadores de bloque; mismas líneas, mismo orden, lo de dentro de la línea intacto", () => {
    const md = comentarioDeCierre({
      ficheros: [{ ruta: "app.xne", clase: "modificado" }, { ruta: "js/a.js", clase: "nuevo" }],
      commits: ["abcdef1234"],
      veredicto: { verde: false, errores: 2, avisos: 0 },
      resumen: "Hecho **casi** todo:\n- uno\n  * dos",
    });
    const n = comentarioParaNotion(md);
    expect(n.split("\n")).toHaveLength(md.split("\n").length);
    expect(n).toBe(
      [
        "Qué cambió:", "", "• `app.xne` (modificado)", "• `js/a.js` (nuevo)", "", "Commits: `abcdef1`", "",
        "Verificación:", "", "en rojo: 2 errores", "",
        "Resumen:", "", "Hecho **casi** todo:", "• uno", "  • dos", "",
        "— escrito por xonecode",
      ].join("\n"),
    );
    // Un título que ya acaba en «:» no se dobla; `**x**` no es una lista; `---` tampoco.
    expect(comentarioParaNotion("# Plan:\n**negrita**\n---\n#sin espacio")).toBe("Plan:\n**negrita**\n---\n#sin espacio");
  });
});
