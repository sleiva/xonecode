import type { Papel } from "./ports.js";
// Solo tipo: config.ts importa VALORES de este módulo (PROVEEDORES, PAPELES), y un import
// de valor aquí crearía un ciclo de módulos.
import type { ConfigDeFichero } from "./config.js";

export const PAPELES: readonly Papel[] = ["rapido", "trabajo", "afilado"] as const;

export type ProveedorDeSerie =
  | "gemini" | "openai" | "anthropic" | "ollama" | "ollama-cloud"
  | "nvidia" | "groq" | "xai";

/**
 * Un endpoint compatible con OpenAI dado de alta por el USUARIO, con la forma
 * `custom:<slug>`.
 *
 * Es un tipo de plantilla y no una entrada más de la lista cerrada porque estos no se
 * conocen al compilar: los declara quien usa el programa. Lo que sí se puede afirmar sin
 * registro es la FORMA, y con eso `parsear` sigue siendo una función pura —no hay que
 * pasarle la lista de altas para partir «custom:mi-llm/qwen3»—; que ese slug esté dado de
 * alta se comprueba donde importa, al construir el cliente y al pedir el catálogo, con un
 * mensaje que dice dónde darlo de alta.
 */
export type ProveedorPersonalizado = `custom:${string}`;

export type Proveedor = ProveedorDeSerie | ProveedorPersonalizado;

export const PREFIJO_PERSONALIZADO = "custom:";

/**
 * El slug de un proveedor personalizado: minúsculas, cifras y guiones.
 *
 * No es cosmética. El slug acaba en tres sitios donde un carácter de más rompe algo: es
 * la segunda mitad de un id que se parte por la PRIMERA barra (así que no puede llevar
 * `/`), es la clave de una entrada de `auth.json`, y de él se deriva el nombre de una
 * variable de entorno (así que no puede llevar `:` ni espacios). Treinta y un caracteres
 * es de sobra para nombrar un servidor.
 */
const SLUG = /^[a-z0-9][a-z0-9-]{0,30}$/;

export function motivoDeSlugInaceptable(slug: string): string | undefined {
  if (slug === "") return "el identificador está vacío";
  if (!SLUG.test(slug)) {
    return "el identificador solo puede llevar minúsculas, cifras y guiones, empezar por letra o cifra y no pasar de 31 caracteres";
  }
  return undefined;
}

/**
 * El identificador que le toca a un proveedor por su NOMBRE.
 *
 * Se deriva en vez de pedirse: un tercer campo en el formulario —«nombre», «id», «URL»—
 * solo puede escribirse mal, y quien da de alta «Mi LM Studio» no tiene por qué saber que
 * eso va a acabar siendo un segmento de un id y un trozo del nombre de una variable de
 * entorno. Se quitan los acentos (`NFD` + la marca combinante), lo que no sea letra o
 * cifra pasa a guion, y se recorta a lo que admite `SLUG`.
 *
 * Puede salir vacío —un nombre de solo signos— y entonces devuelve cadena vacía, que
 * `motivoDeSlugInaceptable` rechaza con su motivo: adivinar un id ahí sería inventarlo.
 */
export function slugDesdeNombre(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 31)
    .replace(/-+$/g, "");
}

export function esProveedorPersonalizado(valor: string): valor is ProveedorPersonalizado {
  return valor.startsWith(PREFIJO_PERSONALIZADO)
    && motivoDeSlugInaceptable(valor.slice(PREFIJO_PERSONALIZADO.length)) === undefined;
}

export function slugDeProveedor(proveedor: ProveedorPersonalizado): string {
  return proveedor.slice(PREFIJO_PERSONALIZADO.length);
}

export function idDeProveedorPersonalizado(slug: string): ProveedorPersonalizado {
  return `${PREFIJO_PERSONALIZADO}${slug}` as ProveedorPersonalizado;
}

