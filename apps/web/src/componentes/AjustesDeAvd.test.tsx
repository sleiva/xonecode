import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AjustesDeAvd } from "./AjustesDeAvd.js";

afterEach(cleanup);

describe("AjustesDeAvd", () => {
  it("con un solo AVD no hay campo de puerto", () => {
    render(<AjustesDeAvd avd="pixel8" ajuste={{ puerto: 8443 }} conPuerto={false} conectado alCambiar={() => {}} />);
    expect(screen.queryByRole("spinbutton")).toBeNull();
  });

  it("cambiar el puerto y dar Enter lo manda UNA vez, aunque luego se pierda el foco", () => {
    const alCambiar = vi.fn();
    render(<AjustesDeAvd avd="pixel8" ajuste={{ puerto: 8443 }} conPuerto conectado alCambiar={alCambiar} />);
    const campo = screen.getByRole("spinbutton");
    fireEvent.change(campo, { target: { value: "8444" } });
    fireEvent.keyDown(campo, { key: "Enter" });
    fireEvent.blur(campo);
    expect(alCambiar).toHaveBeenCalledTimes(1);
    expect(alCambiar).toHaveBeenCalledWith({ puerto: 8444 });
  });

  it("Enter sin cambiar nada no manda nada", () => {
    const alCambiar = vi.fn();
    render(<AjustesDeAvd avd="pixel8" ajuste={{ puerto: 8443 }} conPuerto conectado alCambiar={alCambiar} />);
    fireEvent.keyDown(screen.getByRole("spinbutton"), { key: "Enter" });
    expect(alCambiar).not.toHaveBeenCalled();
  });

  it("un puerto que el host rechazaría no se manda y se dice por qué", () => {
    const alCambiar = vi.fn();
    render(
      <AjustesDeAvd
        avd="a"
        ajuste={{ puerto: 8443 }}
        conPuerto
        conectado
        ajustes={{ avds: { a: { puerto: 8443 }, b: { puerto: 8444 } } }}
        alCambiar={alCambiar}
      />,
    );
    const campo = screen.getByRole("spinbutton");
    fireEvent.change(campo, { target: { value: "8444" } });
    fireEvent.keyDown(campo, { key: "Enter" });
    expect(screen.getByRole("alert").textContent).toContain("ya es de b");
    fireEvent.change(campo, { target: { value: "5556" } });
    fireEvent.keyDown(campo, { key: "Enter" });
    expect(screen.getByRole("alert").textContent).toContain("5554");
    fireEvent.change(campo, { target: { value: "80" } });
    fireEvent.keyDown(campo, { key: "Enter" });
    expect(screen.getByRole("alert").textContent).toContain("1024");
    expect(alCambiar).not.toHaveBeenCalled();
  });

  it("la casilla «sin ventana» manda el booleano", () => {
    const alCambiar = vi.fn();
    render(<AjustesDeAvd avd="pixel8" ajuste={undefined} conPuerto={false} conectado alCambiar={alCambiar} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Arrancar pixel8 sin ventana" }));
    expect(alCambiar).toHaveBeenCalledWith({ sinVentana: true });
  });

  it("sin cable los controles están apagados", () => {
    render(<AjustesDeAvd avd="a" ajuste={undefined} conPuerto conectado={false} alCambiar={() => {}} />);
    expect((screen.getByRole("checkbox") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole("spinbutton") as HTMLInputElement).disabled).toBe(true);
  });
});
