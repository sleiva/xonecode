/**
 * El adaptador de Notion sobre `GestorDeTareasPort` (`core/gestorDeTareas.ts`, IXCODE-15): el
 * ÚNICO fichero que conoce los nombres de las tools de Notion y la forma de sus respuestas — el
 * molde es `gestorJira.ts`, y nada fuera de aquí sabe que el gestor de tareas es Notion.
 *
 * El «proyecto» es un DATA SOURCE de una base de Notion (`collection://…`): se busca la base por
 * texto (`notion-search`), se resuelve su data source al ELEGIRLA (`notion-fetch`), y de su
 * esquema se entiende qué propiedad es el estado (tipo `status`, con sus grupos `to_do`/
 * `in_progress`/`complete`), cuál el título y cuál el asignado (la primera `person`). Las
 * pendientes salen de un SQL de solo lectura con `params` (`sqlDePendientes`, puro).
 *
 * Todas las respuestas son `{content:[{type:"text", text:"<JSON>"}]}` (medido, 29-09-2026); el
 * JSON de `notion-fetch` lleva además un `text` con marcado propio (`<data-source-state>`,
 * `<properties>`, `<content>`) del que se sacan las piezas por patrón. Lectura DEFENSIVA, como en
 * Jira: una respuesta que no se entiende LANZA, nunca vuelve como lista vacía.
 *
 * Del asignado solo cruza el NOMBRE: `notion-get-users` trae el correo, y de aquí no sale. Un id
 * que no se resuelve (medido: los asignados de una plantilla no son miembros del espacio) deja el
 * asignado AUSENTE — no se inventa ni se enseña el id.
 */
import {
  categoriaDeGrupoDeNotion, etiquetaDeClave, motivoDeFuenteDeNotion, motivoDeReferenciaDeNotion, SITIO_DE_NOTION, sqlDePendientes,
  type CategoriaDeTarea, type DescripcionDelProyecto, type EsquemaDelProyecto, type FichaDelGestor, type GestorDeTareasPort,
  type OpcionesDePendientes, type ProyectoEncontrado, type TareaDelGestor, type TransicionDelGestor, type Vinculo,
} from "../../core/gestorDeTareas.js";

type Llamar = (nombre: string, args: Record<string, unknown>) => Promise<string>;

const noSeEntiende = (tool: string): Error => new Error(`Notion contestó algo que no se entiende (${tool})`);

function json(tool: string, texto: string): unknown {
  try {
    return JSON.parse(texto);
  } catch {
    throw noSeEntiende(tool);
  }
}

function objeto(tool: string, valor: unknown): Record<string, unknown> {
  if (typeof valor !== "object" || valor === null || Array.isArray(valor)) throw noSeEntiende(tool);
  return valor as Record<string, unknown>;
}

function texto(tool: string, valor: unknown): string {
  if (typeof valor !== "string") throw noSeEntiende(tool);
  return valor;
}

function lista(tool: string, valor: unknown): unknown[] {
  if (!Array.isArray(valor)) throw noSeEntiende(tool);
  return valor;
}

/** Un id de página: UUID con o sin guiones. Entra en un `notion-fetch` y en una escritura. */
function motivoDeClaveDeNotion(clave: string): string | undefined {
  return /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/.test(clave) ? undefined : `«${clave}» no es una página de Notion`;
}

/** Lo que se enseña de una página: sus 8 primeros caracteres de id (el UUID entero no se lee). */
function etiquetaDe(clave: string): string {
  return etiquetaDeClave(clave) ?? clave;
}

/** El orden en que se enseñan los grupos de estado: el de un tablero, de lo por hacer a lo terminado. */
const ORDEN_DE_GRUPOS = ["to_do", "current", "future", "in_progress", "complete"];

/** Los ids `user://…` de un valor de persona, venga como JSON de la fila SQL o como `<mention-user>` de la ficha. */
function idsDeUsuarios(valor: unknown): string[] {
  const t = typeof valor === "string" ? valor : JSON.stringify(valor ?? null);
  return [...t.matchAll(/user:\/\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/g)].map((m) => m[1]!);
}

