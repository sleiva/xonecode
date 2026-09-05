import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Ajustes } from "./Ajustes.js";

const MANEJADORES = {
  apariencia: "sistema" as const,
  alCambiarApariencia: () => {},
  alPedirClave: () => {},
  alBorrarClave: () => {},
  alRegistrarEntorno: () => {},
  alElegirProyectos: () => {},
  alResponderSecreto: () => {},
  alVerConfig: () => {},
  alCerrar: () => {},
};

const PROVEEDORES = [
  { id: "ollama", credencial: "nativa" as const },
  { id: "anthropic", credencial: "puesta" as const, enFichero: true },
  { id: "gemini", credencial: "puesta" as const },
  { id: "openai", credencial: "falta" as const },
];

describe("Ajustes", () => {
  afterEach(cleanup);

  it("abre en Modelos y las tres secciones se pueden cambiar", () => {
    render(<Ajustes {...MANEJADORES} proveedores={PROVEEDORES} />);
    expect(screen.getByRole("heading", { name: /modelos/i })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Apariencia" }));
    expect(screen.getByRole("heading", { name: /apariencia/i })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Entornos" }));
    expect(screen.getByRole("heading", { name: /entornos/i })).toBeTruthy();
  });

  /**
   * El punto dice lo que se puede AFIRMAR, y «borrar» solo se ofrece sobre lo que se puede
   * cumplir: una clave que vive en una variable de entorno no la podemos quitar.
   */
  it("cada proveedor dice lo suyo, y solo la clave del fichero se puede borrar", () => {
    render(<Ajustes {...MANEJADORES} proveedores={PROVEEDORES} />);
    // Ollama no necesita clave: ni punto, ni botón de clave.
    const ollama = screen.getByText("ollama").closest("li")!;
    expect(ollama.querySelector("[data-credencial]")).toBeNull();
    expect(ollama.textContent).toMatch(/no necesita clave/i);
    // Anthropic: clave nuestra, se puede cambiar y borrar.
    const anthropic = screen.getByText("anthropic").closest("li")!;
    expect(anthropic.querySelector("[data-credencial='puesta']")).toBeTruthy();
    expect(anthropic.textContent).toMatch(/eliminar/i);
    // Gemini: puesta, pero por una variable de entorno — se dice, y no se ofrece borrar.
    const gemini = screen.getByText("gemini").closest("li")!;
    expect(gemini.textContent).toMatch(/variable de entorno/i);
    expect(gemini.textContent).not.toMatch(/eliminar/i);
    // Openai: sin clave, punto rojo, y el botón invita a añadirla.
    const openai = screen.getByText("openai").closest("li")!;
    expect(openai.querySelector("[data-credencial='falta']")).toBeTruthy();
    expect(openai.textContent).toMatch(/añadir clave/i);
  });

  it("borrar pide confirmación NOMBRANDO al proveedor, y cancelar no borra nada", () => {
    const alBorrarClave = vi.fn();
    render(<Ajustes {...MANEJADORES} proveedores={PROVEEDORES} alBorrarClave={alBorrarClave} />);
    fireEvent.click(screen.getByRole("button", { name: /eliminar/i }));
    expect(screen.getByRole("alert").textContent).toMatch(/anthropic/);
    fireEvent.click(screen.getByRole("button", { name: /^cancelar$/i }));
    expect(alBorrarClave).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /eliminar/i }));
    fireEvent.click(screen.getByRole("button", { name: /borrar la de anthropic/i }));
    expect(alBorrarClave).toHaveBeenCalledWith("anthropic");
  });

  /**
   * La clave no entra en el estado de este componente: se pide al servidor, que PREGUNTA,
   * y la respuesta viaja por el único mensaje del cable que la lleva. Lo que sí decide la
   * ventana es dónde se pinta esa pregunta — dentro de la fila, no detrás del modal.
   */
  it("cambiar la clave la pide, y la pregunta del servidor se pinta DENTRO de esa fila", async () => {
    const alPedirClave = vi.fn();
    const alResponderSecreto = vi.fn();
    const { rerender } = render(
      <Ajustes {...MANEJADORES} proveedores={PROVEEDORES} alPedirClave={alPedirClave} alResponderSecreto={alResponderSecreto} />
    );
    // Dos proveedores tienen clave puesta, así que el botón se busca DENTRO de su fila:
    // pulsar «el primero que aparezca» probaría otra cosa el día que cambie el orden.
    const filaDeAnthropic = screen.getByText("anthropic").closest("li")!;
    fireEvent.click(within(filaDeAnthropic).getByRole("button", { name: /cambiar clave/i }));
    expect(alPedirClave).toHaveBeenCalledWith("anthropic");
    // El servidor pregunta; la pregunta aparece en la fila de anthropic y no suelta.
    rerender(
      <Ajustes
        {...MANEJADORES}
        proveedores={PROVEEDORES}
        alPedirClave={alPedirClave}
        alResponderSecreto={alResponderSecreto}
        secreto="clave de anthropic: "
      />
    );
    const anthropic = screen.getByText("anthropic").closest("li")!;
    expect(anthropic.textContent).toMatch(/clave de anthropic/);
    const campo = screen.getByLabelText(/clave de anthropic/i) as HTMLInputElement;
    expect(campo.type).toBe("password");
    fireEvent.change(campo, { target: { value: "sk-ant-NO-DEBE-SALIR" } });
    fireEvent.click(screen.getByRole("button", { name: /responder/i }));
    expect(alResponderSecreto).toHaveBeenCalledWith("sk-ant-NO-DEBE-SALIR");
    // En cuanto el envío vuelve, la fila deja de editarse y el campo desaparece con su
    // valor dentro: la clave no se queda escrita en ningún nodo del documento.
    await waitFor(() => {
      expect(screen.queryByLabelText(/clave de anthropic/i)).toBeNull();
    });
    expect(document.body.innerHTML).not.toContain("sk-ant-NO-DEBE-SALIR");
  });

  it("los entornos registrados se listan con su URL, y registrar uno solo pide la URL", () => {
    const alRegistrarEntorno = vi.fn();
    render(
      <Ajustes
        {...MANEJADORES}
        entornos={[{ id: "mcp.casa.local", nombre: "CloudStudio de casa", url: "https://mcp.casa.local/mcp" }]}
        alRegistrarEntorno={alRegistrarEntorno}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Entornos" }));
    expect(screen.getByText("CloudStudio de casa")).toBeTruthy();
    expect(screen.getByText("https://mcp.casa.local/mcp")).toBeTruthy();
    // No hay campo de nombre en ningún sitio: lo dice el propio servidor al conectarse.
    expect(screen.queryByLabelText(/nombre/i)).toBeNull();
    // La misma regla de URL que el alta, compartida y no copiada.
    fireEvent.change(screen.getByLabelText(/url del mcp/i), { target: { value: "http://mcp.ajeno.com/mcp" } });
    fireEvent.click(screen.getByRole("button", { name: /registrar/i }));
    expect(screen.getByRole("alert").textContent).toMatch(/https/i);
    expect(alRegistrarEntorno).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/url del mcp/i), { target: { value: "https://mcp.otra.com/mcp" } });
    fireEvent.click(screen.getByRole("button", { name: /registrar/i }));
    expect(alRegistrarEntorno).toHaveBeenCalledWith("https://mcp.otra.com/mcp");
  });

  /**
   * La elección de qué proyectos se enseñan vive en la ventana; la barra solo la obedece.
   * Sin elección hecha, las casillas arrancan en lo que la barra está enseñando por
   * omisión: reflejar la pantalla en vez de contradecirla.
   */
  it("marca por omisión los cuatro primeros y manda la elección al cambiarla", () => {
    const alElegirProyectos = vi.fn();
    const seis = Array.from({ length: 6 }, (_, i) => ({ id: `p${i}`, nombre: `Proyecto ${i}` }));
    render(
      <Ajustes
        {...MANEJADORES}
        entornos={[{ id: "webstudio", nombre: "XOne WebStudio", url: "https://mcp.example/mcp" }]}
        entornoActivo="webstudio"
        proyectos={seis}
        alElegirProyectos={alElegirProyectos}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Entornos" }));
    const casillas = screen.getAllByRole("checkbox") as HTMLInputElement[];
    expect(casillas.map((c) => c.checked)).toEqual([true, true, true, true, false, false]);

    fireEvent.click(casillas[4]!);
    expect(alElegirProyectos).toHaveBeenCalledWith("webstudio", ["p0", "p1", "p2", "p3", "p4"]);
  });

  it("una elección guardada manda sobre la omisión, y desmarcar todo se manda como vacío", () => {
    const alElegirProyectos = vi.fn();
    const dos = [
      { id: "a", nombre: "Alfa" },
      { id: "b", nombre: "Beta" },
    ];
    render(
      <Ajustes
        {...MANEJADORES}
        entornos={[{ id: "webstudio", nombre: "XOne WebStudio", url: "https://mcp.example/mcp", proyectos: ["b"] }]}
        entornoActivo="webstudio"
        proyectos={dos}
        alElegirProyectos={alElegirProyectos}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Entornos" }));
    const casillas = screen.getAllByRole("checkbox") as HTMLInputElement[];
    expect(casillas.map((c) => c.checked)).toEqual([false, true]);
    fireEvent.click(casillas[1]!);
    // Vacío es «ninguno», que es una elección legítima — no un «no lo he dicho».
    expect(alElegirProyectos).toHaveBeenCalledWith("webstudio", []);
  });

  it("la apariencia marca la que está en uso y avisa de que es solo de esta ventana", () => {
    const alCambiarApariencia = vi.fn();
    render(<Ajustes {...MANEJADORES} apariencia="oscuro" alCambiarApariencia={alCambiarApariencia} />);
    fireEvent.click(screen.getByRole("button", { name: "Apariencia" }));
    expect(screen.getByText(/solo afecta a esta ventana/i)).toBeTruthy();
    // Los temas de la consola de terminal NO se ofrecen aquí: son paletas ANSI y en un
    // navegador no pintan nada.
    expect(screen.queryByText(/midnight/i)).toBeNull();
    const oscuro = screen.getByText("Oscuro").closest("li")!;
    expect(oscuro.textContent).toMatch(/en uso/i);
    const claro = screen.getByText("Claro").closest("li")!;
    fireEvent.click(within(claro).getByRole("button", { name: /^usar$/i }));
    expect(alCambiarApariencia).toHaveBeenCalledWith("claro");
  });
});
