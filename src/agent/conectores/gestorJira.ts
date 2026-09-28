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
  type FichaDelGestor, type GestorDeTareasPort, type TareaDelGestor, type TransicionDelGestor, type Vinculo,
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
 * `crearGestorJira`: cada instancia cachea la url pública de cada `sitio` (`cloudId`) que
 * `sitios()` haya devuelto, para poder componer `url = <url del sitio>/browse/<clave>` sin
 * volver a preguntar. Un sitio nunca visto por esta instancia deja `url` AUSENTE — no se
 * inventa una URL a partir del `cloudId`.
 */
/** El máximo que admite `getVisibleJiraProjects` por llamada (medido en su esquema). */
export const PROYECTOS_POR_PAGINA = 50;
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

  async function pendientes(v: Vinculo, filtro?: string): Promise<TareaDelGestor[]> {
    const motivo = motivoDeClaveDeProyecto(v.proyecto);
    if (motivo !== undefined) throw new Error(motivo);
    const cuerpo = objeto(
      "searchJiraIssuesUsingJql",
      json(
        "searchJiraIssuesUsingJql",
        await llamar("searchJiraIssuesUsingJql", {
          cloudId: v.sitio,
          jql: jqlDePendientes(v, filtro),
          maxResults: 50,
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

  return { sitios, proyectos, pendientes, ficha, transiciones, transicionar, comentar };
}
