/**
 * Los conectores MCP de la consola: servidores REMOTOS con los que se conecta esta máquina.
 * Puro a propósito —catálogo, formas del cable y reglas—; el disco y la red viven en
 * `agent/conectores/`.
 *
 * **Hay DOS familias y una sola forma de fila.** El CATÁLOGO son las filas que vienen por
 * código (`CATALOGO_DE_CONECTORES`), y una DEFINICIÓN es una fila que escribió el usuario y
 * vive en su disco. Las dos se resuelven al mismo `ConectorDeCatalogo`, así que de ahí para
 * abajo —estado, prueba, autorización, botones— nada sabe de qué familia viene: es lo que
 * hace que un servidor añadido a mano se comporte como Jira.
 *
 * **Llegan a los agentes de TrueForge** por `ConectoresPort` (`agent/motores/trueforge/
 * toolsDeConectores.ts`): qué conectores (`conectoresParaElAgente`), a quién (`recibeConectores`)
 * y qué ve el modelo (`esquemaParaElModelo`, `resultadoRecortado`) se decide aquí, puro.
 */

import type { Agente } from "./agentes.js";
import { CARPETA_DE_ICONOS } from "./iconos.js";
import { motivoDeEndpointInaceptable, motivoDeSlugInaceptable, PREFIJO_PERSONALIZADO, slugDesdeNombre } from "./modelos.js";

export type AutenticacionDeConector = "ninguna" | "oauth" | "api-key";

/**
 * El literal, comprobado por VALOR: es lo que llega por el cable, donde puede mentir.
 *
 * Se usa dos veces y por eso es una función y no tres `===` repetidos: al validar la
 * definición que entra, y —su copia DECLARADA, porque la frontera del cliente no deja
 * importar de aquí— en la guarda del store, que descarta la fila ENTERA en silencio si no
 * reconoce el literal. Añadir un carril de autenticación y no tocar esa guarda deja la fila
 * invisible con todo en verde.
 */
export function esAutenticacionDeConector(valor: unknown): valor is AutenticacionDeConector {
  return valor === "ninguna" || valor === "oauth" || valor === "api-key";
}

export interface ConectorDeCatalogo {
  readonly id: string;
  readonly nombre: string;
  readonly url: string;
  readonly descripcion: string;
  readonly autenticacion: AutenticacionDeConector;
  /**
   * En qué cabecera viaja la clave de un `api-key`, con el valor TAL CUAL. Ausente es
   * `Authorization: Bearer <clave>`, lo de siempre. Existe por Stitch, medido el 30-09-2026: su
   * clave va en `X-Goog-Api-Key`, y como `Bearer` contesta 401.
   */
  readonly cabeceraDeClave?: string;
  /**
   * Una tool de LECTURA, sin argumentos, que `probar` llama después de `listTools`, para los
   * servidores que listan sus tools a cualquiera. Medido en Stitch: `tools/list` contesta 200 sin
   * clave y con una clave falsa, así que sin esto «Conectado · 15 tools» saldría con cualquier cosa.
   */
  readonly comprobacion?: string;
  /**
   * Tools que NO se montan en un agente, aunque el servidor las ofrezca. Medido en Stitch: sus 15
   * tools son unos 11k tokens en CADA llamada del agente que las recibe, y `create_design_system`
   * y `update_design_system` son dos tercios (el mismo esquema de 15 KB cada una) — el sistema de
   * diseño se hace igual con `upload_design_md` + `create_design_system_from_design_md`. Y borrar
   * un proyecto de la cuenta no es trabajo de un agente.
   */
  readonly fueraDelAgente?: readonly string[];
  /**
   * Por tool, los campos del resultado (JSON) que el agente NO recibe, a cualquier profundidad.
   * Medido en Stitch: `list_projects` son 143 KB para 16 proyectos —el `designMd` entero de cada
   * uno, sus pantallas y miniaturas— y el agente no podía ni contarlos (se desalojaba y acabó
   * lanzando scripts). Sin esos campos, 4 KB. El detalle sigue a mano con `get_project`.
   */
  readonly camposFueraDelResultado?: Readonly<Record<string, readonly string[]>>;
}

