import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Ficheros, lineasDeParche } from "./Ficheros.js";

const NADA = () => {};

describe("Ficheros", () => {
  afterEach(cleanup);

  /**
   * El fallo mudo que esto vigila: sin marca de sesión no hay con qué comparar, y una
   * lista vacía en ese caso AFIRMA que la sesión no tocó nada. Es exactamente lo
   * contrario de lo que se sabe, que es que no se sabe.
   */
  it("«sin-marca» dice que no se puede saber, no que no haya cambios", () => {
    render(<Ficheros via="sin-marca" ficheros={[]} parches={{}} alAbrir={NADA} alRecargar={NADA} />);
    expect(screen.getByText(/no se puede saber/i)).toBeTruthy();
    expect(screen.queryByText(/no ha tocado ningún fichero/i)).toBeNull();
  });

  it("«sin-empezar» dice que la sesión no ha empezado, sin mandar a mirar si hay git", () => {
    // Es el estado de recién abierto un proyecto: no hay id de sesión todavía. Aquí SÍ se
    // sabe que no ha tocado nada; lo que no vale es el diagnóstico de «sin-marca».
    render(<Ficheros via="sin-empezar" ficheros={[]} parches={{}} alAbrir={NADA} alRecargar={NADA} />);
    expect(screen.getByText(/todavía no ha empezado/i)).toBeTruthy();
    expect(screen.queryByText(/repositorio de git/i)).toBeNull();
  });

  it("con git y lista vacía sí se afirma que no hay cambios", () => {
    render(<Ficheros via="git" ficheros={[]} parches={{}} alAbrir={NADA} alRecargar={NADA} />);
    expect(screen.getByText(/no ha tocado ningún fichero/i)).toBeTruthy();
  });

  it("pide la lista al montar: entrar a mirar ES la petición", () => {
    const recargar = vi.fn();
    render(<Ficheros via="git" ficheros={[]} parches={{}} alAbrir={NADA} alRecargar={recargar} />);
    expect(recargar).toHaveBeenCalledTimes(1);
  });

  /**
   * El parche se pide al DESPLEGAR, no al abrir la pestaña: un turno largo son megas de
   * diff y casi ninguno se mira. Y volver a pulsar pliega sin pedir nada.
   */
  it("desplegar pide el parche de ESA ruta; plegar no pide nada", () => {
    const abrir = vi.fn();
    render(
      <Ficheros
        via="git"
        ficheros={[{ ruta: "src/app.xne", clase: "modificado", mas: 3, menos: 1 }]}
        parches={{}}
        alAbrir={abrir}
        alRecargar={NADA}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /app\.xne/ }));
    expect(abrir).toHaveBeenCalledWith("src/app.xne");

    cleanup();
    abrir.mockClear();
    render(
      <Ficheros
        via="git"
        ficheros={[{ ruta: "src/app.xne", clase: "modificado", mas: 3, menos: 1 }]}
        parches={{ "src/app.xne": { texto: "@@ -1 +1 @@\n-a\n+b", recortado: false } }}
        abierto="src/app.xne"
        alAbrir={abrir}
        alRecargar={NADA}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /app\.xne/ }));
    expect(abrir).toHaveBeenCalledWith(undefined);
  });

  /**
   * Un binario no trae cuenta de líneas (`--numstat` escribe «-») y no se le inventa un
   * cero: «+0 −0» diría que el fichero cambió sin cambiar nada.
   */
  it("un binario dice «binario», no «+0 −0»", () => {
    render(
      <Ficheros
        via="git"
        ficheros={[{ ruta: "img/logo.png", clase: "nuevo" }]}
        parches={{}}
        alAbrir={NADA}
        alRecargar={NADA}
      />
    );
    expect(screen.getByText("binario")).toBeTruthy();
    expect(screen.queryByText("+0")).toBeNull();
  });

  /**
   * La cabecera de git (`diff --git`, `index`, `---`, `+++`) no se pinta: son cuatro líneas
   * de ruido al principio de CADA fichero que no dicen nada que no diga ya el nombre de la
   * fila, y empujan el primer cambio de verdad fuera de la vista. Se corta en el primer
   * `@@`. Y las que quedan se clasifican bien: `+++`/`---` NO son alta ni baja, y pintarlas
   * de verde y rojo hacía que cada fichero pareciera empezar con una línea añadida y otra
   * borrada.
   */
  it("la cabecera de git no se pinta; el diff empieza en el primer «@@»", () => {
    const { container } = render(
      <Ficheros
        via="git"
        ficheros={[{ ruta: "a.js", clase: "modificado", mas: 1, menos: 1 }]}
        parches={{
          "a.js": { texto: "--- a/a.js\n+++ b/a.js\n@@ -1 +1 @@\n-viejo\n+nuevo", recortado: false },
        }}
        abierto="a.js"
        alAbrir={NADA}
        alRecargar={NADA}
      />
    );
    const tipos = [...container.querySelectorAll("[data-tipo]")].map((n) => n.getAttribute("data-tipo"));
    expect(tipos).toEqual(["trozo", "quitado", "anadido"]);
    expect(container.textContent).not.toContain("+++");
  });

  /**
   * Un parche SIN ningún `@@` —un binario, un cambio de modo— no se recorta: eso es todo lo
   * que git tiene que decir del fichero, y esconderlo dejaría el panel vacío sin explicar
   * por qué.
   */
  it("sin ningún «@@» no se corta nada: es todo lo que hay", () => {
    expect(lineasDeParche("diff --git a/x b/x\nBinary files differ")).toEqual([
      "diff --git a/x b/x",
      "Binary files differ",
    ]);
  });

  it("un parche recortado lo dice: un diff a medias sin avisar es un diff falso", () => {
    render(
      <Ficheros
        via="git"
        ficheros={[{ ruta: "a.js", clase: "modificado", mas: 9000, menos: 0 }]}
        parches={{ "a.js": { texto: "+una", recortado: true } }}
        abierto="a.js"
        alAbrir={NADA}
        alRecargar={NADA}
      />
    );
    expect(screen.getByText(/se ha cortado/i)).toBeTruthy();
  });
});

describe("Ficheros: la sesión reabierta", () => {
  it("con «sin-marca» y la sesión reabierta dice la causa que conoce, no dos posibles", () => {
    render(<Ficheros via="sin-marca" historica ficheros={[]} parches={{}} alAbrir={NADA} alRecargar={NADA} />);
    expect(screen.getByText(/se reabrió/i)).toBeTruthy();
    expect(screen.queryByText(/repositorio de git/i)).toBeNull();
  });
});
