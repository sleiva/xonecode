import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const CORE = dirname(fileURLToPath(import.meta.url));

/**
 * Lo que `core/` no puede tocar, y por qué.
 *
 * `core/` es la capa que decide QUÉ se le cuenta al usuario. Si importa langgraph acaba
 * hablando de chunks y de `checkpoint_ns`, y entonces no se puede probar sin montar un
 * grafo — que es justo lo que esta separación compra. Ink y React quedan fuera por el
 * mismo motivo por el lado contrario: la lógica del turno no puede necesitar un
 * renderizador para correr.
 */
const PROHIBIDOS = [
  "langchain",
  "@langchain/",
  "langgraph",
  "deepagents",
  "ink",
  "react",
  "@modelcontextprotocol",
];

function ficherosTs(dir: string): string[] {
  const salida: string[] = [];
  for (const entrada of readdirSync(dir)) {
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) salida.push(...ficherosTs(ruta));
    else if (entrada.endsWith(".ts")) salida.push(ruta);
  }
  return salida;
}

describe("la frontera de core/", () => {
  const ficheros = ficherosTs(CORE);

  it("hay ficheros que revisar (si no, este test no prueba nada)", () => {
    expect(ficheros.length).toBeGreaterThan(0);
  });

  for (const fichero of ficheros) {
    it(`${fichero.slice(CORE.length + 1)} no importa nada prohibido`, () => {
      const codigo = readFileSync(fichero, "utf8");
      // Solo las líneas de import/require: un prohibido citado en un comentario
      // —y este proyecto los cita mucho— no es una violación.
      const lineas = codigo
        .split("\n")
        .filter((l) => /^\s*(import|export)\s.*\sfrom\s|require\(/.test(l));
      const violaciones: string[] = [];
      for (const linea of lineas) {
        for (const prohibido of PROHIBIDOS) {
          if (linea.includes(`"${prohibido}`) || linea.includes(`'${prohibido}`)) {
            violaciones.push(`${prohibido} -> ${linea.trim()}`);
          }
        }
      }
      expect(violaciones).toEqual([]);
    });
  }
});