/**
 * Medido contra los tres servidores el 24-09-2026: deepwiki contesta `listTools` sin
 * credenciales; Notion y Atlassian publican `registration_endpoint` y S256, y aceptan un
 * cliente público con `redirect_uri` en loopback. Stitch (30-09-2026) lleva la clave en su propia
 * cabecera y se comprueba con una llamada, ver `cabeceraDeClave`. El transporte NO se declara: se prueba
 * `streamable-http` y, si no, `sse`, como hace TrueForge.
 */
export const CATALOGO_DE_CONECTORES: readonly ConectorDeCatalogo[] = [
  {
    id: "deepwiki",
    nombre: "DeepWiki",
    url: "https://mcp.deepwiki.com/mcp",
    descripcion: "Lee la documentación y pregunta sobre cualquier repositorio público de GitHub.",
    autenticacion: "ninguna",
  },
  {
    id: "jira",
    nombre: "Jira",
    url: "https://mcp.atlassian.com/v1/mcp",
    descripcion: "Busca, lee, crea y actualiza incidencias de Jira.",
    autenticacion: "oauth",
  },
  {
    id: "notion",
    nombre: "Notion",
    url: "https://mcp.notion.com/mcp",
    descripcion: "Busca páginas, lee contenido, consulta bases de datos y crea páginas.",
    autenticacion: "oauth",
  },
  {
    id: "stitch",
    nombre: "Stitch",
    url: "https://stitch.googleapis.com/mcp",
    descripcion: "Diseña pantallas con Google Stitch y lee sus proyectos, pantallas y sistemas de diseño.",
    autenticacion: "api-key",
    cabeceraDeClave: "X-Goog-Api-Key",
    comprobacion: "list_projects",
    fueraDelAgente: ["delete_project", "create_design_system", "update_design_system"],
    camposFueraDelResultado: { list_projects: ["designTheme", "screenInstances", "thumbnailScreenshot", "metadata"] },
  },
];

export function conectorDelCatalogo(id: string): ConectorDeCatalogo | undefined {
  return CATALOGO_DE_CONECTORES.find((c) => c.id === id);
}

/**
 * Lo que se puede PEDIR sobre un conector. Es una lista blanca por valor: lo que llega por el
 * cable elige entre estas seis y nada más, y `crear` no es una más —es la única que no lleva
 * `id`, porque el id lo DERIVA el servidor del nombre—, así que quien la lea tiene que mirar
 * la acción ANTES de exigir el id.
 */
export type AccionDeConector = "anadir" | "quitar" | "probar" | "autorizar" | "desconectar" | "crear";

/**
 * Una fila del catálogo tal como VIAJA: los cuatro campos menos la `url`. Es la lista con la que
 * el cliente pone nombre y descripción a cada `id` de un `ConectorDelCable`, y por eso tiene que
 * ser `catálogo ∪ definiciones`: con solo las filas de código, un conector escrito a mano se
 * quedaría sin nombre en pantalla y el cliente caería a un `?? id` que enseña el slug crudo.
 *
 * La `url` no está y no es un olvido: en pantalla no hace falta, y una ruta remota de más es una
 * que discutir. Lo único que la cruza es la de una definición, y solo en el sentido
 * cliente→servidor (`DefinicionDeConector`).
 */
export interface FilaDeCatalogo {
  readonly id: string;
  readonly nombre: string;
  readonly descripcion: string;
  readonly autenticacion: AutenticacionDeConector;
}

/** Una fila resuelta, recortada a lo que viaja. Una sola función para las dos familias. */
export function filaDeCatalogo(c: ConectorDeCatalogo): FilaDeCatalogo {
  return { id: c.id, nombre: c.nombre, descripcion: c.descripcion, autenticacion: c.autenticacion };
}

/**
 * Un conector añadido A MANO: lo que una fila del catálogo tiene por código, esto lo tiene
 * por disco. Sin `id` — el id se DERIVA del nombre (`idDeConectorPropio`), y un campo que se
 * deriva no se guarda.
 *
 * Su `url` es lo único de esta pieza que cruza el cable en el sentido cliente→servidor, y es
 * inevitable: la escribió una persona en el formulario. Lo que NO cruza nunca de vuelta es la
 * `url` de la fila —ni la del catálogo ni la de una definición—, por el mismo motivo que la
 * del catálogo ya no viaja: en pantalla no hace falta, y una ruta remota de más es una que
 * discutir.
 */
export interface DefinicionDeConector {
  readonly nombre: string;
  readonly descripcion: string;
  readonly url: string;
  readonly autenticacion: AutenticacionDeConector;
}

