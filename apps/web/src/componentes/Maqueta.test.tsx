import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { render, cleanup, screen, fireEvent } from "@testing-library/react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { Maqueta, acotarAnchoDeBarra, ANCHO_BARRA_POR_OMISION } from "./Maqueta.js";

afterEach(cleanup);

const AQUI = dirname(fileURLToPath(import.meta.url));
const ESTILOS = join(AQUI, "..", "..", "estilos");

describe("Maqueta", () => {
  it("la barra va PRIMERO en el DOM: a la izquierda, como pidió el usuario al final — no a la derecha, que fue lo que pidió antes", () => {
    const { container } = render(
      <Maqueta centro={<div data-testid="centro">centro</div>} barra={<div data-testid="barra">barra</div>} />
    );
    const raiz = container.firstElementChild;
    expect(raiz?.children[0]?.querySelector("[data-testid='barra']")).not.toBeNull();
    expect(raiz?.children[1]?.querySelector("[data-testid='centro']")).not.toBeNull();
  });

  it("con cabecera, va la PRIMERA y cruza las dos columnas — y el grid pasa a dos filas", () => {
    // La barra superior es de la APLICACIÓN, no del centro: cruza la lateral. Dos cosas que
    // un test de DOM no vería solas y que nada más impide: que se cuele DETRÁS de la barra
    // (el orden del DOM es el orden del Tab, y la marca y el plegado van antes que el árbol
    // de proyectos), y que el grid se quede con la fila única de `.frame` — `100%`, una sola
    // fila del alto entero—, con lo que la cabecera y las columnas se pisarían en la misma
    // celda. `minmax(0, 1fr)` y no `1fr` en la de abajo: `1fr` tiene suelo `auto` y una
    // conversación larga estiraba la fila por debajo de la pantalla en vez de scrollear.
    const { container } = render(
      <Maqueta
        cabecera={<div data-testid="cabecera">cabecera</div>}
        centro={<div data-testid="centro">centro</div>}
        barra={<div data-testid="barra">barra</div>}
      />
    );
    const raiz = container.firstElementChild as HTMLElement;
    expect(raiz.children[0]?.querySelector("[data-testid='cabecera']")).not.toBeNull();
    expect(raiz.children[1]?.querySelector("[data-testid='barra']")).not.toBeNull();
    expect(raiz.children[2]?.querySelector("[data-testid='centro']")).not.toBeNull();
    expect(raiz.style.gridTemplateRows).toBe("auto minmax(0, 1fr)");
  });

  it("sin cabecera el grid se queda con UNA fila: la de `.frame`, sin pista escrita", () => {
    // Que el hueco sea opcional no es cosmético: escribir `grid-template-rows` cuando no hay
    // cabecera dejaría una fila `auto` de cero de alto delante de las columnas, y con ella
    // el `100%` de la hoja copiada dejaría de valer sin que nada avisara.
    const { container } = render(<Maqueta centro={<div />} barra={<div />} />);
    expect((container.firstElementChild as HTMLElement).style.gridTemplateRows).toBe("");
  });

  it("escribe las pistas del grid: el `.frame` copiado no las trae, y sin ellas la barra se apila ENCIMA del centro", () => {
    // No es cosmética. `AppFrame.module.css` declara `display: grid` y NINGUNA columna
    // —en el original las escribe su componente en línea—, así que un grid sin pistas
    // resuelve a una sola columna y las dos cajas quedan una debajo de otra. Es
    // exactamente el tipo de fallo mudo que este repo persigue: nada da error.
    const { container } = render(<Maqueta centro={<div />} barra={<div />} />);
    const raiz = container.firstElementChild as HTMLElement;
    // El techo va en la PISTA y no en el número: `min(320px, 60vw)` lo aplica el CSS en
    // vivo, así que encoger la ventana estrecha la barra sin tocar el ancho recordado.
    expect(raiz.style.gridTemplateColumns).toBe("min(320px, 60vw) minmax(0, 1fr)");
  });

  it("NO pone `data-phase`: con él, ni el chat ni las trazas pueden scrollear", () => {
    // Regresión medida en pantalla, no teórica: `data-phase="active"` enciende
    // `.root[data-phase='active'] .viewArea { flex: 1 0 auto; min-height: auto }`, que en
    // el original convive con un `.scrollBody` que aquí no existe. Sin ese envoltorio la
    // vista crecía hasta el alto del contenido y `.centerCol` la recortaba DEBAJO del
    // compositor — las últimas líneas tapadas y sin barra de scroll. Nada da error, así
    // que solo un test que mire el atributo lo impide.
    const { container } = render(<Maqueta centro={<div />} barra={<div />} />);
    const columna = container.firstElementChild?.children[1] as HTMLElement;
    expect(columna.getAttribute("data-phase")).toBeNull();
  });

  it("el borde que separa las dos columnas lo pinta la COLUMNA de la barra, no la barra", () => {
    // Una posición es una propiedad tan comprobable como un color: mover la barra sin
    // mover el borde deja un borde duplicado o ausente en el lado nuevo, y eso un test
    // de DOM no lo ve — solo mirar el CSS lo pilla. Ahora el CSS es el de deepseek, y
    // este test vigila que siga siendo `border-right` sobre `.sidebarCol` (la barra a la
    // izquierda) y no se cuele un `border-left` de una copia posterior.
    const css = readFileSync(join(ESTILOS, "AppFrame.module.css"), "utf8");
    expect(css).toMatch(/\.sidebarCol\s*\{[^}]*border-right/);
    expect(css).not.toMatch(/\.sidebarCol\s*\{[^}]*border-left/);
  });

  it("la columna central declara el eje de ancho compartido, que es lo que centra la conversación y la alinea con el compositor", () => {
    // `--dsh-chat-content-width` vive en `.root` de `ConversationRoot.module.css`, y
    // `Maqueta` monta esa clase sobre la columna central. Si esa hoja dejara de
    // montarse, la variable no existiría, `max-width` de la columna de mensajes
    // resolvería a nada y la conversación volvería a pegarse a la barra — sin error.
    const css = readFileSync(join(ESTILOS, "ConversationRoot.module.css"), "utf8");
    expect(css).toMatch(/--dsh-chat-content-width:/);
    expect(css).toMatch(/--dsh-composer-card-max-width:/);
  });
});

