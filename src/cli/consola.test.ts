import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, readFileSync, rmSync, statSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import {
  COMANDOS,
  correrConsola,
  ejecutarTurnoGuionizado,
  crearCompleter,
  hayEstadoDeProyecto,
  type Consola,
  type EstadoDeSesion,
  type EjecutorDeTurno,
} from "./consola.js";
import type { Piel } from "../core/turno.js";
import type { Escribir } from "./stdio.js";
import type { Preguntar } from "./aprobar.js";
import { rutaAuth, NOMBRE_CARPETA } from "../agent/configEnDisco.js";
import { CatalogoModelosEnMemoria, type CatalogoModelosPort } from "../core/ports.js";

/**
 * La costura del diseño: la consola de prueba lee de un generador con las líneas del test
 * y escribe en un acumulador, así que el lazo entero se recorre sin stdin ni stdout.
 *
 * El turno NUNCA se cuenta parseando la salida: se inyecta un `EjecutorDeTurno` falso que
 * apunta peticiones y estados, y la salida solo se mira para lo que la consola escribe.
 */

async function* lineasDe(...lineas: string[]): AsyncIterable<string> {
  for (const linea of lineas) yield linea;
}

const preguntarFalso: Preguntar = async () => "s";

function consolaDe(...lineas: string[]): { consola: Consola; salida: () => string } {
  return consolaDeConSecreto({ lineas });
}

function consolaDeConSecreto(opciones: {
  lineas: string[];
  interactivo?: boolean;
  leerSecreto?: (p: string) => Promise<string>;
  respuestas?: string[];
  catalogoModelos?: CatalogoModelosPort;
  guardarModeloGlobal?: (papel: "rapido" | "trabajo" | "afilado", id: string) => { ruta: string; id: string };
}): { consola: Consola; salida: () => string } {
  const {
    lineas,
    interactivo = false,
    leerSecreto,
    respuestas = [],
    catalogoModelos = new CatalogoModelosEnMemoria(),
    guardarModeloGlobal = (_papel, id) => ({ ruta: "/tmp/config.json", id }),
  } = opciones;
  let siguienteRespuesta = 0;
  let salida = "";
  const escribir: Escribir = (t) => {
    salida += t;
  };
  return {
    consola: {
      lineas: lineasDe(...lineas),
      escribir,
      preguntar: async () => respuestas[siguienteRespuesta++] ?? "",
      interactivo,
      catalogoModelos,
      guardarModeloGlobal,
      leerSecreto:
        leerSecreto ??
        (async () => {
          throw new Error("leerSecreto no esperado en este test");
        }),
    },
    salida: () => salida,
  };
}

function consolaDeConRespuestas(opciones: {
  lineas: string[];
  respuestas: string[];
  catalogo: CatalogoModelosPort;
  guardarModeloGlobal?: (papel: "rapido" | "trabajo" | "afilado", id: string) => { ruta: string; id: string };
}): { consola: Consola; salida: () => string } {
  return consolaDeConSecreto({
    ...opciones,
    catalogoModelos: opciones.catalogo,
  });
}

function estadoDe(): EstadoDeSesion {
  return { hilo: "xonecode-test", raiz: process.cwd(), fuentes: {} };
}

function ejecutorFalsoDe(turnos: Array<{ peticion: string; estado: EstadoDeSesion }>): EjecutorDeTurno {
  return async (peticion, estado) => {
    turnos.push({ peticion, estado });
  };
}

/** Crea `~/.xonecode/auth.json` dentro del HOME temporal, con 0700 en la carpeta y 0600. */
function plantarAuth(h: string, contenido: string): void {
  mkdirSync(join(h, NOMBRE_CARPETA), { recursive: true });
  chmodSync(join(h, NOMBRE_CARPETA), 0o700);
  const ruta = join(h, NOMBRE_CARPETA, "auth.json");
  writeFileSync(ruta, contenido);
  chmodSync(ruta, 0o600);
}

/**
 * Ninguna ventana de longitud 5 del secreto puede aparecer en la salida: es la versión
 * severa de «no contiene la clave completa» — caza también truncados y fragmentos.
 */
function sinFuga(texto: string, secreto: string): void {
  for (let i = 0; i <= secreto.length - 5; i++) {
    expect(texto).not.toContain(secreto.slice(i, i + 5));
  }
}

