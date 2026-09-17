import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ActoDeSincronizacion } from "../tipos.js";
import { selloDeFecha } from "../selloDeFecha.js";
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
    // Se mira el texto de la CUENTA y no la pantalla entera: desde que hay registro, la nota
    // de abajo dice «en el registro de esta sesión» —otra frase, sobre otra cosa—, y un
    // `queryByText` sobre el documento entero la cazaría a ella en vez de a la cifra.
    const cuenta = screen.getByText("3 ficheros por subir.");
    expect(cuenta.textContent).not.toMatch(/de esta sesión/i);
    expect(cuenta.textContent).not.toMatch(/de antes/i);
  });
});

describe("CloudStudio: los botones", () => {
  afterEach(cleanup);

  /**
   * Mandan la INTENCIÓN y con la acción que es cada uno. Que el servidor las aplique
   * encolando `/sync` en el lazo es lo que hace que salgan con el plan, la guarda de árbol
   * sucio y la aprobación de siempre — aquí no se compone nada de eso.
   *
   * Y la etiqueta se comprueba por su nombre NUEVO mientras la acción sigue siendo `"bajar"`:
   * son dos cosas distintas y el test las separa a propósito — la etiqueta es lo que se le
   * enseña a quien pulsa, la acción es lo que viaja por el cable, y renombrar la una no
   * renombra la otra.
   */
  it("cada botón manda su acción", () => {
    const pedir = vi.fn();
    render(
      <CloudStudio sync={{ proyecto: "Tienda", rama: "main", pendientes: 1 }} alPedir={pedir} alRecargar={NADA} />
    );
    fireEvent.click(screen.getByRole("button", { name: "Subir" }));
    expect(pedir).toHaveBeenLastCalledWith("subir");
    fireEvent.click(screen.getByRole("button", { name: "Actualizar repo local" }));
    expect(pedir).toHaveBeenLastCalledWith("bajar");
    expect(pedir).toHaveBeenCalledTimes(2);
  });

  /**
   * El aviso de que PISA va pegado al control y no solo en la prosa de la nota. No es adorno:
   * «Actualizar repo local» se lee como un `git pull` —que fusiona y respeta lo que tengas— y
   * esta operación sobrescribe la copia local. El nombre dice la dirección, no el precio, y
   * quien lee la nota ya ha decidido.
   */
  it("la actualización lleva el aviso de que pisa en su propio `title`", () => {
    render(
      <CloudStudio sync={{ proyecto: "Tienda", rama: "main", pendientes: 1 }} alPedir={NADA} alRecargar={NADA} />
    );
    const actualizar = screen.getByRole("button", { name: "Actualizar repo local" });
    expect(actualizar.getAttribute("title")).toMatch(/sobrescribe esta copia/i);
  });

  /**
   * Y la nota que evita el malentendido caro: la actualización se llama igual que un `git pull`,
   * pero sobrescribe la copia local. Va SIEMPRE que hay botones, no solo en el estado vacío, y
   * con la subida al día también — lo que cambia es de qué botones habla.
   */
  it("la nota dice que la actualización sobrescribe la copia local", () => {
    render(
      <CloudStudio sync={{ proyecto: "Tienda", rama: "main", pendientes: 1 }} alPedir={NADA} alRecargar={NADA} />
    );
    const nota = screen.getByText(/sobrescribe esta copia/i);
    expect(nota.textContent).toMatch(/Subir pide el plan/i);
  });

  it("«volver a mirar» pide la medida otra vez", () => {
    const recargar = vi.fn();
    render(
      <CloudStudio sync={{ proyecto: "Tienda", rama: "main", pendientes: 1 }} alPedir={NADA} alRecargar={recargar} />
    );
    recargar.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Refrescar" }));
    expect(recargar).toHaveBeenCalledTimes(1);
  });
});

/**
 * **Cuándo NO se ofrece subir.**
 *
 * Con la medida en cero el plan sale vacío —`pendientes` sale de la misma cuenta que decide qué
 * lleva el plan—, así que el botón no llevaría a ninguna parte. Pero la regla es **solo con un
 * cero MEDIDO**, y por eso los dos casos que la mitad fácil de escribir se lleva por delante
 * van aquí abajo con su nombre: `undefined` no es cero, y un error de medida tampoco. En los
 * dos, retirar el botón afirmaría «no hay nada» sobre una pregunta que nadie ha contestado.
 */
