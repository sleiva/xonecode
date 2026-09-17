import { cleanup, render, act } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MS_ENTRE_MEDIDAS_AL_VOLVER, useMedirAlVolver } from "./medirAlVolver.js";

afterEach(cleanup);

/** Un componente de una línea: lo que se prueba es el hook, no una pantalla. */
function Sonda({ activo, medir }: { activo: boolean; medir?: () => void }) {
  useMedirAlVolver(activo, medir);
  return null;
}

/** Volver a la ventana. Es lo que pasa al cambiar del terminal al navegador. */
const volver = (): void => {
  act(() => {
    window.dispatchEvent(new Event("focus"));
  });
};

describe("useMedirAlVolver", () => {
  it("mide al entrar", () => {
    const medir = vi.fn();
    render(<Sonda activo medir={medir} />);
    expect(medir).toHaveBeenCalledTimes(1);
  });

  it("no mide si la pantalla no está delante", () => {
    const medir = vi.fn();
    render(<Sonda activo={false} medir={medir} />);
    expect(medir).not.toHaveBeenCalled();
  });

  /**
   * **El caso que el usuario encontró.** Dejas Dispositivos abierto, te vas al terminal a
   * matar el emulador y vuelves: la sección no ha cambiado, así que sin esto no se remide y la
   * fila se queda en verde sobre una foto vieja. Reproducido en el navegador antes de tocarlo.
   */
  it("mide otra vez al VOLVER a la ventana, sin cambiar de sección", () => {
    const medir = vi.fn();
    render(<Sonda activo medir={medir} />);
    expect(medir).toHaveBeenCalledTimes(1);
    vi.useFakeTimers();
    try {
      // Pasado el plazo de deduplicación, volver cuenta como pedir de nuevo.
      vi.setSystemTime(Date.now() + MS_ENTRE_MEDIDAS_AL_VOLVER + 10);
      volver();
      expect(medir).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  /**
   * Volver a una pestaña dispara `focus` Y `visibilitychange`: es una sola vuelta, así que es
   * una sola medida. Sin el plazo, cada vuelta lanzaría dos veces `adb` y `xcrun`.
   */
  it("dos eventos de la misma vuelta son UNA medida", () => {
    const medir = vi.fn();
    render(<Sonda activo medir={medir} />);
    vi.useFakeTimers();
    try {
      // Hay que pasar el plazo primero: la medida del montaje acaba de fijarlo, así que
      // inmediatamente después los DOS eventos se deduplican — y eso también es correcto.
      vi.setSystemTime(Date.now() + MS_ENTRE_MEDIDAS_AL_VOLVER + 10);
      medir.mockClear();
      volver();
      act(() => {
        document.dispatchEvent(new Event("visibilitychange"));
      });
      expect(medir).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("y justo después de medir, volver no vuelve a medir: es la misma vuelta", () => {
    const medir = vi.fn();
    render(<Sonda activo medir={medir} />);
    medir.mockClear();
    volver();
    expect(medir).not.toHaveBeenCalled();
  });

  /**
   * **La tormenta que casi se colé.** `App` pasaba a Ajustes una lambda escrita en el JSX, y
   * si el hook dependiera de su identidad volvería a suscribirse en cada render — y como la
   * suscripción mide al entrar, eso es una medida por render: un proceso `adb` por tecla. La
   * ref interna es lo que lo impide, y esto es lo que muere si alguien la quita.
   */
  it("un `medir` nuevo en cada render NO provoca una medida por render", () => {
    const espia = vi.fn();
    const { rerender } = render(<Sonda activo medir={() => espia()} />);
    expect(espia).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 5; i++) rerender(<Sonda activo medir={() => espia()} />);
    expect(espia).toHaveBeenCalledTimes(1);
  });

  it("y se desuscribe: con la pantalla cerrada, volver no mide", () => {
    const medir = vi.fn();
    const { rerender } = render(<Sonda activo medir={medir} />);
    rerender(<Sonda activo={false} medir={medir} />);
    medir.mockClear();
    volver();
    expect(medir).not.toHaveBeenCalled();
  });
});
