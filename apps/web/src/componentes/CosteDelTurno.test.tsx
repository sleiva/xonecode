import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, it, expect } from "vitest";
import { CosteDelTurno, hayCosteQueEnsenar } from "./CosteDelTurno.js";
import type { ConsumoDeTurno } from "../tipos.js";

// Mismo motivo que en el resto de los ficheros de componentes: sin `globals` en
// `vitest.config.ts`, un segundo `render()` deja montado el primero.
afterEach(cleanup);

const cuenta = (entrada: number, salida: number, cache = 0) => ({ entrada, salida, cache });
const consumo = (modelo: ReturnType<typeof cuenta>, externo = cuenta(0, 0)): ConsumoDeTurno => ({ modelo, externo });

describe("CosteDelTurno", () => {
  it("los dos totales, abreviados como en el contador de la conversación", () => {
    // El mismo abreviador que el contador y la barra (`cifras.ts`): dos formatos para el mismo
    // dato enseñan a desconfiar de los dos.
    render(<CosteDelTurno consumo={consumo(cuenta(22_400, 1_200))} />);
    expect(screen.getByText("22,4k")).toBeTruthy();
    expect(screen.getByText("1,2k")).toBeTruthy();
  });

  it("la caché sale solo si la hay, y dice que NO se suma a la entrada", () => {
    // Es una lectura distinta de las otras dos, no un tercer sumando: pintarla igual invitaría
    // a sumarla de cabeza. Y sin caché no se pinta — un `0 caché` ocuparía sitio para decir
    // que no hay nada que decir.
    const { container } = render(<CosteDelTurno consumo={consumo(cuenta(7_000, 40, 5_000))} />);
    expect(screen.getByText("5k caché")).toBeTruthy();
    expect(screen.getByTitle(/no va sumada a la entrada/)).toBeTruthy();

    cleanup();
    render(<CosteDelTurno consumo={consumo(cuenta(7_000, 40))} />);
    expect(container.textContent).not.toContain("caché");
  });

  it("las dos cuentas se suman en pantalla y se desglosan en el `title`", () => {
    // Los tokens del grafo van contra la clave del usuario y los de un hijo contra su
    // suscripción: se suman TOKENS y nunca coste, y por eso el total se acompaña del reparto.
    render(<CosteDelTurno consumo={consumo(cuenta(100, 10), cuenta(7, 3))} />);
    expect(screen.getByText("107")).toBeTruthy();
    expect(screen.getByText("13")).toBeTruthy();
    const titulo = screen.getByTitle(/modelo: 100 entrada \/ 10 salida/).getAttribute("title") ?? "";
    expect(titulo).toContain("agentes externos: 7 entrada / 3 salida");
    expect(titulo).toContain("se suman TOKENS, no coste");
  });

  it("sin externos no se inventa su renglón", () => {
    const titulo = render(<CosteDelTurno consumo={consumo(cuenta(100, 10))} />).getByTitle(/Trabajo de este turno/);
    expect(titulo.getAttribute("title")).not.toContain("agentes externos");
  });

  it("un consumo a cero no se pinta: es la medida que nadie hizo", () => {
    expect(hayCosteQueEnsenar(consumo(cuenta(0, 0)))).toBe(false);
    const { container } = render(<CosteDelTurno consumo={consumo(cuenta(0, 0))} />);
    expect(container.textContent).toBe("");
  });

  it("las flechas van ocultas al oído, así que el significado va en el `aria-label`", () => {
    // Quien mira ve «↑ 8,8k ↓ 24»; quien lo oye recibiría «8,8k 24» sin saber cuál es cuál. El
    // `title` no basta para eso: no se anuncia de forma fiable.
    const { container } = render(<CosteDelTurno consumo={consumo(cuenta(8_786, 24, 100))} />);
    const caja = container.querySelector("[aria-label]");
    expect(caja?.getAttribute("aria-label")).toBe("8786 de entrada, 24 de salida, 100 de caché");
    // Y ningún signo se le escapa a un lector de pantalla: cada flecha y cada separador vive
    // dentro de un `aria-hidden`, porque «↑» leído en voz alta no significa nada. La caja de
    // fuera se excluye —su texto los contiene, y es justo la que LLEVA el `aria-label`—.
    const signos = [...container.querySelectorAll("span")].filter(
      (s) => /[↑↓·]/.test(s.textContent ?? "") && !s.hasAttribute("aria-label")
    );
    expect(signos.length).toBeGreaterThan(0);
    expect(signos.every((s) => s.getAttribute("aria-hidden") === "true")).toBe(true);
  });
});

