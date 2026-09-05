import type { Papel } from "./ports.js";
// Solo tipo: config.ts importa VALORES de este módulo (PROVEEDORES, PAPELES), y un import
// de valor aquí crearía un ciclo de módulos.
import type { ConfigDeFichero } from "./config.js";

export const PAPELES: readonly Papel[] = ["rapido", "trabajo", "afilado"] as const;

export type Proveedor = "gemini" | "openai" | "anthropic" | "ollama" | "ollama-cloud";

export const PROVEEDORES: readonly Proveedor[] = [
  "gemini", "openai", "anthropic", "ollama", "ollama-cloud",
] as const;

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
