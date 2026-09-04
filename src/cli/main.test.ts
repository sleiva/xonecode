import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";
import { PassThrough } from "node:stream";
import * as readline from "node:readline";
import {
  entrarEnConsola,
  main,
  formatearBarra,
  crearCompleterDelProyecto,
  decidirTui,
  decidirPiel,
  parsearOpcionesWeb,
  ErrorDeUso,
  quiereRaton,
  extraerBanderasDeModelo,
  crearSincronizador,
  crearListaDeRamas,
  type PiezasDeSincronizacion,
} from "./main.js";
import { COMANDOS, MENSAJE_BIENVENIDA } from "./consola.js";
import type { Escribir } from "./stdio.js";
import { POR_OMISION, type FuentesDeEleccion } from "../core/modelos.js";
import { CatalogoModelos } from "../agent/catalogoModelos.js";
import { temaActivo } from "./tema.js";
import type { CloudStudioPort } from "../core/ports.js";
import { cargar } from "../agent/configEnDisco.js";

/**
 * La consola real se prueba sin stdin/stdout al estilo del resto del paquete: un
 * acumulador para `escribir` y un readline REAL sobre streams PassThrough (mismo patrón
 * que stdio.test.ts), así el `rl` emite `close` de verdad al cerrar el input y el
 * `for await` de correrConsola termina por EOF sin colgar el test.
 *
 * `inspeccionarProyecto` se falsea siempre: el real ejecuta `xone-simulator` como
 * proceso externo, y estos tests corren sin red ni procesos.
 */

function acumulador() {
  let texto = "";
  return { escribir: ((t: string) => (texto += t)) as Escribir, salida: () => texto };
}

/** readline real sobre PassThrough, con `lineas` ya escritas y el input CERRADO. */
function crearRlDe(...lineas: string[]): () => readline.Interface {
  return () => {
    const input = new PassThrough();
    const output = new PassThrough();
    output.resume(); // que la salida del rl no se quede empaquetada: nadie la lee
    if (lineas.length > 0) input.write(lineas.join("\n") + "\n");
    input.end(); // EOF inmediato: el lazo termina sin colgar el test
    return readline.createInterface({ input, output, terminal: false });
  };
}

/**
 * Readline para los tests del ASISTENTE: aquí el input no puede estar cerrado de
 * antemano, porque `rl.question` no contesta sobre un rl cerrado. Cada respuesta
 * se escribe cuando su pregunta aparece en el output del rl (el prompt de
 * `rl.question` es la señal de que hay alguien esperando), y el input se cierra
 * tras la última — EOF que termina el lazo de la consola.
 */
function crearRlPreguntable(...respuestas: string[]): () => readline.Interface {
  return () => {
    const input = new PassThrough();
    const output = new PassThrough();
    let siguiente = 0;
    output.on("data", () => {
      if (siguiente < respuestas.length) {
        input.write(respuestas[siguiente++] + "\n");
        if (siguiente === respuestas.length) input.end();
      }
    });
    return readline.createInterface({ input, output, terminal: false });
  };
}

/** Ejecuta primero un comando y alimenta después sus preguntas interactivas. */
function crearRlConComando(comando: string, ...respuestas: string[]): () => readline.Interface {
  return () => {
    const input = new PassThrough();
    const output = new PassThrough();
    let siguiente = 0;
    // Si el comando falla antes de preguntar (el estado rojo de la prueba de auth),
    // el EOF de guarda evita que el test se quede esperando cinco segundos.
    const eofDeGuarda = setTimeout(() => input.end(), 50);
    output.on("data", () => {
      if (siguiente < respuestas.length) {
        input.write(respuestas[siguiente++] + "\n");
        if (siguiente === respuestas.length) {
          clearTimeout(eofDeGuarda);
          input.end();
        }
      }
    });
    input.write(comando + "\n");
    return readline.createInterface({ input, output, terminal: false });
  };
}

const inspeccionarFalso = async (_raiz: string): Promise<{ colecciones: number; esProyectoXone: boolean }> => ({
  colecciones: 3,
  esProyectoXone: true,
});

