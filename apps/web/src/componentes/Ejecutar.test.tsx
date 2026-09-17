import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EstadoDelCliente } from "../store.js";
import type { Dispositivo } from "../tipos.js";
import { Ejecutar } from "./Ejecutar.js";

/**
 * Caso por caso de la pestaña `Ejecutar`, en jsdom.
 *
 * Lo que se comprueba aquí son las reglas que hacen que un control no prometa lo que no
 * puede: sin verbo no hay botón, sin cable no hay botón, con el veredicto en contra se
 * enseñan TODAS las faltas y ninguna frase compuesta por el cliente, y el recorrido de un
 * lanzamiento en curso se pinta sin recortar lo que el servidor ya recortó.
 *
 * **Y los dos tipos salen del STORE**, no del cable: es el empalme de la Tarea 10, y el
 * compilador lo prueba aquí — ver `ESTADO_DEL_STORE`.
 */

afterEach(cleanup);

const NADA = (): void => {};

/** Del store, como el prop: `estado.lanzable` no lleva `clase`, que es del sobre y no un dato. */
type Veredicto = NonNullable<EstadoDelCliente["lanzable"]>;
type Lanzamiento = NonNullable<EstadoDelCliente["lanzamiento"]>;

const PIXEL: Dispositivo = {
  id: "ABC",
  nombre: "Pixel 8",
  plataforma: "android",
  clase: "fisico",
  estado: "conectado",
};

/** El mimo aparato, pero apagado: es el que NO se ofrece en esta pestaña. */
const IPHONE: Dispositivo = {
  id: "XYZ",
  nombre: "iPhone 15",
  plataforma: "ios",
  clase: "simulador",
  estado: "apagado",
};

const VEREDICTO: Veredicto = {
  proyecto: "AppDemo",
  listo: true,
  faltas: [],
  app: "Hola",
  dispositivo: { id: "ABC", nombre: "Pixel 8", plataforma: "android", clase: "fisico" },
  medido: "2026-09-16T10:00:00.000Z",
};

const EN_CURSO: Lanzamiento = {
  proyecto: "AppDemo",
  dispositivo: { id: "ABC", nombre: "Pixel 8", plataforma: "android", clase: "fisico" },
  fase: "empaquetando",
  estado: "corriendo",
  lineas: ["subiendo 12 ficheros al dispositivo", "1 fichero omitido"],
  ms: 1200,
};

/**
 * El empalme de la Tarea 10, tal cual: los campos del estado entran en los props **sin
 * adaptador**. Si el prop volviera a tiparse desde el cable (`Extract<MensajeAlCliente, …>`),
 * este objeto dejaría de compilar —`clase: "lanzable"` no está en el estado— y el fallo
 * saldría aquí y no en `App.tsx`.
 */
const ESTADO_DEL_STORE: EstadoDelCliente = { actos: [], conectado: true, lanzable: VEREDICTO, lanzamiento: EN_CURSO };