/** Cuánto de la página entra como descripción: una ficha no es la página entera. */
export const TOPE_DE_DESCRIPCION = 8000;
/** Cuántas páginas de usuarios se piden como mucho (de 100 en 100, el máximo de su esquema). */
const TOPE_DE_PAGINAS_DE_USUARIOS = 5;
/** Cuántas bases se piden a `notion-search` de una vez: el máximo de su esquema (medido). */
export const BASES_POR_BUSQUEDA = 50;

/**
 * El esquema de un `notion-fetch` de una base o de un data source: el PRIMER `<data-source-state>`
 * (una base puede tener varios, y se dice cuántos), o el motivo de por qué esa base no vale.
 */
export function esquemaDeFetch(tool: string, cuerpoTexto: string): DescripcionDelProyecto {
  const bloques = [...cuerpoTexto.matchAll(/<data-source-state>\s*([\s\S]*?)\s*<\/data-source-state>/g)].map((m) => m[1]!);
  // Medido: la base «My Tasks» de Notion es una vista sin data source propio (`dataSourceUrl: ""`),
  // y su fetch no trae ningún `<data-source-state>`. Es una base que no vale, no una respuesta rota.
  if (bloques.length === 0 && /<database[\s>]/.test(cuerpoTexto)) return { motivo: "esta base no tiene un data source propio (es una vista)" };
  if (bloques.length === 0) throw noSeEntiende(tool);
  const estado = objeto(tool, json(tool, bloques[0]!));
  const proyecto = texto(tool, estado.url);
  if (motivoDeFuenteDeNotion(proyecto) !== undefined) throw noSeEntiende(tool);
  const nombre = typeof estado.name === "string" && estado.name.trim() !== "" ? estado.name : "Sin título";
  const propiedades = Object.values(objeto(tool, estado.schema)).map((p) => objeto(tool, p));
  const deTipo = (tipo: string) => propiedades.find((p) => p.type === tipo && typeof p.name === "string");
  const status = deTipo("status");
  if (status === undefined) return { motivo: "esta base no tiene una propiedad de estado" };
  const titulo = deTipo("title");
  if (titulo === undefined) return { motivo: "esta base no tiene una propiedad de título" };
  const persona = deTipo("person");
  const grupos = objeto(tool, status.groups);
  const claves = [...ORDEN_DE_GRUPOS.filter((g) => g in grupos), ...Object.keys(grupos).filter((g) => !ORDEN_DE_GRUPOS.includes(g))];
  const opciones = claves.flatMap((g) =>
    lista(tool, grupos[g]).map((o) => ({ nombre: texto(tool, objeto(tool, o).name), categoria: categoriaDeGrupoDeNotion(g) })),
  );
  if (opciones.length === 0) return { motivo: "la propiedad de estado no tiene opciones" };
  const esquema: EsquemaDelProyecto = {
    proyecto,
    nombre,
    estado: { propiedad: status.name as string, opciones },
    titulo: titulo.name as string,
    ...(persona === undefined ? {} : { asignado: persona.name as string }),
    ...(bloques.length > 1 ? { fuentes: bloques.length } : {}),
  };
  return { esquema };
}

/** La descripción de una página: lo de dentro de `<content>`, sin los bloques vacíos. Una página en blanco es `""`. */
export function descripcionDePagina(cuerpoTexto: string): string {
  const m = /<content>\s*([\s\S]*?)\s*<\/content>/.exec(cuerpoTexto);
  if (m === null) return "";
  const limpio = m[1]!.split("\n").filter((l) => l.trim() !== "<empty-block/>").join("\n").trim();
  return limpio.length > TOPE_DE_DESCRIPCION ? `${limpio.slice(0, TOPE_DE_DESCRIPCION)}…` : limpio;
}