describe("CosteDelTurno, en la fila de una sesión", () => {
  it("pinta UN número, el TOTAL de las dos mitades, y no el par", () => {
    // La fila de la barra compite con el nombre de la sesión, que es lo único elástico de una
    // barra cuyo ancho pone el usuario: ahí cabe un número y no dos. Y es el TOTAL porque la
    // fila sirve para comparar sesiones de un vistazo, y un par no se compara — se lee.
    const { container } = render(<CosteDelTurno consumo={consumo(cuenta(11_000, 200), cuenta(7, 3))} ambito="sesion" />);
    expect(screen.getByText("11,2k")).toBeTruthy();
    // Las dos mitades NO salen por su cuenta: 11000 y 200 no se pintan sueltos en ningún sitio.
    expect(screen.queryByText("11k")).toBeNull();
    expect(screen.queryByText("200")).toBeNull();
    // Y la Σ va oculta al oído, como las flechas del turno: «sigma» leído en voz alta no dice
    // nada, y el significado lo lleva el `aria-label`.
    const signos = [...container.querySelectorAll("span")].filter(
      (s) => /[↑↓·Σ]/.test(s.textContent ?? "") && !s.hasAttribute("aria-label")
    );
    expect(signos.length).toBeGreaterThan(0);
    expect(signos.every((s) => s.getAttribute("aria-hidden") === "true")).toBe(true);
  });

  it("habla de la SESIÓN y no de un turno, en el `title` y en el `aria-label`", () => {
    // El mismo componente con el mismo número dice dos cosas distintas: en la línea de cierre
    // es lo que costó ESTE turno, y en la barra lo que lleva la sesión entera. El `aria-label`
    // va con el `title` porque el `title` no se anuncia de forma fiable.
    const { container } = render(<CosteDelTurno consumo={consumo(cuenta(11_000, 200))} ambito="sesion" />);
    expect(screen.getByTitle(/Gastado en esta sesión: 11200 tokens en total/)).toBeTruthy();
    // Y NO dice «turno» en ningún sitio: es la frase que mentiría.
    const caja = container.querySelector("[aria-label]");
    expect(caja?.getAttribute("aria-label")).toBe(
      "Esta sesión: 11200 tokens en total, 11000 de entrada y 200 de salida"
    );
    expect(caja?.getAttribute("title")).not.toContain("este turno");
  });

  it("la caché sale del `title` en la fila, porque ahí son ~60 px del título", () => {
    // La caché sigue CONTANDO —está en el `title`, que es donde se consulta— y lo que cambia
    // es que no ocupa sitio en una línea que compite con el nombre de la sesión.
    const { container } = render(<CosteDelTurno consumo={consumo(cuenta(11_000, 200, 9_000))} ambito="sesion" />);
    expect(container.textContent).not.toContain("caché");
    expect(screen.getByTitle(/caché leída: 9000/)).toBeTruthy();
    expect(container.querySelector("[aria-label]")?.getAttribute("aria-label")).toBe(
      "Esta sesión: 11200 tokens en total, 11000 de entrada y 200 de salida, con 9000 de caché"
    );
  });

  it("sin `ambito` sigue siendo el turno: el que ya había no cambia de frase", () => {
    // El valor por omisión no es cosmético: `CierreDelTurno` monta este componente sin pasar
    // nada, y con la omisión al revés cada turno pasaría a decir que gastó la sesión entera.
    render(<CosteDelTurno consumo={consumo(cuenta(100, 10))} />);
    expect(screen.getByTitle(/Trabajo de este turno/)).toBeTruthy();
  });

  it("el mismo `{0,0}` que no se pinta en el turno no se pinta en la fila", () => {
    // La omisión es UNA regla (`hayCosteQueEnsenar`) y no una por ámbito: si aquí se pintara,
    // cada sesión sin medir saldría con un `↑0 ↓0` que nadie ha medido.
    const { container } = render(<CosteDelTurno consumo={consumo(cuenta(0, 0))} ambito="sesion" />);
    expect(container.textContent).toBe("");
  });
});
