import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AjustesDeGranja, huellaCorta } from "./AjustesDeGranja.js";

afterEach(cleanup);

const HUELLA = Array.from({ length: 32 }, (_, i) => (i % 16).toString(16).toUpperCase().padStart(2, "0")).join(":");

describe("AjustesDeGranja", () => {
  it("sin granja: pide dirección y token, y guardar manda los dos y vacía el token", async () => {
    const alGuardar = vi.fn(async () => undefined);
    render(<AjustesDeGranja granja={{ hayToken: false }} alGuardar={alGuardar} alProbar={() => {}} alAceptarHuella={async () => undefined} />);
    expect((screen.getByRole("button", { name: "Probar conexión" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Dirección"), { target: { value: " 101.101.101.10 " } });
    const token = screen.getByLabelText("Token de acceso") as HTMLInputElement;
    expect(token.type).toBe("password");
    fireEvent.change(token, { target: { value: "xfarm_AbCdEf123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(alGuardar).toHaveBeenCalledWith({ direccion: "101.101.101.10", token: "xfarm_AbCdEf123456" }));
    await waitFor(() => expect(token.value).toBe(""));
  });

  it("la negativa del servidor se pinta tal cual", async () => {
    render(
      <AjustesDeGranja
        granja={{ hayToken: false }}
        alGuardar={async () => "la dirección debe ser https"}
        alProbar={() => {}}
        alAceptarHuella={async () => undefined}
      />,
    );
    fireEvent.change(screen.getByLabelText("Dirección"), { target: { value: "http://x" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "la dirección debe ser https");
  });

  it("con token guardado no lo enseña: «Guardado en este equipo», Reemplazar y Quitar", async () => {
    const alGuardar = vi.fn(async () => undefined);
    render(
      <AjustesDeGranja
        granja={{ direccion: "https://g:8090", hayToken: true }}
        alGuardar={alGuardar}
        alProbar={() => {}}
        alAceptarHuella={async () => undefined}
      />,
    );
    expect(screen.getByText("Guardado en este equipo")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Quitar" }));
    await waitFor(() => expect(alGuardar).toHaveBeenCalledWith({ quitarToken: true }));
    fireEvent.click(screen.getByRole("button", { name: "Reemplazar" }));
    expect(screen.getByLabelText("Token de acceso")).toBeTruthy();
  });

  it("conectada: usuario, teléfonos, copias y la huella abreviada", () => {
    render(
      <AjustesDeGranja
        granja={{
          direccion: "https://g:8090",
          hayToken: true,
          huella: HUELLA,
          prueba: {
            estado: "conectada",
            usuario: "sleiva",
            rol: "normal",
            resumen: { telefonos: 2, copias: { tuyas: 0, libres: 4 }, frameworks: ["5.0.6.5"] },
            medido: "2026-10-27T10:00:00Z",
          },
        }}
        alGuardar={async () => undefined}
        alProbar={() => {}}
        alAceptarHuella={async () => undefined}
      />,
    );
    const estado = screen.getByRole("status");
    expect(estado.textContent).toContain("Conectada como sleiva (usuario normal)");
    expect(estado.textContent).toContain("4 libres");
    expect(estado.textContent).toContain("5.0.6.5");
    expect(estado.textContent).toContain(huellaCorta(HUELLA));
  });

  it("huella distinta: el motivo del servidor y «Aceptar el nuevo» con la huella NUEVA", async () => {
    const alAceptarHuella = vi.fn(async () => undefined);
    const ahora = HUELLA.replace(/^00/, "FF");
    render(
      <AjustesDeGranja
        granja={{
          direccion: "https://g:8090",
          hayToken: true,
          huella: HUELLA,
          prueba: { estado: "huella-distinta", aceptada: HUELLA, ahora, medido: "2026-10-27T10:00:00Z", motivo: "El certificado ha cambiado" },
        }}
        alGuardar={async () => undefined}
        alProbar={() => {}}
        alAceptarHuella={alAceptarHuella}
      />,
    );
    expect(screen.getByRole("alert").textContent).toContain("El certificado ha cambiado");
    fireEvent.click(screen.getByRole("button", { name: "Aceptar el nuevo" }));
    await waitFor(() => expect(alAceptarHuella).toHaveBeenCalledWith(ahora));
  });

  it("huellaCorta deja los dos primeros y los dos últimos octetos", () => {
    expect(huellaCorta("EE:3B:D7:C3:85:E0")).toBe("EE:3B:…:85:E0");
    expect(huellaCorta("AB:CD")).toBe("AB:CD");
  });
});
