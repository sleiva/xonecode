// Desde la revisión de interfaz los proveedores son `menuitem` y los modelos
// `menuitemradio`: las flechas del teclado no navegaban una lista de botones.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PastillaDeModelo } from "./PastillaDeModelo.js";

const PROVEEDORES = [
  { id: "ollama", nombre: "Ollama", credencial: "nativa" as const },
  { id: "anthropic", nombre: "Anthropic", credencial: "puesta" as const },
  { id: "openai", nombre: "OpenAI", credencial: "falta" as const },
];

describe("PastillaDeModelo", () => {
  // Un test que falla no llega a su `cleanup()`, y el siguiente encuentra DOS menús: el
  // fallo real queda enterrado bajo un «found multiple elements» que no es el problema.
  afterEach(cleanup);

  it("sin modelo en vigor NO inventa uno: dice que hay que elegirlo", () => {
    render(
      <PastillaDeModelo proveedores={PROVEEDORES} alPedirCatalogo={() => {}} alElegir={() => {}} />
    );
    expect(screen.getByRole("button", { name: /elige modelo/i })).toBeTruthy();
  });

  it("con modelo en vigor lo pinta tal cual lo dice el servidor", () => {
    render(
      <PastillaDeModelo
        actual="anthropic/claude-x"
        proveedores={PROVEEDORES}
        alPedirCatalogo={() => {}}
        alElegir={() => {}}
      />
    );
    expect(screen.getByRole("button", { name: "anthropic/claude-x" })).toBeTruthy();
  });

  /**
   * El catálogo es una llamada de red por proveedor: se pide al desplegarlo y no al
   * pintar el menú, que si no serían cinco peticiones para un menú que quizá nadie abra.
   */
  it("desplegar un proveedor pide SU catálogo, una vez, y mientras tanto lo dice", () => {
    const alPedirCatalogo = vi.fn();
    render(
      <PastillaDeModelo proveedores={PROVEEDORES} alPedirCatalogo={alPedirCatalogo} alElegir={() => {}} />
    );
    fireEvent.click(screen.getByRole("button", { name: /elige modelo/i }));
    expect(alPedirCatalogo).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("menuitem", { name: /Anthropic/i }));
    expect(alPedirCatalogo).toHaveBeenCalledWith("anthropic");
    expect(screen.getByText(/consultando/i)).toBeTruthy();
    // Cerrar y volver a abrir no lo vuelve a pedir: el servidor ya lo tiene cacheado.
    fireEvent.click(screen.getByRole("menuitem", { name: /Anthropic/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Anthropic/i }));
    expect(alPedirCatalogo).toHaveBeenCalledTimes(1);
  });

  /**
   * Un menú que solo se cierra volviendo a pulsar su disparador tapa lo de debajo —vive en
   * la fila del compositor, justo encima de lo que se escribe— y no es lo que hace ningún
   * menú.
   */
  it("pinchar fuera lo cierra, y Escape también", () => {
    render(
      <PastillaDeModelo proveedores={PROVEEDORES} alPedirCatalogo={() => {}} alElegir={() => {}} />
    );
    fireEvent.click(screen.getByRole("button", { name: /elige modelo/i }));
    expect(screen.getByRole("menu")).toBeTruthy();

    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("menu")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /elige modelo/i }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("pinchar DENTRO no lo cierra: elegir proveedor es usarlo, no salirse", () => {
    render(
      <PastillaDeModelo proveedores={PROVEEDORES} alPedirCatalogo={() => {}} alElegir={() => {}} />
    );
    fireEvent.click(screen.getByRole("button", { name: /elige modelo/i }));
    const anthropic = screen.getByRole("menuitem", { name: /Anthropic/i });
    fireEvent.mouseDown(anthropic);
    fireEvent.click(anthropic);
    expect(screen.getByRole("menu")).toBeTruthy();
  });

  it("elegir un modelo manda el id completo: quien lo monta lo traduce a `/modelo`", () => {
    const alElegir = vi.fn();
    render(
      <PastillaDeModelo
        actual="ollama/qwen3"
        proveedores={[
          { id: "ollama", nombre: "Ollama", credencial: "nativa", modelos: [{ id: "qwen3", nombre: "Qwen 3" }, { id: "glm", nombre: "GLM" }] },
        ]}
        alPedirCatalogo={() => {}}
        alElegir={alElegir}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "ollama/qwen3" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /^ollama$/i }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "GLM" }));
    expect(alElegir).toHaveBeenCalledWith("ollama/glm");
  });

  it("un proveedor que falla lo dice donde el usuario mira, y los demás siguen elegibles", () => {
    const alElegir = vi.fn();
    render(
      <PastillaDeModelo
        proveedores={[
          // Con la clave PUESTA: desde que la lista es de lo comprobado, un proveedor de
          // pago solo aparece así — y este es su fallo real, la clave que el servidor
          // rechaza al pedirle el catálogo.
          { id: "openai", nombre: "OpenAI", credencial: "puesta", error: "credencial no autorizada para openai" },
          { id: "ollama", nombre: "Ollama", credencial: "nativa", modelos: [{ id: "qwen3" }] },
        ]}
        alPedirCatalogo={() => {}}
        alElegir={alElegir}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /elige modelo/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /OpenAI/i }));
    expect(screen.getByRole("alert").textContent).toMatch(/no autorizada/);
    // Y el otro sigue funcionando: un desvío, no un callejón.
    fireEvent.click(screen.getByRole("menuitem", { name: /^ollama$/i }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "qwen3" }));
    expect(alElegir).toHaveBeenCalledWith("ollama/qwen3");
  });

  /**
   * El punto es literal: verde solo si la credencial está confirmada, hueco solo si se sabe
   * que falta, y NADA para quien no necesita ninguna. Pintarle un punto a Ollama sería
   * concederle un permiso o inventarle un problema.
   *
   * Desde que la lista es de lo COMPROBADO, el hueco solo se puede ver en un sitio: el
   * proveedor que está EN VIGOR sin credencial que este proceso reconozca —una clave que
   * viene por variable de entorno, por ejemplo—. Y ahí es donde más falta hace decirlo.
   */
  it("el punto de credencial solo aparece cuando hay algo que afirmar", () => {
    render(
      <PastillaDeModelo actual="openai/gpt-5" proveedores={PROVEEDORES} alPedirCatalogo={() => {}} alElegir={() => {}} />
    );
    fireEvent.click(screen.getByRole("button", { name: /openai/i }));
    expect(screen.getByRole("menuitem", { name: /Anthropic/i }).querySelector("[data-credencial='puesta']")).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: /OpenAI/i }).querySelector("[data-credencial='falta']")).toBeTruthy();
    // Ollama entra por estar comprobado, y sin punto de credencial: no lleva ninguna.
    expect(screen.queryByRole("menuitem", { name: /^ollama$/i })).toBeNull();
  });
});

