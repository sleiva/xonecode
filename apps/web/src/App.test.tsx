import { render, screen, fireEvent, cleanup, act, waitFor, within } from "@testing-library/react";
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
    // El propio `<h2>Entorno</h2>` del wizard se quitó (F4 de la revisión): repetía el
    // rótulo «Entorno de CloudStudio» que ya pone `PasosDelAlta` justo encima, un paso
    // más arriba en el mismo `TarjetaDeAlta`. El campo del formulario es la prueba de
    // que el wizard sigue ahí.
    expect(screen.getByLabelText(/url del mcp/i)).toBeTruthy();
    expect(screen.queryByPlaceholderText(/escribe una petición/i)).toBeNull();
    expect(screen.queryByRole("tablist")).toBeNull();
  });

  /**
   * Medido en pantalla: con el modelo ya elegido y el alta en el paso de entorno, no había
   * forma de cambiarlo. La progresión decía «Modelo ✓» y no se podía pulsar, y `/modelo`
   * vive en el compositor, que durante el alta no existe.
   */
  it("desde el paso de entorno se puede VOLVER al modelo: el paso hecho es un botón", async () => {
    const { store, enviar } = montarSinAbrir();
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
    fireEvent.click(screen.getByRole("button", { name: /modelo/i }));
    // Un mensaje de alta con el paso de CUENTA: el asistente lo conduce el servidor, no el
    // wizard, así que lo único que manda el cliente es «vuelve a preguntarme aquello».
    expect(enviar).toHaveBeenCalledWith({ clase: "alta", paso: "cuenta" });
    // El paso de entorno NO es un botón: no se puede adelantar lo que aún no toca.
    expect(screen.queryByRole("button", { name: /entorno de cloudstudio/i })).toBeNull();
  });

  it("mientras la cuenta se vuelve a preguntar, el formulario de entorno NO se queda debajo", () => {
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
    expect(screen.getByLabelText(/url del mcp/i)).toBeTruthy();
    // Al volver al modelo, `alta` YA está en el cliente con «entorno» pendiente: sin mirar
    // la pregunta en vuelo se pintarían los dos pasos a la vez —el selector arriba y el
    // formulario debajo— en una progresión que dice que solo hay uno abierto.
    act(() =>
      store.aplicar({
        clase: "selector",
        selector: { titulo: "Proveedor de modelos", opciones: [{ id: "ollama", etiqueta: "ollama" }] },
      })
    );
    expect(screen.getByRole("group", { name: /proveedor de modelos/i })).toBeTruthy();
    expect(screen.queryByLabelText(/url del mcp/i)).toBeNull();
    // Y la progresión vuelve a decir la verdad: el modelo está otra vez en curso, así que
    // deja de ser un paso al que volver.
    expect(screen.queryByRole("button", { name: /^modelo$/i })).toBeNull();
  });

  it("cuenta y entorno resueltos pero SIN proyecto abierto: la barra ya tiene datos, el centro espera", () => {
    const { store } = montarSinAbrir();
    act(() =>
      store.aplicar({
        clase: "alta",
        pasos: [],
        proveedores: [],
        entornos: [{ id: "webstudio", nombre: "XOne WebStudio", url: "https://mcp.example/mcp" }],
        // La barra pinta los REGISTRADOS, no los ofrecidos: un on-premise recién dado de
        // alta no está en la lista ofrecida, y enseñar aquélla lo leía como «XOne
        // WebStudio» — el nombre de otro servidor.
        registrados: [{ id: "mcp.casa.local", nombre: "CloudStudio de casa", url: "https://mcp.casa.local/mcp" }],
        proyectos: [{ id: "p1", nombre: "Tienda" }],
        ramas: [],
        proyectoAbierto: false,
      })
    );
    // Ni transcript, ni compositor, ni pestañas: el proyecto salió del alta pero
    // TODAVÍA no se ha elegido ninguno, así que el centro no tiene sesión que enseñar.
    expect(screen.queryByPlaceholderText(/escribe una petición/i)).toBeNull();
    expect(screen.queryByRole("tablist")).toBeNull();
    // El centro ya no es un hueco con una frase: es el ESCRITORIO, con los proyectos que
    // el servidor manda y un clic para empezar en cada uno.
    expect(screen.getByRole("heading", { name: "Tienda" })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /nueva sesión/i }).length).toBeGreaterThan(0);
    // La barra SÍ está montada y con datos reales — ya no listas vacías a fuego:
    // `App.tsx` deja de mandar `entornos={[]}` en cuanto `estado.alta` los trae.
    // El entorno aparece DOS veces y las dos son ciertas: en el desplegable de la barra y
    // en la portada del escritorio. Se busca dentro de la barra para probar la de la barra.
    // Hay dos `nav`: la barra lateral y las migas de la cabecera —que ahora se pinta
    // también en el escritorio, porque es la barra de herramientas de la aplicación—. La
    // de la barra es la que NO tiene nombre accesible.
    const barra = screen.getAllByRole("navigation").find((n) => n.getAttribute("aria-label") === null)!;
    expect(within(barra).getByText("CloudStudio de casa")).toBeTruthy();
    expect(within(barra).getByText("Tienda")).toBeTruthy();
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

  /**
   * F1 de la revisión: el bug medido no era que `persona.ts` no cayera al usuario del
   * sistema —`persona.test.ts` ya prueba esa rama y pasaba—, era que el nombre no tenía
   * por dónde llegar al CLIENTE mientras el paso de cuenta seguía en curso: `alta` (el
   * único mensaje que hasta entonces llevaba `nombre`) no se manda hasta que
   * `conducirCuenta()` termina (`arranque.ts#anunciarAlta`), y eso puede tardar lo que
   * tarde un humano en elegir modelo. Este test es el que se rompía sin `estado.nombre`:
   * uno que solo mirase `alta?.nombre` (como antes) seguiría en verde aunque la
   * preferencia de `App.tsx` se revirtiera por descuido, porque nunca aplica un
   * `alta` con nombre.
   */
  it("el nombre llega ANTES de que la cuenta resuelva, por la clase «bienvenida» — no solo dentro del `alta` final", () => {
    const { store } = montarSinAbrir();
    act(() => store.aplicar({ clase: "bienvenida", nombre: "Ana" }));
    act(() =>
      store.aplicar({
        clase: "selector",
        selector: { titulo: "Proveedor de modelos", opciones: [{ id: "ollama", etiqueta: "ollama" }] },
      })
    );
    // Todavía sin `alta`: si el saludo dependiera de `alta?.nombre`, esto sería «Hola» a
    // secas — que es exactamente el bug medido.
    expect(screen.getByText("Hola, Ana")).toBeTruthy();
  });
});

