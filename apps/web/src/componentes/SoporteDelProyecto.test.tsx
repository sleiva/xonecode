import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ListadoDeSoporte } from "../tipos.js";
import { SoporteDelProyecto, urlDelPaquete } from "./SoporteDelProyecto.js";

afterEach(cleanup);

const LISTADO: ListadoDeSoporte = {
  chats: [
    {
      id: "s1",
      titulo: "Arreglar el login",
      ultimoTurno: "2026-09-29T10:11:12Z",
      analisis: {
        gravedad: "error",
        hallazgos: [
          { regla: "turno-con-error", gravedad: "error", mensaje: "El turno terminó en error: 400", turno: 2 },
          { regla: "escrituras-sin-preguntar", gravedad: "info", mensaje: "1 escritura aplicada sin preguntar" },
        ],
      },
    },
    { id: "s2", titulo: "Otra cosa", analisis: { gravedad: "ok", hallazgos: [] } },
  ],
  tareas: [
    {
      id: "t1",
      titulo: "Tarea de fondo",
      estado: "requiere-atencion",
      sesion: "s1",
      analisis: { gravedad: "aviso", hallazgos: [{ regla: "tarea-requiere-atencion", gravedad: "aviso", mensaje: "espera feedback" }] },
    },
  ],
};

const asentar = () => act(async () => {});

describe("SoporteDelProyecto", () => {
  it("la URL del paquete lleva IDS en la query, bien escapados", () => {
    expect(urlDelPaquete("p 1", "chat", "a&b")).toBe("/soporte?tipo=chat&proyecto=p+1&id=a%26b");
    expect(urlDelPaquete("p1", "proyecto")).toBe("/soporte?tipo=proyecto&proyecto=p1");
  });

  it("pinta chats y tareas con su insignia y un enlace de descarga cada uno, y ninguno abre el chat", async () => {
    render(<SoporteDelProyecto proyecto="p1" conectado alPedir={() => Promise.resolve(LISTADO)} />);
    await asentar();
    const chats = screen.getByRole("region", { name: "Chats" });
    expect(within(chats).getByText("1 con error")).toBeTruthy();
    expect(within(chats).getByText("sin problemas")).toBeTruthy();
    const enlaces = within(chats).getAllByRole("link", { name: "Exportar" });
    expect(enlaces.map((a) => a.getAttribute("href"))).toEqual(["/soporte?tipo=chat&proyecto=p1&id=s1", "/soporte?tipo=chat&proyecto=p1&id=s2"]);
    expect(enlaces.every((a) => a.hasAttribute("download"))).toBe(true);
    const tareas = screen.getByRole("region", { name: "Tareas" });
    expect(within(tareas).getByRole("link", { name: "Exportar" }).getAttribute("href")).toBe("/soporte?tipo=tarea&proyecto=p1&id=t1");
    expect(within(tareas).getByText(/requiere atención/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Exportar proyecto" }).getAttribute("href")).toBe("/soporte?tipo=proyecto&proyecto=p1");
    expect(screen.queryByRole("button", { name: /abrir/i })).toBeNull();
  });

  it("los hallazgos se DESPLIEGAN al pulsar el título, y plegados no están montados", async () => {
    render(<SoporteDelProyecto proyecto="p1" conectado alPedir={() => Promise.resolve(LISTADO)} />);
    await asentar();
    expect(screen.queryByText(/terminó en error/)).toBeNull();
    const titulo = screen.getByRole("button", { name: "Arreglar el login" });
    fireEvent.click(titulo);
    expect(titulo.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText(/terminó en error/)).toBeTruthy();
    fireEvent.click(titulo);
    expect(screen.queryByText(/terminó en error/)).toBeNull();
    // Sin hallazgos el título no es un botón.
    expect(screen.queryByRole("button", { name: "Otra cosa" })).toBeNull();
  });

  it("el filtro deja solo lo que tiene problemas", async () => {
    render(<SoporteDelProyecto proyecto="p1" conectado alPedir={() => Promise.resolve(LISTADO)} />);
    await asentar();
    fireEvent.click(screen.getByRole("checkbox", { name: "Solo con problemas" }));
    expect(screen.queryByText("Otra cosa")).toBeNull();
    expect(screen.getByText("Arreglar el login")).toBeTruthy();
  });

  it("la respuesta de OTRO proyecto se tira", async () => {
    let soltarA!: (l: ListadoDeSoporte) => void;
    const alPedir = vi.fn((p: string) =>
      p === "a" ? new Promise<ListadoDeSoporte>((r) => (soltarA = r)) : Promise.resolve({ chats: [], tareas: [] }),
    );
    const vista = render(<SoporteDelProyecto proyecto="a" conectado alPedir={alPedir} />);
    vista.rerender(<SoporteDelProyecto proyecto="b" conectado alPedir={alPedir} />);
    await asentar();
    soltarA(LISTADO);
    await asentar();
    expect(screen.queryByText("Arreglar el login")).toBeNull();
    expect(screen.getByText("Este proyecto no tiene chats.")).toBeTruthy();
  });

  it("un manejador nuevo en cada render NO vuelve a pedir; «Actualizar» sí", async () => {
    const alPedir = vi.fn(() => Promise.resolve(LISTADO));
    const vista = render(<SoporteDelProyecto proyecto="p1" conectado alPedir={(p) => alPedir(p)} />);
    await asentar();
    vista.rerender(<SoporteDelProyecto proyecto="p1" conectado alPedir={(p) => alPedir(p)} />);
    await asentar();
    expect(alPedir).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Actualizar" }));
    await asentar();
    expect(alPedir).toHaveBeenCalledTimes(2);
  });

  it("un chat sin título se llama «Sin título», como en la barra", async () => {
    const sinTitulo: ListadoDeSoporte = { chats: [{ id: "x", titulo: "", analisis: { gravedad: "ok", hallazgos: [] } }], tareas: [] };
    render(<SoporteDelProyecto proyecto="p1" conectado alPedir={() => Promise.resolve(sinTitulo)} />);
    await asentar();
    expect(screen.getByText("Sin título")).toBeTruthy();
  });

  it("si no se pudo pedir, lo dice", async () => {
    render(<SoporteDelProyecto proyecto="p1" conectado alPedir={() => Promise.resolve(undefined)} />);
    await asentar();
    expect(screen.getByRole("status").textContent).toMatch(/No se pudo/);
  });
});