describe("hayEstadoDeProyecto", () => {
  it("solo detecta una memoria .xonecode del proyecto indicado", () => {
    const raiz = mkdtempSync(join(tmpdir(), "xc-estado-"));
    try {
      expect(hayEstadoDeProyecto(raiz)).toBe(false);
      mkdirSync(join(raiz, NOMBRE_CARPETA));
      // Configurar un modelo no basta: no hay trabajo de agente que reanudar.
      expect(hayEstadoDeProyecto(raiz)).toBe(false);
      writeFileSync(join(raiz, NOMBRE_CARPETA, "memoria.md"), "# Memoria\n");
      expect(hayEstadoDeProyecto(raiz)).toBe(true);
    } finally {
      rmSync(raiz, { recursive: true, force: true });
    }
  });
});

describe("correrConsola — turnos de prosa", () => {
  it("una línea normal produce un turno y una vacía no produce nada", async () => {
    const { consola, salida } = consolaDe("", "   ", "\t", "hola que tal");
    let turnos: Array<{ peticion: string; estado: EstadoDeSesion }> = [];
    const codigo = await correrConsola(consola, estadoDe(), ejecutorFalsoDe(turnos));

    expect(codigo).toBe(0);
    expect(turnos).toHaveLength(1);
    expect(turnos[0]!.peticion).toBe("hola que tal");
    // Un Enter de más no saca ni un error: no hay nada que hacer.
    expect(salida()).not.toContain("Error");
    expect(salida()).not.toContain("comando desconocido");
  });

  it("la costura piel: los actos del turno caen en ESA piel y NO en consola.escribir", async () => {
    // La piel de prueba apunta cada llamada: mismo contrato `Piel`, otro render (el de
    // la TUI será otro igual). Sin la costura, el turno guionizado pinta siempre por
    // `crearPielStdio(consola.escribir)` y este test no tiene dónde mirar.
    const actos: Array<[string, string]> = [];
    const pielDePrueba: Piel = {
      token: (t) => actos.push(["token", t]),
      cerrarLinea: () => actos.push(["cerrarLinea", ""]),
      linea: (t) => actos.push(["linea", t]),
      pausa: (p) => actos.push(["pausa", `${p.length}`]),
      fin: (ms) => actos.push(["fin", `${ms}`]),
      fase: (t) => actos.push(["fase", t]),
    };
    let salida = "";
    const consola: Consola = {
      ...consolaDe("dime un turno").consola,
      escribir: (t) => {
        salida += t;
      },
      piel: () => pielDePrueba,
    };

    await ejecutarTurnoGuionizado("dime un turno", estadoDe(), consola);

    // La respuesta del guion llegó a la piel inyectada, no al `escribir` de la consola.
    const tokens = actos.filter(([m]) => m === "token").map(([, t]) => t).join("");
    expect(tokens).toContain("Listo.");
    expect(actos[actos.length - 1]![0]).toBe("fin");
    // El plan del guion también: son actos `linea` de la misma piel.
    const lineas = actos.filter(([m]) => m === "linea").map(([, t]) => t).join("");
    expect(lineas).toContain("[GUION]");
    expect(salida).not.toContain("[GUION]");
    expect(salida).not.toContain("Listo.");
    // Y el aviso de agente de pega sí sale por la consola: no es un acto de piel.
    expect(salida).toContain("AGENTE DE PEGA");
  });
});

describe("correrConsola — /ayuda", () => {
  it("lista nombre y descripción de CADA entrada del registro COMANDOS", async () => {
    const { consola, salida } = consolaDe("/ayuda");
    await correrConsola(consola, estadoDe());

    const texto = salida();
    for (const [nombre, comando] of Object.entries(COMANDOS)) {
      expect(texto, `/ayuda no lista /${nombre}`).toContain(`/${nombre}`);
      expect(texto, `/ayuda no lista la descripción de /${nombre}`).toContain(comando.descripcion);
    }
  });
});

describe("correrConsola — fin de sesión", () => {
  it("/salir termina con 0 y NO procesa las líneas que quedaban", async () => {
    const { consola, salida } = consolaDe("/salir", "esto no es un turno");
    let turnos: Array<{ peticion: string; estado: EstadoDeSesion }> = [];
    const codigo = await correrConsola(consola, estadoDe(), ejecutorFalsoDe(turnos));

    expect(codigo).toBe(0);
    expect(turnos).toHaveLength(0);
    expect(salida()).toContain("hasta luego");
  });

  it("agotar las líneas (EOF) termina con el MISMO código que /salir", async () => {
    const { consola } = consolaDe("primera", "segunda");
    let turnos: Array<{ peticion: string; estado: EstadoDeSesion }> = [];
    const codigo = await correrConsola(consola, estadoDe(), ejecutorFalsoDe(turnos));

    expect(codigo).toBe(0);
    expect(turnos.map((t) => t.peticion)).toEqual(["primera", "segunda"]);
  });
});

