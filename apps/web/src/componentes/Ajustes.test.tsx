import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Ajustes } from "./Ajustes.js";
import { TITULO_DE_REFRESCAR_EQUIPO } from "./Equipo.js";

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
  // Los tres que faltaban aquí. `apps/web/tsconfig.json` EXCLUYE los `.test.tsx` —con un
  // motivo escrito: traerían los globals de Node a todo el bundle del cliente—, así que
  // `tsc` no mira este fichero y estas ausencias no daban error en ninguna parte: se
  // acumularon sin que nada las dijera. Se añaden porque un conjunto de manejadores al que
  // le faltan tres props hace que el resto de la lista no signifique nada.
  hayProyecto: false,
  alGuardarAgente: () => {},
  alBorrarAgente: () => {},
  alRestaurarAgente: () => {},
  alPedirCuerpoDeSkill: () => {},
  alGuardarSkill: () => {},
  alBorrarSkill: () => {},
};

const PROVEEDORES = [
  { id: "ollama", nombre: "Ollama", credencial: "nativa" as const },
  { id: "anthropic", nombre: "Anthropic", credencial: "puesta" as const, enFichero: true },
  { id: "gemini", nombre: "Google Gemini", credencial: "puesta" as const },
  { id: "openai", nombre: "OpenAI", credencial: "falta" as const },
];

