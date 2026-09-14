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
    expect(screen.getByText("ctx 4,2k")).toBeTruthy();
    expect(screen.queryByText(/%/)).toBeNull();
  });

  it("con contexto Y tope: la cifra lleva el tope y el porcentaje", () => {
    render(<BarraDeEstado turnos={1} pasos={3} contexto={4200} tope={200000} />);
    expect(screen.getByText("ctx 4,2k/200k (2%)")).toBeTruthy();
  });

  it("el tope y las cifras se abrevian como en el contador, no con el número pelado", () => {
    // Medido en pantalla: aquí se leía `3269/1000000` mientras el compositor escribía `3,3k`
    // para el mismo tipo de dato — y el `1,0M` del tope era el que se veía en cada turno.
    // Un solo abreviador para los dos (`cifras.ts`), o se aprende a desconfiar de ambos.
    render(<BarraDeEstado turnos={1} pasos={3} contexto={3269} tope={1_000_000} />);
    expect(screen.getByText("ctx 3,3k/1M (0%)")).toBeTruthy();
  });

  it("turnos, pasos y tiempo se pintan siempre que llegan", () => {
    render(<BarraDeEstado turnos={2} pasos={7} ms={1500} />);
    expect(screen.getByText("2 turnos")).toBeTruthy();
    expect(screen.getByText("7 pasos")).toBeTruthy();
    expect(screen.getByText("1.5 s")).toBeTruthy();
  });
});

describe("BarraDeEstado: el turno en vuelo", () => {
  it("mientras corre, dice cuánto lleva y NO el tiempo del turno anterior", () => {
    // Medido: durante 116 segundos el pie decía «10,7 s», el del turno de antes.
    render(<BarraDeEstado turnos={2} pasos={5} ms={10700} segundosEnVuelo={37} />);
    expect(screen.getByText(/trabajando · 37 s/)).toBeTruthy();
    expect(screen.queryByText(/10\.7 s/)).toBeNull();
  });
});