/**
 * El prefijo de un conector propio es el MISMO literal que el de un proveedor personalizado
 * (`modelos.ts#PREFIJO_PERSONALIZADO`), y a propósito: en el producto `custom:` significa una
 * sola cosa —«esto lo añadiste tú»— y un segundo literal sería un segundo sitio donde
 * decidirla. Las dos familias NO se cruzan: un id de conector no se le pasa jamás a una
 * función de proveedor, ni al revés, así que compartir el prefijo no las mezcla.
 */
export function esConectorPropio(id: string): boolean {
  return id.startsWith(PREFIJO_PERSONALIZADO)
    && motivoDeSlugInaceptable(slugDeConectorPropio(id)) === undefined;
}

export function slugDeConectorPropio(id: string): string {
  return id.slice(PREFIJO_PERSONALIZADO.length);
}

export function idDeConectorPropio(slug: string): string {
  return `${PREFIJO_PERSONALIZADO}${slug}`;
}

/**
 * El id de un conector escrito a mano, derivado de su NOMBRE. Se deriva y no se guarda —un
 * campo derivado es un campo que puede contradecir a su fuente—, y sale de aquí y no de quien
 * llama para que la regla del slug viva en UN sitio: quien valida una definición y quien la
 * guarda tienen que derivar el MISMO id, o el rechazo por id ocupado hablaría de otro.
 */
export function idDeConectorDesdeNombre(nombre: string): string {
  return idDeConectorPropio(slugDesdeNombre(nombre));
}

/**
 * Una definición como la fila que representa, para que `resolver` devuelva SIEMPRE lo mismo
 * y ninguna capa de más abajo tenga que saber de qué familia viene un conector.
 */
export function conectorDeDefinicion(id: string, def: DefinicionDeConector): ConectorDeCatalogo {
  return { id, nombre: def.nombre, url: def.url, descripcion: def.descripcion, autenticacion: def.autenticacion };
}

/**
 * La definición tal como llega por el cable, o `undefined` si no tiene la forma.
 *
 * La FORMA y la SEMÁNTICA van separadas a propósito: aquí solo se comprueba que los cuatro
 * campos sean cadenas del tipo que dicen ser —el JSON de un cliente puede mentir sobre lo
 * que el tipo promete—, y lo que tiene que valer cada uno lo decide
 * `motivoDeDefinicionInaceptable`, que es la regla y tiene sus tests.
 */
export function definicionDelCable(valor: unknown): DefinicionDeConector | undefined {
  if (typeof valor !== "object" || valor === null) return undefined;
  const d = valor as Record<string, unknown>;
  if (typeof d["nombre"] !== "string") return undefined;
  if (typeof d["descripcion"] !== "string") return undefined;
  if (typeof d["url"] !== "string") return undefined;
  if (!esAutenticacionDeConector(d["autenticacion"])) return undefined;
  return { nombre: d["nombre"], descripcion: d["descripcion"], url: d["url"], autenticacion: d["autenticacion"] };
}

/**
 * ¿Vale eso como conector nuevo? Devuelve el MOTIVO del rechazo, o `undefined` si pasa.
 *
 * `idsOcupados` son los ids ya AÑADIDOS más los que tienen definición, y NO el catálogo. La
 * diferencia importa y es deliberada: lo que choca es crear DOS VECES el mismo nombre —el
 * segundo pisaría la definición del primero, y su URL y su clave se quedarían apuntando a otro
 * servidor—, y una definición huérfana (una que se añadió a mano al fichero, o la que dejó un
 * `quitar` que falló) también ocupa su sitio por eso mismo. Un conector propio llamado «Jira»
 * NO choca con la fila del catálogo, que vive en `jira` y no en `custom:jira`: montar tu propio
 * servidor de Jira es una razón real para darlo de alta a mano, y ahí los dos conviven cada uno
 * con su fila. El id se deriva con la MISMA regla que un proveedor personalizado
 * (`modelos.ts`): un segundo slug sería un segundo sitio donde divergir, y el slug acaba siendo
 * clave de un fichero.
 */
