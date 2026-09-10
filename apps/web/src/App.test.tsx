import { render, screen, fireEvent, cleanup, act, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { App } from "./App.js";
import { crearStoreDelCliente } from "./store.js";
import { DESPLEGADOS_AL_ABRIR } from "./componentes/Revision.js";

/** El `<input type="file">` de «Nueva tarea» está ESCONDIDO —lo dispara un botón nuestro,
 *  porque el nativo se pinta como la cromo del navegador—, así que no hay etiqueta que lo
 *  nombre: se llega por su tipo. */
const entradaDeFicheros = (): HTMLInputElement => {
  const e = document.querySelector('input[type="file"]');
  if (e === null) throw new Error("no hay entrada de ficheros");
  return e as HTMLInputElement;
};

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
  const vista = render(<App store={store} enviar={enviar} subirAdjunto={subirAdjuntoDeMentira} />);
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

/** La subida de adjuntos, concedida y sin red: `App` la recibe inyectada igual que `enviar`. */
const subirAdjuntoDeMentira = async (): Promise<{ ok: boolean; motivo?: string }> => ({ ok: true });

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
    fireEvent.click(screen.getByRole("button", { name: /aceptar/i }));
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
    fireEvent.click(screen.getByRole("button", { name: /aceptar/i }));
    expect(enviar).toHaveBeenCalledWith({ clase: "secreto", valor: "sk-ant-NO-DEBE-SALIR" });
    // La costura que importa: el estado del cliente no guarda la clave en ninguna parte,
    // ni siquiera en el apartado que la pidió.
    expect(JSON.stringify(store.leer())).not.toContain("sk-ant-NO-DEBE-SALIR");
    await waitFor(() => expect(screen.queryByLabelText(/clave de anthropic/i)).toBeNull());
  });

  it("cerrar Ajustes CANCELA la clave pendiente, en vez de mudarla al chat", async () => {
    // Visto en pantalla. El servidor sigue esperando por `leerSecreto`, y el centro solo
    // deja de pintar la pregunta MIENTRAS la ventana está abierta — así que al cerrarla
    // reaparecía flotando sobre el compositor, pidiendo la clave de un proveedor fuera de
    // todo contexto. Se cancela con una respuesta VACÍA, que es exactamente lo que el
    // servidor recibe cuando se cae el SSE: un camino ya probado en vez de una clase de
    // mensaje nueva para decir «me arrepentí».
    const { store, enviar } = montar();
    // Hay DOS accesos a Ajustes desde la revisión de interfaz (barra superior y lateral);
    // cualquiera de los dos abre la misma ventana.
    fireEvent.click(screen.getAllByRole("button", { name: "Ajustes" })[0]!);
    act(() => store.aplicar({ clase: "secreto", pregunta: "clave de openai: " }));
    // Con la ventana abierta no se pinta en el centro, y en la ventana solo aparece dentro
    // de la fila que se esté editando —aquí ninguna—: eso ya funcionaba y no es lo que se
    // prueba. Lo que se prueba es qué pasa al CERRAR.
    fireEvent.click(screen.getByRole("button", { name: "Cerrar ajustes" }));
    expect(enviar).toHaveBeenCalledWith({ clase: "secreto", valor: "" });
    // Y no reaparece en el centro, que es el fallo que se está arreglando.
    await waitFor(() => expect(screen.queryByLabelText(/clave de openai/i)).toBeNull());
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
    fireEvent.click(screen.getByRole("button", { name: /aceptar/i }));
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
    const vista = render(<App store={store} enviar={enviar} subirAdjunto={subirAdjuntoDeMentira} />);
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
    render(<App store={store} enviar={vi.fn()} subirAdjunto={subirAdjuntoDeMentira} />);
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
    const vista = render(<App store={store} enviar={enviar} subirAdjunto={subirAdjuntoDeMentira} />);
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
  it("un proyecto YA bajado se abre y ya: sin ventana, sin rama", () => {
    // La ventana existe para no descargar por un «+» pulsado sin querer; con la copia en
    // el equipo no se descarga nada, y medido en pantalla la ventana decía «se abre y ya»
    // y aun así pedía confirmar: un paso sin ninguna decisión dentro.
    const { enviar } = montarConProyectos([{ id: "p1", nombre: "Tienda", local: true }]);
    fireEvent.click(screen.getByRole("button", { name: "Tienda" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(enviar).toHaveBeenCalledWith({ clase: "sesion", proyecto: "p1" });
  });

  /**
   * La barra superior es la barra de herramientas de la APLICACIÓN, no de la sesión: sin
   * sesión abierta sigue ahí (con la marca, el estado del cable y el plegado), pero sin
   * pestañas — sin transcript ni trazas, no llevarían a ningún sitio.
   */
  /**
   * Con la sesión abierta no había NINGUNA forma de volver al escritorio —ni a los otros
   * proyectos, ni a «Tu equipo», ni al entorno—, porque el escritorio se pintaba solo
   * cuando no había proyecto abierto. Medido en pantalla.
   */
  it("la marca lleva al escritorio con la sesión abierta, y no cierra nada", () => {
    const { enviar } = montar();
    // Con sesión: hay pestañas y la marca es pulsable.
    expect(screen.queryByRole("tablist")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "xonecode" }));
    // Se ve el escritorio: su saludo, y las pestañas de la sesión se van con ella.
    expect(screen.getByRole("heading", { level: 1 })).toBeTruthy();
    expect(screen.queryByRole("tablist")).toBeNull();
    // Y NO se ha soltado el proyecto: es estado de vista, no una orden al servidor.
    expect(enviar).not.toHaveBeenCalled();
    // Ya en el escritorio la marca deja de ser un botón: no lleva a ninguna parte.
    expect(screen.queryByRole("button", { name: "xonecode" })).toBeNull();
  });

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
    // Sin copia local: es el caso en que HAY ventana (la descarga se confirma). Con copia
    // local ninguno de los dos caminos la abre.
    const { enviar } = montarConProyectos([{ id: "p1", nombre: "Tienda" }]);
    fireEvent.click(screen.getByRole("button", { name: /nueva sesión en tienda/i }));
    expect(screen.getByText(/nueva sesión en tienda/i)).toBeTruthy();
    expect(enviar).toHaveBeenCalledWith({ clase: "alta", paso: "proyecto", proyecto: "p1" });
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

/**
 * El enlace a Revisión de una tarjeta «esperando feedback»: sin aprobación previa, esa
 * pestaña es la ÚNICA forma de mirar lo que la tarea autorizó a escribir. `abrirSesion`
 * gana un tercer parámetro para esto —solo lo usa este camino— y el resto de quien la abre
 * (la barra, el «+», una fila del escritorio) sigue cayendo en «chat», sin tocar.
 */
describe("App: la tarjeta de tarea «esperando feedback» abre Revisión", () => {
  function montarConTareas() {
    const store = crearStoreDelCliente();
    const enviar = vi.fn(() => Promise.resolve(undefined as unknown));
    render(<App store={store} enviar={enviar} subirAdjunto={subirAdjuntoDeMentira} />);
    act(() => store.marcarConectado());
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
    act(() =>
      store.aplicar({
        clase: "tareas",
        concurrencia: 2,
        corriendoAqui: true,
        lista: [
          {
            id: "t1",
            proyecto: "p1",
            proyectoNombre: "Tienda",
            titulo: "Arregla el login",
            peticion: "Arregla el login",
            encargo: "Arregla el login",
            adjuntos: [],
            estado: "requiere-atencion",
            motivo: "el juez marcó el trabajo en rojo",
            sesion: "s1",
            creada: "2026-09-08T10:00:00.000Z",
          },
        ],
      })
    );
    return { store, enviar };
  }

  it("pulsar «Ver Revisión» abre la sesión de la tarea Y dice al servidor que se abre en Revisión", () => {
    const { store, enviar } = montarConTareas();
    fireEvent.click(screen.getByRole("button", { name: /revisión/i }));
    expect(enviar).toHaveBeenCalledWith({ clase: "sesion", proyecto: "p1", sesion: "s1" });

    // El servidor contesta abriendo esa sesión: la pestaña Revisión ya estaba elegida
    // ANTES de que la respuesta llegara —es estado de vista, no algo que el cable decida—,
    // así que en cuanto la maqueta de sesión aparece, se ve activa.
    enviar.mockClear();
    act(() =>
      store.aplicar({
        clase: "alta",
        pasos: [],
        proveedores: [],
        entornos: [{ id: "webstudio", nombre: "XOne WebStudio", url: "https://mcp.example/mcp" }],
        proyectos: [{ id: "p1", nombre: "Tienda" }],
        ramas: [],
        proyectoAbierto: true,
        proyectoActivo: "p1",
        sesionActiva: "s1",
      })
    );
    expect(screen.getByRole("tab", { name: "Revisión", selected: true })).toBeTruthy();
    // Y Revisión pide su foto sola, sin que nadie más la pulse.
    expect(enviar).toHaveBeenCalledWith({ clase: "revision" });
  });

  it("pulsar el TÍTULO de la tarjeta abre la conversación, en Chat — es una acción distinta", () => {
    const { enviar } = montarConTareas();
    fireEvent.click(screen.getByRole("button", { name: "Arregla el login" }));
    expect(enviar).toHaveBeenCalledWith({ clase: "sesion", proyecto: "p1", sesion: "s1" });
  });

  /**
   * Task 12: «se edita la tarea y se agrega el feedback del usuario» (§0 del diseño). El
   * cliente no manda comandos — manda la intención (`{clase:"tarea", accion:"feedback"}`)
   * y el servidor decide cómo se aplica, el mismo patrón que la pastilla de modelo.
   */
  it("escribir feedback y enviarlo manda `{clase:\"tarea\", accion:\"feedback\"}` con el id y el texto", () => {
    const { enviar } = montarConTareas();
    fireEvent.change(screen.getByRole("textbox", { name: /tu feedback/i }), {
      target: { value: "sí, con histórico" },
    });
    fireEvent.click(screen.getByRole("button", { name: /enviar feedback/i }));
    expect(enviar).toHaveBeenCalledWith({ clase: "tarea", accion: "feedback", id: "t1", texto: "sí, con histórico" });
  });
});

describe("App: Revisión despliega solos los primeros", () => {
  const diez = () => Array.from({ length: 10 }, (_, i) => ({ ruta: `src/f${i}.xne`, clase: "modificado" as const, mas: 1, menos: 0 }));
  const parchesPedidos = (enviar: ReturnType<typeof vi.fn>) =>
    enviar.mock.calls.filter(([m]) => (m as { clase: string; ruta?: string }).clase === "revision" && (m as { ruta?: string }).ruta !== undefined);

  it("una lista vacía no fija nada; la primera con ficheros despliega los 8 primeros y pide su parche", () => {
    const { store, enviar } = montar();
    fireEvent.click(screen.getByRole("tab", { name: "Revisión" }));
    // La sesión acaba de abrirse: «sin-empezar», lista vacía. Si esto inicializara el
    // conjunto en vacío, la lista de después del primer turno ya no desplegaría ninguno.
    act(() => store.aplicar({ clase: "revision", via: "sin-empezar", ficheros: [] }));
    expect(parchesPedidos(enviar)).toHaveLength(0);

    act(() => store.aplicar({ clase: "revision", via: "git", ficheros: diez() }));
    const pedidos = parchesPedidos(enviar).map(([m]) => (m as { ruta: string }).ruta);
    expect(pedidos).toEqual(diez().slice(0, DESPLEGADOS_AL_ABRIR).map((f) => f.ruta));
    // Acotado al panel de Revisión: la barra superior lleva su PROPIO botón con
    // aria-expanded (el de plegar la barra lateral), y contar sobre toda la pantalla lo
    // sumaría de más.
    const indice = screen.getByRole("complementary", { name: "Ficheros cambiados" });
    expect(within(indice.parentElement as HTMLElement).getAllByRole("button", { expanded: true })).toHaveLength(
      DESPLEGADOS_AL_ABRIR
    );
  });
});

describe("App: la pestaña Artefactos", () => {
  /** Un acto de artefacto tal como lo emite el servidor. */
  const ARTEFACTO = {
    tipo: "artefacto" as const,
    ruta: "/artefactos/d.html",
    nombre: "d.html",
    bytes: 9000,
    mime: "text/html",
  };
  const conArtefacto = () => {
    const montado = montar();
    act(() => montado.store.aplicar({ clase: "reemision", actos: [ARTEFACTO] }));
    return montado;
  };

  it("la lista sale de los ACTOS, y con ella aparece la pestaña", () => {
    const { store } = montar();
    expect(screen.queryByRole("tab", { name: "Artefactos" })).toBeNull();
    act(() => store.aplicar({ clase: "reemision", actos: [ARTEFACTO] }));
    expect(screen.getByRole("tab", { name: "Artefactos" })).toBeTruthy();
  });

  it("el nombre de la tarjeta del chat abre la pestaña con ese artefacto elegido", () => {
    conArtefacto();
    fireEvent.click(screen.getByRole("button", { name: "d.html" }));
    expect(screen.getByRole("tab", { name: "Artefactos" }).getAttribute("aria-selected")).toBe("true");
    // Y lo que se pinta es su iframe, no el «elige uno de la lista».
    expect(screen.getByTitle("d.html").tagName).toBe("IFRAME");
  });

  it("si la sesión nueva no tiene artefactos, se vuelve al Chat en vez de dejar una pestaña que ya no está", () => {
    // Es el estado que se escapa: estando en Artefactos, abrir otra sesión quita la pestaña
    // de la tira —y hace bien— pero la elección seguía puesta, así que el centro enseñaba el
    // panel de artefactos sin ninguna pestaña marcada.
    const { store } = conArtefacto();
    fireEvent.click(screen.getByRole("tab", { name: "Artefactos" }));
    act(() => store.aplicar({ clase: "reemision", actos: [] }));
    expect(screen.queryByRole("tab", { name: "Artefactos" })).toBeNull();
    expect(screen.getByRole("tab", { name: "Chat" }).getAttribute("aria-selected")).toBe("true");
  });
});

describe("App: la pestaña Ficheros", () => {
  const arboles = (enviar: ReturnType<typeof vi.fn>) => enviar.mock.calls.filter(([m]) => (m as { clase: string }).clase === "arbol");

  it("pide el árbol al abrir la pestaña, y lo vuelve a pedir junto al fichero abierto al terminar un turno", () => {
    const { store, enviar } = montar();
    fireEvent.click(screen.getByRole("tab", { name: "Ficheros" }));
    expect(arboles(enviar)).toHaveLength(1);

    act(() => store.aplicar({ clase: "arbol", rutas: ["app.xml"], recortado: false }));
    fireEvent.click(screen.getByRole("treeitem", { name: "app.xml" }));
    expect(enviar).toHaveBeenCalledWith({ clase: "fichero", ruta: "app.xml" });

    // Flanco de fin de turno con la pestaña delante: árbol y fichero abierto se releen.
    act(() => store.aplicar({ clase: "turno", activo: true }));
    act(() => store.aplicar({ clase: "turno", activo: false }));
    expect(arboles(enviar)).toHaveLength(2);
    expect(
      enviar.mock.calls.filter(([m]) => (m as { clase: string; ruta?: string }).clase === "fichero" && (m as { ruta?: string }).ruta === "app.xml")
    ).toHaveLength(2);
  });

  it("con otra pestaña delante, el fin de turno no pide el árbol", () => {
    const { store, enviar } = montar();
    act(() => store.aplicar({ clase: "turno", activo: true }));
    act(() => store.aplicar({ clase: "turno", activo: false }));
    expect(arboles(enviar)).toHaveLength(0);
  });
});

describe("App: la pestaña Tareas", () => {
  const TAREA = (extra: Record<string, unknown> = {}) => ({
    id: "t1",
    proyecto: "p1",
    proyectoNombre: "Tienda",
    titulo: "Arregla el login",
    peticion: "Arregla el login",
    encargo: "Arregla el login",
    adjuntos: [],
    estado: "nuevo" as const,
    creada: "2026-09-08T10:00:00.000Z",
    ...extra,
  });

  /** Con proyecto ABIERTO y ACTIVO, que es lo que la pestaña filtra por (`t.proyecto`). */
  function montarConProyectoActivo() {
    const store = crearStoreDelCliente();
    const enviar = vi.fn(() => Promise.resolve(undefined as unknown));
    render(<App store={store} enviar={enviar} subirAdjunto={subirAdjuntoDeMentira} />);
    act(() => store.marcarConectado());
    act(() =>
      store.aplicar({
        clase: "alta",
        pasos: [],
        proveedores: [],
        entornos: [],
        // `local: true`: un proyecto ABIERTO tiene por fuerza copia local — es de donde se
        // abrió—, y `NuevaTarea` rechaza crear sin ella (`local` deducido de `proyectos[]`).
        proyectos: [{ id: "p1", nombre: "Tienda", local: true }],
        ramas: [],
        proyectoAbierto: true,
        proyectoActivo: "p1",
      })
    );
    return { store, enviar };
  }

  /**
   * Task 15: la pestaña ya NO se condiciona a que haya tareas — es de ACCIÓN, no de
   * registro (`Pestanas.tsx`) — pero el FILTRO por proyecto sigue siendo el mismo: lo que
   * se pinta DENTRO de ella es solo lo de `proyectoActivo`, nunca lo de otro.
   */
  it("la pestaña está desde el principio, y lo que filtra por proyecto ACTIVO es lo que hay DENTRO", () => {
    const { store } = montarConProyectoActivo();
    expect(screen.getByRole("tab", { name: "Tareas" })).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Tareas" }));
    // Antes de que llegue ningún mensaje `tareas`, no se afirma que no haya ninguna.
    expect(screen.getByText(/consultando/i)).toBeTruthy();

    act(() =>
      store.aplicar({
        clase: "tareas",
        concurrencia: 2,
        corriendoAqui: true,
        lista: [TAREA({ id: "otro", proyecto: "p2", proyectoNombre: "Otra" })],
      })
    );
    // Llegó la cola, pero ninguna es de p1: el estado vacío, no «consultando».
    expect(screen.getByText(/todavía no tiene ninguna/i)).toBeTruthy();

    act(() =>
      store.aplicar({
        clase: "tareas",
        concurrencia: 2,
        corriendoAqui: true,
        lista: [TAREA({ id: "otro", proyecto: "p2", proyectoNombre: "Otra" }), TAREA()],
      })
    );
    expect(screen.getByText("Arregla el login")).toBeTruthy();
    expect(screen.queryByText(/otro|Otra/)).toBeNull();
  });

  it("pinta el estado y el motivo, y reintentar/dar-por-bueno/descartar mandan la acción sobre el cable", () => {
    const { store, enviar } = montarConProyectoActivo();
    act(() =>
      store.aplicar({
        clase: "tareas",
        concurrencia: 2,
        corriendoAqui: true,
        lista: [TAREA({ estado: "requiere-atencion", motivo: "el juez marcó el trabajo en rojo" })],
      })
    );
    fireEvent.click(screen.getByRole("tab", { name: "Tareas" }));
    expect(screen.getByText(/el juez marcó el trabajo en rojo/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /reintentar/i }));
    expect(enviar).toHaveBeenCalledWith({ clase: "tarea", accion: "reintentar", id: "t1" });

    fireEvent.click(screen.getByRole("button", { name: /dar por bueno/i }));
    expect(enviar).toHaveBeenCalledWith({ clase: "tarea", accion: "terminar", id: "t1" });

    fireEvent.click(screen.getByRole("button", { name: /^descartar$/i }));
    fireEvent.click(screen.getByRole("button", { name: /sí, descartar/i }));
    expect(enviar).toHaveBeenCalledWith({ clase: "tarea", accion: "descartar", id: "t1" });
  });

  it("al quedarse el proyecto activo sin tareas, la pestaña se QUEDA — a diferencia de Artefactos, a propósito", () => {
    // Es justo lo que Task 15 cambia: Artefactos SÍ vuelve al Chat al vaciarse (es registro),
    // pero Tareas es acción y su estado vacío es la respuesta, no un hueco que hay que evitar
    // enseñando otra pestaña.
    const { store } = montarConProyectoActivo();
    act(() =>
      store.aplicar({ clase: "tareas", concurrencia: 2, corriendoAqui: true, lista: [TAREA()] })
    );
    fireEvent.click(screen.getByRole("tab", { name: "Tareas" }));
    expect(screen.getByRole("tab", { name: "Tareas" }).getAttribute("aria-selected")).toBe("true");
    act(() => store.aplicar({ clase: "tareas", concurrencia: 2, corriendoAqui: true, lista: [] }));
    expect(screen.getByRole("tab", { name: "Tareas" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Tareas" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText(/todavía no tiene ninguna/i)).toBeTruthy();
  });

  /**
   * El acceptance criterion central: crear una tarea PARA el proyecto abierto sin volver al
   * escritorio, y con el proyecto ya resuelto — no un selector que haya que rellenar.
   */
  it("crear una tarea desde AQUÍ, sin volver al escritorio, y con el proyecto ya resuelto", async () => {
    const { store, enviar } = montarConProyectoActivo();
    act(() => store.aplicar({ clase: "tareas", concurrencia: 2, corriendoAqui: true, lista: [] }));
    fireEvent.click(screen.getByRole("tab", { name: "Tareas" }));
    fireEvent.click(screen.getByRole("button", { name: /nueva tarea/i }));
    // Si el punto de entrada abriera la ventana SIN proyecto resuelto —la mutación que el
    // brief pide vigilar—, `App` no encontraría con qué pintarla (`proyectoDeLaTarea` no
    // resolvería) y este campo no aparecería: no hay ningún paso más que dar aquí.
    fireEvent.change(screen.getByLabelText(/qué hay que hacer/i), { target: { value: "Arregla el login" } });
    fireEvent.click(screen.getByRole("button", { name: /encolar/i }));
    await waitFor(() =>
      expect(enviar).toHaveBeenCalledWith({
        clase: "tarea",
        accion: "crear",
        proyecto: "p1",
        peticion: "Arregla el login",
        encargo: "Arregla el login",
      })
    );
  });
});

/**
 * Crear una TAREA de fondo: lo que ningún test de componente ve — que `App` monta la
 * ventana desde el escritorio, que los ADJUNTOS se suben antes de encolar y bajo un
 * identificador de BORRADOR que después se manda en el `crear`, y que el encargo propuesto
 * se limpia al abrir (ese mensaje va a todas las pestañas).
 */
describe("App: crear una tarea en background", () => {
  /** El escritorio, con un proyecto y sin sesión abierta. */
  function conEscritorio(enviar = vi.fn(() => Promise.resolve(undefined as unknown)), subir = subirAdjuntoDeMentira) {
    const store = crearStoreDelCliente();
    const vista = render(<App store={store} enviar={enviar} subirAdjunto={subir} />);
    act(() => store.marcarConectado());
    act(() =>
      store.aplicar({
        clase: "alta",
        pasos: [],
        proveedores: [],
        entornos: [],
        registrados: [{ id: "webstudio", nombre: "WebStudio", url: "https://x/mcp" }],
        entornoActivo: "webstudio",
        proyectos: [{ id: "p1", nombre: "AppDemo", local: true }],
        ramas: [],
        proyectoAbierto: false,
      })
    );
    return { store, enviar, vista };
  }

  it("desde el escritorio se abre la ventana y encolar manda `crear` con petición y encargo", async () => {
    const { enviar } = conEscritorio();
    fireEvent.click(screen.getByRole("button", { name: /nueva tarea/i }));
    fireEvent.change(screen.getByLabelText(/qué hay que hacer/i), { target: { value: "Arregla el login" } });
    fireEvent.click(screen.getByRole("button", { name: /encolar/i }));
    await waitFor(() =>
      expect(enviar).toHaveBeenCalledWith({
        clase: "tarea",
        accion: "crear",
        proyecto: "p1",
        peticion: "Arregla el login",
        encargo: "Arregla el login",
      })
    );
  });

  it("«Preparar el encargo» manda `augmentar` con el MISMO borrador que después lleva `crear`", async () => {
    // Las dos mitades: el aumentador tiene que ver los adjuntos ya subidos (por eso lleva el
    // borrador) y el `crear` tiene que adoptar esa misma carpeta (por eso lleva el mismo).
    const subidas: { tarea: string; nombre: string }[] = [];
    const { enviar } = conEscritorio(undefined, async (tarea: string, nombre: string) => {
      subidas.push({ tarea, nombre });
      return { ok: true };
    });
    fireEvent.click(screen.getByRole("button", { name: /nueva tarea/i }));
    fireEvent.change(entradaDeFicheros(), {
      target: { files: [new File(["x"], "mockup.png", { type: "image/png" })] },
    });
    await waitFor(() => expect(subidas).toHaveLength(1));
    fireEvent.change(screen.getByLabelText(/qué hay que hacer/i), { target: { value: "Arregla" } });
    fireEvent.click(screen.getByRole("button", { name: /preparar el encargo/i }));
    const augmentar = enviar.mock.calls.map((c) => c[0]).find((m) => (m as { accion?: string }).accion === "augmentar");
    expect(augmentar).toMatchObject({ clase: "tarea", accion: "augmentar", proyecto: "p1", peticion: "Arregla" });
    const borrador = (augmentar as { borrador?: string }).borrador;
    // El borrador es el mismo bajo el que se subieron los bytes: si no, el servidor listaría
    // una carpeta vacía y la tarea nacería sin sus adjuntos.
    expect(borrador).toBe(subidas[0]!.tarea);

    fireEvent.click(screen.getByRole("button", { name: /encolar/i }));
    await waitFor(() =>
      expect(enviar).toHaveBeenCalledWith(expect.objectContaining({ accion: "crear", borrador }))
    );
  });

  it("sin ningún adjunto, `crear` NO lleva borrador: no se nombra una carpeta que no existe", async () => {
    const { enviar } = conEscritorio();
    fireEvent.click(screen.getByRole("button", { name: /nueva tarea/i }));
    fireEvent.change(screen.getByLabelText(/qué hay que hacer/i), { target: { value: "Arregla" } });
    fireEvent.click(screen.getByRole("button", { name: /encolar/i }));
    await waitFor(() => expect(enviar).toHaveBeenCalled());
    const crear = enviar.mock.calls.map((c) => c[0]).find((m) => (m as { accion?: string }).accion === "crear");
    expect(crear).not.toHaveProperty("borrador");
  });

  it("al abrir la ventana se TIRA el encargo propuesto de antes: ese mensaje va a todas las pestañas", () => {
    const { store } = conEscritorio();
    act(() => store.aplicar({ clase: "tarea", accion: "augmentado", encargo: "DE OTRA PESTAÑA" }));
    fireEvent.click(screen.getByRole("button", { name: /nueva tarea/i }));
    expect((screen.getByLabelText(/encargo/i) as HTMLTextAreaElement).value).toBe("");
  });

  it("cerrar con adjuntos ya subidos DESCARTA el borrador: si no, la carpeta queda de basura", async () => {
    // Los bytes se suben antes de que la tarea exista, así que cancelar después deja una
    // carpeta en `~/.xonecode/tareas/<borrador>/` que ninguna tarea nombra y que nadie va a
    // volver a ver — con documentos de una persona dentro. `descartar` sobre un id que no
    // está en el índice hace exactamente esto: borra la carpeta y deja el índice igual.
    const { enviar } = conEscritorio();
    fireEvent.click(screen.getByRole("button", { name: /nueva tarea/i }));
    fireEvent.change(entradaDeFicheros(), { target: { files: [new File(["x"], "a.png")] } });
    await waitFor(() => expect(screen.getByText(/a\.png/)).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /cancelar/i }));
    const descartes = enviar.mock.calls
      .map((c) => c[0] as { accion?: string; id?: string })
      .filter((m) => m.accion === "descartar");
    expect(descartes).toHaveLength(1);
    expect(descartes[0]!.id).toBeDefined();
    expect(enviar.mock.calls.map((c) => (c[0] as { accion?: string }).accion)).not.toContain("crear");
  });

  it("y cerrar SIN adjuntos no descarta nada: no hay carpeta que borrar", async () => {
    const { enviar } = conEscritorio();
    fireEvent.click(screen.getByRole("button", { name: /nueva tarea/i }));
    fireEvent.click(screen.getByRole("button", { name: /cancelar/i }));
    expect(enviar.mock.calls.map((c) => (c[0] as { accion?: string }).accion)).not.toContain("descartar");
  });

  it("y cerrar no encola nada", async () => {
    const { enviar } = conEscritorio();
    fireEvent.click(screen.getByRole("button", { name: /nueva tarea/i }));
    fireEvent.change(screen.getByLabelText(/qué hay que hacer/i), { target: { value: "Arregla" } });
    fireEvent.click(screen.getByRole("button", { name: /cancelar/i }));
    expect(screen.queryByLabelText(/qué hay que hacer/i)).toBeNull();
    expect(enviar.mock.calls.map((c) => (c[0] as { accion?: string }).accion)).not.toContain("crear");
  });

  it("y en un proyecto SIN copia local, «Abrir el proyecto» cede a la ventana que descarga", async () => {
    /**
     * El rechazo tiene que llevar a algún sitio, y el sitio existe ya: `NuevaSesion`, que es
     * quien pide la rama y AVISA de que se descarga el proyecto entero. Este test comprueba
     * la costura que ningún test de componente ve —que `App` cambia una ventana por la otra
     * para el MISMO proyecto—, y que crear la tarea no se cuela por el camino.
     */
    const enviar = vi.fn(() => Promise.resolve(undefined as unknown));
    const store = crearStoreDelCliente();
    render(<App store={store} enviar={enviar} subirAdjunto={subirAdjuntoDeMentira} />);
    act(() => store.marcarConectado());
    act(() =>
      store.aplicar({
        clase: "alta",
        pasos: [],
        proveedores: [],
        entornos: [],
        registrados: [{ id: "webstudio", nombre: "WebStudio", url: "https://x/mcp" }],
        entornoActivo: "webstudio",
        // `local` AUSENTE: el proyecto está en el entorno y no en el equipo.
        proyectos: [{ id: "p1", nombre: "AppDemo" }],
        ramas: [],
        proyectoAbierto: false,
      })
    );
    fireEvent.click(screen.getByRole("button", { name: /nueva tarea/i }));
    expect(document.body.textContent).toMatch(/no se puede crear/i);
    fireEvent.click(screen.getByRole("button", { name: /abrir el proyecto/i }));
    // La ventana de tarea se fue y está la de sesión, que es la que dice que va a descargar.
    expect(screen.queryByRole("button", { name: /abrir el proyecto/i })).toBeNull();
    await waitFor(() =>
      expect(enviar).toHaveBeenCalledWith({ clase: "alta", paso: "proyecto", proyecto: "p1" })
    );
    expect(enviar.mock.calls.map((c) => (c[0] as { accion?: string }).accion)).not.toContain("crear");
  });
});
