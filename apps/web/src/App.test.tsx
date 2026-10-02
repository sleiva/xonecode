import { render, screen, fireEvent, cleanup, act, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, onTestFinished, vi, type Mock } from "vitest";
import { EditorView } from "@codemirror/view";
import { App, MS_ENTRE_LECTURAS_DE_PLANES } from "./App.js";
import { crearStoreDelCliente } from "./store.js";
import { prepararJsdomParaElEditor } from "./editor/jsdomParaElEditor.js";

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
function montar(
  // El TIPO del parámetro, escrito, y con el argumento que de verdad recibe: el de por omisión
  // se infiere como `Mock<() => …>` —sin parámetros— y entonces `enviar.mock.calls[0][0]` era
  // «tupla de longitud 0», un error en cada espía que mira el mensaje. Acepta `unknown` y no
  // `MensajeDelCliente` porque los espías lo leen a ciegas (`(m as { clase: string }).clase`).
  enviar: Mock<(mensaje: unknown) => Promise<unknown>> = vi.fn(() => Promise.resolve(undefined as unknown))
) {
  const store = crearStoreDelCliente();
  const vista = render(
    <App
      store={store}
      enviar={enviar}
      subirAdjunto={subirAdjuntoDeMentira}
      instalarSkill={instalarSkillDeMentira}
    />
  );
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

/**
 * Abrir el panel de vistas y elegir una pestaña.
 *
 * Desde que la conversación es la columna que se queda, **la tira de pestañas vive DENTRO
 * del panel y el panel arranca cerrado**: sin este primer clic no hay ninguna pestaña que
 * pulsar. Son los dos gestos que hace una persona —el botón del panel, y luego su pestaña—,
 * y el primero se salta si el panel ya estaba abierto.
 */
function abrirPestana(nombre: string): void {
  const boton = screen.queryByRole("button", { name: "Mostrar el panel" });
  if (boton !== null) fireEvent.click(boton);
  fireEvent.click(screen.getByRole("tab", { name: nombre }));
}

/** La subida de adjuntos, concedida y sin red: `App` la recibe inyectada igual que `enviar`. */
const subirAdjuntoDeMentira = async (): Promise<{ ok: boolean; motivo?: string }> => ({ ok: true });
const instalarSkillDeMentira = async (): Promise<{ ok: boolean; motivo?: string }> => ({ ok: true });

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
    fireEvent.change(screen.getByPlaceholderText(/pregunta sobre xone/i), { target: { value: "haz un listado" } });
    fireEvent.keyDown(screen.getByPlaceholderText(/pregunta sobre xone/i), { key: "Enter" });
    expect(enviar).toHaveBeenCalledWith({ clase: "prosa", texto: "haz un listado" });
  });

  it("con la pestaña Planes delante y el agente trabajando, el plan se relee solo", () => {
    vi.useFakeTimers();
    try {
      const { store, enviar } = montar();
      act(() =>
        store.aplicar({
          clase: "planes",
          planes: [{ nombre: "hoteles", ficheros: ["TASKS.md"], modificado: 1, tareas: { tareas: [] } }],
        })
      );
      abrirPestana("Planes");
      const pedidas = () => enviar.mock.calls.filter(([m]) => (m as { clase?: string }).clase === "planes").length;
      const antes = pedidas();
      // Sin turno en marcha no se relee: nadie lo está cambiando.
      act(() => void vi.advanceTimersByTime(MS_ENTRE_LECTURAS_DE_PLANES * 2));
      expect(pedidas()).toBe(antes);
      act(() => store.aplicar({ clase: "turno", activo: true }));
      act(() => void vi.advanceTimersByTime(MS_ENTRE_LECTURAS_DE_PLANES * 2));
      expect(pedidas()).toBe(antes + 2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("con un turno DETENIBLE en marcha, el Enter viaja como DETENER y replanificar (IXCODE-4)", () => {
    const { store, enviar } = montar();
    const campo = (): HTMLElement => screen.getByPlaceholderText(/pregunta sobre xone/i);
    act(() => store.aplicar({ clase: "turno", activo: true, detenible: true }));
    fireEvent.change(campo(), { target: { value: "mejor el menú" } });
    fireEvent.keyDown(campo(), { key: "Enter" });
    expect(enviar).toHaveBeenCalledWith({ clase: "prosa", texto: "mejor el menú", detener: true });

    // Un turno que no lo admite (deepagents): prosa a secas, el servidor decide.
    act(() => store.aplicar({ clase: "turno", activo: true }));
    fireEvent.change(campo(), { target: { value: "otra" } });
    fireEvent.keyDown(campo(), { key: "Enter" });
    expect(enviar).toHaveBeenLastCalledWith({ clase: "prosa", texto: "otra" });
  });
});

/**
 * Anexar en el chat de una sesión (Task 6, IXCODE-7): `App` solo pinta el «+» del
 * compositor con `subirAdjuntoDeSesion` inyectado —opcional, a diferencia de `subirAdjunto`
 * (de tarea)—, y el turno viaja con los NOMBRES ya subidos.
 */
describe("App: adjuntos del chat", () => {
  it("sin `subirAdjuntoDeSesion` no hay «+»: un control sin dato detrás no se pinta", () => {
    montar();
    expect(screen.queryByRole("button", { name: "Anexar ficheros" })).toBeNull();
  });

  it("con él: el «+» sube el fichero por HTTP y ENVIAR manda su nombre en `adjuntos`", async () => {
    const subirAdjuntoDeSesion = vi.fn(async (): Promise<{ ok: boolean; motivo?: string }> => ({ ok: true }));
    const enviar: Mock<(mensaje: unknown) => Promise<unknown>> = vi.fn(() => Promise.resolve(undefined as unknown));
    const store = crearStoreDelCliente();
    render(
      <App
        store={store}
        enviar={enviar}
        subirAdjunto={subirAdjuntoDeMentira}
        subirAdjuntoDeSesion={subirAdjuntoDeSesion}
        instalarSkill={instalarSkillDeMentira}
      />
    );
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

    fireEvent.click(screen.getByRole("button", { name: "Anexar ficheros" }));
    const fichero = new File(["x"], "mockup.png", { type: "image/png" });
    fireEvent.change(entradaDeFicheros(), { target: { files: [fichero] } });

    // El nombre, no el `File`, es lo que llega a `subirAdjuntoDeSesion`: `App` traduce
    // `(fichero, nombre)` del compositor a `(nombre, fichero)` de la conexión.
    await waitFor(() => expect(subirAdjuntoDeSesion).toHaveBeenCalledWith("mockup.png", fichero));
    await waitFor(() => expect(screen.getByText("listo")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
    expect(enviar).toHaveBeenCalledWith({ clase: "prosa", texto: "", adjuntos: ["mockup.png"] });
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

  /**
   * **El cableado del botón de arrancar un emulador.**
   *
   * `alArrancarEmulador` es OPCIONAL en el tipo de `Ajustes`, así que si `App` no lo pasara
   * todo compilaría y el botón no se pintaría nunca — la ventana diría que esta ejecución no
   * puede arrancar emuladores, sin que nada se ponga rojo. Es la misma trampa que ya se pagó
   * con `alPedirProyectosDeEntorno` justo debajo, y la décima vez de la lista.
   *
   * La fila del AVD apagado la inventa el inventario a partir de `informe.avds`, así que el
   * fixture solo necesita eso: un AVD definido y ningún aparato.
   */
  it("el botón de arrancar un emulador manda su AVD por el cable", () => {
    const { store, enviar } = montar();
    act(() =>
      store.aplicar({
        clase: "dispositivos",
        informe: {
          sistema: "mac",
          medido: "2026-09-17T11:00:00.000Z",
          herramientas: [
            { nombre: "adb", plataforma: "android", estado: "ok" },
            { nombre: "emulator", plataforma: "android", estado: "ok" },
          ],
          dispositivos: [],
          avds: ["pixel8"],
          recetas: [],
        },
        ajustes: {},
      })
    );
    fireEvent.click(screen.getAllByRole("button", { name: "Ajustes" })[0]!);
    fireEvent.click(screen.getByRole("button", { name: "Dispositivos" }));
    fireEvent.click(screen.getByRole("button", { name: "Arrancar" }));
    expect(enviar).toHaveBeenCalledWith({ clase: "arrancarEmulador", avd: "pixel8" });
  });

  it("«Quitar entorno» manda `olvidar` por el cable y enseña el MOTIVO del 409", async () => {
    // El cableado, por lo mismo que el test de abajo: el prop es OPCIONAL, y sin él el botón
    // ni aparecería. Y la negativa viaja en la RESPUESTA, que es lo que `App` tiene que leer.
    const enviar = vi.fn((mensaje: unknown) =>
      Promise.resolve(
        (mensaje as { accion?: string }).accion === "olvidar"
          ? (new Response(JSON.stringify({ motivo: "hay 1 tarea de fondo sin terminar en este entorno" }), {
              status: 409,
            }) as unknown)
          : (undefined as unknown)
      )
    );
    const { store } = montar(enviar);
    act(() =>
      store.aplicar({
        clase: "alta",
        pasos: [],
        proveedores: [],
        entornos: [],
        registrados: [{ id: "webstudio", nombre: "XOne WebStudio", url: "https://mcp.xonewebstudio.com/mcp" }],
        entornoActivo: "webstudio",
        proyectos: [],
        ramas: [],
        proyectoAbierto: true,
      })
    );
    fireEvent.click(screen.getAllByRole("button", { name: "Ajustes" })[0]!);
    fireEvent.click(screen.getByRole("button", { name: "Entornos" }));
    fireEvent.click(screen.getByRole("button", { name: "Quitar entorno" }));
    fireEvent.change(screen.getByLabelText(/para confirmar/), { target: { value: "XOne WebStudio" } });
    fireEvent.click(screen.getByRole("button", { name: "Quitar" }));
    await waitFor(() =>
      expect(enviar).toHaveBeenCalledWith({ clase: "entorno", accion: "olvidar", entorno: "webstudio" })
    );
    expect(await screen.findByText(/No se ha quitado: hay 1 tarea de fondo/)).toBeTruthy();
  });

  it("«Nombre del entorno» manda `renombrar` por el cable y enseña el MOTIVO del 409", async () => {
    // El mismo cableado que el de arriba, y por el mismo motivo: el prop es OPCIONAL en el
    // tipo, así que si `App` no lo pasara todo compilaría y el campo no aparecería nunca —
    // con la regla escrita y sin montar. Y la negativa viaja en la RESPUESTA del 409, que es
    // lo que `App` tiene que leer para poder enseñarla.
    const enviar = vi.fn((mensaje: unknown) =>
      Promise.resolve(
        (mensaje as { accion?: string }).accion === "renombrar"
          ? (new Response(JSON.stringify({ motivo: "se te ha colado un salto de línea" }), {
              status: 409,
            }) as unknown)
          : (undefined as unknown)
      )
    );
    const { store } = montar(enviar);
    act(() =>
      store.aplicar({
        clase: "alta",
        pasos: [],
        proveedores: [],
        entornos: [],
        registrados: [{ id: "webstudio", nombre: "XOne WebStudio", url: "https://mcp.xonewebstudio.com/mcp" }],
        entornoActivo: "webstudio",
        proyectos: [],
        ramas: [],
        proyectoAbierto: true,
      })
    );
    fireEvent.click(screen.getAllByRole("button", { name: "Ajustes" })[0]!);
    fireEvent.click(screen.getByRole("button", { name: "Entornos" }));
    fireEvent.change(screen.getByLabelText("Nombre del entorno"), { target: { value: "Producción" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    // El `id` NO viaja: es la clave —carpeta del workspace, credenciales— y renombrar no la
    // toca. Lo que viaja es la intención, con el entorno al que se refiere.
    await waitFor(() =>
      expect(enviar).toHaveBeenCalledWith({
        clase: "entorno",
        accion: "renombrar",
        entorno: "webstudio",
        nombre: "Producción",
      })
    );
    expect(await screen.findByText(/No se ha cambiado: se te ha colado un salto/)).toBeTruthy();
  });

  it("abrir la pestaña de otro entorno pide SUS proyectos por el cable", async () => {
    /*
      El CABLEADO, que es lo que ningún test de componente ve: `Ajustes.tsx` ya está probado
      con su manejador inyectado, pero `alPedirProyectosDeEntorno` es OPCIONAL en el tipo,
      así que si `App` no lo pasara todo compilaría y las pestañas no pedirían nada nunca —
      la sexta vez que este repo pierde una regla por una composición que los tests doblan.
      Aquí se monta la `App` de verdad con el `enviar` espía y se comprueba el mensaje.
    */
    const { store, enviar } = montar();
    act(() =>
      store.aplicar({
        clase: "alta",
        pasos: [],
        proveedores: [],
        entornos: [],
        registrados: [
          { id: "webstudio", nombre: "XOne WebStudio", url: "https://mcp.xonewebstudio.com/mcp" },
          { id: "casa", nombre: "On-premise", url: "https://mcp.casa.local/mcp" },
        ],
        entornoActivo: "webstudio",
        proyectos: [{ id: "p1", nombre: "Tienda" }],
        ramas: [],
        proyectoAbierto: true,
      })
    );
    fireEvent.click(screen.getAllByRole("button", { name: "Ajustes" })[0]!);
    fireEvent.click(screen.getByRole("button", { name: "Entornos" }));
    // El activo NO se pide: su lista ya vino en el alta.
    expect(enviar).not.toHaveBeenCalledWith({
      clase: "entorno",
      accion: "proyectos",
      entorno: "webstudio",
    });

    fireEvent.click(screen.getByRole("tab", { name: "On-premise" }));
    await waitFor(() =>
      expect(enviar).toHaveBeenCalledWith({
        clase: "entorno",
        accion: "proyectos",
        entorno: "casa",
      })
    );
    // Y no se manda «hazlo activo», que es el otro mensaje y le movería la barra a quien
    // esté trabajando en WebStudio.
    expect(enviar).not.toHaveBeenCalledWith({
      clase: "entorno",
      accion: "activo",
      entorno: "casa",
    });
  });

  it("la lista que contesta el servidor llega hasta las casillas, y el error hasta el aviso", async () => {
    /*
      El camino de VUELTA entero: `store.ts#case "proyectosDeEntorno"` → el spread de `App`
      → las casillas del componente. Los tests del componente reciben
      `proyectosPorEntorno` como prop y el de arriba solo comprueba el ENVÍO, así que sin
      esto las tres capas están probadas por separado y ninguna prueba que se toquen — que
      es exactamente cómo `mime` y `base64` se cayeron en el `case "fichero"` del store con
      todo en verde y ninguna imagen apareciendo en el navegador.
    */
    const { store } = montar();
    act(() =>
      store.aplicar({
        clase: "alta",
        pasos: [],
        proveedores: [],
        entornos: [],
        registrados: [
          { id: "webstudio", nombre: "XOne WebStudio", url: "https://mcp.xonewebstudio.com/mcp" },
          { id: "casa", nombre: "On-premise", url: "https://mcp.casa.local/mcp" },
        ],
        entornoActivo: "webstudio",
        proyectos: [{ id: "p1", nombre: "Tienda" }],
        ramas: [],
        proyectoAbierto: true,
      })
    );
    fireEvent.click(screen.getAllByRole("button", { name: "Ajustes" })[0]!);
    fireEvent.click(screen.getByRole("button", { name: "Entornos" }));
    fireEvent.click(screen.getByRole("tab", { name: "On-premise" }));
    expect(screen.getByText(/consultando/i)).toBeTruthy();

    act(() =>
      store.aplicar({
        clase: "proyectosDeEntorno",
        entorno: "casa",
        proyectos: [{ id: "c1", nombre: "De casa" }],
      })
    );
    await waitFor(() => expect(screen.getByText("De casa")).toBeTruthy());
    expect(screen.getAllByRole("checkbox")).toHaveLength(1);

    // Y la otra respuesta: el motivo se pinta y NO se inventa ninguna casilla.
    act(() =>
      store.aplicar({ clase: "proyectosDeEntorno", entorno: "casa", error: "fetch failed" })
    );
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/fetch failed/));
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  });

  it("mientras se espera la lista NO se vuelve a pedir en cada render", async () => {
    /*
      Cada petición es una conexión con CloudStudio (OAuth + `initialize` +
      `studio_list_projects`), y `App` se re-renderiza con cada mutación del store —con un
      turno en vuelo, varias veces por segundo—. Si la dependencia del efecto es el RECORD
      de listas, mientras se espera vale `undefined` y el valor por omisión `{}` es un objeto
      nuevo en cada render: el efecto se vuelve a disparar y sale una petición por render.
      Se depende de los dos campos de ESA pestaña, que son establemente `undefined`.
    */
    const { store, enviar } = montar();
    act(() =>
      store.aplicar({
        clase: "alta",
        pasos: [],
        proveedores: [],
        entornos: [],
        registrados: [
          { id: "webstudio", nombre: "XOne WebStudio", url: "https://mcp.xonewebstudio.com/mcp" },
          { id: "casa", nombre: "On-premise", url: "https://mcp.casa.local/mcp" },
        ],
        entornoActivo: "webstudio",
        proyectos: [{ id: "p1", nombre: "Tienda" }],
        ramas: [],
        proyectoAbierto: true,
      })
    );
    fireEvent.click(screen.getAllByRole("button", { name: "Ajustes" })[0]!);
    fireEvent.click(screen.getByRole("button", { name: "Entornos" }));
    fireEvent.click(screen.getByRole("tab", { name: "On-premise" }));

    const peticiones = (): unknown[] =>
      enviar.mock.calls.filter(
        (c) =>
          typeof c[0] === "object" &&
          c[0] !== null &&
          (c[0] as { clase?: unknown }).clase === "entorno" &&
          (c[0] as { accion?: unknown }).accion === "proyectos"
      );
    await waitFor(() => expect(peticiones()).toHaveLength(1));

    // Dos mutaciones del store cualesquiera, que es lo que pasa sin parar con un turno en
    // vuelo. La respuesta de `casa` todavía NO ha llegado.
    act(() => store.aplicar({ clase: "turno", activo: true }));
    act(() => store.aplicar({ clase: "turno", activo: false }));
    expect(peticiones()).toHaveLength(1);
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

describe("App: el tema del modo en vigor", () => {
  const CLAVES = ["xonecode.apariencia", "xonecode.tema.claro", "xonecode.tema.oscuro"];
  const limpiar = (): void => {
    document.body.removeAttribute("data-tema");
    document.body.removeAttribute("data-ds-dark-theme");
    document.body.removeAttribute("style");
    for (const k of CLAVES) window.localStorage.removeItem(k);
  };
  beforeEach(limpiar);
  afterEach(limpiar);

  it("elegir Dracula en Ajustes aplica sus semillas al body y lo recuerda", () => {
    // El CABLEADO que ningún test de componente ve: `App` guarda el tema, lo mete en el
    // estado y se lo pasa a `aplicarApariencia` junto a la apariencia. Si `temas` faltara de
    // la llamada o de las dependencias del efecto, el body no cambiaría y esto se pondría rojo.
    window.localStorage.setItem("xonecode.apariencia", "oscuro");
    montar();
    fireEvent.click(screen.getAllByRole("button", { name: "Ajustes" })[0]!);
    const grupo = screen.getByRole("group", { name: "Tema oscuro" });
    fireEvent.click(within(grupo).getByRole("button", { name: "Dracula" }));
    expect(document.body.getAttribute("data-tema")).toBe("dracula");
    expect(document.body.style.getPropertyValue("--tema-fondo")).toBe("#282a36");
    expect(window.localStorage.getItem("xonecode.tema.oscuro")).toBe("dracula");
  });

  it("elegir un tema del OTRO modo pasa la consola a ese modo: lo elegido se ve en el acto", () => {
    window.localStorage.setItem("xonecode.apariencia", "claro");
    montar();
    expect(document.body.hasAttribute("data-ds-dark-theme")).toBe(false);
    fireEvent.click(screen.getAllByRole("button", { name: "Ajustes" })[0]!);
    fireEvent.click(within(screen.getByRole("group", { name: "Tema oscuro" })).getByRole("button", { name: "Dracula" }));
    expect(document.body.hasAttribute("data-ds-dark-theme")).toBe(true);
    expect(document.body.getAttribute("data-tema")).toBe("dracula");
    expect(window.localStorage.getItem("xonecode.apariencia")).toBe("oscuro");
  });

  it("con «sistema», un tema del modo que ya está en vigor NO saca al sistema", () => {
    window.localStorage.setItem("xonecode.apariencia", "sistema");
    vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener: () => {}, removeEventListener: () => {} }));
    try {
      montar();
      fireEvent.click(screen.getAllByRole("button", { name: "Ajustes" })[0]!);
      fireEvent.click(within(screen.getByRole("group", { name: "Tema oscuro" })).getByRole("button", { name: "One Dark" }));
      expect(document.body.getAttribute("data-tema")).toBe("one-oscuro");
      expect(window.localStorage.getItem("xonecode.apariencia")).toBe("sistema");
    } finally {
      vi.unstubAllGlobals();
    }
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
    const vista = render(<App store={store} enviar={enviar} subirAdjunto={subirAdjuntoDeMentira} instalarSkill={instalarSkillDeMentira} />);
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
    expect(screen.queryByPlaceholderText(/pregunta sobre xone/i)).toBeNull();
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
   * **«No consta» no es «falta»: sin `alta` y sin nada preguntado, se pinta el LIENZO y no
   * el diálogo de configuración.**
   *
   * `enAlta` leía `estado.alta === undefined` como «hay que enseñar el alta», y ese ausente
   * significa otra cosa: que el servidor todavía no lo ha dicho. La ventana no era teórica —
   * el servidor anunciaba el alta DETRÁS de abrir la sesión MCP contra CloudStudio, medido en
   * la máquina del usuario a 1436 ms con el MCP caliente, y sin tope si la red va mal—, así
   * que un proyecto ya configurado enseñaba la progresión «Modelo / Entorno de CloudStudio»
   * antes de entrar. El servidor ya adelanta ese anuncio (`arranque.ts`), y esto es la otra
   * mitad: aunque tarde, lo que se ve mientras no se sabe es el lienzo.
   *
   * Lo que NO cambia, y está probado arriba y abajo: con un `selector` o un `secreto` en
   * vuelo la tarjeta sí sale (el paso de cuenta viaja por ahí, no por `alta`), y el aviso de
   * conexión sigue fuera de la tarjeta para que un servidor caído no se quede mudo.
   */
  it("sin `alta` y sin nada preguntado no sale el diálogo de configuración, y con un paso pendiente sí", () => {
    const { store } = montarSinAbrir();
    // `PasosDelAlta` es la progresión del alta y solo la pinta `TarjetaDeAlta`, así que su
    // `aria-label` es la presencia de la tarjeta — no un texto que pueda cambiar de copy.
    expect(screen.queryByLabelText("Pasos del alta")).toBeNull();
    // Y no se ha colado la maqueta completa por el otro lado: esto sigue siendo el arranque.
    expect(screen.queryByPlaceholderText(/pregunta sobre xone/i)).toBeNull();
    expect(screen.queryByText("Ajustes")).toBeNull();

    // En cuanto el servidor dice que SÍ falta un paso, la tarjeta sale.
    act(() =>
      store.aplicar({
        clase: "alta",
        pasos: ["entorno"],
        proveedores: [],
        entornos: [],
        proyectos: [],
        ramas: [],
        proyectoAbierto: false,
      })
    );
    expect(screen.getByLabelText("Pasos del alta")).toBeTruthy();
  });

  /**
   * **Con `preparando` puesto no se entra: el Escritorio tiene que estar listo.**
   *
   * Lo pidió el usuario tras ver el arreglo anterior: el `alta` adelantado hacía entrar en
   * 117 ms y el Escritorio se rellenaba delante (los proyectos llegan cuando CloudStudio
   * contesta). Ahora el servidor DICE qué está preparando y el cliente se queda en el lienzo
   * — y lo CUENTA, porque una espera de más de un segundo sin decir nada se lee como una
   * pantalla colgada.
   *
   * Ausente = listo, y por eso el segundo `alta` (el que llega sin el campo) es el que abre
   * la maqueta. La espera la acota el servidor con su plazo: si aquí hubiera un reloj serían
   * dos, y el que venciera primero mandaría.
   */
  it("mientras el arranque prepara algo no se entra, se cuenta la fase, y sin el campo ya se entra", () => {
    const { store } = montarSinAbrir();
    const alta = {
      clase: "alta" as const,
      pasos: [],
      proveedores: [],
      entornos: [],
      proyectos: [],
      ramas: [],
      proyectoAbierto: true,
    };
    act(() => store.aplicar({ ...alta, preparando: "conectando con XOne WebStudio…" }));
    // La fase se cuenta, y como estado: quien navegue con lector de pantalla se entera.
    expect(screen.getByRole("status").textContent).toContain("XOne WebStudio");
    // Sin tarjeta —no hay nada que contestar— y sin maqueta: esto sigue siendo el lienzo.
    expect(screen.queryByLabelText("Pasos del alta")).toBeNull();
    expect(screen.queryByPlaceholderText(/pregunta sobre xone/i)).toBeNull();
    expect(screen.queryByText("Ajustes")).toBeNull();

    // El mismo alta SIN el campo es «listo», y entonces sí se entra.
    act(() => store.aplicar(alta));
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByText("Ajustes")).toBeTruthy();
  });

  /**
   * El caso mixto, que es el que se colaría: cuenta pendiente Y un entorno ya registrado, o
   * sea preparando y preguntando a la vez. La tarjeta tiene que salir — si no, el paso de
   * cuenta se quedaría escondido detrás de una espera que no depende de él.
   */
  it("preparando Y con algo que contestar: la tarjeta sale igual", () => {
    const { store } = montarSinAbrir();
    act(() =>
      store.aplicar({
        clase: "alta",
        pasos: [],
        preparando: "conectando con XOne WebStudio…",
        proveedores: [],
        entornos: [],
        proyectos: [],
        ramas: [],
        proyectoAbierto: false,
      })
    );
    act(() =>
      store.aplicar({
        clase: "selector",
        selector: { titulo: "Proveedor de modelos", opciones: [{ id: "ollama", etiqueta: "ollama" }] },
      })
    );
    expect(screen.getByRole("group", { name: /proveedor de modelos/i })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("XOne WebStudio");
  });

  /**
   * **La marca se centra solo cuando el lienzo está solo**, que es lo que el usuario pidió al
   * ver la maqueta del launch screen: sin tarjeta no hay con quién competir por el centro
   * óptico, y con tarjeta el centro es de la tarjeta.
   *
   * Se comprueba por ESTRUCTURA y no por CSS: en jsdom no hay layout que medir, y lo que
   * decide el centrado es de qué grupo cuelga la marca — centrada entra DENTRO del contenedor
   * que se centra, junto a la fase; con tarjeta se queda fuera, como fila de cabecera. Y se
   * comprueba desde `App` porque lo que se rompe es el CABLEADO del prop: `PantallaDeArranque`
   * podría aceptar `centrada` y nadie pasárselo nunca, con todo en verde.
   */
  it("la marca comparte grupo con la fase cuando el lienzo está solo, y no cuando hay tarjeta", () => {
    const { store } = montarSinAbrir();
    /** La raíz de `Marca`: el lema es un `<p>` suyo, así que su `div` más cercano es ella. */
    const marca = () => screen.getByText(/Entorno de desarrollo con IA/).closest("div") as HTMLElement;

    act(() =>
      store.aplicar({
        clase: "alta",
        pasos: [],
        preparando: "conectando con XOne WebStudio…",
        proveedores: [],
        entornos: [],
        proyectos: [],
        ramas: [],
        proyectoAbierto: true,
      })
    );
    // Centrada: la marca y la fase cuelgan del MISMO grupo, el que se centra.
    expect(marca().parentElement).toBe(screen.getByRole("status").parentElement);

    // Con un paso pendiente sale la tarjeta, y entonces la marca se va fuera de ese grupo.
    act(() =>
      store.aplicar({
        clase: "alta",
        pasos: ["entorno"],
        proveedores: [],
        entornos: [],
        proyectos: [],
        ramas: [],
        proyectoAbierto: false,
      })
    );
    // Y aquí se comparan los GRUPOS, no la contención: sin centrar, la marca cuelga de la
    // envoltura, que contiene todo — incluida la tarjeta—, así que `contains` diría «sí»
    // siempre y el test no distinguiría nada.
    const tarjetaRaiz = screen.getByLabelText("Pasos del alta").parentElement as HTMLElement;
    expect(marca().parentElement).not.toBe(tarjetaRaiz.parentElement);
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
    render(<App store={store} enviar={vi.fn()} subirAdjunto={subirAdjuntoDeMentira} instalarSkill={instalarSkillDeMentira} />);
    // Sin `marcarConectado()`: `ESTADO_INICIAL` (`store.ts`) ya nace `conectado: false`.
    expect(screen.getByText(/sin conexión con XOneCode/i)).toBeTruthy();
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
    expect(screen.queryByPlaceholderText(/pregunta sobre xone/i)).toBeNull();
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
    expect(screen.queryByPlaceholderText(/pregunta sobre xone/i)).toBeNull();
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
    expect(screen.getByPlaceholderText(/pregunta sobre xone/i)).toBeTruthy();
    // El panel arranca CERRADO, así que lo que prueba que la sesión está montada es su
    // botón —la tira de pestañas vive dentro y todavía no hay ninguna—.
    expect(screen.getByRole("button", { name: "Mostrar el panel" })).toBeTruthy();
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
  function montarConProyectos(proyectos: { id: string; nombre: string; local?: boolean; compartido?: boolean }[]) {
    const store = crearStoreDelCliente();
    const enviar = vi.fn(() => Promise.resolve(undefined as unknown));
    const vista = render(<App store={store} enviar={enviar} subirAdjunto={subirAdjuntoDeMentira} instalarSkill={instalarSkillDeMentira} />);
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

  it("el «+» de un proyecto sin bajar pide sus ramas SIN abrir nada todavía", () => {
    const { enviar } = montarConProyectos([{ id: "p1", nombre: "Tienda" }]);
    fireEvent.click(screen.getByRole("button", { name: "nueva sesión en Tienda" }));
    expect(enviar).toHaveBeenCalledWith({ clase: "alta", paso: "proyecto", proyecto: "p1" });
    // Nada de Selector todavía: `estado.alta.ramas` sigue vacía hasta que el servidor
    // conteste — no se inventa un catálogo mientras se espera. El conmutador de
    // apariencia de la barra superior también es un `role="group"` y siempre está: se
    // excluye por nombre en vez de dejar que contamine esta comprobación.
    expect(screen.queryByRole("group", { name: (n) => n !== "apariencia" })).toBeNull();
  });

  /**
   * La rama ya no se elige en un selector suelto en mitad del centro —que no decía ni de
   * qué proyecto era ni que iba a DESCARGARLO—: se elige en la ventana de sesión nueva,
   * junto al aviso de la descarga. Y con una sola rama tampoco se manda sola: elegir por
   * el usuario y callarlo es cómo se acaba trabajando sobre la rama equivocada.
   */
  it("la ventana enseña la rama aunque solo haya una, y no empieza sola", () => {
    const { store, enviar } = montarConProyectos([{ id: "p1", nombre: "Tienda" }]);
    fireEvent.click(screen.getByRole("button", { name: "nueva sesión en Tienda" }));
    enviar.mockClear();

    act(() =>
      store.aplicar({
        clase: "alta",
        pasos: [],
        proveedores: [],
        entornos: [{ id: "webstudio", nombre: "XOne WebStudio", url: "https://mcp.example/mcp" }],
        proyectos: [{ id: "p1", nombre: "Tienda" }],
        ramas: ["master"],
        ramasDe: "p1",
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
    fireEvent.click(screen.getByRole("button", { name: "nueva sesión en Tienda" }));
    enviar.mockClear();

    act(() =>
      store.aplicar({
        clase: "alta",
        pasos: [],
        proveedores: [],
        entornos: [{ id: "webstudio", nombre: "XOne WebStudio", url: "https://mcp.example/mcp" }],
        proyectos: [{ id: "p1", nombre: "Tienda" }],
        ramas: ["master", "pruebas"],
        ramasDe: "p1",
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
    fireEvent.click(screen.getByRole("button", { name: "nueva sesión en Tienda" }));
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
    // Con sesión: se puede abrir el panel y la marca es pulsable.
    expect(screen.queryByRole("button", { name: "Mostrar el panel" })).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "XOneCode" }));
    // Se ve el escritorio: su saludo, y el panel de la sesión se va con ella.
    expect(screen.getByRole("heading", { level: 1 })).toBeTruthy();
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryByRole("button", { name: "Mostrar el panel" })).toBeNull();
    // Y NO se ha soltado el proyecto: es estado de vista, no una orden al servidor.
    // La única que puede salir es la LECTURA de los planes, que se pide sola con proyecto abierto.
    expect(enviar.mock.calls.filter(([m]) => (m as { clase?: string }).clase !== "planes")).toEqual([]);
    // Ya en el escritorio la marca deja de ser un botón: no lleva a ninguna parte.
    expect(screen.queryByRole("button", { name: "XOneCode" })).toBeNull();
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

  /**
   * Una sola pantalla por proyecto (fusión con el resumen de Alejandro): el nombre de uno SIN
   * copia abre también su PANEL, con solo la pestaña Resumen.
   */
  it("pulsar el NOMBRE de uno sin bajar abre su panel con solo el Resumen, y no manda nada al servidor", () => {
    const { enviar } = montarConProyectos([{ id: "p1", nombre: "Tienda", compartido: true }]);
    enviar.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Tienda" }));
    // Es estado de vista: ni se abre, ni se piden ramas, ni se mide nada (sin copia no hay
    // nada que subir).
    expect(enviar).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { level: 1, name: "Tienda" })).toBeTruthy();
    const tabs = within(screen.getByRole("tablist", { name: "Vistas del proyecto" })).getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["Resumen"]);
    expect(screen.getByText("compartido contigo")).toBeTruthy();
    expect(screen.getByText("sin descargar")).toBeTruthy();
    // Sin botón de cerrar: la marca de la barra superior vuelve al escritorio.
    fireEvent.click(screen.getByRole("button", { name: "XOneCode" }));
    expect(screen.queryByText("compartido contigo")).toBeNull();
  });

  /**
   * Un proyecto BAJADO se abre al pulsar su nombre (`abrirProyecto`) y el centro es su PANEL,
   * con lo de la copia arriba del Resumen. El panel lateral es de una SESIÓN: aquí no se ofrece.
   */
  it("pulsar un proyecto BAJADO lo abre, y el centro es su panel con la copia en el Resumen", () => {
    const { store, enviar } = montarConProyectos([{ id: "p1", nombre: "Tienda", local: true }]);
    enviar.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Tienda" }));
    expect(enviar).toHaveBeenCalledWith({ clase: "sesion", proyecto: "p1" });
    // El servidor contesta con el proyecto abierto y una sesión en blanco.
    act(() =>
      store.aplicar({
        clase: "alta",
        pasos: [],
        proveedores: [],
        entornos: [{ id: "webstudio", nombre: "XOne WebStudio", url: "https://mcp.example/mcp" }],
        proyectos: [{ id: "p1", nombre: "Tienda", local: true, sesiones: [{ id: "s1", titulo: "Vieja" }] }],
        ramas: [],
        proyectoAbierto: true,
        proyectoActivo: "p1",
        sesionActiva: "s1",
      })
    );
    expect(screen.getByRole("heading", { level: 1, name: "Tienda" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Copia local" }).textContent).toMatch(/en tu equipo/);
    // Sin el botón del panel lateral: ese panel es de una sesión, y aquí no hay ninguna delante.
    expect(screen.queryByRole("button", { name: /mostrar el panel/i })).toBeNull();
    // Y ningún chat va marcado: no se está leyendo ninguno.
    const barra = screen.getAllByRole("navigation").find((n) => n.getAttribute("aria-label") === null)!;
    const vieja = within(barra).getByRole("button", { name: "Vieja" }).parentElement as HTMLElement;
    expect(vieja.getAttribute("aria-current")).toBeNull();
    // Pulsar otra vez el mismo no reabre nada: daría otra sesión en blanco.
    enviar.mockClear();
    fireEvent.click(within(barra).getByRole("button", { name: "Tienda" }));
    expect(enviar).not.toHaveBeenCalledWith({ clase: "sesion", proyecto: "p1" });
  });

  /** Un alta de la ventana de sesión nueva, con lo que cambie en cada paso. */
  const altaDeVentana = (extra: Record<string, unknown>) => ({
    clase: "alta" as const,
    pasos: [],
    proveedores: [],
    entornos: [{ id: "webstudio", nombre: "XOne WebStudio", url: "https://mcp.example/mcp" }],
    proyectos: [
      { id: "p1", nombre: "Tienda" },
      { id: "p2", nombre: "Almacén" },
    ],
    ramas: [],
    proyectoAbierto: false,
    ...extra,
  });

  /** Medido: la ventana de Almacén enseñaba las ramas de Tienda mientras llegaban las suyas. */
  it("las ramas de OTRO proyecto no se enseñan: la ventana espera con el combo bloqueado", () => {
    const { store } = montarConProyectos([
      { id: "p1", nombre: "Tienda" },
      { id: "p2", nombre: "Almacén" },
    ]);
    fireEvent.click(screen.getByRole("button", { name: "nueva sesión en Almacén" }));
    act(() => store.aplicar(altaDeVentana({ ramas: ["rama-de-tienda"], ramasDe: "p1" }) as never));
    const combo = screen.getByLabelText(/rama de origen/i) as HTMLSelectElement;
    expect(combo.disabled).toBe(true);
    expect(screen.queryByRole("option", { name: "rama-de-tienda" })).toBeNull();
    expect((screen.getByRole("button", { name: /^empezar$/i }) as HTMLButtonElement).disabled).toBe(true);
    // Llegan las suyas: ya se puede elegir.
    act(() => store.aplicar(altaDeVentana({ ramas: ["main"], ramasDe: "p2" }) as never));
    expect((screen.getByLabelText(/rama de origen/i) as HTMLSelectElement).disabled).toBe(false);
    expect((screen.getByRole("button", { name: /^empezar$/i }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("empezar la descarga deja la ventana diciendo que descarga, y se cierra al abrirse", () => {
    const { store, enviar } = montarConProyectos([{ id: "p1", nombre: "Tienda" }]);
    fireEvent.click(screen.getByRole("button", { name: "nueva sesión en Tienda" }));
    act(() => store.aplicar(altaDeVentana({ ramas: ["master"], ramasDe: "p1" }) as never));
    fireEvent.click(screen.getByRole("button", { name: /^empezar$/i }));
    expect(enviar).toHaveBeenCalledWith({ clase: "alta", paso: "proyecto", proyecto: "p1", rama: "master" });
    expect(screen.getByText("Descargando proyecto…")).toBeTruthy();
    expect((screen.getByRole("button", { name: /^empezar$/i }) as HTMLButtonElement).disabled).toBe(true);
    // Un alta intermedia sin nada que decir no la cierra.
    act(() => store.aplicar(altaDeVentana({ ramas: ["master"], ramasDe: "p1" }) as never));
    expect(screen.getByText("Descargando proyecto…")).toBeTruthy();
    // Bajado y abierto: la ventana se va.
    act(() =>
      store.aplicar(
        altaDeVentana({
          proyectos: [{ id: "p1", nombre: "Tienda", local: true }],
          proyectoAbierto: true,
          proyectoActivo: "p1",
        }) as never
      )
    );
    expect(screen.queryByText("Descargando proyecto…")).toBeNull();
    expect(screen.queryByRole("button", { name: /^empezar$/i })).toBeNull();
  });

  it("si la descarga falla, la ventana se queda con el motivo debajo del combo", () => {
    const { store } = montarConProyectos([{ id: "p1", nombre: "Tienda" }]);
    fireEvent.click(screen.getByRole("button", { name: "nueva sesión en Tienda" }));
    act(() => store.aplicar(altaDeVentana({ ramas: ["master"], ramasDe: "p1" }) as never));
    fireEvent.click(screen.getByRole("button", { name: /^empezar$/i }));
    act(() => store.aplicar(altaDeVentana({ ramas: ["master"], ramasDe: "p1", aviso: "el zip llegó vacío" }) as never));
    expect(screen.getByRole("alert").textContent).toMatch(/No se pudo descargar el proyecto: el zip llegó vacío/);
    expect((screen.getByRole("button", { name: /^empezar$/i }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("el resumen de un proyecto sin bajar ofrece «Descargar», y abre la ventana de la rama", () => {
    const { enviar } = montarConProyectos([{ id: "p1", nombre: "Tienda" }]);
    fireEvent.click(screen.getByRole("button", { name: "Tienda" }));
    expect(screen.queryByRole("button", { name: "Borrar copia local" })).toBeNull();
    enviar.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Descargar" }));
    expect(enviar).toHaveBeenCalledWith({ clase: "alta", paso: "proyecto", proyecto: "p1" });
    expect(screen.getByLabelText(/rama de origen/i)).toBeTruthy();
  });

  it("un proyecto SIN bajar no se abre al pulsar su nombre: abrir sería descargar", () => {
    const { enviar } = montarConProyectos([{ id: "p1", nombre: "Tienda" }]);
    enviar.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Tienda" }));
    // Nada sale: ni abrir, ni descargar, ni medir.
    expect(enviar).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /mostrar el panel/i })).toBeNull();
  });

  /** Una sola fila marcada: con el panel de B delante, A —el abierto— deja de estarlo. */
  it("solo hay UN proyecto marcado: el del panel manda sobre el abierto", () => {
    const { store } = montarConProyectos([]);
    act(() =>
      store.aplicar({
        clase: "alta",
        pasos: [],
        proveedores: [],
        entornos: [],
        registrados: [{ id: "webstudio", nombre: "W", url: "https://mcp.example/mcp", fijados: ["p2"] }],
        entornoActivo: "webstudio",
        proyectos: [
          { id: "p1", nombre: "Tienda", local: true },
          { id: "p2", nombre: "Almacén" },
        ],
        ramas: [],
        proyectoAbierto: true,
        proyectoActivo: "p1",
      })
    );
    const barra = screen.getAllByRole("navigation").find((n) => n.getAttribute("aria-label") === null)!;
    const fila = (nombre: string) => within(barra).getByRole("button", { name: nombre }).parentElement as HTMLElement;
    // Almacén está fijado (otro grupo), y aun así solo una fila lleva la marca.
    fireEvent.click(within(barra).getByRole("button", { name: "Almacén" }));
    expect(fila("Almacén").getAttribute("aria-current")).toBe("true");
    expect(fila("Tienda").getAttribute("aria-current")).toBeNull();
  });

  it("borrar la copia desde el Resumen del panel manda el ID, y un 409 deja la ventana con su motivo", async () => {
    const { store, enviar } = montarConProyectos([{ id: "p1", nombre: "Tienda", local: true }]);
    enviar.mockImplementation(((m: { clase?: string }) =>
      Promise.resolve(
        m.clase === "copiaLocal"
          ? new Response(JSON.stringify({ motivo: "hay 1 tarea de fondo sin terminar en este proyecto" }), { status: 409 })
          : undefined
      )) as never);
    fireEvent.click(screen.getByRole("button", { name: "Tienda" }));
    // El servidor lo abre: el panel es el del proyecto ABIERTO.
    act(() =>
      store.aplicar({
        clase: "alta",
        pasos: [],
        proveedores: [],
        entornos: [{ id: "webstudio", nombre: "XOne WebStudio", url: "https://mcp.example/mcp" }],
        proyectos: [{ id: "p1", nombre: "Tienda", local: true }],
        ramas: [],
        proyectoAbierto: true,
        proyectoActivo: "p1",
      })
    );
    fireEvent.click(screen.getByRole("button", { name: "Borrar copia local" }));
    const borrar = screen.getByRole("button", { name: "Borrar" }) as HTMLButtonElement;
    // Sin el nombre escrito no se puede.
    expect(borrar.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/para confirmar/i), { target: { value: "Tienda" } });
    expect(borrar.disabled).toBe(false);
    await act(async () => {
      fireEvent.click(borrar);
    });
    expect(enviar).toHaveBeenCalledWith({ clase: "copiaLocal", accion: "borrar", proyecto: "p1" });
    expect((await screen.findByRole("alert")).textContent).toMatch(/tarea de fondo sin terminar/);
    expect(screen.getByRole("alertdialog")).toBeTruthy();
  });

  /**
   * Borrada la copia, el servidor cierra su consola y el foco puede pasar a OTRA: la vista se
   * queda en ese proyecto, ya como uno sin copia (solo Resumen, con «Descargar»), y no enseña el
   * panel del otro.
   */
  it("borrar la copia con éxito deja su panel, ya sin copia, aunque el foco pase a otro proyecto", async () => {
    const { store, enviar } = montarConProyectos([
      { id: "p1", nombre: "Tienda", local: true },
      { id: "p2", nombre: "Almacén", local: true },
    ]);
    enviar.mockImplementation(((m: { clase?: string; accion?: string }) =>
      Promise.resolve(m.clase === "copiaLocal" && m.accion === "borrar" ? new Response("{}", { status: 200 }) : undefined)) as never);
    const alta = (extra: Record<string, unknown>) => ({
      clase: "alta" as const,
      pasos: [],
      proveedores: [],
      entornos: [{ id: "webstudio", nombre: "XOne WebStudio", url: "https://mcp.example/mcp" }],
      ramas: [],
      ...extra,
    });
    fireEvent.click(screen.getByRole("button", { name: "Tienda" }));
    act(() =>
      store.aplicar(
        alta({
          proyectos: [
            { id: "p1", nombre: "Tienda", local: true },
            { id: "p2", nombre: "Almacén", local: true },
          ],
          proyectoAbierto: true,
          proyectoActivo: "p1",
        }) as never
      )
    );
    fireEvent.click(screen.getByRole("button", { name: "Borrar copia local" }));
    fireEvent.change(screen.getByLabelText(/para confirmar/i), { target: { value: "Tienda" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Borrar" }));
    });
    expect(enviar).toHaveBeenCalledWith({ clase: "copiaLocal", accion: "borrar", proyecto: "p1" });
    act(() =>
      store.aplicar(
        alta({
          proyectos: [
            { id: "p1", nombre: "Tienda" },
            { id: "p2", nombre: "Almacén", local: true },
          ],
          proyectoAbierto: true,
          proyectoActivo: "p2",
        }) as never
      )
    );
    expect(screen.getByRole("heading", { level: 1, name: "Tienda" })).toBeTruthy();
    const tabs = within(screen.getByRole("tablist", { name: "Vistas del proyecto" })).getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["Resumen"]);
    expect(screen.getByRole("button", { name: "Descargar" })).toBeTruthy();
  });

  /** Medido en pantalla: la barra decía «14 más» y el escritorio «otros 15» para la MISMA elección. */
  it("la barra y el escritorio cuentan igual lo que queda sin enseñar, con fijados", () => {
    const { store } = montarConProyectos([]);
    act(() =>
      store.aplicar({
        clase: "alta",
        pasos: [],
        proveedores: [],
        entornos: [],
        registrados: [
          { id: "webstudio", nombre: "XOne WebStudio", url: "https://mcp.example/mcp", proyectos: ["p1"], fijados: ["p6"] },
        ],
        entornoActivo: "webstudio",
        proyectos: ["p1", "p2", "p3", "p4", "p5", "p6"].map((id) => ({ id, nombre: `Proyecto ${id}` })),
        ramas: [],
        proyectoAbierto: false,
      })
    );
    expect(screen.getByText(/4 proyectos más sin enseñar/)).toBeTruthy();
    expect(screen.getByText(/Otros 4 proyectos del entorno/)).toBeTruthy();
  });

  it("fijar un proyecto manda la lista ENTERA de fijados del entorno activo", () => {
    const { store, enviar } = montarConProyectos([]);
    act(() =>
      store.aplicar({
        clase: "alta",
        pasos: [],
        proveedores: [],
        entornos: [],
        registrados: [{ id: "webstudio", nombre: "XOne WebStudio", url: "https://mcp.example/mcp", fijados: ["p1"] }],
        entornoActivo: "webstudio",
        proyectos: [
          { id: "p1", nombre: "Tienda" },
          { id: "p2", nombre: "Almacén" },
        ],
        ramas: [],
        proyectoAbierto: false,
      })
    );
    // El fijado sale en su grupo, arriba.
    expect(screen.getByText("Proyectos fijados")).toBeTruthy();
    enviar.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "fijar Almacén" }));
    expect(enviar).toHaveBeenCalledWith({ clase: "entorno", accion: "fijados", entorno: "webstudio", proyectos: ["p1", "p2"] });
    fireEvent.click(screen.getByRole("button", { name: "dejar de fijar Tienda" }));
    expect(enviar).toHaveBeenLastCalledWith({ clase: "entorno", accion: "fijados", entorno: "webstudio", proyectos: [] });
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
    fireEvent.click(screen.getByRole("button", { name: "nueva sesión en Tienda" }));
    act(() =>
      store.aplicar({
        clase: "alta",
        pasos: [],
        proveedores: [],
        entornos: [{ id: "webstudio", nombre: "XOne WebStudio", url: "https://mcp.example/mcp" }],
        proyectos: [{ id: "p1", nombre: "Tienda" }],
        ramas: ["master", "pruebas"],
        ramasDe: "p1",
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
    render(<App store={store} enviar={enviar} subirAdjunto={subirAdjuntoDeMentira} instalarSkill={instalarSkillDeMentira} />);
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

describe("App: Revisión arranca PLEGADA", () => {
  const diez = () => Array.from({ length: 10 }, (_, i) => ({ ruta: `src/f${i}.xne`, clase: "modificado" as const, mas: 1, menos: 0 }));
  const parchesPedidos = (enviar: ReturnType<typeof vi.fn>) =>
    enviar.mock.calls.filter(([m]) => (m as { clase: string; ruta?: string }).clase === "revision" && (m as { ruta?: string }).ruta !== undefined);

  /**
   * Pedido mirando la pantalla: «la vista está bien pero debiera estar collapsada». Antes
   * se desplegaban solos los ocho primeros bloques y se pedían sus parches, con el
   * argumento de que la pestaña se abriera enseñando diffs y no una lista de cabeceras. El
   * argumento se cae con los tamaños de verdad: en esa sesión eran dos ficheros y +582
   * líneas —483 en uno solo—, así que abrir la pestaña era volcar un diff de 483 líneas que
   * nadie había pedido y perder de vista la LISTA, que es lo que contesta «¿qué tocó el
   * agente?». Cada bloque se abre al pulsarlo, que es cuando se pide su parche.
   *
   * Es además la regla que ya gobierna el árbol de Ficheros por el mismo motivo: nace todo
   * plegado porque con el primer nivel abierto no se ve la FORMA de lo que hay.
   */
  it("al llegar la lista no se despliega ningún bloque ni se pide ningún parche", () => {
    const { store, enviar } = montar();
    abrirPestana("Revisión");
    act(() => store.aplicar({ clase: "revision", via: "sin-empezar", ficheros: [] }));
    act(() => store.aplicar({ clase: "revision", via: "git", ficheros: diez() }));

    // Ni un solo parche: un diff por fichero de un turno largo son megas, y ahora no se
    // pide ninguno hasta que alguien abra su bloque.
    expect(parchesPedidos(enviar)).toHaveLength(0);
    // Acotado al panel de Revisión: la barra superior lleva su PROPIO botón con
    // aria-expanded (el de plegar la barra lateral), y contar sobre toda la pantalla lo
    // sumaría de más.
    const indice = screen.getByRole("complementary", { name: "Ficheros cambiados" });
    expect(
      within(indice.parentElement as HTMLElement).queryAllByRole("button", { expanded: true })
    ).toHaveLength(0);
    // Y las diez cabeceras SÍ están: plegada no es vacía.
    expect(
      within(indice.parentElement as HTMLElement).getAllByRole("button", { expanded: false }).length
    ).toBeGreaterThanOrEqual(10);
  });

  it("pulsar una cabecera despliega ESE bloque y pide SU parche", () => {
    const { store, enviar } = montar();
    abrirPestana("Revisión");
    act(() => store.aplicar({ clase: "revision", via: "git", ficheros: diez() }));

    const indice = screen.getByRole("complementary", { name: "Ficheros cambiados" });
    const cabeceras = within(indice.parentElement as HTMLElement).getAllByRole("button", {
      expanded: false,
    });
    fireEvent.click(cabeceras[0]!);

    const pedidos = parchesPedidos(enviar).map(([m]) => (m as { ruta: string }).ruta);
    expect(pedidos).toEqual(["src/f0.xne"]);
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
    fireEvent.click(screen.getByRole("button", { name: "Mostrar el panel" }));
    expect(screen.queryByRole("tab", { name: "Artefactos" })).toBeNull();
    act(() => store.aplicar({ clase: "reemision", actos: [ARTEFACTO] }));
    expect(screen.getByRole("tab", { name: "Artefactos" })).toBeTruthy();
  });

  it("el nombre de la tarjeta del chat abre la pestaña con ese artefacto elegido", () => {
    conArtefacto();
    fireEvent.click(screen.getByRole("button", { name: "Abrir d.html" }));
    expect(screen.getByRole("tab", { name: "Artefactos" }).getAttribute("aria-selected")).toBe("true");
    // Y lo que se pinta es su iframe, no el «elige uno de la lista».
    expect(screen.getByTitle("d.html").tagName).toBe("IFRAME");
  });

  it("si la sesión nueva no tiene artefactos, el panel se CIERRA en vez de dejar una pestaña que ya no está", () => {
    // Es el estado que se escapa: estando en Artefactos, abrir otra sesión quita la pestaña
    // de la tira —y hace bien— pero la elección seguía puesta, así que el panel enseñaba los
    // artefactos sin ninguna pestaña marcada. Se cierra, que es donde está quien no ha
    // elegido nada: dejarlo abierto por otra vista sería elegir en su nombre.
    const { store } = conArtefacto();
    abrirPestana("Artefactos");
    act(() => store.aplicar({ clase: "reemision", actos: [] }));
    expect(screen.queryByRole("tab", { name: "Artefactos" })).toBeNull();
    expect(screen.queryByRole("tablist")).toBeNull();
  });
});

describe("App: la pestaña Ficheros", () => {
  const arboles = (enviar: ReturnType<typeof vi.fn>) => enviar.mock.calls.filter(([m]) => (m as { clase: string }).clase === "arbol");

  it("pide el árbol al abrir la pestaña, y lo vuelve a pedir junto al fichero abierto al terminar un turno", () => {
    const { store, enviar } = montar();
    abrirPestana("Ficheros");
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

describe("App: editar en la pestaña Ficheros", () => {
  beforeAll(prepararJsdomParaElEditor);

  const conFichero = async () => {
    const montado = montar();
    // El proyecto abierto: la edición lo apunta al abrirse y viaja en cada guardado.
    act(() =>
      montado.store.aplicar({ clase: "alta", pasos: [], proveedores: [], entornos: [], proyectos: [], ramas: [], proyectoAbierto: true, proyectoActivo: "p1" })
    );
    abrirPestana("Ficheros");
    act(() => montado.store.aplicar({ clase: "arbol", rutas: ["a.xne", "b.xne"], recortado: false }));
    fireEvent.click(screen.getByRole("treeitem", { name: "a.xne" }));
    act(() =>
      montado.store.aplicar({ clase: "fichero", ruta: "a.xne", texto: "uno\n", recortado: false, binario: false, bytes: 4, codificacion: "utf-8", huella: "h1" })
    );
    fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    // Por el DOM y no por el rol: el compositor del chat también es un «textbox».
    await waitFor(() => expect(document.querySelector(".cm-editor")).not.toBeNull());
    return { ...montado, vista: vistaDelEditor() };
  };
  /** La vista VIVA del editor: tras remontarlo (otra `key`), la de antes es una instancia muerta. */
  const vistaDelEditor = (): EditorView => EditorView.findFromDOM(document.querySelector(".cm-editor") as HTMLElement)!;
  const teclear = (vista: EditorView, texto: string): void => {
    act(() => {
      vista.dispatch({ changes: { from: 0, insert: texto } });
    });
  };
  const mandados = (enviar: Mock<(m: unknown) => Promise<unknown>>, clase: string) =>
    enviar.mock.calls.map(([m]) => m as { clase: string; ruta?: string; id?: string }).filter((m) => m.clase === clase);
  /** Guardar y contestar como el servidor: con el `id` que llevó el guardado, que es lo que la pestaña reconoce. */
  const guardarYContestar = (enviar: Mock<(m: unknown) => Promise<unknown>>, store: ReturnType<typeof crearStoreDelCliente>, huella: string): void => {
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    const id = mandados(enviar, "guardarFichero").at(-1)!.id!;
    act(() => store.aplicar({ clase: "ficheroGuardado", ruta: "a.xne", id, huella }));
  };

  it("«Editar» pide la base de la sesión; guardar manda la huella y la respuesta quita el «●»", async () => {
    const { enviar, store, vista } = await conFichero();
    expect(enviar).toHaveBeenCalledWith({ clase: "baseDeFichero", ruta: "a.xne", base: "sesion" });
    teclear(vista, "X");
    expect(screen.getByLabelText("Hay cambios sin guardar")).toBeTruthy();
    const revisionesAntes = mandados(enviar, "revision").length;
    guardarYContestar(enviar, store, "h2");
    expect(enviar).toHaveBeenCalledWith({ clase: "guardarFichero", ruta: "a.xne", texto: "Xuno\n", huella: "h1", id: expect.any(String), proyecto: "p1" });
    expect(screen.queryByLabelText("Hay cambios sin guardar")).toBeNull();
    // La `M` del árbol se queda con el disco de antes: guardar vuelve a pedir Revisión.
    expect(mandados(enviar, "revision").length).toBeGreaterThan(revisionesAntes);
  });

  it("guardar bien NO rehace el editor: sigue la misma vista con el mismo texto", async () => {
    const { enviar, store, vista } = await conFichero();
    teclear(vista, "X");
    guardarYContestar(enviar, store, "h2");
    // Lo que el servidor relee tras guardar trae la huella nueva: no es una versión distinta.
    act(() =>
      store.aplicar({ clase: "fichero", ruta: "a.xne", texto: "Xuno\n", recortado: false, binario: false, bytes: 5, codificacion: "utf-8", huella: "h2" })
    );
    expect(vistaDelEditor()).toBe(vista);
    expect(vistaDelEditor().state.doc.toString()).toBe("Xuno\n");
  });

  it("una versión nueva de un fichero SIN cambios se recarga sola, y el editor la enseña", async () => {
    const { store } = await conFichero();
    act(() =>
      store.aplicar({ clase: "fichero", ruta: "a.xne", texto: "otro\n", recortado: false, binario: false, bytes: 5, codificacion: "utf-8", huella: "h3" })
    );
    await waitFor(() => expect(vistaDelEditor().state.doc.toString()).toBe("otro\n"));
  });

  it("cambiar de fichero con cambios pregunta antes; «Seguir editando» no cambia nada y «Descartar» sí", async () => {
    const { enviar, vista } = await conFichero();
    teclear(vista, "X");
    fireEvent.click(screen.getByRole("treeitem", { name: "b.xne" }));
    expect(screen.getByRole("alertdialog", { name: "Cambios sin guardar" })).toBeTruthy();
    expect(mandados(enviar, "fichero").filter((m) => m.ruta === "b.xne")).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Seguir editando" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getByLabelText("Hay cambios sin guardar")).toBeTruthy();
    fireEvent.click(screen.getByRole("treeitem", { name: "b.xne" }));
    fireEvent.click(screen.getByRole("button", { name: "Descartar cambios" }));
    expect(enviar).toHaveBeenCalledWith({ clase: "fichero", ruta: "b.xne" });
    expect(screen.queryByLabelText("Hay cambios sin guardar")).toBeNull();
  });

  it("«Cerrar» con cambios pregunta; sin cambios cierra sin preguntar", async () => {
    const { vista } = await conFichero();
    teclear(vista, "X");
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(screen.getByRole("alertdialog", { name: "Cambios sin guardar" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Descartar cambios" }));
    expect(document.querySelector(".cm-editor")).toBeNull();
    expect(screen.getByRole("button", { name: "Editar" })).toBeTruthy();
  });

  it("cerrar el panel con cambios también pregunta", async () => {
    const { vista } = await conFichero();
    teclear(vista, "X");
    fireEvent.click(screen.getByRole("button", { name: "Cerrar el panel" }));
    expect(screen.getByRole("alertdialog", { name: "Cambios sin guardar" })).toBeTruthy();
  });

  it("«Abrir» un hallazgo de otro fichero con cambios pregunta, y al descartar llega a su línea", async () => {
    // Ancha, para que el chat (con su veredicto en rojo) quepa al lado del panel.
    Object.defineProperty(window, "innerWidth", { value: 2400, configurable: true, writable: true });
    onTestFinished(() => Object.defineProperty(window, "innerWidth", { value: 1024, configurable: true, writable: true }));
    const { enviar, store, vista } = await conFichero();
    teclear(vista, "X");
    act(() => store.aplicar({ clase: "acto", acto: { tipo: "usuario", texto: "arregla" } }));
    act(() =>
      store.aplicar({
        clase: "acto",
        acto: { tipo: "verificacion", verde: false, errores: 1, avisos: 0, hallazgos: [{ code: "E1", severidad: "error", mensaje: "falta", fichero: "b.xne", linea: 1 }] },
      })
    );
    act(() => store.aplicar({ clase: "acto", acto: { tipo: "fin", ms: 10 } }));
    fireEvent.click(screen.getByRole("button", { name: "Abrir" }));
    expect(screen.getByRole("alertdialog", { name: "Cambios sin guardar" })).toBeTruthy();
    expect(mandados(enviar, "fichero").filter((m) => m.ruta === "b.xne")).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Descartar cambios" }));
    expect(enviar).toHaveBeenCalledWith({ clase: "fichero", ruta: "b.xne" });
    act(() =>
      store.aplicar({ clase: "fichero", ruta: "b.xne", texto: "dos\n", recortado: false, binario: false, bytes: 4, codificacion: "utf-8", huella: "h9" })
    );
    expect(screen.getByLabelText("Línea 1")).toBeTruthy();
  });

  it("una versión nueva del disco con cambios sin guardar no los pisa: sale la banda, y «Recargar» la trae", async () => {
    const { store, vista } = await conFichero();
    teclear(vista, "X");
    act(() =>
      store.aplicar({ clase: "fichero", ruta: "a.xne", texto: "otro\n", recortado: false, binario: false, bytes: 5, codificacion: "utf-8", huella: "h3" })
    );
    expect(screen.getByText(/ha cambiado en el disco/)).toBeTruthy();
    expect(vista.state.doc.toString()).toBe("Xuno\n");
    fireEvent.click(screen.getByRole("button", { name: "Recargar (pierdes los tuyos)" }));
    await waitFor(() => expect(vistaDelEditor().state.doc.toString()).toBe("otro\n"));
    expect(screen.queryByLabelText("Hay cambios sin guardar")).toBeNull();
    expect(screen.queryByText(/ha cambiado en el disco/)).toBeNull();
  });

  it("las «M» del árbol salen de Revisión", async () => {
    const { store } = await conFichero();
    act(() => store.aplicar({ clase: "revision", via: "git", ficheros: [{ ruta: "b.xne", clase: "modificado", mas: 1, menos: 0 }] }));
    expect(within(screen.getByRole("treeitem", { name: /b\.xne/ })).getByLabelText("Cambiado en la sesión")).toBeTruthy();
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
  // El mismo tipo escrito que el de `montar`, y por el mismo motivo: sin él el espía se infiere
  // sin parámetros y sus llamadas son una tupla VACÍA, así que `enviar.mock.calls[0][0]` —que es
  // como estos tests miran lo que se mandó— no tipea.
  function conEscritorio(
    enviar: Mock<(mensaje: unknown) => Promise<unknown>> = vi.fn(() => Promise.resolve(undefined as unknown)),
    subir = subirAdjuntoDeMentira
  ) {
    const store = crearStoreDelCliente();
    const vista = render(
      <App store={store} enviar={enviar} subirAdjunto={subir} instalarSkill={instalarSkillDeMentira} />
    );
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
    // El tipo escrito, como en `montar` y en `conEscritorio`: sin él la tupla de llamadas está
    // vacía y la última comprobación de este test —mirar lo que se mandó— no tipea.
    const enviar: Mock<(mensaje: unknown) => Promise<unknown>> = vi.fn(() =>
      Promise.resolve(undefined as unknown)
    );
    const store = crearStoreDelCliente();
    render(<App store={store} enviar={enviar} subirAdjunto={subirAdjuntoDeMentira} instalarSkill={instalarSkillDeMentira} />);
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

describe("el contador de tokens, montado por App", () => {
  /**
   * El último eslabón que faltaba por atar, y el que más veces se ha caído en esta cadena:
   * que `App` MONTE el contador con lo que el store guarda. El mensaje de aquí es el que el
   * servidor produce de verdad — capturado de una ejecución con el ejecutor real y un turno
   * de Gemini, no inventado para el test.
   */
  const DEL_SERVIDOR = {
    clase: "consumo",
    modelo: { entrada: 2154, salida: 1, cache: 0 },
    externo: { entrada: 0, salida: 0, cache: 0 },
    ventana: { usado: 2154, tope: 1_000_000 },
  } as const;

  it("con el mensaje del servidor, el contador aparece en el compositor", () => {
    const { store } = montar();
    act(() => store.aplicar(DEL_SERVIDOR));
    // El compositor enseña los DOS totales de la conversación, y nada más.
    expect(screen.getByText("2,2k")).toBeTruthy();
    expect(screen.getByText("nueva")).toBeTruthy();
    // Y la caché es su propia cifra, no una nota escondida en el `title`.
    expect(screen.getByText("caché")).toBeTruthy();
  });

  it("y la ventana del MISMO mensaje la pinta la barra de estado, no el compositor", () => {
    // Es la mitad del arreglo que se prueba en el sitio donde importa: un solo mensaje del
    // cable alimenta los dos sitios, y cada pregunta va al suyo. Aquí se ve que `App` cablea
    // las dos — el eslabón que se cae solo, porque un prop opcional no lo caza `tsc`.
    const { store } = montar();
    act(() => store.aplicar(DEL_SERVIDOR));
    expect(screen.getByText("ctx 2,2k/1M (0%)")).toBeTruthy();
    expect(screen.queryByText("2,2k/1M")).toBeNull();
  });

  it("y antes de que llegue, no hay contador", () => {
    // Ausente es «no consta»: sin sesión que haya consumido, el hueco se queda vacío.
    montar();
    expect(screen.queryByTitle(/Tokens de esta conversación/)).toBeNull();
  });
});

/**
 * El reparto de columnas, cableado. La REGLA vive en `repartoDeColumnas.ts` y se prueba
 * entera allí; lo que se prueba aquí es lo que ninguna función pura puede probar: que esté
 * CONECTADA — que el ancho de la ventana llegue, que lo que decide mueva de verdad la
 * pantalla, y que el plegado automático no se escriba en la preferencia del navegador.
 *
 * Es el patrón de fallo que este repo documenta diez veces: una regla compuesta dentro de
 * algo que los tests doblan no está probada, está escrita.
 */
describe("App: el panel a la derecha del chat", () => {
  const conVentana = (px: number): void => {
    Object.defineProperty(window, "innerWidth", { value: px, configurable: true, writable: true });
  };
  const compositorOculto = (): boolean =>
    screen.getByPlaceholderText(/pregunta sobre xone/i).closest("[hidden]") !== null;

  beforeEach(() => {
    window.localStorage.clear();
    conVentana(1024);
  });
  afterEach(() => conVentana(1024));

  it("el panel arranca CERRADO, y su botón lo abre por Ficheros", () => {
    // Ficheros y no Trazas: aquéllas son de otro destinatario —quien depura el harness, no
    // quien desarrolla la app—, así que un panel que abriera ahí enseñaría el interior del
    // harness a quien solo quería mirar su proyecto.
    montar();
    expect(screen.queryByRole("tablist")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Mostrar el panel" }));
    expect(screen.getByRole("tab", { name: "Ficheros" }).getAttribute("aria-selected")).toBe("true");
  });

  it("y lo reabre por donde se dejó", () => {
    montar();
    abrirPestana("Revisión");
    fireEvent.click(screen.getByRole("button", { name: "Cerrar el panel" }));
    expect(screen.queryByRole("tablist")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Mostrar el panel" }));
    expect(screen.getByRole("tab", { name: "Revisión" }).getAttribute("aria-selected")).toBe("true");
  });

  it("con sitio de sobra, el chat SE QUEDA: es la mitad de lo que se gana partiendo la pantalla", () => {
    conVentana(1600);
    const { store } = montar();
    act(() => store.aplicar({ clase: "acto", acto: { tipo: "usuario", texto: "hola" } }));
    abrirPestana("Ficheros");
    // La conversación sigue delante. Con `selector` porque el título de la sesión sale del
    // primer mensaje, así que «hola» está además en la miga de la cabecera — y ahí es un
    // `<button>`, mientras que el globo del chat es un `<div>` (Task 6, IXCODE-7: con
    // adjuntos lleva una lista detrás del texto, y un `<ul>` dentro de un `<p>` es HTML
    // inválido).
    expect(screen.getByText("hola", { selector: "div" })).toBeTruthy();
    // ...y con ella el compositor, que es lo que permite seguir escribiendo mientras se
    // mira un fichero.
    expect(compositorOculto()).toBe(false);
  });

  it("y sin sitio el panel ocupa el centro, con el compositor escondido: como se comportaba antes", () => {
    conVentana(900);
    const { store } = montar();
    act(() => store.aplicar({ clase: "acto", acto: { tipo: "usuario", texto: "hola" } }));
    abrirPestana("Ficheros");
    expect(screen.queryByText("hola", { selector: "div" })).toBeNull();
    // Escondido, NO desmontado: si no, ir a mirar un fichero y volver perdería el borrador.
    expect(compositorOculto()).toBe(true);
  });

  it("la barra se pliega SOLA para hacerle sitio al panel, y eso NO se guarda", () => {
    // 1200 da para el chat (560) y el panel (480) pero no para los tres con la barra (320).
    conVentana(1200);
    montar();
    expect(screen.getByRole("button", { name: /ocultar la barra lateral/i })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Mostrar el panel" }));
    // Ahora se ve plegada, y el botón lo dice.
    expect(screen.getByRole("button", { name: /mostrar la barra lateral/i })).toBeTruthy();
    // **Y la preferencia sigue intacta.** Sin esto, estrechar la ventana una vez dejaría la
    // barra plegada para siempre, también en la pantalla grande de mañana.
    expect(window.localStorage.getItem("xonecode.barraContraida")).not.toBe("1");
  });

  it("y pedirla de vuelta CIERRA el panel, en vez de no hacer nada", () => {
    // Es la otra mitad de lo anterior: el usuario no la ha plegado, así que su preferencia
    // ya dice «abierta» y volver a ponerla a «abierta» no cambiaría nada — un botón muerto
    // sin ninguna pista de por qué. Gana quien pulsa.
    conVentana(1200);
    montar();
    abrirPestana("Ficheros");
    expect(screen.getByRole("tablist")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /mostrar la barra lateral/i }));
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.getByRole("button", { name: /ocultar la barra lateral/i })).toBeTruthy();
  });

  it("estrechar la ventana SIN panel no pliega nada: manda el usuario y punto", () => {
    // Deliberado: si el ancho la plegara por su cuenta, pulsar «Mostrar la barra lateral» no
    // haría nada y no habría forma de arreglarlo. Con el panel abierto sí la hay —cerrarlo—.
    conVentana(400);
    montar();
    expect(screen.getByRole("button", { name: /ocultar la barra lateral/i })).toBeTruthy();
  });

  it("el panel NO se va al escritorio con la sesión: ahí no hay botón que lo cierre", () => {
    // La fuga sale SOLO en ventana ancha: con el panel en el centro vive dentro de la rama
    // de la sesión y se va con ella, pero en su columna lo monta la maqueta, que no sabe
    // nada de sesiones. El escritorio no ofrece el botón del panel —ahí no hay ficheros de
    // nadie—, así que quedaba una columna con el Ficheros de la sesión anterior de la que no
    // se salía. Y a 1200 la barra se quedaba además plegada en el escritorio.
    conVentana(1600);
    montar();
    abrirPestana("Ficheros");
    expect(screen.getByRole("region", { name: "Panel" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "XOneCode" }));
    expect(screen.queryByRole("region", { name: "Panel" })).toBeNull();
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.getByRole("button", { name: /ocultar la barra lateral/i })).toBeTruthy();
    // Lo que NO se tira es la ELECCIÓN: `vistaDelPanel` sigue puesta, así que al volver a la
    // sesión el panel vuelve por donde estaba. No se prueba aquí porque este montaje no trae
    // proyectos en el alta y desde el escritorio no hay ninguno que abrir.
  });

  it("el panel se monta UNA vez: al mudarse de la columna al centro no quedan dos", () => {
    // Cada vista suya MIDE al montarse, así que dos copias duplicarían todas sus peticiones
    // — y un `getAllByRole` de dos `tablist` es el síntoma que lo delata.
    conVentana(1600);
    montar();
    abrirPestana("Ficheros");
    expect(screen.getAllByRole("tablist")).toHaveLength(1);
    act(() => {
      conVentana(900);
      window.dispatchEvent(new Event("resize"));
    });
    expect(screen.getAllByRole("tablist")).toHaveLength(1);
  });
});

describe("App: la pregunta del AGENTE, en su tarjeta DENTRO del hilo", () => {
  const acto = (a: unknown) => ({ clase: "acto", acto: a });
  const consulta = { tipo: "consulta", pregunta: "¿Qué pantalla toco?", opciones: ["Login", "Menú"] };

  it("no es un diálogo: la tarjeta está en el chat, y Responder manda lo elegido como PROSA", () => {
    const { store, enviar } = montar();
    act(() => store.aplicar(acto({ tipo: "asistente", texto: "No sé cuál." })));
    act(() => store.aplicar(acto(consulta)));
    expect(screen.queryByRole("dialog")).toBeNull();
    const tarjeta = screen.getByRole("region", { name: "¿Qué pantalla toco?" });
    fireEvent.click(within(tarjeta).getByRole("radio", { name: "Menú" }));
    fireEvent.click(within(tarjeta).getByRole("button", { name: "Responder" }));
    expect(enviar).toHaveBeenCalledWith({ clase: "prosa", texto: "Menú" });
  });

  it("al REABRIR una sesión que se quedó esperando se puede contestar; contestada, queda como registro", () => {
    const { store } = montar();
    act(() => store.aplicar({ clase: "reemision", actos: [{ tipo: "usuario", texto: "arregla" }, consulta] }));
    expect(screen.getByRole("button", { name: "Responder" })).toBeTruthy();
    act(() =>
      store.aplicar({ clase: "reemision", actos: [{ tipo: "usuario", texto: "arregla" }, consulta, { tipo: "usuario", texto: "Menú" }] })
    );
    expect(screen.queryByRole("button", { name: "Responder" })).toBeNull();
    expect(screen.getByRole("region", { name: "Pregunta del agente: ¿Qué pantalla toco?" })).toBeTruthy();
  });
});

/** IXCODE-15: el catálogo de conectores con Jira AÑADIDO y probado: de aquí sale el nombre «Jira». */
const CONECTORES_CON_JIRA = {
  clase: "conectores",
  catalogo: [{ id: "jira", nombre: "Jira", descripcion: "", autenticacion: "oauth" }],
  conectores: [{ id: "jira", estado: "autorizado", prueba: { cuando: 1, ok: true, tools: [] } }],
  desconocidos: [],
};

/**
 * IXCODE-11: pulsar un proyecto abre su PANEL (Resumen, Tareas, Conectores) en vez de una sesión
 * vacía, y las dos puertas al chat —«Nueva sesión» y «Nueva sesión con esta tarea»— salen de él.
 * Lo que esto mira y ningún test del componente ve: que `App` cambia el CENTRO, qué manda por el
 * cable al hacerlo, y que el borrador del servidor llega al compositor SIN enviarse.
 */
describe("App: el panel del proyecto (IXCODE-11)", () => {
  const altaDe = (extra: Record<string, unknown> = {}) => ({
    clase: "alta",
    pasos: [],
    proveedores: [],
    entornos: [],
    registrados: [{ id: "webstudio", nombre: "WebStudio", url: "https://x/mcp" }],
    entornoActivo: "webstudio",
    proyectos: [
      { id: "p1", nombre: "AppDemo", local: true, sesiones: [{ id: "s1", titulo: "Menú lateral", ticket: "IXCODE-12", ticketConector: "jira" }] },
      { id: "p2", nombre: "Tienda", local: true },
      { id: "p3", nombre: "Remoto" },
    ],
    ramas: [],
    proyectoAbierto: true,
    proyectoActivo: "p1",
    sesionActiva: "s1",
    ...extra,
  });

  function conProyectoAbierto() {
    const store = crearStoreDelCliente();
    const enviar: Mock<(mensaje: unknown) => Promise<unknown>> = vi.fn(() => Promise.resolve(undefined as unknown));
    const vista = render(<App store={store} enviar={enviar} subirAdjunto={subirAdjuntoDeMentira} instalarSkill={instalarSkillDeMentira} />);
    act(() => store.marcarConectado());
    act(() => store.aplicar(altaDe()));
    // IXCODE-15: el nombre del gestor («Jira») sale del catálogo de conectores, no de un literal.
    act(() => store.aplicar(CONECTORES_CON_JIRA as never));
    return { store, enviar, vista };
  }
  const clases = (enviar: Mock<(mensaje: unknown) => Promise<unknown>>) => enviar.mock.calls.map(([m]) => (m as { clase: string }).clase);
  const campo = (): HTMLTextAreaElement => screen.getByPlaceholderText(/pregunta sobre xone/i) as HTMLTextAreaElement;
  /** La fila del proyecto en la BARRA: la miga de la cabecera también lleva su nombre. */
  const enBarra = (nombre: string | RegExp) =>
    within(screen.getAllByRole("navigation").find((n) => !n.hasAttribute("aria-label"))!).getByRole("button", { name: nombre });
  const enPanel = () => screen.queryByRole("tablist", { name: "Vistas del proyecto" }) !== null;

  it("pulsar el proyecto ABIERTO enseña su panel sin soltar la sesión: no manda `sesion`, solo pregunta al gestor", () => {
    const { enviar } = conProyectoAbierto();
    expect(enPanel()).toBe(false);
    enviar.mockClear();
    fireEvent.click(enBarra("AppDemo"));
    expect(enPanel()).toBe(true);
    expect(screen.getByRole("heading", { level: 1, name: "AppDemo" })).toBeTruthy();
    expect(screen.getByText("Entorno: WebStudio")).toBeTruthy();
    // NINGÚN compositor: esto no es un chat (y las sesiones ya no se listan aquí: son de la barra).
    expect(screen.queryByPlaceholderText(/pregunta sobre xone/i)).toBeNull();
    expect(clases(enviar)).not.toContain("sesion");
    expect(enviar).toHaveBeenCalledWith({ clase: "gestor", accion: "estado" });
  });

  it("tras un reinicio (credencial sí, prueba no), la pestaña Conectores manda PROBAR por el cable, no autorizar", () => {
    const { store, enviar } = conProyectoAbierto();
    act(() => store.aplicar({ ...CONECTORES_CON_JIRA, conectores: [{ id: "jira", estado: "autorizado" }] } as never));
    act(() => store.aplicar({ clase: "gestor", estado: { conectores: [] } } as never));
    fireEvent.click(enBarra("AppDemo"));
    enviar.mockClear();
    fireEvent.click(screen.getByRole("tab", { name: "Conectores" }));
    expect(enviar).toHaveBeenCalledWith({ clase: "conector", accion: "probar", id: "jira" });
    expect(enviar).not.toHaveBeenCalledWith({ clase: "conector", accion: "autorizar", id: "jira" });
  });

  it("pulsar OTRO proyecto con copia local lo abre como siempre y enseña su panel", () => {
    const { enviar } = conProyectoAbierto();
    fireEvent.click(enBarra("Tienda"));
    expect(enviar).toHaveBeenCalledWith({ clase: "sesion", proyecto: "p2" });
    expect(enPanel()).toBe(true);
  });

  /** Decisión de la fusión: sin copia también hay panel, con solo Resumen; descargar es su botón. */
  it("sin copia local abre su panel con solo el Resumen, sin soltar la sesión; «Descargar» abre la ventana", () => {
    const { enviar } = conProyectoAbierto();
    enviar.mockClear();
    fireEvent.click(enBarra("Remoto"));
    expect(enPanel()).toBe(true);
    expect(screen.getByRole("heading", { level: 1, name: "Remoto" })).toBeTruthy();
    expect(within(screen.getByRole("tablist", { name: "Vistas del proyecto" })).getAllByRole("tab")).toHaveLength(1);
    // Nada al servidor: ni abrir, ni descargar, ni preguntar al gestor (el abierto es de otro).
    expect(enviar).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Descargar" }));
    expect(enviar).toHaveBeenCalledWith({ clase: "alta", paso: "proyecto", proyecto: "p3" });
  });

  it("con el panel de uno sin copia delante, una PREGUNTA de la sesión abierta saca al chat", () => {
    const { store } = conProyectoAbierto();
    fireEvent.click(enBarra("Remoto"));
    expect(enPanel()).toBe(true);
    act(() => store.aplicar({ clase: "pregunta", texto: "¿Sigo?" }));
    expect(enPanel()).toBe(false);
    expect(screen.getByText("¿Sigo?")).toBeTruthy();
  });

  it("desde el panel, el «+» de un proyecto SIN copia apaga el panel: lo que se baje abre en el chat", () => {
    const { store } = conProyectoAbierto();
    fireEvent.click(enBarra("AppDemo"));
    expect(enPanel()).toBe(true);
    fireEvent.click(enBarra(/nueva sesión en remoto/i));
    // El servidor termina la descarga y anuncia el proyecto nuevo abierto.
    act(() => store.aplicar(altaDe({ proyectoActivo: "p3", sesionActiva: "s7" })));
    expect(enPanel()).toBe(false);
    expect(campo()).toBeTruthy();
  });

  it("con un turno en vuelo, una APROBACIÓN que llega con el panel delante saca al chat y se ve", () => {
    const { store, enviar } = conProyectoAbierto();
    act(() => store.aplicar({ clase: "turno", activo: true }));
    fireEvent.click(enBarra("AppDemo"));
    expect(enPanel()).toBe(true);
    act(() => store.aplicar({ clase: "aprobacion", pendientes: [PENDIENTE], ficheros: { "1": "src/app.xne" }, diffs: {} }));
    expect(enPanel()).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: /aprobar/i }));
    expect(clases(enviar)).toContain("decision");
  });

  it("una PREGUNTA pendiente también saca al chat", () => {
    const { store } = conProyectoAbierto();
    fireEvent.click(enBarra("AppDemo"));
    act(() => store.aplicar({ clase: "pregunta", texto: "¿Sigo?" }));
    expect(enPanel()).toBe(false);
    expect(screen.getByText("¿Sigo?")).toBeTruthy();
  });

  it("«El agente está trabajando» con «Volver al chat» solo con un turno en vuelo", () => {
    const { store } = conProyectoAbierto();
    fireEvent.click(enBarra("AppDemo"));
    expect(screen.queryByText("El agente está trabajando en esta sesión.")).toBeNull();
    act(() => store.aplicar({ clase: "turno", activo: true }));
    expect(screen.getByText("El agente está trabajando en esta sesión.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Volver al chat" }));
    expect(enPanel()).toBe(false);
  });

  it("el panel ya no tiene sesiones: el «+» de la barra lleva al CHAT", () => {
    conProyectoAbierto();
    fireEvent.click(enBarra("AppDemo"));
    expect(enPanel()).toBe(true);
    expect(screen.queryByRole("button", { name: "Nueva sesión" })).toBeNull();
    fireEvent.click(enBarra(/nueva sesión en appdemo/i));
    expect(enPanel()).toBe(false);
    expect(campo()).toBeTruthy();
  });

  it("el BORRADOR de «Empezar» saca al chat con la tarea en el compositor, y NO se envía", () => {
    const { store, enviar } = conProyectoAbierto();
    fireEvent.click(enBarra("AppDemo"));
    enviar.mockClear();
    // El orden del servidor: el alta de la sesión NUEVA, y después el borrador.
    act(() => store.aplicar(altaDe({ sesionActiva: "s9" })));
    act(() => store.aplicar({ clase: "gestor", borrador: { clave: "IXCODE-12", texto: "Trabaja en esta tarea de Jira.\n\nIXCODE-12 — Menú" } }));
    expect(enPanel()).toBe(false);
    expect(campo().value).toBe("Trabaja en esta tarea de Jira.\n\nIXCODE-12 — Menú");
    expect(clases(enviar)).not.toContain("prosa");
  });

  it("ese borrador no REAPARECE en la siguiente sesión nueva (el «+» de la barra)", () => {
    const { store } = conProyectoAbierto();
    act(() => store.aplicar({ clase: "gestor", borrador: { clave: "IXCODE-12", texto: "la tarea" } }));
    expect(campo().value).toBe("la tarea");
    // Se pasa por el panel (el compositor se DESMONTA) y se abre una nueva con el «+»: al volver a
    // montarse no puede reaplicar el borrador de la conversación de antes.
    fireEvent.click(enBarra("AppDemo"));
    fireEvent.click(enBarra(/nueva sesión en appdemo/i));
    expect(campo().value).toBe("");
  });

  /**
   * R8: el servidor manda `gestor.error{accion:"empezar"}` ANTES del `alta`/`borrador` de la
   * sesión que se abre IGUAL cuando la transición falla (`arranque.ts#atenderGestor`). El
   * cliente no lo puede decir como «empezar falló» —bloquearía o parecería deshacer la sesión
   * nueva, que ya está abierta—: se dice en el CHAT, DESPUÉS de que el borrador llega.
   */
  it("R8: la transición fallida se dice en el CHAT tras el borrador, no bloquea la sesión nueva", () => {
    const { store } = conProyectoAbierto();
    fireEvent.click(enBarra("AppDemo"));
    act(() =>
      store.aplicar({ clase: "gestor", estado: { conectores: ["jira"], vinculo: { conector: "jira", sitio: "s", proyecto: "IXCODE" } } })
    );
    fireEvent.click(screen.getByRole("tab", { name: "Tareas" }));
    act(() =>
      store.aplicar({
        clase: "gestor",
        pendientes: { cuando: 1, lista: [{ clave: "IXCODE-12", titulo: "Menú", estado: "Por hacer", categoria: "por-hacer" }] },
      })
    );
    fireEvent.click(screen.getByRole("button", { name: "Nueva sesión con IXCODE-12" }));
    act(() =>
      store.aplicar({
        clase: "gestor",
        transiciones: {
          clave: "IXCODE-12",
          para: "empezar",
          propuesta: "11",
          lista: [{ id: "11", nombre: "Empezar a hacer", destino: "EN CURSO", categoria: "en-curso" }],
        },
      })
    );
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Pasar y empezar" }));

    // El orden EXACTO del servidor: el error primero.
    act(() => store.aplicar({ clase: "gestor", error: { accion: "empezar", motivo: "no se pudo transicionar" } }));
    expect(screen.queryByText(/No se pudo pasar/)).toBeNull();
    // Y TAMPOCO dentro de la propia tarjeta: mientras `empezarEnVuelo` sigue puesto (la
    // sesión puede seguir abriéndose), ese motivo no se pinta como fallo del diálogo.
    expect(within(screen.getByRole("dialog")).queryByRole("alert")).toBeNull();
    // Y solo DESPUÉS, el alta de la sesión nueva y el borrador.
    act(() => store.aplicar(altaDe({ sesionActiva: "s9" })));
    act(() =>
      store.aplicar({ clase: "gestor", borrador: { clave: "IXCODE-12", texto: "Trabaja en esta tarea de Jira.\n\nIXCODE-12 — Menú" } })
    );
    // La sesión nueva se abrió igual: el borrador llegó al compositor, sin enviarse.
    expect(enPanel()).toBe(false);
    expect(campo().value).toBe("Trabaja en esta tarea de Jira.\n\nIXCODE-12 — Menú");
    // Y el aviso, en el chat, con la frase que R8 pide.
    expect(screen.getByText("No se pudo pasar IXCODE-12 a EN CURSO: no se pudo transicionar. La sesión se abrió igual.")).toBeTruthy();
  });

  /**
   * El otro lado de R8: `g.ficha()` —o `vinculo`/`gestorOFallo`— falla ANTES de intentar
   * ninguna transición, y ahí el servidor SÍ corta: `return fallo(...)`, sin `abrirProyecto`.
   * La señal de que esto pasó es el `alta` que el `finally` reanuncia con la MISMA sesión de
   * antes (`arranque.ts#atenderGestor`) — nunca llega ningún `borrador`. La tarjeta tiene que
   * soltar el candado con esa señal, no quedarse enviando para siempre.
   */
  it("un fallo TOTAL (sin sesión que abrir) suelta la tarjeta: el `alta` vuelve con la MISMA sesión, sin borrador", () => {
    const { store } = conProyectoAbierto();
    fireEvent.click(enBarra("AppDemo"));
    act(() =>
      store.aplicar({ clase: "gestor", estado: { conectores: ["jira"], vinculo: { conector: "jira", sitio: "s", proyecto: "IXCODE" } } })
    );
    fireEvent.click(screen.getByRole("tab", { name: "Tareas" }));
    act(() =>
      store.aplicar({
        clase: "gestor",
        pendientes: { cuando: 1, lista: [{ clave: "IXCODE-12", titulo: "Menú", estado: "Por hacer", categoria: "por-hacer" }] },
      })
    );
    fireEvent.click(screen.getByRole("button", { name: "Nueva sesión con IXCODE-12" }));
    act(() =>
      store.aplicar({
        clase: "gestor",
        transiciones: {
          clave: "IXCODE-12",
          para: "empezar",
          propuesta: "11",
          lista: [{ id: "11", nombre: "Empezar a hacer", destino: "EN CURSO", categoria: "en-curso" }],
        },
      })
    );
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Pasar y empezar" }));
    act(() => store.aplicar({ clase: "gestor", error: { accion: "empezar", motivo: "no se pudo leer la tarea en Jira" } }));
    const dialogo = screen.getByRole("dialog");
    // Los botones que ESCRIBEN se deshabilitan; «Cancelar» no —cerrar no manda nada, así que
    // no hay envío que doblar— pero el candado de verdad es `empezarEnVuelo`, no el diálogo.
    for (const nombre of ["Pasar y empezar", "Empezar sin tocar Jira"]) {
      expect((within(dialogo).getByRole("button", { name: nombre }) as HTMLButtonElement).disabled).toBe(true);
    }
    expect((within(dialogo).getByRole("button", { name: "Cancelar" }) as HTMLButtonElement).disabled).toBe(false);
    // El `finally` reanuncia el alta con la MISMA sesión («s1»): no se abrió nada.
    act(() => store.aplicar(altaDe({ sesionActiva: "s1" })));
    for (const nombre of ["Pasar y empezar", "Empezar sin tocar Jira", "Cancelar"]) {
      expect((within(dialogo).getByRole("button", { name: nombre }) as HTMLButtonElement).disabled).toBe(false);
    }
    // Y ahora sí se puede cerrar por Escape.
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    // No se abrió ninguna sesión nueva, ni se envió nada al compositor.
    expect(enPanel()).toBe(true);
  });

  /**
   * Un `alta` con la MISMA sesión no basta por sí solo: llega por motivos que no tienen nada
   * que ver con este `empezar` en marcha —una tarea de fondo, otra pestaña, el `historica`/git
   * diferido—, y soltar el candado ahí reabriría la ventana de doble envío mientras
   * `g.ficha()`/`g.transicionar()` siguen en el aire. Hace falta TAMBIÉN un error de ESTE
   * intento.
   */
  it("un `alta` con la MISMA sesión pero SIN error de por medio no suelta la tarjeta", () => {
    const { store } = conProyectoAbierto();
    fireEvent.click(enBarra("AppDemo"));
    act(() =>
      store.aplicar({ clase: "gestor", estado: { conectores: ["jira"], vinculo: { conector: "jira", sitio: "s", proyecto: "IXCODE" } } })
    );
    fireEvent.click(screen.getByRole("tab", { name: "Tareas" }));
    act(() =>
      store.aplicar({
        clase: "gestor",
        pendientes: { cuando: 1, lista: [{ clave: "IXCODE-12", titulo: "Menú", estado: "Por hacer", categoria: "por-hacer" }] },
      })
    );
    fireEvent.click(screen.getByRole("button", { name: "Nueva sesión con IXCODE-12" }));
    act(() =>
      store.aplicar({
        clase: "gestor",
        transiciones: {
          clave: "IXCODE-12",
          para: "empezar",
          propuesta: "11",
          lista: [{ id: "11", nombre: "Empezar a hacer", destino: "EN CURSO", categoria: "en-curso" }],
        },
      })
    );
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Pasar y empezar" }));
    // Un `alta` de la MISMA sesión, pero sin que haya llegado ningún error todavía: por
    // ejemplo, el aviso de que una tarea en background empezó a trabajar.
    act(() => store.aplicar(altaDe({ sesionActiva: "s1" })));
    const dialogo = screen.getByRole("dialog");
    for (const nombre of ["Pasar y empezar", "Empezar sin tocar Jira"]) {
      expect((within(dialogo).getByRole("button", { name: nombre }) as HTMLButtonElement).disabled).toBe(true);
    }
  });

  /**
   * Las tareas en BACKGROUND del proyecto ya no viven en el panel lateral: se mudaron a este
   * panel, pestaña Tareas, delante de las pendientes del gestor (a petición suya, «son del
   * proyecto, no de la sesión»). Lo que sigue mide la MISMA cosa que medía antes de la
   * mudanza — filtro por proyecto activo, acciones sobre el cable, el estado vacío que se
   * queda, y crear desde aquí con el proyecto ya resuelto — pero a través de esta puerta.
   */
  describe("y sus tareas en background", () => {
    const TAREA = (extra: Record<string, unknown> = {}) => ({
      id: "t1",
      proyecto: "p1",
      proyectoNombre: "AppDemo",
      titulo: "Arregla el login",
      peticion: "Arregla el login",
      encargo: "Arregla el login",
      adjuntos: [],
      estado: "nuevo" as const,
      creada: "2026-09-08T10:00:00.000Z",
      ...extra,
    });
    /** Abre el panel del proyecto ABIERTO y su pestaña Tareas. */
    const abrirTareasDelProyecto = (): void => {
      fireEvent.click(enBarra("AppDemo"));
      fireEvent.click(screen.getByRole("tab", { name: "Tareas" }));
    };

    it("lo que filtra por proyecto ACTIVO es lo que hay DENTRO de «Tareas en background»", () => {
      const { store } = conProyectoAbierto();
      abrirTareasDelProyecto();
      // Antes de que llegue ningún mensaje `tareas`, no se afirma que no haya ninguna. (La
      // pestaña también consulta al GESTOR, con su propio «Consultando…»: este es el de la
      // cola de tareas en background, no el suyo.)
      expect(screen.getByText(/consultando la cola de tareas/i)).toBeTruthy();

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
      const { store, enviar } = conProyectoAbierto();
      act(() =>
        store.aplicar({
          clase: "tareas",
          concurrencia: 2,
          corriendoAqui: true,
          lista: [TAREA({ estado: "requiere-atencion", motivo: "el juez marcó el trabajo en rojo" })],
        })
      );
      abrirTareasDelProyecto();
      expect(screen.getByText(/el juez marcó el trabajo en rojo/)).toBeTruthy();

      fireEvent.click(screen.getByRole("button", { name: /reintentar/i }));
      expect(enviar).toHaveBeenCalledWith({ clase: "tarea", accion: "reintentar", id: "t1" });

      fireEvent.click(screen.getByRole("button", { name: /dar por bueno/i }));
      expect(enviar).toHaveBeenCalledWith({ clase: "tarea", accion: "terminar", id: "t1" });

      fireEvent.click(screen.getByRole("button", { name: /^descartar$/i }));
      fireEvent.click(screen.getByRole("button", { name: /sí, descartar/i }));
      expect(enviar).toHaveBeenCalledWith({ clase: "tarea", accion: "descartar", id: "t1" });
    });

    it("al quedarse el proyecto activo sin tareas, la sección «Tareas en background» se QUEDA con su estado vacío", () => {
      const { store } = conProyectoAbierto();
      act(() => store.aplicar({ clase: "tareas", concurrencia: 2, corriendoAqui: true, lista: [TAREA()] }));
      abrirTareasDelProyecto();
      expect(screen.getByRole("region", { name: "Tareas en background" })).toBeTruthy();
      expect(screen.getByText("Arregla el login")).toBeTruthy();
      act(() => store.aplicar({ clase: "tareas", concurrencia: 2, corriendoAqui: true, lista: [] }));
      expect(screen.getByRole("region", { name: "Tareas en background" })).toBeTruthy();
      expect(screen.getByText(/todavía no tiene ninguna/i)).toBeTruthy();
    });

    /**
     * El acceptance criterion central de Task 15: crear una tarea PARA el proyecto abierto sin
     * volver al escritorio, y con el proyecto ya resuelto — no un selector que haya que rellenar.
     */
    it("crear una tarea desde AQUÍ, sin volver al escritorio, y con el proyecto ya resuelto", async () => {
      const { store, enviar } = conProyectoAbierto();
      act(() => store.aplicar({ clase: "tareas", concurrencia: 2, corriendoAqui: true, lista: [] }));
      abrirTareasDelProyecto();
      fireEvent.click(screen.getByRole("button", { name: /nueva tarea/i }));
      // Si el punto de entrada abriera la ventana SIN proyecto resuelto, `App` no encontraría
      // con qué pintarla (`proyectoDeLaTarea` no resolvería) y este campo no aparecería.
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
});

/**
 * Task 11 (IXCODE-11): «Cerrar en Jira», el botón de una sesión ligada a un ticket. La sesión
 * `s1` de `AppDemo` (`altaDe`, arriba) ya viaja con `ticket: "IXCODE-12"` y es la ABIERTA por
 * omisión en `conProyectoAbierto()`.
 */
describe("App: «Cerrar en Jira» (Task 11, IXCODE-11)", () => {
  const altaDe = (extra: Record<string, unknown> = {}) => ({
    clase: "alta",
    pasos: [],
    proveedores: [],
    entornos: [],
    registrados: [{ id: "webstudio", nombre: "WebStudio", url: "https://x/mcp" }],
    entornoActivo: "webstudio",
    proyectos: [
      { id: "p1", nombre: "AppDemo", local: true, sesiones: [{ id: "s1", titulo: "Menú lateral", ticket: "IXCODE-12", ticketConector: "jira" }] },
      { id: "p2", nombre: "Tienda", local: true },
    ],
    ramas: [],
    proyectoAbierto: true,
    proyectoActivo: "p1",
    sesionActiva: "s1",
    ...extra,
  });

  function conProyectoAbierto() {
    const store = crearStoreDelCliente();
    const enviar: Mock<(mensaje: unknown) => Promise<unknown>> = vi.fn(() => Promise.resolve(undefined as unknown));
    render(<App store={store} enviar={enviar} subirAdjunto={subirAdjuntoDeMentira} instalarSkill={instalarSkillDeMentira} />);
    act(() => store.marcarConectado());
    act(() => store.aplicar(altaDe()));
    // IXCODE-15: lo que dice el botón sale del conector del TICKET y del catálogo.
    act(() => store.aplicar(CONECTORES_CON_JIRA as never));
    return { store, enviar };
  }

  /**
   * IXCODE-15: el botón nombra al gestor del TICKET (`ticketConector`, con el nombre del
   * catálogo), no al vinculado ahora: el servidor cierra con el conector del ticket. Sin él, una
   * frase neutra —nunca «Jira» por omisión—. Un ticket de Notion (UUID) se enseña por su id
   * corto, y a `transiciones` va ENTERO.
   */
  it("una tarea de Jira con Notion vinculado dice «Cerrar en Jira»; una de Notion, «Cerrar en Notion» con el id corto", () => {
    const { store, enviar } = conProyectoAbierto();
    const catalogo = { ...CONECTORES_CON_JIRA, catalogo: [...CONECTORES_CON_JIRA.catalogo, { id: "notion", nombre: "Notion", descripcion: "", autenticacion: "oauth" }] };
    act(() => store.aplicar(catalogo as never));
    act(() =>
      store.aplicar({
        clase: "gestor",
        estado: { conectores: ["notion"], vinculo: { conector: "notion", sitio: "notion", proyecto: "collection://ea517d0b-0000-4000-8000-000000000000" }, admiteMias: true },
      })
    );
    expect(screen.getByRole("button", { name: "Cerrar en Jira" })).toBeTruthy();
    const uuid = "0687543b-1c2d-4e5f-8a9b-0c1d2e3f4a5b";
    const sesion = (extra: Record<string, unknown>) =>
      altaDe({ proyectos: [{ id: "p1", nombre: "AppDemo", local: true, sesiones: [{ id: "s1", titulo: "Menú lateral", ticket: uuid, ...extra }] }] });
    // Sin conector del ticket (un servidor de antes): neutra.
    act(() => store.aplicar(sesion({})));
    expect(screen.getByRole("button", { name: "Cerrar la tarea" })).toBeTruthy();
    act(() => store.aplicar(sesion({ ticketConector: "notion" })));
    expect(screen.getByText("0687543b")).toBeTruthy();
    expect(screen.queryByText(uuid)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Cerrar en Notion" }));
    expect(enviar).toHaveBeenCalledWith({ clase: "gestor", accion: "transiciones", clave: uuid, para: "cerrar" });
    act(() => store.aplicar({ clase: "gestor", cierre: { clave: uuid, comentario: "hecho" } }));
    expect(screen.getByRole("dialog", { name: "Cerrar 0687543b en Notion" })).toBeTruthy();
  });

  it("se ve con un ticket en la sesión abierta, y se apaga con un turno en vuelo", () => {
    const { store } = conProyectoAbierto();
    expect(screen.getByRole("button", { name: "Cerrar en Jira" })).toBeTruthy();
    expect(screen.getByText("IXCODE-12")).toBeTruthy();
    act(() => store.aplicar({ clase: "turno", activo: true }));
    expect(screen.queryByRole("button", { name: "Cerrar en Jira" })).toBeNull();
    act(() => store.aplicar({ clase: "turno", activo: false }));
    expect(screen.getByRole("button", { name: "Cerrar en Jira" })).toBeTruthy();
  });

  it("una sesión SIN ticket no lo ofrece", () => {
    const { store } = conProyectoAbierto();
    act(() =>
      store.aplicar(
        altaDe({
          sesionActiva: "s2",
          proyectos: [
            { id: "p1", nombre: "AppDemo", local: true, sesiones: [{ id: "s1", titulo: "Menú lateral", ticket: "IXCODE-12", ticketConector: "jira" }, { id: "s2", titulo: "Suelta" }] },
          ],
        })
      )
    );
    expect(screen.queryByRole("button", { name: "Cerrar en Jira" })).toBeNull();
  });

  it("pulsarlo pide el borrador del comentario Y las transiciones de cierre; la tarjeta se abre TRAS «cierre»", () => {
    const { enviar } = conProyectoAbierto();
    fireEvent.click(screen.getByRole("button", { name: "Cerrar en Jira" }));
    expect(enviar).toHaveBeenCalledWith({ clase: "gestor", accion: "borradorDeCierre" });
    expect(enviar).toHaveBeenCalledWith({ clase: "gestor", accion: "transiciones", clave: "IXCODE-12", para: "cerrar" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "Preparando…" })).toBeTruthy();
  });

  it("«cierre» abre la tarjeta con el comentario EDITABLE; confirmar manda `cerrar`, y `cerrado` la cierra con un aviso en el chat", () => {
    const { store, enviar } = conProyectoAbierto();
    fireEvent.click(screen.getByRole("button", { name: "Cerrar en Jira" }));
    act(() => store.aplicar({ clase: "gestor", cierre: { clave: "IXCODE-12", comentario: "IXCODE-12: comentado." } }));
    const dialogo = screen.getByRole("dialog", { name: "Cerrar IXCODE-12 en Jira" });
    expect((within(dialogo).getByRole("textbox", { name: "Comentario" }) as HTMLTextAreaElement).value).toBe("IXCODE-12: comentado.");

    act(() =>
      store.aplicar({
        clase: "gestor",
        transiciones: {
          clave: "IXCODE-12",
          para: "cerrar",
          propuesta: "31",
          lista: [{ id: "31", nombre: "Marcar como probada", destino: "PROBAR", categoria: "en-curso" }],
        },
      })
    );
    fireEvent.change(within(dialogo).getByRole("textbox", { name: "Comentario" }), {
      target: { value: "IXCODE-12: comentado y pasado a PROBAR" },
    });
    enviar.mockClear();
    fireEvent.click(within(dialogo).getByRole("button", { name: "Comentar y pasar a PROBAR" }));
    expect(enviar).toHaveBeenCalledWith({
      clase: "gestor",
      accion: "cerrar",
      comentario: "IXCODE-12: comentado y pasado a PROBAR",
      transicion: "31",
    });

    act(() => store.aplicar({ clase: "gestor", cerrado: { clave: "IXCODE-12", comento: true, transicion: "31" } }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText("IXCODE-12: comentado y pasado a PROBAR")).toBeTruthy();
  });

  it("«Solo comentar» manda `cerrar` SIN transición", () => {
    const { store, enviar } = conProyectoAbierto();
    fireEvent.click(screen.getByRole("button", { name: "Cerrar en Jira" }));
    act(() => store.aplicar({ clase: "gestor", cierre: { clave: "IXCODE-12", comentario: "x" } }));
    enviar.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Solo comentar" }));
    expect(enviar).toHaveBeenCalledWith({ clase: "gestor", accion: "cerrar", comentario: "x" });
  });

  it("un error de «cerrar» deja la tarjeta abierta con el motivo y el texto EDITADO intacto", () => {
    const { store } = conProyectoAbierto();
    fireEvent.click(screen.getByRole("button", { name: "Cerrar en Jira" }));
    act(() => store.aplicar({ clase: "gestor", cierre: { clave: "IXCODE-12", comentario: "propuesto" } }));
    const dialogo = screen.getByRole("dialog");
    fireEvent.change(within(dialogo).getByRole("textbox", { name: "Comentario" }), { target: { value: "lo que escribí" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Solo comentar" }));
    act(() => store.aplicar({ clase: "gestor", error: { accion: "cerrar", motivo: "la conexión con Jira falló" } }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(within(dialogo).getByRole("alert").textContent).toBe("la conexión con Jira falló");
    expect((within(dialogo).getByRole("textbox", { name: "Comentario" }) as HTMLTextAreaElement).value).toBe("lo que escribí");
  });

  it("«Cancelar» cierra la tarjeta sin mandar nada", () => {
    const { store, enviar } = conProyectoAbierto();
    fireEvent.click(screen.getByRole("button", { name: "Cerrar en Jira" }));
    act(() => store.aplicar({ clase: "gestor", cierre: { clave: "IXCODE-12", comentario: "x" } }));
    enviar.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(enviar).not.toHaveBeenCalledWith(expect.objectContaining({ accion: "cerrar" }));
  });

  it("un fallo al pedir el borrador se dice como aviso corto, sin dejar el botón «Preparando…» para siempre", () => {
    const { store } = conProyectoAbierto();
    fireEvent.click(screen.getByRole("button", { name: "Cerrar en Jira" }));
    act(() => store.aplicar({ clase: "gestor", error: { accion: "borradorDeCierre", motivo: "espera a que termine el turno" } }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "Cerrar en Jira" })).toBeTruthy();
    expect(screen.getByText(/espera a que termine el turno/)).toBeTruthy();
  });

  it("un re-render por algo AJENO (turno, consumo…) no pisa la transición que la persona eligió en el desplegable", () => {
    const { store } = conProyectoAbierto();
    fireEvent.click(screen.getByRole("button", { name: "Cerrar en Jira" }));
    act(() => store.aplicar({ clase: "gestor", cierre: { clave: "IXCODE-12", comentario: "x" } }));
    const transiciones = {
      clave: "IXCODE-12",
      para: "cerrar" as const,
      propuesta: "11",
      lista: [
        { id: "11", nombre: "Empezar a hacer", destino: "EN CURSO", categoria: "en-curso" as const },
        { id: "31", nombre: "Marcar como probada", destino: "PROBAR", categoria: "en-curso" as const },
      ],
    };
    act(() => store.aplicar({ clase: "gestor", transiciones }));
    const dialogo = screen.getByRole("dialog");
    fireEvent.change(within(dialogo).getByRole("combobox", { name: "Transición" }), { target: { value: "31" } });
    expect(within(dialogo).getByRole("button", { name: "Comentar y pasar a PROBAR" })).toBeTruthy();
    // Un turno EN VUELO no manda ningún mensaje del gestor, pero SÍ re-renderiza `App` entera.
    act(() => store.aplicar({ clase: "turno", activo: true }));
    act(() => store.aplicar({ clase: "turno", activo: false }));
    expect(within(dialogo).getByRole("button", { name: "Comentar y pasar a PROBAR" })).toBeTruthy();
  });

  it("un error VIEJO de «cerrar» no se enseña en una tarjeta recién abierta (R6): solo el que llega DESPUÉS", () => {
    const { store } = conProyectoAbierto();
    // Un intento anterior (de otra sesión, o cancelado) dejó un error en el store.
    act(() => store.aplicar({ clase: "gestor", error: { accion: "cerrar", motivo: "fallo de antes" } }));
    fireEvent.click(screen.getByRole("button", { name: "Cerrar en Jira" }));
    act(() => store.aplicar({ clase: "gestor", cierre: { clave: "IXCODE-12", comentario: "x" } }));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("un fallo al consultar las transiciones de cierre se dice, sin impedir «Solo comentar»", () => {
    const { store } = conProyectoAbierto();
    fireEvent.click(screen.getByRole("button", { name: "Cerrar en Jira" }));
    act(() => store.aplicar({ clase: "gestor", cierre: { clave: "IXCODE-12", comentario: "x" } }));
    act(() => store.aplicar({ clase: "gestor", error: { accion: "transiciones", motivo: "Jira no contesta" } }));
    const dialogo = screen.getByRole("dialog");
    expect(within(dialogo).getByRole("alert").textContent).toBe("No se pudieron consultar las transiciones: Jira no contesta");
    expect(within(dialogo).getByRole("button", { name: "Solo comentar" })).toBeTruthy();
  });

  /**
   * El servidor atiende `borradorDeCierre` y `transiciones` a la vez (dos `atenderGestor` sin
   * esperarse, `arranque.ts`), así que `error{transiciones}` puede llegar ANTES que `cierre`
   * —el ORDEN inverso del test de arriba—. Si el snapshot de R6 se tomara al abrir la tarjeta
   * (cuando llega `cierre`), este error —de ESTE mismo intento, no de uno viejo— quedaría
   * marcado como «anterior a abrir» y se callaría: el snapshot tiene que tomarse al PEDIR.
   */
  it("un fallo al consultar las transiciones que llega ANTES que «cierre» se sigue enseñando", () => {
    const { store } = conProyectoAbierto();
    fireEvent.click(screen.getByRole("button", { name: "Cerrar en Jira" }));
    act(() => store.aplicar({ clase: "gestor", error: { accion: "transiciones", motivo: "Jira no contesta" } }));
    act(() => store.aplicar({ clase: "gestor", cierre: { clave: "IXCODE-12", comentario: "x" } }));
    const dialogo = screen.getByRole("dialog");
    expect(within(dialogo).getByRole("alert").textContent).toBe("No se pudieron consultar las transiciones: Jira no contesta");
  });

  /**
   * R de la tarjeta: `cerrar` actúa sobre la sesión ABIERTA. Si la persona se muda a OTRA
   * sesión mientras el cierre está pendiente o la tarjeta abierta, seguir mostrándola
   * escribiría —o parecería escribir— sobre el ticket de una conversación que ya no es la
   * que está delante.
   */
  it("cambiar de sesión suelta la tarjeta y los avisos pendientes de «Cerrar en Jira»", () => {
    const { store } = conProyectoAbierto();
    fireEvent.click(screen.getByRole("button", { name: "Cerrar en Jira" }));
    act(() => store.aplicar({ clase: "gestor", cierre: { clave: "IXCODE-12", comentario: "x" } }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    act(() =>
      store.aplicar(
        altaDe({
          sesionActiva: "s2",
          proyectos: [
            { id: "p1", nombre: "AppDemo", local: true, sesiones: [{ id: "s1", titulo: "Menú lateral", ticket: "IXCODE-12", ticketConector: "jira" }, { id: "s2", titulo: "Suelta" }] },
          ],
        })
      )
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("button", { name: "Cerrar en Jira" })).toBeNull();
  });

  /**
   * `marcarDesconectado` tira `estado.gestor` entero (`store.ts`): la respuesta al
   * `borradorDeCierre` que se pidió no va a volver NUNCA. Sin un reset al caerse el cable, el
   * botón se quedaba diciendo «Preparando…» para siempre tras reconectar —la bienvenida trae
   * un `alta` con la MISMA sesión, así que ni siquiera el reset por cambio de sesión lo salva.
   */
  it("una caída del cable mientras «Preparando…» no deja el botón bloqueado tras reconectar", () => {
    const { store } = conProyectoAbierto();
    fireEvent.click(screen.getByRole("button", { name: "Cerrar en Jira" }));
    expect(screen.getByRole("button", { name: "Preparando…" })).toBeTruthy();
    act(() => store.marcarDesconectado());
    act(() => store.marcarConectado());
    act(() => store.aplicar(altaDe()));
    // El store tiró los conectores al caerse el cable: hasta que vuelve el catálogo, el botón no
    // nombra a nadie (IXCODE-15), pero ya no está bloqueado.
    expect(screen.getByRole("button", { name: "Cerrar la tarea" })).toBeTruthy();
    act(() => store.aplicar(CONECTORES_CON_JIRA as never));
    expect(screen.getByRole("button", { name: "Cerrar en Jira" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Preparando…" })).toBeNull();
  });

  const transicionesDeCierre = {
    clave: "IXCODE-12",
    para: "cerrar" as const,
    propuesta: "31",
    lista: [{ id: "31", nombre: "Marcar como probada", destino: "PROBAR", categoria: "en-curso" as const }],
  };

  /**
   * Revisión final (IXCODE-11), hallazgo 1: el comentario se escribió y la transición no. La
   * tarjeta NO puede quedarse abierta ofreciendo «Comentar y pasar a PROBAR» otra vez —eso
   * comentaría DOS veces—: se cierra, y el aviso dice las dos mitades.
   */
  it("comentado pero la transición FALLÓ: la tarjeta se cierra y el aviso lo dice, sin ofrecer repetir el comentario", () => {
    const { store, enviar } = conProyectoAbierto();
    fireEvent.click(screen.getByRole("button", { name: "Cerrar en Jira" }));
    act(() => store.aplicar({ clase: "gestor", cierre: { clave: "IXCODE-12", comentario: "x" } }));
    act(() => store.aplicar({ clase: "gestor", transiciones: transicionesDeCierre }));
    fireEvent.click(screen.getByRole("button", { name: "Comentar y pasar a PROBAR" }));
    enviar.mockClear();
    act(() => store.aplicar({ clase: "gestor", cerrado: { clave: "IXCODE-12", comento: true, falloDeTransicion: "la transición no está disponible" } }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText("IXCODE-12: comentado; no se pudo pasar a PROBAR: la transición no está disponible")).toBeTruthy();
    expect(enviar).not.toHaveBeenCalledWith(expect.objectContaining({ accion: "cerrar" }));
  });

  /** Hallazgo 6: un `cierre` NUEVO con la tarjeta abierta trae su propio texto; la tarjeta no
   *  puede seguir enseñando el de antes (su `useState` solo lee `comentario` al montar). */
  it("un segundo «cierre» con la tarjeta abierta REMONTA la tarjeta con su texto", () => {
    const { store } = conProyectoAbierto();
    fireEvent.click(screen.getByRole("button", { name: "Cerrar en Jira" }));
    act(() => store.aplicar({ clase: "gestor", cierre: { clave: "IXCODE-12", comentario: "primero" } }));
    fireEvent.change(within(screen.getByRole("dialog")).getByRole("textbox", { name: "Comentario" }), { target: { value: "editado" } });
    act(() => store.aplicar({ clase: "gestor", cierre: { clave: "IXCODE-12", comentario: "segundo" } }));
    expect((within(screen.getByRole("dialog")).getByRole("textbox", { name: "Comentario" }) as HTMLTextAreaElement).value).toBe("segundo");
  });

  /**
   * Hallazgo 8: cancelar la tarjeta con un `cerrar` YA en vuelo no suelta el candado —la
   * respuesta todavía puede llegar, y el comentario puede estar ya escrito—. Reabrir enseña los
   * botones que escriben DESACTIVADOS, y ningún clic manda un segundo `cerrar`.
   */
  it("cancelar con un «cerrar» en vuelo y reabrir: los botones que escriben siguen desactivados, no sale otro `cerrar`", () => {
    const { store, enviar } = conProyectoAbierto();
    fireEvent.click(screen.getByRole("button", { name: "Cerrar en Jira" }));
    act(() => store.aplicar({ clase: "gestor", cierre: { clave: "IXCODE-12", comentario: "x" } }));
    act(() => store.aplicar({ clase: "gestor", transiciones: transicionesDeCierre }));
    fireEvent.click(screen.getByRole("button", { name: "Solo comentar" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    enviar.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Cerrar en Jira" }));
    act(() => store.aplicar({ clase: "gestor", cierre: { clave: "IXCODE-12", comentario: "x" } }));
    act(() => store.aplicar({ clase: "gestor", transiciones: transicionesDeCierre }));
    const dialogo = screen.getByRole("dialog");
    const soloComentar = within(dialogo).getByRole("button", { name: "Solo comentar" }) as HTMLButtonElement;
    const comentarYPasar = within(dialogo).getByRole("button", { name: "Comentar y pasar a PROBAR" }) as HTMLButtonElement;
    expect(soloComentar.disabled).toBe(true);
    expect(comentarYPasar.disabled).toBe(true);
    fireEvent.click(soloComentar);
    fireEvent.click(comentarYPasar);
    expect(enviar).not.toHaveBeenCalledWith(expect.objectContaining({ accion: "cerrar" }));
  });
});
