import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DESPLEGADOS_AL_ABRIR, Revision } from "./Revision.js";
import type { FicheroTocado } from "../tipos.js";

const NADA = () => {};
const VACIO: ReadonlySet<string> = new Set();

const diez = (): FicheroTocado[] =>
  Array.from({ length: 10 }, (_, i) => ({ ruta: `src/f${i}.xne`, clase: "modificado", mas: i, menos: 1 }));

describe("Revision: los avisos", () => {
  afterEach(cleanup);

  /**
   * El fallo mudo que esto vigila: sin marca de sesión no hay con qué comparar, y una
   * lista vacía en ese caso AFIRMA que la sesión no tocó nada. Es exactamente lo
   * contrario de lo que se sabe, que es que no se sabe.
   */
  it("«sin-marca» dice que no se puede saber, no que no haya cambios", () => {
    render(
      <Revision via="sin-marca" ficheros={[]} parches={{}} desplegados={VACIO} alDesplegar={NADA} alPlegar={NADA} alRecargar={NADA} />
    );
    expect(screen.getByText(/no se puede saber/i)).toBeTruthy();
    expect(screen.queryByText(/no ha tocado ningún fichero/i)).toBeNull();
  });

  it("«sin-empezar» dice que la sesión no ha empezado, sin mandar a mirar si hay git", () => {
    // Es el estado de recién abierto un proyecto: no hay id de sesión todavía. Aquí SÍ se
    // sabe que no ha tocado nada; lo que no vale es el diagnóstico de «sin-marca».
    render(
      <Revision via="sin-empezar" ficheros={[]} parches={{}} desplegados={VACIO} alDesplegar={NADA} alPlegar={NADA} alRecargar={NADA} />
    );
    expect(screen.getByText(/todavía no ha empezado/i)).toBeTruthy();
    expect(screen.queryByText(/repositorio de git/i)).toBeNull();
  });

  it("con git y lista vacía sí se afirma que no hay cambios", () => {
    render(<Revision via="git" ficheros={[]} parches={{}} desplegados={VACIO} alDesplegar={NADA} alPlegar={NADA} alRecargar={NADA} />);
    expect(screen.getByText(/no ha tocado ningún fichero/i)).toBeTruthy();
  });

  it("pide la lista al montar: entrar a mirar ES la petición", () => {
    const recargar = vi.fn();
    render(
      <Revision via="git" ficheros={[]} parches={{}} desplegados={VACIO} alDesplegar={NADA} alPlegar={NADA} alRecargar={recargar} />
    );
    expect(recargar).toHaveBeenCalledTimes(1);
  });
});

describe("Revision: la sesión reabierta", () => {
  afterEach(cleanup);

  it("con «sin-marca» y la sesión reabierta dice la causa que conoce, no dos posibles", () => {
    render(
      <Revision
        via="sin-marca"
        historica
        ficheros={[]}
        parches={{}}
        desplegados={VACIO}
        alDesplegar={NADA}
        alPlegar={NADA}
        alRecargar={NADA}
      />
    );
    expect(screen.getByText(/se reabrió/i)).toBeTruthy();
    expect(screen.queryByText(/repositorio de git/i)).toBeNull();
  });
});