describe("correrConsola — los fallos no tumban la sesión", () => {
  it("un comando de barra que lanza sigue la sesión y el error sale con su tipo", async () => {
    // COMANDOS es un Record exportado sin congelar: la entrada de prueba se añade y se
    // quita en `finally`, para no ensuciar a los demás tests aunque el expect falle.
    // La clave va en minúsculas porque el lazo compara el comando con `toLowerCase()`.
    COMANDOS["rompetest"] = {
      descripcion: "solo para el test",
      manejador: async () => {
        throw new Error("boom de prueba");
      },
    };
    try {
      const { consola, salida } = consolaDe("/rompetest", "/hilo");
      const codigo = await correrConsola(consola, estadoDe());

      expect(codigo).toBe(0);
      expect(salida()).toContain("Error: boom de prueba");
      // La sesión sigue viva: /hilo se procesó después del comando roto.
      expect(salida()).toContain("xonecode-test");
    } finally {
      delete COMANDOS["rompetest"];
    }
  });

  it("un turno que lanza tampoco la termina: el error sale con su tipo y /hilo sigue", async () => {
    const { consola, salida } = consolaDe("petición que revienta", "/hilo");
    const ejecutorQueLanza: EjecutorDeTurno = async () => {
      throw new Error("boom de turno");
    };
    const codigo = await correrConsola(consola, estadoDe(), ejecutorQueLanza);

    expect(codigo).toBe(0);
    expect(salida()).toContain("Error: boom de turno");
    // La sesión sobrevivió al turno roto: el comando posterior se procesó.
    expect(salida()).toContain("xonecode-test");
  });
});

describe("correrConsola — /modelo en caliente", () => {
  it("/modelo <p>/<m> cambia el estado y el turno siguiente lo recibe", async () => {
    const { consola, salida } = consolaDe("/modelo gemini/gemini-3.6-flash", "siguiente turno");
    let turnos: Array<{ peticion: string; estado: EstadoDeSesion }> = [];
    await correrConsola(consola, estadoDe(), ejecutorFalsoDe(turnos));

    expect(turnos[0]!.estado.fuentes.bandera).toBe("gemini/gemini-3.6-flash");
    expect(salida()).toContain("gemini/gemini-3.6-flash");
  });

  it("/modelo con el proveedor mal escrito NO cambia el estado y lista los válidos", async () => {
    const { consola, salida } = consolaDe("/modelo olama/x", "siguiente turno");
    let turnos: Array<{ peticion: string; estado: EstadoDeSesion }> = [];
    await correrConsola(consola, estadoDe(), ejecutorFalsoDe(turnos));

    // Un fallo de tecleo no deja la sesión apuntando a un modelo que revienta al construir.
    expect(turnos.length).toBe(1);
    expect(turnos[0]!.estado.fuentes.bandera).toBeUndefined();
    const texto = salida();
    expect(texto).toContain("olama");
    expect(texto).toContain("gemini");
    expect(texto).toContain("openai");
    expect(texto).toContain("anthropic");
    expect(texto).toContain("ollama");
  });

  it("/modelo-rapido y /modelo-trabajo encadenados dejan los DOS papeles puestos y los demás intactos", async () => {
    const { consola } = consolaDe(
      "/modelo-rapido gemini/gemini-2.5-flash",
      "/modelo-trabajo openai/gpt-4o-mini",
      "siguiente turno"
    );
    let turnos: Array<{ peticion: string; estado: EstadoDeSesion }> = [];
    await correrConsola(consola, estadoDe(), ejecutorFalsoDe(turnos));

    const porPapel = turnos[0]!.estado.fuentes.porPapel;
    expect(porPapel?.rapido).toBe("gemini/gemini-2.5-flash");
    expect(porPapel?.trabajo).toBe("openai/gpt-4o-mini");
    // Cada comando fija solo SU papel: ni la bandera ni los otros papeles se tocan.
    expect(porPapel?.afilado).toBeUndefined();
    expect(turnos[0]!.estado.fuentes.bandera).toBeUndefined();
  });
});

