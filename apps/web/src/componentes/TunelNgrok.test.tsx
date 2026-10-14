import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TunelNgrok, URL_DEL_AUTHTOKEN } from "./TunelNgrok";

afterEach(cleanup);


describe("la tarjeta de ngrok", () => {
  it("si el SDK no carga, lo dice y no inventa un botón: viene con xonecode, no hay nada que instalar aparte", () => {
    render(<TunelNgrok ngrok={{ instalado: false, cuenta: false }} alEnviar={vi.fn()} />);
    expect(screen.getByText(/no carga en esta máquina: reinstala xonecode/)).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("instalado sin cuenta: el authtoken se TECLEA en un campo de contraseña, se manda y el campo se vacía", () => {
    const alEnviar = vi.fn();
    render(<TunelNgrok ngrok={{ instalado: true, cuenta: false }} alEnviar={alEnviar} />);
    const campo = screen.getByLabelText("Authtoken de ngrok") as HTMLInputElement;
    // Contraseña: no se ve lo tecleado, y no es un `textbox` que el navegador vaya a autocompletar.
    expect(campo.type).toBe("password");
    expect(screen.queryByRole("textbox")).toBeNull();
    const guardar = screen.getByRole("button", { name: "Guardar authtoken" }) as HTMLButtonElement;
    expect(guardar.disabled).toBe(true);
    fireEvent.change(campo, { target: { value: "  2abcDEF_123  " } });
    fireEvent.click(guardar);
    expect(alEnviar).toHaveBeenCalledWith({ clase: "remoto", accion: "authtoken", authtoken: "2abcDEF_123" });
    expect(campo.value).toBe("");
  });

  it("sin cuenta, dice CÓMO conseguir el authtoken, con el enlace a su página en el panel de ngrok", () => {
    render(<TunelNgrok ngrok={{ instalado: true, cuenta: false }} alEnviar={vi.fn()} />);
    const enlace = screen.getByRole("link", { name: "Your Authtoken" }) as HTMLAnchorElement;
    expect(enlace.href).toBe(URL_DEL_AUTHTOKEN);
    expect(enlace.rel).toContain("noopener");
    expect(screen.getByRole("link", { name: "ngrok.com" })).toBeTruthy();
  });

  it("listo: el mismo campo sirve para CAMBIAR el authtoken, sin enseñar el de ahora", () => {
    const alEnviar = vi.fn();
    render(<TunelNgrok ngrok={{ instalado: true, cuenta: true }} alEnviar={alEnviar} />);
    const campo = screen.getByLabelText("Authtoken de ngrok") as HTMLInputElement;
    expect(campo.value).toBe("");
    expect(campo.placeholder).toBe("Cambiar authtoken");
    fireEvent.change(campo, { target: { value: "otro" } });
    fireEvent.submit(campo.form!);
    expect(alEnviar).toHaveBeenCalledWith({ clase: "remoto", accion: "authtoken", authtoken: "otro" });
  });

  it("listo: «ngrok listo», su dominio, y Guardar manda el dominio (vacío lo quita)", () => {
    const alEnviar = vi.fn();
    render(<TunelNgrok ngrok={{ instalado: true, cuenta: true, dominio: "yo.ngrok-free.app" }} alEnviar={alEnviar} />);
    expect(screen.getByText(/ngrok listo · dominio yo\.ngrok-free\.app/)).toBeTruthy();
    const campo = screen.getByLabelText("Dominio fijo de ngrok") as HTMLInputElement;
    expect(campo.value).toBe("yo.ngrok-free.app");
    // Sin cambios, Guardar no manda nada.
    expect((screen.getByRole("button", { name: "Guardar" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(campo, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(alEnviar).toHaveBeenCalledWith({ clase: "remoto", accion: "dominio", dominio: "" });
  });

  it("listo sin dominio no inventa uno", () => {
    render(<TunelNgrok ngrok={{ instalado: true, cuenta: true }} alEnviar={vi.fn()} />);
    expect(screen.getByText("ngrok listo")).toBeTruthy();
  });

  it("enseña el motivo del servidor cuando lo hay, en cualquier estado", () => {
    const { rerender } = render(<TunelNgrok ngrok={{ instalado: true, cuenta: false, motivo: "ngrok no aceptó ese authtoken" }} alEnviar={vi.fn()} />);
    expect(screen.getByText("ngrok no aceptó ese authtoken")).toBeTruthy();
    rerender(<TunelNgrok ngrok={{ instalado: true, cuenta: true, motivo: "ese dominio no es válido" }} alEnviar={vi.fn()} />);
    expect(screen.getByText("ese dominio no es válido")).toBeTruthy();
  });

  it("sin cable no se manda nada", () => {
    render(<TunelNgrok ngrok={{ instalado: true, cuenta: false }} alEnviar={vi.fn()} conectado={false} />);
    expect((screen.getByRole("button", { name: "Guardar authtoken" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText("Authtoken de ngrok") as HTMLInputElement).disabled).toBe(true);
  });
});
