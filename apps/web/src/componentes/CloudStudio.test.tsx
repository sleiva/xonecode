import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CloudStudio } from "./CloudStudio.js";

const NADA = () => {};

describe("CloudStudio: la medida", () => {
  afterEach(cleanup);

  /**
   * Sin lectura todavía no se pinta ni un cero ni el estado vacío de «no es de CloudStudio»:
   * las tres cosas son distintas y confundirlas es la mentira que esta banda existe para no
   * contar. Aquí el servidor puede tardar —la medida es un `git diff`, no un campo del alta—,
   * así que «Consultando» es un estado de verdad con nombre propio.
   */
  it("sin lectura dice que está consultando, y no adelanta una cifra", () => {
    render(<CloudStudio alPedir={NADA} alRecargar={NADA} />);
    expect(screen.getByText(/consultando la sincronización/i)).toBeTruthy();
    expect(screen.queryByText(/no está dado de alta/i)).toBeNull();
  });

  /**
   * Su estado vacío dice cómo se empieza. Y dice «no está dado de alta», no «0 ficheros» — un
   * proyecto offline tiene la pregunta sin respuesta, no la respuesta «nada».
   */
  it("sin proyecto ni rama dice que no está dado de alta, en vez de contar cero", () => {
    render(<CloudStudio sync={{}} alPedir={NADA} alRecargar={NADA} />);
    expect(screen.getByText(/no está dado de alta en CloudStudio/i)).toBeTruthy();
    expect(screen.queryByText(/por subir/i)).toBeNull();
  });

  it("la cuenta va en singular con uno y en plural con más", () => {
    const { rerender } = render(
      <CloudStudio sync={{ proyecto: "Tienda", rama: "main", pendientes: 1 }} alPedir={NADA} alRecargar={NADA} />
    );
    expect(screen.getByText("1 fichero por subir.")).toBeTruthy();
    rerender(
      <CloudStudio sync={{ proyecto: "Tienda", rama: "main", pendientes: 3 }} alPedir={NADA} alRecargar={NADA} />
    );
    expect(screen.getByText("3 ficheros por subir.")).toBeTruthy();
  });

  it("con cero se afirma que no hay nada, que es lo que se ha medido", () => {
    render(
      <CloudStudio sync={{ proyecto: "Tienda", rama: "main", pendientes: 0 }} alPedir={NADA} alRecargar={NADA} />
    );
    expect(screen.getByText(/no hay nada por subir/i)).toBeTruthy();
    expect(screen.queryByText(/por subir\./)).toBeNull();
  });

  /**
   * Un fallo de medida NO se pinta como un cero ni como «no consta» a secas: la frase dice
   * qué no se pudo hacer. Y las dos se distinguen de la ausencia de dato, que es su propia
   * frase — si el servidor contestó sin `pendientes`, es que no lo midió, no que no haya.
   */
  it("el error de medida lleva su frase, y no un cero", () => {
    render(
      <CloudStudio
        sync={{ proyecto: "Tienda", rama: "main", error: "no se pudo medir lo que falta por subir" }}
        alPedir={NADA}
        alRecargar={NADA}
      />
    );
    expect(screen.getByText(/no se pudo medir lo que falta por subir/i)).toBeTruthy();
    expect(screen.queryByText(/no hay nada por subir/i)).toBeNull();
  });

  it("con proyecto y rama pero sin cifra, lo dice en vez de inventarla", () => {
    render(<CloudStudio sync={{ proyecto: "Tienda", rama: "main" }} alPedir={NADA} alRecargar={NADA} />);
    expect(screen.getByText(/no consta cuánto falta por subir/i)).toBeTruthy();
  });

  it("enseña de qué rama es, que es la mitad de la pregunta", () => {
    render(
      <CloudStudio sync={{ proyecto: "Tienda", rama: "xonecode/main", pendientes: 2 }} alPedir={NADA} alRecargar={NADA} />
    );
    expect(screen.getByText("Tienda")).toBeTruthy();
    expect(screen.getByText("rama xonecode/main")).toBeTruthy();
  });

  /**
   * La cifra dice DE QUIÉN son los ficheros, que es lo que la hace cuadrar con la lista que
   * tiene justo debajo. Las dos se miden contra referencias distintas —la banda contra la rama
   * de la bajada, la lista contra el sello de la sesión—, así que pueden no tocarse: sin decirlo
   * parecen contradecirse.
   */
  it("con `deLaSesion` a cero dice que ninguno es suyo, sin callarse la cifra", () => {
    render(
      <CloudStudio
        sync={{ proyecto: "Tienda", rama: "main", pendientes: 3, deLaSesion: 0 }}
        alPedir={NADA}
        alRecargar={NADA}
      />
    );
    expect(screen.getByText("3 ficheros por subir. Ninguno lo tocó esta sesión.")).toBeTruthy();
  });

  it("con todos suyos lo dice en singular y en plural", () => {
    const { rerender } = render(
      <CloudStudio
        sync={{ proyecto: "Tienda", rama: "main", pendientes: 1, deLaSesion: 1 }}
        alPedir={NADA}
        alRecargar={NADA}
      />
    );
    expect(screen.getByText("1 fichero por subir, y lo tocó esta sesión.")).toBeTruthy();
    rerender(
      <CloudStudio
        sync={{ proyecto: "Tienda", rama: "main", pendientes: 3, deLaSesion: 3 }}
        alPedir={NADA}
        alRecargar={NADA}
      />
    );
    expect(screen.getByText("3 ficheros por subir, y los tocó esta sesión.")).toBeTruthy();
  });

  it("con parte suya y parte de antes reparte la cuenta", () => {
    render(
      <CloudStudio
        sync={{ proyecto: "Tienda", rama: "main", pendientes: 3, deLaSesion: 1 }}
        alPedir={NADA}
        alRecargar={NADA}
      />
    );
    expect(screen.getByText("3 ficheros por subir: 1 de esta sesión y 2 de antes.")).toBeTruthy();
  });

  /**
   * Y AUSENTE no es cero, que es la distinción de toda la consola: sin sesión —o con una sin
   * sello— no hay atribución que hacer, y ahí la lista de la que saldría ese cero incluye lo
   * que escribiera cualquiera desde que se abrió. Decir «ninguno lo tocó esta sesión» sería una
   * afirmación sobre quien lo escribió; la frase se queda en la cifra y nada más.
   */
  it("sin `deLaSesion` no se dice nada de la sesión, y menos un «ninguno»", () => {
    render(
      <CloudStudio sync={{ proyecto: "Tienda", rama: "main", pendientes: 3 }} alPedir={NADA} alRecargar={NADA} />
    );
    expect(screen.getByText("3 ficheros por subir.")).toBeTruthy();
    expect(screen.queryByText(/de esta sesión/i)).toBeNull();
    expect(screen.queryByText(/de antes/i)).toBeNull();
  });
});