export function motivoDeDefinicionInaceptable(
  def: DefinicionDeConector,
  idsOcupados: readonly string[]
): string | undefined {
  if (def.nombre.trim() === "") return "ponle un nombre";
  if (def.descripcion.trim() === "") return "escribe una descripción: es lo que se lee en la lista";
  const motivoDeUrl = motivoDeEndpointInaceptable(def.url);
  if (motivoDeUrl !== undefined) return motivoDeUrl;
  const slug = slugDesdeNombre(def.nombre);
  const motivoDelSlug = motivoDeSlugInaceptable(slug);
  if (motivoDelSlug !== undefined) return `de ese nombre no sale un identificador válido: ${motivoDelSlug}`;
  if (idsOcupados.includes(idDeConectorDesdeNombre(def.nombre))) {
    return `ya tienes un conector que se llama así: «${slug}»`;
  }
  return undefined;
}

/** Lo que dice el DISCO, no una medida: la medida es `PruebaDeConector`. */
export type EstadoDeConector = "sin-autorizacion" | "falta-autorizar" | "autorizado";

/**
 * El segundo parámetro se llama `hayCredencial` y no `hayTokens` porque la pregunta que
 * contesta es «¿hay con qué autenticarse?»: un OAuth guarda tokens y un `api-key` guarda su
 * clave, y desde aquí son la misma pregunta. Quien pregunta resuelve la suya —el servicio
 * mira los dos campos de su fichero de secretos— y le pasa un booleano.
 */
export function estadoDeConector(conector: ConectorDeCatalogo, hayCredencial: boolean): EstadoDeConector {
  if (conector.autenticacion === "ninguna") return "sin-autorizacion";
  return hayCredencial ? "autorizado" : "falta-autorizar";
}

/** Una tool tal como la enseña Ajustes. `soloLectura` ausente = el servidor no lo anota. */
export interface ToolDeConector {
  nombre: string;
  descripcion?: string;
  soloLectura?: boolean;
}

/**
 * Una tool tal como la recibe un AGENTE: la de Ajustes más su esquema de entrada (JSON Schema,
 * con sus `$defs`). Es otro tipo y no un campo más de `ToolDeConector` porque aquella viaja por el
 * cable en cada foto de la prueba, y los esquemas de Stitch pesan decenas de KB.
 */
export interface ToolConEsquema extends ToolDeConector {
  esquema: Record<string, unknown>;
}

/** La última vez que se probó: una FOTO con hora. Ausente = no se ha probado. */
export type PruebaDeConector =
  | { cuando: number; ok: true; tools: ToolDeConector[] }
  | { cuando: number; ok: false; motivo: string };

/**
 * Un conector AÑADIDO, en la forma del cable. Nunca lleva tokens, ni clave, ni URL de
 * autorización.
 *
 * **No lleva `nombre` ni `descripcion`**: esos los resuelve el cliente buscando este `id` en
 * la lista que viaja como `catalogo`, y esa lista es `catálogo ∪ definiciones`. Antes esa
 * búsqueda NO era total —el `catalogo` solo traía las filas de código, así que un conector
 * añadido a mano se quedaba sin nombre y el cliente caía a un `?? conector.id`—; con la lista
 * completa lo es, y por eso no hay aquí una segunda copia de los mismos cuatro campos.
 */
export interface ConectorDelCable {
  id: string;
  estado: EstadoDeConector;
  prueba?: PruebaDeConector;
  /** Hay una autorización abierta en el navegador esperando su callback. */
  autorizando?: boolean;
}

/** 10 min, el mismo plazo que TrueForge da a una autorización pendiente. */
export const TTL_DE_AUTORIZACION_MS = 10 * 60 * 1000;
/** Conectar + listar tools: más que esto es «no responde». */
export const TOPE_DE_CONEXION_MS = 30 * 1000;
/**
 * Una llamada de un AGENTE a una tool: generar una pantalla en Stitch tarda minutos (medido: casi
 * dos), y con el tope de conexión el agente veía un fallo de algo que sí terminaba. El SDK tiene su
 * PROPIO tope por petición (60 s por omisión), así que este valor se le pasa también a él.
 */
export const TOPE_DE_LLAMADA_MS = 10 * 60 * 1000;
/** La ruta del callback. PÚBLICA: la redirección llega sin cookie (`SameSite=Strict`). */
export const RUTA_CALLBACK_MCP = "/mcp/oauth/callback";

export interface Pendiente {
  id: string;
  expira: number;
}

export type ResultadoDeCallback = { ok: true; id: string; code: string } | { ok: false; motivo: string };