describe("Ajustes", () => {
  afterEach(cleanup);

  describe("dónde se bajan los proyectos", () => {
    const campo = (): HTMLInputElement =>
      screen.getByLabelText("Carpeta donde se bajan los proyectos") as HTMLInputElement;

    it("sin dato del servidor NO se pinta: una caja vacía se leería como «no hay ninguna»", () => {
      render(<Ajustes {...MANEJADORES} proveedores={PROVEEDORES} conectado />);
      expect(screen.queryByLabelText("Carpeta donde se bajan los proyectos")).toBeNull();
    });

    it("enseña la que hay y la manda al guardar", () => {
      const elegidas: string[] = [];
      render(
        <Ajustes
          {...MANEJADORES}
          proveedores={PROVEEDORES}
          conectado
          workspace="/Users/ana/.xonecode/workspace"
          alCambiarWorkspace={(r) => void elegidas.push(r)}
        />
      );
      expect(campo().value).toBe("/Users/ana/.xonecode/workspace");
      fireEvent.change(campo(), { target: { value: "~/xone-proyectos" } });
      fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
      expect(elegidas).toEqual(["~/xone-proyectos"]);
    });

    it("sin tocar nada el botón está apagado: guardar lo mismo no es una acción", () => {
      render(
        <Ajustes
          {...MANEJADORES}
          proveedores={PROVEEDORES}
          conectado
          workspace="/Users/ana/.xonecode/workspace"
          alCambiarWorkspace={() => {}}
        />
      );
      expect((screen.getByRole("button", { name: "Guardar" }) as HTMLButtonElement).disabled).toBe(true);
    });

    it("una ruta que no vale ni se manda ni se calla", () => {
      // La copia declarada de la regla del host. El servidor la vuelve a aplicar, pero sin
      // esto el no sería mudo: `informar` no llega al navegador desde el vestíbulo.
      const elegidas: string[] = [];
      render(
        <Ajustes
          {...MANEJADORES}
          proveedores={PROVEEDORES}
          conectado
          workspace="/Users/ana/.xonecode/workspace"
          alCambiarWorkspace={(r) => void elegidas.push(r)}
        />
      );
      fireEvent.change(campo(), { target: { value: "proyectos" } });
      expect((screen.getByRole("button", { name: "Guardar" }) as HTMLButtonElement).disabled).toBe(true);
      expect(campo().getAttribute("aria-invalid")).toBe("true");
      expect(screen.getByRole("alert").textContent).toMatch(/absoluta/);
      expect(elegidas).toEqual([]);
    });

    it("la raíz del disco tampoco, y con el MISMO motivo que da el host", () => {
      // Divergir aquí no da error: el servidor rechaza y el campo vuelve al valor de antes
      // sin decir por qué, que es exactamente el no mudo que esta copia evita.
      const elegidas: string[] = [];
      render(
        <Ajustes
          {...MANEJADORES}
          proveedores={PROVEEDORES}
          conectado
          workspace="/Users/ana/.xonecode/workspace"
          alCambiarWorkspace={(r) => void elegidas.push(r)}
        />
      );
      fireEvent.change(campo(), { target: { value: "/" } });
      expect(screen.getByRole("alert").textContent).toMatch(/raíz del disco/);
      expect(elegidas).toEqual([]);
    });

    it("sin selector en la máquina el botón NO se pinta: queda el campo, que siempre vale", () => {
      render(
        <Ajustes {...MANEJADORES} proveedores={PROVEEDORES} conectado workspace="/Users/ana/.xonecode/workspace" />
      );
      expect(screen.queryByRole("button", { name: /Examinar/ })).toBeNull();
    });

    it("lo que elige el diálogo entra en el CAMPO, no en el disco", () => {
      // Elegir y guardar son dos actos: guardar desde el diálogo dejaría el ajuste escrito
      // antes de que nadie hubiera leído la ruta entera.
      const guardadas: string[] = [];
      const { rerender } = render(
        <Ajustes
          {...MANEJADORES}
          proveedores={PROVEEDORES}
          conectado
          workspace="/Users/ana/.xonecode/workspace"
          alCambiarWorkspace={(r) => void guardadas.push(r)}
          alElegirCarpeta={() => {}}
        />
      );
      fireEvent.click(screen.getByRole("button", { name: "Examinar…" }));
      rerender(
        <Ajustes
          {...MANEJADORES}
          proveedores={PROVEEDORES}
          conectado
          workspace="/Users/ana/.xonecode/workspace"
          alCambiarWorkspace={(r) => void guardadas.push(r)}
          alElegirCarpeta={() => {}}
          carpetaElegida={{ n: 1, ruta: "/Volumes/Externo/xone" }}
        />
      );
      expect(campo().value).toBe("/Volumes/Externo/xone");
      expect(guardadas).toEqual([]);
    });

    it("cancelar deja el campo como estaba y APAGA el «abriendo…»", () => {
      // Sin el acuse del cancelado el botón se quedaba en «Abriendo…» para siempre.
      const props = {
        ...MANEJADORES,
        proveedores: PROVEEDORES,
        conectado: true,
        workspace: "/Users/ana/.xonecode/workspace",
        alCambiarWorkspace: () => {},
        alElegirCarpeta: () => {},
      };
      const { rerender } = render(<Ajustes {...props} />);
      fireEvent.click(screen.getByRole("button", { name: "Examinar…" }));
      expect(screen.getByRole("button", { name: "Abriendo…" })).toBeTruthy();
      rerender(<Ajustes {...props} carpetaElegida={{ n: 1 }} />);
      expect(screen.getByRole("button", { name: "Examinar…" })).toBeTruthy();
      expect(campo().value).toBe("/Users/ana/.xonecode/workspace");
    });

    it("DICE que cambiarla no mueve lo que ya está bajado", () => {
      // Callarlo deja a alguien buscando sus proyectos en una carpeta vacía.
      render(
        <Ajustes {...MANEJADORES} proveedores={PROVEEDORES} conectado workspace="/Users/ana/.xonecode/workspace" />
      );
      expect(screen.getByText(/NO mueve lo que ya está bajado/)).toBeTruthy();
    });

    it("sin manejador el campo se enseña apagado: la carpeta existe, cambiarla desde aquí no", () => {
      render(
        <Ajustes {...MANEJADORES} proveedores={PROVEEDORES} conectado workspace="/Users/ana/.xonecode/workspace" />
      );
      expect(campo().disabled).toBe(true);
    });
  });

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

  /**
   * Los tests de esta zona navegan a **Modelos** después de montar, porque Ajustes abre en
   * **General**: antes abría en Modelos y se podía afirmar sobre las filas de proveedor sin
   * tocar nada. El clic es parte del escenario, no ruido — el que sobra se retiró.
   */
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
      fireEvent.click(screen.getByRole("button", { name: "Modelos" }));
      expect(screen.getByRole("heading", { name: /personalizados/i })).toBeTruthy();
      const fila = screen.getByText("Mi LM Studio").closest("li")!;
      expect(fila.textContent).toMatch(/custom:mi-lm-studio · http:\/\/localhost:1234\/v1/);
    });

    it("mientras se añade uno, la sección enseña SOLO el formulario", () => {
      render(<Ajustes {...MANEJADORES} proveedores={CON_PROPIO} alAltaDeProveedor={() => {}} />);
      fireEvent.click(screen.getByRole("button", { name: "Modelos" }));
      fireEvent.click(screen.getByRole("button", { name: /añadir un proveedor/i }));
      expect(screen.getByLabelText(/^nombre$/i)).toBeTruthy();
      expect(screen.queryByText("Google Gemini")).toBeNull();
      expect(screen.queryByText("Mi LM Studio")).toBeNull();
    });

    it("manda nombre y URL, nunca el identificador: lo deriva el servidor", () => {
      const alAltaDeProveedor = vi.fn();
      render(<Ajustes {...MANEJADORES} proveedores={PROVEEDORES} alAltaDeProveedor={alAltaDeProveedor} />);
      fireEvent.click(screen.getByRole("button", { name: "Modelos" }));
      fireEvent.click(screen.getByRole("button", { name: /añadir un proveedor/i }));
      fireEvent.change(screen.getByLabelText(/^nombre$/i), { target: { value: "Mi LM Studio" } });
      fireEvent.change(screen.getByLabelText(/url base/i), { target: { value: "http://localhost:1234/v1" } });
      fireEvent.click(screen.getByRole("button", { name: /^añadir$/i }));
      expect(alAltaDeProveedor).toHaveBeenCalledWith("Mi LM Studio", "http://localhost:1234/v1");
    });

    it("una URL que la regla no admite no llega a mandarse", () => {
      const alAltaDeProveedor = vi.fn();
      render(<Ajustes {...MANEJADORES} proveedores={PROVEEDORES} alAltaDeProveedor={alAltaDeProveedor} />);
      fireEvent.click(screen.getByRole("button", { name: "Modelos" }));
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
      fireEvent.click(screen.getByRole("button", { name: "Modelos" }));
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
      fireEvent.click(screen.getByRole("button", { name: "Modelos" }));
      fireEvent.click(screen.getByRole("button", { name: /^dar de baja$/i }));
      expect(screen.getByRole("alert").textContent).toMatch(/se borra también su clave/i);
      expect(alBajaDeProveedor).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole("button", { name: /dar de baja «Mi LM Studio»/i }));
      expect(alBajaDeProveedor).toHaveBeenCalledWith("mi-lm-studio");
    });

    it("sin puerto para darlos de alta no se pinta el botón: se dice que no se puede", () => {
      render(<Ajustes {...MANEJADORES} proveedores={PROVEEDORES} />);
      fireEvent.click(screen.getByRole("button", { name: "Modelos" }));
      expect(screen.queryByRole("button", { name: /añadir un proveedor/i })).toBeNull();
      expect(screen.getByText(/no puede dar de alta proveedores/i)).toBeTruthy();
    });
  });

  it("la fila enseña el NOMBRE del proveedor y su id, que son dos cosas distintas", () => {
    render(<Ajustes {...MANEJADORES} proveedores={PROVEEDORES} />);
    fireEvent.click(screen.getByRole("button", { name: "Modelos" }));
    // El nombre lo manda el servidor (`core/modelos.ts#nombreDeProveedor`): capitalizar el
    // id aquí daría «Ollama-cloud» y «Xai». El id sigue a la vista porque es lo que se
    // teclea en `/modelo <proveedor>/<modelo>`.
    const fila = screen.getByText("Google Gemini").closest("li")!;
    expect(within(fila).getByText("gemini")).toBeTruthy();
    // Y lleva su logo, que no se anuncia: el nombre ya está ahí en texto.
    const logo = fila.querySelector("svg")!;
    expect(logo.getAttribute("aria-hidden")).toBe("true");
  });

  it("abre en General y las secciones se pueden cambiar", () => {
    render(<Ajustes {...MANEJADORES} proveedores={PROVEEDORES} />);
    // **Abre por la PRIMERA**, no por la segunda: abría en Modelos, y entonces la ventana
    // empezaba a media lista mientras su navegación declara un orden de lo general a lo
    // particular. Se fija aquí porque es un `useState` de una línea: cambiarlo no rompe nada
    // visible, y el síntoma sería entrar otra vez por el medio.
    expect(screen.getByRole("heading", { name: "General" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: /proveedores/i })).toBeNull();
    // **El ORDEN es una decisión, no un accidente del array**: General la primera —el cajón
    // de lo de la máquina entera, y lo general se lee antes que lo particular— y detrás lo
    // concreto. Se fija aquí para que el próximo rediseño no lo deshaga sin querer.
    const navegacion = screen.getByRole("navigation", { name: "Secciones de ajustes" });
    expect(within(navegacion).getAllByRole("button").map((b) => b.textContent)).toEqual([
      "General",
      "Modelos",
      "Apariencia",
      "Entornos",
      "Subagentes",
      // Skills va JUNTO a Subagentes y debajo: es la otra mitad de la misma pregunta —quién
      // hace el trabajo, y qué sabe hacer— y es el editor de un subagente el que las marca.
      "Skills",
      "Dispositivos",
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Apariencia" }));
    expect(screen.getByRole("heading", { name: /apariencia/i })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Entornos" }));
    expect(screen.getByRole("heading", { name: /entornos/i })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "General" }));
    expect(screen.getByRole("heading", { name: "General" })).toBeTruthy();
  });

  /**
   * El punto dice lo que se puede AFIRMAR, y «borrar» solo se ofrece sobre lo que se puede
   * cumplir: una clave que vive en una variable de entorno no la podemos quitar.
   */
  it("cada proveedor dice lo suyo, y solo la clave del fichero se puede borrar", () => {
    render(<Ajustes {...MANEJADORES} proveedores={PROVEEDORES} />);
    fireEvent.click(screen.getByRole("button", { name: "Modelos" }));
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
    fireEvent.click(screen.getByRole("button", { name: "Modelos" }));
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
    fireEvent.click(screen.getByRole("button", { name: "Modelos" }));
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

  /**
   * **Los proyectos se parten por dueño: propios y compartidos.**
   *
   * Con dieciocho proyectos (los que tiene el entorno real del usuario) una sola columna era
   * un rollo de casillas donde encontrar uno obliga a leerlas todas, y mezclaba dos cosas que
   * se distinguen de un vistazo.
   *
   * El tercer grupo NO es una tercera clase de proyecto —el dominio tiene dos—: es el hueco de
   * cuando CloudStudio no dice de quién es. Medido en los entornos reales, cero de dieciocho,
   * así que en la práctica no se pinta; existe para no afirmar «es tuyo» sobre un dato que
   * nadie dijo, que es la misma regla que ya aplican la barra y el Escritorio al no pintar
   * etiqueta con el dato ausente. Y lo que se prueba además es que agrupar es PRESENTACIÓN:
   * elegir sigue mandando la lista entera con el id correcto, no la del grupo.
   */
  it("separa propios de compartidos, rotula lo no atribuido, y elegir sigue mandando bien", () => {
    const alElegirProyectos = vi.fn();
    render(
      <Ajustes
        {...MANEJADORES}
        entornos={[{ id: "webstudio", nombre: "XOne WebStudio", url: "https://mcp.example/mcp", proyectos: [] }]}
        entornoActivo="webstudio"
        proyectos={[
          { id: "mio", nombre: "AppDemo", compartido: false },
          { id: "suyo", nombre: "Bequikly", compartido: true },
          { id: "quiensabe", nombre: "SinDueño" },
        ]}
        alElegirProyectos={alElegirProyectos}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Entornos" }));

    // Los tres encabezados, con su cuenta al lado.
    expect(screen.getByRole("heading", { name: /propios/i }).textContent).toContain("1");
    expect(screen.getByRole("heading", { name: /compartidos contigo/i })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /sin decir de quién son/i })).toBeTruthy();
    // Y cada proyecto bajo el suyo: el compartido NO cuelga del grupo de los propios.
    const grupoDePropios = screen.getByRole("heading", { name: /propios/i }).parentElement as HTMLElement;
    expect(grupoDePropios.textContent).toContain("AppDemo");
    expect(grupoDePropios.textContent).not.toContain("Bequikly");

    // Elegir el compartido manda su id, no su posición dentro del grupo.
    const casillaDelCompartido = screen.getByRole("checkbox", { name: "Bequikly" });
    fireEvent.click(casillaDelCompartido);
    expect(alElegirProyectos).toHaveBeenCalledWith("webstudio", ["suyo"]);
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
    { nombre: "adb" as const, plataforma: "android" as const, estado: "ok" as const },
    { nombre: "emulator" as const, plataforma: "android" as const, estado: "no-encontrada" as const, detalle: "ni en el PATH" },
    { nombre: "xcrun" as const, plataforma: "ios" as const, estado: "ok" as const },
    { nombre: "devicectl" as const, plataforma: "ios" as const, estado: "desactivada" as const },
  ],
  dispositivos: [
    { id: "R58", nombre: "Galaxy S21", plataforma: "android" as const, clase: "fisico" as const, estado: "conectado" as const },
    { id: "S1", nombre: "iPhone 16", plataforma: "ios" as const, clase: "simulador" as const, estado: "arrancado" as const },
  ],
  avds: [],
  medido: "2026-09-07T10:00:00.000Z",
  // Vacío a propósito: es la foto de una máquina donde no se ha medido ninguna receta, que
  // es el caso de la mayoría de estos tests. El campo es obligatorio en `InformeDeDispositivos`
  // —ausente ≠ vacío— así que omitirlo no es «no consta», es un informe que no existe.
  recetas: [],
};

describe("Ajustes: la sección de Dispositivos", () => {
  afterEach(cleanup);

  const abrir = (extra: Record<string, unknown> = {}) => {
    render(<Ajustes {...MANEJADORES} dispositivos={INFORME} ajustesDeDispositivos={{}} alCambiarDispositivos={() => {}} {...extra} />);
    fireEvent.click(screen.getByRole("button", { name: "Dispositivos" }));
    return screen.getByRole("heading", { name: "Dispositivos", level: 2 }).parentElement!;
  };

  /**
   * Cambiar de pestaña. La etiqueta de una pestaña lleva PEGADO lo que le falta («iOS, 2 por
   * instalar»), así que se busca por el principio y nunca por el texto entero: una prueba que
   * exigiera el nombre a secas se rompería el día que a esa plataforma le faltara algo, que es
   * justo lo que la pestaña viene a decir.
   */
  const abrirPestana = (panel: HTMLElement, nombre: "Android" | "iOS") =>
    fireEvent.click(within(panel).getByRole("tab", { name: new RegExp(`^${nombre}`) }));

  it("una pestaña por plataforma, y cada una con SUS requisitos", () => {
    // Antes era una sola columna con las herramientas de las dos plataformas, y con iOS
    // dentro la lista se hacía larga y sin costuras. Lo que agrupa es `plataforma`, que
    // viene MEDIDO: aquí no se deduce del nombre de la herramienta.
    const panel = abrir();
    expect(within(panel).getAllByRole("tab").map((t) => t.getAttribute("aria-selected"))).toEqual([
      "true",
      "false",
    ]);
    expect(within(panel).getByText("adb")).toBeTruthy();
    expect(within(panel).getByText("emulator")).toBeTruthy();
    expect(within(panel).queryByText("devicectl")).toBeNull();

    abrirPestana(panel, "iOS");
    expect(within(panel).getByText("Xcode command line tools")).toBeTruthy();
    expect(within(panel).getByText("devicectl")).toBeTruthy();
    expect(within(panel).queryByText("adb")).toBeNull();
  });

  it("cada pestaña cuenta lo que le falta, y solo si le falta algo", () => {
    // Es lo que evita tener que abrirlas para saber dónde está el trabajo. Y un cero no se
    // pinta: es el control sin dato detrás de siempre, y no diría nada que las filas de
    // abajo no digan.
    const panel = abrir();
    const [android, ios] = within(panel).getAllByRole("tab");
    // A Android le falta `emulator`. A iOS, nada: `devicectl` está DESACTIVADA, que es una
    // elección de quien está aquí —apagó ese destino— y no una tarea pendiente.
    expect(android!.getAttribute("aria-label")).toBe("Android, 1 por instalar");
    expect(ios!.getAttribute("aria-label")).toBe("iOS");
    expect(ios!.textContent).toBe("iOS");
  });

  it("el inventario va en dos grupos, y cada pestaña enseña el suyo", () => {
    const panel = abrir();
    expect(within(panel).getByRole("heading", { name: "Teléfonos y tablets" })).toBeTruthy();
    expect(within(panel).getByRole("heading", { name: "Simuladores y emuladores" })).toBeTruthy();
    expect(within(panel).getByText("Galaxy S21")).toBeTruthy();
    expect(within(panel).queryByText("iPhone 16")).toBeNull();

    abrirPestana(panel, "iOS");
    expect(within(panel).getByText("iPhone 16")).toBeTruthy();
    expect(within(panel).queryByText("Galaxy S21")).toBeNull();
    // Y la fila ya no repite la plataforma: la pestaña abierta la dice, y era una de las
    // cosas que hacían larga la lista mezclada.
    expect(within(panel).queryByText(/iOS · /)).toBeNull();
    expect(within(panel).getByText("arrancado")).toBeTruthy();
  });

  /**
   * **Al ENTRAR en Dispositivos se vuelve a medir, aunque ya haya foto.**
   *
   * Medido en la pantalla del usuario: mató el emulador y la fila siguió diciendo «arrancado»
   * en verde, porque la foto era de cuando se conectó el cliente y nadie había vuelto a
   * mirar. No es sondear —la sección se prohíbe refrescarse sola, que lanzaría procesos que
   * nadie pidió—: es una medida por navegación, como la lista de proyectos de una pestaña.
   *
   * Y se pide TENIENDO foto, que es la diferencia con las demás: aquí el dato viejo es el
   * problema. El `abrir()` de estos tests navega a la sección, así que basta contar llamadas.
   */
  it("entrar en Dispositivos vuelve a medir, incluso con foto ya puesta", () => {
    const alActualizarDispositivos = vi.fn();
    abrir({ alActualizarDispositivos });
    expect(alActualizarDispositivos).toHaveBeenCalledTimes(1);
  });

  it("un AVD definido y sin arrancar TAMBIÉN es un simulador disponible", () => {
    // `emulator -list-avds` los da por nombre y no salen en `adb devices` hasta que
    // arrancan: sin esto, «los simuladores disponibles» dejaba fuera los de Android.
    const panel = abrir({ dispositivos: { ...INFORME, avds: ["Pixel_8_API_34"] } });
    expect(within(panel).getByText("Pixel_8_API_34")).toBeTruthy();
    expect(within(panel).getByText("apagado")).toBeTruthy();
  });

  /**
   * **Un emulador de Android EN MARCHA sale en verde, y una sola vez.**
   *
   * Dos defectos en una fila, los dos medidos con `pixel8` arrancado en la máquina del
   * usuario:
   *
   * - El punto lo decidía `estado === "arrancado"` en esta lista, y un emulador de Android
   *   llega como `conectado` —los dos parsers del host le dan nombres distintos al mismo
   *   hecho—, así que salía GRIS en la misma lista donde un simulador de iOS ponía el verde.
   * - Y su AVD se listaba ADEMÁS como apagado, porque el emparejamiento iba por el nombre
   *   visible: `sdk gphone64 arm64` contra `pixel8`, que no coinciden nunca.
   */
  it("un emulador de Android arrancado va en verde y no duplica su AVD", () => {
    const panel = abrir({
      dispositivos: {
        ...INFORME,
        dispositivos: [
          ...INFORME.dispositivos,
          {
            id: "emulator-5554",
            nombre: "sdk gphone64 arm64",
            plataforma: "android" as const,
            clase: "emulador" as const,
            estado: "conectado" as const,
            avd: "pixel8",
          },
        ],
        avds: ["pixel8"],
      },
    });
    abrirPestana(panel, "Android");
    const fila = within(panel).getByText("sdk gphone64 arm64").closest("li") as HTMLElement;
    expect(fila.querySelector("[data-herramienta]")?.getAttribute("data-herramienta")).toBe("ok");
    // Y su AVD no aparece por segunda vez como apagado.
    expect(within(panel).queryByText("pixel8")).toBeNull();
  });

  it("los requisitos son los que la MEDIDA nombra: uno que no venga, se CUENTA", () => {
    // Las filas salen del informe y no de una tabla de la ventana, así que un informe
    // incompleto no puede hacer desaparecer una herramienta en silencio — que se leería
    // como una máquina a la que no le falta nada de eso.
    const panel = abrir({
      dispositivos: {
        ...INFORME,
        herramientas: INFORME.herramientas.filter((h) => h.nombre !== "emulator"),
      },
    });
    expect(within(panel).queryByText("emulator")).toBeNull();
    expect(within(panel).getByText(/La medida no nombra emulator/)).toBeTruthy();
  });

  it("la pestaña de iOS está SIEMPRE, aunque allí no aplique", () => {
    // Esconderla dejaría su receta sin puerta y haría creer que iOS se puede probar en ese
    // sistema y no se está enseñando. Dentro se dice lo que contestó la medida.
    const panel = abrir({
      dispositivos: {
        ...INFORME,
        sistema: "linux" as const,
        herramientas: INFORME.herramientas.map((h) =>
          h.plataforma === "ios" ? { ...h, estado: "no-aplica" as const } : h
        ),
      },
    });
    abrirPestana(panel, "iOS");
    expect(within(panel).getAllByText(/no aplica en este sistema/).length).toBeGreaterThan(0);
    expect(within(panel).getByRole("tab", { name: "iOS" })).toBeTruthy();
  });

  it("verde SOLO lo disponible: lo que falta va hueco", () => {
    const panel = abrir();
    const estados = [...panel.querySelectorAll("[data-herramienta]")].map((p) => p.getAttribute("data-herramienta"));
    // En la pestaña de Android: `adb` ok y `emulator` falta; luego el inventario de esa
    // plataforma, con el Galaxy conectado. El iPhone vive en la otra pestaña.
    expect(estados).toEqual(["ok", "no-encontrada", "ok"]);

    abrirPestana(panel, "iOS");
    expect([...panel.querySelectorAll("[data-herramienta]")].map((p) => p.getAttribute("data-herramienta"))).toEqual([
      "ok",
      "desactivada",
      "ok",
    ]);
  });

  it("una herramienta que falta ofrece cómo instalarla, y el comando se ENSEÑA", () => {
    const alInstalarHerramienta = vi.fn();
    const conFaltas = {
      ...INFORME,
      herramientas: [
        { nombre: "adb" as const, plataforma: "android" as const, estado: "no-encontrada" as const, instalar: { comando: "brew install --cask android-platform-tools", automatico: false } },
        { nombre: "emulator" as const, plataforma: "android" as const, estado: "no-encontrada" as const },
        { nombre: "xcrun" as const, plataforma: "ios" as const, estado: "no-encontrada" as const, instalar: { comando: "xcode-select --install", automatico: true } },
        { nombre: "devicectl" as const, plataforma: "ios" as const, estado: "no-encontrada" as const, instalar: { comando: "xcode-select --install", automatico: true } },
      ],
    };
    const panel = abrir({ dispositivos: conFaltas, alInstalarHerramienta });
    // El que xonecode no puede lanzar: el comando a la vista para copiarlo, sin botón que se
    // pueda colgar. Y `emulator` no propone nada: no se inventa un instalador que no se
    // conoce — ni un botón sin comando detrás. (Cero botones «Instalar»: los dos de la tira
    // de pestañas son otra cosa.)
    expect(within(panel).queryAllByRole("button", { name: "Instalar" })).toHaveLength(0);
    expect(within(panel).getByText("brew install --cask android-platform-tools")).toBeTruthy();

    abrirPestana(panel, "iOS");
    // Los que sí puede lanzar: botón, y viaja el NOMBRE, nunca el comando.
    fireEvent.click(within(panel).getAllByRole("button", { name: "Instalar" })[0]!);
    expect(alInstalarHerramienta).toHaveBeenCalledWith("xcrun");
  });

  it("el filtro de medida son CASILLAS, y marcar una manda el objeto entero", () => {
    // Eran cuatro botones «Se mira» al lado de un punto verde, y se leían como si
    // concedieran la capacidad: el verde ya dice que se puede usar. Y son las de ESTA
    // plataforma: apagar «iOS Sim» desde la pestaña de Android no se decide ahí.
    const alCambiarDispositivos = vi.fn();
    const panel = abrir({ ajustesDeDispositivos: { ios: false }, alCambiarDispositivos });
    const casillas = within(panel).getAllByRole("checkbox") as HTMLInputElement[];
    expect(casillas).toHaveLength(2);
    expect(casillas.map((c) => c.checked)).toEqual([true, true]);
    fireEvent.click(casillas[0]!);
    expect(alCambiarDispositivos).toHaveBeenCalledWith({ ios: false, android: false });

    abrirPestana(panel, "iOS");
    const deIos = within(panel).getAllByRole("checkbox") as HTMLInputElement[];
    // Ausente = se busca; solo iOS está desmarcado, y la de su simulador no.
    expect(deIos.map((c) => c.checked)).toEqual([false, true]);
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
    expect(screen.getByRole("button", { name: /refrescar/i })).toHaveProperty("disabled", true);
  });
});

describe("Ajustes: el tope de concurrencia de tareas", () => {
  afterEach(cleanup);

  const abrir = (extra: Record<string, unknown> = {}) => {
    // En General, que es donde vive desde que dejó de estar al final de Dispositivos: es un
    // ajuste de la MÁQUINA, no de dónde se prueba la app.
    render(<Ajustes {...MANEJADORES} {...extra} />);
    fireEvent.click(screen.getByRole("button", { name: "General" }));
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

  it("y NO se pinta en Dispositivos: ahí se mira la máquina, no se decide la cola", () => {
    // Estuvo al final de esa sección, con el argumento —cierto— de que describe el EQUIPO.
    // Pero el mismo control en dos sitios es el que se queda viejo en uno de los dos, y quien
    // venía a mirar sus simuladores se encontraba un número que habla de otra cosa.
    render(<Ajustes {...MANEJADORES} dispositivos={INFORME} ajustesDeDispositivos={{}} alCambiarDispositivos={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Dispositivos" }));
    expect(screen.queryByRole("heading", { name: "Tareas" })).toBeNull();
    expect(screen.queryByRole("spinbutton")).toBeNull();
  });
});

/**
 * El modelo por defecto, que es la pregunta que esta ventana no podía contestar.
 *
 * El `actual` del compositor es el de la SESIÓN abierta —y sin sesión no existe—, así que
 * Ajustes solo podía gestionar credenciales y su propia nota remitía a la pastilla del
 * compositor. Ahora la sección fija el defecto, que es lo que usarán las sesiones nuevas.
 */
describe("Ajustes: el modelo por defecto", () => {
  afterEach(cleanup);

  /** Con catálogo ya llegado, que es lo que hace falta para que un proveedor sea elegible. */
  const CON_CATALOGO = [
    { id: "ollama", nombre: "Ollama", credencial: "nativa" as const },
    {
      id: "anthropic",
      nombre: "Anthropic",
      credencial: "puesta" as const,
      modelos: [
        { id: "claude-x", nombre: "Claude X" },
        { id: "claude-y", nombre: "Claude Y" },
      ],
    },
  ];

  function abrir(extra: Partial<Parameters<typeof Ajustes>[0]> = {}) {
    // Se consulta por `screen` y no por el contenedor de `render`: la ventana es un `Modal`
    // y su contenido no vive dentro del div que `render` devuelve.
    render(
      <Ajustes
        {...MANEJADORES}
        proveedores={CON_CATALOGO}
        alPedirCatalogo={() => {}}
        alElegirModelo={() => {}}
        {...extra}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Modelos" }));
  }

  it("enseña el defecto que CONSTA, y no lo deduce de ningún sitio", () => {
    // Es el dato que la ventana necesitaba: sin él diría «Elige modelo» sobre una máquina
    // que sí tiene un defecto escrito. Lo dice el servidor (`porDefecto`), no el cliente.
    abrir({ modeloPorDefecto: "anthropic/claude-x" });
    expect(screen.getByText("Modelo por defecto")).toBeTruthy();
    expect(screen.getByRole("button", { name: "anthropic/claude-x" })).toBeTruthy();
    // Y la sección se llama «Modelos» porque dejó de ser solo credenciales: su texto
    // remitía al compositor precisamente porque no había dónde fijar el defecto.
    expect(screen.getByRole("button", { name: "Modelos" })).toBeTruthy();
  });

  it("elegir manda la INTENCIÓN con el id, nunca una línea de comando", () => {
    // La sintaxis no se exporta: el cliente no habla en el idioma de otra piel, y quien
    // decide cómo aplicarlo es el servidor. Aquí se afirma la mitad que se ve.
    const alElegirModelo = vi.fn();
    abrir({ modeloPorDefecto: "anthropic/claude-x", alElegirModelo });
    fireEvent.click(screen.getByRole("button", { name: "anthropic/claude-x" }));
    // Los modelos de un proveedor salen al desplegarlo, no al abrir el menú: es una lista
    // por proveedor, y pintarlas todas abiertas dejaría los cinco fuera de la vista.
    fireEvent.click(screen.getByRole("menuitem", { name: /Anthropic/i }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Claude Y" }));
    expect(alElegirModelo).toHaveBeenCalledWith("anthropic/claude-y");
    expect(alElegirModelo).toHaveBeenCalledTimes(1);
  });

  it("pide el catálogo bajo demanda, igual que en el compositor: es la misma pastilla", () => {
    // Con el catálogo YA llegado no se pide —lo tiene el servidor cacheado—, así que este
    // caso usa el estado de una credencial puesta sin lista: el del primer despliegue.
    const alPedirCatalogo = vi.fn();
    abrir({ proveedores: PROVEEDORES, alPedirCatalogo });
    fireEvent.click(screen.getByRole("button", { name: /elige modelo/i }));
    expect(alPedirCatalogo).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("menuitem", { name: /Anthropic/i }));
    expect(alPedirCatalogo).toHaveBeenCalledWith("anthropic");
  });

  it("sin manejadores se DICE que no se puede, en vez de un control muerto", () => {
    // Hacen falta los DOS: sin el catálogo no hay lista que ofrecer, y sin el envío no hay
    // forma de fijar nada. Pintar la pastilla con uno solo la dejaría en «sin consultar»
    // para siempre, que es el botón muerto de siempre con la petición de una persona detrás.
    abrir({ alElegirModelo: undefined, alPedirCatalogo: undefined });
    expect(screen.getByText(/no puede fijar el modelo por defecto/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /elige modelo/i })).toBeNull();
    // Y con UNO solo tampoco: los dos o ninguno.
    cleanup();
    abrir({ alPedirCatalogo: undefined });
    expect(screen.getByText(/no puede fijar el modelo por defecto/i)).toBeTruthy();
  });

  it("sin defecto conocido no lo inventa: dice que hay que elegirlo", () => {
    // Ausente ≠ «ninguno». Es la misma regla de las cuatro capas: lo que falta se ROTULA.
    abrir();
    expect(screen.getByRole("button", { name: /elige modelo/i })).toBeTruthy();
  });
});

describe("los dos botones de refrescar el equipo son el mismo", () => {
  it("comparten el `title`, importado y no copiado: es la misma medida", () => {
    // Dos copias de la frase es donde divergirían, y el síntoma sería que el mismo botón
    // explica dos cosas distintas según por dónde se entre.
    render(<Ajustes {...MANEJADORES} conectado alActualizarDispositivos={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Dispositivos" }));
    expect(screen.getByRole("button", { name: /refrescar/i }).getAttribute("title")).toBe(
      TITULO_DE_REFRESCAR_EQUIPO
    );
  });
});
