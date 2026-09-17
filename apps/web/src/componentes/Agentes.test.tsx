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

const manejadores = { alGuardar: vi.fn(), alBorrar: vi.fn(), alRestaurar: vi.fn(), hayProyecto: false };

/** Uno de los que trae xonecode, tal como llega del cable: con su `semilla`. */
const DOCS: AgenteDelCable = {
  nombre: "consultant-xone",
  descripcion: "Responde preguntas técnicas de XOne.",
  motor: "modelo",
  soloLectura: true,
  skills: [],
  instrucciones: "",
  origen: "global",
  semilla: "intacta",
};

/** Cambia de pestaña. Los tuyos no están a la vista al abrir: la primera es la de xonecode. */
const irA = (titulo: "De xonecode" | "Tuyos"): void => {
  fireEvent.click(screen.getByRole("tab", { name: new RegExp(`^${titulo}`) }));
};

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

  it("un motor externo YA puede escribir: la casilla se deja suelta, y se dice qué implica", () => {
    // Estuvo forzada y deshabilitada mientras el servidor rechazaba el fichero de un agente
    // externo que pidiera escribir: dejarla suelta solo habría servido para que guardar
    // fallara con un error que el formulario podía evitar. Los dos motores escriben ya —cada
    // escritura con su diff delante—, así que seguir forzándola escondería la capacidad, que
    // es el otro modo de mentirle a quien rellena el formulario.
    render(<Agentes {...manejadores} agentes={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Nuevo subagente" }));
    fireEvent.change(screen.getByDisplayValue(/Un modelo/), { target: { value: "codex" } });
    const casilla = screen.getByRole("checkbox");
    expect(casilla).toHaveProperty("disabled", false);
    fireEvent.click(casilla);
    expect(casilla).toHaveProperty("checked", false);
    // Y el aviso dice lo que de verdad pasa, que no es «no puede»: es «lo apruebas tú, y las
    // guardas del proyecto siguen puestas».
    expect(screen.getByText(/apruebes/)).not.toBeNull();
  });

  it("y lo que cada motor puede LEER se dice por separado, porque no es lo mismo en los tres", () => {
    // El aviso era uno solo y decía «nunca toca .env»: cierto para escribir, y FALSO para leer
    // en Codex, que lee por la shell de su sandbox. Visto en la pantalla, no en un test.
    render(<Agentes {...manejadores} agentes={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Nuevo subagente" }));
    // El desplegable se coge UNA vez: al cambiar de motor, «Codex» también aparece en el de
    // modelos, y buscarlo por lo que enseña encontraría dos.
    const motor = screen.getByDisplayValue(/Un modelo/);
    fireEvent.change(motor, { target: { value: "codex" } });
    expect(screen.getByText(/leer NO está guardado/)).not.toBeNull();
    fireEvent.change(motor, { target: { value: "opencode" } });
    expect(screen.getByText(/Leer está guardado/)).not.toBeNull();
    fireEvent.change(motor, { target: { value: "claude-code" } });
    expect(screen.getByText(/Leer también está guardado/)).not.toBeNull();
  });

  it("cada motor externo dice QUÉ hace falta para que funcione", () => {
    // No es el mismo requisito y el fallo se parece: Claude Code va por su SDK y Codex por
    // el binario que el usuario tenga instalado. Un especialista al que le falte lo suyo no
    // se monta siquiera —el servidor comprueba `disponible()` antes—, así que esto es lo
    // que explica por qué no aparece.
    render(<Agentes {...manejadores} agentes={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Nuevo subagente" }));
    expect(screen.getByRole("option", { name: /Codex/ }).textContent).toMatch(/tengas instalado/);
    expect(screen.getByRole("option", { name: /Claude Code/ }).textContent).toMatch(/apruebas cada cambio/);
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
    irA("Tuyos");
    // El de la fila lleva el NOMBRE del agente en su etiqueta: son botones de icono y sin
    // ella no tendrían nombre ninguno, y «Eliminar» repetido no distingue cuál es cuál.
    fireEvent.click(screen.getByRole("button", { name: "Eliminar revisor" }));
    expect(alBorrar).not.toHaveBeenCalled();

    // El «Eliminar» a secas es el de la confirmación, que aparece dentro de la fila.
    fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));
    expect(alBorrar).toHaveBeenCalledWith("revisor", "global");
  });

  it("el nombre de uno TUYO se cambia; el de un de serie no, y se dice por qué", () => {
    // Estuvo deshabilitado siempre, con el argumento de que renombrarlo crearía uno nuevo y
    // dejaría el viejo puesto: cierto de la implementación de entonces, no del renombrado —
    // el servidor MUEVE el `.md`. Lo que no cambia es el de un de serie: su nombre es lo que
    // lo ata a la marca de la siembra, que guarda el hash POR NOMBRE.
    render(<Agentes {...manejadores} agentes={[DOCS, REVISOR]} />);
    fireEvent.click(screen.getByRole("button", { name: "Editar consultant-xone" }));
    expect(screen.getByDisplayValue("consultant-xone")).toHaveProperty("disabled", true);
    // Y el motivo va en el rótulo: un campo apagado sin explicación se lee como un fallo.
    expect(screen.getByText(/no se cambia: lo trae xonecode/)).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    irA("Tuyos");
    fireEvent.click(screen.getByRole("button", { name: "Editar revisor" }));
    expect(screen.getByDisplayValue("revisor")).toHaveProperty("disabled", false);
    expect(screen.queryByText(/lo trae xonecode/)).toBeNull();
  });

  it("renombrar manda el nombre de ANTES; guardar sin tocarlo NO lo manda", () => {
    // Es lo único que distingue un renombrado de un guardado, y el servidor no tiene otra
    // forma de saberlo: la lista que tiene delante ya no lleva el nombre viejo.
    const alGuardar = vi.fn();
    render(<Agentes {...manejadores} alGuardar={alGuardar} agentes={[REVISOR]} />);
    irA("Tuyos");

    fireEvent.click(screen.getByRole("button", { name: "Editar revisor" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(alGuardar).toHaveBeenCalledWith(expect.objectContaining({ nombre: "revisor" }), "global", undefined);

    fireEvent.click(screen.getByRole("button", { name: "Editar revisor" }));
    fireEvent.change(screen.getByDisplayValue("revisor"), { target: { value: "segunda-opinion" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(alGuardar).toHaveBeenLastCalledWith(
      expect.objectContaining({ nombre: "segunda-opinion" }),
      "global",
      "revisor"
    );
  });

  /**
   * Un nombre ocupado se EXPLICA en el cliente, porque la negativa del servidor no llega.
   *
   * `informar` escribe en el terminal y en la consola del proyecto abierto, y esta ventana se
   * abre desde el vestíbulo: sin esto, renombrar a un nombre ocupado cerraba el formulario y
   * no pasaba nada. La barrera sigue estando en el servidor (`renombrarAgente` no pisa un
   * destino que exista); esto es lo que convierte un rechazo mudo en una frase.
   */
  it("un nombre YA OCUPADO apaga «Guardar» y dice por qué", () => {
    render(<Agentes {...manejadores} agentes={[DOCS, REVISOR]} />);
    irA("Tuyos");
    fireEvent.click(screen.getByRole("button", { name: "Editar revisor" }));
    fireEvent.change(screen.getByLabelText(/^Nombre/), { target: { value: "consultant-xone" } });

    expect(screen.getByText(/Ya hay un subagente que se llama/)).not.toBeNull();
    expect(screen.getByRole("button", { name: "Guardar" })).toHaveProperty("disabled", true);
  });

  /**
   * El nombre es un slug, y la copia declarada de esa regla vive aquí por la frontera: el
   * cliente no puede importar de `src/`. Quien manda es el servidor, que la vuelve a aplicar;
   * esto convierte un rechazo mudo en una frase, porque `informar` no llega al navegador
   * desde el vestíbulo.
   */
  it("un nombre con MAYÚSCULAS apaga «Guardar» y propone el que valdría", () => {
    const alGuardar = vi.fn();
    render(<Agentes {...manejadores} alGuardar={alGuardar} agentes={[REVISOR]} />);
    irA("Tuyos");
    fireEvent.click(screen.getByRole("button", { name: "Editar revisor" }));
    fireEvent.change(screen.getByLabelText(/^Nombre/), { target: { value: "Documentador" } });

    expect(screen.getByText(/no puede llevar mayúsculas/)).not.toBeNull();
    // Y la propuesta, que es lo que hace el aviso obedecible.
    expect(screen.getByText(/«documentador»/)).not.toBeNull();
    expect(screen.getByRole("button", { name: "Guardar" })).toHaveProperty("disabled", true);
  });

  it("y lo demás que no es un slug: espacios, acentos, guion al borde", () => {
    render(<Agentes {...manejadores} agentes={[REVISOR]} />);
    irA("Tuyos");
    fireEvent.click(screen.getByRole("button", { name: "Editar revisor" }));
    for (const malo of ["mi agente", "diseñador", "-x", "a--b", "mi_agente"]) {
      fireEvent.change(screen.getByLabelText(/^Nombre/), { target: { value: malo } });
      expect(screen.getByRole("button", { name: "Guardar" })).toHaveProperty("disabled", true);
    }
    // Y uno bueno lo vuelve a encender: el aviso no se queda pegado.
    fireEvent.change(screen.getByLabelText(/^Nombre/), { target: { value: "mi-agente" } });
    expect(screen.getByRole("button", { name: "Guardar" })).toHaveProperty("disabled", false);
  });

  it("su PROPIO nombre no cuenta como ocupado: editar sin renombrar tiene que poder guardar", () => {
    render(<Agentes {...manejadores} agentes={[DOCS, REVISOR]} />);
    irA("Tuyos");
    fireEvent.click(screen.getByRole("button", { name: "Editar revisor" }));
    expect(screen.getByRole("button", { name: "Guardar" })).toHaveProperty("disabled", false);
    expect(screen.queryByText(/Ya hay un subagente/)).toBeNull();
  });

  it("y al CREAR también, que ese agujero ya estaba: un `consultant-xone` nuevo pisaba el sembrado", () => {
    // `guardarAgente` escribe sin mirar, así que dar de alta uno llamado igual que un de
    // serie se llevaba su `.md` por delante en silencio.
    render(<Agentes {...manejadores} agentes={[DOCS]} />);
    irA("Tuyos");
    fireEvent.click(screen.getByRole("button", { name: "Nuevo subagente" }));
    fireEvent.change(screen.getByLabelText(/^Nombre/), { target: { value: "consultant-xone" } });
    fireEvent.change(screen.getByLabelText(/^Cuándo usarlo/), { target: { value: "el mío" } });

    expect(screen.getByRole("button", { name: "Guardar" })).toHaveProperty("disabled", true);
  });

  it("al CREAR no se manda nombre de antes: no hay nada de lo que renombrar", () => {
    // El estado del formulario se reusa entre editar y crear, así que sin limpiarlo un alta
    // después de editar mandaría un renombrado del agente anterior — y el servidor movería
    // un fichero que nadie pidió mover.
    const alGuardar = vi.fn();
    render(<Agentes {...manejadores} alGuardar={alGuardar} agentes={[REVISOR]} />);
    irA("Tuyos");
    fireEvent.click(screen.getByRole("button", { name: "Editar revisor" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    fireEvent.click(screen.getByRole("button", { name: "Nuevo subagente" }));
    fireEvent.change(screen.getByLabelText(/^Nombre/), { target: { value: "otro" } });
    fireEvent.change(screen.getByLabelText(/^Cuándo usarlo/), { target: { value: "para otra cosa" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(alGuardar).toHaveBeenCalledWith(expect.objectContaining({ nombre: "otro" }), "global", undefined);
  });

  it("guardar manda el ámbito del que ya estaba, no el que hubiera por defecto", () => {
    // Editar un agente de proyecto y que se guardara como global lo duplicaría: quedarían
    // dos ficheros con el mismo nombre y ganaría el de proyecto, o sea el viejo — el cambio
    // parecería no haberse aplicado.
    const alGuardar = vi.fn();
    render(
      <Agentes {...manejadores} hayProyecto alGuardar={alGuardar} agentes={[{ ...REVISOR, origen: "proyecto" }]} />
    );
    irA("Tuyos");
    fireEvent.click(screen.getByRole("button", { name: "Editar revisor" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    // El tercer argumento es el nombre de ANTES, y aquí va AUSENTE: no se ha renombrado.
    expect(alGuardar).toHaveBeenCalledWith(
      expect.objectContaining({ nombre: "revisor" }),
      "proyecto",
      undefined
    );
  });
});

describe("Agentes: crear está a la vista", () => {
  it("«Nuevo subagente» va ENCIMA de la lista, no detrás de ella", () => {
    render(<Agentes {...manejadores} agentes={[REVISOR]} />);
    irA("Tuyos");
    const boton = screen.getByRole("button", { name: "Nuevo subagente" });
    const fila = screen.getByText("revisor");
    // `compareDocumentPosition`: FOLLOWING = 4 significa que `fila` viene después de `boton`.
    expect(boton.compareDocumentPosition(fila) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  /**
   * Y vive en la pestaña de LOS TUYOS, porque un subagente nuevo siempre lo es: no hay forma
   * de escribir uno «de xonecode» —eso lo decide la siembra—, así que encima de las dos
   * pestañas ofrecía una acción sobre un grupo donde no cabe.
   */
  it("no está en la pestaña de xonecode: ahí no se puede crear nada", () => {
    render(<Agentes {...manejadores} agentes={[DOCS, REVISOR]} />);
    expect(screen.queryByRole("button", { name: "Nuevo subagente" })).toBeNull();
    irA("Tuyos");
    expect(screen.getByRole("button", { name: "Nuevo subagente" })).not.toBeNull();
  });

  it("sin NINGÚN subagente sí está a la vista: es el único sitio donde crear el primero", () => {
    // Ahí no hay pestañas que pintar, así que el botón va con el aviso de que no hay ninguno.
    render(<Agentes {...manejadores} agentes={[]} />);
    expect(screen.queryByRole("tab")).toBeNull();
    expect(screen.getByRole("button", { name: "Nuevo subagente" })).not.toBeNull();
  });
});

/**
 * Los dos grupos, y la única diferencia real entre ellos: qué se puede hacer con la fila.
 *
 * Todo esto se apoya en `semilla`, que es el campo que el servidor calcula
 * (`agentesEnDisco.ts#marcarSemilla`) y que la lista blanca del store puede tragarse sin dar
 * error — de ahí que se pruebe por su EFECTO en la pantalla y no por el dato.
 */
describe("Agentes: los que trae xonecode y los tuyos", () => {
  it("se reparten en dos pestañas, y los reparte `semilla` y no la carpeta", () => {
    // Los dos son `origen: "global"`, que es justo el caso que la pastilla GLOBAL no
    // distinguía: vivir en la carpeta global no dice de quién es el fichero.
    render(<Agentes {...manejadores} agentes={[DOCS, REVISOR]} />);
    // La cuenta va en la pestaña para no tener que abrirla, así que el nombre accesible la
    // lleva detrás: se busca por el principio.
    expect(screen.getByRole("tab", { name: /^De xonecode/ }).textContent).toContain("1");
    expect(screen.getByRole("tab", { name: /^Tuyos/ }).textContent).toContain("1");
    // Y solo se pinta la lista de la pestaña abierta, que es la primera.
    expect(screen.getByText("consultant-xone")).not.toBeNull();
    expect(screen.queryByText("revisor")).toBeNull();
  });

  it("las DOS pestañas están siempre, también la vacía, y la vacía lo dice con palabras", () => {
    // Esconderla dejaría a quien no ha creado ninguno sin saber dónde van a aparecer los
    // suyos. Misma regla que las pestañas de Entornos: el rótulo contesta «¿de quién es
    // esto?». Lo condicional es la CUENTA: un cero no se pinta.
    render(<Agentes {...manejadores} agentes={[DOCS]} />);
    const tuyos = screen.getByRole("tab", { name: /^Tuyos/ });
    expect(tuyos).not.toBeNull();
    expect(tuyos.textContent).toBe("Tuyos");

    irA("Tuyos");
    expect(screen.getByText(/No has creado ninguno/)).not.toBeNull();
  });

  /**
   * La regla que da sentido a todo lo demás.
   *
   * Borrar uno de serie no devolvía el de serie: la marca de la siembra recuerda que se
   * entregó, así que `sembrarAgentes` no lo resiembra — era perderlo para siempre detrás de
   * un icono que parece reversible. Y la negativa no vive solo aquí: el servidor rechaza el
   * mensaje igualmente, porque esconder un icono es presentación.
   */
  it("un de serie no lleva papelera; uno tuyo sí", () => {
    render(<Agentes {...manejadores} agentes={[DOCS, REVISOR]} />);
    expect(screen.queryByRole("button", { name: "Eliminar consultant-xone" })).toBeNull();
    irA("Tuyos");
    expect(screen.getByRole("button", { name: "Eliminar revisor" })).not.toBeNull();
  });

  it("un de serie INTACTO no ofrece restaurar: no hay nada que restaurar", () => {
    // Un control sin dato detrás no se pinta. Y aquí además mentiría: sugeriría que el
    // fichero está distinto de como lo entregamos.
    render(<Agentes {...manejadores} agentes={[DOCS]} />);
    expect(screen.queryByRole("button", { name: "Restaurar el de serie" })).toBeNull();
  });

  it("uno EDITADO lo dice con su consecuencia, y ofrece restaurarlo", () => {
    // La frase es la que estaba en la caja roja de arriba, junto a los `.md` que no cargan:
    // en rojo y con `role="alert"` sobre un agente que está perfectamente. Y dice lo que se
    // pierde de verdad —las mejoras que publiquemos ya no llegan—, no «no es el de serie».
    render(<Agentes {...manejadores} agentes={[{ ...DOCS, semilla: "modificada" }]} />);
    expect(screen.getByText(/las mejoras que publiquemos/)).not.toBeNull();
    expect(screen.getByRole("button", { name: "Restaurar el de serie" })).not.toBeNull();
    // Y no por la caja de problemas: ese canal vuelve a ser solo «este fichero no carga».
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("restaurar se confirma: pisa un prompt afinado a mano y eso no vuelve", () => {
    const alRestaurar = vi.fn();
    render(
      <Agentes {...manejadores} alRestaurar={alRestaurar} agentes={[{ ...DOCS, semilla: "modificada" }]} />
    );
    fireEvent.click(screen.getByRole("button", { name: "Restaurar el de serie" }));
    expect(alRestaurar).not.toHaveBeenCalled();

    expect(screen.getByText(/Lo que hayas escrito no vuelve/)).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Restaurar" }));
    // Sin ámbito: la siembra solo escribe en el global, así que no hay dos sitios que elegir.
    expect(alRestaurar).toHaveBeenCalledWith("consultant-xone");
  });

  /**
   * El patrón de fallo de este repo, en su versión de props: la fila se extrajo para que los
   * dos grupos pinten la misma, y un manejador sin cablear se queda con todo en verde
   * (`filaDeTarea`, el prop de las pestañas por entorno). Así que se prueba en LOS DOS.
   */
  it("las acciones están cableadas en los dos grupos, no solo en uno", () => {
    const alBorrar = vi.fn();
    const alRestaurar = vi.fn();
    render(
      <Agentes
        {...manejadores}
        alBorrar={alBorrar}
        alRestaurar={alRestaurar}
        agentes={[{ ...DOCS, semilla: "modificada" }, REVISOR]}
      />
    );
    // La pestaña de xonecode: editar, y la restauración.
    fireEvent.click(screen.getByRole("button", { name: "Editar consultant-xone" }));
    expect(screen.getByDisplayValue("consultant-xone")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    fireEvent.click(screen.getByRole("button", { name: "Restaurar el de serie" }));
    fireEvent.click(screen.getByRole("button", { name: "Restaurar" }));
    expect(alRestaurar).toHaveBeenCalledWith("consultant-xone");

    // La de los tuyos: editar, y el borrado.
    irA("Tuyos");
    fireEvent.click(screen.getByRole("button", { name: "Editar revisor" }));
    expect(screen.getByDisplayValue("revisor")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    fireEvent.click(screen.getByRole("button", { name: "Eliminar revisor" }));
    fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));
    expect(alBorrar).toHaveBeenCalledWith("revisor", "global");
  });

  it("cambiar de pestaña CIERRA la confirmación abierta", () => {
    // Si no, volver a la otra pestaña enseñaría un botón rojo armado sobre una fila que el
    // usuario dejó de mirar hace dos clics — y con el mismo aspecto que el de al lado, que
    // hace otra cosa.
    render(<Agentes {...manejadores} agentes={[{ ...DOCS, semilla: "modificada" }, REVISOR]} />);
    fireEvent.click(screen.getByRole("button", { name: "Restaurar el de serie" }));
    expect(screen.getByRole("button", { name: "Restaurar" })).not.toBeNull();

    irA("Tuyos");
    irA("De xonecode");
    expect(screen.queryByRole("button", { name: "Restaurar" })).toBeNull();
    // Y sigue ofreciéndose, claro: lo que se cerró es la confirmación, no la acción.
    expect(screen.getByRole("button", { name: "Restaurar el de serie" })).not.toBeNull();
  });
});
