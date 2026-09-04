import { render, cleanup } from "@testing-library/react";
import { afterEach, describe, it, expect } from "vitest";
import { AvisoDeConexion } from "./AvisoDeConexion.js";

afterEach(cleanup);

describe("AvisoDeConexion", () => {
  it("conectado: ConnectionBanner devuelve null, no queda texto que leer", () => {
    const { container } = render(<AvisoDeConexion conectado={true} />);
    expect(container.textContent).toBe("");
  });

  it("sin conectar: el banner se pinta, con el mismo aviso que el compositor deshabilitado", () => {
    const { container } = render(<AvisoDeConexion conectado={false} />);
    expect(container.textContent).toMatch(/sin conexión con xonecode/);
  });
});