/** Un proveedor personalizado tal como se declara y se guarda. */
export interface ProveedorDeclarado {
  /** Sin el prefijo. El id completo, el que se teclea, es `custom:<slug>`. */
  slug: string;
  /** Lo que escribe el usuario para reconocerlo. No es un identificador. */
  nombre: string;
  /** La URL base compatible con OpenAI. El catálogo pide `<baseUrl>/models`. */
  baseUrl: string;
}

/**
 * Los hosts en los que se admite `http://` sin cifrar.
 *
 * Copiada de `agent/cloudstudioMcp.ts#LOOPBACK`, que es la misma decisión por el mismo
 * motivo, y puesta aquí porque `core/` no puede importar de `agent/` (sí al revés): la
 * regla canónica vive ahora en datos puros y aquel módulo tira de ésta.
 */
const LOOPBACK: ReadonlySet<string> = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

/**
 * ¿Vale eso como endpoint? Devuelve el MOTIVO del rechazo, o `undefined` si pasa.
 *
 * La misma regla que la URL de un MCP, y por la misma razón: HTTPS fuera de la máquina,
 * `http://` solo en loopback, y nunca credenciales dentro de la URL —una URL con usuario
 * y contraseña acaba escrita en `config.json` y en cada traza que la enseñe—.
 *
 * Que loopback pase NO es una concesión: es el caso principal. Un LM Studio, un
 * `llama.cpp --server` o un vLLM escuchan en `http://localhost:1234/v1`, y ahí el texto
 * plano no cruza ninguna red — el mismo trato que ya reciben el `redirect_uri` del
 * callback de OAuth y esta propia consola.
 */
export function motivoDeEndpointInaceptable(valor: string): string | undefined {
  let url: URL;
  try {
    url = new URL(valor);
  } catch {
    return "eso no es una URL: escribe algo como https://mi-servidor/v1";
  }
  if (url.username !== "" || url.password !== "") {
    return "la URL no puede llevar usuario ni contraseña dentro: la clave se pide aparte";
  }
  if (url.protocol === "https:") return undefined;
  if (url.protocol === "http:" && LOOPBACK.has(url.hostname)) return undefined;
  return "la URL debe ser https — solo se admite http:// en 127.0.0.1 o localhost, para un servidor local";
}

export const PROVEEDORES: readonly ProveedorDeSerie[] = [
  "gemini", "openai", "anthropic", "ollama", "ollama-cloud",
  "nvidia", "groq", "xai",
] as const;

/**
 * Los que se hablan con el cliente de OpenAI cambiándole la URL base.
 *
 * Los tres —NVIDIA (`build.nvidia.com`), Groq y xAI (los modelos `grok-*`)— publican una
 * API compatible con OpenAI: mismo `/chat/completions` y mismo `GET /v1/models`. Así que
 * no son tres ramas nuevas en `construirModelo` ni tres listados nuevos en el catálogo,
 * son tres FILAS de esta tabla, y quien las consume tiene una sola rama genérica. La
 * cuarta que se añada será otra fila.
 *
 * **`openai` NO está aquí a propósito**, aunque encaje en la forma: su listado filtra por
 * las familias de ids de OpenAI (`gpt-`, `o3-`, `codex-`), que en estos tres no significan
 * nada — meterlo en la rama genérica cambiaría lo que hoy ofrece.
 *
 * Y la lista de proveedores sigue siendo CERRADA (no hay «proveedor personalizado», ver
 * `componentes/Ajustes.tsx`): lo que cambia con esto es que añadir uno compatible cuesta
 * una fila de datos en vez de una rama por sitio, no que se pueda declarar desde fuera.
 */
export type ProveedorCompatibleOpenAi = "nvidia" | "groq" | "xai";

export const COMPATIBLES_OPENAI: Record<
  ProveedorCompatibleOpenAi,
  { baseUrl: string; variable: string }
> = {
  nvidia: { baseUrl: "https://integrate.api.nvidia.com/v1", variable: "NVIDIA_API_KEY" },
  groq: { baseUrl: "https://api.groq.com/openai/v1", variable: "GROQ_API_KEY" },
  xai: { baseUrl: "https://api.x.ai/v1", variable: "XAI_API_KEY" },
};

