/**
 * La sidebar y la barra inferior, probadas por su frame (ink-testing-library).
 *
 * La regla que se prueba con más empeño es la de `core/contextos.ts`: un
 * porcentaje sobre un tope inventado es una mentira con forma de cifra, así que
 * sin tope NO hay `%` — y con `contexto === 0` la sección entera calla.
 */
import { describe, it, expect } from "vitest";
import { render } from "ink-testing-library";
import { Sidebar, BarraDeEstado, lineaDeEstado } from "./sidebar.js";

describe("sidebar", () => {
  it("enseña contexto con porcentaje SOLO si hay tope", () => {
    const { lastFrame } = render(
      <Sidebar contexto={25700} tope={200_000} modelo="ollama/glm" modelosPorPapel={{ rapido: "ollama/rapido" }} proyecto="MinitMT" rama="main" version="0.3.0" />
    );
    const salida = lastFrame() ?? "";
    expect(salida).toContain("13%");
    expect(salida).toContain("MinitMT");
    expect(salida).toContain("main");
  });

  it("sin tope no hay porcentaje — una cifra sobre un número inventado es una mentira", () => {
    const { lastFrame } = render(
      <Sidebar contexto={25700} tope={undefined} modelo="ollama/glm" modelosPorPapel={{}} proyecto="MinitMT" rama="main" version="0.3.0" />
    );
    expect(lastFrame() ?? "").not.toContain("%");
  });

  it("con contexto 0 la sección calla — no hay medición y pintar un cero sería inventarla", () => {
    const { lastFrame } = render(
      <Sidebar contexto={0} tope={200_000} modelo="ollama/glm" modelosPorPapel={{}} proyecto="MinitMT" version="0.3.0" />
    );
    const salida = lastFrame() ?? "";
    expect(salida).not.toContain("Contexto");
    expect(salida).not.toContain("%");
  });

  it("la cifra compacta es LA MISMA que pinta stdio (200K, no 200.0K)", () => {
    // El formato vive en `cli/tokens.ts`, compartido: si la sidebar vuelve a tener
    // un `compacto` propio, esta cifra divergiría de la barra de stdio.
    const { lastFrame } = render(
      <Sidebar contexto={200_000} tope={200_000} modelo="m" modelosPorPapel={{}} proyecto="p" version="0" />
    );
    expect(lastFrame() ?? "").toContain("200K/200K");
  });

  it("sin rama git, el proyecto y la versión quedan solos", () => {
    const { lastFrame } = render(
      <Sidebar contexto={0} modelo="ollama/glm" modelosPorPapel={{ trabajo: "ollama/glm" }} proyecto="MinitMT" version="0.3.0" />
    );
    const salida = lastFrame() ?? "";
    expect(salida).toContain("MinitMT");
    expect(salida).toContain("xonecode 0.3.0");
    expect(salida).toContain("trabajo: ollama/glm");
  });
});

describe("la barra inferior de estado", () => {
  it("en mudo: modelo · ruta · /ayuda", () => {
    const { lastFrame } = render(<BarraDeEstado modelo="ollama/glm" ruta="~/dev/MinitMT" />);
    expect(lastFrame() ?? "").toContain("ollama/glm · ~/dev/MinitMT · /ayuda");
  });

  it("la línea pura coincide con lo pintado", () => {
    expect(lineaDeEstado("ollama/glm", "~/dev/MinitMT")).toBe("ollama/glm · ~/dev/MinitMT · /ayuda");
  });
});