describe("CloudStudio: cuándo no se ofrece subir", () => {
  afterEach(cleanup);

  const CON_PROYECTO = { proyecto: "Tienda", rama: "main" };

  it("con cero medido no hay «Subir», y la actualización sigue ahí", () => {
    render(<CloudStudio sync={{ ...CON_PROYECTO, pendientes: 0 }} alPedir={NADA} alRecargar={NADA} />);
    expect(screen.queryByRole("button", { name: "Subir" })).toBeNull();
    expect(screen.getByRole("button", { name: "Actualizar repo local" })).toBeTruthy();
  });

  it("con uno o más, «Subir» está: es la acción de la banda", () => {
    const { rerender } = render(
      <CloudStudio sync={{ ...CON_PROYECTO, pendientes: 1 }} alPedir={NADA} alRecargar={NADA} />
    );
    expect(screen.getByRole("button", { name: "Subir" })).toBeTruthy();
    rerender(<CloudStudio sync={{ ...CON_PROYECTO, pendientes: 0 }} alPedir={NADA} alRecargar={NADA} />);
    expect(screen.queryByRole("button", { name: "Subir" })).toBeNull();
    rerender(<CloudStudio sync={{ ...CON_PROYECTO, pendientes: 2 }} alPedir={NADA} alRecargar={NADA} />);
    expect(screen.getByRole("button", { name: "Subir" })).toBeTruthy();
  });

  /**
   * El caso que la regla existe para no confundir: el servidor contestó sin `pendientes`. No es
   * un cero — es que no lo midió, y aquí no se puede saber si hay algo. Es la misma invariante
   * de las cuatro capas de esta consola, aplicada a un botón: ausente ≠ vacío ≠ cero. Se
   * esconde de menos, nunca de más: un botón de más se pulsa y el árbol sucio lo para; uno de
   * menos no tiene vuelta.
   */
  it("sin cifra, «Subir» SE QUEDA: ausente no es cero", () => {
    render(<CloudStudio sync={CON_PROYECTO} alPedir={NADA} alRecargar={NADA} />);
    expect(screen.getByText(/no consta cuánto falta por subir/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Subir" })).toBeTruthy();
  });

  it("con un error de medida, «Subir» SE QUEDA: no poder medir no es no tener nada", () => {
    render(
      <CloudStudio
        sync={{ ...CON_PROYECTO, error: "no se pudo medir lo que falta por subir" }}
        alPedir={NADA}
        alRecargar={NADA}
      />
    );
    expect(screen.getByRole("button", { name: "Subir" })).toBeTruthy();
  });

  /**
   * Y la nota deja de nombrar «Subir» cuando no está: una ayuda que describe un control ausente
   * manda a buscar lo que no hay — la misma regla que las teclas del compositor, que nombran
   * solo las que son ciertas. El aviso de la actualización no se va con él, que es cuando más
   * falta hace.
   */
  it("sin «Subir», la nota no lo nombra, y sigue avisando de que la actualización pisa", () => {
    render(<CloudStudio sync={{ ...CON_PROYECTO, pendientes: 0 }} alPedir={NADA} alRecargar={NADA} />);
    const nota = screen.getByText(/sobrescribe esta copia/i);
    expect(nota.textContent).not.toMatch(/Subir/);
    expect(nota.textContent).toMatch(/se niega con cambios sin commitear/i);
  });
});

/**
 * **El registro: lo que antes se volcaba en el hilo del chat.**
 *
 * Las nueve líneas de consola de una subida —el plan, el `→ APROBADO`, el recuento— salían
 * entre dos mensajes de la conversación. Ahora son una operación con su hora y su nombre,
 * agrupada y plegada, debajo de los botones. Es el mismo texto TAL CUAL: lo que se comprueba
 * aquí abajo es que no se recompone ni se resume por el camino.
 */
describe("CloudStudio: el registro de lo que pasó", () => {
  afterEach(cleanup);

  const CON_PROYECTO = { proyecto: "Tienda", rama: "main", pendientes: 1 };

  /** Una operación como la que deja el acto: acción, instante de EMPEZAR y sus líneas. */
  const OPERACION = (
    accion: ActoDeSincronizacion["accion"],
    cuando: string,
    lineas: string[]
  ): ActoDeSincronizacion => ({ tipo: "sincronizacion", accion, cuando, lineas });

  const DE_SUBIDA = OPERACION("subir", "2019-03-05T10:00:00.000Z", [
    "SUBIDA A CLOUDSTUDIO — 1 operación",
    "  + app/Clientes.xne",
    "  → APROBADO",
    "subidos 1, fallaron 0",
  ]);

  /**
   * Ausente = en esta sesión no se ha sincronizado nada, y eso no se pinta: ni una caja vacía
   * ni una cabecera sin operación. Es la invariante de las cuatro capas de esta consola
   * —ausente ≠ vacío ≠ cero— aplicada al registro en vez de a una cifra.
   *
   * Se comprueba con `[]` y con la prop sin pasar, que son el mismo caso para el componente y
   * los dos tienen que caer en el `null`.
   */
  it("sin operaciones no se pinta el registro", () => {
    const { container, rerender } = render(
      <CloudStudio sync={CON_PROYECTO} alPedir={NADA} alRecargar={NADA} />
    );
    expect(container.querySelectorAll("details")).toHaveLength(0);
    expect(screen.queryByLabelText(/registro de la sincronización/i)).toBeNull();
    rerender(<CloudStudio sync={CON_PROYECTO} registro={[]} alPedir={NADA} alRecargar={NADA} />);
    expect(container.querySelectorAll("details")).toHaveLength(0);
  });

  /**
   * La operación se lee por su ACCIÓN y su hora, con los mismos nombres que los botones: quien
   * acaba de pulsar «Actualizar repo local» viene a buscar eso, y un registro que lo rebautizara
   * con el nombre del protocolo obligaría a traducir entre el botón y su historia.
   *
   * La hora se compara contra el `selloDeFecha` compartido y no contra una cadena escrita a
   * mano: lo que se fija aquí es el CABLEADO —que la cabecera lleva el instante de la
   * operación por la función de siempre—, porque el formato tiene su propio test
   * (`selloDeFecha.test.ts`), y una cadena a mano ataría este test a la zona horaria de quien
   * lo corre.
   */
  it("cada operación lleva su acción y su hora, por el sello de siempre", () => {
    const { container } = render(
      <CloudStudio
        sync={CON_PROYECTO}
        registro={[DE_SUBIDA, OPERACION("bajar", "2019-03-05T09:00:00.000Z", ["bajados 2 ficheros (git)"])]}
        alPedir={NADA}
        alRecargar={NADA}
      />
    );

    const operaciones = container.querySelectorAll("details");
    expect(operaciones).toHaveLength(2);
    const cabeceras = [...operaciones].map((op) => op.querySelector("summary")!.textContent);
    expect(cabeceras[0]).toContain("Subir");
    expect(cabeceras[0]).toContain(selloDeFecha("2019-03-05T10:00:00.000Z")!);
    expect(cabeceras[1]).toContain("Actualizar repo local");
    expect(cabeceras[1]).toContain(selloDeFecha("2019-03-05T09:00:00.000Z")!);
  });

  /**
   * **La más reciente ABIERTA y las de antes plegadas**, que es lo que se viene a mirar: se
   * acaba de pulsar un botón y lo que se quiere es el final de esa operación. El orden lo trae
   * `App` —de la más nueva a la más vieja—, así que la abierta es siempre la de arriba, y con
   * varias operaciones lo de antes se queda a un clic sin tapar la cifra de la banda.
   */
  it("sale abierta la más reciente y plegadas las demás", () => {
    const { container } = render(
      <CloudStudio
        sync={CON_PROYECTO}
        registro={[DE_SUBIDA, OPERACION("bajar", "2019-03-05T09:00:00.000Z", ["bajados 2 ficheros (git)"])]}
        alPedir={NADA}
        alRecargar={NADA}
      />
    );
    const abiertas = [...container.querySelectorAll("details")].map((op) => op.open);
    expect(abiertas).toEqual([true, false]);
  });

  /**
   * Y las líneas van TAL CUAL, sangría incluida: son las de la consola, y el plan de la subida
   * se lee por su sangría. Un `<pre>` que las recompusiera —o que las juntara en un párrafo—
   * sería una segunda versión de algo que ya se cuenta en `agent/` y en `cli/`.
   */
  it("las líneas se pintan tal cual, con su sangría y sin recomponer", () => {
    const { container } = render(
      <CloudStudio sync={CON_PROYECTO} registro={[DE_SUBIDA]} alPedir={NADA} alRecargar={NADA} />
    );
    const lineas = container.querySelector("pre")!.textContent;
    expect(lineas).toBe(DE_SUBIDA.lineas.join("\n"));
    expect(lineas).toContain("  + app/Clientes.xne");
    expect(lineas).toContain("subidos 1, fallaron 0");
  });

  /**
   * Lo que no es una fecha no se pinta, y la operación SIGUE: un «undefined» o un «Invalid
   * Date» en la cabecera es peor que una operación sin hora —que es lo que se ve si el acto
   * trae algo raro—, pero perder además sus líneas por una fecha mala sería tirar el dato
   * bueno por el malo. Misma regla que el sello de la barra.
   */
  it("con una hora ilegible la operación se pinta sin sello, y no con un «undefined»", () => {
    const { container } = render(
      <CloudStudio
        sync={CON_PROYECTO}
        registro={[OPERACION("subir", "no-es-una-fecha", ["subidos 1, fallaron 0"])]}
        alPedir={NADA}
        alRecargar={NADA}
      />
    );
    const cabecera = container.querySelector("summary")!.textContent!;
    expect(cabecera).toBe("Subir");
    expect(cabecera).not.toMatch(/undefined|Invalid/i);
    expect(container.querySelector("pre")!.textContent).toBe("subidos 1, fallaron 0");
  });

  /**
   * **El registro se pinta también sin alta**, y esa es la mitad que un `return` temprano se
   * lleva por delante: la banda de un proyecto que ya no está dado de alta no ofrece botones
   * —no se puede sincronizar—, pero la operación que SÍ ocurrió consta, y borrarla al quitar
   * el alta es perder la historia por un cambio de configuración. Se pinta en las dos ramas
   * porque el componente vive fuera de las dos.
   */
  it("sin alta en CloudStudio, el registro sigue ahí", () => {
    const { container } = render(
      <CloudStudio sync={{}} registro={[DE_SUBIDA]} alPedir={NADA} alRecargar={NADA} />
    );
    expect(screen.getByText(/no está dado de alta/i)).toBeTruthy();
    const op = container.querySelector("details")!;
    expect(within(op).getByText("Subir")).toBeTruthy();
    expect(op.querySelector("pre")!.textContent).toContain("subidos 1, fallaron 0");
  });

  /**
   * Y la nota deja de prometer el chat: decía «lo que pasa … sale en el chat», que con el
   * registro mudado aquí es sencillamente falso — una ayuda que se queda vieja es peor que no
   * tenerla, y esta mandaba a buscar la operación donde ya no está.
   */
  it("la nota manda al registro, y ya no promete el chat", () => {
    render(<CloudStudio sync={CON_PROYECTO} alPedir={NADA} alRecargar={NADA} />);
    const nota = screen.getByText(/sobrescribe esta copia/i).textContent!;
    expect(nota).toMatch(/queda aquí abajo, en el registro de esta sesión/i);
    expect(nota).not.toMatch(/en el chat/i);
    // La otra variante —sin «Subir»— lleva la misma promesa: era la que decía «se niega con
    // cambios sin commitear, y lo que pasa sale en el chat».
    cleanup();
    render(<CloudStudio sync={{ ...CON_PROYECTO, pendientes: 0 }} alPedir={NADA} alRecargar={NADA} />);
    const sinSubir = screen.getByText(/sobrescribe esta copia/i).textContent!;
    expect(sinSubir).toMatch(/queda aquí abajo, en el registro de esta sesión/i);
    expect(sinSubir).not.toMatch(/en el chat/i);
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
