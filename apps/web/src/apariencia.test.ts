import { afterEach, describe, expect, it, vi } from "vitest";
import { aplicarApariencia, guardarApariencia, leerApariencia } from "./apariencia.js";

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
  document.body.removeAttribute("data-ds-dark-theme");
});

/** El único ajuste visual que un navegador puede cumplir: el resto de «temas» son paletas
 *  ANSI de la consola de terminal y aquí no pintarían nada. */
describe("apariencia", () => {
  it("sin nada guardado, la omisión es «sistema»: no se decide por el usuario", () => {
    expect(leerApariencia()).toBe("sistema");
  });

  it("lo guardado se lee, y un valor que no es de los tres se descarta", () => {
    guardarApariencia("oscuro");
    expect(leerApariencia()).toBe("oscuro");
    window.localStorage.setItem("xonecode.apariencia", "fucsia");
    expect(leerApariencia()).toBe("sistema");
  });

  /**
   * En una ventana privada o con las cookies de sitio bloqueadas, el propio accesor LANZA.
   * Una preferencia estética no puede tumbar la aplicación.
   */
  it("un `localStorage` que lanza no rompe nada: se cae a «sistema» y se sigue", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("bloqueado");
      },
      setItem: () => {
        throw new Error("bloqueado");
      },
    });
    expect(leerApariencia()).toBe("sistema");
    expect(() => guardarApariencia("oscuro")).not.toThrow();
  });

  it("«oscuro» pone el atributo del CSS de deepseek y «claro» lo quita", () => {
    aplicarApariencia("oscuro");
    expect(document.body.hasAttribute("data-ds-dark-theme")).toBe(true);
    aplicarApariencia("claro");
    expect(document.body.hasAttribute("data-ds-dark-theme")).toBe(false);
  });

  it("«sistema» mira la preferencia que el usuario ya expresó en su sistema operativo", () => {
    vi.stubGlobal("matchMedia", (consulta: string) => ({
      matches: consulta.includes("dark"),
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    aplicarApariencia("sistema");
    expect(document.body.hasAttribute("data-ds-dark-theme")).toBe(true);

    vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }));
    aplicarApariencia("sistema");
    expect(document.body.hasAttribute("data-ds-dark-theme")).toBe(false);
  });

  it("sin `matchMedia` (jsdom viejo, o un navegador raro) «sistema» es claro y no lanza", () => {
    vi.stubGlobal("matchMedia", undefined);
    expect(() => aplicarApariencia("sistema")).not.toThrow();
    expect(document.body.hasAttribute("data-ds-dark-theme")).toBe(false);
  });
});