describe("Revision: la pila", () => {
  afterEach(cleanup);

  it("la cabecera dice «Sesión» y suma el total, con los binarios aparte", () => {
    render(
      <Revision
        via="git"
        ficheros={[
          { ruta: "a.xne", clase: "modificado", mas: 10, menos: 3 },
          { ruta: "b.js", clase: "nuevo", mas: 5, menos: 1 },
          { ruta: "img/logo.png", clase: "nuevo" },
        ]}
        parches={{}}
        desplegados={VACIO}
        alDesplegar={NADA}
        alPlegar={NADA}
        alRecargar={NADA}
      />
    );
    expect(screen.getByText("Sesión")).toBeTruthy();
    // +15 y −4 son únicos en pantalla: ningún fichero suelto suma eso.
    expect(screen.getByText("+15")).toBeTruthy();
    expect(screen.getByText("−4")).toBeTruthy();
    expect(screen.getByText(/y 1 binario/)).toBeTruthy();
  });

  it("los desplegados llevan aria-expanded=true y el resto false", () => {
    const abiertos = new Set(diez().slice(0, DESPLEGADOS_AL_ABRIR).map((f) => f.ruta));
    render(<Revision via="git" ficheros={diez()} parches={{}} desplegados={abiertos} alDesplegar={NADA} alPlegar={NADA} alRecargar={NADA} />);
    const cabeceras = screen.getAllByRole("button", { expanded: true });
    expect(cabeceras).toHaveLength(DESPLEGADOS_AL_ABRIR);
    expect(screen.getAllByRole("button", { expanded: false })).toHaveLength(2);
  });

  it("pulsar la cabecera de uno plegado despliega; de uno desplegado, pliega", () => {
    const alDesplegar = vi.fn();
    const alPlegar = vi.fn();
    render(
      <Revision
        via="git"
        ficheros={[{ ruta: "a.xne", clase: "modificado", mas: 1, menos: 1 }, { ruta: "b.xne", clase: "nuevo", mas: 1, menos: 0 }]}
        parches={{}}
        desplegados={new Set(["a.xne"])}
        alDesplegar={alDesplegar}
        alPlegar={alPlegar}
        alRecargar={NADA}
      />
    );
    // La cabecera del bloque y la hoja del árbol comparten nombre: se elige la del bloque por su rol expandido.
    fireEvent.click(screen.getByRole("button", { name: /b\.xne/, expanded: false }));
    expect(alDesplegar).toHaveBeenCalledWith("b.xne");
    fireEvent.click(screen.getByRole("button", { name: /a\.xne/, expanded: true }));
    expect(alPlegar).toHaveBeenCalledWith("a.xne");
  });

  it("un bloque desplegado pinta el diff con las dos columnas de número", () => {
    const { container } = render(
      <Revision
        via="git"
        ficheros={[{ ruta: "a.js", clase: "modificado", mas: 1, menos: 1 }]}
        parches={{ "a.js": { texto: "--- a/a.js\n+++ b/a.js\n@@ -3,2 +3,2 @@\n uno\n-viejo\n+nuevo", recortado: false } }}
        desplegados={new Set(["a.js"])}
        alDesplegar={NADA}
        alPlegar={NADA}
        alRecargar={NADA}
      />
    );
    const tipos = [...container.querySelectorAll("[data-tipo]")].map((n) => n.getAttribute("data-tipo"));
    expect(tipos).toEqual(["tramo", "contexto", "menos", "mas"]);
    const contexto = container.querySelector('[data-tipo="contexto"]')!;
    expect(contexto.querySelector("[data-viejo]")!.textContent).toBe("3");
    expect(contexto.querySelector("[data-nuevo]")!.textContent).toBe("3");
    expect(container.querySelector('[data-tipo="menos"] [data-nuevo]')!.textContent).toBe("");
    expect(container.textContent).not.toContain("+++");
  });

  it("un binario dice «binario», no «+0 −0»", () => {
    render(<Revision via="git" ficheros={[{ ruta: "img/logo.png", clase: "nuevo" }]} parches={{}} desplegados={VACIO} alDesplegar={NADA} alPlegar={NADA} alRecargar={NADA} />);
    expect(screen.getAllByText("binario").length).toBeGreaterThan(0);
    expect(screen.queryByText("+0")).toBeNull();
  });

  it("un parche recortado lo dice", () => {
    render(
      <Revision via="git" ficheros={[{ ruta: "a.js", clase: "modificado", mas: 9000, menos: 0 }]} parches={{ "a.js": { texto: "@@ -1 +1 @@\n+una", recortado: true } }} desplegados={new Set(["a.js"])} alDesplegar={NADA} alPlegar={NADA} alRecargar={NADA} />
    );
    expect(screen.getByText(/se ha cortado/i)).toBeTruthy();
  });

  it("pulsar una hoja del árbol de la derecha despliega ese fichero", () => {
    const alDesplegar = vi.fn();
    render(
      <Revision via="git" ficheros={[{ ruta: "src/a.xne", clase: "modificado", mas: 1, menos: 1 }]} parches={{}} desplegados={VACIO} alDesplegar={alDesplegar} alPlegar={NADA} alRecargar={NADA} />
    );
    fireEvent.click(screen.getByRole("treeitem", { name: /a\.xne/ }));
    expect(alDesplegar).toHaveBeenCalledWith("src/a.xne");
  });
});