describe("el punto de un proveedor SIN credencial habla de la conexión", () => {
  afterEach(cleanup);

  const ollama = (extra: Record<string, unknown>) => ({
    id: "ollama",
    credencial: "nativa" as const,
    ...extra,
  });

  /**
   * `actual` puesto a propósito: desde que la lista es solo de lo COMPROBADO, un proveedor
   * que no contesta solo aparece si es el que está en uso — y ese es justo el caso que
   * importa, porque es cuando hay que decir que ha dejado de responder.
   */
  function montar(p: ReturnType<typeof ollama>) {
    render(
      <PastillaDeModelo
        actual="ollama/qwen3:8b"
        proveedores={[p]}
        alPedirCatalogo={() => {}}
        alElegirModelo={() => {}}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /ollama/i }));
  }

  /**
   * Antes no se pintaba NADA para Ollama local, porque no lleva credencial de la que
   * hablar. Pero «¿puedo usarlo?» ahí no la contesta ninguna clave: la contesta si el
   * demonio responde — y eso ya se sabe sin pedir nada nuevo, porque su catálogo ES la
   * prueba de conexión.
   */
  it("verde cuando su catálogo contestó", () => {
    montar(ollama({ modelos: [{ id: "qwen3:8b" }] }));
    expect(screen.getByTitle("conectado")).toBeTruthy();
  });

  it("rojo cuando su catálogo falló", () => {
    montar(ollama({ error: "no se puede contactar con ollama" }));
    expect(screen.getByTitle("sin conexión")).toBeTruthy();
  });

  /**
   * Y nada mientras no conste ninguna de las dos: un punto verde antes de haber hablado
   * con el demonio afirmaría una conexión que nadie ha comprobado. Es la misma disciplina
   * de los tres estados de credencial.
   */
  it("sin consultar todavía no se pinta punto: no se afirma una conexión sin comprobarla", () => {
    montar(ollama({}));
    expect(screen.queryByTitle("conectado")).toBeNull();
    expect(screen.queryByTitle("sin conexión")).toBeNull();
  });

  /** Los que SÍ llevan credencial no cambian: su punto sigue hablando de la clave. */
  it("un proveedor con clave sigue diciendo lo de siempre", () => {
    render(
      <PastillaDeModelo
        proveedores={[{ id: "anthropic", nombre: "Anthropic", credencial: "puesta", modelos: [{ id: "claude-x" }] }]}
        alPedirCatalogo={() => {}}
        alElegirModelo={() => {}}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /elige modelo|anthropic/i }));
    expect(screen.getByTitle("con credencial")).toBeTruthy();
  });
});

