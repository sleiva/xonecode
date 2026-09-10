import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { StrictMode } from "react";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { Aprobacion } from "./Aprobacion.js";

// Mismo motivo que en `Compositor.test.tsx`: sin `globals` en `vitest.config.ts` no hay
// auto-cleanup, y aquí pesa el doble — el modal va a un PORTAL sobre `document.body`, así
// que un segundo `render()` dejaría DOS modales y `getByRole("button", …)` reventaría con
// «found multiple elements». Además, `cleanup` desmonta: es lo que ejerce el rechazo al
// desmontar en todos los tests, no solo en el que lo mide.
afterEach(cleanup);

const AQUI = dirname(fileURLToPath(import.meta.url));

/**
 * Los fixtures del brief venían con TRES formas inventadas, y las tres se corrigen aquí
 * contra el código que las produce de verdad — un test que pasa contra una forma que el
 * cable no manda no prueba nada:
 *
 * 1. `decisionesPermitidas: ["si", "no"]` → `["approve", "reject"]`. Es el
 *    `Decision["type"]` de `vendor/hitl.ts:27`, que `hitl.ts:74` pone por omisión y
 *    `web/servidor/consolaWeb.ts:311` compara EXACTAMENTE: con «si» por el cable, el
 *    servidor no ascendería nada y toda aprobación sería un rechazo mudo.
 * 2. `{ signo: "+", texto }` → `{ tipo: "anadido", texto }`. `LineaDeDiff` es
 *    `{ tipo: "igual" | "anadido" | "quitado"; texto: string }` (`core/diff.ts:12`).
 * 3. `diffs` indexado por RUTA → indexado por **id del pendiente**. Medido en
 *    `agent/turnoReal.ts:168-184`: los dos mapas se llenan con `ficheros.set(c.id, …)` y
 *    `diffs.set(c.id, …)`, y `cli/tui/aprobarTui.tsx` los consulta igual. `ficheros` no
 *    lleva el contenido: lleva la RUTA del fichero que se va a escribir.
 */
const PENDIENTES = [
  { id: "1", origen: "dev", descripcion: "escribir src/app.xne", decisionesPermitidas: ["approve", "reject"] },
];
const DIFFS = { "1": [{ tipo: "anadido", texto: '<coleccion name="clientes"/>' }] };