export function crearGestorNotion(llamar: Llamar): GestorDeTareasPort {
  /**
   * El esquema de cada data source ya entendido. `describirProyecto` lo pide SIEMPRE de nuevo (es
   * la pregunta explícita de la persona) y refresca esto; las demás lo usan si está. Un SQL que
   * falla lo TIRA: una propiedad renombrada en Notion no puede dejar el panel roto hasta reiniciar.
   */
  const esquemas = new Map<string, EsquemaDelProyecto>();
  /** El data source al que pertenece cada página vista (su `<parent-data-source>`). */
  const fuenteDePagina = new Map<string, string>();
  let nombres: Map<string, string> | undefined;
  let yo: string | undefined;

  async function describir(ref: string): Promise<DescripcionDelProyecto> {
    const motivo = motivoDeReferenciaDeNotion(ref);
    if (motivo !== undefined) throw new Error(motivo);
    const cuerpo = objeto("notion-fetch", json("notion-fetch", await llamar("notion-fetch", { id: ref })));
    const tipo = objeto("notion-fetch", cuerpo.metadata).type;
    if (tipo !== "database" && tipo !== "data_source") return { motivo: "eso no es una base de datos de Notion" };
    const d = esquemaDeFetch("notion-fetch", texto("notion-fetch", cuerpo.text));
    if ("esquema" in d) {
      // Pedir un data source y que conteste OTRO no es lo pedido: mejor no entenderlo que vincular algo distinto.
      if (ref.startsWith("collection://") && d.esquema.proyecto !== ref) throw noSeEntiende("notion-fetch");
      esquemas.set(d.esquema.proyecto, d.esquema);
    }
    return d;
  }

  async function esquemaDe(fuente: string): Promise<EsquemaDelProyecto> {
    const motivo = motivoDeFuenteDeNotion(fuente);
    if (motivo !== undefined) throw new Error(motivo);
    const cacheado = esquemas.get(fuente);
    if (cacheado !== undefined) return cacheado;
    const d = await describir(fuente);
    if ("motivo" in d) throw new Error(d.motivo);
    return d.esquema;
  }

  /** Quien tiene la sesión del conector (`user_id: "self"`, medido). Se pregunta una vez por instancia. */
  async function yoMismo(): Promise<string> {
    if (yo !== undefined) return yo;
    const cuerpo = objeto("notion-get-users", json("notion-get-users", await llamar("notion-get-users", { user_id: "self" })));
    const primero = lista("notion-get-users", cuerpo.results)[0];
    if (primero === undefined) throw new Error("Notion no dice quién tiene la sesión");
    yo = texto("notion-get-users", objeto("notion-get-users", primero).id);
    return yo;
  }

  /**
   * id → nombre de los miembros del espacio, paginado y cacheado por instancia. Solo el NOMBRE:
   * el `email` de cada miembro no sale de esta función. Un fallo NO tumba la lista de tareas: sin
   * nombres, los asignados salen ausentes, y se vuelve a intentar en la siguiente.
   */
  async function nombresDeUsuarios(): Promise<Map<string, string>> {
    if (nombres !== undefined) return nombres;
    try {
      const mapa = new Map<string, string>();
      let cursor: string | undefined;
      for (let pagina = 0; pagina < TOPE_DE_PAGINAS_DE_USUARIOS; pagina++) {
        const cuerpo = objeto(
          "notion-get-users",
          json("notion-get-users", await llamar("notion-get-users", { page_size: 100, ...(cursor === undefined ? {} : { start_cursor: cursor }) })),
        );
        for (const u of lista("notion-get-users", cuerpo.results)) {
          const x = objeto("notion-get-users", u);
          if (typeof x.id === "string" && typeof x.name === "string" && x.name.trim() !== "") mapa.set(x.id, x.name);
        }
        if (cuerpo.has_more !== true || typeof cuerpo.next_cursor !== "string") break;
        cursor = cuerpo.next_cursor;
      }
      nombres = mapa;
      return mapa;
    } catch {
      return new Map();
    }
  }

  async function asignadoDe(valor: unknown): Promise<string | undefined> {
    const ids = idsDeUsuarios(valor);
    if (ids.length === 0) return undefined;
    const mapa = await nombresDeUsuarios();
    const resueltos = ids.flatMap((id) => (mapa.has(id) ? [mapa.get(id)!] : []));
    return resueltos.length === 0 ? undefined : resueltos.join(", ");
  }

  function estadoYCategoria(esquema: EsquemaDelProyecto, valor: unknown): { estado: string; categoria: CategoriaDeTarea } {
    if (typeof valor !== "string" || valor === "") return { estado: "Sin estado", categoria: "por-hacer" };
    return { estado: valor, categoria: esquema.estado.opciones.find((o) => o.nombre === valor)?.categoria ?? "por-hacer" };
  }

  /** La página: su JSON, su data source padre (si lo dice) y sus propiedades. */
  async function pagina(clave: string): Promise<{ cuerpo: Record<string, unknown>; texto: string; fuente?: string; propiedades: Record<string, unknown> }> {
    const motivo = motivoDeClaveDeNotion(clave);
    if (motivo !== undefined) throw new Error(motivo);
    const cuerpo = objeto("notion-fetch", json("notion-fetch", await llamar("notion-fetch", { id: clave })));
    if (objeto("notion-fetch", cuerpo.metadata).type !== "page") throw new Error("eso no es una página de Notion");
    const t = texto("notion-fetch", cuerpo.text);
    const padre = /<parent-data-source url="(collection:\/\/[0-9a-f-]{36})"/.exec(t)?.[1];
    if (padre !== undefined) fuenteDePagina.set(clave, padre);
    const props = /<properties>\s*([\s\S]*?)\s*<\/properties>/.exec(t);
    const propiedades = props === null ? {} : objeto("notion-fetch", json("notion-fetch", props[1]!));
    return { cuerpo, texto: t, ...(padre === undefined ? {} : { fuente: padre }), propiedades };
  }

  /**
   * El data source de una página, para transicionar y cerrar: el de la PROPIA página, no el del
   * vínculo de ahora — una sesión puede cerrarse con el proyecto ya vinculado a otra base (o a
   * Jira, o a nada: `proyecto: ""`). Solo si la página no lo dice se usa el del vínculo.
   */
  async function fuenteParaPagina(v: Vinculo, clave: string): Promise<string> {
    const vista = fuenteDePagina.get(clave);
    if (vista !== undefined) return vista;
    const p = await pagina(clave);
    if (p.fuente !== undefined) return p.fuente;
    if (motivoDeFuenteDeNotion(v.proyecto) === undefined) return v.proyecto;
    throw new Error("esa página no pertenece a ninguna base de Notion");
  }

  async function sitios(): Promise<{ id: string; nombre: string; url?: string }[]> {
    // Local: un espacio por cuenta OAuth, y el MCP no expone su nombre (medido). `asegurarSitios`
    // del servidor lo llama antes de cada lista: aquí no cuesta una llamada.
    return [{ id: SITIO_DE_NOTION, nombre: "Notion" }];
  }

  async function proyectos(): Promise<{ clave: string; nombre: string }[]> {
    // Una lista vacía diría «no tienes bases»: no es verdad, es que en Notion se BUSCAN.
    throw new Error("en Notion las bases se buscan por nombre");
  }

  async function buscarProyectos(filtro: string): Promise<ProyectoEncontrado[]> {
    const q = filtro.trim();
    if (q === "") throw new Error("escribe algo para buscar la base");
    const cuerpo = objeto(
      "notion-search",
      json(
        "notion-search",
        await llamar("notion-search", { query: q, query_type: "internal", page_size: BASES_POR_BUSQUEDA, max_highlight_length: 0 }),
      ),
    );
    return lista("notion-search", cuerpo.results)
      .map((r) => objeto("notion-search", r))
      .filter((r) => r.type === "database")
      .map((r) => {
        const titulo = typeof r.title === "string" && r.title.trim() !== "" ? r.title : "Sin título";
        return {
          proyecto: texto("notion-search", r.id),
          nombre: titulo,
          ...(typeof r.path === "string" && r.path.trim() !== "" ? { ruta: r.path } : {}),
        };
      });
  }

  async function describirProyecto(v: Vinculo): Promise<DescripcionDelProyecto> {
    return describir(v.proyecto);
  }

  async function admiteMias(v: Vinculo): Promise<boolean> {
    try {
      return (await esquemaDe(v.proyecto)).asignado !== undefined;
    } catch {
      return false;
    }
  }

  async function pendientes(v: Vinculo, filtro?: string, opciones?: OpcionesDePendientes): Promise<TareaDelGestor[]> {
    const esquema = await esquemaDe(v.proyecto);
    if (opciones?.mias === true && esquema.asignado === undefined) throw new Error("esta base no tiene una propiedad de persona");
    const { query, params } = sqlDePendientes(esquema, filtro, opciones?.mias === true ? { yo: await yoMismo() } : {});
    let respuesta: string;
    try {
      respuesta = await llamar("notion-query-data-sources", { data: { data_source_urls: [esquema.proyecto], query, params } });
    } catch (error) {
      esquemas.delete(esquema.proyecto);
      throw error;
    }
    const cuerpo = objeto("notion-query-data-sources", json("notion-query-data-sources", respuesta));
    const filas = lista("notion-query-data-sources", cuerpo.results).map((f) => objeto("notion-query-data-sources", f));
    const salida: TareaDelGestor[] = [];
    for (const f of filas) {
      const clave = texto("notion-query-data-sources", f.id);
      const titulo = f[esquema.titulo];
      const asignado = esquema.asignado === undefined ? undefined : await asignadoDe(f[esquema.asignado]);
      salida.push({
        clave,
        etiqueta: etiquetaDe(clave),
        titulo: typeof titulo === "string" && titulo.trim() !== "" ? titulo : "Sin título",
        ...estadoYCategoria(esquema, f[esquema.estado.propiedad]),
        ...(asignado === undefined ? {} : { asignado }),
        ...(typeof f.url === "string" ? { url: f.url } : {}),
      });
    }
    return salida;
  }

  async function ficha(v: Vinculo, clave: string): Promise<FichaDelGestor> {
    const p = await pagina(clave);
    // La ficha es la de una tarea del proyecto VINCULADO: una página de otra base no se abre como si lo fuera.
    if (p.fuente !== undefined && motivoDeFuenteDeNotion(v.proyecto) === undefined && p.fuente !== v.proyecto) {
      throw new Error("esa página no es de la base vinculada");
    }
    const esquema = await esquemaDe(p.fuente ?? v.proyecto);
    const titulo = p.propiedades[esquema.titulo] ?? p.cuerpo.title;
    const asignado = esquema.asignado === undefined ? undefined : await asignadoDe(p.propiedades[esquema.asignado]);
    return {
      clave,
      etiqueta: etiquetaDe(clave),
      titulo: typeof titulo === "string" && titulo.trim() !== "" ? titulo : "Sin título",
      ...estadoYCategoria(esquema, p.propiedades[esquema.estado.propiedad]),
      ...(asignado === undefined ? {} : { asignado }),
      ...(typeof p.cuerpo.url === "string" ? { url: p.cuerpo.url } : {}),
      descripcion: descripcionDePagina(p.texto),
    };
  }

  /** En Notion no hay transiciones: cada OPCIÓN del estado es un destino, y su nombre es el id. */
  async function transiciones(v: Vinculo, clave: string): Promise<TransicionDelGestor[]> {
    const esquema = await esquemaDe(await fuenteParaPagina(v, clave));
    return esquema.estado.opciones.map((o) => ({ id: o.nombre, nombre: o.nombre, destino: o.nombre, categoria: o.categoria }));
  }

  async function transicionar(v: Vinculo, clave: string, transicion: string): Promise<void> {
    const esquema = await esquemaDe(await fuenteParaPagina(v, clave));
    // Solo una opción que la base TIENE: un nombre cualquiera crearía (o fallaría) en silencio.
    if (!esquema.estado.opciones.some((o) => o.nombre === transicion)) throw new Error(`«${transicion}» no es un estado de esa base`);
    await llamar("notion-update-page", { page_id: clave, command: "update_properties", properties: { [esquema.estado.propiedad]: transicion } });
  }

  async function comentar(_v: Vinculo, clave: string, cuerpo: string): Promise<void> {
    const motivo = motivoDeClaveDeNotion(clave);
    if (motivo !== undefined) throw new Error(motivo);
    await llamar("notion-create-comment", { page_id: clave, markdown: cuerpo });
  }

  return { sitios, proyectos, buscarProyectos, describirProyecto, admiteMias, pendientes, ficha, transiciones, transicionar, comentar };
}
