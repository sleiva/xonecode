import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { afterEach, describe, it, expect, vi } from "vitest";
import type { AgenteDelCable } from "../tipos.js";
import { Agentes } from "./Agentes.js";

afterEach(cleanup);

const REVISOR: AgenteDelCable = {
  nombre: "revisor",
  descripcion: "Revisa un .xne y lista los problemas.",
  motor: "modelo",
  soloLectura: true,
  skills: ["archify"],
  instrucciones: "Empieza por app.xml.",
  origen: "global",
};

const manejadores = { alGuardar: vi.fn(), alBorrar: vi.fn(), hayProyecto: false };

describe("Agentes", () => {
  it("«todavía no ha llegado» y «no hay ninguno» NO se pintan igual", () => {
    // Es la distinción de siempre en este repo: una lista vacía por no haber recibido el
    // mensaje se lee como «no tienes subagentes», que es una afirmación que nadie ha hecho.
    const { rerender } = render(<Agentes {...manejadores} />);
    expect(screen.getByText(/Consultando/)).not.toBeNull();

    rerender(<Agentes {...manejadores} agentes={[]} />);
    expect(screen.getByText(/no tiene en quién delegar/)).not.toBeNull();
  });

  it("los `.md` que no se pudieron leer se DICEN, con su motivo", () => {
    // Quien los tiene que arreglar está mirando esta ventana: un agente que no aparece y
    // nadie explica por qué se lee como que la aplicación lo perdió.
    render(<Agentes {...manejadores} agentes={[]} problemas={["roto.md: le falta «descripcion»"]} />);
    expect(screen.getByRole("alert").textContent).toContain("le falta «descripcion»");
  });

  it("el campo de modelo solo existe con «motor: modelo»", () => {
    // Con Claude Code o Codex el modelo lo elige el propio agente, así que el campo sería un
    // control que no hace nada — y el servidor RECHAZA el fichero que lo lleve.
    render(<Agentes {...manejadores} agentes={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Nuevo subagente" }));
    expect(screen.queryByText(/proveedor\/modelo/)).not.toBeNull();

    fireEvent.change(screen.getByDisplayValue(/Un modelo/), { target: { value: "claude-code" } });
    expect(screen.queryByText(/proveedor\/modelo/)).toBeNull();
  });

  it("elegir un motor externo fuerza solo lectura y DICE por qué", () => {
    // El servidor rechaza el fichero de un agente externo que pida escribir, así que dejar
    // la casilla suelta solo serviría para que guardar fallara con un error que el
    // formulario podía haber evitado. Forzarla sin explicar sería igual de malo.
    render(<Agentes {...manejadores} agentes={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Nuevo subagente" }));
    fireEvent.change(screen.getByDisplayValue(/Un modelo/), { target: { value: "claude-code" } });
    expect(screen.getByRole("checkbox")).toHaveProperty("disabled", true);
    expect(screen.getByRole("checkbox")).toHaveProperty("checked", true);
    expect(screen.getByText(/solo puede LEER/)).not.toBeNull();
  });

  it("cada motor externo dice QUÉ hace falta para que funcione", () => {
    // No es el mismo requisito y el fallo se parece: Claude Code va por su SDK y Codex por
    // el binario que el usuario tenga instalado. Un especialista al que le falte lo suyo no
    // se monta siquiera —el servidor comprueba `disponible()` antes—, así que esto es lo
    // que explica por qué no aparece.
    render(<Agentes {...manejadores} agentes={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Nuevo subagente" }));
    expect(screen.getByRole("option", { name: /Codex/ }).textContent).toMatch(/tengas instalado/);
    expect(screen.getByRole("option", { name: /Claude Code/ }).textContent).toMatch(/solo lectura/);
  });

  it("guardar exige nombre y descripción: el servidor los exige, y decir que no después es peor", () => {
    render(<Agentes {...manejadores} agentes={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Nuevo subagente" }));
    const guardar = screen.getByRole("button", { name: "Guardar" });
    expect(guardar).toHaveProperty("disabled", true);
  });

  it("sin proyecto abierto NO se pregunta dónde guardar: solo cabe el global", () => {
    // Un desplegable con una sola opción es una pregunta que no lo es.
    render(<Agentes {...manejadores} agentes={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Nuevo subagente" }));
    expect(screen.queryByText("Dónde se guarda")).toBeNull();
    expect(screen.getByText(/Se guarda como global/)).not.toBeNull();
  });

  it("con proyecto abierto sí se elige, y no se adivina", () => {
    // Decidir por el usuario es cómo un «revisor» pensado para todos los proyectos acaba
    // escondido en uno.
    render(<Agentes {...manejadores} hayProyecto agentes={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Nuevo subagente" }));
    expect(screen.getByText("Dónde se guarda")).not.toBeNull();
  });

  it("eliminar se confirma en la fila: borra un fichero y no hay papelera", () => {
    const alBorrar = vi.fn();
    render(<Agentes {...manejadores} alBorrar={alBorrar} agentes={[REVISOR]} />);
    fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));
    expect(alBorrar).not.toHaveBeenCalled();

    // El segundo «Eliminar» es el de la confirmación, que aparece dentro de la fila.
    const botones = screen.getAllByRole("button", { name: "Eliminar" });
    fireEvent.click(botones[botones.length - 1]!);
    expect(alBorrar).toHaveBeenCalledWith("revisor", "global");
  });

  it("al editar, el nombre no se cambia: el nombre ES el fichero", () => {
    // Renombrarlo desde aquí crearía uno nuevo y dejaría el viejo puesto, que es la peor de
    // las dos cosas que el usuario podría querer.
    render(<Agentes {...manejadores} agentes={[REVISOR]} />);
    fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    expect(screen.getByDisplayValue("revisor")).toHaveProperty("disabled", true);
  });

  it("guardar manda el ámbito del que ya estaba, no el que hubiera por defecto", () => {
    // Editar un agente de proyecto y que se guardara como global lo duplicaría: quedarían
    // dos ficheros con el mismo nombre y ganaría el de proyecto, o sea el viejo — el cambio
    // parecería no haberse aplicado.
    const alGuardar = vi.fn();
    render(
      <Agentes {...manejadores} hayProyecto alGuardar={alGuardar} agentes={[{ ...REVISOR, origen: "proyecto" }]} />
    );
    fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(alGuardar).toHaveBeenCalledWith(expect.objectContaining({ nombre: "revisor" }), "proyecto");
  });
});