let temporales: string[] = [];
const homeOriginal = process.env.HOME;
const openAiOriginal = process.env.OPENAI_API_KEY;
const modeloEntornoOriginal = process.env.XONECODE_MODELO;
function raizTemporal(): string {
  const r = mkdtempSync(join(tmpdir(), "xc-main-"));
  temporales.push(r);
  return r;
}
/**
 * AISLAMIENTO DEL ENTORNO. `main()` y `entrarEnConsola()` resuelven los modelos por
 * `cargar()`, que lee `~/.xonecode/config.json` con `homedir()` — o sea, `$HOME`. Sin
 * esta guarda, la suite lee la configuración REAL de quien la corre y los tests que
 * afirman sobre el modelo por omisión salen en rojo en cualquier máquina con un
 * `/modelo` global puesto (medido: con `gemini/…` en el global, 2 tests fallaban).
 * «`npm test` no puede necesitar una clave, una conexión ni el simulador» es el
 * invariante que sostiene el diseño de puertos: un test que depende del disco del
 * usuario lo rompe igual que uno que depende de la red.
 *
 * Se apunta HOME a un temporal VACÍO (no a uno con config): así el caso por omisión es
 * el que se prueba, y los tests que necesitan un global se fabrican el suyo encima.
 */
beforeEach(() => {
  process.env.HOME = raizTemporal();
  delete process.env.XONECODE_MODELO;
  delete process.env.OPENAI_API_KEY;
});

afterEach(() => {
  for (const r of temporales) rmSync(r, { recursive: true, force: true });
  temporales = [];
  if (homeOriginal === undefined) delete process.env.HOME;
  else process.env.HOME = homeOriginal;
  if (openAiOriginal === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = openAiOriginal;
  if (modeloEntornoOriginal === undefined) delete process.env.XONECODE_MODELO;
  else process.env.XONECODE_MODELO = modeloEntornoOriginal;
});

describe("main — la consola no se come los subcomandos", () => {
  it("main([\"describe\"]) corre el subcomando y NO entra en la consola", async () => {
    const espia = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      const codigo = await main(["describe"]);
      const texto = espia.mock.calls.map((c) => String(c[0])).join("");

      expect(codigo).toBe(0);
      // Algo reconocible de `describe` (monta deps offline y las describe) y, sobre todo,
      // NADA de la consola: ni su cabecera ni su lista de comandos.
      expect(texto.length).toBeGreaterThan(0);
      expect(texto).not.toContain("xonecode · ");
      expect(texto).not.toContain("colls)");
    } finally {
      espia.mockRestore();
    }
  });

  it("main([\"--help\"]) sigue imprimiendo AYUDA y no entra en la consola", async () => {
    const espia = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      const codigo = await main(["--help"]);
      const texto = espia.mock.calls.map((c) => String(c[0])).join("");

      expect(codigo).toBe(0);
      expect(texto).toContain("xonecode run");
      expect(texto).not.toContain("xonecode · ");
    } finally {
      espia.mockRestore();
    }
  });
});