/**
 * La variable de entorno donde vive la clave de cada proveedor, y el ÚNICO sitio donde
 * se escribe.
 *
 * Hubo cuatro copias de esta tabla —`agent/configEnDisco.ts`, `agent/catalogoModelos.ts`,
 * `cli/config.ts` y `cli/consola.ts`—, duplicadas para que `cli/` no tirase de `agent/`
 * por un mapa de cuatro líneas. Ya habían divergido: la de `cli/config.ts` no tenía
 * `OLLAMA_API_KEY`, así que `/config` decía «sin credencial» de Ollama Cloud aunque
 * estuviera puesta. Puesta en `core/` —que es datos puros y de donde SÍ pueden tirar los
 * dos lados— el problema desaparece por construcción.
 *
 * `ollama` no está: es local y no necesita clave. Esa ausencia es la misma que declara
 * `SIN_CREDENCIAL`, y hay un test que exige que las dos cuenten lo mismo.
 */
export const VARIABLES_POR_PROVEEDOR: Partial<Record<ProveedorDeSerie, string>> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  gemini: "GOOGLE_API_KEY",
  "ollama-cloud": "OLLAMA_API_KEY",
  ...Object.fromEntries(
    Object.entries(COMPATIBLES_OPENAI).map(([proveedor, { variable }]) => [proveedor, variable]),
  ),
};

/**
 * Cómo se ESCRIBE el nombre de cada proveedor, que no es su id.
 *
 * El id es un identificador —minúsculas, sin espacios, el que se teclea en
 * `/modelo <proveedor>/<modelo>`— y la ventana de Ajustes lo estaba enseñando tal cual:
 * ocho filas diciendo «nvidia», «xai», «ollama-cloud». Un id crudo en una lista para leer
 * es la misma clase de descuido que un `emulator-5554` en la pastilla de dispositivo.
 *
 * Los nombres son los que usa cada casa (NVIDIA en versales, xAI con la x minúscula), no
 * una capitalización automática del id, que daría «Xai» y «Ollama-cloud». El id sigue
 * viajando y sigue viéndose: en la fila va debajo, en mono, porque es dato de máquina.
 */
const NOMBRES: Record<ProveedorDeSerie, string> = {
  gemini: "Google Gemini",
  openai: "OpenAI",
  anthropic: "Anthropic",
  ollama: "Ollama",
  "ollama-cloud": "Ollama Cloud",
  nvidia: "NVIDIA",
  groq: "Groq",
  xai: "xAI",
};

/**
 * Cómo se escribe un proveedor. Para uno personalizado, el nombre que puso quien lo dio
 * de alta; sin registro —o con un slug que ya no está— se cae a su slug, que es lo único
 * que se puede afirmar: inventarle un nombre sería peor que enseñar el identificador.
 */
export function nombreDeProveedor(
  proveedor: Proveedor,
  declarados: readonly ProveedorDeclarado[] = [],
): string {
  if (esProveedorPersonalizado(proveedor)) {
    const slug = slugDeProveedor(proveedor);
    return declarados.find((d) => d.slug === slug)?.nombre ?? slug;
  }
  return NOMBRES[proveedor];
}

/**
 * La variable de entorno donde vive la clave de un proveedor.
 *
 * Para los de serie, la tabla. Para uno personalizado se DERIVA del slug
 * (`XONECODE_CLAVE_MI_LLM`) en vez de guardarse: una variable elegida por el usuario sería
 * un cuarto campo del formulario que solo puede escribirse mal, y derivarla hace que todo
 * lo que ya existe —`aplicarAuth`, `guardarCredencial`, el constructor del cliente y el
 * catálogo— siga funcionando sin saber que estos proveedores existen.
 */
