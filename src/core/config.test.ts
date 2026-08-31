import { describe, it, expect } from "vitest";
import { validar, validarAuth } from "./config.js";

const RUTA = "/proyecto/.xonecode/config.json";
const RUTA_AUTH = "~/.xonecode/auth.json";

describe("validar", () => {
  it("acepta un fichero bueno completo y lo copia todo, sin avisos", () => {
    const { config, avisos } = validar(
      {
        modelo: "ollama/glm-5.3-flash:cloud",
        modelos: {
          rapido: "ollama/glm-5.3-flash:cloud",
          trabajo: "ollama/glm-5.3-flash:cloud",
          afilado: "ollama/kimi-k3:cloud",
        },
        ollama: { baseUrl: "http://localhost:11434" },
      },
      RUTA,
      "proyecto"
    );
    expect(config).toEqual({
      modelo: "ollama/glm-5.3-flash:cloud",
      modelos: {
        rapido: "ollama/glm-5.3-flash:cloud",
        trabajo: "ollama/glm-5.3-flash:cloud",
        afilado: "ollama/kimi-k3:cloud",
      },
      ollama: { baseUrl: "http://localhost:11434" },
    });
    expect(avisos).toEqual([]);
  });

  it("descarta y avisa una clave de primer nivel desconocida", () => {
    const { config, avisos } = validar(
      { modelo: "ollama/x", provdeedores: "typo" },
      RUTA,
      "proyecto"
    );
    expect(config).toEqual({ modelo: "ollama/x" });
    expect(avisos).toHaveLength(1);
    expect(avisos[0]!.severidad).toBe("aviso");
    expect(avisos[0]!.texto).toContain("provdeedores");
  });

  it("descarta y avisa un papel inventado dentro de modelos, conservando los buenos", () => {
    const { config, avisos } = validar(
      { modelos: { rapido: "ollama/x", rapidisimo: "ollama/y" } },
      RUTA,
      "proyecto"
    );
    expect(config.modelos).toEqual({ rapido: "ollama/x" });
    expect(avisos.some((a) => a.texto.includes("rapidisimo"))).toBe(true);
    expect(avisos.every((a) => a.severidad === "aviso")).toBe(true);
  });

  it("descarta y avisa un modelo que no es string", () => {
    const { config, avisos } = validar({ modelo: 42 }, RUTA, "proyecto");
    expect(config.modelo).toBeUndefined();
    expect(avisos).toHaveLength(1);
    expect(avisos[0]!.texto).toContain("modelo");
  });

  it("acepta contextos: topes de ventana fijados a mano, por id de modelo", () => {
    const { config, avisos } = validar(
      { contextos: { "ollama/glm-5.3-flash:cloud": 131072 } },
      RUTA,
      "proyecto"
    );
    expect(config.contextos).toEqual({ "ollama/glm-5.3-flash:cloud": 131072 });
    expect(avisos).toHaveLength(0);
  });

  it("descarta contextos que no es objeto", () => {
    const { config, avisos } = validar({ contextos: 131072 }, RUTA, "proyecto");
    expect(config.contextos).toBeUndefined();
    expect(avisos).toHaveLength(1);
    expect(avisos[0]!.texto).toContain("contextos");
  });

  it("descarta una entrada de contextos que no es un número positivo, conservando las buenas", () => {
    const { config, avisos } = validar(
      { contextos: { "ollama/bueno": 131072, "ollama/malo": "grande", "ollama/negativo": -1 } },
      RUTA,
      "proyecto"
    );
    expect(config.contextos).toEqual({ "ollama/bueno": 131072 });
    expect(avisos).toHaveLength(2);
    expect(avisos.some((a) => a.texto.includes("malo"))).toBe(true);
    expect(avisos.some((a) => a.texto.includes("negativo"))).toBe(true);
    expect(avisos.every((a) => a.severidad === "aviso")).toBe(true);
  });

  it("descarta el fichero entero si el JSON raíz no es objeto", () => {
    for (const bruto of [[1, 2], "texto", 42, null]) {
      const { config, avisos } = validar(bruto, RUTA, "global");
      expect(config).toEqual({});
      expect(avisos).toHaveLength(1);
      expect(avisos[0]!.severidad).toBe("aviso");
      expect(avisos[0]!.texto).toContain(RUTA);
    }
  });

  it.each([
    ["claves", { claves: { anthropic: "sk-x" } }],
    ["apiKey", { apiKey: "sk-x" }],
    ["api_key", { api_key: "sk-x" }],
    ["key", { key: "sk-x" }],
    ["secret", { secret: "sk-x" }],
    ["token", { token: "sk-x" }],
    ["proveedor con cadena", { anthropic: "sk-x" }],
  ])("RECHAZA con severidad grave la clave de API en forma: %s", (_nombre, bruto) => {
    const { config, avisos } = validar(bruto, RUTA, "proyecto");
    for (const prohibida of ["claves", "apiKey", "api_key", "key", "secret", "token", "anthropic"]) {
      expect(prohibida in config).toBe(false);
    }
    expect(avisos.some((a) => a.severidad === "grave")).toBe(true);
  });

  it("«ollama» como objeto es configuración válida; como cadena, es una clave rechazada", () => {
    const bueno = validar({ ollama: { baseUrl: "http://localhost:11434" } }, RUTA, "proyecto");
    expect(bueno.avisos).toEqual([]);
    expect(bueno.config.ollama).toEqual({ baseUrl: "http://localhost:11434" });

    const rechazado = validar({ ollama: "sk-x" }, RUTA, "proyecto");
    expect(rechazado.config.ollama).toBeUndefined();
    expect(rechazado.avisos.some((a) => a.severidad === "grave")).toBe(true);
  });

  it("el aviso de rechazo NUNCA contiene el valor, ni entero ni en trozos de más de 4", () => {
    const secreto = "sk-secreta-12345";
    const { avisos } = validar(
      { anthropic: secreto, apiKey: secreto, modelo: secreto },
      RUTA,
      "proyecto"
    );

    const textos = avisos.map((a) => a.texto).join("\n");
    expect(textos).not.toContain(secreto);

    // Trozos de longitud 5: que el valor no salga entero no basta — un truncado
    // «sk-se…» ya es información.
    for (let i = 0; i + 5 <= secreto.length; i++) {
      expect(textos).not.toContain(secreto.slice(i, i + 5));
    }
  });

  it("un mismo campo rechazado no sale también como desconocido (sin avisos duplicados)", () => {
    const { avisos } = validar({ apiKey: "sk-x" }, RUTA, "proyecto");
    expect(avisos).toHaveLength(1);
  });
});

