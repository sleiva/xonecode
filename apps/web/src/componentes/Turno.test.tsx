import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { afterEach, describe, it, expect } from "vitest";
import type { Acto } from "../tipos.js";
import { Turno } from "./Turno.js";

afterEach(cleanup);

const ACTOS: Acto[] = [
  { tipo: "usuario", texto: "uno" },
  {
    tipo: "herramientas",
    lineas: ["→ lee /login.js", "✎ edita /login.js"],
    detalles: [{ nombre: "read_file" }, { nombre: "edit_file", error: "rechazada" }],
  },
  { tipo: "sistema", texto: "dev: quiere modificar un fichero del proyecto", clase: "permiso" },
  { tipo: "asistente", texto: "hecho" },
  {
    tipo: "fin",
    ms: 29_600,
    consumo: {
      modelo: { entrada: 12_000, salida: 400, cache: 9_100 },
      externo: { entrada: 0, salida: 0, cache: 0 },
      ventana: 11_600,
      porModelo: {
        "deepseek/deepseek-flash": { cuenta: "modelo", entrada: 5_000, salida: 100, cache: 4_000 },
        "deepseek/deepseek-pro": { cuenta: "modelo", entrada: 7_000, salida: 300, cache: 5_100 },
      },
    },
  },
  { tipo: "usuario", texto: "dos" },
  { tipo: "verificacion", verde: false, errores: 2, avisos: 0 },
];

describe("Turno", () => {
  it("enseña el ÚLTIMO turno por omisión, y lo que no consta no sale como cero", () => {
    render(<Turno actos={ACTOS} topeDeContexto={128_000} />);
    expect(screen.getByText("Turno 2 de 2")).not.toBeNull();
    // Abierto: sin fin no hay duración ni tokens.
    expect(screen.getByText("en marcha")).not.toBeNull();
    expect(screen.queryByText("Tokens por modelo")).toBeNull();
    expect(screen.getByText("Verificador: en rojo · 2 errores")).not.toBeNull();
  });

  it("las flechas llevan al anterior, con sus cifras y modelos; los permisos no salen", () => {
    render(<Turno actos={ACTOS} topeDeContexto={128_000} />);
    fireEvent.click(screen.getByRole("button", { name: "Turno anterior" }));
    expect(screen.getByText("Turno 1 de 2")).not.toBeNull();
    expect(screen.getByText("29,6 s")).not.toBeNull();
    // Nueva 2,9k + caché 9,1k + salida 400 = 12,4k.
    expect(screen.getByText("12,4k")).not.toBeNull();
    expect(screen.getByText(/1 falló/)).not.toBeNull();
    expect(screen.getByText("deepseek/deepseek-pro")).not.toBeNull();
    expect(screen.getByText("De ellos, 9,1k salieron de caché.")).not.toBeNull();
    expect(screen.queryByText("dev: quiere modificar un fichero del proyecto")).toBeNull();
    // El tope es del modelo EN VIGOR: en un turno que no es el último no se inventa el porcentaje.
    expect(screen.getByText("11,6k al cerrar el turno")).not.toBeNull();
    expect(screen.getByText("Verificador: no corrió en este turno")).not.toBeNull();
    expect((screen.getByRole("button", { name: "Turno anterior" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("sin turnos lo dice", () => {
    render(<Turno actos={[]} />);
    expect(screen.getByText("Todavía no hay ningún turno en esta conversación.")).not.toBeNull();
  });
});
