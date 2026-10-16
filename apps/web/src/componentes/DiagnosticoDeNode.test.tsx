import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DiagnosticoDeNode } from "./DiagnosticoDeNode.js";
import type { DiagnosticoDeNode as Diagnostico } from "../tipos.js";

afterEach(cleanup);

const FOTO: Diagnostico = {
  cuando: "2026-10-16T08:00:00.000Z",
  servidor: { version: "v22.1.0", plataforma: "win32", arquitectura: "x64" },
  nodeEnPath: { ok: true, valor: "22.1.0" },
  scripts: { ok: true, valor: "xone-hotswap --help", cuantos: 12 },
  simulador: { ok: false, motivo: "no se encuentra el programa (ENOENT)" },
  claudeCode: { ok: true, valor: "2.1.301" },
};

describe("DiagnosticoDeNode (Ajustes → General)", () => {
  it("sin foto dice que no se ha comprobado, y «Comprobar» pide medir y gira hasta que llega otra", () => {
    const alComprobar = vi.fn();
    const { rerender } = render(<DiagnosticoDeNode alComprobar={alComprobar} />);
    expect(screen.getByText("Sin comprobar todavía.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Comprobar" }));
    expect(alComprobar).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Comprobando…" })).toHaveProperty("disabled", true);
    rerender(<DiagnosticoDeNode alComprobar={alComprobar} diagnostico={FOTO} />);
    expect(screen.getByRole("button", { name: "Comprobar" })).toHaveProperty("disabled", false);
  });

  it("pinta cada línea: lo medido en las que funcionan y el motivo en las que no", () => {
    render(<DiagnosticoDeNode diagnostico={FOTO} />);
    expect(screen.getByText("v22.1.0 · Windows x64")).toBeTruthy();
    expect(screen.getByText("12 detectados · xone-hotswap --help arranca")).toBeTruthy();
    expect(screen.getByText("No funciona: no se encuentra el programa (ENOENT)")).toBeTruthy();
    expect(screen.getByText("2.1.301")).toBeTruthy();
    // Sin intención no hay botón: un control sin dato detrás no se pinta.
    expect(screen.queryByRole("button")).toBeNull();
  });
});
