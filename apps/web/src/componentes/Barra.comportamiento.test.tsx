import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { Barra } from "./Barra.js";

afterEach(cleanup);

/**
 * El comportamiento de `Barra` en sí —`Barra.test.tsx` es la disciplina de estilos
 * compartida por TODOS los `.module.css` del directorio, no un test de este componente—.
 *
 * Los tres niveles pueden llegar vacíos (`entornos`/`proyectos` SÍ llegan poblados desde
 * `App.tsx` cuando hay algo que contar — `sesiones` de cada proyecto sigue vacía siempre,
 * ver el comentario de cabecera de `Barra.tsx`), y cada nivel tiene que decir por qué en
 * vez de no pintar nada — que es indistinguible de una barra rota.
 */
describe("Barra: los tres niveles vacíos se explican solos", () => {
  function montar(
    proyectos: Parameters<typeof Barra>[0]["proyectos"] = [],
    visibles?: readonly string[]
  ) {
    return render(
      <Barra
        entornos={[]}
        entornoActivo=""
        proyectos={proyectos}
        {...(visibles === undefined ? {} : { visibles })}
        alElegirEntorno={() => {}}
        alAbrirSesion={() => {}}
        alAbrirProyecto={() => {}}
        alNuevaSesion={() => {}}
        alAccionDeSesion={() => {}}
        alAbrirAjustes={() => {}}
      />
    );
  }

  it("sin entornos no hay `<select>` desnudo: hay un texto que dice por qué", () => {
    montar();
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.getByText(/sin entorno que enseñar/i)).toBeTruthy();
  });

  it("sin proyectos, lo mismo en su nivel", () => {
    montar();
    expect(screen.getByText(/sin proyectos que enseñar/i)).toBeTruthy();
  });

  it("un proyecto sin sesiones lo dice EN su propia fila, no calla", () => {
    montar([{ id: "p1", nombre: "harnees", sesiones: [] }]);
    expect(screen.getByText("harnees")).toBeTruthy();
    expect(screen.getByText(/sin sesiones todavía/i)).toBeTruthy();
  });

  /**
   * Un CloudStudio con doscientos proyectos no cabe en una barra lateral. Cuatro es la
   * omisión —lo que se ve sin configurar nada—, y lo que no se ve se DICE: callarlo dejaría
   * creer que el entorno solo tiene cuatro.
   */
  it("por omisión enseña cuatro y cuenta los que faltan, con dónde se arregla", () => {
    const seis = Array.from({ length: 6 }, (_, i) => ({ id: `p${i}`, nombre: `Proyecto ${i}`, sesiones: [] }));
    montar(seis);
    expect(screen.getByText("Proyecto 0")).toBeTruthy();
    expect(screen.getByText("Proyecto 3")).toBeTruthy();
    expect(screen.queryByText("Proyecto 4")).toBeNull();
    expect(screen.getByText(/2 proyectos más sin enseñar/i).textContent).toMatch(/ajustes/i);
  });

  it("una elección MANDA sobre el tope: quien pide seis, ve seis", () => {
    const seis = Array.from({ length: 6 }, (_, i) => ({ id: `p${i}`, nombre: `Proyecto ${i}`, sesiones: [] }));
    montar(seis, seis.map((p) => p.id));
    expect(screen.getByText("Proyecto 5")).toBeTruthy();
    expect(screen.queryByText(/más sin enseñar/i)).toBeNull();
  });

  it("elegir NINGUNO es una elección y se respeta, sin confundirla con no haber elegido", () => {
    const dos = [
      { id: "p0", nombre: "Uno", sesiones: [] },
      { id: "p1", nombre: "Dos", sesiones: [] },
    ];
    montar(dos, []);
    expect(screen.queryByText("Uno")).toBeNull();
    // Y el texto NO es «sin proyectos que enseñar»: los hay, no se están enseñando.
    expect(screen.getByText(/ninguno elegido para esta barra/i)).toBeTruthy();
  });

  it("el orden lo pone el listado del servidor, no el orden en que se marcaron", () => {
    const tres = [
      { id: "a", nombre: "Alfa", sesiones: [] },
      { id: "b", nombre: "Beta", sesiones: [] },
      { id: "c", nombre: "Gamma", sesiones: [] },
    ];
    const { container } = montar(tres, ["c", "a"]);
    const nombres = [...container.querySelectorAll("button")]
      .map((b) => b.textContent)
      .filter((t) => t === "Alfa" || t === "Gamma");
    expect(nombres).toEqual(["Alfa", "Gamma"]);
  });

  /**
   * Una fila resaltada AFIRMA «aquí es donde estás». Sin el dato del servidor no se marca
   * nada: marcar el primero por no tenerlo sería afirmarlo sin saberlo.
   */
  it("el proyecto abierto se distingue, y sin saber cuál es no se marca ninguno", () => {
    const dos = [
      { id: "p1", nombre: "Tienda", sesiones: [] },
      { id: "p2", nombre: "Almacén", sesiones: [] },
    ];
    const { container, rerender } = montar(dos);
    expect(container.querySelectorAll("[aria-current]")).toHaveLength(0);

    rerender(
      <Barra
        entornos={[]}
        entornoActivo=""
        proyectos={dos}
        proyectoActivo="p2"
        alElegirEntorno={() => {}}
        alAbrirSesion={() => {}}
        alAbrirProyecto={() => {}}
        alNuevaSesion={() => {}}
        alAccionDeSesion={() => {}}
        alAbrirAjustes={() => {}}
      />
    );
    const marcadas = [...container.querySelectorAll("[aria-current]")];
    expect(marcadas).toHaveLength(1);
    expect(marcadas[0]!.textContent).toContain("Almacén");
  });

  it("«nueva sesión» viaja con el id del proyecto de su propia fila", () => {
    const alNuevaSesion = vi.fn();
    render(
      <Barra
        entornos={[]}
        entornoActivo=""
        proyectos={[{ id: "p1", nombre: "harnees", sesiones: [] }]}
        alElegirEntorno={() => {}}
        alAbrirSesion={() => {}}
        alAbrirProyecto={() => {}}
        alNuevaSesion={alNuevaSesion}
        alAbrirAjustes={() => {}}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /nueva sesión en harnees/i }));
    expect(alNuevaSesion).toHaveBeenCalledWith("p1");
  });

  it("el nombre del proyecto ES el botón que lo abre: viaja con SU id, no el del primero de la lista", () => {
    const alAbrirProyecto = vi.fn();
    render(
      <Barra
        entornos={[]}
        entornoActivo=""
        proyectos={[
          { id: "p1", nombre: "harnees", sesiones: [] },
          { id: "p2", nombre: "tienda", sesiones: [] },
        ]}
        alElegirEntorno={() => {}}
        alAbrirSesion={() => {}}
        alAbrirProyecto={alAbrirProyecto}
        alNuevaSesion={() => {}}
        alAccionDeSesion={() => {}}
        alAbrirAjustes={() => {}}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "tienda" }));
    expect(alAbrirProyecto).toHaveBeenCalledWith("p2");
    expect(alAbrirProyecto).not.toHaveBeenCalledWith("p1");
  });

  it("«Ajustes» es una ENTRADA de verdad, no un rótulo: se pulsa y avisa", () => {
    // Cambio de rumbo del usuario: antes el pie eran dos líneas de texto suelto
    // («/config y /modelo, desde el compositor»), que se leían como una nota al pie y no
    // como algo que se pueda pulsar. Ahora ocupa el mismo asiento que el «Settings» de
    // la referencia (`estilos/SettingsRoot.module.css`) y es un botón. Que un botón
    // exista no basta: este test exige que LLAME a alguien — un botón que no hace nada
    // es el fallo mudo que este repo persigue.
    const alAbrirAjustes = vi.fn();
    render(
      <Barra
        entornos={[]}
        entornoActivo=""
        proyectos={[]}
        alElegirEntorno={() => {}}
        alAbrirSesion={() => {}}
        alAbrirProyecto={() => {}}
        alNuevaSesion={() => {}}
        alAbrirAjustes={alAbrirAjustes}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Ajustes" }));
    expect(alAbrirAjustes).toHaveBeenCalledTimes(1);
  });

  it("con entorno y proyecto reales, el select y la lista de sesiones siguen ahí", () => {
    render(
      <Barra
        entornos={[{ id: "e1", nombre: "XOne WebStudio" }]}
        entornoActivo="e1"
        proyectos={[{ id: "p1", nombre: "harnees", sesiones: [{ id: "s1", titulo: "Hola", historica: false }] }]}
        sesionActiva="s1"
        alElegirEntorno={() => {}}
        alAbrirSesion={() => {}}
        alAbrirProyecto={() => {}}
        alNuevaSesion={() => {}}
        alAccionDeSesion={() => {}}
        alAbrirAjustes={() => {}}
      />
    );
    expect(screen.getByRole("combobox")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Hola" })).toBeTruthy();
  });
});

