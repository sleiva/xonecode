import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CrearEmulador } from "./CrearEmulador.js";

afterEach(cleanup);

const escribir = (v: string): void => {
  fireEvent.change(screen.getByRole("textbox", { name: "Nombre del emulador nuevo" }), { target: { value: v } });
};
const boton = (): HTMLButtonElement => screen.getByRole("button") as HTMLButtonElement;

describe("CrearEmulador", () => {
  it("con el nombre vacío el botón está apagado", () => {
    render(<CrearEmulador avds={[]} conectado alCrear={() => {}} />);
    expect(boton().disabled).toBe(true);
  });

  it("un nombre repetido apaga el botón y dice por qué", () => {
    render(<CrearEmulador avds={["pixel8"]} conectado alCrear={() => {}} />);
    escribir("pixel8");
    expect(boton().disabled).toBe(true);
    expect(screen.getByText("pixel8 ya existe")).toBeTruthy();
  });

  it("un nombre con mala forma apaga el botón", () => {
    render(<CrearEmulador avds={[]} conectado alCrear={() => {}} />);
    escribir("-malo");
    expect(boton().disabled).toBe(true);
    expect(screen.getByText(/solo letras/)).toBeTruthy();
  });

  it("un nombre válido lo envía", () => {
    const alCrear = vi.fn();
    render(<CrearEmulador avds={["pixel8"]} conectado alCrear={alCrear} />);
    escribir("pixel8-b");
    fireEvent.click(boton());
    // Con un AVD que copiar, la base viaja siempre (el primero, sin tocar nada) y sin lo instalado.
    expect(alCrear).toHaveBeenCalledWith("pixel8-b", { base: "pixel8", conDatos: false });
  });

  it("sin ningún AVD no hay desplegable ni casilla, y se crea como siempre", () => {
    const alCrear = vi.fn();
    render(<CrearEmulador avds={[]} conectado alCrear={alCrear} />);
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
    escribir("nuevo");
    fireEvent.click(boton());
    expect(alCrear).toHaveBeenCalledWith("nuevo");
  });

  it("«Copia de» lista los AVD, el primero por omisión, y se puede cambiar", () => {
    const alCrear = vi.fn();
    render(<CrearEmulador avds={["pixel8", "tablet"]} conectado alCrear={alCrear} />);
    const sel = screen.getByRole("combobox", { name: "Emulador del que copiar" }) as HTMLSelectElement;
    expect(sel.value).toBe("pixel8");
    expect([...sel.options].map((o) => o.value)).toEqual(["pixel8", "tablet"]);
    fireEvent.change(sel, { target: { value: "tablet" } });
    escribir("otro");
    fireEvent.click(boton());
    expect(alCrear).toHaveBeenCalledWith("otro", { base: "tablet", conDatos: false });
  });

  it("marcar «Copiar también lo instalado» envía conDatos", () => {
    const alCrear = vi.fn();
    render(<CrearEmulador avds={["pixel8"]} conectado alCrear={alCrear} />);
    fireEvent.click(screen.getByRole("checkbox", { name: /Copiar también lo instalado/ }));
    escribir("clon");
    fireEvent.click(boton());
    expect(alCrear).toHaveBeenCalledWith("clon", { base: "pixel8", conDatos: true });
  });

  it("con la base en marcha la casilla está apagada, dice por qué, y no envía conDatos aunque se hubiera marcado", () => {
    const alCrear = vi.fn();
    const { rerender } = render(<CrearEmulador avds={["pixel8", "tablet"]} conectado alCrear={alCrear} />);
    fireEvent.click(screen.getByRole("checkbox"));
    rerender(<CrearEmulador avds={["pixel8", "tablet"]} conectado alCrear={alCrear} enMarcha={["pixel8"]} />);
    const casilla = screen.getByRole("checkbox") as HTMLInputElement;
    expect(casilla.disabled).toBe(true);
    expect(casilla.checked).toBe(false);
    expect(screen.getByText(/está encendido: pulsa «Parar» en su fila para poder clonarlo/)).toBeTruthy();
    escribir("copia");
    fireEvent.click(boton());
    expect(alCrear).toHaveBeenCalledWith("copia", { base: "pixel8", conDatos: false });
    // Elegir otra base, que está apagada, la reactiva.
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "tablet" } });
    expect((screen.getByRole("checkbox") as HTMLInputElement).disabled).toBe(false);
  });

  it("mientras crea enseña el título y el botón queda en «Creando…»", () => {
    render(
      <CrearEmulador
        avds={[]}
        conectado
        alCrear={() => {}}
        progreso={{ receta: "crear-avd", paso: 0, titulo: "Creando pixel9", estado: "corriendo", lineas: ["uno", "dos"], ms: 10 }}
      />,
    );
    expect(screen.getByText(/Creando pixel9/)).toBeTruthy();
    expect(boton().textContent).toBe("Creando…");
    expect(boton().disabled).toBe(true);
    expect(screen.getByText(/dos/)).toBeTruthy();
  });

  it("si falla, enseña el motivo", () => {
    render(
      <CrearEmulador
        avds={[]}
        conectado
        alCrear={() => {}}
        progreso={{ receta: "crear-avd", paso: 0, titulo: "Creando pixel9", estado: "fallo", lineas: [], ms: 10, motivo: "no hay imagen de sistema" }}
      />,
    );
    expect(screen.getByText(/no hay imagen de sistema/)).toBeTruthy();
  });

  it("tras crear bien, el campo se vacía (si no, diría «ya existe»)", () => {
    const { rerender } = render(<CrearEmulador avds={[]} conectado alCrear={() => {}} />);
    escribir("pixel9");
    const base = { receta: "crear-avd", paso: 0, titulo: "Creando pixel9", lineas: [], ms: 10 };
    rerender(<CrearEmulador avds={[]} conectado alCrear={() => {}} progreso={{ ...base, estado: "corriendo" }} />);
    rerender(<CrearEmulador avds={["pixel9"]} conectado alCrear={() => {}} progreso={{ ...base, estado: "ok" }} />);
    // Ni se queda el nombre recién creado (diría «ya existe») ni se vacía: sale la propuesta para
    // el siguiente, copiado de la base que ahora hay.
    expect((screen.getByRole("textbox", { name: "Nombre del emulador nuevo" }) as HTMLInputElement).value).toMatch(/^pixel9-[a-z0-9]{4}$/);
    expect(screen.queryByText("pixel9 ya existe")).toBeNull();
  });

  const campo = (): HTMLInputElement => screen.getByRole("textbox", { name: "Nombre del emulador nuevo" }) as HTMLInputElement;
  const elegirBase = (b: string): void => {
    fireEvent.change(screen.getByRole("combobox", { name: "Emulador del que copiar" }), { target: { value: b } });
  };

  it("con una base, el nombre viene RELLENO con la base y un sufijo aleatorio, listo para crear", () => {
    render(<CrearEmulador avds={["pixel8", "tablet"]} conectado alCrear={() => {}} />);
    expect(campo().value).toMatch(/^pixel8-[a-z0-9]{4}$/);
    expect((screen.getByRole("button", { name: "Crear emulador" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("cambiar la base cambia la propuesta", () => {
    render(<CrearEmulador avds={["pixel8", "tablet"]} conectado alCrear={() => {}} />);
    elegirBase("tablet");
    expect(campo().value).toMatch(/^tablet-[a-z0-9]{4}$/);
  });

  it("lo que se ha ESCRITO a mano no se pisa al cambiar la base", () => {
    render(<CrearEmulador avds={["pixel8", "tablet"]} conectado alCrear={() => {}} />);
    escribir("mi-emulador");
    elegirBase("tablet");
    expect(campo().value).toBe("mi-emulador");
  });

  it("sin ningún AVD no hay base, así que no se propone nada", () => {
    render(<CrearEmulador avds={[]} conectado alCrear={() => {}} />);
    expect(campo().value).toBe("");
  });

  it("un nombre que no vale marca el campo como inválido", () => {
    render(<CrearEmulador avds={["a"]} conectado alCrear={() => {}} />);
    escribir("a");
    expect(screen.getByRole("textbox", { name: "Nombre del emulador nuevo" }).getAttribute("aria-invalid")).toBe("true");
  });
});