describe("Aprobacion", () => {
  it("enseña el diff entero: es el paso donde se DECIDE sobre el contenido", () => {
    render(<Aprobacion pendientes={PENDIENTES} ficheros={{}} diffs={DIFFS} alDecidir={() => {}} />);
    expect(screen.getByText(/coleccion name="clientes"/)).toBeTruthy();
  });

  it("solo «Aprobar» aprueba", () => {
    const alDecidir = vi.fn();
    render(<Aprobacion pendientes={PENDIENTES} ficheros={{}} diffs={DIFFS} alDecidir={alDecidir} />);
    fireEvent.click(screen.getByRole("button", { name: /aprobar/i }));
    expect(alDecidir).toHaveBeenCalledWith({ "1": "approve" });
  });

  it("Escape RECHAZA de forma explícita, no en silencio", () => {
    const alDecidir = vi.fn();
    render(<Aprobacion pendientes={PENDIENTES} ficheros={{}} diffs={DIFFS} alDecidir={alDecidir} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(alDecidir).toHaveBeenCalledWith({ "1": "reject" });
  });

  it("cerrar sin decidir rechaza", () => {
    const alDecidir = vi.fn();
    const { unmount } = render(
      <Aprobacion pendientes={PENDIENTES} ficheros={{}} diffs={DIFFS} alDecidir={alDecidir} />
    );
    unmount();
    expect(alDecidir).toHaveBeenCalledWith({ "1": "reject" });
  });

  /**
   * El `mask` de `Modal` sí llama a `onClose`, pero es un `<div aria-hidden="true">` sin
   * clase y, como las primitivas no traen CSS, no se pinta: nadie puede pulsarlo. El velo
   * que el usuario ve es el nuestro, dentro del `dialog`, y hasta este arreglo pinchar ahí
   * no rechazaba nada — la dirección era segura, pero el comentario prometía una cobertura
   * que no existía.
   */
  it("pinchar en el velo VISIBLE rechaza; pinchar dentro de la tarjeta no", () => {
    const alDecidir = vi.fn();
    render(<Aprobacion pendientes={PENDIENTES} ficheros={{}} diffs={DIFFS} alDecidir={alDecidir} />);
    // El velo es el único hijo del `dialog`; la tarjeta cuelga de él.
    const velo = screen.getByRole("dialog").firstElementChild as HTMLElement;
    fireEvent.click(velo.firstElementChild as HTMLElement);
    expect(alDecidir).not.toHaveBeenCalled();
    fireEvent.click(velo);
    expect(alDecidir).toHaveBeenCalledWith({ "1": "reject" });
  });

  /**
   * Medido antes del arreglo: `void enviar(...)` no esperaba nada y la interfaz se retiraba
   * síncrona, así que un `POST` fallido dejaba al usuario convencido de haber aprobado algo
   * que no llegó al servidor — y que diez minutos después vencía como rechazo sin que nadie
   * lo dijera.
   */
  it("si el envío falla, el modal lo DICE y se puede reintentar: el candado se suelta", async () => {
    const alDecidir = vi.fn(() => Promise.reject(new Error("sin red")));
    render(<Aprobacion pendientes={PENDIENTES} ficheros={{}} diffs={DIFFS} alDecidir={alDecidir} />);
    fireEvent.click(screen.getByRole("button", { name: /aprobar/i }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/no llegó/i));
    // Y el modal sigue en pie: quien lo retira es quien lo montó, y solo si el envío llegó.
    expect(screen.getByRole("button", { name: /aprobar/i })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /aprobar/i }));
    expect(alDecidir).toHaveBeenCalledTimes(2);
  });

  it("«Rechazar» rechaza, y es la única otra salida con botón", () => {
    const alDecidir = vi.fn();
    render(<Aprobacion pendientes={PENDIENTES} ficheros={{}} diffs={DIFFS} alDecidir={alDecidir} />);
    fireEvent.click(screen.getByRole("button", { name: /rechazar/i }));
    expect(alDecidir).toHaveBeenCalledWith({ "1": "reject" });
  });

  /**
   * El fixture de una sola línea del brief no prueba «entero»: cualquier techo lo dejaría
   * pasar. `DiffBlock` de las primitivas colapsa el medio a las 16 filas por omisión y la
   * TUI recorta a 25 (`TECHO_DEL_DIFF`, `cli/tui/aprobarTui.tsx:17`) porque un terminal no
   * hace scroll; aquí no hay ese límite y este test es el que lo sostiene.
   */
  it("un diff de 40 líneas se enseña ENTERO: ni techo ni «… N líneas más»", () => {
    const largo = Array.from({ length: 40 }, (_, i) => ({ tipo: "anadido", texto: `linea-${i}` }));
    render(
      <Aprobacion pendientes={PENDIENTES} ficheros={{}} diffs={{ "1": largo }} alDecidir={() => {}} />
    );
    expect(screen.getByText("linea-0")).toBeTruthy();
    expect(screen.getByText("linea-39")).toBeTruthy();
  });

  /**
   * «Entero» no es «de golpe», y confundirlo escondía justo lo que hay que mirar: medido en
   * la pantalla del usuario con un `.xne` de sesenta campos, la tarjeta se llenaba de líneas
   * iguales y el cambio había que buscarlo a ojo. La racha se dobla en una línea que dice
   * cuántas son, y lo que cambió se ve sin abrir nada.
   */
  it("las líneas SIN CAMBIOS se pliegan y el cambio queda a la vista", () => {
    const largo = [
      { tipo: "anadido", texto: "lo que cambió" },
      ...Array.from({ length: 40 }, (_, i) => ({ tipo: "igual", texto: `igual-${i}` })),
    ];
    render(<Aprobacion pendientes={PENDIENTES} ficheros={{}} diffs={{ "1": largo }} alDecidir={() => {}} />);
    expect(screen.getByText("lo que cambió")).toBeTruthy();
    // El contexto de al lado del cambio, sí; el fondo de la racha, no.
    expect(screen.getByText("igual-0")).toBeTruthy();
    expect(screen.queryByText("igual-20")).toBeNull();
    expect(screen.getByText("… 37 líneas sin cambios")).toBeTruthy();
  });

  /**
   * Y NO SE PIERDEN: se abren con un clic, que es lo que mantiene cierta la regla del modal
   * —el contenido está entero donde se decide sobre él— sin volcarlo de golpe. Es el mismo
   * trato que el chat le da al trabajo del agente.
   */
  it("la racha plegada se ABRE al pulsarla: nada se pierde", () => {
    const largo = [
      { tipo: "anadido", texto: "lo que cambió" },
      ...Array.from({ length: 40 }, (_, i) => ({ tipo: "igual", texto: `igual-${i}` })),
    ];
    render(<Aprobacion pendientes={PENDIENTES} ficheros={{}} diffs={{ "1": largo }} alDecidir={() => {}} />);
    fireEvent.click(screen.getByText("… 37 líneas sin cambios"));
    expect(screen.getByText("igual-20")).toBeTruthy();
    expect(screen.queryByText("… 37 líneas sin cambios")).toBeNull();
  });

  /** Abrir una racha NO es decidir: el modal sigue esperando, y ni aprueba ni rechaza. */
  it("abrir una racha no manda ninguna decisión", () => {
    const alDecidir = vi.fn();
    const largo = [
      { tipo: "anadido", texto: "lo que cambió" },
      ...Array.from({ length: 40 }, (_, i) => ({ tipo: "igual", texto: `igual-${i}` })),
    ];
    render(<Aprobacion pendientes={PENDIENTES} ficheros={{}} diffs={{ "1": largo }} alDecidir={alDecidir} />);
    fireEvent.click(screen.getByText("… 37 líneas sin cambios"));
    expect(alDecidir).not.toHaveBeenCalled();
  });

  it("decidir dos veces manda UNA decisión: el desmontaje posterior ya no rechaza nada", () => {
    const alDecidir = vi.fn();
    const { unmount } = render(
      <Aprobacion pendientes={PENDIENTES} ficheros={{}} diffs={DIFFS} alDecidir={alDecidir} />
    );
    fireEvent.click(screen.getByRole("button", { name: /aprobar/i }));
    fireEvent.keyDown(document, { key: "Escape" });
    unmount();
    expect(alDecidir).toHaveBeenCalledTimes(1);
    expect(alDecidir).toHaveBeenCalledWith({ "1": "approve" });
  });

  /**
   * `main.tsx` envuelve la app en `<StrictMode>`, que en desarrollo monta, DESMONTA y
   * vuelve a montar cada componente nuevo. Medido en este repo: el `return` de un
   * `useEffect` se ejecuta una vez en ese falso desmontaje. Sin distinguirlo, el modal se
   * rechazaría solo en el instante de aparecer, cada vez, en todo el desarrollo — y peor:
   * `useRef` SOBREVIVE al remontaje falso, así que `decidido.current` ya valdría `true`
   * cuando aparece el modal de verdad y el clic en «Aprobar» sería un no-op mudo. Lo único
   * que saldría de la pantalla es el rechazo. Por eso el test mira las dos cosas.
   */
  it("el doble montaje de StrictMode NO cuenta como cerrar sin decidir, y deja el modal utilizable", () => {
    const alDecidir = vi.fn();
    render(
      <StrictMode>
        <Aprobacion pendientes={PENDIENTES} ficheros={{}} diffs={DIFFS} alDecidir={alDecidir} />
      </StrictMode>
    );
    expect(alDecidir).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /aprobar/i }));
    expect(alDecidir).toHaveBeenCalledWith({ "1": "approve" });
  });

  it("varios pendientes se deciden a la vez: una decisión parcial dejaría al resto rechazado por el servidor", () => {
    const alDecidir = vi.fn();
    const dos = [
      ...PENDIENTES,
      { id: "2", origen: "mockup", descripcion: "escribir src/otro.xne", decisionesPermitidas: ["approve", "reject"] },
    ];
    render(<Aprobacion pendientes={dos} ficheros={{}} diffs={DIFFS} alDecidir={alDecidir} />);
    fireEvent.click(screen.getByRole("button", { name: /aprobar/i }));
    expect(alDecidir).toHaveBeenCalledWith({ "1": "approve", "2": "approve" });
  });

  it("una línea de diff con forma desconocida se descarta sin tumbar el modal", () => {
    // Lo que llega es un `JSON.parse` de la red: `store.ts` ya no se fía de nada, y este
    // componente es el primero que le da FORMA a `unknown[]`.
    render(
      <Aprobacion
        pendientes={PENDIENTES}
        ficheros={{}}
        diffs={{ "1": [null, { tipo: "morado", texto: "x" }, { tipo: "igual", texto: "sí vale" }] }}
        alDecidir={() => {}}
      />
    );
    expect(screen.getByText("sí vale")).toBeTruthy();
    expect(screen.queryByText("x")).toBeNull();
  });

  it("la ruta del fichero se enseña: aprobar a ciegas es peor que no aprobar", () => {
    render(
      <Aprobacion
        pendientes={PENDIENTES}
        ficheros={{ "1": "src/app.xne" }}
        diffs={DIFFS}
        alDecidir={() => {}}
      />
    );
    expect(screen.getByText("src/app.xne")).toBeTruthy();
  });
});