describe("correrConsola — /modelos", () => {
  const catalogoOpenAi = () =>
    new CatalogoModelosEnMemoria({
      openai: [
        { proveedor: "openai", id: "gpt-a", nombre: "GPT A" },
        { proveedor: "openai", id: "gpt-b", nombre: "GPT B", contexto: 128000 },
      ],
    });

  it("persiste el modelo filtrado para el papel elegido y lo activa en la sesión", async () => {
    vi.stubEnv("OPENAI_API_KEY", "clave-de-test");
    try {
      const guardados: Array<{ papel: string; id: string }> = [];
      const { consola, salida } = consolaDeConRespuestas({
        lineas: ["/modelos openai", "siguiente turno"],
        respuestas: ["b", "1", "trabajo"],
        catalogo: catalogoOpenAi(),
        guardarModeloGlobal: (papel, id) => {
          guardados.push({ papel, id });
          return { ruta: "/tmp/config.json", id };
        },
      });
      const turnos: Array<{ peticion: string; estado: EstadoDeSesion }> = [];
      await correrConsola(consola, estadoDe(), ejecutorFalsoDe(turnos));

      expect(salida()).toContain("1. GPT B (openai/gpt-b, ctx 128000)");
      expect(guardados).toEqual([{ papel: "trabajo", id: "openai/gpt-b" }]);
      expect(salida()).toContain("modelo trabajo: openai/gpt-b");
      expect(turnos[0]!.estado.fuentes.porPapel?.trabajo).toBe("openai/gpt-b");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("una variable de entorno ausente y sin auth.json deja el estado intacto", async () => {
    const h = homeTemporal();
    vi.stubEnv("OPENAI_API_KEY", undefined);
    try {
      const { consola, salida } = consolaDeConRespuestas({
        lineas: ["/modelos openai", "siguiente turno"],
        respuestas: [],
        catalogo: catalogoOpenAi(),
      });
      const turnos: Array<{ peticion: string; estado: EstadoDeSesion }> = [];
      await correrConsola(consola, estadoDe(), ejecutorFalsoDe(turnos));

      expect(salida()).toContain("falta la credencial para openai");
      expect(turnos[0]!.estado.fuentes.porPapel).toBeUndefined();
    } finally {
      vi.unstubAllEnvs();
      rmSync(h, { recursive: true, force: true });
    }
  });

  it("un proveedor desconocido deja el estado intacto", async () => {
    const { consola, salida } = consolaDeConRespuestas({
      lineas: ["/modelos noexiste", "siguiente turno"],
      respuestas: [],
      catalogo: new CatalogoModelosEnMemoria(),
    });
    const turnos: Array<{ peticion: string; estado: EstadoDeSesion }> = [];
    await correrConsola(consola, estadoDe(), ejecutorFalsoDe(turnos));

    expect(salida()).toContain("proveedor «noexiste» desconocido");
    expect(turnos[0]!.estado.fuentes.porPapel).toBeUndefined();
  });

  it("un catálogo vacío no cambia el estado", async () => {
    const { consola, salida } = consolaDeConRespuestas({
      lineas: ["/modelos ollama", "siguiente turno"],
      respuestas: [],
      catalogo: new CatalogoModelosEnMemoria(),
    });
    const turnos: Array<{ peticion: string; estado: EstadoDeSesion }> = [];
    await correrConsola(consola, estadoDe(), ejecutorFalsoDe(turnos));

    expect(salida()).toContain("no hay modelos disponibles para ollama");
    expect(turnos[0]!.estado.fuentes.porPapel).toBeUndefined();
  });

  it("un número inválido cancela sin cambiar el estado", async () => {
    vi.stubEnv("OPENAI_API_KEY", "clave-de-test");
    try {
      const { consola, salida } = consolaDeConRespuestas({
        lineas: ["/modelos openai", "siguiente turno"],
        respuestas: ["", "3"],
        catalogo: catalogoOpenAi(),
      });
      const turnos: Array<{ peticion: string; estado: EstadoDeSesion }> = [];
      await correrConsola(consola, estadoDe(), ejecutorFalsoDe(turnos));

      expect(salida()).toContain("número inválido");
      expect(turnos[0]!.estado.fuentes.porPapel).toBeUndefined();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("Enter al elegir el número cancela sin cambiar el estado", async () => {
    vi.stubEnv("OPENAI_API_KEY", "clave-de-test");
    try {
      const { consola, salida } = consolaDeConRespuestas({
        lineas: ["/modelos openai", "siguiente turno"],
        respuestas: ["", ""],
        catalogo: catalogoOpenAi(),
      });
      const turnos: Array<{ peticion: string; estado: EstadoDeSesion }> = [];
      await correrConsola(consola, estadoDe(), ejecutorFalsoDe(turnos));

      expect(salida()).toContain("selección cancelada");
      expect(turnos[0]!.estado.fuentes.porPapel).toBeUndefined();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("un fallo al guardar deja el estado intacto", async () => {
    vi.stubEnv("OPENAI_API_KEY", "clave-de-test");
    try {
      const { consola, salida } = consolaDeConRespuestas({
        lineas: ["/modelos openai", "siguiente turno"],
        respuestas: ["", "1", "afilado"],
        catalogo: catalogoOpenAi(),
        guardarModeloGlobal: () => {
          throw new Error("disco lleno");
        },
      });
      const turnos: Array<{ peticion: string; estado: EstadoDeSesion }> = [];
      await correrConsola(consola, estadoDe(), ejecutorFalsoDe(turnos));

      expect(salida()).toContain("Error: disco lleno");
      expect(turnos[0]!.estado.fuentes.porPapel).toBeUndefined();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("una bandera ganadora conserva el estado de sesión y explica que eclipsa lo guardado", async () => {
    const { consola, salida } = consolaDeConRespuestas({
      lineas: ["/modelos ollama", "siguiente turno"],
      respuestas: ["", "1", "trabajo"],
      catalogo: new CatalogoModelosEnMemoria({
        ollama: [{ proveedor: "ollama", id: "qwen3" }],
      }),
    });
    const turnos: Array<{ peticion: string; estado: EstadoDeSesion }> = [];
    const estado = { ...estadoDe(), fuentes: { bandera: "gemini/gemini-2.5-flash" } };
    await correrConsola(consola, estado, ejecutorFalsoDe(turnos));

    expect(salida()).toContain("guardado en global");
    expect(salida()).toContain("bandera");
    expect(salida()).not.toContain("modelo trabajo: ollama/qwen3");
    expect(turnos[0]!.estado.fuentes).toEqual(estado.fuentes);
  });

  it("dos selecciones consecutivas del mismo papel permanecen activas", async () => {
    vi.stubEnv("OPENAI_API_KEY", "clave-de-test");
    try {
      const { consola, salida } = consolaDeConRespuestas({
        lineas: ["/modelos openai", "/modelos openai", "siguiente turno"],
        respuestas: ["", "1", "trabajo", "", "2", "trabajo"],
        catalogo: catalogoOpenAi(),
      });
      const turnos: Array<{ peticion: string; estado: EstadoDeSesion }> = [];
      await correrConsola(consola, estadoDe(), ejecutorFalsoDe(turnos));

      expect(salida()).toContain("modelo trabajo: openai/gpt-a");
      expect(salida()).toContain("modelo trabajo: openai/gpt-b");
      expect(salida()).not.toContain("sigue activo el de bandera");
      expect(turnos[0]!.estado.fuentes.porPapel?.trabajo).toBe("openai/gpt-b");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("la configuración del proyecto también eclipsa la selección global sin mutar la sesión", async () => {
    const { consola, salida } = consolaDeConRespuestas({
      lineas: ["/modelos ollama", "siguiente turno"],
      respuestas: ["", "1", "afilado"],
      catalogo: new CatalogoModelosEnMemoria({
        ollama: [{ proveedor: "ollama", id: "qwen3" }],
      }),
    });
    const turnos: Array<{ peticion: string; estado: EstadoDeSesion }> = [];
    const estado = {
      ...estadoDe(),
      fuentes: { proyecto: { modelos: { afilado: "anthropic/claude-test" } } },
    };
    await correrConsola(consola, estado, ejecutorFalsoDe(turnos));

    expect(salida()).toContain("guardado en global");
    expect(salida()).toContain("proyecto");
    expect(turnos[0]!.estado.fuentes).toEqual(estado.fuentes);
  });
});

describe("correrConsola — /themes", () => {
  it("enumera los tres temas y aplica el elegido sin tocar el estado del agente", async () => {
    const { consola, salida } = consolaDeConSecreto({ lineas: ["/themes"], respuestas: ["2"] });
    const aplicarTema = vi.fn();
    const guardarTema = vi.fn(() => ({ ruta: "/tmp/proyecto/.xonecode/config.json", tema: "clear" }));
    consola.aplicarTema = aplicarTema;
    consola.guardarTemaDeProyecto = guardarTema;

    await correrConsola(consola, estadoDe(), ejecutorFalsoDe([]));

    expect(salida()).toContain("1. XOne");
    expect(salida()).toContain("2. Clear");
    expect(salida()).toContain("3. Midnight");
    expect(salida()).toContain("4. Graphite");
    expect(salida()).toContain("5. Ember");
    expect(aplicarTema).toHaveBeenCalledWith("clear");
    expect(guardarTema).toHaveBeenCalledWith("clear");
    expect(salida()).toContain("tema activo: Clear · guardado en /tmp/proyecto/.xonecode/config.json");
  });
});

describe("correrConsola — /connect-studio", () => {
  it("conecta, lista un resumen seguro de tools y persiste solo la URL", async () => {
    const { consola, salida } = consolaDeConSecreto({ lineas: ["/connect-studio https://mcp.example/mcp"] });
    const guardar = vi.fn((url: string, scopes: readonly string[]) => ({ ruta: "/proyecto/.xonecode/config.json", url, scopes: [...scopes] }));
    const conectar = vi.fn(async (url: string, scopes: readonly string[], informar: (texto: string) => void) => {
      informar("abriendo IDS…\n");
      return { url, scopes, herramientas: [{ nombre: "project_list", descripcion: "lista proyectos" }] };
    });
    consola.conectarCloudStudio = conectar;
    consola.guardarCloudStudioDeProyecto = guardar;

    await correrConsola(consola, estadoDe());

    expect(conectar).toHaveBeenCalledWith("https://mcp.example/mcp", expect.arrayContaining(["mcp.read"]), expect.any(Function));
    expect(guardar).toHaveBeenCalledWith("https://mcp.example/mcp", expect.arrayContaining(["openid", "mcp.read"]));
    expect(salida()).toContain("CloudStudio conectado (agente) · 1 herramientas");
    expect(salida()).toContain("project_list — lista proyectos");
  });

  it("el modo agente pide una vez los permisos de trabajo, sin mcp.admin", async () => {
    const { consola } = consolaDeConSecreto({ lineas: ["/connect-studio"] });
    const conectar = vi.fn(async (url: string, scopes: readonly string[]) => ({ url, scopes, herramientas: [] }));
    consola.conectarCloudStudio = conectar;
    consola.guardarCloudStudioDeProyecto = (url, scopes) => ({ ruta: "/tmp/config.json", url, scopes: [...scopes] });
    await correrConsola(consola, estadoDe());
    expect(conectar).toHaveBeenCalledWith(
      "https://mcp.xonewebstudio.com/mcp",
      expect.arrayContaining(["mcp.read", "mcp.write", "mcp.execute", "mcp.branch"]),
      expect.any(Function)
    );
    expect(conectar.mock.calls[0]?.[1]).not.toContain("mcp.admin");
  });
});

describe("correrConsola — comando desconocido", () => {
  it("no se manda al modelo: cero turnos y remite a /ayuda", async () => {
    const { consola, salida } = consolaDe("/verifyy");
    let turnos: Array<{ peticion: string; estado: EstadoDeSesion }> = [];
    await correrConsola(consola, estadoDe(), ejecutorFalsoDe(turnos));

    // Un `verifyy` mal escrito no puede costar un turno de LLM.
    expect(turnos).toHaveLength(0);
    expect(salida()).toContain("/verifyy");
    expect(salida()).toContain("/ayuda");
  });
});

describe("correrConsola — el hilo", () => {
  it("/hilo escribe el hilo actual; /nuevo lo cambia y un /hilo posterior lo ve nuevo", async () => {
    const { consola, salida } = consolaDe("/hilo", "/nuevo", "/hilo");
    const codigo = await correrConsola(consola, estadoDe());

    expect(codigo).toBe(0);
    const texto = salida();
    expect(texto).toContain("xonecode-test\n");

    const nuevo = /hilo nuevo: (\S+)/.exec(texto)?.[1];
    expect(nuevo).toBeDefined();
    expect(nuevo).not.toBe("xonecode-test");
    // El segundo /hilo, en la MISMA sesión, ya escribe el hilo nuevo.
    expect(texto.split(nuevo!).length - 1).toBeGreaterThanOrEqual(2);
  });
});

describe("correrConsola — comandos de diagnóstico", () => {
  it("/config /describe /doctor /verify corren sobre el repo real y la sesión sigue viva", async () => {
    const { consola, salida } = consolaDe("/config", "/describe", "/doctor", "/verify", "/hilo");
    let turnos: Array<{ peticion: string; estado: EstadoDeSesion }> = [];
    const codigo = await correrConsola(consola, estadoDe(), ejecutorFalsoDe(turnos));

    // Ni revienta ni consume un turno: son los mismos cmd* de la shell.
    expect(codigo).toBe(0);
    expect(turnos).toHaveLength(0);
    expect(salida()).toContain("xonecode-test");
  });
});

/** HOME temporal para los tests de /provider: nada toca el ~/.xonecode real. */
function homeTemporal(): string {
  const h = mkdtempSync(join(tmpdir(), "xc-home-"));
  vi.stubEnv("HOME", h);
  return h;
}

describe("correrConsola — /provider", () => {
  it("listado sin argumento marca lo plantado y NO filtra la clave ni fragmentos", async () => {
    const h = homeTemporal();
    try {
      plantarAuth(h, '{"anthropic":{"key":"sk-secreta-12345"}}');
      const { consola, salida } = consolaDe("/provider");
      await correrConsola(consola, estadoDe());

      const texto = salida();
      expect(texto).toContain("anthropic");
      expect(texto).toContain("✓ puesta");
      expect(texto).toContain("ollama");
      expect(texto).not.toMatch(/ollama\s+· sin credencial/);
      // Afirmaciones SOLO sobre lo plantado: el entorno puede llevar credenciales reales
      // de otros proveedores y eso no fallo de este test.
      sinFuga(texto, "sk-secreta-12345");
    } finally {
      rmSync(h, { recursive: true, force: true });
      vi.unstubAllEnvs();
    }
  });

  it("con argumento e interactivo guarda la clave con modo 0600/0700 y sin eco en la salida", async () => {
    const h = homeTemporal();
    try {
      const secreto = "sk-una-clave-de-test";
      const { consola, salida } = consolaDeConSecreto({
        lineas: ["/provider anthropic"],
        interactivo: true,
        leerSecreto: async () => secreto,
      });
      await correrConsola(consola, estadoDe());

      expect(statSync(rutaAuth()).mode & 0o777).toBe(0o600);
      expect(statSync(dirname(rutaAuth())).mode & 0o777).toBe(0o700);
      const grabado = JSON.parse(readFileSync(rutaAuth(), "utf8"));
      expect(grabado.anthropic.key).toBe(secreto);
      sinFuga(salida(), secreto);
    } finally {
      rmSync(h, { recursive: true, force: true });
      vi.unstubAllEnvs();
    }
  });

  it("guardar una credencial preserva las de los demás proveedores del auth.json previo", async () => {
    const h = homeTemporal();
    try {
      plantarAuth(h, '{"anthropic":{"key":"sk-existente"}}');
      const { consola } = consolaDeConSecreto({
        lineas: ["/provider gemini"],
        interactivo: true,
        leerSecreto: async () => "sk-de-gemini",
      });
      await correrConsola(consola, estadoDe());

      const grabado = JSON.parse(readFileSync(rutaAuth(), "utf8"));
      expect(grabado.anthropic.key).toBe("sk-existente");
      expect(grabado.gemini.key).toBe("sk-de-gemini");
    } finally {
      rmSync(h, { recursive: true, force: true });
      vi.unstubAllEnvs();
    }
  });

  it("auth.json roto: el error sale con su tipo, no se sobrescribe y la sesión sigue", async () => {
    const h = homeTemporal();
    try {
      const roto = "no es json{{";
      plantarAuth(h, roto);
      const { consola, salida } = consolaDeConSecreto({
        lineas: ["/provider openai", "/hilo"],
        interactivo: true,
        leerSecreto: async () => "sk-nueva",
      });
      const codigo = await correrConsola(consola, estadoDe());

      // El catch de correrConsola nunca se activó para AuthRotoEnDisco: salió por el
      // propio manejador y la sesión siguió hasta procesar /hilo.
      expect(codigo).toBe(0);
      expect(readFileSync(rutaAuth(), "utf8")).toBe(roto);
      const texto = salida();
      expect(texto).toContain("no se sobrescribe");
      expect(texto).toContain("Edita el fichero a mano");
      expect(texto).not.toContain("Error: ");
      expect(texto).toContain("xonecode-test");
    } finally {
      rmSync(h, { recursive: true, force: true });
      vi.unstubAllEnvs();
    }
  });

  it("sin TTY se rechaza, remite a editar auth.json a mano y leerSecreto NUNCA se llama", async () => {
    const h = homeTemporal();
    try {
      const { consola, salida } = consolaDeConSecreto({
        lineas: ["/provider anthropic"],
        interactivo: false,
        leerSecreto: async () => {
          throw new Error("leerSecreto no debe llamarse sin TTY");
        },
      });
      await correrConsola(consola, estadoDe());

      const texto = salida();
      expect(texto).toContain("sin TTY");
      expect(texto).toContain(".xonecode/auth.json");
      // Para ANTES de tocar disco: ni fichero ni carpeta creados.
      expect(existsSync(rutaAuth())).toBe(false);
    } finally {
      vi.unstubAllEnvs();
      rmSync(h, { recursive: true, force: true });
    }
  });
});

describe("crearCompleter", () => {
  it("fuera de una línea de barra no completa nada", () => {
    let salida = "";
    const [candidatos, reemplazo] = crearCompleter((t) => {
      salida += t;
    })("hola que tal");
    expect(candidatos).toEqual([]);
    expect(reemplazo).toBe("hola que tal");
    expect(salida).toBe("");
  });

  it("con '/prov' propone /provider", () => {
    const [candidatos] = crearCompleter(() => {})("/prov");
    expect(candidatos).toContain("/provider");
  });

  it("con varios candidatos lista NOMBRES y descripcion de COMANDOS", () => {
    let salida = "";
    const [candidatos] = crearCompleter((t) => {
      salida += t;
    })("/modelo");
    expect(candidatos).toEqual(
      expect.arrayContaining(["/modelo", "/modelo-rapido", "/modelo-trabajo", "/modelo-afilado"])
    );
    // readline por sí solo no pinta las descripciones: las escribe el completer.
    expect(salida).toContain(COMANDOS["modelo-rapido"]!.descripcion);
  });

  it("en prosa, tras una «@» completa FICHEROS del proyecto", () => {
    // Los ficheros se piden por función (no por lista fija): el completer se construye
    // UNA vez al arrancar y los ficheros del proyecto cambian durante la sesión.
    const ficheros = () => new Set(["app/Clientes.xne", "app/Proveedores.xne", "app.xml"]);
    let salida = "";
    const [candidatos, reemplazo] = crearCompleter(
      (t) => {
        salida += t;
      },
      ficheros
    )("abre @app/Cli");
    // Candidato = línea COMPLETA: readline sustituye la línea por el candidato que case,
    // no el trozo tras la @ (mismo pacto que con «/prov» → /provider).
    expect(candidatos).toEqual(["abre @app/Clientes.xne"]);
    expect(reemplazo).toBe("abre @app/Cli");
    expect(salida).toBe(""); // un solo candidato: se completa sin listar
  });

  it("varios ficheros que casan: los lista en píldoras, en un orden estable", () => {
    const ficheros = () => new Set(["app/Proveedores.xne", "app/Clientes.xne"]);
    let salida = "";
    const [candidatos] = crearCompleter(
      (t) => {
        salida += t;
      },
      ficheros
    )("abre @app/");
    expect(candidatos).toEqual(["abre @app/Clientes.xne", "abre @app/Proveedores.xne"]);
    // La lista es compacta (píldoras, no la tabla de comandos): una ruta no necesita
    // descripción al lado, y con proyectos de muchas colecciones la tabla no cabe.
    expect(salida).toContain("app/Clientes.xne   app/Proveedores.xne");
  });

  it("muchos ficheros: la lista de píldoras lleva TOPE y cuenta de lo que falta", () => {
    const ficheros = () =>
      new Set(Array.from({ length: 12 }, (_, i) => `app/Fichero${i}.xne`));
    let salida = "";
    const [, reemplazo] = crearCompleter(
      (t) => {
        salida += t;
      },
      ficheros
    )("abre @");
    expect(salida).toContain("… y 4 más"); // 12 ficheros, 8 pintados
    expect(reemplazo).toBe("abre @");
  });

  it("la @ solo completa ficheros; sin casar, no molesta", () => {
    const ficheros = () => new Set(["app/Clientes.xne"]);
    let salida = "";
    const [candidatos, reemplazo] = crearCompleter(
      (t) => {
        salida += t;
      },
      ficheros
    )("abre @zzz");
    expect(candidatos).toEqual([]);
    expect(reemplazo).toBe("abre @zzz");
    expect(salida).toBe("");
  });

  it("una ruta del ESPACIO VIRTUAL (con barra inicial) se ofrece RELATIVA", () => {
    // `ficherosDelProyecto` devuelve rutas como «/app/Clientes.xne» — es el espacio del
    // backend. Pero lo que se teclea tras la «@» es una ruta de proyecto, sin barra:
    // pedírsela al usuario sería un convenio interno de la tool escapándose al prompt.
    const ficheros = () => new Set(["/app/Clientes.xne", "/app.xml"]);
    const [candidatos] = crearCompleter(() => {}, ficheros)("abre @app/C");
    expect(candidatos).toEqual(["abre @app/Clientes.xne"]);
  });

  it("una prosa sin arroba sigue sin completar nada, aunque haya ficheros", () => {
    const ficheros = () => new Set(["app/Clientes.xne"]);
    let salida = "";
    const [candidatos, reemplazo] = crearCompleter(
      (t) => {
        salida += t;
      },
      ficheros
    )("hola que tal");
    expect(candidatos).toEqual([]);
    expect(reemplazo).toBe("hola que tal");
    expect(salida).toBe("");
  });
});
