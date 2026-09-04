import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { Wizard } from "./Wizard.js";

// Sin `globals` en `vitest.config.ts` no hay auto-cleanup: el segundo `render()` dejaría
// montado el primero y `getByLabelText` encontraría dos campos con la misma etiqueta.
afterEach(cleanup);

/**
 * Ni los proveedores ni los entornos se escriben aquí dentro del componente: entran por
 * prop, como las sugerencias del `Compositor`. Los tres entornos son los que devuelve
 * `vestibulo.ts#opcionesDeEntorno`, y el de URL VACÍA es el «otro» —así lo declara
 * `ENTORNO_OTRO` («url vacía = el usuario la teclea»)—, que es lo que el wizard usa para
 * saber cuándo pedir nombre y URL en vez de darlos por sabidos.
 */
const manejadores = {
  proveedores: [
    { id: "anthropic", nombre: "Anthropic" },
    { id: "ollama", nombre: "Ollama" },
  ],
  entornos: [
    { id: "webstudio", nombre: "XOne WebStudio", url: "https://webstudio.xone.es/mcp" },
    { id: "manager", nombre: "XOne Manager", url: "https://mcp.xonemanager.com/mcp" },
    { id: "otro", nombre: "Otro (on-premise)", url: "" },
  ],
  proyectos: [{ id: "p1", nombre: "MinitMT" }],
  ramas: ["master"],
  alGuardarCredencial: () => {},
  alRegistrarEntorno: () => {},
  alElegirProyecto: () => {},
};