export function variableDeProveedor(proveedor: Proveedor): string | undefined {
  if (esProveedorPersonalizado(proveedor)) {
    return `XONECODE_CLAVE_${slugDeProveedor(proveedor).toUpperCase().replace(/-/g, "_")}`;
  }
  return VARIABLES_POR_PROVEEDOR[proveedor];
}

/**
 * La fila de un proveedor compatible con OpenAI, o nada si no lo es.
 *
 * Un personalizado LO ES por definición —es lo único que se puede dar de alta—, pero solo
 * si consta en el registro: sin su URL base no hay a dónde llamar, y devolver algo aquí
 * sería fabricar un endpoint.
 */
export function compatibleConOpenAi(
  proveedor: Proveedor,
  declarados: readonly ProveedorDeclarado[] = [],
): { baseUrl: string; variable: string } | undefined {
  if (esProveedorPersonalizado(proveedor)) {
    const slug = slugDeProveedor(proveedor);
    const declarado = declarados.find((d) => d.slug === slug);
    if (declarado === undefined) return undefined;
    return { baseUrl: declarado.baseUrl, variable: variableDeProveedor(proveedor)! };
  }
  return (COMPATIBLES_OPENAI as Partial<Record<ProveedorDeSerie, { baseUrl: string; variable: string }>>)[
    proveedor as ProveedorDeSerie
  ];
}

/**
 * Los que NO llevan clave. Hoy solo Ollama local, que es la omisión del repo.
 *
 * Vive aquí, en datos puros, porque lo consultan dos sitios que no se conocen: el asistente
 * de cuenta (`cli/wizardInicial.ts`, para no pedir una clave que no hace falta) y el estado
 * de modelos de la consola web (`web/servidor/arranque.ts`, que necesita distinguir «no
 * necesita credencial» de «la tiene» — pintarle a Ollama un punto verde sería concederle un
 * permiso que nadie le dio, y uno rojo, inventarle un problema). Dos listas de esto ya
 * habrían divergido: `hayCredencial` (`cli/consola.ts`) devuelve `true` para un proveedor
 * sin variable de entorno, que para su pregunta —«¿puedo usarlo?»— es correcto y para ésta
 * —«¿tiene credencial?»— sería falso.
 */
export const SIN_CREDENCIAL: ReadonlySet<Proveedor> = new Set<Proveedor>(["ollama"]);

export interface Eleccion {
  proveedor: Proveedor;
  modelo: string;
  /** De dónde salió, para que `describe` lo pueda decir. */
  origen: "bandera" | "entorno" | "proyecto" | "global" | "omision";
}

/**
 * Los modelos por omisión de cada papel.
 *
 * `rapido` es el que corre en TODOS los turnos, así que es el que más veces se paga en la
 * vida del agente: arranca abajo y solo se sube con una medición delante. `afilado` es
 * para el juez, que es quien decide si algo está bien — ahí un modelo flojo cuesta más de
 * lo que ahorra.
 *
 * Ollama por omisión, y a propósito: el usuario tiene modelos locales con tool-calling y
 * los frontier de pago no son la vía por defecto de este laboratorio.
 */
export const POR_OMISION: Record<Papel, { proveedor: Proveedor; modelo: string }> = {
  rapido: { proveedor: "ollama", modelo: "glm-5.3-flash:cloud" },
  trabajo: { proveedor: "ollama", modelo: "glm-5.3-flash:cloud" },
  afilado: { proveedor: "ollama", modelo: "kimi-k3:cloud" },
};

export class ModeloMalEscrito extends Error {}

/**
 * `proveedor/modelo` → sus dos partes.
 *
 * El separador es la PRIMERA barra, no la última: un id de Ollama puede llevar barras
 * (`library/qwen3:8b`) y partir por la última dejaría el proveedor con basura. Se valida
 * el proveedor contra la lista en vez de aceptar cualquier cosa, porque un proveedor mal
 * escrito no falla al parsear: falla mucho después, al construir el cliente, con un error
 * que no menciona la bandera.
 */
