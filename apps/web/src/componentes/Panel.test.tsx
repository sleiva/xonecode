import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { Panel } from "./Panel.js";

afterEach(cleanup);

/**
 * `Panel` es lo que se abre AL LADO del chat (o en su sitio, en una ventana estrecha). Lo
 * que se prueba aquí es su despacho: que la pestaña elegida pinta SU vista y no la de al
 * lado. La tira está en `Pestanas.test.tsx` y el reparto de columnas en
 * `repartoDeColumnas.test.ts`.
 */
describe("Panel", () => {
  const ACTOS = [
    { tipo: "usuario", texto: "hola" },
    { tipo: "herramientas", lineas: ["read_file docs/uno.xne"] },
  ] as const;

  const base = {
    alElegirPestana: vi.fn(),
    alCerrar: vi.fn(),
    actos: [...ACTOS],
  };

  it("con «trazas» pinta el detalle técnico, que es la única vista que no llega por ranura", () => {
    render(<Panel {...base} pestana="trazas" />);
    expect(screen.getByText(/read_file/)).toBeTruthy();
  });

  /**
   * **La ranura, no el contenido**: cada vista se monta al elegir su pestaña y solo entonces
   * —`{pestana === … ? … : …}`—, que es lo que hace que la petición que cada una lleva dentro
   * no salga hasta que alguien abre la suya. Si Revisión se cayera del despacho, la pestaña se
   * pintaría VACÍA, y eso es un control sin dato detrás con su botón ya pulsado.
   *
   * Revisión es además la que lleva DENTRO la banda de CloudStudio, así que este es el test
   * que vigila que la mudanza no dejara sus dos botones sin montar en ninguna pestaña.
   */
  it("la pestaña «revision» pinta SU vista, y no la de al lado", () => {
    render(
      <Panel {...base} pestana="revision" revision={<p>lo de revisión</p>} ficheros={<p>lo de ficheros</p>} />
    );
    expect(screen.getByText("lo de revisión")).toBeTruthy();
    expect(screen.queryByText("lo de ficheros")).toBeNull();
  });

  /**
   * **Aquí el despacho tiene una trampa que las otras pestañas no tienen: la última rama es
   * un `else` INCONDICIONAL.**
   *
   * La cadena acaba en `: pestana === "ejecutar" ? (ejecutar) : (ficheros)` — sin condición—,
   * así que una pestaña que no tenga su rama propia **no se queda vacía: pinta FICHEROS**, que
   * es la vista de otra. Y no se queda vacía en silencio, además: enseña un contenido plausible
   * y equivocado, con lo que el síntoma es «la pestaña Ejecutar me muestra el árbol del
   * proyecto» y no un hueco que alguien vaya a investigar.
   *
   * Por eso este caso no comprueba solo que se pinte SU vista —eso lo haría pasar el `else`
   * por accidente si la de al lado no estuviera montada—: monta las dos a la vez y exige que se
   * vea la suya **y que la de Ficheros NO**. Con la rama borrada, este test se pone rojo; sin
   * él, borrarla no rompía nada.
   */
  it("«ejecutar» pinta SU vista y no Ficheros: la última rama del ternario es un `else`", () => {
    render(<Panel {...base} pestana="ejecutar" ejecutar={<p>lo de ejecutar</p>} ficheros={<p>lo de ficheros</p>} />);
    expect(screen.getByText("lo de ejecutar")).toBeTruthy();
    expect(screen.queryByText("lo de ficheros")).toBeNull();
  });

  it("«tareas» y «artefactos» también pintan la suya", () => {
    render(<Panel {...base} pestana="tareas" tareas={<p>lo de tareas</p>} ficheros={<p>lo de ficheros</p>} />);
    expect(screen.getByText("lo de tareas")).toBeTruthy();
    expect(screen.queryByText("lo de ficheros")).toBeNull();
    cleanup();
    render(
      <Panel
        {...base}
        pestana="artefactos"
        hayArtefactos
        artefactos={<p>lo dibujado</p>}
        ficheros={<p>lo de ficheros</p>}
      />
    );
    expect(screen.getByText("lo dibujado")).toBeTruthy();
    expect(screen.queryByText("lo de ficheros")).toBeNull();
  });

  it("lleva su tira, con la salida", () => {
    const alCerrar = vi.fn();
    render(<Panel {...base} alCerrar={alCerrar} pestana="ficheros" ficheros={<p>lo de ficheros</p>} />);
    expect(screen.getByRole("tablist")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cerrar el panel" }));
    expect(alCerrar).toHaveBeenCalledTimes(1);
  });

  it("es una `region` con nombre: en la ventana ancha es una columna entera de la pantalla", () => {
    // Sin landmark, llegar a ella con el teclado obliga a tabular por todo el chat que tiene
    // delante.
    render(<Panel {...base} pestana="ficheros" ficheros={<p>lo de ficheros</p>} />);
    expect(screen.getByRole("region", { name: "Panel" })).toBeTruthy();
  });
});
