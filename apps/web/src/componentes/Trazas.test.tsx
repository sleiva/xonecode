import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { afterEach, describe, it, expect } from "vitest";
import type { Acto } from "../tipos.js";
import { Trazas, filasDeTrazas, gruposDeTrazas } from "./Trazas.js";

afterEach(cleanup);

/** Dos turnos completos, con una racha de tools y un `fin` solo en el primero. */
const ACTOS: Acto[] = [
  { tipo: "sistema", texto: "consola lista" },
  { tipo: "usuario", texto: "lista las colecciones" },
  { tipo: "herramientas", lineas: ["grep  coleccion", "read_file  src/app.xne"] },
  { tipo: "asistente", texto: "hay tres" },
  { tipo: "fin", ms: 1200, modelo: "gemini/gemini-flash-latest" },
  { tipo: "usuario", texto: "y las vistas" },
  { tipo: "asistente", texto: "dos" },
];

describe("Trazas", () => {
  it("una fila por acto, etiquetada por tipo", () => {
    const filas = filasDeTrazas([
      { tipo: "usuario", texto: "haz algo" },
      { tipo: "herramientas", lineas: ["read_file  src/app.xne", "grep  coleccion"] },
      { tipo: "asistente", texto: "hecho" },
    ]);
    expect(filas.map((f) => f.etiqueta)).toEqual(["USUARIO", "TOOL", "TOOL", "ASISTENTE"]);
  });

  it("NINGUNA fila lleva argumentos de tool: deepseek los enseña, nosotros no podemos", () => {
    const filas = filasDeTrazas([
      { tipo: "herramientas", lineas: ["write_file  src/app.xne", "grep  ^function"] },
    ]);
    for (const f of filas) {
      expect(f.texto).not.toMatch(/[{}]/);
      expect(f.texto).not.toMatch(/"(command|content|file_text)"/);
    }
  });

  it("cada fila se trunca a una línea: las trazas es paisaje, no lectura", () => {
    const filas = filasDeTrazas([{ tipo: "asistente", texto: "a".repeat(500) }]);
    expect(filas[0].texto.length).toBeLessThanOrEqual(200);
  });

  it("pero el texto COMPLETO se conserva: es lo que el panel de detalle enseña", () => {
    // El recorte es de la TABLA. Si la fila se quedara solo con lo recortado, el panel no
    // tendría de dónde sacar el resto y abrirlo no aportaría nada sobre la propia fila.
    const filas = filasDeTrazas([{ tipo: "asistente", texto: "a".repeat(500) }]);
    expect(filas[0].completo.length).toBe(500);
  });

  it("un turno empieza en cada acto de USUARIO, y lo de antes no es de nadie", () => {
    // La frontera es el `usuario` y no el `fin`: un turno que revienta no siempre deja
    // `fin` —es el mismo motivo por el que el compositor no deduce de ahí si hay turno en
    // vuelo—, así que abrir por la petición es lo robusto. Y el saludo del arranque llega
    // ANTES de la primera, así que cae en el turno 0: llamarlo «Turno 1» le inventaría dueño.
    const grupos = gruposDeTrazas(filasDeTrazas(ACTOS));
    expect(grupos.map((g) => g.turno)).toEqual([0, 1, 2]);
    expect(grupos[0].filas.map((f) => f.etiqueta)).toEqual(["SISTEMA"]);
  });

  it("el total del turno es el `ms` del `fin`, y el turno sin `fin` no lo afirma", () => {
    // No se suman las fases: no cubren el turno entero, así que su suma no es ningún tiempo
    // real. Y `undefined` no es cero — el segundo turno sigue en curso.
    const grupos = gruposDeTrazas(filasDeTrazas(ACTOS));
    expect(grupos[1].ms).toBe(1200);
    expect(grupos[2].ms).toBeUndefined();
  });

  it("el buscador mira el texto COMPLETO, no el recortado", () => {
    // Si filtrara por lo que se ve, una palabra que cae más allá del carácter 200 no se
    // encontraría nunca: el buscador mentiría justo en las filas largas, que son las que se
    // vienen a buscar aquí.
    const largo = `${"a".repeat(400)} AGUJA`;
    render(<Trazas actos={[{ tipo: "asistente", texto: largo }]} />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "aguja" } });
    expect(screen.queryByText(/Ninguna fila contiene/)).toBeNull();
  });

  it("elegir una fila abre el detalle con el texto entero, y el tiempo solo si lo hay", () => {
    render(<Trazas actos={ACTOS} />);
    fireEvent.click(screen.getByRole("button", { name: /hay tres/ }));
    fireEvent.click(screen.getByRole("tab", { name: "Tiempos" }));
    // Un acto de asistente no trae `ms`. Poner «0 ms» sería una cifra inventada, y este
    // panel prefiere decir por qué no la tiene.
    expect(screen.getByText(/no lleva tiempo/)).not.toBeNull();
  });

  it("sin actos no pinta una tabla vacía: dice que no ha pasado nada", () => {
    render(<Trazas actos={[]} />);
    expect(screen.getByText(/no ha hecho nada/)).not.toBeNull();
  });
});