describe("CloudStudio: los dos botones", () => {
  afterEach(cleanup);

  /**
   * Mandan la INTENCIÓN y con la acción que es cada uno. Que el servidor las aplique
   * encolando `/sync` en el lazo es lo que hace que salgan con el plan, la guarda de árbol
   * sucio y la aprobación de siempre — aquí no se compone nada de eso.
   */
  it("cada botón manda su acción", () => {
    const pedir = vi.fn();
    render(
      <CloudStudio sync={{ proyecto: "Tienda", rama: "main", pendientes: 1 }} alPedir={pedir} alRecargar={NADA} />
    );
    fireEvent.click(screen.getByRole("button", { name: "Subir" }));
    expect(pedir).toHaveBeenLastCalledWith("subir");
    fireEvent.click(screen.getByRole("button", { name: "Bajar" }));
    expect(pedir).toHaveBeenLastCalledWith("bajar");
    expect(pedir).toHaveBeenCalledTimes(2);
  });

  /**
   * Y la nota que evita el malentendido caro: «Bajar» se llama igual que un `git pull`, pero
   * sobrescribe la copia local. Va SIEMPRE que hay botones, no solo en el estado vacío.
   */
  it("la nota dice que bajar sobrescribe la copia local", () => {
    render(
      <CloudStudio sync={{ proyecto: "Tienda", rama: "main", pendientes: 1 }} alPedir={NADA} alRecargar={NADA} />
    );
    expect(screen.getByText(/SOBRESCRIBE esta copia/i)).toBeTruthy();
  });

  it("«volver a mirar» pide la medida otra vez", () => {
    const recargar = vi.fn();
    render(
      <CloudStudio sync={{ proyecto: "Tienda", rama: "main", pendientes: 1 }} alPedir={NADA} alRecargar={recargar} />
    );
    recargar.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Volver a mirar" }));
    expect(recargar).toHaveBeenCalledTimes(1);
  });
});

