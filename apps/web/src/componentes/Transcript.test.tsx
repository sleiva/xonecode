import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { Transcript } from "./Transcript.js";

// `globals` no está activado: sin `cleanup` explícito el segundo `render()` de este
// fichero deja montado el primero y las consultas revientan con «found multiple
// elements» — la misma trampa que ya documenta `Compositor.test.tsx`.
afterEach(cleanup);

/**
 * `Transcript` ya no lleva las pestañas —se fueron a `Pestanas`, que hoy vive dentro de
 * `Panel`— ni despacha entre vistas: la conversación es la columna que se queda y el resto
 * se abre al lado. Lo que queda que probar aquí es la conversación misma; el despacho está
 * en `Panel.test.tsx` y el comportamiento de la tira en `Pestanas.test.tsx`.
 */
describe("Transcript", () => {
  const ACTOS = [
    { tipo: "usuario", texto: "hola" },
    { tipo: "herramientas", lineas: ["read_file docs/uno.xne"] },
  ] as const;

  /**
   * El trabajo del agente se ve EN EL CHAT, no solo en la otra pestaña. Antes el chat
   * pintaba únicamente los globos y todo lo demás vivía en las Trazas: se escribía una
   * petición y no pasaba nada durante minutos, con el agente trabajando a la vista de nadie.
   */
  it("pinta la conversación Y el pulso del turno: tools, fases y razonamiento", () => {
    render(
      <Transcript
        actos={[
          ...ACTOS,
          { tipo: "razonamiento", texto: "lo pienso" },
          { tipo: "fase", texto: "planificando", ms: 2400 },
        ]}
      />
    );
    expect(screen.getByText("hola")).toBeTruthy();
    // En la LISTA del pulso. La misma línea sale además en el `summary` —es el paso actual,
    // que se ve con el pulso plegado—, así que `getByText` a secas encuentra dos.
    expect(document.querySelector("ul li")?.textContent).toMatch(/read_file/);
    expect(screen.getByText(/planificando/)).toBeTruthy();
    // Turno EN CURSO (no ha llegado `fin`): el resumen lo DICE, y el pulso nace PLEGADO
    // también entonces. Se abría, «porque es lo único que se ve mientras trabaja»; dejó de
    // ser cierto cuando ese resumen empezó a llevar el paso actual y su cronómetro —lo que se
    // lee con el pulso plegado—, y un tramo abierto de cuarenta pasos empuja la respuesta
    // fuera de la pantalla.
    expect(screen.getByText(/trabajando/i)).toBeTruthy();
    expect(document.querySelector("details")?.hasAttribute("open")).toBe(false);
  });

  /**
   * Al terminar el turno, el andamio se dobla: la conversación se lee sin él y sigue a un
   * clic. No se borra — lo que pasó, pasó.
   */
  it("cuando el turno TERMINA, el pulso se pliega en una línea con su cuenta", () => {
    render(
      <Transcript
        actos={[
          { tipo: "usuario", texto: "hola" },
          { tipo: "razonamiento", texto: "lo pienso" },
          { tipo: "herramientas", lineas: ["read_file a", "read_file b"] },
          { tipo: "asistente", texto: "hecho" },
          { tipo: "fin", ms: 12400 },
        ]}
      />
    );
    const detalle = document.querySelector("details")!;
    expect(detalle.hasAttribute("open")).toBe(false);
    // Tres pasos: el razonamiento y las dos líneas de tool.
    expect(detalle.textContent).toMatch(/3 pasos/);
    expect(detalle.textContent).toMatch(/12\.4s/);
    // Y la respuesta se sigue leyendo, que es lo que queda cuando se dobla el andamio.
    expect(screen.getByText("hecho")).toBeTruthy();
  });

  /**
   * Los avisos de la consola SÍ se ven en el chat, y esto cambió a propósito: estaban solo
   * en las trazas, y por ese canal pasan la respuesta a un comando que el usuario acaba de
   * teclear y los avisos de honestidad (`core/bitacora.ts`). Un aviso que solo vive en la
   * pestaña de depurar el harness es exactamente el aviso que nadie lee.
   *
   * Lo que sigue siendo SOLO de las trazas es el `fin`: es el cierre del turno con su
   * duración, un dato del registro y no algo que nadie tenga que leer en la conversación.
   */
  it("se ven los avisos de sistema, pero no el cierre del turno", () => {
    render(
      <Transcript
        actos={[
          { tipo: "sistema", texto: "credencial guardada en algún sitio" },
          { tipo: "fin", ms: 1200 },
        ]}
      />
    );
    expect(screen.getByText(/credencial guardada/)).toBeTruthy();
    expect(screen.queryByText(/1200|1,2 s|1\.2s/)).toBeNull();
  });

  it("no monta ninguna otra vista: la conversación no compite con las pestañas", () => {
    // Mientras despachaba, una pestaña mal cableada pintaba aquí el panel de al lado. Hoy
    // aquí no hay nada que elegir, y este test es el que impide que vuelva a haberlo.
    render(<Transcript actos={[...ACTOS]} />);
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryByRole("tab")).toBeNull();
  });
});

describe("Transcript: la propuesta de tareas llega al Chat con sus acciones", () => {
  // Medido en el navegador: `App` pasaba las acciones y `Transcript` no las reenviaba, así que la
  // tarjeta salía sin encargos ni botones. Las pruebas del Chat no lo veían: montan el Chat directo.
  it("con las acciones, la tarjeta ofrece encolar y hacerlo en el chat", async () => {
    const encolar = vi.fn(async () => undefined);
    render(
      <Transcript
        actos={[{ tipo: "propuesta-de-tareas", id: "p1", motivo: "dos", tareas: [{ titulo: "A", peticion: "haz A" }, { titulo: "B", peticion: "haz B" }] }]}
        alEncolarPropuesta={encolar}
        alHacerPropuestaEnChat={vi.fn(async () => undefined)}
        alDescartarPropuesta={vi.fn(async () => undefined)}
      />
    );
    expect(screen.getByRole("button", { name: "Hacerlo aquí en el chat" })).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Encolar en orden" }));
    });
    expect(encolar).toHaveBeenCalledWith("p1", ["haz A", "haz B"]);
  });
});