/**
 * La autenticación de la ruta pública ES el `state`: aleatorio, de un solo uso y con
 * plazo. Se CONSUME en cuanto se reconoce, vaya bien o mal, para que no se pueda repetir.
 *
 * El `motivo` es siempre una frase NUESTRA: la query la escribe quien redirige, y repetirla
 * en una página nuestra sería servir contenido ajeno desde el origen de la consola.
 */
export function interpretarCallback(query: URLSearchParams, pendientes: Map<string, Pendiente>, ahora: number): ResultadoDeCallback {
  const state = query.get("state");
  if (state === null) return { ok: false, motivo: "la respuesta no trae el identificador de la autorización" };
  const pendiente = pendientes.get(state);
  if (pendiente === undefined) return { ok: false, motivo: "esa autorización no la pidió esta consola, o ya se usó" };
  pendientes.delete(state);
  if (ahora > pendiente.expira) return { ok: false, motivo: "la autorización caducó: vuelve a pulsar Conectar" };
  if (query.get("error") !== null) return { ok: false, motivo: "el servicio no concedió el acceso" };
  const code = query.get("code");
  if (code === null || code.length === 0) return { ok: false, motivo: "la respuesta no trae código de autorización" };
  return { ok: true, id: pendiente.id, code };
}

/** Un conector tal como lo monta una sesión del agente: con lo que el catálogo le recorta. */
export interface ConectorParaElAgente {
  id: string;
  nombre: string;
  fueraDelAgente: readonly string[];
  camposFueraDelResultado: Readonly<Record<string, readonly string[]>>;
}

/**
 * Qué conectores del proyecto llegan a un AGENTE: los marcados en su `config.json`
 * (`conectores`), que sigan AÑADIDOS y que esta consola sepa nombrar — y NUNCA el del gestor de
 * tareas vinculado, aunque esté en la misma lista (vincular lo marca): en Jira y en Notion escribe
 * el HARNESS, con su tarjeta, nunca el agente. El orden es el de los marcados; un id repetido
 * sale una vez.
 */
export function conectoresParaElAgente(entrada: {
  marcados: readonly string[];
  gestor?: string | undefined;
  anadidos: readonly string[];
  catalogo: readonly FilaDeCatalogo[];
}): ConectorParaElAgente[] {
  const vistos = new Set<string>();
  const salida: ConectorParaElAgente[] = [];
  for (const id of entrada.marcados) {
    if (vistos.has(id) || id === entrada.gestor || !entrada.anadidos.includes(id)) continue;
    const fila = entrada.catalogo.find((c) => c.id === id);
    if (fila === undefined) continue;
    vistos.add(id);
    const deCodigo = conectorDelCatalogo(id);
    salida.push({ id, nombre: fila.nombre, fueraDelAgente: deCodigo?.fueraDelAgente ?? [], camposFueraDelResultado: deCodigo?.camposFueraDelResultado ?? {} });
  }
  return salida;
}

/** Lo que admite un nombre de función en los proveedores de modelos: `^[a-zA-Z0-9_-]{1,64}$`. */
export const LARGO_MAXIMO_DE_NOMBRE_DE_TOOL = 64;

/**
 * Cómo se llama la tool `tool` del conector `id` DENTRO del agente: `stitch__list_projects`. El
 * prefijo evita que dos conectores con una tool del mismo nombre se pisen, y dice de dónde viene.
 * Un `custom:acme` lleva `:`, que un proveedor rechaza como nombre de función: todo lo que no sea
 * `[a-zA-Z0-9_-]` pasa a `_`. Recortado al máximo; devuelve `undefined` si ni así cabe algo que
 * identifique a la tool (un prefijo que ya ocupa el máximo).
 */
export function nombreDeToolDeConector(id: string, tool: string): string | undefined {
  const limpio = (t: string) => t.replace(/[^a-zA-Z0-9_-]/g, "_");
  const nombre = `${limpio(id)}__${limpio(tool)}`;
  return nombre.length <= LARGO_MAXIMO_DE_NOMBRE_DE_TOOL ? nombre : undefined;
}

