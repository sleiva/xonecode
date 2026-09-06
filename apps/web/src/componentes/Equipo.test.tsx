import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Equipo } from "./Equipo.js";
import type { InformeDeDispositivos } from "../tipos.js";

afterEach(cleanup);

const base: InformeDeDispositivos = {
  sistema: "mac",
  herramientas: [
    { nombre: "adb", estado: "no-encontrada", detalle: "ni en el PATH ni en platform-tools del SDK de Android" },
    { nombre: "emulator", estado: "no-encontrada", detalle: "ni en el PATH ni en la carpeta emulator del SDK de Android" },
    { nombre: "xcrun", estado: "ok" },
    { nombre: "devicectl", estado: "ok" },
  ],
  dispositivos: [],
  avds: [],
  medido: "2026-09-06T10:00:00.000Z",
};

const simulador = (id: string, estado: "arrancado" | "apagado") => ({
  id,
  nombre: `iPhone ${id} · iOS 26.0`,
  plataforma: "ios" as const,
  clase: "simulador" as const,
  estado,
});

describe("Equipo", () => {
  it("sin informe dice que está consultando, y el botón no se ofrece encendido", () => {
    render(<Equipo conectado alActualizar={() => {}} />);
    expect(screen.getByText(/consultando qué dispositivos/i)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Volver a mirar" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("la máquina medida aquí: macOS, sin SDK de Android, 35 simuladores y ninguno arrancado", () => {
    const informe = { ...base, dispositivos: Array.from({ length: 35 }, (_, i) => simulador(String(i), "apagado")) };
    render(<Equipo informe={informe} conectado />);
    expect(screen.getByText("macOS")).toBeTruthy();
    expect(screen.getByText(/sin sdk de android/i)).toBeTruthy();
    // Los apagados se CUENTAN, no se listan: 35 filas iguales no dicen nada.
    expect(screen.getByText("35 simuladores disponibles, ninguno arrancado.")).toBeTruthy();
    expect(screen.queryByText(/iPhone 3 ·/)).toBeNull();
    expect(screen.getByText("Ningún iPhone o iPad conectado.")).toBeTruthy();
  });

  it("un simulador arrancado se lista por nombre, con su estado en palabras y los demás contados", () => {
    const informe = { ...base, dispositivos: [simulador("A", "arrancado"), simulador("B", "apagado"), simulador("C", "apagado")] };
    render(<Equipo informe={informe} conectado />);
    expect(screen.getByText("iPhone A · iOS 26.0")).toBeTruthy();
    expect(screen.getByText("simulador · arrancado")).toBeTruthy();
    expect(screen.getByText("2 simuladores más, apagados.")).toBeTruthy();
  });

  it("iOS fuera de macOS es «solo en macOS», no «sin iOS»", () => {
    const informe: InformeDeDispositivos = {
      ...base,
      sistema: "windows",
      herramientas: [
        { nombre: "adb", estado: "ok" },
        { nombre: "emulator", estado: "ok" },
        { nombre: "xcrun", estado: "no-aplica", detalle: "solo en macOS" },
        { nombre: "devicectl", estado: "no-aplica", detalle: "solo en macOS" },
      ],
      avds: ["Pixel_8_API_35"],
      dispositivos: [
        { id: "R58", nombre: "SM G973F", plataforma: "android", clase: "fisico", estado: "sin-autorizar", detalle: "acepta la depuración USB en el dispositivo" },
      ],
    };
    render(<Equipo informe={informe} conectado />);
    expect(screen.getByText("Windows")).toBeTruthy();
    expect(screen.getByText(/solo se detectan en macOS/)).toBeTruthy();
    // Lo que pide algo de ti se lista, con el detalle que dice qué hacer.
    expect(screen.getByText("SM G973F")).toBeTruthy();
    expect(screen.getByText("dispositivo · sin autorizar")).toBeTruthy();
    expect(screen.getByText("acepta la depuración USB en el dispositivo")).toBeTruthy();
    expect(screen.getByText("1 AVD definido: Pixel_8_API_35.")).toBeTruthy();
    // Y adb está: se avisa de que volver a mirar arranca su demonio.
    expect(screen.getByText(/arranca el demonio de adb/)).toBeTruthy();
  });

  it("una herramienta que falló se dice en rojo con su motivo, y no tumba el resto del panel", () => {
    const informe: InformeDeDispositivos = {
      ...base,
      herramientas: [
        { nombre: "adb", estado: "fallo", detalle: "no respondió en 15 s" },
        { nombre: "emulator", estado: "no-encontrada" },
        { nombre: "xcrun", estado: "ok" },
        { nombre: "devicectl", estado: "fallo", detalle: "unknown subcommand" },
      ],
    };
    render(<Equipo informe={informe} conectado />);
    expect(screen.getByText("adb falló: no respondió en 15 s")).toBeTruthy();
    expect(screen.getByText("emulator no está instalado.")).toBeTruthy();
    expect(screen.getByText("devicectl falló: unknown subcommand")).toBeTruthy();
    expect(screen.getByText("Ningún simulador iOS disponible.")).toBeTruthy();
  });

  it("«Volver a mirar» pide la medida, pasa a «Mirando…» y vuelve cuando llega una foto NUEVA", () => {
    let pedidas = 0;
    const { rerender } = render(<Equipo informe={base} conectado alActualizar={() => pedidas++} />);
    fireEvent.click(screen.getByRole("button", { name: "Volver a mirar" }));
    expect(pedidas).toBe(1);
    expect((screen.getByRole("button", { name: "Mirando…" }) as HTMLButtonElement).disabled).toBe(true);
    // La misma foto otra vez no lo apaga: no ha llegado nada nuevo.
    rerender(<Equipo informe={base} conectado alActualizar={() => pedidas++} />);
    expect(screen.getByRole("button", { name: "Mirando…" })).toBeTruthy();
    rerender(<Equipo informe={{ ...base, medido: "2026-09-06T10:00:05.000Z" }} conectado alActualizar={() => pedidas++} />);
    expect(screen.getByRole("button", { name: "Volver a mirar" })).toBeTruthy();
  });

  it("sin cable el botón se apaga: no hay a quién pedirle que mire", () => {
    render(<Equipo informe={base} conectado={false} alActualizar={() => {}} />);
    expect((screen.getByRole("button", { name: "Volver a mirar" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
