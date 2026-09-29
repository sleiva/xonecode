import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { TarjetaDeEmpezar, TarjetaDeCerrar, AvisoDelGestor, BotonDeCerrarEnJira } from "./TarjetaDeJira.js";
import type { TransicionDelGestor } from "../tipos.js";

// Los diálogos van a un PORTAL sobre `document.body`: sin `cleanup` un segundo `render()`
// dejaría dos a la vez y `getByRole("dialog")` reventaría con «found multiple elements».
// Mismo motivo y misma línea que `Pregunta.test.tsx`.
afterEach(cleanup);

const TRANSICIONES: TransicionDelGestor[] = [
  { id: "11", nombre: "Empezar a hacer", destino: "EN CURSO", categoria: "en-curso" },
  { id: "31", nombre: "Marcar como probada", destino: "PROBAR", categoria: "en-curso" },
];

const tarjeta = (): HTMLElement => screen.getByRole("dialog");

describe("TarjetaDeEmpezar", () => {
  it("es un DIÁLOGO por portal, con el título de la transición propuesta", () => {
    const { container } = render(
      <TarjetaDeEmpezar
        nombreDelGestor="Jira"
        clave="IXCODE-12"
        transiciones={{ lista: TRANSICIONES, propuesta: "11" }}
        enviando={false}
        alConfirmar={() => {}}
        alCancelar={() => {}}
      />
    );
    const dialogo = tarjeta();
    expect(dialogo.getAttribute("aria-modal")).toBe("true");
    expect(screen.getByRole("dialog", { name: "¿Pasar IXCODE-12 a EN CURSO?" })).toBe(dialogo);
    expect(container.contains(dialogo)).toBe(false);
    expect(document.body.contains(dialogo)).toBe(true);
  });

  it("sin transiciones (todavía cargando) lo dice y no hay «Pasar y empezar»", () => {
    render(<TarjetaDeEmpezar nombreDelGestor="Jira" clave="IXCODE-12" enviando={false} alConfirmar={() => {}} alCancelar={() => {}} />);
    expect(screen.getByRole("dialog", { name: "¿Empezar con IXCODE-12?" })).toBeTruthy();
    expect(screen.getByText("Consultando las transiciones de IXCODE-12…")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Pasar y empezar" })).toBeNull();
    expect(screen.getByRole("button", { name: "Empezar sin tocar Jira" })).toBeTruthy();
  });

  it("sin ninguna transición disponible lo dice y tampoco hay «Pasar y empezar»", () => {
    render(<TarjetaDeEmpezar nombreDelGestor="Jira" clave="IXCODE-12" transiciones={{ lista: [] }} enviando={false} alConfirmar={() => {}} alCancelar={() => {}} />);
    expect(screen.getByText("No hay transiciones disponibles para IXCODE-12.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Pasar y empezar" })).toBeNull();
  });

  it("elegir otra transición cambia el título: sigue lo que se va a pasar", () => {
    render(
      <TarjetaDeEmpezar
        nombreDelGestor="Jira"
        clave="IXCODE-12"
        transiciones={{ lista: TRANSICIONES, propuesta: "11" }}
        enviando={false}
        alConfirmar={() => {}}
        alCancelar={() => {}}
      />
    );
    fireEvent.change(screen.getByRole("combobox", { name: "Transición" }), { target: { value: "31" } });
    expect(screen.getByRole("dialog", { name: "¿Pasar IXCODE-12 a PROBAR?" })).toBeTruthy();
  });

  it("«Pasar y empezar» manda la transición elegida; «Empezar sin tocar Jira» manda `undefined`", () => {
    const alConfirmar = vi.fn();
    render(
      <TarjetaDeEmpezar
        nombreDelGestor="Jira"
        clave="IXCODE-12"
        transiciones={{ lista: TRANSICIONES, propuesta: "11" }}
        enviando={false}
        alConfirmar={alConfirmar}
        alCancelar={() => {}}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Pasar y empezar" }));
    expect(alConfirmar).toHaveBeenCalledWith("11");
    fireEvent.click(screen.getByRole("button", { name: "Empezar sin tocar Jira" }));
    expect(alConfirmar).toHaveBeenCalledWith(undefined);
  });

  it("el error se enseña dentro de la tarjeta, que sigue abierta", () => {
    render(
      <TarjetaDeEmpezar
        nombreDelGestor="Jira"
        clave="IXCODE-12"
        transiciones={{ lista: TRANSICIONES, propuesta: "11" }}
        enviando={false}
        error="no se pudo transicionar"
        alConfirmar={() => {}}
        alCancelar={() => {}}
      />
    );
    expect(screen.getByRole("alert").textContent).toBe("no se pudo transicionar");
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("mientras la acción está en vuelo los botones que ESCRIBEN se deshabilitan: no hay doble envío", () => {
    render(
      <TarjetaDeEmpezar
        nombreDelGestor="Jira"
        clave="IXCODE-12"
        transiciones={{ lista: TRANSICIONES, propuesta: "11" }}
        enviando
        alConfirmar={() => {}}
        alCancelar={() => {}}
      />
    );
    for (const nombre of ["Pasar y empezar", "Empezar sin tocar Jira"]) {
      expect((screen.getByRole("button", { name: nombre }) as HTMLButtonElement).disabled).toBe(true);
    }
    // Cancelar NUNCA se deshabilita: no manda nada de vuelta, así que no hay envío que doblar.
    expect((screen.getByRole("button", { name: "Cancelar" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("Escape y el clic en el velo VISIBLE cancelan; dentro de la tarjeta no", () => {
    const alCancelar = vi.fn();
    render(
      <TarjetaDeEmpezar
        nombreDelGestor="Jira"
        clave="IXCODE-12"
        transiciones={{ lista: TRANSICIONES, propuesta: "11" }}
        enviando={false}
        alConfirmar={() => {}}
        alCancelar={alCancelar}
      />
    );
    const velo = tarjeta().firstElementChild as HTMLElement;
    fireEvent.click(velo.firstElementChild as HTMLElement);
    expect(alCancelar).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(alCancelar).toHaveBeenCalledTimes(1);
    fireEvent.click(velo);
    expect(alCancelar).toHaveBeenCalledTimes(2);
  });

  /**
   * Mientras la escritura está EN VUELO, las TRES salidas sin botón SIGUEN contestando:
   * `alCancelar` no deshace nada —Jira no tiene un `undo` que este cliente pueda pedir—, así
   * que bloquear la salida solo atrapaba a la persona delante del diálogo hasta que el cable
   * se cayera. El doble envío lo evita el candado de la FILA (`ocupado`), no este diálogo.
   */
  it("mientras enviando, Escape, el velo Y «Cancelar» SIGUEN cerrando: no hay nada que deshacer", () => {
    const alCancelar = vi.fn();
    render(
      <TarjetaDeEmpezar
        nombreDelGestor="Jira"
        clave="IXCODE-12"
        transiciones={{ lista: TRANSICIONES, propuesta: "11" }}
        enviando
        alConfirmar={() => {}}
        alCancelar={alCancelar}
      />
    );
    const velo = tarjeta().firstElementChild as HTMLElement;
    fireEvent.keyDown(document, { key: "Escape" });
    expect(alCancelar).toHaveBeenCalledTimes(1);
    fireEvent.click(velo);
    expect(alCancelar).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(alCancelar).toHaveBeenCalledTimes(3);
  });

  it("un fallo al CONSULTAR las transiciones se dice (R6), en vez de «Consultando…» para siempre", () => {
    render(
      <TarjetaDeEmpezar
        nombreDelGestor="Jira"
        clave="IXCODE-12"
        errorTransiciones="Jira no contesta"
        enviando={false}
        alConfirmar={() => {}}
        alCancelar={() => {}}
      />
    );
    expect(screen.getByRole("alert").textContent).toBe("No se pudieron consultar las transiciones: Jira no contesta");
    expect(screen.queryByText(/Consultando las transiciones/)).toBeNull();
  });

  it("«Cancelar» cancela, y desmontar no manda nada", () => {
    const alCancelar = vi.fn();
    const alConfirmar = vi.fn();
    const { unmount } = render(
      <TarjetaDeEmpezar
        nombreDelGestor="Jira"
        clave="IXCODE-12"
        transiciones={{ lista: TRANSICIONES, propuesta: "11" }}
        enviando={false}
        alConfirmar={alConfirmar}
        alCancelar={alCancelar}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(alCancelar).toHaveBeenCalledTimes(1);
    unmount();
    expect(alConfirmar).not.toHaveBeenCalled();
    expect(alCancelar).toHaveBeenCalledTimes(1);
  });
});

describe("TarjetaDeCerrar", () => {
  it("el comentario propuesto sale EDITABLE en el campo", () => {
    render(
      <TarjetaDeCerrar
        nombreDelGestor="Jira"
        clave="IXCODE-12"
        comentario="IXCODE-12: comentado."
        enviando={false}
        alConfirmar={() => {}}
        alCancelar={() => {}}
      />
    );
    expect(screen.getByRole("dialog", { name: "Cerrar IXCODE-12 en Jira" })).toBeTruthy();
    const campo = screen.getByRole("textbox", { name: "Comentario" }) as HTMLTextAreaElement;
    expect(campo.value).toBe("IXCODE-12: comentado.");
    fireEvent.change(campo, { target: { value: "Editado a mano." } });
    expect(campo.value).toBe("Editado a mano.");
  });

  it("sin transiciones no hay «Comentar y pasar a…»: solo «Solo comentar»", () => {
    render(<TarjetaDeCerrar nombreDelGestor="Jira" clave="IXCODE-12" comentario="x" enviando={false} alConfirmar={() => {}} alCancelar={() => {}} />);
    expect(screen.queryByRole("combobox", { name: "Transición" })).toBeNull();
    expect(screen.queryByRole("button", { name: /comentar y pasar/i })).toBeNull();
    expect(screen.getByRole("button", { name: "Solo comentar" })).toBeTruthy();
  });

  it("con transiciones, el botón dice a DÓNDE pasa, y sigue la elegida", () => {
    render(
      <TarjetaDeCerrar
        nombreDelGestor="Jira"
        clave="IXCODE-12"
        comentario="x"
        transiciones={{ lista: TRANSICIONES, propuesta: "31" }}
        enviando={false}
        alConfirmar={() => {}}
        alCancelar={() => {}}
      />
    );
    expect(screen.getByRole("button", { name: "Comentar y pasar a PROBAR" })).toBeTruthy();
    fireEvent.change(screen.getByRole("combobox", { name: "Transición" }), { target: { value: "11" } });
    expect(screen.getByRole("button", { name: "Comentar y pasar a EN CURSO" })).toBeTruthy();
  });

  it("«Comentar y pasar a…» manda el texto EDITADO y la transición; «Solo comentar» sin transición", () => {
    const alConfirmar = vi.fn();
    render(
      <TarjetaDeCerrar
        nombreDelGestor="Jira"
        clave="IXCODE-12"
        comentario="propuesto"
        transiciones={{ lista: TRANSICIONES, propuesta: "31" }}
        enviando={false}
        alConfirmar={alConfirmar}
        alCancelar={() => {}}
      />
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Comentario" }), { target: { value: "IXCODE-12: comentado y pasado a PROBAR" } });
    fireEvent.click(screen.getByRole("button", { name: "Comentar y pasar a PROBAR" }));
    expect(alConfirmar).toHaveBeenCalledWith("IXCODE-12: comentado y pasado a PROBAR", "31");

    alConfirmar.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Solo comentar" }));
    expect(alConfirmar).toHaveBeenCalledWith("IXCODE-12: comentado y pasado a PROBAR", undefined);
  });

  it("un comentario vacío no se puede mandar por ninguna de las dos vías", () => {
    render(
      <TarjetaDeCerrar
        nombreDelGestor="Jira"
        clave="IXCODE-12"
        comentario="algo"
        transiciones={{ lista: TRANSICIONES, propuesta: "31" }}
        enviando={false}
        alConfirmar={() => {}}
        alCancelar={() => {}}
      />
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Comentario" }), { target: { value: "   " } });
    expect((screen.getByRole("button", { name: "Comentar y pasar a PROBAR" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Solo comentar" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("un error de «cerrar» deja el diálogo abierto CON el motivo y el texto editado intacto", () => {
    const { rerender } = render(
      <TarjetaDeCerrar
        nombreDelGestor="Jira"
        clave="IXCODE-12"
        comentario="propuesto"
        enviando={false}
        alConfirmar={() => {}}
        alCancelar={() => {}}
      />
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Comentario" }), { target: { value: "lo que escribí" } });
    rerender(
      <TarjetaDeCerrar
        nombreDelGestor="Jira"
        clave="IXCODE-12"
        comentario="propuesto"
        enviando={false}
        error="la conexión con Jira falló"
        alConfirmar={() => {}}
        alCancelar={() => {}}
      />
    );
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toBe("la conexión con Jira falló");
    expect((screen.getByRole("textbox", { name: "Comentario" }) as HTMLTextAreaElement).value).toBe("lo que escribí");
  });

  it("mientras la acción está en vuelo los botones que ESCRIBEN se deshabilitan", () => {
    render(
      <TarjetaDeCerrar
        nombreDelGestor="Jira"
        clave="IXCODE-12"
        comentario="algo"
        transiciones={{ lista: TRANSICIONES, propuesta: "31" }}
        enviando
        alConfirmar={() => {}}
        alCancelar={() => {}}
      />
    );
    for (const nombre of ["Comentar y pasar a PROBAR", "Solo comentar"]) {
      expect((screen.getByRole("button", { name: nombre }) as HTMLButtonElement).disabled).toBe(true);
    }
    expect((screen.getByRole("button", { name: "Cancelar" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("Escape rechaza sin mandar nada", () => {
    const alConfirmar = vi.fn();
    const alCancelar = vi.fn();
    render(<TarjetaDeCerrar nombreDelGestor="Jira" clave="IXCODE-12" comentario="x" enviando={false} alConfirmar={alConfirmar} alCancelar={alCancelar} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(alCancelar).toHaveBeenCalledTimes(1);
    expect(alConfirmar).not.toHaveBeenCalled();
  });

  it("mientras enviando, Escape, el velo Y «Cancelar» SIGUEN cerrando", () => {
    const alCancelar = vi.fn();
    render(<TarjetaDeCerrar nombreDelGestor="Jira" clave="IXCODE-12" comentario="x" enviando alConfirmar={() => {}} alCancelar={alCancelar} />);
    const velo = tarjeta().firstElementChild as HTMLElement;
    fireEvent.keyDown(document, { key: "Escape" });
    expect(alCancelar).toHaveBeenCalledTimes(1);
    fireEvent.click(velo);
    expect(alCancelar).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(alCancelar).toHaveBeenCalledTimes(3);
  });

  it("un fallo al consultar las transiciones de cierre se dice, y «Solo comentar» sigue disponible", () => {
    render(
      <TarjetaDeCerrar
        nombreDelGestor="Jira"
        clave="IXCODE-12"
        comentario="x"
        errorTransiciones="Jira no contesta"
        enviando={false}
        alConfirmar={() => {}}
        alCancelar={() => {}}
      />
    );
    expect(screen.getByRole("alert").textContent).toBe("No se pudieron consultar las transiciones: Jira no contesta");
    expect(screen.getByRole("button", { name: "Solo comentar" })).toBeTruthy();
  });
});

describe("AvisoDelGestor", () => {
  it("enseña el texto y no es un diálogo: no hay portal ni velo", () => {
    render(<AvisoDelGestor texto="IXCODE-12: comentado y pasado a PROBAR" alCerrar={() => {}} />);
    expect(screen.getByRole("status").textContent).toContain("IXCODE-12: comentado y pasado a PROBAR");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("el botón de descartar lo dice", () => {
    const alCerrar = vi.fn();
    render(<AvisoDelGestor texto="aviso" alCerrar={alCerrar} />);
    fireEvent.click(within(screen.getByRole("status")).getByRole("button", { name: "Descartar el aviso" }));
    expect(alCerrar).toHaveBeenCalled();
  });
});

/**
 * IXCODE-15: lo que DICEN las tarjetas sale del gestor vinculado (el nombre del catálogo), y sin
 * él la frase es neutra —nunca «Jira» por omisión—. Una clave de Notion (UUID) se enseña corta.
 */
describe("tarjetas con otro gestor (IXCODE-15)", () => {
  const UUID = "0687543b-1c2d-4e5f-8a9b-0c1d2e3f4a5b";

  it("con Notion: «Empezar sin tocar Notion», «Cerrar … en Notion» y el id corto", () => {
    const alConfirmar = vi.fn();
    render(<TarjetaDeEmpezar nombreDelGestor="Notion" clave={UUID} enviando={false} alConfirmar={alConfirmar} alCancelar={() => {}} />);
    expect(screen.getByRole("dialog", { name: "¿Empezar con 0687543b?" })).toBeTruthy();
    expect(screen.getByText("Consultando las transiciones de 0687543b…")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Empezar sin tocar Notion" }));
    expect(alConfirmar).toHaveBeenCalledWith(undefined);
    cleanup();
    render(<TarjetaDeCerrar nombreDelGestor="Notion" clave={UUID} comentario="x" enviando={false} alConfirmar={() => {}} alCancelar={() => {}} />);
    expect(screen.getByRole("dialog", { name: "Cerrar 0687543b en Notion" })).toBeTruthy();
  });

  it("sin nombre del gestor, la frase es NEUTRA", () => {
    render(<TarjetaDeEmpezar clave="IXCODE-12" enviando={false} alConfirmar={() => {}} alCancelar={() => {}} />);
    expect(screen.getByRole("button", { name: "Empezar sin tocar el gestor" })).toBeTruthy();
    cleanup();
    render(<TarjetaDeCerrar clave="IXCODE-12" comentario="x" enviando={false} alConfirmar={() => {}} alCancelar={() => {}} />);
    expect(screen.getByRole("dialog", { name: "Cerrar IXCODE-12 en el gestor" })).toBeTruthy();
    cleanup();
    render(<BotonDeCerrarEnJira ticket={UUID} ocupado={false} conectado alPedir={() => {}} />);
    expect(screen.getByRole("button", { name: "Cerrar la tarea" })).toBeTruthy();
    expect(screen.getByText("0687543b")).toBeTruthy();
  });
});

