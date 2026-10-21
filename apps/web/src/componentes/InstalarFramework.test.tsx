import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { esLaInstalada, etiquetasDe, InstalarFramework } from "./InstalarFramework.js";
import type { EstadoDelCliente } from "../store.js";
import type { FrameworksDelAparato } from "../tipos.js";

afterEach(() => {
  cleanup();
});

const SHA = "a".repeat(64);
const PIXEL = { id: "emulator-5554", nombre: "Pixel" };
const LOCAL = { origen: "local" as const, titulo: "v5.0.5.8rel", sha256: SHA, bytes: 40 * 1024 ** 2, preferida: true };
const REMOTA = { origen: "catalogo" as const, titulo: "v5.0.5.9dev", ficheroId: 60, preferida: false };
const oferta = (extra: Partial<FrameworksDelAparato> = {}): FrameworksDelAparato => ({
  serie: PIXEL.id,
  opciones: [LOCAL, REMOTA],
  instalada: "5.0.5.9dev",
  ...extra,
});
type Progreso = NonNullable<EstadoDelCliente["instalacion"]>;
const progreso = (estado: Progreso["estado"], extra: Partial<Progreso> = {}): Progreso => ({
  receta: "instalar-framework",
  paso: 0,
  titulo: "Instalando el framework",
  estado,
  lineas: [],
  ms: 1,
  ...extra,
});
const montar = (props: Partial<Parameters<typeof InstalarFramework>[0]> = {}) => {
  const llamadas = { pedir: vi.fn(), instalar: vi.fn(), cancelar: vi.fn(), cerrar: vi.fn() };
  const r = render(
    <InstalarFramework
      aparato={PIXEL}
      frameworks={oferta()}
      alPedir={llamadas.pedir}
      alInstalar={llamadas.instalar}
      alCancelar={llamadas.cancelar}
      alCerrar={llamadas.cerrar}
      {...props}
    />
  );
  return { ...llamadas, ...r };
};
const boton = (nombre: RegExp): HTMLButtonElement => screen.getByRole("button", { name: nombre }) as HTMLButtonElement;
const combo = (): HTMLSelectElement => screen.getByRole("combobox") as HTMLSelectElement;

describe("InstalarFramework", () => {
  it("pide la lista al abrirse y dice SIEMPRE qué tiene el aparato", () => {
    const { pedir } = montar();
    expect(pedir).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Tiene el framework 5\.0\.5\.9dev/)).toBeTruthy();
    expect(screen.getByText(/no se desinstala nada/)).toBeTruthy();
  });

  it("sin framework lo dice, y sin poder leerlo también lo dice: nunca se calla", () => {
    montar({ frameworks: oferta({ instalada: undefined, sinFramework: true }) });
    expect(screen.getByText(/No tiene el framework instalado/)).toBeTruthy();
    cleanup();
    montar({ frameworks: oferta({ instalada: undefined }) });
    expect(screen.getByText(/No se pudo leer/)).toBeTruthy();
  });

  it("la versión se elige en un COMBO; la local recomendada va elegida y se instala con su sha", () => {
    const { instalar } = montar();
    expect(combo().value).toBe(`local:${SHA}`);
    fireEvent.click(boton(/^Instalar$/));
    expect(instalar).toHaveBeenCalledWith({ local: SHA }, false);
  });

  it("las opciones llevan sus ETIQUETAS: descargada, en byXOne, recomendada, instalada", () => {
    montar();
    const textos = Array.from(combo().options).map((o) => o.textContent ?? "");
    expect(textos[0]).toMatch(/v5\.0\.5\.8rel.*descargada · recomendada/);
    expect(textos[1]).toMatch(/v5\.0\.5\.9dev.*en byXOne · instalada/);
    // Y las de la elegida, a la vista fuera del desplegable.
    expect(screen.getByText("descargada")).toBeTruthy();
  });

  it("una del catálogo se elige en el combo y se pide con su id de fichero, y el botón dice que descarga", () => {
    const { instalar } = montar();
    fireEvent.change(combo(), { target: { value: "catalogo:60" } });
    fireEvent.click(boton(/Descargar e instalar/));
    expect(instalar).toHaveBeenCalledWith({ catalogo: 60 }, false);
  });

  it("bajar de versión solo si se marca", () => {
    const { instalar } = montar();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(boton(/^Instalar$/));
    expect(instalar).toHaveBeenCalledWith({ local: SHA }, true);
  });

  it("sin catálogo dice por qué, y ofrece lo local igual", () => {
    montar({ frameworks: oferta({ opciones: [LOCAL], motivoDelCatalogo: "falta la credencial" }) });
    expect(screen.getByText(/falta la credencial/)).toBeTruthy();
    expect(combo().options).toHaveLength(1);
  });

  it("una oferta de OTRO aparato no cuenta: se sigue mirando", () => {
    montar({ frameworks: oferta({ serie: "otro" }) });
    expect(screen.getByText(/Buscando versiones/)).toBeTruthy();
  });

  it("un progreso que ya estaba al abrir no cuenta; el propio enseña cómo acabó", () => {
    const { rerender } = montar({ progreso: progreso("fallo", { motivo: "de antes" }) });
    expect(screen.queryByText(/de antes/)).toBeNull();
    fireEvent.click(boton(/^Instalar$/));
    const otra = (p: Progreso) => (
      <InstalarFramework aparato={PIXEL} frameworks={oferta()} progreso={p} alPedir={() => {}} alInstalar={() => {}} alCancelar={() => {}} alCerrar={() => {}} />
    );
    rerender(otra(progreso("corriendo")));
    expect(boton(/Detener/)).toBeTruthy();
    rerender(otra(progreso("fallo", { motivo: "firma distinta" })));
    expect(screen.getByText(/firma distinta/)).toBeTruthy();
  });
});

describe("las etiquetas de una versión", () => {
  it("«instalada» compara sin la v del catálogo", () => {
    expect(esLaInstalada("v5.0.5.9dev", "5.0.5.9dev")).toBe(true);
    expect(esLaInstalada("v5.0.5.9dev", "5.0.5.9rel")).toBe(false);
    expect(esLaInstalada("v5.0.5.9dev", undefined)).toBe(false);
  });
  it("de dónde sale va siempre primero", () => {
    expect(etiquetasDe(LOCAL, undefined)).toEqual(["descargada", "recomendada"]);
    expect(etiquetasDe(REMOTA, "5.0.5.9dev")).toEqual(["en byXOne", "instalada"]);
  });
});
