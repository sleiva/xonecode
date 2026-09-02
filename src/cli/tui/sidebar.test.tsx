/**
 * La sidebar y la barra inferior, probadas por su frame (ink-testing-library).
 *
 * La regla que se prueba con más empeño es la de `core/contextos.ts`: un
 * porcentaje sobre un tope inventado es una mentira con forma de cifra, así que
 * sin tope NO hay `%` — y con `contexto === 0` la sección entera calla.
 */
import { describe, it, expect } from "vitest";
import { render } from "ink-testing-library";
import { Box } from "ink";
import { Sidebar, BarraDeEstado, pie, cabeSidebar, ANCHO_DE_SIDEBAR } from "./sidebar.js";

describe("sidebar", () => {
  it("enseña contexto con porcentaje SOLO si hay tope", () => {
    const { lastFrame } = render(
      <Sidebar contexto={25700} tope={200_000} modelo="ollama/glm" modelosPorPapel={{ rapido: "ollama/rapido" }} proyecto="MinitMT" ruta="/dev/MinitMT" rama="main" version="0.3.0" />
    );
    const salida = lastFrame() ?? "";
    expect(salida).toContain("13%");
    expect(salida).toContain("MinitMT");
    expect(salida).toContain("main");
  });

  it("sin tope no hay porcentaje — una cifra sobre un número inventado es una mentira", () => {
    const { lastFrame } = render(
      <Sidebar contexto={25700} tope={undefined} modelo="ollama/glm" modelosPorPapel={{}} proyecto="MinitMT" ruta="/dev/MinitMT" rama="main" version="0.3.0" />
    );
    expect(lastFrame() ?? "").not.toContain("%");
  });

  it("con contexto 0 la sección calla — no hay medición y pintar un cero sería inventarla", () => {
    const { lastFrame } = render(
      <Sidebar contexto={0} tope={200_000} modelo="ollama/glm" modelosPorPapel={{}} proyecto="MinitMT" ruta="/dev/MinitMT" version="0.3.0" />
    );
    const salida = lastFrame() ?? "";
    expect(salida).not.toContain("Contexto");
    expect(salida).not.toContain("%");
  });

  it("la cifra compacta es LA MISMA que pinta stdio (200K, no 200.0K)", () => {
    // El formato vive en `cli/tokens.ts`, compartido: si la sidebar vuelve a tener
    // un `compacto` propio, esta cifra divergiría de la barra de stdio.
    const { lastFrame } = render(
      <Sidebar contexto={200_000} tope={200_000} modelo="m" modelosPorPapel={{}} proyecto="p" ruta="/dev/MinitMT" version="0" />
    );
    expect(lastFrame() ?? "").toContain("200K/200K");
  });

  it("sin rama git, el proyecto y la versión quedan solos", () => {
    const { lastFrame } = render(
      <Sidebar contexto={0} modelo="ollama/glm" modelosPorPapel={{ trabajo: "ollama/glm", rapido: "ollama/r" }} proyecto="MinitMT" ruta="/dev/MinitMT" version="0.3.0" />
    );
    const salida = lastFrame() ?? "";
    expect(salida).toContain("MinitMT");
    expect(salida).toContain("xonecode 0.3.0");
    expect(salida).toContain("rapido: ollama/r");
  });

  it("la lista de papeles omite «trabajo»: la línea principal de Modelo YA es ese", () => {
    // MEDIDO en terminal real: «ollama/glm» y debajo «trabajo: ollama/glm», el mismo valor
    // dos veces. Los demás papeles (rapido, afilado) sí se listan.
    const { lastFrame } = render(
      <Sidebar contexto={0} modelo="ollama/glm" modelosPorPapel={{ trabajo: "ollama/glm", rapido: "ollama/r" }} proyecto="p" ruta="/p" version="0" />
    );
    const salida = lastFrame() ?? "";
    expect(salida).not.toContain("trabajo:");
    expect(salida).toContain("rapido: ollama/r");
    expect(salida.split("ollama/glm").length - 1).toBe(1);
  });

  it("el logotipo XONE se pinta siempre: si hay sidebar, cabe (la regla de anchura es de App)", () => {
    const { lastFrame } = render(
      <Sidebar contexto={0} modelo="m" modelosPorPapel={{}} proyecto="p" ruta="/p" version="0" />
    );
    expect(lastFrame() ?? "").toContain("█");
  });

  it("lo estable (proyecto:rama, versión) queda anclado al fondo de la columna", () => {
    const { lastFrame } = render(
      <Box height={20} flexDirection="column">
        <Sidebar contexto={0} modelo="ollama/glm" modelosPorPapel={{}} proyecto="MinitMT" ruta="/dev/MinitMT" rama="main" version="0.3.0" />
      </Box>
    );
    const lineas = (lastFrame() ?? "").split("\n");
    expect(lineas).toHaveLength(20);
    const llenas = lineas.filter((l) => l.trim() !== "");
    expect(llenas.at(-1)).toContain("xonecode 0.3.0");
    expect(llenas.at(-2)).toContain("MinitMT:main");
    // Y hay hueco entre las secciones y el pie: el anclaje es real, no un margen fijo.
    expect(lineas.at(-3)?.trim()).toBe("");
  });

  it("sin rama, el pie enseña solo el proyecto", () => {
    const { lastFrame } = render(
      <Sidebar contexto={0} modelo="ollama/glm" modelosPorPapel={{}} proyecto="MinitMT" ruta="/dev/MinitMT" version="0.3.0" />
    );
    const salida = lastFrame() ?? "";
    expect(salida).toContain("MinitMT");
    expect(salida).not.toContain("MinitMT:");
  });
});

