import { describe, it, expect } from "vitest";
import { render } from "ink-testing-library";
import { Entrada } from "./entrada.js";

/** Escribe una secuencia de teclas en el stdin falso de ink-testing-library. */
async function teclear(instancia: { stdin: { write: (d: string) => void } }, texto: string): Promise<void> {
  // Un tick antes de la primera tecla: el cable de useInput se asienta tras el
  // primer frame de Ink, y una tecla anterior se perdería en el stdin falso.
  await esperar();
  for (const letra of texto) {
    instancia.stdin.write(letra);
    await esperar();
  }
}
const esperar = (): Promise<void> => new Promise((r) => setTimeout(r, 10));

describe("entrada", () => {
  it("escribe, envía con Enter y vacía el campo", async () => {
    const enviadas: string[] = [];
    const instancia = render(
      <Entrada alEnviar={(l) => enviadas.push(l)} completa={() => [[], ""]} ocupado={false} historial={[]} modelo="ollama/glm" />
    );
    await teclear(instancia, "hola");
    instancia.stdin.write("\r");
    await esperar();
    expect(enviadas).toEqual(["hola"]);
    expect(instancia.lastFrame()).not.toContain("hola\rhola");
  });

  it("Tab completa un comando único", async () => {
    const instancia = render(
      <Entrada
        alEnviar={() => {}}
        completa={(linea) => (linea === "/conf" ? [["/config"], linea] : [[], linea])}
        ocupado={false}
        historial={[]}
        modelo="ollama/glm"
      />
    );
    await teclear(instancia, "/conf");
    instancia.stdin.write("\t");
    await esperar();
    expect(instancia.lastFrame()).toContain("/config");
  });

  it("↑/↓ recorren el historial: lo más reciente primero, y ↓ devuelve a la línea vacía", async () => {
    // Contrato: el historial llega con la MÁS RECIENTE en el índice 0.
    const instancia = render(
      <Entrada
        alEnviar={() => {}}
        completa={() => [[], ""]}
        ocupado={false}
        historial={["reciente", "antigua"]}
        modelo="ollama/glm"
      />
    );
    await esperar();
    instancia.stdin.write("\x1b[A"); // ↑ → la más reciente
    await esperar();
    expect(instancia.lastFrame()).toContain("reciente");
    instancia.stdin.write("\x1b[A"); // ↑ → la anterior
    await esperar();
    expect(instancia.lastFrame()).toContain("antigua");
    instancia.stdin.write("\x1b[B"); // ↓ → de vuelta
    await esperar();
    expect(instancia.lastFrame()).toContain("reciente");
    instancia.stdin.write("\x1b[B"); // ↓ → la línea en edición (vacía)
    await esperar();
    expect(instancia.lastFrame()).not.toContain("reciente");
  });

  it("↓ desde la línea en edición no inventa nada: el campo queda vacío y Enter no envía", async () => {
    // El bug que esto fija: ↓ con indiceHistorial === -1 calculaba -2 y pintaba
    // `undefined`; lo escrito después se pegaba detrás («undefinedhola») y Enter
    // lanzaba un TypeError sin catch.
    const enviadas: string[] = [];
    const instancia = render(
      <Entrada
        alEnviar={(l) => enviadas.push(l)}
        completa={() => [[], ""]}
        ocupado={false}
        historial={["reciente"]}
        modelo="ollama/glm"
      />
    );
    await esperar();
    instancia.stdin.write("\x1b[B"); // ↓ sin haber subido: ya estás en la línea en edición
    await esperar();
    expect(instancia.lastFrame()).not.toContain("undefined");
    // Lo que se escriba después es texto limpio, no una cola pegada a `undefined`.
    await teclear(instancia, "hola");
    expect(instancia.lastFrame()).toContain("hola");
    instancia.stdin.write("\r");
    await esperar();
    expect(enviadas).toEqual(["hola"]);
  });

  it("Tab con varios candidatos no completa: enseña hasta 8 pistas y deja el texto", async () => {
    const instancia = render(
      <Entrada
        alEnviar={() => {}}
        completa={() => [["/config", "/conectar", "/conectar2"], "/con"]}
        ocupado={false}
        historial={[]}
        modelo="ollama/glm"
      />
    );
    await teclear(instancia, "/con");
    instancia.stdin.write("\t");
    await esperar();
    const salida = instancia.lastFrame() ?? "";
    expect(salida).toContain("fig"); // la pista es el candidato sin su base
    expect(salida).toContain("ectar");
    expect(salida).toContain("ectar2");
    expect(salida).toContain("/con▏"); // el texto sigue igual: completar era ambiguo
  });

  it("ocupado deshabilita la entrada y enseña el turno en marcha", async () => {
    const enviadas: string[] = [];
    const instancia = render(
      <Entrada
        alEnviar={(l) => enviadas.push(l)}
        completa={() => [[], ""]}
        ocupado={true}
        historial={[]}
        modelo="ollama/glm"
      />
    );
    await teclear(instancia, "hola");
    instancia.stdin.write("\r");
    await esperar();
    expect(enviadas).toEqual([]);
    expect(instancia.lastFrame()).toContain("turno en curso");
    expect(instancia.lastFrame()).not.toContain("hola");
  });

  it("es un bloque con barra izquierda y una segunda fila con el modelo, también ocupada", async () => {
    const libre = render(
      <Entrada alEnviar={() => {}} completa={() => [[], ""]} ocupado={false} historial={[]} modelo="ollama/glm" />
    );
    await esperar();
    const salidaLibre = libre.lastFrame() ?? "";
    expect(salidaLibre.trimStart().startsWith("▌")).toBe(true);
    expect(salidaLibre).not.toContain("╭");
    expect(salidaLibre).not.toContain("╰");
    expect(salidaLibre).toContain("▏");
    expect(salidaLibre).toContain("ollama/glm");

    const ocupada = render(
      <Entrada alEnviar={() => {}} completa={() => [[], ""]} ocupado={true} historial={[]} modelo="ollama/glm" />
    );
    await esperar();
    expect(ocupada.lastFrame()).toContain("turno en curso");
    expect(ocupada.lastFrame()).toContain("ollama/glm");
  });
});
