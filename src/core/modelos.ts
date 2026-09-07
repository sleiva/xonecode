import type { Papel } from "./ports.js";
// Solo tipo: config.ts importa VALORES de este módulo (PROVEEDORES, PAPELES), y un import
// de valor aquí crearía un ciclo de módulos.
import type { ConfigDeFichero } from "./config.js";

export const PAPELES: readonly Papel[] = ["rapido", "trabajo", "afilado"] as const;

export type Proveedor =
  | "gemini" | "openai" | "anthropic" | "ollama" | "ollama-cloud"
  | "nvidia" | "groq" | "xai";

export const PROVEEDORES: readonly Proveedor[] = [
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
export const VARIABLES_POR_PROVEEDOR: Partial<Record<Proveedor, string>> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  gemini: "GOOGLE_API_KEY",
  "ollama-cloud": "OLLAMA_API_KEY",
  ...Object.fromEntries(
    Object.entries(COMPATIBLES_OPENAI).map(([proveedor, { variable }]) => [proveedor, variable]),
  ),
};

/** La fila de un proveedor compatible con OpenAI, o nada si no lo es. */
export function compatibleConOpenAi(
  proveedor: Proveedor,
): { baseUrl: string; variable: string } | undefined {
  return (COMPATIBLES_OPENAI as Partial<Record<Proveedor, { baseUrl: string; variable: string }>>)[
    proveedor
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
  if (!(PROVEEDORES as readonly string[]).includes(proveedor)) {
    throw new ModeloMalEscrito(
      `proveedor «${proveedor}» desconocido. Los que hay: ${PROVEEDORES.join(", ")}`
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
