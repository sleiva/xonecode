/**
 * El adaptador de Jira sobre `GestorDeTareasPort` (`core/gestorDeTareas.ts`): el ÚNICO fichero
 * que conoce los nombres de las tools de Jira y la forma de sus respuestas — nada fuera de aquí
 * sabe que el gestor de tareas es Jira.
 *
 * Llama al conector MCP por `llamar(nombre, args)` (el mismo `ServicioDeConectores.llamar`, ya
 * atado a `"jira"` por quien construye este gestor): devuelve el TEXTO del primer bloque
 * `type: "text"` del resultado. Este fichero solo hace `JSON.parse` de ese texto y lee sus
 * campos a mano — nunca `@modelcontextprotocol` (`core/` no lo importa, y este fichero tampoco
 * lo necesita).
 *
 * Lectura defensiva por campo, como `planesDelCable.ts` en el cliente: una respuesta que no es
 * el JSON esperado LANZA, nunca vuelve como lista vacía (una lista vacía es un dato — «no hay
 * pendientes» — y confundirlo con «no entendí la respuesta» esconde un fallo).
 *
 * Del `assignee` de Jira solo sale `displayName`: `emailAddress` y `accountId` no cruzan este
 * adaptador (y por tanto no cruzan el cable).
 */
import {
  categoriaDeEstado, jqlDePendientes, motivoDeClaveDeProyecto,
  type ComentarioDelGestor, type EstadoDelGestor, type FichaDelGestor, type GestorDeTareasPort, type NuevaTareaEnElGestor,
  type OpcionesDePendientes, type TareaDelGestor, type TransicionDelGestor, type Vinculo,
} from "../../core/gestorDeTareas.js";

type Llamar = (nombre: string, args: Record<string, unknown>) => Promise<string>;

/** El JSON del texto de una tool, o el error de «no se entiende» con el nombre de la tool que lo dio. */
function json(tool: string, texto: string): unknown {
  try {
    return JSON.parse(texto);
  } catch {
    throw new Error(`Jira contestó algo que no se entiende (${tool})`);
  }
}

function objeto(tool: string, valor: unknown): Record<string, unknown> {
  if (typeof valor !== "object" || valor === null) throw new Error(`Jira contestó algo que no se entiende (${tool})`);
  return valor as Record<string, unknown>;
}

function texto(tool: string, valor: unknown): string {
  if (typeof valor !== "string") throw new Error(`Jira contestó algo que no se entiende (${tool})`);
  return valor;
}

function lista(tool: string, valor: unknown): unknown[] {
  if (!Array.isArray(valor)) throw new Error(`Jira contestó algo que no se entiende (${tool})`);
  return valor;
}

/** Solo el `displayName`: `emailAddress` y `accountId` del `assignee` NUNCA salen de aquí. */
function nombreDelAsignado(valor: unknown): string | undefined {
  if (typeof valor !== "object" || valor === null) return undefined;
  const d = (valor as Record<string, unknown>).displayName;
  return typeof d === "string" ? d : undefined;
}

function tareaDesdeIssue(tool: string, issue: Record<string, unknown>, urlDelSitio: string | undefined): TareaDelGestor {
  const clave = texto(tool, issue.key);
  const fields = objeto(tool, issue.fields);
  const status = objeto(tool, fields.status);
  const statusCategory = typeof status.statusCategory === "object" && status.statusCategory !== null
    ? (status.statusCategory as Record<string, unknown>)
    : undefined;
  const asignado = nombreDelAsignado(fields.assignee);
  return {
    clave,
    titulo: texto(tool, fields.summary),
    estado: texto(tool, status.name),
    categoria: categoriaDeEstado(typeof statusCategory?.key === "string" ? statusCategory.key : undefined),
    ...(asignado !== undefined ? { asignado } : {}),
    ...(urlDelSitio !== undefined ? { url: `${urlDelSitio}/browse/${clave}` } : {}),
  };
}

/**
 * El tipo de incidencia con el que se CREA una tarea, elegido de lo que el proyecto declara
 * (`getJiraProjectIssueTypesMetadata`). Medido sobre un Jira en español: `name` viene TRADUCIDO («Tarea») y
 * `untranslatedName` es el de siempre («Task»), así que escribir «Task» a fuego no vale. Regla: un tipo de nivel 0
 * (ni épica ni subtarea), con «Task» primero, y si no el primero de nivel 0; se devuelve su `name`, que es como el
 * proyecto lo llama. Sin ninguno de nivel 0, `undefined` (y crear lo dice).
 */
