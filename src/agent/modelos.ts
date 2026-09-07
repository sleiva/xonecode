import { ChatOpenAI } from "@langchain/openai";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatOllama } from "@langchain/ollama";
import type { ModelosPort, Papel } from "../core/ports.js";
import {
  COMPATIBLES_OPENAI, compatibleConOpenAi, esProveedorPersonalizado, parsear, resolver,
  type Eleccion, type FuentesDeEleccion, type Proveedor, type ProveedorDeclarado,
} from "../core/modelos.js";
import { baseUrlDeOllama, baseUrlDeOllamaCloud } from "./catalogoModelos.js";
import { ChatGoogleGenerativeAICompatible } from "./gemini.js";

/**
 * Construye el modelo de cada papel. NO lleva la marca de doble: es real.
 *
 * Los clientes se construyen PEREZOSAMENTE, al pedir el papel: `describe` solo llama a
 * `descripcion()`, y construir cuatro clientes para imprimir un texto obligaría a tener
 * las claves puestas para poder mirar la configuración — justo lo que este comando evita.
 */
export class Modelos implements ModelosPort {
  private readonly eleccion: Record<Papel, Eleccion>;

  /**
   * Los proveedores personalizados salen del `config.json` GLOBAL y de ningún otro sitio:
   * es la misma regla que impone `core/config.ts` al validar, repetida aquí porque este
   * es quien construye el cliente — si un día el fichero del proyecto colara uno, aquí no
   * se usaría igualmente.
   */
  private readonly personalizados: readonly ProveedorDeclarado[];

  constructor(fuentes: FuentesDeEleccion = {}) {
    this.eleccion = resolver(fuentes);
    this.personalizados = fuentes.global?.proveedores ?? [];
  }

  paraPapel(papel: Papel): unknown {
    return construirModelo(this.eleccion[papel], this.personalizados);
  }

  /**
   * Un modelo concreto por su «proveedor/modelo». `parsear` es la MISMA función que valida
   * `--modelo` y `/modelo`, no una copia: un id mal escrito en el `.md` de un agente tiene
   * que fallar igual y con el mismo mensaje que uno mal escrito en la línea de comandos.
   */
  paraModelo(id: string): unknown {
    return construirModelo(parsear(id), this.personalizados);
  }

  descripcion(): Record<Papel, string> {
    const salida = {} as Record<Papel, string>;
    for (const [papel, e] of Object.entries(this.eleccion) as [Papel, Eleccion][]) {
      salida[papel] = `${e.proveedor}/${e.modelo}  (${e.origen})`;
    }
    return salida;
  }
}

/**
 * El cliente de OpenAI apuntado a otro host: NVIDIA, Groq y xAI publican la misma API.
 *
 * La clave se exige AQUÍ y no se deja en `undefined`, que es lo que hace el caso de
 * `openai`. No es simetría rota: `ChatOpenAI` sin `apiKey` se la busca él en
 * `OPENAI_API_KEY`, así que un `NVIDIA_API_KEY` sin poner haría que la clave de OpenAI
 * del usuario viajara a `integrate.api.nvidia.com` con la primera petición. El mensaje es
 * el mismo que da el catálogo cuando falta la credencial, porque es el mismo problema.
 */
function construirCompatibleOpenAi(
  proveedor: Proveedor,
  modelo: string,
  { baseUrl, variable }: { baseUrl: string; variable: string },
): unknown {
  const apiKey = process.env[variable];
  if (apiKey === undefined || apiKey.trim() === "") {
    throw new Error(`falta la credencial para ${proveedor} (${variable}); usa /provider ${proveedor}`);
  }
  return new ChatOpenAI({ model: modelo, apiKey, configuration: { baseURL: baseUrl } });
}

/** El cliente de un `{proveedor, modelo}`, venga de un papel o de la elección de un agente. */
function construirModelo(
  { proveedor, modelo }: { proveedor: Proveedor; modelo: string },
  personalizados: readonly ProveedorDeclarado[] = [],
): unknown {
    // Un personalizado se resuelve ANTES del switch, contra el registro: sin él no hay URL
    // base, y eso es un alta que falta y no un proveedor roto. El switch de abajo sigue
    // siendo exhaustivo sobre los de serie.
    if (esProveedorPersonalizado(proveedor)) {
      const fila = compatibleConOpenAi(proveedor, personalizados);
      if (fila === undefined) {
        throw new Error(
          `el proveedor personalizado «${proveedor}» no está dado de alta; añádelo en Ajustes → Proveedores`,
        );
      }
      return construirCompatibleOpenAi(proveedor, modelo, fila);
    }
    switch (proveedor) {
      case "nvidia":
      case "groq":
      case "xai":
        // Enumerados uno a uno, y no un `default`, para que el switch siga siendo
        // exhaustivo: el día que se añada un proveedor, esto tiene que dar un error de
        // compilación y no construir un cliente equivocado en silencio.
        return construirCompatibleOpenAi(proveedor, modelo, COMPATIBLES_OPENAI[proveedor]);
      case "openai":
        return new ChatOpenAI({ model: modelo, apiKey: process.env.OPENAI_API_KEY });
      case "anthropic":
        return new ChatAnthropic({ model: modelo, apiKey: process.env.ANTHROPIC_API_KEY });
      case "ollama":
        return new ChatOllama({
          model: modelo,
          baseUrl: baseUrlDeOllama(),
        });
      case "ollama-cloud":
        return new ChatOllama({
          model: modelo,
          baseUrl: baseUrlDeOllamaCloud(),
          headers: { authorization: `Bearer ${process.env.OLLAMA_API_KEY ?? ""}` },
        });
      case "gemini":
        return new ChatGoogleGenerativeAICompatible({
          model: modelo,
          apiKey: process.env.GOOGLE_API_KEY,
        });
    }
}
