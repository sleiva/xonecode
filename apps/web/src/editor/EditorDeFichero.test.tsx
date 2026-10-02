import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { prepararJsdomParaElEditor } from "./jsdomParaElEditor.js";
import EditorDeFichero from "./EditorDeFichero.js";
import type { BaseDelFichero } from "../tipos.js";

beforeAll(prepararJsdomParaElEditor);
afterEach(cleanup);

describe("CodeMirror en jsdom", () => {
  it("monta, pinta las líneas y aplica un cambio", async () => {
    const padre = document.createElement("div");
    document.body.append(padre);
    const vista = new EditorView({ parent: padre, state: EditorState.create({ doc: "a\nb\nc" }) });
    await new Promise((r) => setTimeout(r, 30));
    expect(padre.querySelectorAll(".cm-line")).toHaveLength(3);
    vista.dispatch({ changes: { from: 0, insert: "X" } });
    expect(vista.state.doc.toString()).toBe("Xa\nb\nc");
    vista.destroy();
    padre.remove();
  });
});

const vistaDe = (contenedor: HTMLElement): EditorView => EditorView.findFromDOM(contenedor.querySelector(".cm-editor") as HTMLElement)!;
const BASE = (texto: string): BaseDelFichero => ({ ruta: "a.xne", base: "sesion", texto });

function montar(props: Partial<Parameters<typeof EditorDeFichero>[0]> = {}) {
  const alCambiar = vi.fn();
  const alGuardar = vi.fn();
  const alElegirBase = vi.fn();
  const vista = render(
    <EditorDeFichero
      texto={"a\nb\nc"}
      lenguaje="xml"
      baseElegida="sesion"
      alCambiar={alCambiar}
      alGuardar={alGuardar}
      alElegirBase={alElegirBase}
      {...props}
    />
  );
  return { ...vista, alCambiar, alGuardar, alElegirBase };
}

describe("EditorDeFichero", () => {
  it("teclear avisa con el documento entero", () => {
    const { container, alCambiar } = montar();
    vistaDe(container).dispatch({ changes: { from: 0, insert: "X" } });
    expect(alCambiar).toHaveBeenLastCalledWith("Xa\nb\nc");
  });

  it("contra una base distinta marca la línea cambiada y lo cuenta abajo", async () => {
    const { container } = montar({ texto: "a\nB\nc", base: BASE("a\nb\nc") });
    await waitFor(() => expect(container.querySelectorAll('[data-marca~="cambiada"]')).toHaveLength(1));
    expect(screen.getByText("1 cambiada · 0 nuevas · 0 borradas")).toBeTruthy();
  });

  it("pulsar la marca enseña lo de antes, y «Deshacer este cambio» devuelve SOLO ese trozo", async () => {
    // En jsdom todas las alturas son cero y el margen resuelve cualquier clic a la PRIMERA línea:
    // por eso el cambio está en la primera.
    const { container, alCambiar } = montar({ texto: "A\nb", base: BASE("a\nb") });
    await waitFor(() => expect(container.querySelector('[data-marca~="cambiada"]')).not.toBeNull());
    fireEvent.mouseDown(container.querySelector('[data-marca~="cambiada"]')!);
    expect(screen.getByText("Antes:")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Deshacer este cambio" }));
    expect(vistaDe(container).state.doc.toString()).toBe("a\nb");
    expect(alCambiar).toHaveBeenLastCalledWith("a\nb");
  });

  it("con «vacio» todo es nuevo", async () => {
    const { container } = montar({ texto: "x\ny", base: { ruta: "a.xne", base: "sesion", vacio: true } });
    await waitFor(() => expect(container.querySelectorAll('[data-marca~="nueva"]')).toHaveLength(2));
    expect(screen.getByText("0 cambiadas · 2 nuevas · 0 borradas")).toBeTruthy();
  });

  it("sin base no hay marcas, y la barra dice por qué; mientras llega, que se está trayendo", async () => {
    const { container, rerender, alCambiar, alGuardar, alElegirBase } = montar();
    expect(screen.getByText("Trayendo la base…")).toBeTruthy();
    rerender(
      <EditorDeFichero
        texto={"a\nb\nc"}
        baseElegida="sesion"
        base={{ ruta: "a.xne", base: "sesion", sinBase: "el proyecto no está en un repositorio git" }}
        alCambiar={alCambiar}
        alGuardar={alGuardar}
        alElegirBase={alElegirBase}
      />
    );
    expect(screen.getByText("Sin marcas: el proyecto no está en un repositorio git")).toBeTruthy();
    expect(container.querySelector("[data-marca]")).toBeNull();
  });

  it("Mod-s guarda, y el selector elige la base", () => {
    const { container, alGuardar, alElegirBase } = montar();
    // En jsdom `navigator.platform` no es Mac, así que «Mod» es Ctrl; con Meta además no casaría.
    fireEvent.keyDown(container.querySelector(".cm-content")!, { key: "s", ctrlKey: true });
    expect(alGuardar).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByLabelText("Comparar con"), { target: { value: "commit" } });
    expect(alElegirBase).toHaveBeenCalledWith("commit");
  });
});
