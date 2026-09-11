import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Modelos } from "./modelos.js";

/**
 * La COSTURA con `@langchain/anthropic`, que es lo que este repo exige de un contrato ajeno:
 * las dos decisiones de `core/` (el tope de salida y el razonamiento adaptativo) solo valen
 * si llegan al payload que el cliente va a mandar, y eso no lo ve ningún test de la tabla.
 *
 * Se construye el `ChatAnthropic` de VERDAD y se lee su `invocationParams()`, que es el
 * método público con el que él mismo compone la petición. Sin red: construir un cliente y
 * preguntarle sus parámetros no llama a nadie.
 *
 * El día que la dependencia cambie de sitio el `max_tokens` o deje de omitir `thinking`
 * cuando no se fija (su línea 781 hoy), esto cae — que es el único aviso posible, porque el
 * otro camino es un 400 en producción o una respuesta cortada en silencio.
 */
describe("el cliente de Anthropic, contra su propio invocationParams", () => {
  const anterior = process.env.ANTHROPIC_API_KEY;
  beforeEach(() => {
    // Una clave de pega: el constructor la exige, y aquí no se llama a nadie.
    process.env.ANTHROPIC_API_KEY = "sk-ant-de-pega";
  });
  afterEach(() => {
    if (anterior === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = anterior;
  });

  /** Los parámetros con que el cliente compondría la petición de ese modelo. */
  const parametrosDe = (modelo: string): { max_tokens?: number; thinking?: unknown } => {
    const cliente = new Modelos({ bandera: `anthropic/${modelo}` }).paraPapel("trabajo");
    const conParams = cliente as { invocationParams: () => { max_tokens?: number; thinking?: unknown } };
    return conParams.invocationParams();
  };

  it("el tope de salida viaja en el payload, también para un id que la dependencia no conoce", () => {
    // `claude-sonnet-5` es el caso medido: su tabla por prefijo no lo tiene
    // (`claude-sonnet-4` no es prefijo de `claude-sonnet-5`), así que sin esto heredaba su
    // `FALLBACK_MAX_OUTPUT_TOKENS` de 4096 y cortaba las escrituras a media respuesta.
    expect(parametrosDe("claude-sonnet-5").max_tokens).toBe(16_384);
    expect(parametrosDe("claude-opus-5").max_tokens).toBe(16_384);
  });

  it("a la generación 4.6-4.8 se le PIDE el razonamiento adaptativo", () => {
    // Sin pedirlo, la dependencia omite `thinking` y esos modelos corren sin pensar.
    expect(parametrosDe("claude-opus-4-8").thinking).toEqual({ type: "adaptive" });
    expect(parametrosDe("claude-sonnet-4-6").thinking).toEqual({ type: "adaptive" });
  });

  it("y a los que NO lo aceptan no se les manda el campo: mandarlo sería un 400", () => {
    // Haiku 4.5 y lo anterior a 4.6 usan `{type:"enabled", budget_tokens:N}`. Y Opus 5 /
    // Sonnet 5 ya corren adaptativo por omisión, así que tampoco se les manda nada.
    expect(parametrosDe("claude-haiku-4-5").thinking).toBeUndefined();
    expect(parametrosDe("claude-3-5-sonnet").thinking).toBeUndefined();
    expect(parametrosDe("claude-opus-5").thinking).toBeUndefined();
    expect(parametrosDe("claude-sonnet-5").thinking).toBeUndefined();
  });
});
