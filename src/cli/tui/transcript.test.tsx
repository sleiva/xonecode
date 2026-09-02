/**
 * El viewport del transcript, probado por su frame (ink-testing-library) y por la
 * lógica PURA de la ventana.
 *
 * El scroll de teclas se prueba de las dos maneras: los cálculos de ventana y de
 * desfase viven en funciones puras exportadas (fiables, sin terminal detrás), y una
 * única prueba escribe la secuencia PageUp en el stdin falso para probar el cable
 * `useInput` → desfase. Si la emulación de teclado se demostrara frágil, las puras
 * sostienen el comportamiento y la de teclas se retira sin perder cobertura.
 */
import { describe, it, expect } from "vitest";
import { Box } from "ink";
import { render } from "ink-testing-library";
import { Transcript, ventanaDe, moverDesfase } from "./transcript.js";
import { crearStore } from "./store.js";

const esperar = (): Promise<void> => new Promise((r) => setTimeout(r, 10));

/** Diez actos tool numerados, para hablar de la ventana por su contenido. */
const diez = (): { tipo: "tool"; texto: string }[] =>
  Array.from({ length: 10 }, (_, i) => ({ tipo: "tool", texto: `t${i}` }));

describe("la ventana pura del transcript", () => {
  it("sin desfase toma los ÚLTIMOS actos que caben", () => {
    expect(ventanaDe(diez(), 3, 0).map((a) => a.texto)).toEqual(["t7", "t8", "t9"]);
  });

  it("con desfase sube la ventana, y no se sale por abajo ni por arriba", () => {
    expect(ventanaDe(diez(), 3, 4).map((a) => a.texto)).toEqual(["t3", "t4", "t5"]);
    // Desfase mayor que el contenido: la ventana queda vacía antes que inventar actos.
    expect(ventanaDe(diez(), 3, 20)).toEqual([]);
    expect(ventanaDe([], 3, 0)).toEqual([]);
  });

  it("moverDesfase acota entre 0 y el total", () => {
    expect(moverDesfase(0, 30, 10)).toBe(10);
    expect(moverDesfase(25, 30, 10)).toBe(30);
    expect(moverDesfase(5, 30, -10)).toBe(0);
  });
});