/**
 * El punto es una descripción de la fila, no su nombre. Un `aria-label` dentro del botón se
 * sumaba al nombre accesible y el proveedor pasaba a llamarse «conectado ollama»: dejaba de
 * poder encontrarse por su nombre, tanto en un test como diciéndolo por voz.
 */
describe("el punto no se cuela en el nombre del proveedor", () => {
  afterEach(cleanup);

  it("el botón del proveedor se sigue llamando por su nombre y nada más", () => {
    render(
      <PastillaDeModelo
        proveedores={[
          { id: "ollama", nombre: "Ollama", credencial: "nativa", modelos: [{ id: "qwen3" }] },
          { id: "anthropic", nombre: "Anthropic", credencial: "puesta", modelos: [{ id: "claude-x" }] },
        ]}
        alPedirCatalogo={() => {}}
        alElegirModelo={() => {}}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /elige modelo|ollama/i }));
    expect(screen.getByRole("menuitem", { name: /^ollama$/i })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: /^anthropic$/i })).toBeTruthy();
  });
});

describe("PastillaDeModelo: el filtro de una lista larga", () => {
  afterEach(cleanup);

  it("con más de ocho modelos hay filtro, y filtra por id y por nombre", () => {
    const modelos = Array.from({ length: 10 }, (_, i) => ({ id: `m${i}`, nombre: i === 3 ? "Qwen grande" : `Modelo ${i}` }));
    render(
      <PastillaDeModelo
        proveedores={[{ id: "ollama", nombre: "Ollama", credencial: "nativa", modelos }]}
        alPedirCatalogo={() => {}}
        alElegir={() => {}}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /elige modelo/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /^ollama$/i }));
    expect(screen.getAllByRole("menuitemradio")).toHaveLength(10);
    fireEvent.change(screen.getByRole("searchbox", { name: /filtrar los modelos de Ollama/ }), { target: { value: "qwen" } });
    expect(screen.getAllByRole("menuitemradio").map((b) => b.textContent)).toEqual(["Qwen grande"]);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "M7" } });
    expect(screen.getAllByRole("menuitemradio").map((b) => b.textContent)).toEqual(["Modelo 7"]);
  });

  it("con pocos modelos no hay filtro: un campo para tres filas es ruido", () => {
    render(
      <PastillaDeModelo
        proveedores={[{ id: "ollama", nombre: "Ollama", credencial: "nativa", modelos: [{ id: "a" }, { id: "b" }] }]}
        alPedirCatalogo={() => {}}
        alElegir={() => {}}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /elige modelo/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /^ollama$/i }));
    expect(screen.queryByRole("searchbox")).toBeNull();
  });
});

