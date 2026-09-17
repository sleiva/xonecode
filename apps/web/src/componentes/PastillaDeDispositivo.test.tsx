import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PastillaDeDispositivo } from "./PastillaDeDispositivo.js";

afterEach(cleanup);

const INFORME = {
  sistema: "mac" as const,
  herramientas: [],
  dispositivos: [
    { id: "R58", nombre: "Galaxy S21", plataforma: "android" as const, clase: "fisico" as const, estado: "conectado" as const },
    { id: "S1", nombre: "iPhone 16", plataforma: "ios" as const, clase: "simulador" as const, estado: "arrancado" as const },
  ],
  avds: ["Pixel_8_API_34"],
  // Vacío y explícito: el informe del cable la trae siempre, y omitirla era un fixture que no
  // se parecía al dato — no daba error porque los tests del cliente no se tipean.
  recetas: [],
  medido: "2026-09-07T11:00:00.000Z",
};

describe("PastillaDeDispositivo", () => {
  it("sin elección dice que no hay ninguno, y no se inventa el primero", () => {
    render(<PastillaDeDispositivo informe={INFORME} alElegir={() => {}} />);
    expect(screen.getByRole("button", { name: /sin dispositivo/i })).toBeTruthy();
  });

  it("lista los dos grupos y elegir manda solo el ID", () => {
    const alElegir = vi.fn();
    render(<PastillaDeDispositivo informe={INFORME} alElegir={alElegir} />);
    fireEvent.click(screen.getByRole("button", { name: /sin dispositivo/i }));
    expect(screen.getByText("Teléfonos y tablets")).toBeTruthy();
    expect(screen.getByText("Simuladores y emuladores")).toBeTruthy();
    /**
     * El AVD definido y sin arrancar SE LISTA —es lo que se puede arrancar— pero NO se puede
     * elegir: esa fila la inventa el cliente y el servidor resuelve el elegido contra su
     * propia medida, donde no está. Elegirla no encontraba nada, no hacía nada y no lo decía.
     * Antes este test afirmaba lo contrario («también es elegible»), que es exactamente el
     * defecto: un control sin dato detrás, probado como si fuera la intención.
     */
    const avd = screen.getByRole("menuitem", { name: /Pixel_8_API_34/ });
    expect(avd).toBeTruthy();
    expect((avd as HTMLButtonElement).disabled).toBe(true);
    // Y dice POR QUÉ: un botón apagado sin motivo es el otro fallo mudo de la pareja.
    expect(avd.getAttribute("title")).toMatch(/arráncalo/i);
    fireEvent.click(avd);
    expect(alElegir).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("menuitem", { name: /Galaxy S21/ }));
    // El nombre y la plataforma NO viajan: el servidor los resuelve contra su medida.
    expect(alElegir).toHaveBeenCalledWith("R58");
  });

  it("«Ninguno» quita la elección", () => {
    const alElegir = vi.fn();
    const elegido = { id: "R58", nombre: "Galaxy S21", plataforma: "android" as const, clase: "fisico" as const };
    render(<PastillaDeDispositivo elegido={elegido} informe={INFORME} alElegir={alElegir} />);
    fireEvent.click(screen.getByRole("button", { name: /Galaxy S21/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Ninguno" }));
    expect(alElegir).toHaveBeenCalledWith(undefined);
  });

  it("el elegido que YA NO está se dice, no se borra ni se finge", () => {
    // Los ids no son estables y un teléfono se desenchufa. Quitarlo de la vista haría
    // desaparecer una elección que nadie ha deshecho.
    const elegido = { id: "fantasma", nombre: "Pixel 7", plataforma: "android" as const, clase: "fisico" as const };
    render(<PastillaDeDispositivo elegido={elegido} informe={INFORME} alElegir={() => {}} />);
    const pastilla = screen.getByRole("button", { name: /Pixel 7/ });
    expect(pastilla.getAttribute("title")).toMatch(/no está en la última medida/);
    fireEvent.click(pastilla);
    expect(screen.getByRole("menuitem", { name: /no está en la última medida/ })).toBeTruthy();
  });

  it("sin medida no se afirma que falte: no hay contra qué comprobarlo", () => {
    const elegido = { id: "R58", nombre: "Galaxy S21", plataforma: "android" as const, clase: "fisico" as const };
    render(<PastillaDeDispositivo elegido={elegido} alElegir={() => {}} />);
    expect(screen.getByRole("button", { name: /Galaxy S21/ }).getAttribute("title")).toBe("Galaxy S21");
    fireEvent.click(screen.getByRole("button", { name: /Galaxy S21/ }));
    expect(screen.getByText(/todavía no ha llegado ninguna medida/i)).toBeTruthy();
  });

  it("sin cable no se puede abrir: elegir escribe en el servidor", () => {
    render(<PastillaDeDispositivo informe={INFORME} conectado={false} alElegir={() => {}} />);
    expect(screen.getByRole("button", { name: /sin dispositivo/i })).toHaveProperty("disabled", true);
  });

  /**
   * El pie de la lista, que durante toda la vida de esta pastilla dijo lo que ya no era verdad:
   * «el agente lo usará cuando tenga las tools de dispositivo» — la elección se guardaba y no la
   * consumía nadie. Eso dejó de ser cierto en cuanto la pestaña Ejecutar empezó a lanzar con
   * ella, y el test afirma la mitad nueva **exigiendo además que la vieja no vuelva**: el agente
   * sigue sin tools de dispositivo, así que un «cuando las tenga» es una capacidad que nadie ha
   * decidido construir, dicha como si estuviera en camino.
   */
  it("dice que la elección la usa la pestaña Ejecutar, y no promete que la use el agente", () => {
    render(<PastillaDeDispositivo informe={INFORME} alElegir={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /sin dispositivo/i }));
    expect(screen.getByText(/la usa la pestaña Ejecutar/i)).toBeTruthy();
    expect(screen.queryByText(/tools de dispositivo/i)).toBeNull();
  });
});
