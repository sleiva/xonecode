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
  { id: "ollama", nombre: "Ollama", credencial: "nativa" as const },
  { id: "anthropic", nombre: "Anthropic", credencial: "puesta" as const, enFichero: true },
  { id: "gemini", nombre: "Google Gemini", credencial: "puesta" as const },
  { id: "openai", nombre: "OpenAI", credencial: "falta" as const },
];

describe("Ajustes", () => {
  afterEach(cleanup);

  it("mientras se registra un entorno, la sección enseña SOLO el formulario", () => {
    // Medido en pantalla: con la lista de proyectos debajo, el campo de la URL quedaba
    // detrás de dieciocho casillas de 54 px — fuera de la vista justo después de pulsar el
    // botón que lo abre. Dar de alta algo es una tarea, no una fila más de la lista.
    render(
      <Ajustes
        {...MANEJADORES}
        proveedores={PROVEEDORES}
        entornos={[{ id: "uno", nombre: "XOne WebStudio", url: "https://mcp.ejemplo.com/mcp" }]}
        entornoActivo="uno"
        proyectos={[{ id: "p1", nombre: "AppDemo" }, { id: "p2", nombre: "AppDeve" }]}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Entornos" }));
    expect(screen.getByText("XOne WebStudio")).toBeTruthy();
    expect(screen.getByText("AppDemo")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /registrar un entorno/i }));
    expect(screen.getByLabelText(/url del mcp/i)).toBeTruthy();
    expect(screen.queryByText("XOne WebStudio")).toBeNull();
    expect(screen.queryByText("AppDemo")).toBeNull();

    // Y al cancelar vuelve todo: no se ha perdido nada por el camino.
    fireEvent.click(screen.getByRole("button", { name: /^cancelar$/i }));
    expect(screen.getByText("XOne WebStudio")).toBeTruthy();
    expect(screen.getByText("AppDemo")).toBeTruthy();
  });

  describe("proveedores personalizados", () => {
    const CON_PROPIO = [
      ...PROVEEDORES,
      {
        id: "custom:mi-lm-studio",
        nombre: "Mi LM Studio",
        credencial: "falta" as const,
        personalizado: true,
        baseUrl: "http://localhost:1234/v1",
      },
    ];

    it("van en su propio grupo, con la URL a la vista: es a dónde iría la clave", () => {
      render(<Ajustes {...MANEJADORES} proveedores={CON_PROPIO} alAltaDeProveedor={() => {}} />);
      expect(screen.getByRole("heading", { name: /personalizados/i })).toBeTruthy();
      const fila = screen.getByText("Mi LM Studio").closest("li")!;
      expect(fila.textContent).toMatch(/custom:mi-lm-studio · http:\/\/localhost:1234\/v1/);
    });

    it("mientras se añade uno, la sección enseña SOLO el formulario", () => {
      render(<Ajustes {...MANEJADORES} proveedores={CON_PROPIO} alAltaDeProveedor={() => {}} />);
      fireEvent.click(screen.getByRole("button", { name: /añadir un proveedor/i }));
      expect(screen.getByLabelText(/^nombre$/i)).toBeTruthy();
      expect(screen.queryByText("Google Gemini")).toBeNull();
      expect(screen.queryByText("Mi LM Studio")).toBeNull();
    });

    it("manda nombre y URL, nunca el identificador: lo deriva el servidor", () => {
      const alAltaDeProveedor = vi.fn();
      render(<Ajustes {...MANEJADORES} proveedores={PROVEEDORES} alAltaDeProveedor={alAltaDeProveedor} />);
      fireEvent.click(screen.getByRole("button", { name: /añadir un proveedor/i }));
      fireEvent.change(screen.getByLabelText(/^nombre$/i), { target: { value: "Mi LM Studio" } });
      fireEvent.change(screen.getByLabelText(/url base/i), { target: { value: "http://localhost:1234/v1" } });
      fireEvent.click(screen.getByRole("button", { name: /^añadir$/i }));
      expect(alAltaDeProveedor).toHaveBeenCalledWith("Mi LM Studio", "http://localhost:1234/v1");
    });

    it("una URL que la regla no admite no llega a mandarse", () => {
      const alAltaDeProveedor = vi.fn();
      render(<Ajustes {...MANEJADORES} proveedores={PROVEEDORES} alAltaDeProveedor={alAltaDeProveedor} />);
      fireEvent.click(screen.getByRole("button", { name: /añadir un proveedor/i }));
      fireEvent.change(screen.getByLabelText(/^nombre$/i), { target: { value: "Ajeno" } });
      // http fuera de loopback: en claro y cruzando la red, con la clave dentro.
      fireEvent.change(screen.getByLabelText(/url base/i), { target: { value: "http://ajeno.example.com/v1" } });
      fireEvent.click(screen.getByRole("button", { name: /^añadir$/i }));
      expect(alAltaDeProveedor).not.toHaveBeenCalled();
    });

    it("el formulario se cierra cuando el SERVIDOR dice que se hizo, no al pulsar", () => {
      const { rerender } = render(
        <Ajustes {...MANEJADORES} proveedores={PROVEEDORES} alAltaDeProveedor={() => {}} />
      );
      fireEvent.click(screen.getByRole("button", { name: /añadir un proveedor/i }));
      // Un fallo lo deja abierto, con el motivo DENTRO: esta ventana no pinta el transcript.
      rerender(
        <Ajustes
          {...MANEJADORES}
          proveedores={PROVEEDORES}
          alAltaDeProveedor={() => {}}
          resultadoDeProveedor={{ hecho: false, motivo: "ya hay uno con ese identificador" }}
        />
      );
      expect(screen.getByRole("alert").textContent).toMatch(/ya hay uno con ese identificador/);
      expect(screen.getByLabelText(/^nombre$/i)).toBeTruthy();

      rerender(
        <Ajustes
          {...MANEJADORES}
          proveedores={PROVEEDORES}
          alAltaDeProveedor={() => {}}
          resultadoDeProveedor={{ hecho: true }}
        />
      );
      expect(screen.queryByLabelText(/^nombre$/i)).toBeNull();
    });

    it("la baja se confirma, dice que se lleva la clave, y manda el slug sin el prefijo", () => {
      const alBajaDeProveedor = vi.fn();
      render(
        <Ajustes
          {...MANEJADORES}
          proveedores={CON_PROPIO}
          alAltaDeProveedor={() => {}}
          alBajaDeProveedor={alBajaDeProveedor}
        />
      );
      fireEvent.click(screen.getByRole("button", { name: /^dar de baja$/i }));
      expect(screen.getByRole("alert").textContent).toMatch(/se borra también su clave/i);
      expect(alBajaDeProveedor).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole("button", { name: /dar de baja «Mi LM Studio»/i }));
      expect(alBajaDeProveedor).toHaveBeenCalledWith("mi-lm-studio");
    });

    it("sin puerto para darlos de alta no se pinta el botón: se dice que no se puede", () => {
      render(<Ajustes {...MANEJADORES} proveedores={PROVEEDORES} />);
      expect(screen.queryByRole("button", { name: /añadir un proveedor/i })).toBeNull();
      expect(screen.getByText(/no puede dar de alta proveedores/i)).toBeTruthy();
    });
  });

  it("la fila enseña el NOMBRE del proveedor y su id, que son dos cosas distintas", () => {
    render(<Ajustes {...MANEJADORES} proveedores={PROVEEDORES} />);
    // El nombre lo manda el servidor (`core/modelos.ts#nombreDeProveedor`): capitalizar el
    // id aquí daría «Ollama-cloud» y «Xai». El id sigue a la vista porque es lo que se
    // teclea en `/modelo <proveedor>/<modelo>`.
    const fila = screen.getByText("Google Gemini").closest("li")!;
    expect(within(fila).getByText("gemini")).toBeTruthy();
    // Y lleva su logo, que no se anuncia: el nombre ya está ahí en texto.
    const logo = fila.querySelector("svg")!;
    expect(logo.getAttribute("aria-hidden")).toBe("true");
  });

  it("abre en Proveedores y las secciones se pueden cambiar", () => {
    render(<Ajustes {...MANEJADORES} proveedores={PROVEEDORES} />);
    expect(screen.getByRole("heading", { name: /proveedores/i })).toBeTruthy();
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
    fireEvent.click(screen.getByRole("button", { name: /aceptar/i }));
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
    // Registrar es un MODO y el formulario no está hasta que se pide: con la lista puesta
    // encima, el campo salía debajo de todo —fuera de la vista con unos cuantos entornos y
    // el selector de proyectos de por medio—, que es indistinguible de que no haya campo.
    fireEvent.click(screen.getByRole("button", { name: "Registrar un entorno" }));
    // Y mientras se registra, la lista NO está: es una cosa o la otra.
    expect(screen.queryByText("CloudStudio de casa")).toBeNull();
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

  /**
   * Las pestañas por entorno. Pedido mirando la pantalla con dos entornos registrados:
   * «sale todos los proyectos y es intrabajable».
   */
  it("hay una pestaña por entorno registrado, y la del activo sale elegida", () => {
    render(
      <Ajustes
        {...MANEJADORES}
        entornos={[
          { id: "webstudio", nombre: "XOne WebStudio", url: "https://mcp.example/mcp" },
          { id: "casa", nombre: "On-premise", url: "https://mcp.casa.local/mcp" },
        ]}
        entornoActivo="casa"
        proyectos={[{ id: "c1", nombre: "De casa" }]}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Entornos" }));
    const pestanas = screen.getAllByRole("tab");
    expect(pestanas.map((t) => t.textContent)).toEqual(["XOne WebStudio", "On-premise"]);
    // Se abre por donde estás trabajando, que es lo que no hay que ir a buscar.
    expect(pestanas.find((t) => t.getAttribute("aria-selected") === "true")?.textContent).toBe(
      "On-premise"
    );
  });

  it("abrir la pestaña de otro entorno pide SUS proyectos, y no cambia el activo", () => {
    // La lista de un entorno que no es el activo no viaja en el alta: hay que pedirla, y
    // pedirla no puede mudar el entorno activo (eso es `accion: "activo"`, otro mensaje).
    const alPedirProyectosDeEntorno = vi.fn();
    render(
      <Ajustes
        {...MANEJADORES}
        entornos={[
          { id: "webstudio", nombre: "XOne WebStudio", url: "https://mcp.example/mcp" },
          { id: "casa", nombre: "On-premise", url: "https://mcp.casa.local/mcp" },
        ]}
        entornoActivo="webstudio"
        proyectos={[{ id: "p1", nombre: "Tienda" }]}
        alPedirProyectosDeEntorno={alPedirProyectosDeEntorno}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Entornos" }));
    // El activo ya tiene su lista en el alta: no se gasta una conexión en volver a pedirla.
    expect(alPedirProyectosDeEntorno).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("tab", { name: "On-premise" }));
    expect(alPedirProyectosDeEntorno).toHaveBeenCalledWith("casa");
    // Mientras llega se DICE, en vez de afirmar un entorno sin proyectos.
    expect(screen.getByText(/consultando/i)).toBeTruthy();
  });

  it("las casillas de un entorno NO heredan lo marcado en el otro", () => {
    // El fallo que esto evita: con un solo estado de «lo marcado», abrir la pestaña de
    // `casa` enseñaría marcados los ids de `webstudio` y el primer clic guardaría la
    // elección de webstudio BAJO casa.
    const alElegirProyectos = vi.fn();
    render(
      <Ajustes
        {...MANEJADORES}
        entornos={[
          { id: "webstudio", nombre: "XOne WebStudio", url: "https://mcp.example/mcp", proyectos: ["p1"] },
          { id: "casa", nombre: "On-premise", url: "https://mcp.casa.local/mcp", proyectos: ["c2"] },
        ]}
        entornoActivo="webstudio"
        proyectos={[{ id: "p1", nombre: "Tienda" }, { id: "p2", nombre: "Almacén" }]}
        proyectosPorEntorno={{
          casa: { proyectos: [{ id: "c1", nombre: "De casa" }, { id: "c2", nombre: "Taller" }] },
        }}
        alElegirProyectos={alElegirProyectos}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Entornos" }));
    expect((screen.getAllByRole("checkbox") as HTMLInputElement[]).map((c) => c.checked)).toEqual([
      true,
      false,
    ]);

    fireEvent.click(screen.getByRole("tab", { name: "On-premise" }));
    // Los proyectos son los de casa, y lo marcado es la elección guardada de CASA.
    expect(screen.getByText("Taller")).toBeTruthy();
    expect((screen.getAllByRole("checkbox") as HTMLInputElement[]).map((c) => c.checked)).toEqual([
      false,
      true,
    ]);

    fireEvent.click((screen.getAllByRole("checkbox") as HTMLInputElement[])[0]!);
    // Y la elección se guarda bajo CASA, con ids de casa y nada de webstudio.
    expect(alElegirProyectos).toHaveBeenCalledWith("casa", ["c2", "c1"]);
  });

  it("el entorno que no contestó dice su error, no una lista vacía", () => {
    render(
      <Ajustes
        {...MANEJADORES}
        entornos={[
          { id: "webstudio", nombre: "XOne WebStudio", url: "https://mcp.example/mcp" },
          { id: "casa", nombre: "On-premise", url: "https://mcp.casa.local/mcp" },
        ]}
        entornoActivo="webstudio"
        proyectos={[{ id: "p1", nombre: "Tienda" }]}
        proyectosPorEntorno={{ casa: { error: "fetch failed" } }}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Entornos" }));
    fireEvent.click(screen.getByRole("tab", { name: "On-premise" }));
    expect(screen.getByText(/fetch failed/i)).toBeTruthy();
    // Y no se pinta ninguna casilla: no se sabe qué proyectos tiene.
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
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

const INFORME = {
  sistema: "mac" as const,
  herramientas: [
    { nombre: "adb" as const, estado: "ok" as const },
    { nombre: "emulator" as const, estado: "no-encontrada" as const, detalle: "ni en el PATH" },
    { nombre: "xcrun" as const, estado: "ok" as const },
    { nombre: "devicectl" as const, estado: "desactivada" as const },
  ],
  dispositivos: [
    { id: "R58", nombre: "Galaxy S21", plataforma: "android" as const, clase: "fisico" as const, estado: "conectado" as const },
    { id: "S1", nombre: "iPhone 16", plataforma: "ios" as const, clase: "simulador" as const, estado: "arrancado" as const },
  ],
  avds: [],
  medido: "2026-09-07T10:00:00.000Z",
};

describe("Ajustes: la sección de Dispositivos", () => {
  afterEach(cleanup);

  const abrir = (extra: Record<string, unknown> = {}) => {
    render(<Ajustes {...MANEJADORES} dispositivos={INFORME} ajustesDeDispositivos={{}} alCambiarDispositivos={() => {}} {...extra} />);
    fireEvent.click(screen.getByRole("button", { name: "Dispositivos" }));
    return screen.getByRole("heading", { name: "Dispositivos", level: 2 }).parentElement!;
  };

  it("los REQUISITOS y el INVENTARIO son dos bloques, no una lista", () => {
    const panel = abrir();
    // Un requisito está o no está —y si no está, se instala—; un dispositivo es algo que
    // hay. Mezclados, «emulator no está instalada» se leía como un ajuste que el botón de
    // al lado podía arreglar.
    expect(within(panel).getByRole("heading", { name: "Requisitos" })).toBeTruthy();
    expect(within(panel).getByRole("heading", { name: "Dispositivos", level: 3 })).toBeTruthy();
    for (const nombre of ["adb", "emulator", "Xcode command line tools", "devicectl"]) {
      expect(within(panel).getByText(nombre)).toBeTruthy();
    }
  });

  it("el inventario va en dos grupos: lo que se enchufa y lo que se arranca", () => {
    const panel = abrir();
    expect(within(panel).getByRole("heading", { name: "Teléfonos y tablets" })).toBeTruthy();
    expect(within(panel).getByRole("heading", { name: "Simuladores y emuladores" })).toBeTruthy();
    expect(within(panel).getByText("Galaxy S21")).toBeTruthy();
    expect(within(panel).getByText("iPhone 16")).toBeTruthy();
  });

  it("un AVD definido y sin arrancar TAMBIÉN es un simulador disponible", () => {
    // `emulator -list-avds` los da por nombre y no salen en `adb devices` hasta que
    // arrancan: sin esto, «los simuladores disponibles» dejaba fuera los de Android.
    const panel = abrir({ dispositivos: { ...INFORME, avds: ["Pixel_8_API_34"] } });
    expect(within(panel).getByText("Pixel_8_API_34")).toBeTruthy();
    expect(within(panel).getByText(/Android · apagado/)).toBeTruthy();
  });

  it("verde SOLO lo disponible: lo que falta va hueco, y sin medir no se afirma nada", () => {
    const panel = abrir();
    const estados = [...panel.querySelectorAll("[data-herramienta]")].map((p) => p.getAttribute("data-herramienta"));
    // Requisitos: adb ok, emulator falta, xcrun ok, devicectl desactivada. Luego el
    // inventario: el Galaxy conectado y el iPhone arrancado, los dos a mano.
    expect(estados).toEqual(["ok", "no-encontrada", "ok", "desactivada", "ok", "ok"]);
  });

  it("una herramienta que falta ofrece cómo instalarla, y el comando se ENSEÑA", () => {
    const alInstalarHerramienta = vi.fn();
    const conFaltas = {
      ...INFORME,
      herramientas: [
        { nombre: "adb" as const, estado: "no-encontrada" as const, instalar: { comando: "brew install --cask android-platform-tools", automatico: false } },
        { nombre: "emulator" as const, estado: "no-encontrada" as const },
        { nombre: "xcrun" as const, estado: "no-encontrada" as const, instalar: { comando: "xcode-select --install", automatico: true } },
        { nombre: "devicectl" as const, estado: "no-encontrada" as const, instalar: { comando: "xcode-select --install", automatico: true } },
      ],
    };
    abrir({ dispositivos: conFaltas, alInstalarHerramienta });
    // El que xonecode puede lanzar él: botón. Viaja el NOMBRE, nunca el comando.
    fireEvent.click(screen.getAllByRole("button", { name: "Instalar" })[0]!);
    expect(alInstalarHerramienta).toHaveBeenCalledWith("xcrun");
    // El que no: el comando a la vista para copiarlo, sin botón que se pueda colgar.
    expect(screen.getByText("brew install --cask android-platform-tools")).toBeTruthy();
    // Y emulator no propone nada: no se inventa un instalador que no se conoce.
    expect(screen.getAllByRole("button", { name: "Instalar" })).toHaveLength(2);
  });

  it("el filtro de medida son CASILLAS, y marcar una manda el objeto entero", () => {
    // Eran cuatro botones «Se mira» al lado de un punto verde, y se leían como si
    // concedieran la capacidad: el verde ya dice que se puede usar.
    const alCambiarDispositivos = vi.fn();
    render(
      <Ajustes {...MANEJADORES} dispositivos={INFORME} ajustesDeDispositivos={{ ios: false }} alCambiarDispositivos={alCambiarDispositivos} />
    );
    fireEvent.click(screen.getByRole("button", { name: "Dispositivos" }));
    const casillas = screen.getAllByRole("checkbox") as HTMLInputElement[];
    expect(casillas).toHaveLength(4);
    // Ausente = se busca; solo iOS está desmarcado.
    expect(casillas.map((c) => c.checked)).toEqual([true, true, false, true]);
    fireEvent.click(casillas[0]!);
    expect(alCambiarDispositivos).toHaveBeenCalledWith({ ios: false, android: false });
  });

  it("sin foto no se afirma nada de la máquina", () => {
    render(<Ajustes {...MANEJADORES} alCambiarDispositivos={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Dispositivos" }));
    expect(screen.getAllByText(/todavía no ha llegado ninguna medida/i)).toHaveLength(3);
    expect(screen.queryByText("Galaxy S21")).toBeNull();
  });

  it("sin cable las casillas se apagan: lo que escribe en el servidor no se ofrece", () => {
    render(
      <Ajustes
        {...MANEJADORES}
        conectado={false}
        dispositivos={INFORME}
        ajustesDeDispositivos={{}}
        alCambiarDispositivos={() => {}}
        alActualizarDispositivos={() => {}}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Dispositivos" }));
    for (const c of screen.getAllByRole("checkbox")) expect(c).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: /volver a mirar/i })).toHaveProperty("disabled", true);
  });
});

describe("Ajustes: el tope de concurrencia de tareas", () => {
  afterEach(cleanup);

  const abrir = (extra: Record<string, unknown> = {}) => {
    render(<Ajustes {...MANEJADORES} {...extra} />);
    fireEvent.click(screen.getByRole("button", { name: "Dispositivos" }));
    return screen.getByRole("heading", { name: "Tareas" }).parentElement!;
  };

  it("cambiarlo manda el valor acotado a 0-8", () => {
    const alCambiarConcurrencia = vi.fn();
    const panel = abrir({ alCambiarConcurrencia });
    const entrada = within(panel).getByRole("spinbutton") as HTMLInputElement;
    expect(entrada.value).toBe("2");
    fireEvent.change(entrada, { target: { value: "5" } });
    expect(alCambiarConcurrencia).toHaveBeenCalledWith(5);
    // Fuera de rango se acota, no se rechaza en silencio.
    fireEvent.change(entrada, { target: { value: "99" } });
    expect(alCambiarConcurrencia).toHaveBeenCalledWith(8);
    fireEvent.change(entrada, { target: { value: "-3" } });
    expect(alCambiarConcurrencia).toHaveBeenCalledWith(0);
  });

  it("enseña el valor vigente que llega por props", () => {
    const panel = abrir({ tareas: { concurrencia: 4 } });
    expect((within(panel).getByRole("spinbutton") as HTMLInputElement).value).toBe("4");
  });

  it("con 0 se DICE que la cola queda pausada", () => {
    const panel = abrir({ tareas: { concurrencia: 0 } });
    expect(within(panel).getByText(/pausada/i)).toBeTruthy();
  });

  it("con un valor distinto de 0 no se afirma que esté pausada", () => {
    const panel = abrir({ tareas: { concurrencia: 3 } });
    expect(within(panel).queryByText(/pausada/i)).toBeNull();
  });

  it("sin manejador, el selector se apaga: no hay a quién pedírselo", () => {
    const panel = abrir();
    expect(within(panel).getByRole("spinbutton")).toHaveProperty("disabled", true);
  });

  it("sin cable el selector también se apaga, aunque haya manejador", () => {
    const panel = abrir({ alCambiarConcurrencia: () => {}, conectado: false });
    expect(within(panel).getByRole("spinbutton")).toHaveProperty("disabled", true);
  });
});