/**
 * La lista es de lo COMPROBADO, no de todo lo que existe.
 *
 * Un proveedor sin clave no se puede usar, y enseñarlo en el menú de elegir modelo es
 * ofrecer algo que va a fallar al pulsarlo. Los que quedan fuera se CUENTAN con el camino
 * para arreglarlo —el mismo patrón que la barra lateral con los proyectos sin enseñar—:
 * esconderlos sin decir nada haría que Anthropic pareciera no existir.
 */
describe("solo se listan los proveedores comprobados", () => {
  afterEach(cleanup);
  const CON_TODO = [
    { id: "ollama", nombre: "Ollama", credencial: "nativa" as const, modelos: [{ id: "llama3" }] },
    { id: "anthropic", nombre: "Anthropic", credencial: "puesta" as const },
    { id: "openai", nombre: "OpenAI", credencial: "falta" as const },
    { id: "gemini", nombre: "Gemini", credencial: "falta" as const },
    { id: "custom:lm", nombre: "LM Studio", credencial: "falta" as const, personalizado: true as const, error: "no responde" },
  ];
  const abrir = (proveedores: typeof CON_TODO, alAbrirAjustes?: () => void) => {
    render(
      <PastillaDeModelo
        proveedores={proveedores}
        alPedirCatalogo={() => {}}
        alElegir={() => {}}
        {...(alAbrirAjustes === undefined ? {} : { alAbrirAjustes })}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /modelo/i }));
  };

  it("con clave puesta entra; sin clave, no", () => {
    abrir(CON_TODO);
    expect(screen.getByRole("menuitem", { name: /Anthropic/ })).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: /OpenAI/ })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: /Gemini/ })).toBeNull();
  });

  it("ollama entra si CONTESTÓ, y no si no", () => {
    // No lleva credencial: lo único que se puede afirmar de él es si el demonio responde.
    abrir(CON_TODO);
    expect(screen.getByRole("menuitem", { name: /Ollama/ })).toBeTruthy();
    cleanup();
    abrir([{ id: "ollama", nombre: "Ollama", credencial: "nativa" as const, error: "no se pudo conectar" }]);
    expect(screen.queryByRole("menuitem", { name: /Ollama/ })).toBeNull();
  });

  it("uno personalizado que no responde tampoco entra, aunque no necesite clave", () => {
    abrir(CON_TODO);
    expect(screen.queryByRole("menuitem", { name: /LM Studio/ })).toBeNull();
  });

  it("los que quedan fuera se CUENTAN, con el camino para arreglarlo", () => {
    const aAjustes = vi.fn();
    abrir(CON_TODO, aAjustes);
    // Tres fuera: OpenAI, Gemini y LM Studio.
    const linea = screen.getByRole("button", { name: /3 proveedores/i });
    fireEvent.click(linea);
    expect(aAjustes).toHaveBeenCalled();
  });

  it("sin manejador de ajustes la línea se dice igual, pero no es un botón muerto", () => {
    abrir(CON_TODO);
    expect(screen.getByText(/3 proveedores/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /3 proveedores/i })).toBeNull();
  });

  it("sin NINGUNO comprobado no se enseña un menú vacío: se dice qué hacer", () => {
    // Es el arranque de quien no ha configurado nada y no tiene Ollama levantado. Un menú
    // en blanco se lee como que la consola está rota.
    abrir([{ id: "openai", nombre: "OpenAI", credencial: "falta" as const }]);
    expect(screen.getByText(/ninguno comprobado/i)).toBeTruthy();
  });

  it("el que está EN VIGOR se enseña aunque no esté comprobado", () => {
    // Si el modelo de trabajo sale de una variable de entorno que este proceso no ve como
    // credencial, esconderlo dejaría la pastilla enseñando arriba un proveedor que no está
    // en su propia lista. Lo que está en uso, está.
    render(
      <PastillaDeModelo
        actual="openai/gpt-5"
        proveedores={CON_TODO}
        alPedirCatalogo={() => {}}
        alElegir={() => {}}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /openai/i }));
    expect(screen.getByRole("menuitem", { name: /OpenAI/ })).toBeTruthy();
  });
});