describe("Ejecutar: la medida y el botón", () => {
  it("sin veredicto dice que está midiendo, y no adelanta un botón", () => {
    render(<Ejecutar conectado alRevisar={NADA} alLanzar={NADA} />);
    expect(screen.getByText(/midiendo si se puede lanzar/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /ejecutar/i })).toBeNull();
  });

  it("sin alLanzar no hay botón: sin verbo no se pinta un control muerto", () => {
    render(<Ejecutar veredicto={VEREDICTO} conectado alRevisar={NADA} />);
    expect(screen.queryByRole("button", { name: /ejecutar/i })).toBeNull();
  });

  it("con el veredicto listo y alLanzar hay botón, y pulsarlo llama UNA vez", () => {
    const alLanzar = vi.fn();
    render(<Ejecutar veredicto={VEREDICTO} conectado alRevisar={NADA} alLanzar={alLanzar} />);
    fireEvent.click(screen.getByRole("button", { name: /ejecutar/i }));
    expect(alLanzar).toHaveBeenCalledTimes(1);
  });

  it("el botón dice EN QUÉ dispositivo va a lanzar", () => {
    // Un botón que dice «Ejecutar» y lanza en un sitio que no se ve es una promesa sin sujeto.
    render(<Ejecutar veredicto={VEREDICTO} conectado alRevisar={NADA} alLanzar={NADA} />);
    expect(screen.getByRole("button", { name: /ejecutar/i }).textContent).toMatch(/Pixel 8/);
  });

  it("con el veredicto en contra se pintan TODAS las faltas, y ninguna frase se compone aquí", () => {
    const faltas = [
      "El dispositivo «Pixel 8» no responde: está apagado.",
      "A este proyecto le falta el fichero «bd/gestion.db» que declara su conexión.",
    ];
    const alLanzar = vi.fn();
    render(
      <Ejecutar veredicto={{ ...VEREDICTO, listo: false, faltas }} conectado alRevisar={NADA} alLanzar={alLanzar} />
    );
    // Las dos, cada una con su renglón: el texto lo escribe `core/puedeLanzarse.ts`, y el
    // cliente que se inventara una causa compuesta taparía justo la que hay que arreglar.
    for (const falta of faltas) expect(screen.getByText(falta)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /ejecutar/i })).toBeNull();
  });

  it("sin cable no hay botón, y se dice por qué", () => {
    render(<Ejecutar veredicto={VEREDICTO} conectado={false} alRevisar={NADA} alLanzar={NADA} />);
    expect(screen.queryByRole("button", { name: /ejecutar/i })).toBeNull();
    expect(screen.getByText(/sin conexión con el servidor/i)).toBeTruthy();
  });

  it("no repite el nombre cuando la app y el proyecto se llaman igual", () => {
    // El caso del esqueleto de xonecode, que es donde se midió en el emulador: la carpeta y el
    // `app.ini` se llaman igual, así que la cabecera decía «EjecutarDemo en EjecutarDemo».
    // Y lo que lo escondía era el fixture: con `proyecto: "AppDemo"` y `app: "Hola"` —los dos
    // nombres distintos— esa línea no se pintaba nunca, así que el `if` que prometía evitar la
    // duplicación no la evitaba y ningún caso lo notaba.
    render(
      <Ejecutar
        veredicto={{ ...VEREDICTO, proyecto: "EjecutarDemo", app: "EjecutarDemo" }}
        conectado
        alRevisar={NADA}
      />
    );
    expect(screen.getByText("EjecutarDemo")).toBeTruthy();
    expect(screen.queryByText(/en EjecutarDemo/)).toBeNull();
  });

  it("y el proyecto SÍ se nombra cuando difiere: no se calla siempre", () => {
    // La otra mitad, que es la que ya funcionaba: sin este caso, «no pintar nunca el proyecto»
    // pasaría el test de arriba tan contento.
    render(<Ejecutar veredicto={VEREDICTO} conectado alRevisar={NADA} />);
    expect(screen.getByText(/en AppDemo/)).toBeTruthy();
  });
});

describe("Ejecutar: el empalme con el store", () => {
  it("los campos del estado entran tal cual, sin adaptador: es el empalme que compila la Tarea 10", () => {
    // Los DOS campos a la vez y sin adaptador. Se pasa el estado que hay de verdad —uno con el
    // lanzamiento EN CURSO—, así que lo que se comprueba es lo que ese estado pinta: el
    // veredicto arriba, el recorrido con su fase y sus líneas, y ningún botón de lanzar
    // mientras corre (que es la regla, no una carencia del caso).
    render(
      <Ejecutar
        veredicto={ESTADO_DEL_STORE.lanzable}
        lanzamiento={ESTADO_DEL_STORE.lanzamiento}
        conectado={ESTADO_DEL_STORE.conectado}
        dispositivos={[PIXEL]}
        alRevisar={NADA}
        alLanzar={NADA}
      />
    );
    expect(screen.getByText("Hola")).toBeTruthy();
    expect(screen.getByText(/empaquetando la app/i)).toBeTruthy();
    expect(screen.getByText(/subiendo 12 ficheros al dispositivo/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /ejecutar/i })).toBeNull();
  });
});

