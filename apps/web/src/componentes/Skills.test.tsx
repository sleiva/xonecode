import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { afterEach, describe, it, expect, vi } from "vitest";
import type { SkillDelCable } from "../tipos.js";
import { Skills } from "./Skills.js";

afterEach(cleanup);

const ARCHIFY: SkillDelCable = {
  nombre: "archify",
  descripcion: "Diagramas, esquemas y arquitecturas.",
  origen: "serie",
  tokens: 4200,
  ficheros: ["reference/diagramas.md"],
  frontmatter: "name: archify\ndescription: Diagramas, esquemas y arquitecturas.\nlicense: MIT",
};

const MIA: SkillDelCable = {
  nombre: "mi-skill",
  descripcion: "Lo que hago yo.",
  origen: "global",
  tokens: 800,
  ficheros: [],
  cuerpo: "Haz esto y lo otro.",
  frontmatter: "name: mi-skill\ndescription: Lo que hago yo.\nallowed-tools: Read",
};

const manejadores = () => ({
  hayProyecto: false,
  alPedirCuerpo: vi.fn(),
  alGuardar: vi.fn(),
  alBorrar: vi.fn(),
});

const irA = (titulo: "De XOneCode" | "Tuyas"): void => {
  fireEvent.click(screen.getByRole("tab", { name: new RegExp(`^${titulo}`) }));
};

