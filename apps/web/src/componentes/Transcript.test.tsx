import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, it, expect } from "vitest";
import { Transcript } from "./Transcript.js";

// `globals` no está activado: sin `cleanup` explícito el segundo `render()` de este
// fichero deja montado el primero y las consultas revientan con «found multiple
// elements» — la misma trampa que ya documenta `Compositor.test.tsx`.
afterEach(cleanup);

/**
 * `Transcript` ya no lleva las pestañas: se fueron a `Cabecera`, que es donde viven en el
 * CSS de deepseek (dentro del mismo `<header>` que pinta la línea de separación), y con
 * ellas se fue el `useState`. Lo que queda que probar aquí es que la pestaña que le
 * DICEN es la vista que pinta — el comportamiento de la tira está en `Cabecera.test.tsx`.
 */
describe("Transcript", () => {
  const ACTOS = [
    { tipo: "usuario", texto: "hola" },
    { tipo: "herramientas", lineas: ["read_file docs/uno.xne"] },
  ] as const;

  /**
   * El trabajo del agente se ve EN EL CHAT, no solo en la otra pestaña. Antes el chat
   * pintaba únicamente los globos y todo lo demás vivía en la Trayectoria: se escribía una
   * petición y no pasaba nada durante minutos, con el agente trabajando a la vista de nadie.
   */
  it("con «chat» pinta la conversación Y el pulso del turno: tools, fases y razonamiento", () => {
    render(
      <Transcript
        actos={[
          ...ACTOS,
          { tipo: "razonamiento", texto: "lo pienso" },
          { tipo: "fase", texto: "planificando", ms: 2400 },
        ]}
        pestana="chat"
      />
    );
    expect(screen.getByText("hola")).toBeTruthy();
    expect(screen.getByText(/read_file/)).toBeTruthy();
    expect(screen.getByText(/planificando/)).toBeTruthy();
    // Turno EN CURSO (no ha llegado `fin`): el pulso se ve abierto, que es lo único que hay
    // que mirar mientras el agente trabaja.
    expect(screen.getByText(/trabajando/i)).toBeTruthy();
    expect(document.querySelector("details")?.hasAttribute("open")).toBe(true);
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
        pestana="chat"
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
   * Lo que sigue siendo SOLO de la trayectoria: los avisos de la consola (`sistema`) y el
   * cierre con la duración (`fin`). El chat es el pulso; la pestaña, el registro completo.
   */
  it("con «chat» NO se cuelan los avisos de sistema ni el cierre del turno", () => {
    render(
      <Transcript
        actos={[
          { tipo: "sistema", texto: "credencial guardada en algún sitio" },
          { tipo: "fin", ms: 1200 },
        ]}
        pestana="chat"
      />
    );
    expect(screen.queryByText(/credencial guardada/)).toBeNull();
  });

  it("con «trayectoria» pinta el detalle técnico", () => {
    render(<Transcript actos={[...ACTOS]} pestana="trayectoria" />);
    expect(screen.getByText(/read_file/)).toBeTruthy();
  });
});
