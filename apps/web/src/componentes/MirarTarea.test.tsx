import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MirarTarea } from "./MirarTarea.js";
import type { Acto, TareaDelCable } from "../tipos.js";

afterEach(cleanup);

const tarea = (extra: Partial<TareaDelCable> = {}): TareaDelCable => ({
  id: "t1",
  proyecto: "p1",
  proyectoNombre: "AppDemo",
  titulo: "Arregla el login",
  peticion: "Arregla el login",
  encargo: "Arregla el login",
  adjuntos: [],
  estado: "en-proceso",
  creada: "2026-09-08T10:00:00.000Z",
  ...extra,
});

const ACTOS: Acto[] = [
  { tipo: "usuario", texto: "arregla el login" },
  { tipo: "razonamiento", texto: "el .xne no declara el campo" },
  { tipo: "fase", texto: "desarrollando", ms: 12, fase: "ejecutando" },
  { tipo: "herramientas", lineas: ["→ lee app.xne", "← edita app.xne"], detalles: [{ nombre: "read_file" }, { nombre: "edit_file" }] },
  { tipo: "asistente", texto: "He añadido el campo." },
  { tipo: "artefacto", ruta: "/artefactos/d.html", nombre: "d.html", bytes: 120 },
  { tipo: "sistema", texto: "✎ 1 escritura(s) autorizadas sin aprobación: app.xne" },
];

/**
 * Task 17: `MirarTarea` deja de ser un panel suelto con su propia cabecera y su «Cerrar»,
 * y pasa a ser el DESPLIEGUE entero de la fila — el botón (con `aria-expanded`) y, cuando
 * está expandido, el cuerpo del detalle. Es la MISMA pieza que monta `Kanban.tsx` y
 * `TareasDelProyecto.tsx`, así que las condiciones de quién puede mirar y cuándo (Task 16:
 * `en-proceso` + `corriendoAqui` + cable vivo) viven AQUÍ y no se repiten en cada llamador.
 */
