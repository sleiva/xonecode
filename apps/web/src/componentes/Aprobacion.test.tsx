import { StrictMode } from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { Aprobacion } from "./Aprobacion.js";

// Mismo motivo que en `Compositor.test.tsx`: sin `globals` en `vitest.config.ts` no hay
// auto-cleanup, y aquí pesa el doble — el modal va a un PORTAL sobre `document.body`, así
// que un segundo `render()` dejaría DOS modales y `getByRole("button", …)` reventaría con
// «found multiple elements». Además, `cleanup` desmonta: es lo que ejerce el rechazo al
// desmontar en todos los tests, no solo en el que lo mide.
afterEach(cleanup);

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
   * rechazaría solo en el instante de aparecer, cada vez, en todo el desarrollo.
   */
  it("el doble montaje de StrictMode NO cuenta como cerrar sin decidir", () => {
    const alDecidir = vi.fn();
    render(
      <StrictMode>
        <Aprobacion pendientes={PENDIENTES} ficheros={{}} diffs={DIFFS} alDecidir={alDecidir} />
      </StrictMode>
    );
    expect(alDecidir).not.toHaveBeenCalled();
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
