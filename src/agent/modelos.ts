import { ChatOpenAI } from "@langchain/openai";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatOllama } from "@langchain/ollama";
import type { ModelosPort, Papel } from "../core/ports.js";
import { resolver, type Eleccion, type FuentesDeEleccion } from "../core/modelos.js";
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

  constructor(fuentes: FuentesDeEleccion = {}) {
    this.eleccion = resolver(fuentes);
  }

  paraPapel(papel: Papel): unknown {
    const { proveedor, modelo } = this.eleccion[papel];
    switch (proveedor) {
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

  descripcion(): Record<Papel, string> {
    const salida = {} as Record<Papel, string>;
    for (const [papel, e] of Object.entries(this.eleccion) as [Papel, Eleccion][]) {
      salida[papel] = `${e.proveedor}/${e.modelo}  (${e.origen})`;
    }
    return salida;
  }
}
