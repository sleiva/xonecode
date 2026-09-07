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

  /**
   * El modelo se ELIGE, no se teclea, y de dónde sale la lista depende del motor.
   *
   * Era un campo de texto libre en el que había que acordarse de la sintaxis
   * `proveedor/modelo`; y con Claude Code o Codex no había campo, porque el `.md` que
   * llevara `modelo` se rechazaba. Eso último era falso y está medido: los dos productos
   * aceptan un modelo, y sus listas son las que ellos dicen.
   */
  const abrirNuevo = (props: Partial<Parameters<typeof Agentes>[0]> = {}) => {
    render(<Agentes {...manejadores} agentes={[]} {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Nuevo subagente" }));
  };

  it("con «motor: modelo» el modelo se elige de los proveedores COMPROBADOS", () => {
    abrirNuevo({
      proveedores: [
        { id: "gemini", nombre: "Google Gemini", credencial: "puesta", modelos: [{ id: "gemini-flash-latest" }] },
        // Sin comprobar: ofrecerlo sería ofrecer algo que falla al usarlo, igual que en la
        // pastilla del compositor.
        { id: "openai", nombre: "OpenAI", credencial: "falta" },
      ],
    });
    const select = screen.getByLabelText(/^Modelo/);
    const opciones = [...select.querySelectorAll("option")].map((o) => o.textContent);
    expect(opciones.some((o) => /gemini-flash-latest/.test(o ?? ""))).toBe(true);
    expect(opciones.some((o) => /OpenAI/.test(o ?? ""))).toBe(false);
    // Y se puede no elegir ninguno: es lo que significa «el del papel que le toca».
    expect(opciones.some((o) => /papel/i.test(o ?? ""))).toBe(true);
  });

  it("elegir un motor externo PIDE sus modelos, y solo si no se tienen", () => {
    // Bajo demanda porque el de Codex se le pregunta a él y eso arranca un proceso: pedirlo
    // al abrir la ventana lo lanzaría para quien solo viene a leer la lista de subagentes.
    const pedidos: string[] = [];
    abrirNuevo({ alPedirModelosDeMotor: (motor) => pedidos.push(motor) });
    fireEvent.change(screen.getByDisplayValue(/Un modelo/), { target: { value: "claude-code" } });
    expect(pedidos).toEqual(["claude-code"]);
  });

  it("no se vuelven a pedir los que ya están", () => {
    const pedidos: string[] = [];
    abrirNuevo({
      alPedirModelosDeMotor: (motor) => pedidos.push(motor),
      modelosDeMotor: { "claude-code": { modelos: [{ id: "opus", nombre: "opus" }] } },
    });
    fireEvent.change(screen.getByDisplayValue(/Un modelo/), { target: { value: "claude-code" } });
    expect(pedidos).toEqual([]);
  });

  it("y se ofrecen los que el motor dijo, no una lista escrita a mano", () => {
    abrirNuevo({
      alPedirModelosDeMotor: () => {},
      modelosDeMotor: { "claude-code": { modelos: [{ id: "opus", nombre: "opus" }, { id: "sonnet", nombre: "sonnet" }] } },
    });
    fireEvent.change(screen.getByDisplayValue(/Un modelo/), { target: { value: "claude-code" } });
    const opciones = [...screen.getByLabelText(/^Modelo/).querySelectorAll("option")].map((o) => o.textContent);
    expect(opciones).toContain("opus");
    expect(opciones).toContain("sonnet");
    // Y la opción de no elegir dice qué pasa entonces, que no es lo mismo en cada motor.
    expect(opciones.some((o) => /use Claude Code/.test(o ?? ""))).toBe(true);
  });

  it("si el motor no pudo decir sus modelos, se DICE en vez de un desplegable vacío", () => {
    abrirNuevo({
      alPedirModelosDeMotor: () => {},
      modelosDeMotor: { codex: { modelos: [], error: "codex no está instalado" } },
    });
    fireEvent.change(screen.getByDisplayValue(/Un modelo/), { target: { value: "codex" } });
    expect(screen.getByText(/codex no está instalado/)).toBeTruthy();
  });

  it("con «motor: modelo» pide los catálogos que faltan, y no pinta grupos vacíos", () => {
    // Sin esto el desplegable solo tenía los de Ollama —el único que se prueba al conectar—
    // y el grupo de los demás salía vacío, que se lee como «ese proveedor no tiene modelos».
    const pedidos: string[] = [];
    abrirNuevo({
      alPedirCatalogo: (p) => pedidos.push(p),
      proveedores: [
        { id: "gemini", nombre: "Google Gemini", credencial: "puesta" },
        { id: "ollama", nombre: "Ollama", credencial: "nativa", modelos: [{ id: "qwen3" }] },
      ],
    });
    expect(pedidos).toEqual(["gemini"]);
    const grupos = [...screen.getByLabelText(/^Modelo/).querySelectorAll("optgroup")].map((g) => g.getAttribute("label"));
    expect(grupos).toEqual(["Ollama"]);
    // Y se dice que se está consultando, en vez de dejar un hueco sin explicar.
    expect(screen.getByText(/Consultando los modelos de Google Gemini/)).toBeTruthy();
  });

  it("un proveedor cuyo catálogo ya falló no se vuelve a pedir en bucle", () => {
    const pedidos: string[] = [];
    abrirNuevo({
      alPedirCatalogo: (p) => pedidos.push(p),
      proveedores: [{ id: "gemini", nombre: "Google Gemini", credencial: "puesta", error: "no autorizada" }],
    });
    expect(pedidos).toEqual([]);
  });

  it("cambiar de motor limpia el modelo: un `opus` no vale para el motor de modelo", () => {
    const guardado: unknown[] = [];
    render(
      <Agentes
        {...manejadores}
        agentes={[]}
        alGuardar={(a) => guardado.push(a)}
        modelosDeMotor={{ "claude-code": { modelos: [{ id: "opus", nombre: "opus" }] } }}
        alPedirModelosDeMotor={() => {}}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Nuevo subagente" }));
    fireEvent.change(screen.getByDisplayValue(/Un modelo/), { target: { value: "claude-code" } });
    fireEvent.change(screen.getByLabelText(/^Modelo/), { target: { value: "opus" } });
    fireEvent.change(screen.getByDisplayValue(/Claude Code/), { target: { value: "modelo" } });
    expect((screen.getByLabelText(/^Modelo/) as HTMLSelectElement).value).toBe("");
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
    // El de la fila lleva el NOMBRE del agente en su etiqueta: son botones de icono y sin
    // ella no tendrían nombre ninguno, y «Eliminar» repetido no distingue cuál es cuál.
    fireEvent.click(screen.getByRole("button", { name: "Eliminar revisor" }));
    expect(alBorrar).not.toHaveBeenCalled();

    // El «Eliminar» a secas es el de la confirmación, que aparece dentro de la fila.
    fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));
    expect(alBorrar).toHaveBeenCalledWith("revisor", "global");
  });

  it("al editar, el nombre no se cambia: el nombre ES el fichero", () => {
    // Renombrarlo desde aquí crearía uno nuevo y dejaría el viejo puesto, que es la peor de
    // las dos cosas que el usuario podría querer.
    render(<Agentes {...manejadores} agentes={[REVISOR]} />);
    fireEvent.click(screen.getByRole("button", { name: "Editar revisor" }));
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
    fireEvent.click(screen.getByRole("button", { name: "Editar revisor" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(alGuardar).toHaveBeenCalledWith(expect.objectContaining({ nombre: "revisor" }), "proyecto");
  });
});

describe("Agentes: crear está a la vista", () => {
  it("«Nuevo subagente» va ENCIMA de la lista, no detrás de ella", () => {
    render(<Agentes {...manejadores} agentes={[REVISOR]} />);
    const boton = screen.getByRole("button", { name: "Nuevo subagente" });
    const fila = screen.getByText("revisor");
    // `compareDocumentPosition`: FOLLOWING = 4 significa que `fila` viene después de `boton`.
    expect(boton.compareDocumentPosition(fila) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
