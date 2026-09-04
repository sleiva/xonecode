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

  it("con «chat» pinta la conversación, y NO el detalle técnico de la trayectoria", () => {
    render(<Transcript actos={[...ACTOS]} pestana="chat" />);
    expect(screen.getByText("hola")).toBeTruthy();
    expect(screen.queryByText(/read_file/)).toBeNull();
  });

  it("con «trayectoria» pinta el detalle técnico", () => {
    render(<Transcript actos={[...ACTOS]} pestana="trayectoria" />);
    expect(screen.getByText(/read_file/)).toBeTruthy();
  });
});
