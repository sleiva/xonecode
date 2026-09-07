import {
  compatibleConOpenAi, VARIABLES_POR_PROVEEDOR, type Proveedor,
} from "../core/modelos.js";
import type { CatalogoModelosPort, ModeloDisponible } from "../core/ports.js";

const MAX_PAGINAS = 20;

/** Un fallo publicable: nunca incluye una clave ni el cuerpo remoto. */
export class ErrorCatalogoModelos extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ErrorCatalogoModelos";
  }
}

/** La única resolución de URL de Ollama que comparten sus dos consumidores. */
export function baseUrlDeOllama(): string {
  return process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
}

/** El host remoto oficial de Ollama Cloud no se mezcla con el servidor local. */
export function baseUrlDeOllamaCloud(): string {
  return "https://ollama.com";
}

type Registro = Record<string, unknown>;

function esRegistro(valor: unknown): valor is Registro {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

function texto(valor: unknown): string | undefined {
  return typeof valor === "string" && valor.length > 0 ? valor : undefined;
}

function numero(valor: unknown): number | undefined {
  return typeof valor === "number" && Number.isFinite(valor) && valor > 0 ? valor : undefined;
}

function modelosDe(registro: Registro, campo: string, proveedor: Proveedor): Registro[] {
  const valor = registro[campo];
  if (!Array.isArray(valor) || !valor.every(esRegistro)) {
    throw new ErrorCatalogoModelos(`respuesta incompatible de ${proveedor}`);
  }
  return valor;
}

function urlConParametro(url: string, nombre: string, valor: string): string {
  const resultado = new URL(url);
  resultado.searchParams.set(nombre, valor);
  return resultado.toString();
}

function unirUrlOllama(ruta: string): string {
  return `${baseUrlDeOllama().replace(/\/+$/, "")}${ruta}`;
}

function unirUrl(baseUrl: string, ruta: string): string {
  return `${baseUrl.replace(/\/+$/, "")}${ruta}`;
}

function esModeloOpenAiConversacional(id: string): boolean {
  const normalizado = id.toLowerCase();
  if (!esIdConversacional(normalizado)) return false;
  return /^(gpt|chatgpt|o[1-9]|codex)-/.test(normalizado);
}

/** Familias que un cliente de chat no debe ofrecer aunque una API las enumere. */
function esIdConversacional(id: string): boolean {
  return ![
    // «embed» y no «embedding»: el catálogo de NVIDIA nombra los suyos `nv-embedqa-e5-v5`,
    // que no contiene «embedding». Y «rerank» por lo mismo (`llama-3.2-nv-rerankqa-1b-v2`):
    // los dos son modelos de recuperación, no de conversación, y la API los enumera al
    // lado de los de chat.
    "embed", "rerank",
    "moderation", "transcri", "whisper", "tts", "audio", "voice",
    "dall-e", "dalle", "image", "imagen", "sora", "video", "realtime",
  ].some((familia) => id.toLowerCase().includes(familia));
}

function contextoOllama(modelInfo: unknown): number | undefined {
  if (!esRegistro(modelInfo)) return undefined;
  for (const [campo, valor] of Object.entries(modelInfo)) {
    if (campo === "context_length" || campo.endsWith(".context_length")) return numero(valor);
  }
  return undefined;
}

export class CatalogoModelos implements CatalogoModelosPort {
  constructor(
    private readonly fetchFn: typeof fetch = globalThis.fetch,
    private readonly timeoutMs = 8_000,
  ) {}

  async listar(proveedor: Proveedor): Promise<ModeloDisponible[]> {
    switch (proveedor) {
      case "openai": return this.listarOpenAi();
      case "anthropic": return this.listarAnthropic();
      case "gemini": return this.listarGemini();
      case "ollama": return this.listarOllama();
      case "ollama-cloud": return this.listarOllamaCloud();
      case "nvidia":
      case "groq":
      case "xai":
        return this.listarCompatible(proveedor);
    }
  }

  /**
   * La clave de un proveedor, de la ÚNICA tabla que las nombra (`core/modelos.ts`).
   *
   * Un proveedor sin variable no puede llegar aquí —`ollama` es local y su listado no
   * llama a esto—, pero si llegara, decirlo es mejor que leer `process.env[undefined]`.
   */
  private clave(proveedor: Proveedor): string {
    const variable = VARIABLES_POR_PROVEEDOR[proveedor];
    const clave = variable === undefined ? undefined : process.env[variable];
    if (!clave) {
      throw new ErrorCatalogoModelos(`falta la credencial para ${proveedor}; usa /provider ${proveedor}`);
    }
    return clave;
  }

  private async pedir(proveedor: Proveedor, url: string, init: RequestInit = {}): Promise<unknown> {
    const controlador = new AbortController();
    let agotoElTiempo = false;
    const temporizador = setTimeout(() => {
      agotoElTiempo = true;
      controlador.abort();
    }, this.timeoutMs);
    try {
      const respuesta = await this.fetchFn(url, { ...init, signal: controlador.signal });
      if (!respuesta.ok) {
        if (respuesta.status === 401 || respuesta.status === 403) {
          throw new ErrorCatalogoModelos(`credencial no autorizada para ${proveedor}`);
        }
        // El código HTTP va EN el mensaje. Sin él, un 410 («el modelo fue retirado») y un
        // 500 («el servidor está roto») se leen igual —«respuesta no disponible»— y hay que
        // salir a curl para distinguirlos. El código no es contenido remoto ni credencial:
        // la regla de este error es no llevar la clave ni el cuerpo, no ser opaco.
        throw new ErrorCatalogoModelos(`respuesta no disponible de ${proveedor} (HTTP ${respuesta.status})`);
      }
      try {
        return await respuesta.json();
      } catch {
        throw new ErrorCatalogoModelos(`respuesta incompatible de ${proveedor}`);
      }
    } catch (error) {
      if (error instanceof ErrorCatalogoModelos) {
        throw error;
      }
      if (agotoElTiempo || controlador.signal.aborted) {
        throw new ErrorCatalogoModelos(`timeout al consultar ${proveedor}`);
      }
      throw new ErrorCatalogoModelos(`no se puede contactar con ${proveedor}`);
    } finally {
      clearTimeout(temporizador);
    }
  }

  private async listarOpenAi(): Promise<ModeloDisponible[]> {
    const clave = this.clave("openai");
    const respuesta = await this.pedir("openai", "https://api.openai.com/v1/models", {
      headers: { authorization: `Bearer ${clave}` },
    });
    if (!esRegistro(respuesta)) throw new ErrorCatalogoModelos("respuesta incompatible de openai");
    return modelosDe(respuesta, "data", "openai").flatMap((modelo) => {
      const id = texto(modelo.id);
      return id !== undefined && esModeloOpenAiConversacional(id) ? [{ proveedor: "openai", id }] : [];
    });
  }

  private async listarAnthropic(): Promise<ModeloDisponible[]> {
    const clave = this.clave("anthropic");
    const cabeceras = { "x-api-key": clave, "anthropic-version": "2023-06-01" };
    let url = "https://api.anthropic.com/v1/models";
    const salida: ModeloDisponible[] = [];
    const vistos = new Set<string>();
    for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
      const respuesta = await this.pedir("anthropic", url, { headers: cabeceras });
      if (!esRegistro(respuesta)) throw new ErrorCatalogoModelos("respuesta incompatible de anthropic");
      for (const modelo of modelosDe(respuesta, "data", "anthropic")) {
        const id = texto(modelo.id);
        if (id === undefined || !esIdConversacional(id)) continue;
        const nombre = texto(modelo.display_name);
        const contexto = numero(modelo.max_input_tokens);
        salida.push({ proveedor: "anthropic", id, ...(nombre === undefined ? {} : { nombre }), ...(contexto === undefined ? {} : { contexto }) });
      }
      if (typeof respuesta.has_more !== "boolean") {
        throw new ErrorCatalogoModelos("respuesta incompatible de anthropic");
      }
      if (!respuesta.has_more) return salida;
      const cursor = texto(respuesta.last_id);
      if (cursor === undefined || vistos.has(cursor)) break;
      vistos.add(cursor);
      url = urlConParametro("https://api.anthropic.com/v1/models", "after_id", cursor);
    }
    throw new ErrorCatalogoModelos("respuesta incompatible de anthropic");
  }

  private async listarGemini(): Promise<ModeloDisponible[]> {
    const clave = this.clave("gemini");
    const cabeceras = { "x-goog-api-key": clave };
    let url = "https://generativelanguage.googleapis.com/v1beta/models";
    const salida: ModeloDisponible[] = [];
    const vistos = new Set<string>();
    for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
      const respuesta = await this.pedir("gemini", url, { headers: cabeceras });
      if (!esRegistro(respuesta)) throw new ErrorCatalogoModelos("respuesta incompatible de gemini");
      for (const modelo of modelosDe(respuesta, "models", "gemini")) {
        const nombreRemoto = texto(modelo.name);
        const metodos = modelo.supportedGenerationMethods;
        if (nombreRemoto === undefined || !Array.isArray(metodos) || !metodos.includes("generateContent")) continue;
        const id = nombreRemoto.startsWith("models/") ? nombreRemoto.slice("models/".length) : undefined;
        if (id === undefined || id.length === 0 || !esIdConversacional(id)) continue;
        const nombre = texto(modelo.displayName);
        const contexto = numero(modelo.inputTokenLimit);
        salida.push({ proveedor: "gemini", id, ...(nombre === undefined ? {} : { nombre }), ...(contexto === undefined ? {} : { contexto }) });
      }
      if (respuesta.nextPageToken === undefined) return salida;
      const siguiente = texto(respuesta.nextPageToken);
      if (siguiente === undefined) throw new ErrorCatalogoModelos("respuesta incompatible de gemini");
      if (vistos.has(siguiente)) break;
      vistos.add(siguiente);
      url = urlConParametro("https://generativelanguage.googleapis.com/v1beta/models", "pageToken", siguiente);
    }
    throw new ErrorCatalogoModelos("respuesta incompatible de gemini");
  }

  /**
   * El `GET /v1/models` de un proveedor compatible con OpenAI (NVIDIA, Groq, xAI).
   *
   * Tres decisiones, y las tres son la misma: no afirmar lo que no se sabe.
   *
   * - **El filtro es el genérico** (`esIdConversacional`), no el de OpenAI: aquí los ids
   *   no siguen sus familias (`meta/llama-3.3-70b-instruct`, `grok-4`,
   *   `llama-3.1-8b-instant`), así que exigir un prefijo conocido dejaría la lista vacía.
   *   Se descarta solo lo que con certeza no es de conversación —embeddings, rerankers,
   *   voz, imagen— y lo demás se ofrece: preferimos una lista con algo de más a una que
   *   esconde el modelo que el usuario venía a elegir.
   * - **El contexto solo si el servidor lo dice.** Groq manda `context_window` en cada
   *   fila; NVIDIA y xAI no mandan nada. Sin dato no hay campo, y por tanto la barra no
   *   pinta porcentaje — que es lo correcto, no un hueco por rellenar
   *   (`core/contextos.ts` no tiene tabla para estas familias, y no se le inventa una).
   * - **Sin paginación.** Ninguno de los tres la declara en `/v1/models`; inventar un
   *   bucle de cursores contra un campo que no existe sería código que nadie ejecuta.
   */
  private async listarCompatible(proveedor: Proveedor): Promise<ModeloDisponible[]> {
    const fila = compatibleConOpenAi(proveedor);
    if (fila === undefined) throw new ErrorCatalogoModelos(`${proveedor} no es compatible con OpenAI`);
    const clave = this.clave(proveedor);
    const respuesta = await this.pedir(proveedor, unirUrl(fila.baseUrl, "/models"), {
      headers: { authorization: `Bearer ${clave}` },
    });
    if (!esRegistro(respuesta)) throw new ErrorCatalogoModelos(`respuesta incompatible de ${proveedor}`);
    return modelosDe(respuesta, "data", proveedor).flatMap((modelo) => {
      const id = texto(modelo.id);
      if (id === undefined || !esIdConversacional(id)) return [];
      const contexto = numero(modelo.context_window) ?? numero(modelo.context_length);
      return [{ proveedor, id, ...(contexto === undefined ? {} : { contexto }) }];
    });
  }

  private async listarOllama(): Promise<ModeloDisponible[]> {
    return this.listarOllamaDesde("ollama", baseUrlDeOllama());
  }

  private async listarOllamaCloud(): Promise<ModeloDisponible[]> {
    const clave = this.clave("ollama-cloud");
    return this.listarOllamaDesde("ollama-cloud", baseUrlDeOllamaCloud(), {
      authorization: `Bearer ${clave}`,
    });
  }

  private async listarOllamaDesde(
    proveedor: "ollama" | "ollama-cloud",
    baseUrl: string,
    cabeceras?: Record<string, string>,
  ): Promise<ModeloDisponible[]> {
    const etiquetas = await this.pedir(
      proveedor,
      unirUrl(baseUrl, "/api/tags"),
      cabeceras === undefined ? {} : { headers: cabeceras },
    );
    if (!esRegistro(etiquetas)) throw new ErrorCatalogoModelos(`respuesta incompatible de ${proveedor}`);
    const salida: ModeloDisponible[] = [];
    let intentados = 0;
    let ultimoFallo: unknown;
    for (const etiqueta of modelosDe(etiquetas, "models", proveedor)) {
      const id = texto(etiqueta.name);
      if (id === undefined) continue;
      intentados += 1;
      /**
       * El `/api/show` de UN modelo no puede tumbar la lista de todos.
       *
       * Medido contra el Ollama del usuario: `/api/tags` devolvía 26 modelos y dos de ellos
       * —`qwen3-vl:235b-cloud` y `deepseek-v3.1:671b-cloud`— contestaban **HTTP 410** con
       * «was retired at …». Siguen en el manifiesto local, así que `tags` los sigue
       * nombrando, pero ya no existen. Sin esta guarda el primer 410 lanzaba y el proveedor
       * entero se reportaba como no disponible: elegir «ollama» en el asistente no listaba
       * NADA y volvía al paso de proveedor, con 24 modelos perfectamente usables detrás.
       *
       * Saltárselo no es tragarse un fallo: un modelo que el servidor declara retirado no
       * está DISPONIBLE, y esta lista es la de los disponibles. Lo que sí sería tragárselo
       * es callar cuando fallan todos —eso no es «no hay modelos», es un servidor roto—, y
       * por eso se cuenta y se relanza abajo.
       */
      let detalle: unknown;
      try {
        detalle = await this.pedir(proveedor, unirUrl(baseUrl, "/api/show"), {
          method: "POST",
          headers: { ...cabeceras, "content-type": "application/json" },
          body: JSON.stringify({ model: id }),
        });
      } catch (error) {
        ultimoFallo = error;
        continue;
      }
      if (!esRegistro(detalle)) throw new ErrorCatalogoModelos(`respuesta incompatible de ${proveedor}`);
      const capacidades = detalle.capabilities;
      if (
        !Array.isArray(capacidades)
        || !capacidades.some((capacidad) => capacidad === "completion" || capacidad === "generate" || capacidad === "chat")
      ) continue;
      const contexto = contextoOllama(detalle.model_info);
      salida.push({ proveedor, id, ...(contexto === undefined ? {} : { contexto }) });
    }
    // Fallaron TODOS los que había: eso no es un catálogo vacío, es que no se puede hablar
    // con el servidor. Devolver `[]` aquí diría «no tienes modelos» a quien tiene veinte, y
    // el asistente lo trataría como un proveedor sin nada en vez de como una avería.
    if (salida.length === 0 && intentados > 0 && ultimoFallo !== undefined) throw ultimoFallo;
    return salida;
  }
}
