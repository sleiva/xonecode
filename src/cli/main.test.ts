import { describe, it, expect, vi, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";
import { PassThrough } from "node:stream";
import * as readline from "node:readline";
import { entrarEnConsola, main, formatearBarra, crearCompleterDelProyecto, decidirTui, quiereRaton } from "./main.js";
import { COMANDOS } from "./consola.js";
import type { Escribir } from "./stdio.js";
import { POR_OMISION, type FuentesDeEleccion } from "../core/modelos.js";

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

const inspeccionarFalso = async (_raiz: string): Promise<{ colecciones: number; esProyectoXone: boolean }> => ({
  colecciones: 3,
  esProyectoXone: true,
});

let temporales: string[] = [];
function raizTemporal(): string {
  const r = mkdtempSync(join(tmpdir(), "xc-main-"));
  temporales.push(r);
  return r;
}
afterEach(() => {
  for (const r of temporales) rmSync(r, { recursive: true, force: true });
  temporales = [];
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
