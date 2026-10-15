import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TareasDesdeElGestor } from "./TareasDesdeElGestor.js";

afterEach(cleanup);

const VINCULO = { conector: "jira", sitio: "c1", proyecto: "MAS" };
const LISTA = [
  { nombre: "Por hacer", categoria: "por-hacer" as const },
  { nombre: "En curso", categoria: "en-curso" as const },
  { nombre: "Listo", categoria: "terminada" as const },
];
const PROPUESTO = { preparar: "Por hacer", lanzar: "En curso", terminar: "Listo" };

describe("TareasDesdeElGestor", () => {
  it("plegado es UNA línea con lo guardado, y no pide nada a la red", () => {
    const alPedirEstados = vi.fn();
    render(<TareasDesdeElGestor vinculo={{ ...VINCULO, estados: { lanzar: "En curso", terminar: "Listo" }, automatico: true }} nombre="Jira" conectado alPedirEstados={alPedirEstados} alGuardar={vi.fn()} />);
    expect(screen.getByText("Encendido · lanzar en «En curso» · al terminar, «Listo» · sin revisar el encargo")).toBeTruthy();
    expect(alPedirEstados).not.toHaveBeenCalled();
  });

  it("al abrir pide los estados y PROPONE el mapeo; guardar manda lo elegido con el interruptor", async () => {
    const alGuardar = vi.fn(async () => undefined);
    render(<TareasDesdeElGestor vinculo={VINCULO} nombre="Jira" conectado alPedirEstados={async () => ({ lista: LISTA, propuesto: PROPUESTO })} alGuardar={alGuardar} />);
    expect(screen.getByText(/Sin configurar/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Configurar" }));
    const lanzar = (await screen.findByLabelText(/Lanzar la tarea en/)) as HTMLSelectElement;
    expect(lanzar.value).toBe("En curso");
    fireEvent.change(screen.getByLabelText(/Al terminar, pasar a/), { target: { value: "" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /lancen tareas solos/ }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    // La casilla de revisar viene DESMARCADA por omisión.
    expect((screen.getByRole("checkbox", { name: /Revisar el encargo/ }) as HTMLInputElement).checked).toBe(false);
    await vi.waitFor(() => expect(alGuardar).toHaveBeenCalledWith({ preparar: "Por hacer", lanzar: "En curso" }, true, false));
  });

  it("encender sin estado de lanzar no se puede guardar; y un rechazo del servidor se dice", async () => {
    render(
      <TareasDesdeElGestor
        vinculo={{ ...VINCULO, estados: { preparar: "Por hacer" } }}
        nombre="Jira"
        conectado
        alPedirEstados={async () => ({ lista: LISTA, propuesto: PROPUESTO, actual: { preparar: "Por hacer" } })}
        alGuardar={async () => "«X» no es un estado del flujo de este proyecto"}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Configurar" }));
    await screen.findByLabelText(/Lanzar la tarea en/);
    fireEvent.click(screen.getByRole("checkbox", { name: /lancen tareas solos/ }));
    expect((screen.getByRole("button", { name: "Guardar" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/Lanzar la tarea en/), { target: { value: "En curso" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/no es un estado del flujo/);
  });

  it("si no se pueden leer los estados, lo dice", async () => {
    render(<TareasDesdeElGestor vinculo={VINCULO} nombre="Jira" conectado alPedirEstados={async () => ({ motivo: "este gestor no sabe decir los estados de su flujo" })} alGuardar={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Configurar" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/no sabe decir los estados/);
  });

  it("un proyecto sin tickets no enseña su flujo: dice que se cree uno", async () => {
    render(<TareasDesdeElGestor vinculo={VINCULO} nombre="Jira" conectado alPedirEstados={async () => ({ lista: [], propuesto: {} })} alGuardar={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Configurar" }));
    expect(await screen.findByText(/crea un ticket allí para que xonecode vea su flujo/)).toBeTruthy();
  });
});
