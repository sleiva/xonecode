import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { VerificarDispositivo } from "./VerificarDispositivo.js";
import type { Dispositivo } from "../tipos.js";

afterEach(cleanup);

const movil: Dispositivo = {
  id: "ABC",
  nombre: "Pixel 8",
  plataforma: "android",
  clase: "fisico",
  estado: "conectado",
};

describe("VerificarDispositivo", () => {
  it("sin manejador no se pinta ningún botón: no hay botón muerto", () => {
    render(<VerificarDispositivo dispositivo={movil} conectado />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("sin cable el botón está apagado: la petición se perdería sin decirlo", () => {
    render(<VerificarDispositivo dispositivo={movil} conectado={false} alVerificar={() => {}} />);
    expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(true);
  });

  it("pulsar manda el ID y dice que está verificando", () => {
    const ids: string[] = [];
    render(<VerificarDispositivo dispositivo={movil} conectado alVerificar={(id) => ids.push(id)} />);
    fireEvent.click(screen.getByRole("button", { name: "Verificar" }));
    expect(ids).toEqual(["ABC"]);
    // Sin esto se pulsaba y no pasaba nada visible durante los segundos de adb.
    expect(screen.getByRole("button", { name: "Verificando…" })).toBeTruthy();
  });

  it("al llegar la respuesta se suelta el «verificando» y se enseña lo que contestó", () => {
    const { rerender } = render(<VerificarDispositivo dispositivo={movil} conectado alVerificar={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Verificar" }));
    rerender(
      <VerificarDispositivo
        dispositivo={{ ...movil, verificado: { ok: true, detalle: "responde: sdk_gphone64_arm64", medido: "2026-09-10T18:31:00.000Z" } }}
        conectado
        alVerificar={() => {}}
      />
    );
    expect(screen.getByRole("button", { name: "Verificar" })).toBeTruthy();
    expect(screen.getByText("responde: sdk_gphone64_arm64")).toBeTruthy();
  });

  it("al caerse el cable se suelta el «verificando»: nada encendido para siempre", () => {
    const { rerender } = render(<VerificarDispositivo dispositivo={movil} conectado alVerificar={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Verificar" }));
    rerender(<VerificarDispositivo dispositivo={movil} conectado={false} alVerificar={() => {}} />);
    expect(screen.getByRole("button", { name: "Verificar" })).toBeTruthy();
  });

  it("el motivo de un fallo va con PALABRAS, no solo con el color", () => {
    // Un icono rojo no lo lee nadie con un lector de pantalla, y aquí el motivo es lo único
    // accionable: «no está arrancado» se arregla arrancándolo.
    render(
      <VerificarDispositivo
        dispositivo={{
          ...movil,
          verificado: { ok: false, detalle: "Process spawn via launchd failed because device is not booted.", medido: "2026-09-10T18:31:00.000Z" },
        }}
        conectado
        alVerificar={() => {}}
      />
    );
    expect(screen.getByText(/device is not booted/)).toBeTruthy();
  });

  it("una hora ilegible no se pinta: nada de «Invalid Date»", () => {
    render(
      <VerificarDispositivo
        dispositivo={{ ...movil, verificado: { ok: true, detalle: "responde", medido: "vete a saber" } }}
        conectado
        alVerificar={() => {}}
      />
    );
    expect(screen.queryByText(/Invalid Date/)).toBeNull();
    expect(screen.getByText("responde")).toBeTruthy();
  });

  /**
   * Se ofrece también en una fila APAGADA, y a propósito: la fila es la foto —puede tener
   * diez minutos— y esto es ahora. Arrancar un simulador a mano entre medias es justo el
   * caso en que la foto miente sin que nadie pueda saberlo.
   */
  it("un simulador apagado también se puede verificar", () => {
    const apagado: Dispositivo = { id: "UDID", nombre: "iPhone 17", plataforma: "ios", clase: "simulador", estado: "apagado" };
    render(<VerificarDispositivo dispositivo={apagado} conectado alVerificar={() => {}} />);
    expect(screen.getByRole("button", { name: "Verificar" })).toBeTruthy();
  });

  /**
   * Medido en pantalla: se arranca un simulador a mano, se verifica, y la fila queda
   * leyéndose «apagado · ✓ responde» — que parece un fallo de la ventana cuando es
   * exactamente lo que esto distingue. Se dice cuál de las dos es más vieja.
   */
  it("cuando la verificación contradice a la fila, se dice que la lista es de antes", () => {
    const apagado: Dispositivo = {
      id: "UDID",
      nombre: "iPhone 17",
      plataforma: "ios",
      clase: "simulador",
      estado: "apagado",
      verificado: { ok: true, detalle: "responde", medido: "2026-09-10T18:54:00.000Z" },
    };
    render(<VerificarDispositivo dispositivo={apagado} conectado medidoDeLaFoto="2026-09-10T18:53:00.000Z" alVerificar={() => {}} />);
    expect(screen.getByText(/la lista es de las/)).toBeTruthy();
  });

  it("si las dos dicen lo mismo no se dice nada: sería ruido en las 35 filas", () => {
    const arrancado: Dispositivo = {
      id: "UDID",
      nombre: "iPhone 17",
      plataforma: "ios",
      clase: "simulador",
      estado: "arrancado",
      verificado: { ok: true, detalle: "responde", medido: "2026-09-10T18:54:00.000Z" },
    };
    render(<VerificarDispositivo dispositivo={arrancado} conectado medidoDeLaFoto="2026-09-10T18:53:00.000Z" alVerificar={() => {}} />);
    expect(screen.queryByText(/la lista es de las/)).toBeNull();
  });

  it("una verificación ANTERIOR a la foto no dice que la lista sea vieja: no lo es", () => {
    // Pasa al volver a medir: la foto es nueva y la verificación se fue con la anterior. Lo
    // que no se puede es afirmar que la lista está desfasada cuando es la más reciente.
    const apagado: Dispositivo = {
      id: "UDID",
      nombre: "iPhone 17",
      plataforma: "ios",
      clase: "simulador",
      estado: "apagado",
      verificado: { ok: true, detalle: "responde", medido: "2026-09-10T18:50:00.000Z" },
    };
    render(<VerificarDispositivo dispositivo={apagado} conectado medidoDeLaFoto="2026-09-10T18:53:00.000Z" alVerificar={() => {}} />);
    expect(screen.queryByText(/la lista es de las/)).toBeNull();
  });
});
