import { describe, expect, it } from "vitest";
import { pideLeerLaMemoria } from "./memoria.js";

describe("pideLeerLaMemoria", () => {
  it("una lectura de la ruta exacta, con barra o sin ella", () => {
    expect(pideLeerLaMemoria("read_file", "/MEMORIA_PROYECTO.md")).toBe(true);
    // Medido: el modelo la pidió sin la barra, y TrueForge la normaliza y la lee igual.
    expect(pideLeerLaMemoria("read_file", "MEMORIA_PROYECTO.md")).toBe(true);
    expect(pideLeerLaMemoria("read_file", "./MEMORIA_PROYECTO.md")).toBe(true);
  });

  it("ni otra tool, ni otra ruta, ni una que solo la contenga", () => {
    // Un `grep` que la nombre no es leerla, y editarla ya pasa por la aprobación.
    expect(pideLeerLaMemoria("grep", "/MEMORIA_PROYECTO.md")).toBe(false);
    expect(pideLeerLaMemoria("edit_file", "/MEMORIA_PROYECTO.md")).toBe(false);
    expect(pideLeerLaMemoria("read_file", "/docs/MEMORIA_PROYECTO.md")).toBe(false);
    expect(pideLeerLaMemoria("read_file", undefined)).toBe(false);
  });

});