export function parsear(texto: string): { proveedor: Proveedor; modelo: string } {
  const corte = texto.indexOf("/");
  if (corte <= 0 || corte === texto.length - 1) {
    throw new ModeloMalEscrito(
      `«${texto}» no tiene la forma proveedor/modelo. Proveedores: ${PROVEEDORES.join(", ")}`
    );
  }
  const proveedor = texto.slice(0, corte);
  const modelo = texto.slice(corte + 1);
  // Un personalizado se acepta por su FORMA, sin mirar ningún registro: así `parsear`
  // sigue siendo pura y la usa igual el `.md` de un agente, la bandera `--modelo` y el
  // cable. Que ese slug esté dado de alta se comprueba al construir el cliente y al pedir
  // el catálogo, que es donde se puede decir «dalo de alta en Ajustes».
  if (
    !(PROVEEDORES as readonly string[]).includes(proveedor)
    && !esProveedorPersonalizado(proveedor)
  ) {
    throw new ModeloMalEscrito(
      `proveedor «${proveedor}» desconocido. Los que hay: ${PROVEEDORES.join(", ")}`
        + " (o «custom:<id>» para uno personalizado, dado de alta en Ajustes)"
    );
  }
  return { proveedor: proveedor as Proveedor, modelo };
}

export interface FuentesDeEleccion {
  /** `--modelo proveedor/modelo`: fija los TRES papeles. */
  bandera?: string;
  /** `--modelo-rapido`, etc.: fija UNO, y gana sobre `--modelo`. */
  porPapel?: Partial<Record<Papel, string>>;
  /** Variables de entorno, por si se prefiere no repetir la bandera. */
  entorno?: { XONECODE_MODELO?: string };
  /** `config.json` del proyecto, ya validado. */
  proyecto?: ConfigDeFichero;
  /** `config.json` global (~/.xonecode/config.json), ya validado. */
  global?: ConfigDeFichero;
}

/**
 * Qué modelo le toca a cada papel, y de dónde salió.
 *
 * Precedencia, de más fuerte a más débil, evaluada papel a papel: porPapel > bandera
 * > entorno > proyecto > global > omisión. Los dos primeros escalones son de CLÍ y
 * preceden a cualquier fichero. Entre ficheros manda el RANGO (proyecto gana a global),
 * y solo DENTRO de un mismo fichero manda la especificidad (modelos.<papel> gana a
 * modelo): el campo general de un fichero de rango superior nunca pierde contra el
 * campo específico de uno inferior.
 */
export function resolver(fuentes: FuentesDeEleccion = {}): Record<Papel, Eleccion> {
  const salida = {} as Record<Papel, Eleccion>;
  for (const papel of PAPELES) {
    // El primero que existe gana; el resto no se mira.
    if (fuentes.porPapel?.[papel]) {
      salida[papel] = { ...parsear(fuentes.porPapel[papel]), origen: "bandera" };
    } else if (fuentes.bandera) {
      salida[papel] = { ...parsear(fuentes.bandera), origen: "bandera" };
    } else if (fuentes.entorno?.XONECODE_MODELO) {
      salida[papel] = { ...parsear(fuentes.entorno.XONECODE_MODELO), origen: "entorno" };
    } else if (fuentes.proyecto?.modelos?.[papel]) {
      salida[papel] = { ...parsear(fuentes.proyecto.modelos[papel]), origen: "proyecto" };
    } else if (fuentes.proyecto?.modelo) {
      salida[papel] = { ...parsear(fuentes.proyecto.modelo), origen: "proyecto" };
    } else if (fuentes.global?.modelos?.[papel]) {
      salida[papel] = { ...parsear(fuentes.global.modelos[papel]), origen: "global" };
    } else if (fuentes.global?.modelo) {
      salida[papel] = { ...parsear(fuentes.global.modelo), origen: "global" };
    } else {
      salida[papel] = { ...POR_OMISION[papel], origen: "omision" };
    }
  }
  return salida;
}