describe("el transcript pintado", () => {
  it("pinta los últimos actos y el colchón como línea en curso", () => {
    const s = crearStore();
    s.usuario("hola");
    s.token("¡Hola! **listo**\n");
    const { lastFrame } = render(<Transcript store={s} altura={10} />);
    const salida = lastFrame() ?? "";
    expect(salida).toContain("▌ hola");
    expect(salida).not.toContain("❯");
    expect(salida).toContain("¡Hola! listo");
    expect(salida).not.toContain("**");
  });

  it("con más actos que altura, la ventana vive al fondo", () => {
    const s = crearStore();
    for (let i = 0; i < 30; i++) s.linea(`línea ${i}`);
    const { lastFrame } = render(<Transcript store={s} altura={5} />);
    expect(lastFrame()).toContain("línea 29");
    expect(lastFrame()).not.toContain("línea 0\n");
  });

  it("el markdown del asistente: cabecera, viñeta y código sin marcadores", () => {
    const s = crearStore();
    s.linea("## Resumen", "asistente");
    s.linea("- punto uno", "asistente");
    s.linea("usa `xne` ya", "asistente");
    const { lastFrame } = render(<Transcript store={s} altura={10} />);
    const salida = lastFrame() ?? "";
    expect(salida).toContain("Resumen");
    expect(salida).not.toContain("##");
    expect(salida).toContain("• punto uno");
    expect(salida).toContain("usa xne ya");
    expect(salida).not.toContain("`");
  });

  it("cada acto se pinta por su tipo", () => {
    const s = crearStore({ ahora: () => 1000 });
    s.usuario("hazlo");
    s.linea("→ lee app.xne", "tool");
    s.linea("aviso honesto", "sistema");
    s.fase("planificando");
    s.fin(2400);
    const { lastFrame } = render(<Transcript store={s} altura={10} />);
    const salida = lastFrame() ?? "";
    expect(salida).toContain("▌ hazlo");
    expect(salida).toContain("→ lee app.xne");
    expect(salida).toContain("aviso honesto");
    // El fin cierra la fase viva con su duración, y él mismo se pinta con la suya.
    expect(salida).toContain("+ planificando: 0.0s");
    expect(salida).toContain("■ 2.4s");
    expect(salida).not.toContain("(2.4s)");
  });

  it("el fin con modelo se pinta como «■ modelo · Ns»", () => {
    const s = crearStore();
    s.fin(1800, "ollama/glm");
    expect(render(<Transcript store={s} altura={5} />).lastFrame()).toContain("■ ollama/glm · 1.8s");
  });

  it("PageUp sube la ventana y un acto nuevo la reancla al fondo", async () => {
    const s = crearStore();
    for (let i = 0; i < 30; i++) s.linea(`línea ${i}`);
    const instancia = render(<Transcript store={s} altura={5} />);
    // Un tick antes de teclear: los efectos de Ink (el cable de useInput) se asientan
    // después del primer frame, y una tecla anterior se perdería en el stdin falso.
    await esperar();
    instancia.stdin.write("\x1b[5~"); // PageUp
    await esperar();
    expect(instancia.lastFrame()).toContain("línea 19");
    expect(instancia.lastFrame()).not.toContain("línea 29");
    // Lo nuevo manda: la ventana vuelve al fondo sin que el usuario pida nada.
    s.linea("acto nuevo");
    await esperar();
    expect(instancia.lastFrame()).toContain("línea 29");
    expect(instancia.lastFrame()).toContain("acto nuevo");
  });

  it("el bloque de usuario ocupa UNA fila: barra izquierda, sin borde arriba ni abajo", () => {
    // `ventanaDe` cuenta un acto como una fila. Un Box con borde arriba/abajo o padding
    // vertical serían tres, y la ventana se saldría de la pantalla.
    const s = crearStore();
    s.usuario("uno");
    s.usuario("dos");
    s.usuario("tres");
    const { lastFrame } = render(<Transcript store={s} altura={10} />);
    const lineas = (lastFrame() ?? "").split("\n").filter((l) => l.trim() !== "");
    expect(lineas).toHaveLength(3);
    for (const linea of lineas) expect(linea.trimStart().startsWith("▌")).toBe(true);
  });

  it("con pocos actos el transcript llena la altura del padre y el contenido nace ARRIBA", () => {
    const s = crearStore();
    s.usuario("hola");
    s.linea("→ x");
    // La altura la pone el PADRE: el transcript es elástico (`flexGrow`), porque en la
    // App es la única pieza que cede. Ocupa las 10 filas y, como en OpenCode, el
    // contenido se apoya arriba: el hueco queda entre la conversación y la Entrada. El
    // recorte cuando NO cabe sigue siendo por arriba (el test siguiente).
    const { lastFrame } = render(
      <Box height={10} flexDirection="column">
        <Transcript store={s} altura={10} />
      </Box>
    );
    const lineas = (lastFrame() ?? "").split("\n");
    expect(lineas).toHaveLength(10);
    expect(lineas[0]).toContain("hola");
    expect(lineas[1]).toContain("→ x");
    expect(lineas.at(-1)!.trim()).toBe("");
  });

  it("cuando NO cabe, el recorte sigue siendo por arriba: lo nuevo se ve, lo viejo se pierde", () => {
    const s = crearStore();
    for (let i = 0; i < 20; i++) s.linea(`línea ${i}`);
    const { lastFrame } = render(
      <Box height={5} flexDirection="column">
        <Transcript store={s} altura={20} />
      </Box>
    );
    const lineas = (lastFrame() ?? "").split("\n");
    expect(lineas).toHaveLength(5);
    expect(lineas.at(-1)).toContain("línea 19");
    expect(lineas[0]).toContain("línea 15");
  });
});