describe("la regla de la sidebar (la de OpenCode: fija y solo en terminales anchos)", () => {
  it("mide 42 columnas y aparece con MÁS de 120 columnas de terminal, no con 120", () => {
    expect(ANCHO_DE_SIDEBAR).toBe(42);
    expect(cabeSidebar(80)).toBe(false);
    expect(cabeSidebar(120)).toBe(false);
    expect(cabeSidebar(121)).toBe(true);
    expect(cabeSidebar(200)).toBe(true);
  });
});

describe("el pie a dos extremos", () => {
  it("con rama (sin sidebar que la enseñe) la izquierda es ruta:rama", () => {
    expect(pie({ ruta: "~/dev/MinitMT", rama: "main", contexto: 0 }).izquierda).toBe("~/dev/MinitMT:main");
    expect(pie({ ruta: "~/dev/MinitMT", contexto: 0 }).izquierda).toBe("~/dev/MinitMT");
  });


  it("izquierda la ruta; derecha las cifras y /ayuda — porcentaje SOLO con tope", () => {
    expect(pie({ ruta: "~/dev/MinitMT", contexto: 15_400, tope: 200_000 })).toEqual({
      izquierda: "~/dev/MinitMT",
      cifras: "15.4K (8%)",
      derecha: "15.4K (8%)  /ayuda",
    });
    expect(pie({ ruta: "~/dev/MinitMT", contexto: 15_400 })).toEqual({
      izquierda: "~/dev/MinitMT",
      cifras: "15.4K tokens",
      derecha: "15.4K tokens  /ayuda",
    });
    // Sin medición no hay cifra: pintar «0 tokens» sería inventar una lectura.
    expect(pie({ ruta: "~/dev/MinitMT", contexto: 0, tope: 200_000 })).toEqual({
      izquierda: "~/dev/MinitMT",
      cifras: "",
      derecha: "/ayuda",
    });
  });

  it("pintado: la ruta a la izquierda y /ayuda al final de la misma línea", () => {
    const { lastFrame } = render(
      <Box width={60}>
        <BarraDeEstado ruta="~/dev/MinitMT" contexto={15_400} tope={200_000} />
      </Box>
    );
    const linea = (lastFrame() ?? "").split("\n")[0] ?? "";
    expect(linea.trimStart().startsWith("~/dev/MinitMT")).toBe(true);
    expect(linea.trimEnd().endsWith("/ayuda")).toBe(true);
    expect(linea).toContain("15.4K (8%)");
  });
});
