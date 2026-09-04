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
/**
 * Con el proyecto ya abierto: `enAlta` (`App.tsx`) solo deja de tapar la pantalla de
 * arranque cuando llega un `alta` con `pasos: []`, y la maqueta completa solo pinta la
 * sesión de verdad (en vez de `SinProyectoAbierto`) con `proyectoAbierto: true` — lo que
 * manda `anunciarAlta` en cuanto `vestibulo.proyectoAbierto()` es cierto. Todo lo que
 * este fichero prueba pasa DESPUÉS de esa apertura: la pregunta, la aprobación, el
 * secreto y el selector de mitad de conversación, no los del alta. Sin estos dos campos
 * `App` se quedaría enseñando la pantalla de arranque o el hueco de «elige un proyecto»,
 * y ninguno de esos componentes montaría.
 */
function montar(enviar = vi.fn(() => Promise.resolve(undefined as unknown))) {
  const store = crearStoreDelCliente();
  const vista = render(<App store={store} enviar={enviar} />);
  act(() => store.marcarConectado());
  act(() =>
    store.aplicar({
      clase: "alta",
      pasos: [],
      proveedores: [],
      entornos: [],
      proyectos: [],
      ramas: [],
      proyectoAbierto: true,
    })
  );
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

/**
 * El primer arranque: `enAlta` (`App.tsx`) tapa la maqueta entera —Cabecera, pestañas del
 * transcript, compositor, barra de estado y barra lateral— mientras no hay proyecto
 * abierto, y esa era justo la corrección que pidió el encargo: el problema no era que la
 * barra vacía se viera fea, era que se viera. Aquí, y no en `montar()` (que ya simula el
 * proyecto abierto), se prueba lo de ANTES de esa apertura.
 */
describe("App: la pantalla de arranque no enseña nada más", () => {
  function montarSinAbrir() {
    const store = crearStoreDelCliente();
    const enviar = vi.fn(() => Promise.resolve(undefined as unknown));
    const vista = render(<App store={store} enviar={enviar} />);
    act(() => store.marcarConectado());
    return { store, enviar, vista };
  }

  it("con el selector de cuenta (sin `alta` todavía) no hay compositor, ni pestañas, ni barra lateral", () => {
    const { store } = montarSinAbrir();
    act(() =>
      store.aplicar({
        clase: "selector",
        selector: { titulo: "Proveedor de modelos", opciones: [{ id: "ollama", etiqueta: "ollama" }] },
      })
    );
    expect(screen.getByRole("group", { name: /proveedor de modelos/i })).toBeTruthy();
    expect(screen.queryByPlaceholderText(/escribe una petición/i)).toBeNull();
    expect(screen.queryByRole("tablist")).toBeNull();
    // Y no «sin `<select>`»: con `entornos=[]` `Barra` tampoco pinta uno aunque SÍ esté
    // montada (`Barra.tsx`), así que esa comprobación no distinguiría nada. Su pie
    // («Ajustes») en cambio se enseña SIEMPRE que `Barra` monta — es la prueba de que no
    // ha montado, no de una lista vacía.
    expect(screen.queryByText("Ajustes")).toBeNull();
    // El oscuro se quitó del todo (precisión del usuario: recolorear TODA la app por un
    // atributo no era lo pedido; el splash es un FONDO, no un tema) — `App` no debe
    // ponerlo nunca, ni siquiera durante el alta.
    expect(document.body.hasAttribute("data-ds-dark-theme")).toBe(false);
  });

  /**
   * Antes de este aviso, un token inválido o el servidor caído mientras `estado.alta`
   * seguía `undefined` (nunca llegó ni un `selector`) pintaban el splash sólido y NADA
   * más: un fallo mudo, justo lo que este repo persigue en todas partes (`AGENTS.md`,
   * los avisos de honestidad). `AvisoDeConexion` ya devuelve `null` en conectado, así
   * que el camino feliz —las otras pruebas de este describe, todas conectadas— no
   * cambia por tenerlo montado.
   */
  it("desconectado y sin nada del alta todavía, lo dice — no un splash mudo", () => {
    const store = crearStoreDelCliente();
    render(<App store={store} enviar={vi.fn()} />);
    // Sin `marcarConectado()`: `ESTADO_INICIAL` (`store.ts`) ya nace `conectado: false`.
    expect(screen.getByText(/sin conexión con xonecode/i)).toBeTruthy();
  });

  it("con el wizard de entorno pendiente pasa lo mismo: solo el alta, nada de maqueta", () => {
    const { store } = montarSinAbrir();
    act(() =>
      store.aplicar({
        clase: "alta",
        pasos: ["entorno"],
        proveedores: [],
        entornos: [{ id: "webstudio", nombre: "XOne WebStudio", url: "https://mcp.example/mcp" }],
        proyectos: [],
        ramas: [],
        proyectoAbierto: false,
      })
    );
    expect(screen.getByRole("heading", { name: /entorno/i })).toBeTruthy();
    expect(screen.queryByPlaceholderText(/escribe una petición/i)).toBeNull();
    expect(screen.queryByRole("tablist")).toBeNull();
  });

  it("cuenta y entorno resueltos pero SIN proyecto abierto: la barra ya tiene datos, el centro espera", () => {
    const { store } = montarSinAbrir();
    act(() =>
      store.aplicar({
        clase: "alta",
        pasos: [],
        proveedores: [],
        entornos: [{ id: "webstudio", nombre: "XOne WebStudio", url: "https://mcp.example/mcp" }],
        proyectos: [{ id: "p1", nombre: "Tienda" }],
        ramas: [],
        proyectoAbierto: false,
      })
    );
    // Ni transcript, ni compositor, ni pestañas: el proyecto salió del alta pero
    // TODAVÍA no se ha elegido ninguno, así que el centro no tiene sesión que enseñar.
    expect(screen.queryByPlaceholderText(/escribe una petición/i)).toBeNull();
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.getByText(/elige un proyecto en la barra/i)).toBeTruthy();
    // La barra SÍ está montada y con datos reales — ya no listas vacías a fuego:
    // `App.tsx` deja de mandar `entornos={[]}` en cuanto `estado.alta` los trae.
    expect(screen.getByText("XOne WebStudio")).toBeTruthy();
    expect(screen.getByText("Tienda")).toBeTruthy();
  });

  it("en cuanto `alta` llega con `pasos: []` y `proyectoAbierto: true` aparece la maqueta completa, con compositor y barra", () => {
    const { store } = montarSinAbrir();
    act(() =>
      store.aplicar({
        clase: "alta",
        pasos: [],
        proveedores: [],
        entornos: [],
        proyectos: [],
        ramas: [],
        proyectoAbierto: true,
      })
    );
    expect(screen.getByPlaceholderText(/escribe una petición/i)).toBeTruthy();
    expect(screen.getByRole("tablist")).toBeTruthy();
    // La barra lateral, con su pie: sin entorno/proyecto en ESTE mensaje, sus niveles
    // siguen vacíos — es la prueba de que la barra está montada, no de un `<select>` que
    // con esas props no existe.
    expect(screen.getByText(/sin entorno que enseñar/i)).toBeTruthy();
    expect(screen.getByText("Ajustes")).toBeTruthy();
    // El oscuro se quitó del todo: la maqueta ya abierta va clara, como el resto de la
    // app — nunca se pone el atributo, ni aquí ni en el alta.
    expect(document.body.hasAttribute("data-ds-dark-theme")).toBe(false);
  });

  it("la bienvenida saluda por el nombre que manda el servidor, y sin él saluda igual sin inventarlo", () => {
    const { store } = montarSinAbrir();
    act(() =>
      store.aplicar({
        clase: "selector",
        selector: { titulo: "Proveedor de modelos", opciones: [{ id: "ollama", etiqueta: "ollama" }] },
      })
    );
    // Sin `nombre` en ningún mensaje todavía: saluda sin nombre, no con un placeholder.
    expect(screen.getByText("Hola")).toBeTruthy();
    expect(screen.queryByText(/hola,/i)).toBeNull();

    act(() =>
      store.aplicar({
        clase: "alta",
        pasos: ["entorno"],
        proveedores: [],
        entornos: [],
        proyectos: [],
        ramas: [],
        proyectoAbierto: false,
        nombre: "Ana",
      })
    );
    expect(screen.getByText("Hola, Ana")).toBeTruthy();
  });
});