describe("Skills", () => {
  it("«todavía no ha llegado» y «no hay ninguna» NO se pintan igual", () => {
    const m = manejadores();
    const { rerender } = render(<Skills {...m} />);
    expect(screen.getByText(/Consultando/)).not.toBeNull();

    rerender(<Skills {...m} skills={[]} />);
    expect(screen.queryByText(/Consultando/)).toBeNull();
    expect(screen.getByText(/No se encontró el catálogo/)).not.toBeNull();
  });

  it("dos pestañas y SIEMPRE las dos, también con una vacía", () => {
    // La etiqueta contesta «¿de quién es esto?», que es la pregunta que la pantalla no
    // contestaba. Esconder la vacía dejaría a quien no ha escrito ninguna sin saber dónde
    // van a aparecer las suyas.
    render(<Skills {...manejadores()} skills={[ARCHIFY]} />);
    expect(screen.getByRole("tab", { name: /^De XOneCode/ })).not.toBeNull();
    expect(screen.getByRole("tab", { name: /^Tuyas/ })).not.toBeNull();
    irA("Tuyas");
    expect(screen.getByText(/No has escrito ninguna/)).not.toBeNull();
  });

  it("la cuenta solo se pinta si hay alguna: un cero no es un dato que enseñar", () => {
    render(<Skills {...manejadores()} skills={[ARCHIFY]} />);
    expect(screen.getByRole("tab", { name: /^De XOneCode/ }).textContent).toContain("1");
    expect(screen.getByRole("tab", { name: /^Tuyas/ }).textContent).toBe("Tuyas");
  });

  it("una de xonecode NO ofrece editar ni borrar", () => {
    // La negativa de verdad vive en el servidor; esto es que la ventana no prometa lo que
    // aquel va a rechazar. Editarla aquí la perdería el siguiente `npm install`.
    render(<Skills {...manejadores()} skills={[ARCHIFY, MIA]} />);
    expect(screen.queryByRole("button", { name: /^Editar archify/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Borrar archify/ })).toBeNull();
    irA("Tuyas");
    expect(screen.getByRole("button", { name: /^Editar mi-skill/ })).not.toBeNull();
  });

  it("el COSTE se pinta en la fila: es la cifra con la que se decide si compensa", () => {
    render(<Skills {...manejadores()} skills={[ARCHIFY]} />);
    expect(screen.getByText("4,2k tok")).not.toBeNull();
  });

  it("la FILA es solo el nombre: la descripción y los anexos están al abrirla", () => {
    // Medido en el navegador: la descripción de `archify` ocupa ocho renglones y sus anexos
    // son 76 rutas, así que con nueve skills la pestaña dejaba de contestar «qué skills hay»
    // para volcar nueve párrafos seguidos. La fila contesta con el nombre; abrirla es donde
    // se lee qué hace.
    render(<Skills {...manejadores()} skills={[ARCHIFY]} />);
    expect(screen.queryAllByText(/Diagramas, esquemas/)).toHaveLength(0);
    expect(screen.queryByText(/Además del/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Ver" }));
    // UNA sola vez: la del frontmatter crudo. Con el párrafo legible además, la misma frase
    // de ocho renglones salía dos veces seguidas y hacía dudar de cuál era la de verdad.
    expect(screen.queryAllByText(/Diagramas, esquemas/)).toHaveLength(1);
    expect(screen.getByText(/reference\/diagramas\.md/)).not.toBeNull();
  });

  it("y con muchos anexos, lo que no cabe se CUENTA: una lista recortada en silencio miente", () => {
    const muchos = { ...ARCHIFY, ficheros: Array.from({ length: 20 }, (_, i) => `f${i}.md`) };
    render(<Skills {...manejadores()} skills={[muchos]} />);
    fireEvent.click(screen.getByRole("button", { name: "Ver" }));
    const parrafo = screen.getByText(/Además del/);
    expect(parrafo.textContent).toContain("lleva 20 ficheros");
    expect(parrafo.textContent).toContain("y 14 más");
    expect(parrafo.textContent).not.toContain("f19.md");
  });

  it("el cuerpo de una de serie se pide al ABRIRLA, y una sola vez", () => {
    // No en la ráfaga de bienvenida: son ficheros de decenas de miles de caracteres que
    // nadie puede editar.
    const m = manejadores();
    const { rerender } = render(<Skills {...m} skills={[ARCHIFY]} />);
    expect(m.alPedirCuerpo).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Ver" }));
    expect(m.alPedirCuerpo).toHaveBeenCalledWith("archify");
    expect(screen.getByText("Leyendo…")).not.toBeNull();

    rerender(<Skills {...m} skills={[ARCHIFY]} cuerpos={{ archify: "EL CUERPO" }} />);
    expect(screen.getByText("EL CUERPO")).not.toBeNull();
    // Cerrar y volver a abrir no lo vuelve a pedir: ya se tiene.
    fireEvent.click(screen.getByRole("button", { name: "Ocultar" }));
    fireEvent.click(screen.getByRole("button", { name: "Ver" }));
    expect(m.alPedirCuerpo).toHaveBeenCalledTimes(1);
  });

  it("un cuerpo que se pidió y no vino se DICE, no se deja la ficha en blanco", () => {
    // Una ficha vacía se leería como que la skill no dice nada, y copiarla daría una copia
    // vacía. La clave presente con `undefined` es justo «se pidió y no se pudo leer».
    render(<Skills {...manejadores()} skills={[ARCHIFY]} cuerpos={{ archify: undefined }} />);
    fireEvent.click(screen.getByRole("button", { name: "Ver" }));
    expect(screen.getByText(/No se pudo leer/)).not.toBeNull();
  });

  it("la de una TUYA ya viene en la lista: no se pide nada", () => {
    const m = manejadores();
    render(<Skills {...m} skills={[MIA]} />);
    irA("Tuyas");
    fireEvent.click(screen.getByRole("button", { name: "Ver" }));
    expect(m.alPedirCuerpo).not.toHaveBeenCalled();
    expect(screen.getByText("Haz esto y lo otro.")).not.toBeNull();
  });

  it("copiar una de serie abre el editor con su cuerpo y SIN nombre", () => {
    // Sin `renombrandoDe` —es un fichero nuevo, no un movimiento— y con el nombre vacío:
    // reutilizarlo daría un destino ocupado, y el servidor lo rechazaría con un mensaje que
    // no explica lo que acaba de pasar.
    const m = manejadores();
    render(<Skills {...m} skills={[ARCHIFY]} cuerpos={{ archify: "EL CUERPO" }} />);
    fireEvent.click(screen.getByRole("button", { name: "Ver" }));
    fireEvent.click(screen.getByRole("button", { name: "Copiar a las tuyas" }));

    expect(screen.getByDisplayValue("EL CUERPO")).not.toBeNull();
    expect(screen.getByDisplayValue("Diagramas, esquemas y arquitecturas.")).not.toBeNull();

    fireEvent.change(screen.getAllByRole("textbox")[0]!, { target: { value: "archify-mio" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(m.alGuardar).toHaveBeenCalledWith(
      expect.objectContaining({ nombre: "archify-mio", cuerpo: "EL CUERPO" }),
      "global",
      undefined
    );
  });

  it("editar una tuya manda `renombrandoDe`, que es lo que distingue guardar de renombrar", () => {
    const m = manejadores();
    render(<Skills {...m} skills={[MIA]} />);
    irA("Tuyas");
    fireEvent.click(screen.getByRole("button", { name: /^Editar/ }));
    fireEvent.change(screen.getAllByRole("textbox")[0]!, { target: { value: "otro-nombre" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(m.alGuardar).toHaveBeenCalledWith(
      expect.objectContaining({ nombre: "otro-nombre" }),
      "global",
      "mi-skill"
    );
  });

  it("sin nombre o sin descripción no se puede guardar", () => {
    // La descripción es lo que el modelo lee para decidir si la carga: sin ella la skill
    // está en el catálogo y no la usa nadie nunca, que es peor que no estar.
    render(<Skills {...manejadores()} skills={[]} />);
    irA("Tuyas");
    fireEvent.click(screen.getByRole("button", { name: "Nueva skill" }));
    const guardar = screen.getByRole("button", { name: "Guardar" }) as HTMLButtonElement;
    expect(guardar.disabled).toBe(true);

    fireEvent.change(screen.getAllByRole("textbox")[0]!, { target: { value: "mia" } });
    expect((screen.getByRole("button", { name: "Guardar" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getAllByRole("textbox")[1]!, { target: { value: "para esto" } });
    expect((screen.getByRole("button", { name: "Guardar" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("el ámbito solo se ofrece si hay proyecto: un desplegable de una opción no es una pregunta", () => {
    const m = manejadores();
    render(<Skills {...m} skills={[]} />);
    irA("Tuyas");
    fireEvent.click(screen.getByRole("button", { name: "Nueva skill" }));
    expect(screen.queryByRole("combobox")).toBeNull();

    // Montaje nuevo y no `rerender`: `hayProyecto` decide el ámbito INICIAL en un `useState`
    // del manejador de «Nueva skill», así que reusar el árbol mediría el estado que ya tenía.
    cleanup();
    render(<Skills {...m} hayProyecto skills={[]} />);
    irA("Tuyas");
    fireEvent.click(screen.getByRole("button", { name: "Nueva skill" }));
    expect(screen.getByRole("combobox")).not.toBeNull();
  });

  it("borrar pide confirmación en la fila y dice que se lleva la carpeta entera", () => {
    const m = manejadores();
    render(<Skills {...m} skills={[MIA]} />);
    irA("Tuyas");
    fireEvent.click(screen.getByRole("button", { name: /^Eliminar mi-skill/ }));
    expect(screen.getByText(/carpeta entera/)).not.toBeNull();
    expect(m.alBorrar).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));
    expect(m.alBorrar).toHaveBeenCalledWith(expect.objectContaining({ nombre: "mi-skill" }), "global");
  });

  it("una del proyecto se borra en el ámbito del PROYECTO, no en el global", () => {
    const m = manejadores();
    render(<Skills {...m} hayProyecto skills={[{ ...MIA, origen: "proyecto" }]} />);
    irA("Tuyas");
    fireEvent.click(screen.getByRole("button", { name: /^Eliminar mi-skill/ }));
    fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));
    expect(m.alBorrar).toHaveBeenCalledWith(expect.anything(), "proyecto");
  });

  it("las carpetas que no cargan se dicen, y son lo ÚNICO que sale como problema", () => {
    // Que una tuya tape a una de serie no entra aquí: eso es la forma de afinarla, y lo dice
    // su ficha con el origen al lado.
    render(<Skills {...manejadores()} skills={[ARCHIFY]} problemas={["rota: no tiene SKILL.md dentro"]} />);
    expect(screen.getByRole("alert").textContent).toContain("rota");
  });
});

describe("el frontmatter en la ficha", () => {
  it("se enseña CRUDO al abrirla: `description` no es lo único que declara el fichero", () => {
    // `archify` lleva además `license` y un bloque `metadata`, y la ventana que solo enseñaba
    // la descripción hacía creer que eso era todo.
    render(<Skills {...manejadores()} skills={[ARCHIFY]} />);
    expect(screen.queryByText(/license: MIT/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Ver" }));
    expect(screen.getByText(/license: MIT/)).not.toBeNull();
  });

  it("y VUELVE al guardar, para no borrarle al usuario lo que no editamos", () => {
    const m = manejadores();
    render(<Skills {...m} skills={[MIA]} />);
    irA("Tuyas");
    fireEvent.click(screen.getByRole("button", { name: /^Editar/ }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(m.alGuardar).toHaveBeenCalledWith(
      expect.objectContaining({ frontmatter: MIA.frontmatter }),
      "global",
      "mi-skill"
    );
  });

  it("y una COPIA se lo lleva también: copiar es partir de ella", () => {
    const m = manejadores();
    render(<Skills {...m} skills={[ARCHIFY]} cuerpos={{ archify: "EL CUERPO" }} />);
    fireEvent.click(screen.getByRole("button", { name: "Ver" }));
    fireEvent.click(screen.getByRole("button", { name: "Copiar a las tuyas" }));
    fireEvent.change(screen.getAllByRole("textbox")[0]!, { target: { value: "archify-mio" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(m.alGuardar).toHaveBeenCalledWith(
      expect.objectContaining({ frontmatter: ARCHIFY.frontmatter }),
      "global",
      undefined
    );
  });
});

describe("sin frontmatter que enseñar", () => {
  it("queda la descripción: ausente ≠ vacío también aquí", () => {
    const { frontmatter: _, ...sinFm } = ARCHIFY;
    render(<Skills {...manejadores()} skills={[sinFm]} />);
    fireEvent.click(screen.getByRole("button", { name: "Ver" }));
    expect(screen.getByText(/Diagramas, esquemas/)).not.toBeNull();
  });
});

describe("instalar desde un .zip", () => {
  /** Un `.zip` de mentira: lo que esta capa hace con él es pasarlo tal cual. */
  const zip = (nombre = "mi-skill.zip"): File =>
    new File([new Uint8Array([1, 2, 3])], nombre, { type: "application/zip" });

  const elegir = (fichero: File): void => {
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [fichero], configurable: true });
    fireEvent.change(input);
  };

  it("SIN manejador no se pinta el botón: un control que no puede cumplir es peor que ninguno", () => {
    render(<Skills {...manejadores()} skills={[]} />);
    irA("Tuyas");
    expect(screen.queryByRole("button", { name: /Instalar/ })).toBeNull();
  });

  it("manda el NOMBRE del fichero y el ámbito, porque de ahí sale el de respaldo", () => {
    // El servidor usa el nombre del `.zip` cuando el zip no trae una carpeta de la que sacar
    // el de la skill. Es lo que la persona ve en su disco.
    const alInstalar = vi.fn(async () => ({ ok: true }));
    render(<Skills {...manejadores()} skills={[]} alInstalar={alInstalar} />);
    irA("Tuyas");
    const fichero = zip("archify-mio.zip");
    elegir(fichero);
    expect(alInstalar).toHaveBeenCalledWith("archify-mio.zip", "global", fichero);
  });

  it("con proyecto abierto, la instalación cae en el PROYECTO", () => {
    const alInstalar = vi.fn(async () => ({ ok: true }));
    render(<Skills {...manejadores()} hayProyecto skills={[]} alInstalar={alInstalar} />);
    irA("Tuyas");
    elegir(zip());
    expect(alInstalar).toHaveBeenCalledWith(expect.any(String), "proyecto", expect.anything());
  });

  it("el motivo del servidor se pinta con palabras, no como un número de estado", async () => {
    // Es lo que hace que un zip rechazado no se lea como que la ventana no responde.
    const alInstalar = vi.fn(async () => ({ ok: false, motivo: "el .zip no trae ningún SKILL.md" }));
    render(<Skills {...manejadores()} skills={[]} alInstalar={alInstalar} />);
    irA("Tuyas");
    elegir(zip());
    expect((await screen.findByRole("alert")).textContent).toContain("SKILL.md");
  });

  it("y un acierto no deja rastro: el acuse es que la skill aparece en la lista", async () => {
    const alInstalar = vi.fn(async () => ({ ok: true }));
    render(<Skills {...manejadores()} skills={[]} alInstalar={alInstalar} />);
    irA("Tuyas");
    elegir(zip());
    await screen.findByRole("button", { name: /Instalar/ });
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
