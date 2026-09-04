import { render, screen, fireEvent, cleanup, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { App } from "./App.js";
import { crearStoreDelCliente } from "./store.js";

afterEach(cleanup);

/**
 * El cableado de las dos interacciones donde decide una persona. Los componentes ya están
 * probados por separado; lo que esto prueba es lo que ningún test de componente ve: que
 * `App` los MONTA cuando el store dice que hay algo esperando, que manda por el cable la
 * clase de mensaje que el servidor sabe consumir, y que los retira después.
 *
 * `enviar` entra inyectado, como en `main.tsx`: aquí no se construye ningún `EventSource`
 * —jsdom no lo implementa— ni ningún `fetch`.
 */
function montar(enviar = vi.fn(() => Promise.resolve(undefined as unknown))) {
  const store = crearStoreDelCliente();
  const vista = render(<App store={store} enviar={enviar} />);
  act(() => store.marcarConectado());
  return { store, enviar, vista };
}

/** Un `enviar` que revienta, como un `fetch` sin red. */
const enviarQueFalla = () => vi.fn(() => Promise.reject(new Error("sin red")) as Promise<unknown>);

const PENDIENTE = {
  id: "1",
  origen: "dev",
  descripcion: "escribir src/app.xne",
  decisionesPermitidas: ["approve", "reject"],
};

describe("App: la pregunta de texto libre", () => {
  it("una `pregunta` del cable se pinta y su respuesta viaja como `respuesta`, no como prosa", async () => {
    const { store, enviar } = montar();
    act(() => store.aplicar({ clase: "pregunta", texto: "¿Subir los cambios? [s/N] " }));
    fireEvent.change(screen.getByLabelText(/subir los cambios/i), { target: { value: "s" } });
    fireEvent.click(screen.getByRole("button", { name: /responder/i }));
    expect(enviar).toHaveBeenCalledWith({ clase: "respuesta", texto: "s" });
    // Y se retira DESPUÉS de que el envío haya llegado —de ahí el `waitFor`—: el servidor no
    // manda ningún «ya está», así que si no la quitara el cliente se quedaría pintada encima
    // del turno siguiente; y quitarla antes de tiempo mentiría sobre un envío que falle.
    await waitFor(() => expect(screen.queryByLabelText(/subir los cambios/i)).toBeNull());
  });

  it("lo que escribe el compositor sigue yendo como prosa: es la petición del usuario, no una respuesta", () => {
    const { enviar } = montar();
    fireEvent.change(screen.getByPlaceholderText(/escribe una petición/i), { target: { value: "haz un listado" } });
    fireEvent.keyDown(screen.getByPlaceholderText(/escribe una petición/i), { key: "Enter" });
    expect(enviar).toHaveBeenCalledWith({ clase: "prosa", texto: "haz un listado" });
  });
});

describe("App: la aprobación", () => {
  it("una `aprobacion` del cable abre el modal con su diff, y «Aprobar» manda `decision`", async () => {
    const { store, enviar } = montar();
    act(() => store.aplicar({
      clase: "aprobacion",
      pendientes: [PENDIENTE],
      ficheros: { "1": "src/app.xne" },
      diffs: { "1": [{ tipo: "anadido", texto: '<coleccion name="clientes"/>' }] },
    }));
    expect(screen.getByText(/coleccion name="clientes"/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /aprobar/i }));
    expect(enviar).toHaveBeenCalledWith({ clase: "decision", decisiones: { "1": "approve" } });
    await waitFor(() => expect(screen.queryByText(/coleccion name="clientes"/)).toBeNull());
  });

  it("Escape manda un RECHAZO explícito por el cable, no silencio", () => {
    const { store, enviar } = montar();
    act(() => store.aplicar({ clase: "aprobacion", pendientes: [PENDIENTE], ficheros: {}, diffs: {} }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(enviar).toHaveBeenCalledWith({ clase: "decision", decisiones: { "1": "reject" } });
  });

  /**
   * Cerrar el modal manda UNA decisión. `cerrarAprobacion` lo desmonta, y el desmontaje es
   * justo lo que dispara el rechazo-al-desmontar del componente: sin el candado `decidido`,
   * aprobar mandaría el `approve` y acto seguido un `reject` sobre la misma aprobación.
   */
  it("aprobar no arrastra un rechazo detrás al cerrarse el modal", () => {
    const { store, enviar } = montar();
    act(() => store.aplicar({ clase: "aprobacion", pendientes: [PENDIENTE], ficheros: {}, diffs: {} }));
    fireEvent.click(screen.getByRole("button", { name: /aprobar/i }));
    expect(enviar.mock.calls.filter(([m]) => (m as { clase: string }).clase === "decision")).toHaveLength(1);
  });

  /**
   * Al caerse el SSE, `marcarDesconectado` retira la aprobación porque el servidor ya la
   * resolvió —como rechazo— en `alDesconectar`. El modal se desmonta sin decisión previa,
   * así que su red manda el rechazo explícito: llega si la conexión vuelve, y si no, el
   * servidor ya había rechazado por su cuenta. En ningún camino queda una aprobación viva.
   */
  it("caerse la conexión con el modal abierto no deja nada aprobado", () => {
    const { store, enviar } = montar();
    act(() => store.aplicar({ clase: "aprobacion", pendientes: [PENDIENTE], ficheros: {}, diffs: {} }));
    act(() => store.marcarDesconectado());
    const decisiones = enviar.mock.calls
      .map(([m]) => m as { clase: string; decisiones?: Record<string, string> })
      .filter((m) => m.clase === "decision");
    expect(decisiones).toEqual([{ clase: "decision", decisiones: { "1": "reject" } }]);
  });
});

describe("App: el secreto y el selector, que también colgaban", () => {
  /**
   * `/modelos`, `/themes` y `/provider <x>` caen en `seleccionar` y `leerSecreto`, y los
   * tres se teclean desde el compositor: sin interfaz, la sesión web se colgaba hasta el
   * plazo en cuanto alguien los usaba.
   */
  it("un `selector` del cable se pinta y la elección viaja como `eleccion`", async () => {
    const { store, enviar } = montar();
    act(() =>
      store.aplicar({
        clase: "selector",
        selector: { titulo: "Elige modelo", opciones: [{ id: "claude-x", etiqueta: "Claude X" }] },
      })
    );
    fireEvent.click(screen.getByRole("button", { name: /claude x/i }));
    expect(enviar).toHaveBeenCalledWith({ clase: "eleccion", id: "claude-x" });
    await waitFor(() => expect(screen.queryByRole("group", { name: /elige modelo/i })).toBeNull());
  });

  it("cancelar el selector viaja SIN `id`: el servidor lo traduce a `undefined`", async () => {
    const { store, enviar } = montar();
    act(() =>
      store.aplicar({
        clase: "selector",
        selector: { titulo: "Elige modelo", opciones: [{ id: "claude-x", etiqueta: "Claude X" }] },
      })
    );
    fireEvent.click(screen.getByRole("button", { name: /cancelar/i }));
    // `JSON.stringify` descarta las claves `undefined`, así que por el cable sale
    // `{"clase":"eleccion"}` — y eso, y no una cadena vacía, es lo que significa cancelar.
    const enviado = enviar.mock.calls.at(-1)![0];
    expect(JSON.parse(JSON.stringify(enviado))).toEqual({ clase: "eleccion" });
    await waitFor(() => expect(screen.queryByRole("group", { name: /elige modelo/i })).toBeNull());
  });

  it("un `secreto` del cable se pinta oculto, viaja como `secreto` y NO entra en el store", async () => {
    const { store, enviar } = montar();
    act(() => store.aplicar({ clase: "secreto", pregunta: "clave de anthropic: " }));
    const campo = screen.getByLabelText(/clave de anthropic/i) as HTMLInputElement;
    expect(campo.type).toBe("password");
    fireEvent.change(campo, { target: { value: "sk-ant-NO-DEBE-SALIR" } });
    fireEvent.click(screen.getByRole("button", { name: /responder/i }));
    expect(enviar).toHaveBeenCalledWith({ clase: "secreto", valor: "sk-ant-NO-DEBE-SALIR" });
    // La costura que importa: el estado del cliente no guarda la clave en ninguna parte,
    // ni siquiera en el apartado que la pidió.
    expect(JSON.stringify(store.leer())).not.toContain("sk-ant-NO-DEBE-SALIR");
    await waitFor(() => expect(screen.queryByLabelText(/clave de anthropic/i)).toBeNull());
  });
});

describe("App: un envío que falla no puede parecer que salió bien", () => {
  it("la aprobación se queda en pantalla, lo dice, y nada se da por aprobado", async () => {
    const { store, enviar } = montar(enviarQueFalla());
    act(() => store.aplicar({ clase: "aprobacion", pendientes: [PENDIENTE], ficheros: {}, diffs: {} }));
    fireEvent.click(screen.getByRole("button", { name: /aprobar/i }));
    expect(enviar).toHaveBeenCalledWith({ clase: "decision", decisiones: { "1": "approve" } });
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/no llegó/i));
    expect(store.leer().aprobacion).toBeDefined();
    // Y el modal sigue siendo utilizable: el candado se soltó.
    fireEvent.click(screen.getByRole("button", { name: /aprobar/i }));
    expect(enviar.mock.calls.filter(([m]) => (m as { clase: string }).clase === "decision")).toHaveLength(2);
  });

  it("la pregunta se queda en pantalla y lo dice, en vez de fingir que se contestó", async () => {
    const { store } = montar(enviarQueFalla());
    act(() => store.aplicar({ clase: "pregunta", texto: "¿Subir los cambios? [s/N] " }));
    fireEvent.click(screen.getByRole("button", { name: /responder/i }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/no llegó/i));
    expect(screen.getByLabelText(/subir los cambios/i)).toBeTruthy();
    expect(store.leer().pregunta).toBeDefined();
  });
});