describe("CloudStudio: cuándo se mide", () => {
  afterEach(cleanup);

  /**
   * Al ENTRAR se mide siempre —esta banda vive dentro de Revisión, así que se monta al abrir
   * esa pestaña, y montar es entrar—, y después solo si no hay lectura. La cifra envejece por
   * dos caminos que el servidor no ve igual: el agente escribe (lo sabe, y `App` la refresca al
   * cerrar el turno) y `/sync` mueve la ref (no lo sabe: una línea encolada no avisa de cuándo
   * acaba). Entrar a mirar ES la pregunta, así que montar vuelve a medir aunque el store traiga
   * una lectura vieja.
   */
  it("pide al montar aunque ya haya una lectura, porque entrar es mirar", () => {
    const recargar = vi.fn();
    render(
      <CloudStudio sync={{ proyecto: "Tienda", rama: "main", pendientes: 5 }} alPedir={NADA} alRecargar={recargar} />
    );
    expect(recargar).toHaveBeenCalledTimes(1);
  });

  it("no repite la petición en los renders siguientes si ya tiene lectura", () => {
    const recargar = vi.fn();
    const { rerender } = render(
      <CloudStudio sync={{ proyecto: "Tienda", rama: "main", pendientes: 5 }} alPedir={NADA} alRecargar={recargar} />
    );
    rerender(
      <CloudStudio sync={{ proyecto: "Tienda", rama: "main", pendientes: 6 }} alPedir={NADA} alRecargar={recargar} />
    );
    expect(recargar).toHaveBeenCalledTimes(1);
  });

  /**
   * Y el caso que dejaba la banda colgada en «Consultando»: el store tira la lectura al
   * cambiar de sesión o al caerse el cable sin desmontar el componente. Con la petición solo
   * en el montaje, no se recuperaba nunca — el mismo fallo medido en Ficheros y Revisión.
   */
  it("si el store tira la lectura, se vuelve a pedir", () => {
    const recargar = vi.fn();
    const { rerender } = render(
      <CloudStudio sync={{ proyecto: "Tienda", rama: "main", pendientes: 5 }} alPedir={NADA} alRecargar={recargar} />
    );
    rerender(<CloudStudio alPedir={NADA} alRecargar={recargar} />);
    expect(recargar).toHaveBeenCalledTimes(2);
  });

  it("sin cable no pide nada, y la reconexión la recupera", () => {
    const recargar = vi.fn();
    const { rerender } = render(<CloudStudio alPedir={NADA} alRecargar={recargar} conectado={false} />);
    expect(recargar).not.toHaveBeenCalled();
    rerender(
      <CloudStudio
        sync={{ proyecto: "Tienda", rama: "main", pendientes: 0 }}
        alPedir={NADA}
        alRecargar={recargar}
        conectado={true}
      />
    );
    // Al volver el cable se mide — es la primera vez que este efecto puede correr, y la
    // lectura que llegue después del cambio de sesión no vale para lo de ahora.
    expect(recargar).toHaveBeenCalledTimes(1);
  });
});