describe("entrarEnConsola", () => {
  it("el completer de la consola completa @ficheros del ÁRBOL REAL, sin node_modules", () => {
    // El completer que monta la consola lee el árbol EN EL MOMENTO del Tab (función, no
    // lista fija): lo que se aprueba o se crea durante la sesión también se completa.
    const raiz = raizTemporal();
    mkdirSync(join(raiz, "app"));
    writeFileSync(join(raiz, "app", "Clientes.xne"), "<rep><coll …/></rep>");
    writeFileSync(join(raiz, "app.xml"), "<app …/>");
    mkdirSync(join(raiz, "node_modules"));
    writeFileSync(join(raiz, "node_modules", "paquete.xne"), "…");
    const completar = crearCompleterDelProyecto(raiz, () => {});

    // La ruta del espacio virtual («/app/…») se ofrece relativa, como se teclea.
    expect(completar("abre @app/Cli")[0]).toEqual(["abre @app/Clientes.xne"]);
    // Y node_modules nunca se ofrece, aunque haya un fichero que case.
    expect(completar("abre @node_modules/paquete")[0]).toEqual([]);
  });

  it("arranca: cabecera con basename, colecciones y modelo por omisión, y devuelve por EOF", async () => {
    const raiz = raizTemporal();
    const { escribir, salida } = acumulador();
    const fuentes: FuentesDeEleccion = {}; // para que caiga en POR_OMISION

    const codigo = await entrarEnConsola(fuentes, raiz, escribir, inspeccionarFalso, crearRlDe());

    // Devuelve: no se cuelga con el input cerrado.
    expect(codigo).toBe(0);
    const texto = salida();
    expect(texto).toContain(`xonecode · ${basename(raiz)}`);
    expect(texto).toContain("3 colls");
    const porOmision = `${POR_OMISION.trabajo.proveedor}/${POR_OMISION.trabajo.modelo}`;
    expect(texto).toContain(porOmision);
    // Sin el sufijo de origen que añade Modelos.descripcion().
    expect(texto).not.toContain(`${porOmision} (`);
    // Tracker en cero, formateado pequeño.
    expect(texto).toContain("0 tokens");
    expect(texto).toContain(MENSAJE_BIENVENIDA.trim());
  });

  it("la lista de comandos se GENERA del registro: contiene TODOS los de COMANDOS", async () => {
    const raiz = raizTemporal();
    const { escribir, salida } = acumulador();

    await entrarEnConsola({}, raiz, escribir, inspeccionarFalso, crearRlDe());

    const texto = salida();
    expect(texto).toContain(`${Object.keys(COMANDOS).length} comandos:`);
    for (const nombre of Object.keys(COMANDOS)) {
      expect(texto, `la cabecera no lista /${nombre}`).toContain(`/${nombre}`);
    }
  });

  it("carga el tema desde .xonecode/config.json del proyecto", async () => {
    const raiz = raizTemporal();
    mkdirSync(join(raiz, ".xonecode"));
    writeFileSync(join(raiz, ".xonecode", "config.json"), JSON.stringify({ tema: "midnight" }));
    const { escribir } = acumulador();

    await entrarEnConsola({}, raiz, escribir, inspeccionarFalso, crearRlDe());

    expect(temaActivo()).toBe("midnight");
  });

  it("tras /modelo la línea de estado se reimprime ya con el modelo nuevo", async () => {
    const raiz = raizTemporal();
    const { escribir, salida } = acumulador();

    const codigo = await entrarEnConsola(
      {},
      raiz,
      escribir,
      inspeccionarFalso,
      crearRlDe("/modelo ollama/llama3")
    );

    expect(codigo).toBe(0);
    const texto = salida();
    // La cabecera aparece al menos DOS veces: una al arrancar y otra tras el comando.
    const cabeceras = texto.split("xonecode · ").length - 1;
    expect(cabeceras).toBeGreaterThanOrEqual(2);
    // Y en esa segunda cabecera ya figura el modelo nuevo (el acuse de consola.ts
    // también lo contiene, así que comprobamos que llega tras el primer arranque).
    const trasArranque = texto.slice(texto.indexOf("\n") + 1);
    expect(trasArranque).toContain("ollama/llama3");
  });

  it("tras un acuse individual de trabajo la línea de estado refleja ese modelo", async () => {
    const raiz = raizTemporal();
    const { escribir, salida } = acumulador();

    await entrarEnConsola(
      {},
      raiz,
      escribir,
      inspeccionarFalso,
      crearRlDe("/modelo-trabajo ollama/qwen3")
    );

    const texto = salida();
    const trasArranque = texto.slice(texto.indexOf("\n") + 1);
    expect(trasArranque).toContain("ollama/qwen3");
    expect(texto.split("xonecode · ").length - 1).toBeGreaterThanOrEqual(2);
  });

  it("hidrata el modelo global antes de construir la cabecera", async () => {
    const casa = raizTemporal();
    const raiz = raizTemporal();
    mkdirSync(join(casa, ".xonecode"));
    writeFileSync(
      join(casa, ".xonecode", "config.json"),
      JSON.stringify({ modelos: { trabajo: "openai/gpt-global" } })
    );
    process.env.HOME = casa;
    const { escribir, salida } = acumulador();

    await entrarEnConsola({}, raiz, escribir, inspeccionarFalso, crearRlDe());

    expect(salida()).toContain("openai/gpt-global");
  });

  it("hidrata el modelo de proyecto y conserva su precedencia sobre el global", async () => {
    const casa = raizTemporal();
    const raiz = raizTemporal();
    mkdirSync(join(casa, ".xonecode"));
    mkdirSync(join(raiz, ".xonecode"));
    writeFileSync(
      join(casa, ".xonecode", "config.json"),
      JSON.stringify({ modelos: { trabajo: "openai/gpt-global" } })
    );
    writeFileSync(
      join(raiz, ".xonecode", "config.json"),
      JSON.stringify({ modelos: { trabajo: "anthropic/claude-proyecto" } })
    );
    process.env.HOME = casa;
    const { escribir, salida } = acumulador();

    await entrarEnConsola({}, raiz, escribir, inspeccionarFalso, crearRlDe());

    expect(salida()).toContain("anthropic/claude-proyecto");
    expect(salida()).not.toContain("openai/gpt-global");
  });

  it("la variable XONECODE_MODELO conserva precedencia sobre la configuración global", async () => {
    const casa = raizTemporal();
    const raiz = raizTemporal();
    mkdirSync(join(casa, ".xonecode"));
    writeFileSync(
      join(casa, ".xonecode", "config.json"),
      JSON.stringify({ modelos: { trabajo: "openai/gpt-global" } })
    );
    process.env.HOME = casa;
    process.env.XONECODE_MODELO = "anthropic/claude-entorno";
    const fuentes = extraerBanderasDeModelo([]).fuentes;
    const { escribir, salida } = acumulador();

    await entrarEnConsola(fuentes, raiz, escribir, inspeccionarFalso, crearRlDe());

    expect(salida()).toContain("anthropic/claude-entorno");
    expect(salida()).not.toContain("openai/gpt-global");
  });

  it("aplica auth.json antes de consultar el catálogo inyectado, sin red real", async () => {
    const casa = raizTemporal();
    const raiz = raizTemporal();
    mkdirSync(join(casa, ".xonecode"));
    writeFileSync(
      join(casa, ".xonecode", "auth.json"),
      JSON.stringify({ openai: { key: "sk-fixture-guardada" } }),
      { mode: 0o600 }
    );
    process.env.HOME = casa;
    delete process.env.OPENAI_API_KEY;
    const autorizaciones: Array<string | null> = [];
    const fetchFalso: typeof fetch = async (_entrada, init) => {
      autorizaciones.push(new Headers(init?.headers).get("authorization"));
      return new Response(JSON.stringify({ data: [{ id: "gpt-b" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };
    const catalogoModelos = new CatalogoModelos(fetchFalso);
    const { escribir, salida } = acumulador();

    await entrarEnConsola(
      {},
      raiz,
      escribir,
      inspeccionarFalso,
      crearRlConComando("/modelos openai", "", "1", "trabajo"),
      false,
      true,
      false,
      true,
      {
        catalogoModelos,
        guardarModeloGlobal: (_papel, id) => ({ ruta: join(casa, "config.json"), id }),
      }
    );

    expect(autorizaciones, salida()).toEqual(["Bearer sk-fixture-guardada"]);
  });

  it("no consulta el catálogo inyectado durante el arranque", async () => {
    const raiz = raizTemporal();
    const listar = vi.fn(async () => []);
    const { escribir } = acumulador();

    await entrarEnConsola(
      {},
      raiz,
      escribir,
      inspeccionarFalso,
      crearRlDe(),
      false,
      false,
      false,
      true,
      {
        catalogoModelos: { listar },
        guardarModeloGlobal: (_papel, id) => ({ ruta: "/tmp/config.json", id }),
      }
    );

    expect(listar).not.toHaveBeenCalled();
  });
});

describe("quiereRaton", () => {
  it("por omisión la TUI captura el ratón; --sin-raton lo apaga", () => {
    expect(quiereRaton([])).toBe(true);
    expect(quiereRaton(["--tui"])).toBe(true);
    expect(quiereRaton(["--sin-raton"])).toBe(false);
    expect(quiereRaton(["--tui", "--sin-raton", "--guion"])).toBe(false);
  });
});

describe("decidirTui", () => {
  /** El isTTY de stdout/stdin es de solo lectura para el test: se cambia y se restaura. */
  function conTty(stdout: boolean, stdin: boolean, probar: () => void): void {
    const antes = [Object.getOwnPropertyDescriptor(process.stdout, "isTTY"), Object.getOwnPropertyDescriptor(process.stdin, "isTTY")];
    Object.defineProperty(process.stdout, "isTTY", { value: stdout, configurable: true });
    Object.defineProperty(process.stdin, "isTTY", { value: stdin, configurable: true });
    try {
      probar();
    } finally {
      for (const [lado, descriptor] of [[process.stdout, antes[0]], [process.stdin, antes[1]]] as const) {
        if (descriptor === undefined) delete (lado as { isTTY?: boolean }).isTTY;
        else Object.defineProperty(lado, "isTTY", descriptor);
      }
    }
  }

  it("--no-tui gana sobre todo: fuerza stdio incluso con TTY", () => {
    conTty(true, true, () => expect(decidirTui(["--no-tui"])).toBe(false));
    conTty(true, true, () => expect(decidirTui(["--tui", "--no-tui"])).toBe(false));
  });

  it("--tui fuerza la TUI aunque no haya TTY (el guardián de stdin vive en main)", () => {
    conTty(false, false, () => expect(decidirTui(["--tui"])).toBe(true));
  });

  it("sin banderas: TTY → TUI, tubería → stdio", () => {
    conTty(true, true, () => expect(decidirTui([])).toBe(true));
    conTty(false, false, () => expect(decidirTui([])).toBe(false));
  });

  it("sin banderas exige TTY en AMBOS lados: stdout TTY con stdin de tubería es stdio", () => {
    // `echo /salir | xonecode` en un terminal real: la TUI se comería los bytes del
    // pipe como teclas y el EOF del pipe no termina el lazo. Solo los dos lados TTY.
    conTty(true, false, () => expect(decidirTui([])).toBe(false));
    conTty(false, true, () => expect(decidirTui([])).toBe(false));
  });
});

describe("decidirPiel", () => {
  it("por omisión es la consola de siempre: el cambio de omisión es una tarea posterior", () => {
    expect(decidirPiel([])).toBe("consola");
  });

  it("--web fuerza la web aunque no haya TTY (servidores headless)", () => {
    expect(decidirPiel(["--web"])).toBe("web");
  });

  it("--cli gana siempre, incluso frente a --web", () => {
    expect(decidirPiel(["--cli"])).toBe("consola");
    expect(decidirPiel(["--web", "--cli"])).toBe("consola");
  });
});

describe("parsearOpcionesWeb", () => {
  it("lee el puerto y la orden de no abrir el navegador", () => {
    expect(parsearOpcionesWeb(["--puerto", "4300", "--no-abrir"]))
      .toEqual({ puerto: 4300, abrir: false });
  });

  it("sin banderas, puerto por omisión y abre el navegador", () => {
    expect(parsearOpcionesWeb([])).toEqual({ puerto: 4173, abrir: true });
  });

  it("un puerto que no es un número es error de USO, no un puerto raro", () => {
    expect(() => parsearOpcionesWeb(["--puerto", "ocho"])).toThrow(ErrorDeUso);
  });

  it("el 7634 está reservado al callback OAuth y se rechaza", () => {
    expect(() => parsearOpcionesWeb(["--puerto", "7634"])).toThrow(ErrorDeUso);
  });
});

describe("main — la bandera --tui sin terminal es un error de uso, no un crash", () => {
  it("devuelve 64 con su mensaje en stderr, sin montar nada", async () => {
    // Sin TTY (los tests): decidirTui deja pasar la --tui forzada, y el guardián de
    // main la rechaza ANTES de montar ink.
    const errorEspia = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      const codigo = await main(["--tui"]);
      expect(codigo).toBe(64);
      expect(errorEspia.mock.calls.map((c) => String(c[0])).join("")).toContain("terminal interactivo");
    } finally {
      errorEspia.mockRestore();
    }
  });
});

describe("main — modelos inválidos en la configuración de la consola", () => {
  it("devuelve 64 y explica el formato sin propagar ModeloMalEscrito", async () => {
    const casa = raizTemporal();
    mkdirSync(join(casa, ".xonecode"));
    writeFileSync(
      join(casa, ".xonecode", "config.json"),
      JSON.stringify({ modelo: "basura-sin-barra" })
    );
    process.env.HOME = casa;
    delete process.env.XONECODE_MODELO;
    const errorEspia = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      await expect(main(["--no-tui"])).resolves.toBe(64);
      const error = errorEspia.mock.calls.map((c) => String(c[0])).join("");
      expect(error).toContain("«basura-sin-barra» no tiene la forma proveedor/modelo");
      expect(error).toContain("gemini, openai, anthropic, ollama");
    } finally {
      errorEspia.mockRestore();
    }
  });
});

describe("formatearBarra", () => {
  it("lleva el contexto con tope y porcentaje cuando todo se sabe", () => {
    expect(
      formatearBarra({ proyecto: "miapp", colecciones: 3, modelo: "ollama/x", tokens: 12_800, contexto: 12_400, tope: 200_000 })
    ).toBe("─ miapp (3 colls) · ollama/x · 12.8K tokens · ctx 12.4K/200K (6%) · /ayuda");
  });

  it("sin tope conocido, el contexto va SIN porcentaje (no se inventa la cifra)", () => {
    expect(
      formatearBarra({ proyecto: "miapp", colecciones: 0, modelo: "ollama/glm-5.3-flash:cloud", tokens: 500, contexto: 512 })
    ).toBe("─ miapp (0 colls) · ollama/glm-5.3-flash:cloud · 500 tokens · ctx 512 · /ayuda");
  });

  it("antes del primer turno no hay sección de contexto: no hay nada que medir", () => {
    expect(
      formatearBarra({ proyecto: "miapp", colecciones: 3, modelo: "ollama/x", tokens: 0, contexto: 0, tope: 200_000 })
    ).toBe("─ miapp (3 colls) · ollama/x · 0 tokens · /ayuda");
  });

  it("el tope se redondea a K (y a M a partir del millón)", () => {
    const barra = formatearBarra({ proyecto: "a", colecciones: 1, modelo: "m", tokens: 10, contexto: 10, tope: 131_072 });
    expect(barra).toContain("ctx 10/131K");
    expect(formatearBarra({ proyecto: "a", colecciones: 1, modelo: "m", tokens: 10, contexto: 10, tope: 1_000_000 })).toContain(
      "ctx 10/1M"
    );
  });
});

describe("entrarEnConsola — proyecto XOne ausente", () => {
  /** Doble con estado: la primera llamada ve una carpeta sin app.xml y la re-inspección ya lo ve. */
  function inspeccionarSinProyecto() {
    let llamadas = 0;
    return async (_raiz: string): Promise<{ colecciones: number; esProyectoXone: boolean }> => {
      llamadas++;
      return llamadas === 1
        ? { colecciones: 0, esProyectoXone: false }
        : { colecciones: 2, esProyectoXone: true };
    };
  }

  it("avisa al arrancar y ofrece crearlo; Enter a secas (No) no escribe NADA", async () => {
    const raiz = raizTemporal();
    const { escribir, salida } = acumulador();

    const codigo = await entrarEnConsola(
      {},
      raiz,
      escribir,
      inspeccionarSinProyecto(),
      crearRlPreguntable(""),
      false,
      true
    );

    expect(codigo).toBe(0);
    const texto = salida();
    expect(texto).toContain("no es un proyecto XOne");
    // La consola sigue viva: cabecera normal, no el fallo del primer turno de prosa.
    expect(texto).toContain("xonecode · ");
    expect(existsSync(join(raiz, "app.xml"))).toBe(false);
  });

  it("sí: pregunta los cuatro datos, escribe el esqueleto y re-inspecciona la cabecera", async () => {
    const raiz = raizTemporal();
    const { escribir, salida } = acumulador();

    const codigo = await entrarEnConsola(
      {},
      raiz,
      escribir,
      inspeccionarSinProyecto(),
      // s → crear; nombre; título; orientación; sin login.
      crearRlPreguntable("s", "GestionClientes", "Gestión de Clientes", "portrait", "n"),
      false,
      true
    );

    expect(codigo).toBe(0);
    expect(existsSync(join(raiz, "app.xml"))).toBe(true);
    expect(existsSync(join(raiz, "mappings.xne"))).toBe(true);
    expect(readFileSync(join(raiz, "app.ini"), "utf8")).toContain("Name=GestionClientes");
    // La cabecera ya no dice «0 colls»: se re-inspecciona tras crear.
    expect(salida()).toContain("2 colls");
  });

  it("un nombre con espacios se re-pregunta hasta que sea válido", async () => {
    const raiz = raizTemporal();
    const { escribir } = acumulador();

    await entrarEnConsola(
      {},
      raiz,
      escribir,
      inspeccionarSinProyecto(),
      crearRlPreguntable("s", "Gestion Clientes", "GestionClientes", "", "portrait", "n"),
      false,
      true
    );

    // El título vacío cae en el nombre; el fichero se crea con el nombre VÁLIDO.
    const ini = readFileSync(join(raiz, "app.ini"), "utf8");
    expect(ini).toContain("Name=GestionClientes");
    expect(ini).toContain("Title=GestionClientes");
  });

  it("sin TTY no pregunta: solo el aviso, y la consola sigue para los comandos", async () => {
    const raiz = raizTemporal();
    const { escribir, salida } = acumulador();

    const codigo = await entrarEnConsola(
      {},
      raiz,
      escribir,
      inspeccionarSinProyecto(),
      crearRlDe(),
      false,
      false
    );

    expect(codigo).toBe(0);
    const texto = salida();
    expect(texto).toContain("no es un proyecto XOne");
    expect(texto).toContain("xonecode · ");
    expect(existsSync(join(raiz, "app.xml"))).toBe(false);
  });
});

/** Planta un `.xonecode/config.json` con `cloudstudio` ya completo (Task 3-5 del alta). */
function raizConProyectoCloud(rama = "master"): string {
  const raiz = raizTemporal();
  mkdirSync(join(raiz, ".xonecode"), { recursive: true });
  writeFileSync(
    join(raiz, ".xonecode", "config.json"),
    JSON.stringify({
      cloudstudio: {
        url: "https://mcp.ejemplo.test/mcp",
        scopes: ["openid", "mcp.read"],
        proyecto: { id: "p-1", nombre: "Proyecto" },
        rama,
      },
    })
  );
  return raiz;
}

/** Un `CloudStudioPort` opaco: las piezas que lo consumen en estos tests están FALSEADAS
 * (`descargar`/`subirProyecto`/`pendientes`), así que nunca llaman a sus métodos de verdad. */
const PUERTO_OPACO = {} as CloudStudioPort;

function piezasFalsas(overrides: Partial<PiezasDeSincronizacion> = {}): PiezasDeSincronizacion {
  return {
    leerConfig: overrides.leerConfig ?? cargar,
    sesion: overrides.sesion ?? (async () => ({ invocar: async () => undefined, cerrar: async () => {} })),
    cliente: overrides.cliente ?? (() => PUERTO_OPACO),
    descargar:
      overrides.descargar ??
      (async ({ proyecto }) => ({
        proyecto,
        rama: "master",
        fecha: "2026-01-01T00:00:00.000Z",
        via: "zip" as const,
        manifiesto: [],
        descargados: [],
      })),
    preparar: overrides.preparar ?? (async () => "sha-falso"),
    pendientes: overrides.pendientes ?? (async () => []),
    limpio: overrides.limpio ?? (async () => true),
    sinCommitear: overrides.sinCommitear ?? (async () => []),
    subirProyecto: overrides.subirProyecto ?? (async () => ({ ok: [], fallos: [], omitidas: [] })),
  };
}

describe("crearSincronizador", () => {
  it("sin cloudstudio en el config, lo dice y no abre sesión", async () => {
    const raiz = raizTemporal();
    const sesion = vi.fn(piezasFalsas().sesion);
    const sincronizar = crearSincronizador(piezasFalsas({ sesion }));

    const resultado = await sincronizar("estado", raiz);

    expect(resultado).toEqual({ tipo: "texto", texto: expect.stringMatching(/no es cloud/i) });
    expect(sesion).not.toHaveBeenCalled();
  });

  it("«subir» con el árbol sucio se niega SIN llamar a subirProyecto ni abrir sesión", async () => {
    const raiz = raizConProyectoCloud();
    const sesion = vi.fn(piezasFalsas().sesion);
    const subirProyecto = vi.fn(piezasFalsas().subirProyecto);
    const sinCommitear = vi.fn(async () => ["app.xml"]);
    const sincronizar = crearSincronizador(
      piezasFalsas({ limpio: async () => false, sinCommitear, subirProyecto, sesion })
    );

    const resultado = await sincronizar("subir", raiz);

    // Esta es la guarda que una implementación ingenua se saltaría: sin ella, `subir`
    // llegaría a llamarse igual con el árbol sucio.
    expect(resultado).toEqual({ tipo: "arbol-sucio", accion: "subir", pendientes: ["app.xml"] });
    expect(subirProyecto).not.toHaveBeenCalled();
    expect(sesion).not.toHaveBeenCalled();
  });

  it("«bajar» con el árbol sucio se niega SIN descargar ni abrir sesión", async () => {
    // La descarga SOBRESCRIBE el disco (`extraerZipBase64` escribe encima; no hay ningún
    // `git merge` en la rama) y el baseline se construye DESPUÉS, así que sin commit
    // debajo el trabajo local no se recupera. Y se llega aquí sin escribir `/sync`: el
    // alta llama a `sincronizar("bajar", …)` al elegir modo cloud.
    const raiz = raizConProyectoCloud();
    const sesion = vi.fn(piezasFalsas().sesion);
    const descargar = vi.fn(piezasFalsas().descargar);
    const preparar = vi.fn(piezasFalsas().preparar);
    const sincronizar = crearSincronizador(
      piezasFalsas({ limpio: async () => false, sinCommitear: async () => ["app.xml"], descargar, preparar, sesion })
    );

    const resultado = await sincronizar("bajar", raiz);

    expect(resultado).toEqual({ tipo: "arbol-sucio", accion: "bajar", pendientes: ["app.xml"] });
    expect(descargar).not.toHaveBeenCalled();
    expect(preparar).not.toHaveBeenCalled();
    expect(sesion).not.toHaveBeenCalled();
  });

  it("cablea `informar`: los avisos deterministas de bajar llegan a quien llama", async () => {
    // Estaban todos escritos y no llegaban a ninguna parte: `informar` no se pasaba y su
    // valor por omisión es `() => {}`. Se tiraban «no se pudo listar», «el servidor
    // truncó el listado», «el ZIP falló; bajando fichero a fichero», la lista de qué
    // ficheros no se pudieron bajar y la config de git que se conservó. En este repo los
    // avisos son código y no prompt: un cable cortado los anula igual que borrarlos.
    const raiz = raizConProyectoCloud();
    const avisos: string[] = [];
    const descargar = vi.fn(async ({ proyecto, informar }: { proyecto: { id: string; nombre: string }; informar?: (t: string) => void }) => {
      informar?.("el ZIP falló (roto); bajando fichero a fichero\n");
      informar?.("no se pudo bajar «icons/logo.png»: File extension not allowed\n");
      return {
        proyecto,
        rama: "master",
        fecha: "2026-01-01T00:00:00.000Z",
        via: "parcial" as const,
        manifiesto: [],
        descargados: ["app.xml"],
      };
    });
    const preparar = vi.fn(async (_raiz: string, _rama: string, informar?: (t: string) => void) => {
      informar?.("se conserva tu configuración de git y no se toca: core.autocrlf=input\n");
      return "sha-falso";
    });
    const sincronizar = crearSincronizador(piezasFalsas({ descargar, preparar }));

    await sincronizar("bajar", raiz, undefined, (t) => avisos.push(t));

    const texto = avisos.join("");
    expect(texto).toContain("icons/logo.png");
    expect(texto).toContain("bajando fichero a fichero");
    expect(texto).toContain("core.autocrlf=input");
  });

  it("cablea `informar` también en subir", async () => {
    const raiz = raizConProyectoCloud();
    const avisos: string[] = [];
    const subirProyecto = vi.fn(async ({ informar }: { informar?: (t: string) => void }) => {
      informar?.("2 ficheros no subieron; la ref no se mueve\n");
      return { ok: [], fallos: [{ ruta: "a.xne", motivo: "x" }, { ruta: "b.xne", motivo: "y" }], omitidas: [] };
    });
    const sincronizar = crearSincronizador(piezasFalsas({ subirProyecto }));

    await sincronizar("subir", raiz, async () => true, (t) => avisos.push(t));

    expect(avisos.join("")).toContain("2 ficheros no subieron");
  });

  it("«bajar» descarga y DESPUÉS prepara el repo — nunca al revés", async () => {
    const raiz = raizConProyectoCloud();
    const orden: string[] = [];
    const descargar = vi.fn(async ({ proyecto }: { proyecto: { id: string; nombre: string } }) => {
      orden.push("descargar");
      return {
        proyecto,
        rama: "master",
        fecha: "2026-01-01T00:00:00.000Z",
        via: "zip" as const,
        manifiesto: [],
        descargados: ["app.xml", "Hola.xne"],
      };
    });
    const preparar = vi.fn(async (_raiz: string, rama: string) => {
      orden.push("preparar");
      expect(rama).toBe("master");
      return "sha-falso";
    });
    const sincronizar = crearSincronizador(piezasFalsas({ descargar, preparar }));

    const resultado = await sincronizar("bajar", raiz);

    expect(orden).toEqual(["descargar", "preparar"]);
    expect(resultado).toEqual({ tipo: "texto", texto: expect.stringContaining("bajados 2 ficheros (zip)") });
  });

  it("cierra la sesión en un `finally` incluso si la subida revienta", async () => {
    const raiz = raizConProyectoCloud();
    const cerrar = vi.fn(async () => {});
    const sesion = async () => ({ invocar: async () => undefined, cerrar });
    const subirProyecto = async () => {
      throw new Error("CloudStudio no responde");
    };
    const sincronizar = crearSincronizador(piezasFalsas({ sesion, subirProyecto }));

    await expect(sincronizar("subir", raiz)).rejects.toThrow("CloudStudio no responde");
    expect(cerrar).toHaveBeenCalledOnce();
  });

  it("«estado» informa la rama y cuántos ficheros locales quedan por subir", async () => {
    const raiz = raizConProyectoCloud();
    const pendientes = async () => [
      { clase: "nuevo" as const, ruta: "a.xne" },
      { clase: "modificado" as const, ruta: "app.xml" },
    ];
    const sincronizar = crearSincronizador(piezasFalsas({ pendientes }));

    const resultado = await sincronizar("estado", raiz);

    expect(resultado).toEqual({ tipo: "texto", texto: expect.stringContaining("rama master: 2 ficheros por subir") });
  });
});

describe("crearListaDeRamas", () => {
  it("sin url guardada (proyecto aún no elegido), no abre sesión y devuelve vacío", async () => {
    const raiz = raizTemporal();
    const sesion = vi.fn(async () => ({ invocar: async () => undefined, cerrar: async () => {} }));
    const ramas = crearListaDeRamas(raiz, { leerConfig: cargar, sesion, cliente: () => PUERTO_OPACO });

    expect(await ramas("Proyecto")).toEqual([]);
    expect(sesion).not.toHaveBeenCalled();
  });

  it("abre sesión, pide las ramas del proyecto y la cierra siempre", async () => {
    const raiz = raizConProyectoCloud();
    const cerrar = vi.fn(async () => {});
    const abrir = vi.fn(async () => {});
    const listar = vi.fn(async () => ["master", "dev"]);
    const puertoFalso = { abrir, ramas: listar } as unknown as CloudStudioPort;
    const ramas = crearListaDeRamas(raiz, {
      leerConfig: cargar,
      sesion: async () => ({ invocar: async () => undefined, cerrar }),
      cliente: () => puertoFalso,
    });

    expect(await ramas("Proyecto")).toEqual(["master", "dev"]);
    expect(abrir).toHaveBeenCalledWith("Proyecto");
    expect(cerrar).toHaveBeenCalledOnce();
  });
});