describe("MirarTarea: el botón de despliegue", () => {
  it("no se ofrece nada si no hay con qué abrir ni nada que mostrar", () => {
    const { container } = render(<MirarTarea tarea={tarea({ estado: "nuevo" })} />);
    expect(container.firstChild).toBeNull();
  });

  it("no se ofrece fuera de «en-proceso», aunque haya manejador y cable", () => {
    for (const estado of ["nuevo", "requiere-atencion", "terminada"] as const) {
      cleanup();
      const { container } = render(
        <MirarTarea tarea={tarea({ estado })} corriendoAqui alMirar={() => {}} alDejarDeMirar={() => {}} />
      );
      expect(container.firstChild).toBeNull();
    }
  });

  it("no se ofrece si lo ejecuta OTRO proceso", () => {
    const { container } = render(
      <MirarTarea tarea={tarea()} corriendoAqui={false} alMirar={() => {}} alDejarDeMirar={() => {}} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("no se ofrece sin cable", () => {
    const { container } = render(
      <MirarTarea tarea={tarea()} corriendoAqui conectado={false} alMirar={() => {}} alDejarDeMirar={() => {}} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("no se ofrece sin manejador: un botón que no lleva a ninguna parte es el botón muerto de siempre", () => {
    const { container } = render(<MirarTarea tarea={tarea()} corriendoAqui conectado />);
    expect(container.firstChild).toBeNull();
  });

  it("se ofrece con las tres condiciones a la vez, como un botón DE VERDAD y plegado", () => {
    render(<MirarTarea tarea={tarea()} corriendoAqui alMirar={() => {}} alDejarDeMirar={() => {}} />);
    const boton = screen.getByRole("button", { name: /ver lo que hace/i });
    expect(boton.getAttribute("aria-expanded")).toBe("false");
  });

  it("al pulsarlo, avisa con el id de la tarea", () => {
    const alMirar = vi.fn();
    render(<MirarTarea tarea={tarea()} corriendoAqui alMirar={alMirar} alDejarDeMirar={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /ver lo que hace/i }));
    expect(alMirar).toHaveBeenCalledWith("t1");
  });

  it("expandida, el botón lo DICE con `aria-expanded` y pliega con el mismo control", () => {
    const alDejarDeMirar = vi.fn();
    render(
      <MirarTarea tarea={tarea()} corriendoAqui mirando="t1" alMirar={() => {}} alDejarDeMirar={alDejarDeMirar} />
    );
    const boton = screen.getByRole("button", { name: /dejar de ver|ocultar/i });
    expect(boton.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(boton);
    expect(alDejarDeMirar).toHaveBeenCalledWith("t1");
  });

  /**
   * El panel se queda abierto cuando la tarea deja de ser `en-proceso` mientras se mira
   * (acaba, o queda aparcada): cerrarlo solo porque `puedeAbrir` ya no vale tiraría lo
   * último que se estaba leyendo. Sigue habiendo botón para plegar.
   */
  it("sigue expandida y con botón para plegar aunque la tarea ya no sea «en-proceso»", () => {
    const alDejarDeMirar = vi.fn();
    render(
      <MirarTarea
        tarea={tarea({ estado: "terminada" })}
        corriendoAqui
        mirando="t1"
        alDejarDeMirar={alDejarDeMirar}
      />
    );
    const boton = screen.getByRole("button", { name: /dejar de ver|ocultar/i });
    expect(boton.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(boton);
    expect(alDejarDeMirar).toHaveBeenCalledWith("t1");
  });
});

describe("MirarTarea: el detalle expandido", () => {
  it("pinta el trabajo del agente: razonamiento, fases, tools y respuesta", () => {
    render(
      <MirarTarea
        tarea={tarea()}
        corriendoAqui
        mirando="t1"
        mirada={{ tarea: "t1", actos: ACTOS }}
        alDejarDeMirar={() => {}}
      />
    );
    expect(screen.getByText("arregla el login")).toBeTruthy();
    expect(screen.getByText(/el \.xne no declara el campo/)).toBeTruthy();
    expect(screen.getByText(/desarrollando/)).toBeTruthy();
    expect(screen.getByText(/← edita app\.xne/)).toBeTruthy();
    expect(screen.getByText(/He añadido el campo\./)).toBeTruthy();
    expect(screen.getByText(/d\.html/)).toBeTruthy();
    expect(screen.getByText(/autorizadas sin aprobación/)).toBeTruthy();
  });

  it("es de SOLO lectura: ni caja de texto, ni botón de enviar", () => {
    render(
      <MirarTarea
        tarea={tarea()}
        corriendoAqui
        mirando="t1"
        mirada={{ tarea: "t1", actos: ACTOS }}
        alDejarDeMirar={() => {}}
      />
    );
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button", { name: /enviar/i })).toBeNull();
    expect(screen.getByText(/solo lectura|no se puede escribir/i)).toBeTruthy();
  });

  it("dice que esto es el transcript de su sesión, no un registro aparte", () => {
    render(
      <MirarTarea tarea={tarea()} corriendoAqui mirando="t1" mirada={{ tarea: "t1", actos: ACTOS }} alDejarDeMirar={() => {}} />
    );
    expect(screen.getByText(/su conversación|el mismo/i)).toBeTruthy();
  });

  it("un acto de `fin` no se pinta como línea de conversación", () => {
    render(
      <MirarTarea
        tarea={tarea()}
        corriendoAqui
        mirando="t1"
        mirada={{ tarea: "t1", actos: [{ tipo: "fin", ms: 4200 }] }}
        alDejarDeMirar={() => {}}
      />
    );
    expect(screen.queryByText(/4200/)).toBeNull();
  });

  it("corriendo y sin actos: todavía no ha pintado nada", () => {
    render(<MirarTarea tarea={tarea()} corriendoAqui mirando="t1" alDejarDeMirar={() => {}} />);
    expect(screen.getByText(/todavía no ha pintado nada/i)).toBeTruthy();
  });

  it("ya no corre aquí: se dice, y se dice dónde está lo que hizo", () => {
    render(
      <MirarTarea tarea={tarea({ estado: "terminada" })} corriendoAqui mirando="t1" alDejarDeMirar={() => {}} />
    );
    expect(screen.queryByText(/todavía no ha pintado nada/i)).toBeNull();
    expect(screen.getByText(/ya no corre aquí/i)).toBeTruthy();
    expect(screen.getByText(/pulsa su título/i)).toBeTruthy();
  });

  it("solo el transcript de la tarea que se mira, nunca el de otra", () => {
    render(
      <MirarTarea
        tarea={tarea()}
        corriendoAqui
        mirando="t1"
        mirada={{ tarea: "t2", actos: [{ tipo: "asistente", texto: "de otra tarea" }] }}
        alDejarDeMirar={() => {}}
      />
    );
    expect(screen.queryByText("de otra tarea")).toBeNull();
    expect(screen.getByText(/todavía no ha pintado nada/i)).toBeTruthy();
  });

  /**
   * Task 17: el detalle es el sitio natural para lo que la fila no puede enseñar — el
   * motivo ENTERO, lo autorizado y el veredicto cuando lo haya. Ninguno de los tres se
   * pinta si la tarea no lo trae.
   */
  it("el motivo entero, lo autorizado y el veredicto se leen en el detalle", () => {
    render(
      <MirarTarea
        tarea={tarea({
          motivo: "el juez de QA dijo «rojo»: falta el manejador de error",
          autorizadas: ["app.xne", "app.css"],
          veredicto: { veredicto: "rojo", resumen: "falta el manejador de error", hallazgos: ["sin try/catch"] },
        })}
        corriendoAqui
        mirando="t1"
        alDejarDeMirar={() => {}}
      />
    );
    expect(screen.getByText(/falta el manejador de error/)).toBeTruthy();
    expect(screen.getByText("app.xne")).toBeTruthy();
    expect(screen.getByText("app.css")).toBeTruthy();
    expect(screen.getByText(/sin try\/catch/)).toBeTruthy();
  });

  it("autorizadas vacío no es lo mismo que ausente: [] lo dice", () => {
    render(<MirarTarea tarea={tarea({ autorizadas: [] })} corriendoAqui mirando="t1" alDejarDeMirar={() => {}} />);
    expect(screen.getByText(/no autorizó ninguna escritura/i)).toBeTruthy();
  });

  it("ausente no se inventa ninguna de las tres", () => {
    render(<MirarTarea tarea={tarea()} corriendoAqui mirando="t1" alDejarDeMirar={() => {}} />);
    expect(screen.queryByText(/autorizó escribir|no autorizó ninguna/i)).toBeNull();
  });
});