export function tipoParaCrear(respuesta: unknown): string | undefined {
  if (typeof respuesta !== "object" || respuesta === null) return undefined;
  const tipos = (respuesta as Record<string, unknown>).issueTypes;
  if (!Array.isArray(tipos)) return undefined;
  const validos = tipos
    .filter((t): t is Record<string, unknown> => typeof t === "object" && t !== null)
    .filter((t) => typeof t.name === "string" && t.subtask !== true && (t.hierarchyLevel === undefined || t.hierarchyLevel === 0));
  const tarea = validos.find((t) => t.untranslatedName === "Task" || t.name === "Task");
  return (tarea ?? validos[0])?.name as string | undefined;
}

/**
 * La clave de la incidencia recién creada. La respuesta de `createJiraIssue` es la de la API de Jira (`{id, key,
 * self}`) o la incidencia entera; en las dos, `key` en la raíz. Sin ella se LANZA: el ticket puede existir, pero sin
 * clave no hay a qué ligar la tarea, y quien llama lo dice.
 */
export function claveCreada(respuesta: unknown): string {
  const clave = typeof respuesta === "object" && respuesta !== null ? (respuesta as Record<string, unknown>).key : undefined;
  if (typeof clave !== "string" || clave === "") throw new Error("Jira creó la tarea pero no dijo su clave (createJiraIssue)");
  return clave;
}

/**
 * `crearGestorJira`: cada instancia cachea la url pública de cada `sitio` (`cloudId`) que
 * `sitios()` haya devuelto, para poder componer `url = <url del sitio>/browse/<clave>` sin
 * volver a preguntar. Un sitio nunca visto por esta instancia deja `url` AUSENTE — no se
 * inventa una URL a partir del `cloudId`.
 */
/** El máximo que admite `getVisibleJiraProjects` por llamada (medido en su esquema). */
export const PROYECTOS_POR_PAGINA = 50;
/**
 * Cuántas pendientes se piden de una vez: el máximo que admite `searchJiraIssuesUsingJql`. El panel
 * FILTRA por estado y CUENTA en el cliente sobre esta lista, así que cuanto más entera llegue,
 * menos mienten los números de las pastillas.
 */
export const PENDIENTES_POR_CONSULTA = 100;
/** Cuántas páginas de proyectos se piden como mucho: 1000 proyectos. */
const TOPE_DE_PAGINAS_DE_PROYECTOS = 20;

