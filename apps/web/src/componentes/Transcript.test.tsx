import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { afterEach, describe, it, expect } from "vitest";
import { Transcript } from "./Transcript.js";

// `globals` no está activado (proyecto «cliente» de `vitest.config.ts`): sin `cleanup`
// explícito el segundo `render()` de este fichero deja montado el primero y
// `getByRole("tab", …)` revienta con «found multiple elements» — la misma trampa que ya
// documenta `Compositor.test.tsx`.
afterEach(cleanup);

describe("Transcript", () => {
  it("empieza en Chat y cambia a Trayectoria al pulsar su pestaña", () => {
    render(<Transcript actos={[{ tipo: "usuario", texto: "hola" }]} />);
    expect(screen.getByRole("tab", { name: "Chat" }).getAttribute("aria-selected")).toBe("true");

    fireEvent.click(screen.getByRole("tab", { name: "Trayectoria" }));
    expect(screen.getByRole("tab", { name: "Trayectoria" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tab", { name: "Chat" }).getAttribute("aria-selected")).toBe("false");
  });

  it("la pestaña elegida se recuerda mientras dure la página: sobrevive a que lleguen más actos", () => {
    const { rerender } = render(<Transcript actos={[{ tipo: "usuario", texto: "hola" }]} />);
    fireEvent.click(screen.getByRole("tab", { name: "Trayectoria" }));

    // Un acto nuevo re-renderiza el árbol (lo mismo que hace `App` al recibir un mensaje
    // por `suscribir`) sin desmontar `Transcript`: si la pestaña se «olvidara» aquí,
    // volvería a Chat en cuanto entrara CUALQUIER acto — justo lo que el criterio
    // de aceptación prohíbe.
    rerender(
      <Transcript
        actos={[
          { tipo: "usuario", texto: "hola" },
          { tipo: "asistente", texto: "hecho" },
        ]}
      />
    );
    expect(screen.getByRole("tab", { name: "Trayectoria" }).getAttribute("aria-selected")).toBe("true");
  });
});
