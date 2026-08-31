import { describe, it, expect, vi, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";
import { PassThrough } from "node:stream";
import * as readline from "node:readline";
import { entrarEnConsola, main } from "./main.js";
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

const inspeccionarFalso = async (_raiz: string): Promise<{ colecciones: number }> => ({ colecciones: 3 });

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