describe("Wizard", () => {
  it("solo enseña los pasos que faltan", () => {
    render(<Wizard pasos={["entorno"]} {...manejadores} />);
    expect(screen.queryByLabelText(/proveedor/i)).toBeNull();
    expect(screen.getByLabelText(/url del mcp/i)).toBeTruthy();
  });

  it("la clave es un campo de contraseña y no entra en el store", () => {
    render(<Wizard pasos={["cuenta"]} {...manejadores} />);
    const campo = screen.getByLabelText(/clave/i) as HTMLInputElement;
    expect(campo.type).toBe("password");
    expect(campo.autocomplete).toBe("off");
  });

  it("una URL que no es https ni loopback se rechaza", () => {
    render(<Wizard pasos={["entorno"]} {...manejadores} />);
    fireEvent.change(screen.getByLabelText(/url del mcp/i), { target: { value: "http://mcp.ejemplo.com/mcp" } });
    fireEvent.click(screen.getByRole("button", { name: /registrar/i }));
    expect(screen.getByRole("alert").textContent).toMatch(/https/i);
  });

  it("al guardar la credencial dice DÓNDE quedó antes de seguir", () => {
    render(<Wizard pasos={["cuenta"]} {...manejadores} rutaDeCredencial="~/.xonecode/auth.json" />);
    fireEvent.click(screen.getByRole("button", { name: /guardar/i }));
    expect(screen.getByRole("status").textContent).toContain("auth.json");
  });

  /**
   * El invariante duro de este componente: lo tecleado en el campo de la clave sale por el
   * manejador y por ningún otro sitio. React pone el valor como PROPIEDAD del input, no
   * como atributo, así que el serializado del documento es la prueba de que no queda
   * pintado en ninguna parte — ni en el paso siguiente, ni en un aviso, ni en el `status`.
   */
  it("la clave viaja solo por el manejador: ni se pinta ni queda en el documento", () => {
    const alGuardarCredencial = vi.fn();
    render(
      <Wizard
        pasos={["cuenta", "entorno"]}
        {...manejadores}
        alGuardarCredencial={alGuardarCredencial}
        rutaDeCredencial="~/.xonecode/auth.json"
      />
    );
    fireEvent.change(screen.getByLabelText(/clave/i), { target: { value: "sk-ant-NO-DEBE-SALIR" } });
    fireEvent.click(screen.getByRole("button", { name: /guardar/i }));
    expect(alGuardarCredencial).toHaveBeenCalledWith("anthropic", "sk-ant-NO-DEBE-SALIR");
    expect(document.body.innerHTML).not.toContain("sk-ant-NO-DEBE-SALIR");
    fireEvent.click(screen.getByRole("button", { name: /continuar/i }));
    expect(document.body.innerHTML).not.toContain("sk-ant-NO-DEBE-SALIR");
  });

  it("no se pasa al paso siguiente hasta que se ha dicho dónde quedó la credencial", () => {
    render(<Wizard pasos={["cuenta", "entorno"]} {...manejadores} rutaDeCredencial="~/.xonecode/auth.json" />);
    // Antes de guardar, el paso de entorno no está: el wizard enseña uno cada vez.
    expect(screen.queryByLabelText(/url del mcp/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /guardar/i }));
    // Y después de guardar TAMPOCO: primero el «dónde quedó», y solo entonces «Continuar».
    expect(screen.queryByLabelText(/url del mcp/i)).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("auth.json");
    fireEvent.click(screen.getByRole("button", { name: /continuar/i }));
    expect(screen.getByLabelText(/url del mcp/i)).toBeTruthy();
  });

  /**
   * `http://` en loopback es la única excepción, y existe por el on-premise en desarrollo.
   * Es una lista CERRADA de hosts, no «lo que parezca local»: `mcp.localhost.ejemplo.com`
   * no es la máquina de nadie.
   */
  it("http:// en 127.0.0.1 y en localhost SÍ vale: es el on-premise en desarrollo", () => {
    for (const url of ["http://127.0.0.1:8080/mcp", "http://localhost:8080/mcp"]) {
      const alRegistrarEntorno = vi.fn();
      render(<Wizard pasos={["entorno"]} {...manejadores} alRegistrarEntorno={alRegistrarEntorno} />);
      fireEvent.change(screen.getByLabelText(/url del mcp/i), { target: { value: url } });
      fireEvent.click(screen.getByRole("button", { name: /registrar/i }));
      expect(screen.queryByRole("alert"), url).toBeNull();
      expect(alRegistrarEntorno).toHaveBeenCalledWith({ id: "webstudio", nombre: "XOne WebStudio", url });
      cleanup();
    }
  });

  it("un host que solo PARECE loopback no cuela, ni una URL con credenciales dentro", () => {
    for (const url of ["http://mcp.localhost.ejemplo.com/mcp", "https://u:p@mcp.ejemplo.com/mcp", "no-es-una-url"]) {
      const alRegistrarEntorno = vi.fn();
      render(<Wizard pasos={["entorno"]} {...manejadores} alRegistrarEntorno={alRegistrarEntorno} />);
      fireEvent.change(screen.getByLabelText(/url del mcp/i), { target: { value: url } });
      fireEvent.click(screen.getByRole("button", { name: /registrar/i }));
      expect(screen.getByRole("alert"), url).toBeTruthy();
      expect(alRegistrarEntorno, url).not.toHaveBeenCalled();
      cleanup();
    }
  });

  it("registrar un entorno «otro» pide nombre y URL, y los dos oficiales no", () => {
    const alRegistrarEntorno = vi.fn();
    render(<Wizard pasos={["entorno"]} {...manejadores} alRegistrarEntorno={alRegistrarEntorno} />);
    expect(screen.queryByLabelText(/nombre/i)).toBeNull();
    fireEvent.change(screen.getByLabelText(/^entorno/i), { target: { value: "otro" } });
    expect(screen.getByLabelText(/nombre/i)).toBeTruthy();
    expect((screen.getByLabelText(/url del mcp/i) as HTMLInputElement).value).toBe("");
    fireEvent.change(screen.getByLabelText(/nombre/i), { target: { value: "Casa" } });
    fireEvent.change(screen.getByLabelText(/url del mcp/i), { target: { value: "https://mcp.casa.local/mcp" } });
    fireEvent.click(screen.getByRole("button", { name: /registrar/i }));
    expect(alRegistrarEntorno).toHaveBeenCalledWith({ id: "otro", nombre: "Casa", url: "https://mcp.casa.local/mcp" });
  });

  it("elegir el entorno oficial rellena su URL: no hay que teclear lo que ya se sabe", () => {
    render(<Wizard pasos={["entorno"]} {...manejadores} />);
    expect((screen.getByLabelText(/url del mcp/i) as HTMLInputElement).value).toBe("https://webstudio.xone.es/mcp");
    fireEvent.change(screen.getByLabelText(/^entorno/i), { target: { value: "manager" } });
    expect((screen.getByLabelText(/url del mcp/i) as HTMLInputElement).value).toBe("https://mcp.xonemanager.com/mcp");
  });

  it("sin pasos pendientes no pinta nada: el alta no es una pantalla que visitar por gusto", () => {
    const { container } = render(<Wizard pasos={[]} {...manejadores} />);
    expect(container.textContent).toBe("");
  });

  it("el paso de proyecto elige proyecto y rama", () => {
    const alElegirProyecto = vi.fn();
    render(<Wizard pasos={["proyecto"]} {...manejadores} alElegirProyecto={alElegirProyecto} />);
    fireEvent.click(screen.getByRole("button", { name: /abrir/i }));
    expect(alElegirProyecto).toHaveBeenCalledWith({ proyecto: "p1", rama: "master" });
  });

  /**
   * Las dos listas del paso de proyecto llegan DESPUÉS de montar: el wizard aparece en el
   * paso de entorno, cuando el servidor todavía no sabe ni el entorno. Un `useState` con el
   * primero de la lista se queda congelado en la cadena vacía, y como `onChange` solo salta
   * cuando el usuario CAMBIA de opción, con un solo proyecto el `<select>` enseñaba uno y el
   * estado tenía otro. Los dos tests de aquí abajo son ese flujo, no el del montaje directo.
   */
  it("el paso de entorno NO avanza al enviar: avanza cuando llegan los proyectos", () => {
    // Medido en el navegador: avanzando al enviar, un registro que falla dejaba al usuario
    // en un paso de proyecto vacío, con el error del paso ANTERIOR debajo y sin volver.
    const vista = render(
      <Wizard pasos={["entorno", "proyecto"]} {...manejadores} proyectos={[]} ramas={[]} />
    );
    fireEvent.click(screen.getByRole("button", { name: /registrar/i }));
    expect(screen.getByRole("heading").textContent).toBe("Entorno");
    // Con el fallo contado, se sigue en el paso que lo produjo.
    vista.rerender(
      <Wizard pasos={["entorno", "proyecto"]} {...manejadores} proyectos={[]} ramas={[]} aviso="fetch failed" />
    );
    expect(screen.getByRole("heading").textContent).toBe("Entorno");
    expect(screen.getByRole("alert").textContent).toBe("fetch failed");
    // Y cuando los proyectos llegan —la prueba de que salió bien—, avanza solo.
    vista.rerender(
      <Wizard
        pasos={["entorno", "proyecto"]}
        {...manejadores}
        proyectos={[{ id: "p1", nombre: "MinitMT" }]}
        ramas={[]}
      />
    );
    expect(screen.getByRole("heading").textContent).toBe("Proyecto");
  });

  it("cuando los proyectos llegan después de montar, se pide la rama del primero sin tocar nada", () => {
    const alCambiarProyecto = vi.fn();
    const vista = render(
      <Wizard pasos={["proyecto"]} {...manejadores} proyectos={[]} ramas={[]} alCambiarProyecto={alCambiarProyecto} />
    );
    expect(alCambiarProyecto).not.toHaveBeenCalled();
    vista.rerender(
      <Wizard
        pasos={["proyecto"]}
        {...manejadores}
        proyectos={[{ id: "p1", nombre: "MinitMT" }]}
        ramas={[]}
        alCambiarProyecto={alCambiarProyecto}
      />
    );
    expect(alCambiarProyecto).toHaveBeenCalledWith("p1");
  });

  it("cuando las ramas llegan después, el envío lleva una rama de verdad y no cadena vacía", () => {
    // Mandar `rama: ""` es lo que el servidor lee como «pídeme las ramas»: sin esto, un
    // proyecto con una sola rama dejaba el alta dando vueltas para siempre.
    const alElegirProyecto = vi.fn();
    const vista = render(
      <Wizard pasos={["proyecto"]} {...manejadores} proyectos={[]} ramas={[]} alElegirProyecto={alElegirProyecto} />
    );
    vista.rerender(
      <Wizard
        pasos={["proyecto"]}
        {...manejadores}
        proyectos={[{ id: "p1", nombre: "MinitMT" }]}
        ramas={["master"]}
        alElegirProyecto={alElegirProyecto}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /abrir/i }));
    expect(alElegirProyecto).toHaveBeenCalledWith({ proyecto: "p1", rama: "master" });
  });
});
