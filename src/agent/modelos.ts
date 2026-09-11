import { ChatOpenAI } from "@langchain/openai";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatOllama } from "@langchain/ollama";
import type { ModelosPort, Papel } from "../core/ports.js";
import {
  COMPATIBLES_OPENAI, compatibleConOpenAi, esProveedorPersonalizado, parsear, resolver,
  pideThinkingAdaptativo,
  type Eleccion, type FuentesDeEleccion, type Proveedor, type ProveedorDeclarado,
} from "../core/modelos.js";
import { topeDeSalida } from "../core/contextos.js";
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
   * Los proveedores personalizados, y es una FUNCIÓN y no una lista a propósito.
   *
   * `fuentes` se lee UNA vez, al arrancar el proceso, así que una lista capturada aquí
   * dejaba muerto el flujo que el usuario hace primero: dar de alta un proveedor en
   * Ajustes, ponerle la clave, elegir su modelo y hablar — y el turno reventaba con «no
   * está dado de alta; añádelo en Ajustes», que es justo lo que acababa de hacer. Quien
   * construye pasa `proveedoresPersonalizados` (`agent/configEnDisco.ts`), que relee el
   * config global; sin nada, se cae a lo que trajera `fuentes`, que es lo que había.
   *
   * Del `config.json` GLOBAL y de ningún otro: la regla la impone `core/config.ts` al
   * validar, y aquí no se vuelve a mirar el del proyecto ni por descuido.
   */
  private readonly personalizados: () => readonly ProveedorDeclarado[];

  constructor(
    fuentes: FuentesDeEleccion = {},
    personalizados?: () => readonly ProveedorDeclarado[],
  ) {
    this.eleccion = resolver(fuentes);
    this.personalizados = personalizados ?? (() => fuentes.global?.proveedores ?? []);
  }

  paraPapel(papel: Papel): unknown {
    return construirModelo(this.eleccion[papel], this.personalizados());
  }

  /**
   * Un modelo concreto por su «proveedor/modelo». `parsear` es la MISMA función que valida
   * `--modelo` y `/modelo`, no una copia: un id mal escrito en el `.md` de un agente tiene
   * que fallar igual y con el mismo mensaje que uno mal escrito en la línea de comandos.
   */
  paraModelo(id: string): unknown {
    return construirModelo(parsear(id), this.personalizados());
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
        // El tope de salida se fija A MANO y el razonamiento se pide cuando hace falta;
        // las dos decisiones son datos de `core/` (`topeDeSalida`,
        // `pideThinkingAdaptativo`) y están ahí documentadas con lo que se midió.
        //
        // En corto: el `max_tokens` por omisión de la dependencia sale de una tabla por
        // prefijo y un id que no conoce cae en 4096 SIN DECIRLO —medido con
        // `claude-sonnet-5`—, que en un harness que escribe ficheros corta a media
        // escritura; y omitir `thinking` corre sin pensar en la generación 4.6-4.8,
        // mientras que pedirlo a Haiku o a lo anterior a 4.6 sería un 400.
        return new ChatAnthropic({
          model: modelo,
          apiKey: process.env.ANTHROPIC_API_KEY,
          ...(topeDeSalida("anthropic", modelo) === undefined
            ? {}
            : { maxTokens: topeDeSalida("anthropic", modelo) }),
          ...(pideThinkingAdaptativo("anthropic", modelo)
            ? { thinking: { type: "adaptive" as const } }
            : {}),
        });
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
