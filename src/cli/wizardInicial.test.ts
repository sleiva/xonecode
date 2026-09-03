import { describe, expect, it, vi } from "vitest";
import { CatalogoModelosEnMemoria } from "../core/ports.js";
import { asistenteDeModelo } from "./wizardInicial.js";

function consolaFalsa(respuestas: string[]) {
  const escrito: string[] = [];
  let i = 0;
  return {
    escrito,
    consola: {
      escribir: (t: string) => { escrito.push(t); },
      preguntar: async () => respuestas[i++] ?? "",
      leerSecreto: async () => "clave-secreta",
      interactivo: true,
      catalogoModelos: new CatalogoModelosEnMemoria({
        ollama: [{ proveedor: "ollama", id: "glm-5.3-flash:cloud", nombre: "GLM 5.3" }],
      }),
      seleccionar: async ({ opciones }: { opciones: Array<{ id: string }> }) => opciones[0]?.id,
    },
  };
}

describe("asistenteDeModelo", () => {
  it("no hace nada si ya hay un modelo elegido", async () => {
    const { consola, escrito } = consolaFalsa([]);
    const guardar = vi.fn();
    await asistenteDeModelo({ ...consola, guardarModeloGlobal: guardar } as never, { origenDeTrabajo: "global" });
    expect(guardar).not.toHaveBeenCalled();
    expect(escrito).toEqual([]);
  });

  it("sin TTY no pregunta ni escribe", async () => {
    const { consola, escrito } = consolaFalsa([]);
    const guardar = vi.fn();
    await asistenteDeModelo(
      { ...consola, interactivo: false, guardarModeloGlobal: guardar } as never,
      { origenDeTrabajo: "omision" }
    );
    expect(guardar).not.toHaveBeenCalled();
    expect(escrito).toEqual([]);
  });

  it("elige proveedor y modelo, y lo guarda en los TRES papeles", async () => {
    const { consola } = consolaFalsa([]);
    const guardar = vi.fn((_papel: string, id: string) => ({ ruta: "~/.xonecode/config.json", id }));
    await asistenteDeModelo({ ...consola, guardarModeloGlobal: guardar } as never, { origenDeTrabajo: "omision" });

    expect(guardar.mock.calls.map((c) => c[0])).toEqual(["rapido", "trabajo", "afilado"]);
    expect(guardar.mock.calls[0]![1]).toBe("ollama/glm-5.3-flash:cloud");
  });

  it("cancelar no escribe nada", async () => {
    const { consola, escrito } = consolaFalsa([]);
    const guardar = vi.fn();
    await asistenteDeModelo(
      { ...consola, seleccionar: async () => undefined, guardarModeloGlobal: guardar } as never,
      { origenDeTrabajo: "omision" }
    );
    expect(guardar).not.toHaveBeenCalled();
    expect(escrito.join("")).toMatch(/cancelad/i);
  });

  it("un proveedor sin credencial la pide y la guarda por guardarCredencial", async () => {
    const { consola } = consolaFalsa([]);
    const leerSecreto = vi.fn(async () => "clave-de-openai");
    const guardarCredencial = vi.fn();
    const guardar = vi.fn((_papel: string, id: string) => ({ ruta: "~/.xonecode/config.json", id }));
    await asistenteDeModelo(
      {
        ...consola,
        leerSecreto,
        guardarModeloGlobal: guardar,
        catalogoModelos: new CatalogoModelosEnMemoria({
          openai: [{ proveedor: "openai", id: "gpt-5", nombre: "GPT 5" }],
        }),
        seleccionar: async ({ titulo, opciones }: { titulo: string; opciones: Array<{ id: string }> }) =>
          titulo === "Proveedor de modelos" ? "openai" : opciones[0]?.id,
      } as never,
      { origenDeTrabajo: "omision", hayCredencial: () => false, guardarCredencial }
    );

    expect(leerSecreto).toHaveBeenCalledWith("clave de openai: ");
    expect(guardarCredencial).toHaveBeenCalledWith("openai", "clave-de-openai");
    expect(guardar.mock.calls.map((c) => c[0])).toEqual(["rapido", "trabajo", "afilado"]);
    expect(guardar.mock.calls[0]![1]).toBe("openai/gpt-5");
  });

  it("ollama nunca pide credencial aunque hayCredencial diga que falta", async () => {
    const { consola } = consolaFalsa([]);
    const leerSecreto = vi.fn(async () => "no-debería-usarse");
    const guardarCredencial = vi.fn();
    const guardar = vi.fn((_papel: string, id: string) => ({ ruta: "~/.xonecode/config.json", id }));
    await asistenteDeModelo(
      { ...consola, leerSecreto, guardarModeloGlobal: guardar } as never,
      { origenDeTrabajo: "omision", hayCredencial: () => false, guardarCredencial }
    );

    expect(leerSecreto).not.toHaveBeenCalled();
    expect(guardarCredencial).not.toHaveBeenCalled();
    expect(guardar.mock.calls.map((c) => c[0])).toEqual(["rapido", "trabajo", "afilado"]);
  });

  it("una clave vacía en el paso de credencial cancela sin guardar nada", async () => {
    const { consola, escrito } = consolaFalsa([]);
    const leerSecreto = vi.fn(async () => "   ");
    const guardarCredencial = vi.fn();
    const guardar = vi.fn();
    await asistenteDeModelo(
      {
        ...consola,
        leerSecreto,
        guardarModeloGlobal: guardar,
        catalogoModelos: new CatalogoModelosEnMemoria({
          openai: [{ proveedor: "openai", id: "gpt-5", nombre: "GPT 5" }],
        }),
        seleccionar: async ({ titulo, opciones }: { titulo: string; opciones: Array<{ id: string }> }) =>
          titulo === "Proveedor de modelos" ? "openai" : opciones[0]?.id,
      } as never,
      { origenDeTrabajo: "omision", hayCredencial: () => false, guardarCredencial }
    );

    expect(guardarCredencial).not.toHaveBeenCalled();
    expect(guardar).not.toHaveBeenCalled();
    expect(escrito.join("")).toMatch(/cancelad/i);
  });

  it("cancelar en el paso del MODELO tampoco escribe nada, tras elegir proveedor", async () => {
    const { consola, escrito } = consolaFalsa([]);
    const guardar = vi.fn();
    await asistenteDeModelo(
      {
        ...consola,
        guardarModeloGlobal: guardar,
        seleccionar: async ({ titulo }: { titulo: string }) =>
          titulo === "Proveedor de modelos" ? "ollama" : undefined,
      } as never,
      { origenDeTrabajo: "omision" }
    );
    expect(guardar).not.toHaveBeenCalled();
    expect(escrito.join("")).toMatch(/cancelad/i);
  });

  it("con TTY pero sin selector rico, no pregunta ni escribe (no hay flujo de texto para el asistente)", async () => {
    const { consola, escrito } = consolaFalsa([]);
    const guardar = vi.fn();
    const { seleccionar: _sinUsar, ...sinSelector } = consola;
    await asistenteDeModelo(
      { ...sinSelector, guardarModeloGlobal: guardar } as never,
      { origenDeTrabajo: "omision" }
    );
    expect(guardar).not.toHaveBeenCalled();
    expect(escrito).toEqual([]);
  });
});
