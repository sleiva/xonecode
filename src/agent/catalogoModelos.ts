import type { Proveedor } from "../core/modelos.js";
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

function modelosDe(registro: Registro, campo: string): Registro[] {
  const valor = registro[campo];
  if (!Array.isArray(valor) || !valor.every(esRegistro)) {
    throw new ErrorCatalogoModelos("respuesta incompatible");
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

function esModeloOpenAiConversacional(id: string): boolean {
  const normalizado = id.toLowerCase();
  if (!esIdConversacional(normalizado)) return false;
  return /^(gpt|chatgpt|o[1-9]|codex)-/.test(normalizado);
}

/** Familias que un cliente de chat no debe ofrecer aunque una API las enumere. */
function esIdConversacional(id: string): boolean {
  return ![
    "embedding", "moderation", "transcri", "whisper", "tts", "audio", "voice",
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
    }
  }

  private clave(proveedor: "openai" | "anthropic" | "gemini"): string {
    const variable = {
      openai: "OPENAI_API_KEY",
      anthropic: "ANTHROPIC_API_KEY",
      gemini: "GOOGLE_API_KEY",
    }[proveedor];
    const clave = process.env[variable];
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
        throw new ErrorCatalogoModelos(`respuesta no disponible de ${proveedor}`);
      }
      try {
        return await respuesta.json();
      } catch {
        throw new ErrorCatalogoModelos(`respuesta incompatible de ${proveedor}`);
      }
    } catch (error) {
      if (error instanceof ErrorCatalogoModelos) {
        if (error.message === "respuesta incompatible") {
          throw new ErrorCatalogoModelos(`respuesta incompatible de ${proveedor}`);
        }
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
    return modelosDe(respuesta, "data").flatMap((modelo) => {
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
      for (const modelo of modelosDe(respuesta, "data")) {
        const id = texto(modelo.id);
        if (id === undefined || !esIdConversacional(id)) continue;
        const nombre = texto(modelo.display_name);
        const contexto = numero(modelo.max_input_tokens);
        salida.push({ proveedor: "anthropic", id, ...(nombre === undefined ? {} : { nombre }), ...(contexto === undefined ? {} : { contexto }) });
      }
      if (respuesta.has_more !== true) return salida;
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
      for (const modelo of modelosDe(respuesta, "models")) {
        const nombreRemoto = texto(modelo.name);
        const metodos = modelo.supportedGenerationMethods;
        if (nombreRemoto === undefined || !Array.isArray(metodos) || !metodos.includes("generateContent")) continue;
        const id = nombreRemoto.startsWith("models/") ? nombreRemoto.slice("models/".length) : undefined;
        if (id === undefined || id.length === 0 || !esIdConversacional(id)) continue;
        const nombre = texto(modelo.displayName);
        const contexto = numero(modelo.inputTokenLimit);
        salida.push({ proveedor: "gemini", id, ...(nombre === undefined ? {} : { nombre }), ...(contexto === undefined ? {} : { contexto }) });
      }
      const siguiente = texto(respuesta.nextPageToken);
      if (siguiente === undefined) return salida;
      if (vistos.has(siguiente)) break;
      vistos.add(siguiente);
      url = urlConParametro("https://generativelanguage.googleapis.com/v1beta/models", "pageToken", siguiente);
    }
    throw new ErrorCatalogoModelos("respuesta incompatible de gemini");
  }

  private async listarOllama(): Promise<ModeloDisponible[]> {
    const etiquetas = await this.pedir("ollama", unirUrlOllama("/api/tags"));
    if (!esRegistro(etiquetas)) throw new ErrorCatalogoModelos("respuesta incompatible de ollama");
    const salida: ModeloDisponible[] = [];
    for (const etiqueta of modelosDe(etiquetas, "models")) {
      const id = texto(etiqueta.name);
      if (id === undefined) continue;
      const detalle = await this.pedir("ollama", unirUrlOllama("/api/show"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: id }),
      });
      if (!esRegistro(detalle)) throw new ErrorCatalogoModelos("respuesta incompatible de ollama");
      const capacidades = detalle.capabilities;
      if (
        !Array.isArray(capacidades)
        || !capacidades.some((capacidad) => capacidad === "completion" || capacidad === "generate" || capacidad === "chat")
        || capacidades.some((capacidad) => typeof capacidad === "string" && ["vision", "image", "audio", "video", "embedding"].includes(capacidad))
      ) continue;
      const contexto = contextoOllama(detalle.model_info);
      salida.push({ proveedor: "ollama", id, ...(contexto === undefined ? {} : { contexto }) });
    }
    return salida;
  }
}
