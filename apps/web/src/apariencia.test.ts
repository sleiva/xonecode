import { afterEach, describe, expect, it, vi } from "vitest";
import { aplicarApariencia, guardarApariencia, guardarTema, leerApariencia, leerTemas } from "./apariencia.js";
import { NOMBRES_DE_SEMILLA, temaPorId } from "./temas.js";

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
  document.body.removeAttribute("data-ds-dark-theme");
  document.body.removeAttribute("data-tema");
  document.body.removeAttribute("style");
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

describe("temas por modo", () => {
  it("sin nada guardado, XOneCode en los dos modos", () => {
    expect(leerTemas()).toEqual({ claro: "xonecode-claro", oscuro: "xonecode-oscuro" });
  });

  it("lo guardado se lee, y un id de otro modo o desconocido cae en XOneCode", () => {
    guardarTema("oscuro", "dracula");
    guardarTema("claro", "github-claro");
    expect(leerTemas()).toEqual({ claro: "github-claro", oscuro: "dracula" });
    window.localStorage.setItem("xonecode.tema.claro", "dracula");
    window.localStorage.setItem("xonecode.tema.oscuro", "fucsia");
    expect(leerTemas()).toEqual({ claro: "xonecode-claro", oscuro: "xonecode-oscuro" });
  });

  it("un `localStorage` que lanza no rompe nada", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("bloqueado");
      },
      setItem: () => {
        throw new Error("bloqueado");
      },
    });
    expect(leerTemas()).toEqual({ claro: "xonecode-claro", oscuro: "xonecode-oscuro" });
    expect(() => guardarTema("oscuro", "dracula")).not.toThrow();
  });

  it("aplica el tema del modo EN VIGOR: atributo y las 24 semillas", () => {
    aplicarApariencia("oscuro", { claro: "github-claro", oscuro: "dracula" });
    expect(document.body.hasAttribute("data-ds-dark-theme")).toBe(true);
    expect(document.body.getAttribute("data-tema")).toBe("dracula");
    const semillas = temaPorId("dracula", "oscuro").semillas!;
    for (const n of NOMBRES_DE_SEMILLA) expect(document.body.style.getPropertyValue(`--tema-${n}`), n).toBe(semillas[n]);
  });

  it("XOneCode QUITA el atributo y cada semilla: queda la cascada de siempre", () => {
    aplicarApariencia("oscuro", { claro: "github-claro", oscuro: "dracula" });
    aplicarApariencia("claro", { claro: "xonecode-claro", oscuro: "dracula" });
    expect(document.body.hasAttribute("data-tema")).toBe(false);
    for (const n of NOMBRES_DE_SEMILLA) expect(document.body.style.getPropertyValue(`--tema-${n}`), n).toBe("");
  });

  it("cambiar de modo cambia de tema: cada modo tiene el suyo", () => {
    const temas = { claro: "one-claro", oscuro: "github-oscuro" };
    aplicarApariencia("claro", temas);
    expect(document.body.getAttribute("data-tema")).toBe("one-claro");
    aplicarApariencia("oscuro", temas);
    expect(document.body.getAttribute("data-tema")).toBe("github-oscuro");
  });

  it("sin temas, como antes: solo el modo", () => {
    aplicarApariencia("oscuro");
    expect(document.body.hasAttribute("data-ds-dark-theme")).toBe(true);
    expect(document.body.hasAttribute("data-tema")).toBe(false);
  });
});
