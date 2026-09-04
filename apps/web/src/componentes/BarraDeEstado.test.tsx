import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { BarraDeEstado } from "./BarraDeEstado.js";

/**
 * Los mismos tres estados que `cli/main.ts#formatearBarra` distingue: sin contexto que
 * medir no hay sección `ctx`; con contexto pero sin tope conocido (el caso de ollama,
 * a propósito) la cifra va pelada; con los dos, el `%`. Un cuarto caso —tope sin
 * contexto— no puede pasar por CONTRATO: `formatearContexto` mira `contexto` primero.
 */
describe("BarraDeEstado", () => {
  it("sin contexto (antes de la primera respuesta), no hay sección ctx", () => {
    render(<BarraDeEstado turnos={1} pasos={3} />);
    expect(screen.queryByText(/ctx/)).toBeNull();
  });

  it("con contexto pero SIN tope (ollama, a propósito): la cifra va pelada, sin %", () => {
    render(<BarraDeEstado turnos={1} pasos={3} contexto={4200} />);
    expect(screen.getByText("ctx 4200")).toBeTruthy();
    expect(screen.queryByText(/%/)).toBeNull();
  });

  it("con contexto Y tope: la cifra lleva el tope y el porcentaje", () => {
    render(<BarraDeEstado turnos={1} pasos={3} contexto={4200} tope={200000} />);
    expect(screen.getByText("ctx 4200/200000 (2%)")).toBeTruthy();
  });

  it("turnos, pasos y tiempo se pintan siempre que llegan", () => {
    render(<BarraDeEstado turnos={2} pasos={7} ms={1500} />);
    expect(screen.getByText("2 turnos")).toBeTruthy();
    expect(screen.getByText("7 pasos")).toBeTruthy();
    expect(screen.getByText("1.5 s")).toBeTruthy();
  });
});
