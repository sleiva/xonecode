import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LecturaDeSesion } from "./LecturaDeSesion.js";

afterEach(cleanup);

/** IXCODE-36: la conversación abierta para LEER, sin caja de chat. */
describe("LecturaDeSesion", () => {
  const base = { vivo: false, alAbrirParaEscribir: vi.fn(), alCerrar: vi.fn() };

  it("sin actos todavía lo dice; un error del servidor también", () => {
    const { unmount } = render(<LecturaDeSesion {...base} motivo="tarea" />);
    expect(screen.getByText(/Leyendo la conversación/)).toBeTruthy();
    unmount();
    render(<LecturaDeSesion {...base} motivo="tarea" error="esa conversación no está en el proyecto" />);
    expect(screen.getByRole("alert").textContent).toMatch(/no está en el proyecto/);
  });

  it("cuando ya nada lo impide, ofrece abrirla para escribir; antes, no", () => {
    const alAbrirParaEscribir = vi.fn();
    const { rerender } = render(<LecturaDeSesion {...base} actos={[]} motivo="trabajando" alAbrirParaEscribir={alAbrirParaEscribir} />);
    expect(screen.queryByRole("button", { name: "Abrir para escribir" })).toBeNull();
    rerender(<LecturaDeSesion {...base} actos={[]} motivo="libre" alAbrirParaEscribir={alAbrirParaEscribir} />);
    fireEvent.click(screen.getByRole("button", { name: "Abrir para escribir" }));
    expect(alAbrirParaEscribir).toHaveBeenCalled();
    // Y nunca hay caja de chat.
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  /** Una tarea FINALIZADA se lee con sus artefactos: los de SU conversación, nunca los de la abierta. */
  it("finalizada: no ofrece escribir, y sus artefactos se ven aquí, pedidos a SU conversación", async () => {
    const origen = { proyecto: "p1", sesion: "s-tarea" };
    const pedirArtefacto = vi.fn(async (nombre: string) => ({
      ruta: `/artefactos/${nombre}`,
      texto: "# Lo que hizo",
      recortado: false,
      binario: false,
      bytes: 13,
    }));
    const actos = [
      { tipo: "usuario" as const, texto: "hazlo" },
      { tipo: "artefacto" as const, ruta: "/artefactos/captura.png", nombre: "captura.png", bytes: 2048, mime: "image/png" },
      { tipo: "artefacto" as const, ruta: "/artefactos/informe.md", nombre: "informe.md", bytes: 13, mime: "text/markdown" },
    ];
    const { container } = render(<LecturaDeSesion {...base} actos={actos} motivo="finalizada" origen={origen} pedirArtefacto={pedirArtefacto} />);
    expect(screen.getByText(/Tarea finalizada/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Abrir para escribir" })).toBeNull();
    // La miniatura del hilo apunta a SU carpeta (`p` y `s`), no a la de la conversación abierta.
    const miniatura = container.querySelector('img[alt="captura.png"]');
    expect(miniatura?.getAttribute("src")).toBe("/artefacto?n=captura.png&p=p1&s=s-tarea");
    fireEvent.click(screen.getByRole("button", { name: "Artefactos (2)" }));
    // Se abre el último —el informe—, y su contenido se pide por la lectura, no por el store.
    expect(await screen.findByText("Lo que hizo")).toBeTruthy();
    expect(pedirArtefacto).toHaveBeenCalledWith("informe.md");
    fireEvent.click(screen.getByRole("button", { name: "Ver la conversación" }));
    expect(screen.getByText("hazlo")).toBeTruthy();
  });

  it("sin origen no ofrece artefactos: se pedirían los de la conversación abierta", () => {
    const actos = [{ tipo: "artefacto" as const, ruta: "/artefactos/a.md", nombre: "a.md", bytes: 1, mime: "text/markdown" }];
    render(<LecturaDeSesion {...base} actos={actos} motivo="libre" />);
    expect(screen.queryByRole("button", { name: /Artefactos/ })).toBeNull();
  });
});