describe("el «…» de una sesión", () => {
  const PROYECTO = [
    { id: "p1", nombre: "AppDemo", sesiones: [{ id: "s1", titulo: "arregla el login", historica: true }] },
  ];

  function montarConSesion(alAccion = () => {}) {
    return render(
      <Barra
        entornos={[]}
        entornoActivo=""
        proyectos={PROYECTO}
        alElegirEntorno={() => {}}
        alAbrirSesion={() => {}}
        alAbrirProyecto={() => {}}
        alNuevaSesion={() => {}}
        alAccionDeSesion={alAccion}
        alAbrirAjustes={() => {}}
      />
    );
  }

  /**
   * Tres «…» idénticos en tres filas son indistinguibles para quien navega con lector de
   * pantalla: cada uno tiene que decir de QUÉ sesión es.
   */
  it("el disparador se nombra por su sesión, no «…» a secas", () => {
    montarConSesion();
    expect(screen.getByRole("button", { name: /opciones de «arregla el login»/i })).toBeTruthy();
  });

  it("cerrado no hay menú; abierto salen las dos acciones", () => {
    montarConSesion();
    expect(screen.queryByRole("menu")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /opciones de/i }));
    expect(screen.getByRole("menuitem", { name: /renombrar/i })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: /eliminar/i })).toBeTruthy();
  });

  /**
   * Las dos que el harness de deepseek sí tiene y aquí no están: bifurcar, que desde que el
   * hilo se guarda sí significaría algo pero no está implementada, y archivar, que es un
   * estado que no existe — sería «desaparecer», o sea borrar sin decirlo.
   */
  it("no ofrece bifurcar ni archivar: ninguna de las dos está detrás", () => {
    montarConSesion();
    fireEvent.click(screen.getByRole("button", { name: /opciones de/i }));
    expect(screen.queryByRole("menuitem", { name: /bifurcar|fork/i })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: /archivar|archive/i })).toBeNull();
  });

  /**
   * La barra REPORTA la intención, no ejecuta: las dos escriben en el índice del proyecto y
   * una es irreversible, así que quien las confirma es la ventana de `App.tsx`. Si la barra
   * mandara el mensaje, eliminar sería un clic sin vuelta atrás en una fila de 34 píxeles.
   */
  it("elegir «Eliminar» reporta la intención con su sesión, y cierra el menú", () => {
    const elegido: unknown[] = [];
    montarConSesion(((...args: unknown[]) => elegido.push(args)) as () => void);
    fireEvent.click(screen.getByRole("button", { name: /opciones de/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /eliminar/i }));
    expect(elegido).toEqual([["p1", "s1", "arregla el login", "borrar"]]);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("Escape cierra el menú sin elegir nada", () => {
    const elegido: unknown[] = [];
    montarConSesion(((...args: unknown[]) => elegido.push(args)) as () => void);
    fireEvent.click(screen.getByRole("button", { name: /opciones de/i }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(elegido).toEqual([]);
  });

  /**
   * Un `<button>` dentro de otro `<button>` es HTML inválido y el clic se reparte entre los
   * dos: pulsar el «…» abriría además la sesión. La fila tiene que ser un contenedor con
   * dos botones HERMANOS, como ya lo es la de proyecto.
   */
  it("el «…» no está anidado dentro del botón que abre la sesión", () => {
    const { container } = montarConSesion();
    expect(container.querySelector("button button")).toBeNull();
  });
});

describe("propios y compartidos", () => {
  function montar(proyectos: Parameters<typeof Barra>[0]["proyectos"]) {
    return render(
      <Barra
        entornos={[]}
        entornoActivo=""
        proyectos={proyectos}
        alElegirEntorno={() => {}}
        alAbrirSesion={() => {}}
        alAbrirProyecto={() => {}}
        alNuevaSesion={() => {}}
        alAccionDeSesion={() => {}}
        alAbrirAjustes={() => {}}
      />
    );
  }

  it("lo compartido y lo propio se dicen con una PALABRA, no solo con un color", () => {
    montar([
      { id: "p1", nombre: "Mío", sesiones: [], compartido: false },
      { id: "p2", nombre: "De otro", sesiones: [], compartido: true },
    ]);
    expect(screen.getByText("propio")).toBeTruthy();
    expect(screen.getByText("compartido")).toBeTruthy();
  });

  /**
   * EL caso que importa: un servidor que no manda `shared` (un CloudStudio anterior) no
   * puede acabar con todos los proyectos etiquetados «propio». Ausente es «no lo sé», y lo
   * único honesto es no pintar ninguna de las dos — la misma postura que el punto de
   * credencial de `PastillaDeModelo` o el `via` de la pestaña de ficheros.
   */
  it("sin el dato no se pinta NINGUNA de las dos: «no lo dijo» no es «es tuyo»", () => {
    montar([{ id: "p1", nombre: "Sin dato", sesiones: [] }]);
    expect(screen.queryByText("propio")).toBeNull();
    expect(screen.queryByText("compartido")).toBeNull();
  });
});

describe("la sesión abierta se distingue de la que tienes bajo el ratón", () => {
  const PROYECTOS = [
    {
      id: "p1",
      nombre: "AppDemo",
      sesiones: [
        { id: "s1", titulo: "la abierta", historica: true },
        { id: "s2", titulo: "otra", historica: true },
      ],
    },
  ];

  function montar(sesionActiva?: string) {
    return render(
      <Barra
        entornos={[]}
        entornoActivo=""
        proyectos={PROYECTOS}
        {...(sesionActiva === undefined ? {} : { sesionActiva })}
        alElegirEntorno={() => {}}
        alAbrirSesion={() => {}}
        alAbrirProyecto={() => {}}
        alNuevaSesion={() => {}}
        alAccionDeSesion={() => {}}
        alAbrirAjustes={() => {}}
      />
    );
  }

  /**
   * `filas.selected` de la hoja copiada pinta el MISMO fondo que `:hover`, así que la sesión
   * abierta y la fila que tienes debajo del ratón se veían idénticas. Se marca con dos
   * señales, como el proyecto abierto: el fondo con su acento, y `aria-current` para quien
   * no distingue el color o no lo ve.
   */
  it("la abierta lleva `aria-current`; las demás no", () => {
    const { container } = montar("s1");
    const marcadas = [...container.querySelectorAll("[aria-current]")];
    const titulos = marcadas.map((n) => n.textContent);
    expect(titulos.some((t) => t?.includes("la abierta"))).toBe(true);
    expect(titulos.some((t) => t?.includes("otra"))).toBe(false);
  });

  /**
   * Sin el dato del servidor no se marca NADA: marcar la primera por no tenerlo afirmaría
   * «aquí estás» sin saberlo. Misma postura que con el proyecto activo.
   */
  it("sin `sesionActiva` no se marca ninguna", () => {
    const { container } = montar();
    expect(container.querySelector("[aria-current]")).toBeNull();
  });
});

describe("Barra: sin conexión", () => {
  it("apaga el entorno, el proyecto, el «+» y la sesión, y quita el «…»; Ajustes se queda", () => {
    render(
      <Barra
        conectado={false}
        entornos={[{ id: "e1", nombre: "E", url: "https://e" }]}
        entornoActivo="e1"
        proyectos={[{ id: "p1", nombre: "Tienda", sesiones: [{ id: "s1", titulo: "Hola", historica: true }] }]}
        alElegirEntorno={() => {}}
        alAbrirSesion={() => {}}
        alAbrirProyecto={() => {}}
        alNuevaSesion={() => {}}
        alAccionDeSesion={() => {}}
        alAbrirAjustes={() => {}}
      />
    );
    expect(screen.getByRole("combobox")).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: /^Tienda/ })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: /nueva sesión en Tienda/ })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Hola" })).toHaveProperty("disabled", true);
    expect(screen.queryByRole("button", { name: /opciones de/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Ajustes" })).toHaveProperty("disabled", false);
  });
});

describe("Barra: el orden de las sesiones", () => {
  it("las más recientes arriba, el mismo orden que el escritorio", () => {
    render(
      <Barra
        entornos={[]}
        entornoActivo=""
        proyectos={[{ id: "p1", nombre: "Tienda", sesiones: [
          { id: "s1", titulo: "la primera", historica: true },
          { id: "s2", titulo: "la última", historica: true },
        ] }]}
        alElegirEntorno={() => {}}
        alAbrirSesion={() => {}}
        alAbrirProyecto={() => {}}
        alNuevaSesion={() => {}}
        alAccionDeSesion={() => {}}
        alAbrirAjustes={() => {}}
      />
    );
    const botones = screen.getAllByRole("button").map((b) => b.textContent);
    expect(botones.indexOf("la última")).toBeLessThan(botones.indexOf("la primera"));
  });
});

/**
 * Una tarea de fondo abre su PROPIA sesión, y esa sesión entra en el mismo índice del
 * proyecto: medido en el proyecto real del usuario, la conversación de la tarea de ayer
 * está en la barra como una fila más y encima EN BLANCO —el título sale del primer acto de
 * `usuario` y una tarea no manda ninguno—. Una sola lista, con los ítems distinguidos.
 */
describe("Barra: chats y tareas en la misma lista, distinguidos", () => {
  const SESIONES = [
    { id: "s7", titulo: "arreglar el alta", ultimoTurno: "2026-09-07T10:08:23.790Z" },
    { id: "s9", titulo: "", ultimoTurno: "2026-09-09T06:23:12.784Z", deTarea: true as const },
  ];

  function montar(sesiones: Parameters<typeof Barra>[0]["proyectos"][number]["sesiones"] = SESIONES) {
    return render(
      <Barra
        entornos={[]}
        entornoActivo=""
        proyectos={[{ id: "p1", nombre: "AppDemo", sesiones }]}
        alElegirEntorno={() => {}}
        alAbrirSesion={() => {}}
        alAbrirProyecto={() => {}}
        alNuevaSesion={() => {}}
        alAccionDeSesion={() => {}}
        alAbrirAjustes={() => {}}
      />
    );
  }

  it("ordena por `ultimoTurno`, no por orden de creación", () => {
    // Antes era `[...sesiones].reverse()`, o sea el orden de alta del índice al revés: una
    // conversación vieja que reabriste hoy se quedaba abajo del todo.
    montar();
    // Solo los botones con texto: el «…» de cada fila también es un botón, y su nombre
    // accesible lleva el título de la sesión dentro.
    const titulos = screen.getAllByRole("button").map((b) => b.textContent ?? "").filter((t) => t !== "");
    expect(titulos.findIndex((t) => t.includes("Tarea de fondo"))).toBeLessThan(
      titulos.findIndex((t) => t.includes("arreglar el alta"))
    );
  });

  it("la de una tarea lo dice con PALABRAS, no solo con un color", () => {
    montar();
    expect(screen.getByText("Tarea")).toBeTruthy();
  });

  it("y si no tiene título dice qué es, en vez de dejar la fila en blanco", () => {
    // No se inventa un título: se rotula lo que falta, que es distinto.
    montar();
    expect(screen.getByText("Tarea de fondo")).toBeTruthy();
  });

  it("una fila SIN título tampoco se queda en blanco cuando no consta de quién es", () => {
    // Es el caso de las sesiones de tarea de antes de la marca: no llevan `deTarea`, así
    // que se pintan lisas —lo conservador—, pero una fila vacía no se puede ni leer ni
    // pulsar con criterio. Se rotula lo que falta sin decir de quién es.
    montar([{ id: "vieja", titulo: "", ultimoTurno: "2026-09-09T06:23:12.784Z" }]);
    expect(screen.getByText("Sin título")).toBeTruthy();
    expect(screen.queryByText("Tarea")).toBeNull();
  });

  it("cada fila lleva su fecha y su hora", () => {
    montar();
    expect(screen.getByText("7 sept 12:08")).toBeTruthy();
    expect(screen.getByText("9 sept 08:23")).toBeTruthy();
  });

  it("sin `ultimoTurno` no se inventa una fecha, y esa fila va la última", () => {
    montar([
      { id: "sin", titulo: "de antes" },
      { id: "s7", titulo: "arreglar el alta", ultimoTurno: "2026-09-07T10:08:23.790Z" },
    ]);
    const titulos = screen.getAllByRole("button").map((b) => b.textContent ?? "").filter((t) => t !== "");
    const sinFecha = titulos.find((t) => t.includes("de antes")) ?? "";
    expect(titulos.findIndex((t) => t.includes("arreglar el alta"))).toBeLessThan(
      titulos.findIndex((t) => t.includes("de antes"))
    );
    expect(sinFecha).not.toMatch(/\d{2}:\d{2}/);
  });
});