/**
 * Qué tools de los conectores recibe un ESPECIALISTA: todas, solo quien hace los RECURSOS —su
 * `escribeEn` cubre `icons/`, de los de serie `designer-xone`—, que es quien diseña; el resto,
 * ninguna. Regla de DATO, no una lista de nombres. Estrecha a propósito: las tools de un conector
 * viajan en CADA llamada del agente que las recibe (las de Stitch, miles de tokens). El raíz recibe
 * solo las de LECTURA, y eso lo decide la sesión: es de solo lectura por permisos.
 */
export function recibeConectores(a: Pick<Agente, "soloLectura" | "ejecucion" | "escribeEn">): boolean {
  if (a.soloLectura || a.ejecucion === true) return false;
  const carpetas = a.escribeEn ?? [];
  return carpetas.some((c) => `/${CARPETA_DE_ICONOS}/`.startsWith(c.endsWith("/") ? c : `${c}/`));
}

/** Cuántos `$ref` anidados se incrustan antes de cortar: un esquema recursivo no puede colgar esto. */
export const PROFUNDIDAD_MAXIMA_DE_REF = 8;

/**
 * El esquema de una tool tal como se le puede dar a CUALQUIER proveedor de modelos. Medido con
 * Stitch y Gemini: los esquemas de Google llevan claves propias (`x-google-identifier`,
 * `x-google-enum-descriptions`…) y la API de Gemini RECHAZA la petición entera por una sola —el
 * turno moría antes de empezar—. Se quitan las claves `x-…` (son anotaciones, no restricciones) y
 * se INCRUSTA cada `$ref` local (`#/$defs/…`), que no todos los proveedores siguen; `$defs` sale
 * con ellos. Dentro de `properties` las claves son NOMBRES de campo y no se tocan. Puro: no
 * modifica lo que recibe.
 */
export function esquemaParaElModelo(esquema: Record<string, unknown>): Record<string, unknown> {
  const defs = (esquema["$defs"] ?? {}) as Record<string, unknown>;
  const limpiar = (nodo: unknown, profundidad: number): unknown => {
    if (Array.isArray(nodo)) return nodo.map((n) => limpiar(n, profundidad));
    if (nodo === null || typeof nodo !== "object") return nodo;
    const o = nodo as Record<string, unknown>;
    const ref = o["$ref"];
    if (typeof ref === "string" && ref.startsWith("#/$defs/")) {
      const destino = defs[ref.slice("#/$defs/".length)];
      const { $ref: _ref, ...resto } = o;
      if (destino === undefined || profundidad >= PROFUNDIDAD_MAXIMA_DE_REF) return limpiar({ type: "object", ...resto }, profundidad);
      return limpiar({ ...(destino as Record<string, unknown>), ...resto }, profundidad + 1);
    }
    const salida: Record<string, unknown> = {};
    for (const [clave, valor] of Object.entries(o)) {
      if (clave.startsWith("x-") || clave === "$defs" || clave === "$schema") continue;
      salida[clave] =
        clave === "properties" && valor !== null && typeof valor === "object" && !Array.isArray(valor)
          ? Object.fromEntries(Object.entries(valor as Record<string, unknown>).map(([nombre, v]) => [nombre, limpiar(v, profundidad)]))
          : limpiar(valor, profundidad);
    }
    return salida;
  };
  return limpiar(esquema, 0) as Record<string, unknown>;
}

/**
 * El resultado de una tool sin los `campos` que el catálogo le recorta (`camposFueraDelResultado`),
 * a cualquier profundidad, con una línea al final que dice cuáles faltan —que el agente no los dé
 * por inexistentes—. Lo que no es JSON, o no trae ninguno, vuelve TAL CUAL.
 */
export function resultadoRecortado(texto: string, campos: readonly string[]): string {
  if (campos.length === 0) return texto;
  let datos: unknown;
  try {
    datos = JSON.parse(texto);
  } catch {
    return texto;
  }
  const fuera = new Set(campos);
  const quitados = new Set<string>();
  const podar = (n: unknown): unknown => {
    if (Array.isArray(n)) return n.map(podar);
    if (n === null || typeof n !== "object") return n;
    const salida: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(n as Record<string, unknown>)) {
      if (fuera.has(k)) quitados.add(k);
      else salida[k] = podar(v);
    }
    return salida;
  };
  const podado = podar(datos);
  if (quitados.size === 0) return texto;
  return `${JSON.stringify(podado)}\n(recortado por el harness: sin ${[...quitados].join(", ")}; el detalle de uno, con la tool que lo lee entero)`;
}