export function crearGestorJira(llamar: Llamar): GestorDeTareasPort {
  const urlPorSitio = new Map<string, string>();

  async function sitios(): Promise<{ id: string; nombre: string; url?: string }[]> {
    const cuerpo = json("getAccessibleAtlassianResources", await llamar("getAccessibleAtlassianResources", {}));
    return lista("getAccessibleAtlassianResources", cuerpo).map((f) => {
      const x = objeto("getAccessibleAtlassianResources", f);
      const id = texto("getAccessibleAtlassianResources", x.id);
      const url = texto("getAccessibleAtlassianResources", x.url);
      urlPorSitio.set(id, url);
      return { id, nombre: texto("getAccessibleAtlassianResources", x.name), url };
    });
  }

  /**
   * Los proyectos visibles, por PÁGINAS: la tool admite como mucho `PROYECTOS_POR_PAGINA` por
   * llamada (su esquema declara `maximum: 50` y rechaza más con un -32602; se pidió 100 y el panel
   * enseñó el error) y pagina con `startAt`. Se sigue hasta `isLast` o una página vacía, con un
   * tope de páginas para que una respuesta que nunca diga `isLast` no deje el bucle abierto.
   */
  async function proyectos(sitio: string): Promise<{ clave: string; nombre: string }[]> {
    const salida: { clave: string; nombre: string }[] = [];
    for (let pagina = 0; pagina < TOPE_DE_PAGINAS_DE_PROYECTOS; pagina++) {
      const cuerpo = objeto(
        "getVisibleJiraProjects",
        json(
          "getVisibleJiraProjects",
          await llamar("getVisibleJiraProjects", { cloudId: sitio, maxResults: PROYECTOS_POR_PAGINA, startAt: salida.length }),
        ),
      );
      const valores = lista("getVisibleJiraProjects", cuerpo.values);
      for (const v of valores) {
        const x = objeto("getVisibleJiraProjects", v);
        salida.push({ clave: texto("getVisibleJiraProjects", x.key), nombre: texto("getVisibleJiraProjects", x.name) });
      }
      if (valores.length === 0 || cuerpo.isLast !== false) break;
    }
    return salida;
  }

  async function pendientes(v: Vinculo, filtro?: string, opciones?: OpcionesDePendientes): Promise<TareaDelGestor[]> {
    const motivo = motivoDeClaveDeProyecto(v.proyecto);
    if (motivo !== undefined) throw new Error(motivo);
    const cuerpo = objeto(
      "searchJiraIssuesUsingJql",
      json(
        "searchJiraIssuesUsingJql",
        await llamar("searchJiraIssuesUsingJql", {
          cloudId: v.sitio,
          jql: jqlDePendientes(v, filtro, opciones),
          maxResults: PENDIENTES_POR_CONSULTA,
          fields: ["summary", "status", "assignee"],
        }),
      ),
    );
    const urlDelSitio = urlPorSitio.get(v.sitio);
    return lista("searchJiraIssuesUsingJql", cuerpo.issues).map((i) =>
      tareaDesdeIssue("searchJiraIssuesUsingJql", objeto("searchJiraIssuesUsingJql", i), urlDelSitio),
    );
  }

  async function ficha(v: Vinculo, clave: string): Promise<FichaDelGestor> {
    const cuerpo = objeto(
      "getJiraIssue",
      json(
        "getJiraIssue",
        await llamar("getJiraIssue", { cloudId: v.sitio, issueIdOrKey: clave, fields: ["summary", "status", "assignee", "description"] }),
      ),
    );
    const urlDelSitio = urlPorSitio.get(v.sitio);
    const fields = objeto("getJiraIssue", cuerpo.fields);
    return {
      ...tareaDesdeIssue("getJiraIssue", cuerpo, urlDelSitio),
      descripcion: typeof fields.description === "string" ? fields.description : "",
    };
  }

  async function transiciones(v: Vinculo, clave: string): Promise<TransicionDelGestor[]> {
    const cuerpo = objeto(
      "getTransitionsForJiraIssue",
      json("getTransitionsForJiraIssue", await llamar("getTransitionsForJiraIssue", { cloudId: v.sitio, issueIdOrKey: clave })),
    );
    return lista("getTransitionsForJiraIssue", cuerpo.transitions)
      .map((t) => objeto("getTransitionsForJiraIssue", t))
      .filter((t) => t.isAvailable !== false)
      .map((t) => {
        const destino = objeto("getTransitionsForJiraIssue", t.to);
        const statusCategory = typeof destino.statusCategory === "object" && destino.statusCategory !== null
          ? (destino.statusCategory as Record<string, unknown>)
          : undefined;
        return {
          id: texto("getTransitionsForJiraIssue", t.id),
          nombre: texto("getTransitionsForJiraIssue", t.name),
          destino: texto("getTransitionsForJiraIssue", destino.name),
          categoria: categoriaDeEstado(typeof statusCategory?.key === "string" ? statusCategory.key : undefined),
        };
      });
  }

  async function transicionar(v: Vinculo, clave: string, transicion: string): Promise<void> {
    await llamar("transitionJiraIssue", { cloudId: v.sitio, issueIdOrKey: clave, transition: { id: transicion } });
  }

  async function comentar(v: Vinculo, clave: string, cuerpo: string): Promise<void> {
    await llamar("addCommentToJiraIssue", { cloudId: v.sitio, issueIdOrKey: clave, commentBody: cuerpo, contentFormat: "markdown" });
  }

  /** El `account_id` de quien tiene la sesión del conector, preguntado una vez por instancia. El correo que viene al
   *  lado en `atlassianUserInfo` no sale de esta función. */
  let cuentaPropia: Promise<string | undefined> | undefined;
  const miCuenta = (): Promise<string | undefined> =>
    (cuentaPropia ??= llamar("atlassianUserInfo", {}).then(
      (t) => {
        const id = (json("atlassianUserInfo", t) as Record<string, unknown> | null)?.account_id;
        return typeof id === "string" && id !== "" ? id : undefined;
      },
      () => {
        cuentaPropia = undefined;
        return undefined;
      }
    ));

  async function crear(v: Vinculo, nueva: NuevaTareaEnElGestor): Promise<TareaDelGestor> {
    const tipo = tipoParaCrear(
      json("getJiraProjectIssueTypesMetadata", await llamar("getJiraProjectIssueTypesMetadata", { cloudId: v.sitio, projectIdOrKey: v.proyecto }))
    );
    if (tipo === undefined) throw new Error(`el proyecto ${v.proyecto} de Jira no tiene un tipo de incidencia con el que crear una tarea`);
    // Asignada a quien tiene la sesión: es quien la encarga. Sin cuenta (no se pudo preguntar), se crea sin asignar.
    const cuenta = await miCuenta();
    const clave = claveCreada(
      json(
        "createJiraIssue",
        await llamar("createJiraIssue", {
          cloudId: v.sitio,
          projectKey: v.proyecto,
          issueTypeName: tipo,
          summary: nueva.titulo,
          description: nueva.descripcion,
          contentFormat: "markdown",
          ...(cuenta === undefined ? {} : { assignee_account_id: cuenta }),
        })
      )
    );
    const urlDelSitio = urlPorSitio.get(v.sitio);
    return {
      clave,
      titulo: nueva.titulo,
      // Recién creada: lo que se sabe sin volver a preguntar. Quien necesite el estado exacto pide la ficha.
      estado: "",
      categoria: "por-hacer",
      ...(urlDelSitio !== undefined ? { url: `${urlDelSitio}/browse/${clave}` } : {}),
    };
  }

  /**
   * Los comentarios de un ticket, del más viejo al más nuevo. Medido: `getJiraIssue` con `fields: ["comment"]` los da en
   * `fields.comment.comments[]`, con el `body` en MARKDOWN y `created` con zona horaria (`+0200`), que se pasa a ISO
   * para poder ordenar. Del autor no sale nada (lleva `accountId`).
   */
  async function comentarios(v: Vinculo, clave: string): Promise<ComentarioDelGestor[]> {
    const cuerpo = objeto("getJiraIssue", json("getJiraIssue", await llamar("getJiraIssue", { cloudId: v.sitio, issueIdOrKey: clave, fields: ["comment"] })));
    const fields = objeto("getJiraIssue", cuerpo.fields);
    const comment = fields.comment === undefined || fields.comment === null ? { comments: [] } : objeto("getJiraIssue", fields.comment);
    return lista("getJiraIssue", comment.comments)
      .map((c) => objeto("getJiraIssue", c))
      .filter((c) => typeof c.body === "string")
      .map((c) => {
        const fecha = typeof c.created === "string" ? new Date(c.created) : undefined;
        return { texto: c.body as string, creado: fecha !== undefined && !Number.isNaN(fecha.getTime()) ? fecha.toISOString() : "" };
      })
      .sort((a, b) => a.creado.localeCompare(b.creado));
  }

  /**
   * Los estados del flujo del proyecto, para elegir el mapeo. El conector no tiene una tool de estados (medido: 32 tools,
   * ninguna), así que salen de los TICKETS: el estado de cada uno y los destinos de las transiciones de unos pocos de
   * estados distintos. Un estado sin tickets y al que ninguna transición vista lleva no sale (límite declarado).
   */
  async function estados(v: Vinculo): Promise<EstadoDelGestor[]> {
    const cuerpo = objeto(
      "searchJiraIssuesUsingJql",
      json(
        "searchJiraIssuesUsingJql",
        await llamar("searchJiraIssuesUsingJql", {
          cloudId: v.sitio,
          jql: `project = ${v.proyecto} ORDER BY updated DESC`,
          maxResults: PENDIENTES_POR_CONSULTA,
          fields: ["status"],
        })
      )
    );
    const vistos = new Map<string, EstadoDelGestor>();
    const unoPorEstado = new Map<string, string>();
    for (const issue of lista("searchJiraIssuesUsingJql", cuerpo.issues).map((i) => objeto("searchJiraIssuesUsingJql", i))) {
      const status = objeto("searchJiraIssuesUsingJql", objeto("searchJiraIssuesUsingJql", issue.fields).status);
      const nombre = texto("searchJiraIssuesUsingJql", status.name);
      const categoria = typeof status.statusCategory === "object" && status.statusCategory !== null ? (status.statusCategory as Record<string, unknown>).key : undefined;
      if (!vistos.has(nombre)) vistos.set(nombre, { nombre, categoria: categoriaDeEstado(typeof categoria === "string" ? categoria : undefined) });
      if (!unoPorEstado.has(nombre) && typeof issue.key === "string") unoPorEstado.set(nombre, issue.key);
    }
    // Las transiciones de un ticket por estado (como mucho TICKETS_PARA_ESTADOS): enseñan los estados a los que se va.
    for (const clave of [...unoPorEstado.values()].slice(0, TICKETS_PARA_ESTADOS)) {
      for (const t of await transiciones(v, clave)) if (!vistos.has(t.destino)) vistos.set(t.destino, { nombre: t.destino, categoria: t.categoria });
    }
    const orden = { "por-hacer": 0, "en-curso": 1, terminada: 2 } as const;
    return [...vistos.values()].sort((a, b) => orden[a.categoria] - orden[b.categoria]);
  }

  return { sitios, proyectos, pendientes, ficha, transiciones, transicionar, comentar, crear, comentarios, estados };
}

/** Cuántos tickets se miran para conocer los estados a los que llevan sus transiciones: uno por estado, hasta este tope. */
const TICKETS_PARA_ESTADOS = 5;