/**
 * Estas declaraciones no se pueden probar montando el componente: jsdom no hace
 * layout, así que un `getBoundingClientRect` devuelve ceros y un modal roto pasa en verde.
 * Se vigila la HOJA, que es el mismo trato que `Pestanas.test.tsx` le da a las reglas que
 * nadie ve fallar.
 *
 * Lo que se rompió, medido en el navegador con un diff de 60 campos: viewport de 953 px y
 * tarjeta de 1602 px, con «Rechazar» y «Aprobar» en `top: 1574`. Un modal fail-closed cuyo
 * botón de rechazo no se puede pulsar deja al usuario esperando el plazo de diez minutos
 * del servidor sin ninguna explicación.
 */
describe("la tarjeta cabe en la pantalla, y el que cede es el diff", () => {
  const hoja = readFileSync(join(AQUI, "Aprobacion.module.css"), "utf8");
  const regla = (nombre: string): string =>
    hoja.slice(hoja.indexOf(`.${nombre} {`)).slice(0, hoja.slice(hoja.indexOf(`.${nombre} {`)).indexOf("}"));

  it("la fila del velo está DEFINIDA: sin eso el `max-height` de la tarjeta no resuelve", () => {
    // Un porcentaje contra una pista de grid `auto` se trata como `none`. `max-height: 100%`
    // llevaba puesto desde el principio y no hacía absolutamente nada.
    expect(regla("velo")).toMatch(/grid-template-rows:\s*minmax\(0,\s*1fr\)/);
    expect(regla("tarjeta")).toMatch(/max-height:\s*100%/);
  });

  it("la COLUMNA del velo también está definida: sin eso la tarjeta se va fuera de la pantalla", () => {
    // La misma trampa en el otro eje, y peor: la columna implícita es `auto` —max-content—,
    // y aquí el max-content lo pone la línea más larga del diff. `overflow-x: auto` en
    // `.diff` la mantiene dentro, pero no reduce su max-content. Medido en Chrome con el
    // CSS ya construido: viewport 999, línea de 3130 px, y la tarjeta centrada en esa pista
    // caía en `x: 1179` con los dos botones fuera y `scrollWidth` = 991, o sea sin forma de
    // alcanzarlos. Con la columna definida: `x: 55`.
    expect(regla("velo")).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  });

  it("el velo cuenta su padding DENTRO: en este cliente no hay reset de `box-sizing`", () => {
    // `height: 100%` + `padding: 24px` en content-box daban 1001 px dentro de una capa
    // de 953. Lo mismo que ya documentan `Agentes.module.css` y `Pregunta.module.css`.
    expect(regla("velo")).toMatch(/box-sizing:\s*border-box/);
  });

  it("el cuerpo puede ENCOGER, que es lo que hace real su scroll", () => {
    // Un item de flex no baja de la altura de su contenido (`min-height: auto`), así que el
    // `overflow-y: auto` era decorativo: medido, `scrollHeight` y `clientHeight` valían los
    // dos 1480 — no había nada que desplazar porque nadie lo había encogido.
    expect(regla("cuerpo")).toMatch(/min-height:\s*0/);
    expect(regla("cuerpo")).toMatch(/overflow-y:\s*auto/);
  });
});