describe("el tirador de la barra", () => {
  const tirador = (): HTMLElement => screen.getByRole("separator", { name: "Ancho de la barra lateral" });

  /**
   * **jsdom no implementa `PointerEvent`** (comprobado en jsdom 25.0.1), y el `Event`
   * pelado con el que `fireEvent.pointerMove` cae de vuelta no lleva `clientX` ni `button`
   * — con él el componente recibía un `NaN` y devolvía la omisión, o sea un test que pasaba
   * sin mover nada. Se dispara un `MouseEvent` con el NOMBRE del evento de puntero, que es
   * lo que React escucha, y así la geometría del gesto es de verdad.
   */
  const deRaton = (tipo: string, clientX = 0): MouseEvent =>
    new MouseEvent(tipo, { bubbles: true, cancelable: true, button: 0, clientX });

  it("sin manejador no se pinta: un asa que no redimensiona es un control muerto", () => {
    // Y encima tapa 8 px de la columna. Por eso la condición es tener a quién pedírselo,
    // no una bandera aparte que alguien pueda poner sin cablear nada.
    render(<Maqueta centro={<div />} barra={<div />} />);
    expect(screen.queryByRole("separator")).toBeNull();
  });

  it("plegada tampoco: no hay ancho que mover", () => {
    render(<Maqueta centro={<div />} barra={<div />} barraContraida alRedimensionarBarra={vi.fn()} />);
    expect(screen.queryByRole("separator")).toBeNull();
  });

  it("es el «window splitter» de ARIA: un separator ENFOCABLE que dice su valor", () => {
    // Sin `tabIndex` sería un asa que solo existe si tienes ratón, y el `aria-valuenow` es
    // lo único que le dice a un lector de pantalla dónde está.
    render(<Maqueta centro={<div />} barra={<div />} alRedimensionarBarra={vi.fn()} />);
    const asa = tirador();
    expect(asa.getAttribute("aria-orientation")).toBe("vertical");
    expect(asa.getAttribute("tabindex")).toBe("0");
    expect(asa.getAttribute("aria-valuenow")).toBe(String(ANCHO_BARRA_POR_OMISION));
    expect(asa.getAttribute("aria-valuemin")).toBe("220");
    expect(asa.getAttribute("aria-valuemax")).toBe("560");
  });

  it("las flechas mueven el ancho, y cada tecla es un gesto TERMINADO: se guarda", () => {
    const alRedimensionarBarra = vi.fn();
    render(<Maqueta centro={<div />} barra={<div />} alRedimensionarBarra={alRedimensionarBarra} />);
    fireEvent.keyDown(tirador(), { key: "ArrowRight" });
    expect(alRedimensionarBarra).toHaveBeenLastCalledWith(ANCHO_BARRA_POR_OMISION + 16, true);
    fireEvent.keyDown(tirador(), { key: "ArrowLeft" });
    expect(alRedimensionarBarra).toHaveBeenLastCalledWith(ANCHO_BARRA_POR_OMISION - 16, true);
    fireEvent.keyDown(tirador(), { key: "Home" });
    expect(alRedimensionarBarra).toHaveBeenLastCalledWith(220, true);
    fireEvent.keyDown(tirador(), { key: "End" });
    expect(alRedimensionarBarra).toHaveBeenLastCalledWith(560, true);
  });

  it("una tecla que no es suya no pide nada", () => {
    const alRedimensionarBarra = vi.fn();
    render(<Maqueta centro={<div />} barra={<div />} alRedimensionarBarra={alRedimensionarBarra} />);
    fireEvent.keyDown(tirador(), { key: "a" });
    expect(alRedimensionarBarra).not.toHaveBeenCalled();
  });

  it("arrastrar pide EN VIVO sin terminar, y al soltar termina UNA vez", () => {
    // Las dos cadencias del gesto son la razón de que `terminado` exista: el arrastre pide
    // sesenta veces por segundo y `localStorage` se escribe al soltar. En jsdom el rect del
    // marco es todo ceros, así que el `clientX` ES el ancho.
    const alRedimensionarBarra = vi.fn();
    render(<Maqueta centro={<div />} barra={<div />} alRedimensionarBarra={alRedimensionarBarra} />);
    fireEvent(tirador(), deRaton("pointerdown"));
    fireEvent(tirador(), deRaton("pointermove", 400));
    expect(alRedimensionarBarra).toHaveBeenLastCalledWith(400, false);
    fireEvent(tirador(), deRaton("pointerup", 420));
    expect(alRedimensionarBarra).toHaveBeenLastCalledWith(420, true);
    expect(alRedimensionarBarra.mock.calls.filter(([, terminado]) => terminado === true)).toHaveLength(1);
  });

  it("sin arrastre en marcha, mover el puntero por encima no pide nada", () => {
    const alRedimensionarBarra = vi.fn();
    render(<Maqueta centro={<div />} barra={<div />} alRedimensionarBarra={alRedimensionarBarra} />);
    fireEvent(tirador(), deRaton("pointermove", 400));
    expect(alRedimensionarBarra).not.toHaveBeenCalled();
  });

  it("mientras se arrastra, el marco lleva `data-dragging` — que es lo que apaga la transición", () => {
    // La regla es de la hoja copiada (`.frame[data-dragging] { transition: none }`): sin el
    // atributo, la pista se movería por la curva de plegado y la columna se despegaría del
    // tirador. Nada daría error; solo se vería.
    const { container } = render(
      <Maqueta centro={<div />} barra={<div />} alRedimensionarBarra={vi.fn()} />
    );
    const marco = container.firstElementChild as HTMLElement;
    expect(marco.getAttribute("data-dragging")).toBeNull();
    fireEvent(tirador(), deRaton("pointerdown"));
    expect(marco.getAttribute("data-dragging")).toBe("true");
    fireEvent(tirador(), deRaton("pointerup", 400));
    expect(marco.getAttribute("data-dragging")).toBeNull();
  });

  it("doble clic vuelve a la omisión", () => {
    const alRedimensionarBarra = vi.fn();
    render(
      <Maqueta centro={<div />} barra={<div />} anchoBarra={540} alRedimensionarBarra={alRedimensionarBarra} />
    );
    fireEvent.doubleClick(tirador());
    expect(alRedimensionarBarra).toHaveBeenCalledWith(ANCHO_BARRA_POR_OMISION, true);
  });

  it("un ancho recordado imposible se ACOTA al pintar, no se pinta tal cual", () => {
    // Un valor de una pantalla grande, de una versión anterior o escrito a mano en
    // `localStorage` no puede dejar sin centro a un portátil.
    const { container } = render(
      <Maqueta centro={<div />} barra={<div />} anchoBarra={5000} alRedimensionarBarra={vi.fn()} />
    );
    expect((container.firstElementChild as HTMLElement).style.gridTemplateColumns).toBe(
      "min(560px, 60vw) minmax(0, 1fr)"
    );
    expect(tirador().getAttribute("aria-valuenow")).toBe("560");
  });

  it("con cabecera se coloca en la fila de las columnas: no cruza la barra superior", () => {
    // Un absoluto con celda declarada toma su ÁREA como bloque contenedor. Sin eso la tira
    // de 8 px con cursor de redimensionar pasa por delante de la miga.
    const { container: conCabecera } = render(
      <Maqueta cabecera={<div />} centro={<div />} barra={<div />} alRedimensionarBarra={vi.fn()} />
    );
    expect(conCabecera.querySelector("[role='separator']")?.className).toMatch(/tiradorEnFila/);
    cleanup();
    const { container: sinCabecera } = render(
      <Maqueta centro={<div />} barra={<div />} alRedimensionarBarra={vi.fn()} />
    );
    expect(sinCabecera.querySelector("[role='separator']")?.className).not.toMatch(/tiradorEnFila/);
  });

  it("la celda del tirador y el apagado de la transición viven en las HOJAS, y jsdom no las ve", () => {
    const nuestra = readFileSync(join(AQUI, "Maqueta.module.css"), "utf8");
    expect(nuestra).toMatch(/\.tiradorEnFila\s*\{[^}]*grid-row:\s*2/);
    // La pista de color al pasar por encima es nuestra a propósito: la variante `sidebar`
    // de la hoja copiada es invisible, y un asa que no se ve no invita a arrastrarla.
    expect(nuestra).toMatch(/\.tirador:hover::after/);
    const copiada = readFileSync(join(ESTILOS, "AppFrame.module.css"), "utf8");
    expect(copiada).toMatch(/\.frame\[data-dragging\]\s*\{[^}]*transition:\s*none/);
    expect(copiada).toMatch(/\.handle\s*\{[^}]*cursor:\s*col-resize/);
  });
});

describe("acotarAnchoDeBarra", () => {
  it("sin ventana solo aplica el suelo y el techo fijos: el 60% lo pone el CSS en vivo", () => {
    // Aplicarlo aquí sobrescribiría los 560 que alguien eligió en su pantalla grande la
    // primera vez que abriera el portátil, y eso no lo ha deshecho nadie.
    expect(acotarAnchoDeBarra(320)).toBe(320);
    expect(acotarAnchoDeBarra(10)).toBe(220);
    expect(acotarAnchoDeBarra(5000)).toBe(560);
  });

  it("con ventana añade el 60%, que es lo que mantiene el tirador pegado al puntero", () => {
    expect(acotarAnchoDeBarra(560, 700)).toBe(420);
    // En una ventana estrechísima manda el suelo: para no tener barra está el plegado.
    expect(acotarAnchoDeBarra(400, 300)).toBe(220);
  });

  it("lo que no es un número cae en la omisión, nunca en un `NaN` dentro del grid", () => {
    expect(acotarAnchoDeBarra(Number.NaN)).toBe(ANCHO_BARRA_POR_OMISION);
  });
});