describe("validarAuth", () => {
  const bueno = { anthropic: { type: "api", key: "sk-…" }, gemini: { key: "g-…" } };

  it("rechaza el fichero ENTERO si procedencia es proyecto (aviso grave)", () => {
    const { auth, avisos } = validarAuth(bueno, "/proy/.xonecode/auth.json", 0o600, "proyecto");
    expect(auth).toEqual({});
    expect(avisos).toHaveLength(1);
    expect(avisos[0]!.severidad).toBe("grave");
    expect(avisos[0]!.texto).toContain("/proy/.xonecode/auth.json");
  });

  it("acepta un fichero bien formado desde global", () => {
    const { auth, avisos } = validarAuth(bueno, RUTA_AUTH, 0o600, "global");
    expect(avisos).toEqual([]);
    expect(auth).toEqual({
      anthropic: { type: "api", key: "sk-…" },
      gemini: { key: "g-…" },
    });
  });

  it("avisa grave con chmod 600 si el modo deja leer a otros (0o644), y calla con 0o600", () => {
    const laxo = validarAuth({ gemini: { key: "g" } }, RUTA_AUTH, 0o644, "global");
    expect(laxo.avisos.some((a) => a.severidad === "grave" && a.texto.includes("chmod 600"))).toBe(
      true
    );
    expect(laxo.avisos.find((a) => a.texto.includes("chmod 600"))!.texto).toContain(RUTA_AUTH);
    // No impide seguir validando el contenido.
    expect(laxo.auth).toEqual({ gemini: { key: "g" } });

    const estrecho = validarAuth({ gemini: { key: "g" } }, RUTA_AUTH, 0o600, "global");
    expect(estrecho.avisos).toEqual([]);
  });

  it("acepta las dos formas de valor: {key: \"…\"} y la cadena suelta", () => {
    const { auth, avisos } = validarAuth(
      { anthropic: { type: "api", key: "sk-objeto" }, gemini: "g-cadena" },
      RUTA_AUTH,
      0o600,
      "global"
    );
    expect(avisos).toEqual([]);
    expect(auth.anthropic).toEqual({ type: "api", key: "sk-objeto" });
    expect(auth.gemini).toEqual({ key: "g-cadena" });
  });

  it("descarta y avisa una clave de proveedor desconocida y un valor que no es ni cadena ni {key}", () => {
    const { auth, avisos } = validarAuth(
      { openai: 123, desconocido: { key: "x" } },
      RUTA_AUTH,
      0o600,
      "global"
    );
    expect(auth).toEqual({});
    expect(avisos.some((a) => a.texto.includes("openai"))).toBe(true);
    expect(avisos.some((a) => a.texto.includes("desconocido"))).toBe(true);
  });
});