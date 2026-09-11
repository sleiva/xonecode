import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Revision } from "./Revision.js";
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

  it("pide la lista cuando NO la tiene: al montar y al quedarse sin ella", () => {
    // Sin `via` no ha llegado respuesta: entrar a mirar ES la petición. Y al cambiar de
    // proyecto el store la tira sin desmontar este componente, así que se vuelve a pedir
    // — con la petición solo en el montaje, la pestaña se quedaba «Consultando…» para
    // siempre (el mismo fallo medido en Ficheros).
    const recargar = vi.fn();
    const { rerender } = render(
      <Revision ficheros={[]} parches={{}} desplegados={VACIO} alDesplegar={NADA} alPlegar={NADA} alRecargar={recargar} />
    );
    expect(recargar).toHaveBeenCalledTimes(1);
    rerender(
      <Revision via="git" ficheros={[]} parches={{}} desplegados={VACIO} alDesplegar={NADA} alPlegar={NADA} alRecargar={recargar} />
    );
    expect(recargar).toHaveBeenCalledTimes(1); // ya la tiene: no se repite
    rerender(
      <Revision ficheros={[]} parches={{}} desplegados={VACIO} alDesplegar={NADA} alPlegar={NADA} alRecargar={recargar} />
    );
    expect(recargar).toHaveBeenCalledTimes(2);
  });

  it("sin cable no pide la lista, y la reconexión la recupera", () => {
    const recargar = vi.fn();
    const { rerender } = render(
      <Revision ficheros={[]} parches={{}} desplegados={VACIO} alDesplegar={NADA} alPlegar={NADA} alRecargar={recargar} conectado={false} />
    );
    expect(recargar).not.toHaveBeenCalled();
    rerender(
      <Revision ficheros={[]} parches={{}} desplegados={VACIO} alDesplegar={NADA} alPlegar={NADA} alRecargar={recargar} conectado={true} />
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
    const abiertos = new Set(diez().slice(0, 8).map((f) => f.ruta));
    render(<Revision via="git" ficheros={diez()} parches={{}} desplegados={abiertos} alDesplegar={NADA} alPlegar={NADA} alRecargar={NADA} />);
    const cabeceras = screen.getAllByRole("button", { expanded: true });
    expect(cabeceras).toHaveLength(8);
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

/**
 * El rótulo de la cabecera es lo ÚNICO que separa dos afirmaciones distintas, y por eso va
 * con test: «Sesión» dice que lo de abajo lo hizo esta sesión, y eso solo se puede sostener
 * con atribución por commit. MEDIDO en el proyecto del usuario el 10-09-2026: una
 * conversación enseñaba «Sesión +1266 −1» sobre dos ficheros que había escrito una tarea de
 * fondo veinte minutos después.
 */
describe("Revision: qué se AFIRMA según cómo se haya medido", () => {
  afterEach(cleanup);

  const uno = (extra: Partial<FicheroTocado> = {}): FicheroTocado[] => [
    { ruta: "doc/README.md", clase: "modificado", mas: 3, menos: 1, ...extra },
  ];

  it("con atribución por commit dice «Sesión» y no explica nada más", () => {
    render(
      <Revision via="git" ficheros={uno()} parches={{}} desplegados={VACIO} alDesplegar={NADA} alPlegar={NADA} alRecargar={NADA} />
    );
    expect(screen.getByText("Sesión")).toBeTruthy();
    expect(screen.queryByText(/desde que se abrió/i)).toBeNull();
  });

  it("sin sello NO dice «Sesión»: dice desde cuándo, y que puede ser de otro", () => {
    render(
      <Revision
        via="desde-apertura"
        ficheros={uno()}
        parches={{}}
        desplegados={VACIO}
        alDesplegar={NADA}
        alPlegar={NADA}
        alRecargar={NADA}
      />
    );
    expect(screen.queryByText("Sesión")).toBeNull();
    expect(screen.getByText("Desde que abriste")).toBeTruthy();
    expect(screen.getByText(/otras sesiones o una tarea de fondo/i)).toBeTruthy();
  });

  it("y con lista vacía tampoco afirma lo mismo por los dos caminos", () => {
    render(
      <Revision via="desde-apertura" ficheros={[]} parches={{}} desplegados={VACIO} alDesplegar={NADA} alPlegar={NADA} alRecargar={NADA} />
    );
    expect(screen.getByText(/no ha cambiado ningún fichero del proyecto/i)).toBeTruthy();
    expect(screen.queryByText(/esta sesión todavía no ha tocado/i)).toBeNull();
  });

  it("los commits de otra sesión entremedias se DICEN, con el alcance exacto de la duda", () => {
    // La lista sigue siendo de esta sesión (se construye commit a commit); lo que puede
    // traer hunks ajenos es un parche. Decir menos sería fingir aislamiento, y decir más
    // —«esta lista no es fiable»— sería falso.
    render(
      <Revision
        via="git"
        mezclados={2}
        ficheros={uno()}
        parches={{}}
        desplegados={VACIO}
        alDesplegar={NADA}
        alPlegar={NADA}
        alRecargar={NADA}
      />
    );
    expect(screen.getByText(/2 commits de otras sesiones/i)).toBeTruthy();
  });

  it("un fichero que nadie ha commiteado lo dice en su fila", () => {
    render(
      <Revision
        via="git"
        ficheros={uno({ sinCommitear: true })}
        parches={{}}
        desplegados={VACIO}
        alDesplegar={NADA}
        alPlegar={NADA}
        alRecargar={NADA}
      />
    );
    expect(screen.getByText("sin commitear")).toBeTruthy();
  });
});