describe("Ejecutar: cuándo se pide la medida", () => {
  it("al montarse pide el veredicto: montarse ES lo que hace medir", () => {
    const alRevisar = vi.fn();
    render(<Ejecutar conectado alRevisar={alRevisar} />);
    expect(alRevisar).toHaveBeenCalledTimes(1);
  });

  it("sin cable no se pide nada: la petición se perdería sin decirlo", () => {
    const alRevisar = vi.fn();
    render(<Ejecutar conectado={false} alRevisar={alRevisar} />);
    expect(alRevisar).not.toHaveBeenCalled();
  });

  it("al volver el cable se vuelve a pedir, o la pestaña se queda midiendo para siempre", () => {
    // `marcarDesconectado` tira el veredicto (`store.ts`): sin esta segunda petición, la
    // pestaña se queda en «midiendo» tras una reconexión que nadie ha pedido.
    const alRevisar = vi.fn();
    const { rerender } = render(<Ejecutar conectado={false} alRevisar={alRevisar} />);
    expect(alRevisar).not.toHaveBeenCalled();
    rerender(<Ejecutar conectado alRevisar={alRevisar} />);
    expect(alRevisar).toHaveBeenCalledTimes(1);
  });

  it("si cambia el aparato elegido se vuelve a medir: el dispositivo es una entrada del veredicto", () => {
    // Medido en el emulador el 16-sep-2026: al pulsar un aparato en la lista de la PROPIA
    // pestaña, su fila pasaba a decir «el de esta sesión» mientras el veredicto de arriba
    // seguía afirmando «Esta sesión no tiene ningún dispositivo elegido». El panel se
    // contradecía a sí mismo en pantalla hasta que algo forzara otra medida.
    const alRevisar = vi.fn();
    const { rerender } = render(<Ejecutar conectado alRevisar={alRevisar} />);
    expect(alRevisar).toHaveBeenCalledTimes(1);
    rerender(
      <Ejecutar
        conectado
        alRevisar={alRevisar}
        elegido={{ id: "ABC", nombre: "Pixel 8", plataforma: "android", clase: "fisico" }}
      />
    );
    expect(alRevisar).toHaveBeenCalledTimes(2);
  });

  it("pero el MISMO aparato reenviado no pide otra medida: se depende del id, no del objeto", () => {
    // `elegido` se reconstruye en cada render del store, así que depender del objeto pediría un
    // `adb` por render — que es justo lo que el `useCallback` de `App` existe para evitar.
    const alRevisar = vi.fn();
    const pixel = { id: "ABC", nombre: "Pixel 8", plataforma: "android" as const, clase: "fisico" as const };
    const { rerender } = render(<Ejecutar conectado alRevisar={alRevisar} elegido={pixel} />);
    expect(alRevisar).toHaveBeenCalledTimes(1);
    rerender(<Ejecutar conectado alRevisar={alRevisar} elegido={{ ...pixel }} />);
    expect(alRevisar).toHaveBeenCalledTimes(1);
  });

  it("sin a quién pedírselo lo dice, en vez de prometer una medida que no va a llegar", () => {
    render(<Ejecutar conectado />);
    expect(screen.getByText(/no hay ningún proyecto abierto/i)).toBeTruthy();
  });
});

describe("Ejecutar: los dispositivos", () => {
  it("la lista son SOLO los que están a mano: el inventario entero está en Ajustes", () => {
    render(<Ejecutar conectado alRevisar={NADA} dispositivos={[PIXEL, IPHONE]} />);
    expect(screen.getByText(/Pixel 8/)).toBeTruthy();
    expect(screen.queryByText(/iPhone 15/)).toBeNull();
  });

  it("pulsar uno manda su id", () => {
    const alElegirDispositivo = vi.fn();
    render(
      <Ejecutar conectado alRevisar={NADA} dispositivos={[PIXEL]} alElegirDispositivo={alElegirDispositivo} />
    );
    fireEvent.click(screen.getByRole("button", { name: /Pixel 8/ }));
    expect(alElegirDispositivo).toHaveBeenCalledTimes(1);
    expect(alElegirDispositivo).toHaveBeenCalledWith("ABC");
  });

  it("sin a quién mandarlo se enseña la lista, pero no se finge que se puede elegir", () => {
    render(<Ejecutar conectado alRevisar={NADA} dispositivos={[PIXEL]} />);
    expect(screen.getByText(/Pixel 8/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Pixel 8/ })).toBeNull();
  });

  it("sin cable tampoco se elige: la elección se perdería sin decirlo", () => {
    render(<Ejecutar conectado={false} alRevisar={NADA} dispositivos={[PIXEL]} alElegirDispositivo={NADA} />);
    expect(screen.queryByRole("button", { name: /Pixel 8/ })).toBeNull();
  });

  it("con el elegido a la vista, su fila lo dice", () => {
    render(
      <Ejecutar
        conectado
        alRevisar={NADA}
        dispositivos={[PIXEL]}
        elegido={{ id: "ABC", nombre: "Pixel 8", plataforma: "android", clase: "fisico" }}
        alElegirDispositivo={NADA}
      />
    );
    expect(screen.getByRole("button", { name: /Pixel 8/ }).getAttribute("aria-current")).toBe("true");
  });

  it("sin informe de dispositivos dice cómo se empieza", () => {
    render(<Ejecutar conectado alRevisar={NADA} />);
    expect(screen.getByText(/todavía no se ha mirado qué hay enchufado/i)).toBeTruthy();
    expect(screen.getByText(/Ajustes → Dispositivos/)).toBeTruthy();
  });

  it("con informe y ninguno a mano, manda a Ajustes en vez de dejar un hueco", () => {
    render(
      <Ejecutar veredicto={{ ...VEREDICTO, listo: false, faltas: ["una"] }} conectado alRevisar={NADA} dispositivos={[IPHONE]} />
    );
    expect(screen.getByText(/En Ajustes → Dispositivos se ve qué le falta a cada uno/)).toBeTruthy();
  });
});