describe("App: abrir un proyecto desde la barra (Layer C)", () => {
  function montarConProyectos(proyectos: { id: string; nombre: string }[]) {
    const store = crearStoreDelCliente();
    const enviar = vi.fn(() => Promise.resolve(undefined as unknown));
    const vista = render(<App store={store} enviar={enviar} />);
    act(() => store.marcarConectado());
    act(() =>
      store.aplicar({
        clase: "alta",
        pasos: [],
        proveedores: [],
        entornos: [{ id: "webstudio", nombre: "XOne WebStudio", url: "https://mcp.example/mcp" }],
        proyectos,
        ramas: [],
        proyectoAbierto: false,
      })
    );
    return { store, enviar, vista };
  }

  it("pulsar un proyecto pide sus ramas SIN abrir nada todavía", () => {
    const { enviar } = montarConProyectos([{ id: "p1", nombre: "Tienda" }]);
    fireEvent.click(screen.getByRole("button", { name: "Tienda" }));
    expect(enviar).toHaveBeenCalledWith({ clase: "alta", paso: "proyecto", proyecto: "p1" });
    // Nada de Selector todavía: `estado.alta.ramas` sigue vacía hasta que el servidor
    // conteste — no se inventa un catálogo mientras se espera.
    expect(screen.queryByRole("group")).toBeNull();
  });

  /**
   * La rama ya no se elige en un selector suelto en mitad del centro —que no decía ni de
   * qué proyecto era ni que iba a DESCARGARLO—: se elige en la ventana de sesión nueva,
   * junto al aviso de la descarga. Y con una sola rama tampoco se manda sola: elegir por
   * el usuario y callarlo es cómo se acaba trabajando sobre la rama equivocada.
   */
  it("la ventana enseña la rama aunque solo haya una, y no empieza sola", () => {
    const { store, enviar } = montarConProyectos([{ id: "p1", nombre: "Tienda" }]);
    fireEvent.click(screen.getByRole("button", { name: "Tienda" }));
    enviar.mockClear();

    act(() =>
      store.aplicar({
        clase: "alta",
        pasos: [],
        proveedores: [],
        entornos: [{ id: "webstudio", nombre: "XOne WebStudio", url: "https://mcp.example/mcp" }],
        proyectos: [{ id: "p1", nombre: "Tienda" }],
        ramas: ["master"],
        proyectoAbierto: false,
      })
    );

    expect(enviar).not.toHaveBeenCalled();
    expect((screen.getByLabelText(/rama de origen/i) as HTMLSelectElement).value).toBe("master");
    // Y dice lo que va a pasar de verdad: descargar el proyecto entero.
    expect(screen.getByText(/se descarga entero/i)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /^empezar$/i }));
    expect(enviar).toHaveBeenCalledWith({ clase: "alta", paso: "proyecto", proyecto: "p1", rama: "master" });
  });

  it("con VARIAS ramas se elige en la ventana, y empezar manda esa rama", () => {
    const { store, enviar } = montarConProyectos([{ id: "p1", nombre: "Tienda" }]);
    fireEvent.click(screen.getByRole("button", { name: "Tienda" }));
    enviar.mockClear();

    act(() =>
      store.aplicar({
        clase: "alta",
        pasos: [],
        proveedores: [],
        entornos: [{ id: "webstudio", nombre: "XOne WebStudio", url: "https://mcp.example/mcp" }],
        proyectos: [{ id: "p1", nombre: "Tienda" }],
        ramas: ["master", "pruebas"],
        proyectoAbierto: false,
      })
    );

    expect(enviar).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/rama de origen/i), { target: { value: "pruebas" } });
    fireEvent.click(screen.getByRole("button", { name: /^empezar$/i }));
    expect(enviar).toHaveBeenCalledWith({ clase: "alta", paso: "proyecto", proyecto: "p1", rama: "pruebas" });
  });

  /**
   * Con la copia local ya bajada no hay nada que preguntar ni que descargar: ni se piden
   * ramas —sería una conexión con CloudStudio por cada clic— ni se enseña el desplegable.
   */
  it("un proyecto YA bajado no pide ramas: la ventana solo confirma", () => {
    const { enviar } = montarConProyectos([{ id: "p1", nombre: "Tienda", local: true }]);
    fireEvent.click(screen.getByRole("button", { name: "Tienda" }));
    expect(enviar).not.toHaveBeenCalled();
    expect(screen.queryByLabelText(/rama de origen/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^empezar$/i }));
    expect(enviar).toHaveBeenCalledWith({ clase: "sesion", proyecto: "p1" });
  });

  /**
   * La barra superior es la barra de herramientas de la APLICACIÓN, no de la sesión: sin
   * sesión abierta sigue ahí (con la marca, el estado del cable y el plegado), pero sin
   * pestañas — sin transcript ni trayectoria, no llevarían a ningún sitio.
   */
  it("el escritorio también lleva barra superior, y sin pestañas", () => {
    montarConProyectos([{ id: "p1", nombre: "Tienda" }]);
    expect(screen.getByRole("button", { name: /ocultar la barra lateral/i })).toBeTruthy();
    expect(screen.queryByRole("tablist")).toBeNull();
  });

  it("la barra lateral se pliega y se despliega desde la barra superior", () => {
    montarConProyectos([{ id: "p1", nombre: "Tienda" }]);
    // Desplegada: la barra está y su pie «Ajustes» se ve.
    expect(screen.getByText("Ajustes")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /ocultar la barra lateral/i }));
    // Plegada, la barra se DESMONTA: una barra invisible sigue siendo tabulable, y se
    // llegaría con el teclado a botones que no se ven.
    expect(screen.queryByText("Ajustes")).toBeNull();

    // Y el botón que la devuelve vive en la barra superior, no en la lateral — plegada, su
    // propio botón se habría ido con ella y no habría por dónde volver.
    fireEvent.click(screen.getByRole("button", { name: /mostrar la barra lateral/i }));
    expect(screen.getByText("Ajustes")).toBeTruthy();
  });

  it("el «+» de la fila abre la MISMA ventana que pulsar el proyecto", () => {
    const { enviar } = montarConProyectos([{ id: "p1", nombre: "Tienda", local: true }]);
    fireEvent.click(screen.getByRole("button", { name: /nueva sesión en tienda/i }));
    expect(screen.getByText(/nueva sesión en tienda/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^empezar$/i }));
    expect(enviar).toHaveBeenCalledWith({ clase: "sesion", proyecto: "p1" });
  });

  it("elegir otro entorno lo dice por el cable: sus proyectos los trae el servidor", () => {
    const { store, enviar } = montarConProyectos([{ id: "p1", nombre: "Tienda" }]);
    act(() =>
      store.aplicar({
        clase: "alta",
        pasos: [],
        proveedores: [],
        entornos: [],
        registrados: [
          { id: "webstudio", nombre: "XOne WebStudio", url: "https://mcp.example/mcp" },
          { id: "casa", nombre: "On-premise", url: "https://mcp.casa.local/mcp" },
        ],
        proyectos: [{ id: "p1", nombre: "Tienda" }],
        ramas: [],
        proyectoAbierto: false,
      })
    );
    enviar.mockClear();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "casa" } });
    expect(enviar).toHaveBeenCalledWith({ clase: "entorno", accion: "activo", entorno: "casa" });
  });

  it("cancelar la ventana no manda nada: el proyecto se queda sin abrir", () => {
    const { store, enviar } = montarConProyectos([{ id: "p1", nombre: "Tienda" }]);
    fireEvent.click(screen.getByRole("button", { name: "Tienda" }));
    act(() =>
      store.aplicar({
        clase: "alta",
        pasos: [],
        proveedores: [],
        entornos: [{ id: "webstudio", nombre: "XOne WebStudio", url: "https://mcp.example/mcp" }],
        proyectos: [{ id: "p1", nombre: "Tienda" }],
        ramas: ["master", "pruebas"],
        proyectoAbierto: false,
      })
    );
    enviar.mockClear();

    fireEvent.click(screen.getByRole("button", { name: /cancelar/i }));
    expect(enviar).not.toHaveBeenCalled();
    // Y la ventana se retira: debajo queda el escritorio, con su tarjeta y su acción.
    expect(screen.queryByRole("button", { name: /^empezar$/i })).toBeNull();
    expect(screen.getByRole("heading", { name: "Tienda" })).toBeTruthy();
  });
});