describe("Ejecutar: el recorrido del lanzamiento", () => {
  it("en curso se ven la fase, el tiempo y las últimas líneas", () => {
    render(<Ejecutar conectado alRevisar={NADA} lanzamiento={EN_CURSO} />);
    expect(screen.getByText(/empaquetando la app/i)).toBeTruthy();
    expect(screen.getByText("1.2 s")).toBeTruthy();
    expect(screen.getByText(/subiendo 12 ficheros al dispositivo/)).toBeTruthy();
  });

  it("mientras corre no se ofrece lanzar otra vez, aunque el veredicto siga listo", () => {
    const alLanzar = vi.fn();
    render(<Ejecutar veredicto={VEREDICTO} conectado alRevisar={NADA} alLanzar={alLanzar} lanzamiento={EN_CURSO} />);
    expect(screen.queryByRole("button", { name: /ejecutar/i })).toBeNull();
  });

  it("cancelar solo se ofrece si hay a quién pedírselo", () => {
    const { rerender } = render(<Ejecutar conectado alRevisar={NADA} lanzamiento={EN_CURSO} />);
    expect(screen.queryByRole("button", { name: /cancelar/i })).toBeNull();
    const alCancelar = vi.fn();
    rerender(<Ejecutar conectado alRevisar={NADA} lanzamiento={EN_CURSO} alCancelar={alCancelar} />);
    fireEvent.click(screen.getByRole("button", { name: /cancelar/i }));
    expect(alCancelar).toHaveBeenCalledTimes(1);
  });

  it("cancelar no se ofrece sobre un recorrido ya cerrado", () => {
    render(
      <Ejecutar conectado alRevisar={NADA} alCancelar={NADA} lanzamiento={{ ...EN_CURSO, estado: "cancelada" }} />
    );
    expect(screen.queryByRole("button", { name: /cancelar/i })).toBeNull();
  });

  it("al acabar bien dice que está viva Y con qué se comprobó: la lectura, no un «listo»", () => {
    render(
      <Ejecutar
        conectado
        alRevisar={NADA}
        lanzamiento={{
          ...EN_CURSO,
          fase: "comprobando-arranque",
          estado: "ok",
          ms: 42000,
          lineas: ["lanzando Hola por el canal /hotswap", "la app está viva: el framework contestó su árbol de controles"],
        }}
      />
    );
    expect(screen.getByText(/arrancó y está viva en Pixel 8/i)).toBeTruthy();
    // La lectura TAL CUAL la escribió el servidor: es el dato que distingue «arrancó» de
    // «el framework contestó», que es lo único que se midió. Y sale UNA vez: la última línea
    // de ese log ES esta lectura, así que repetir la cola debajo sería el mismo dato dos
    // veces en la misma tarjeta.
    expect(screen.getByText(/el framework contestó su árbol de controles/)).toBeTruthy();
    expect(screen.getAllByText(/el framework contestó su árbol de controles/)).toHaveLength(1);
  });

  it("un fallo enseña el motivo del servidor, tal cual", () => {
    render(
      <Ejecutar
        conectado
        alRevisar={NADA}
        lanzamiento={{
          ...EN_CURSO,
          fase: "comprobando",
          estado: "fallo",
          motivo: "no está adb: sin él no se llega al dispositivo",
        }}
      />
    );
    expect(screen.getByText("no está adb: sin él no se llega al dispositivo")).toBeTruthy();
    // Y con el fallo van sus líneas: son la única pista de dónde se quedó.
    expect(screen.getByText(/subiendo 12 ficheros al dispositivo/)).toBeTruthy();
  });

  it("un recorrido cancelado lo dice sin inventarse un motivo", () => {
    render(<Ejecutar conectado alRevisar={NADA} lanzamiento={{ ...EN_CURSO, estado: "cancelada" }} />);
    expect(screen.getByText(/se canceló el lanzamiento/i)).toBeTruthy();
  });

  it("las líneas van TAL CUAL: el servidor ya las recortó y aquí no se recortan otra vez", () => {
    const lineas = Array.from({ length: 12 }, (_, i) => `linea ${i}`);
    render(<Ejecutar conectado alRevisar={NADA} lanzamiento={{ ...EN_CURSO, lineas }} />);
    expect(screen.getByText(/linea 0/)).toBeTruthy();
    expect(screen.getByText(/linea 11/)).toBeTruthy();
  });
});
