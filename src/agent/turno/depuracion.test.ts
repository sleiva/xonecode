import { describe, expect, it } from "vitest";
import { entornoConDepuracion } from "./depuracion.js";
import { VARIABLE_TRAZA_TOOLS } from "./diagnosticoDeTools.js";
import { VARIABLE_TRAZA_ERRORES } from "../trazaDeErroresEnDisco.js";

describe("entornoConDepuracion", () => {
  it("activa (true) rellena las dos variables si no estaban puestas", () => {
    const entorno = entornoConDepuracion(true, {});
    expect(entorno[VARIABLE_TRAZA_ERRORES]).toBe("1");
    expect(entorno[VARIABLE_TRAZA_TOOLS]).toBe("1");
  });

  it("inactiva (false) no toca nada: el entorno sale igual que entró", () => {
    const original = { CAMINO: "/x" };
    expect(entornoConDepuracion(false, original)).toBe(original);
  });

  it("un env var explícito SIEMPRE gana, en los dos sentidos, aunque esté activa", () => {
    const encendidoAMano = entornoConDepuracion(true, { [VARIABLE_TRAZA_ERRORES]: "1" });
    expect(encendidoAMano[VARIABLE_TRAZA_ERRORES]).toBe("1");

    const apagadoAMano = entornoConDepuracion(true, { [VARIABLE_TRAZA_TOOLS]: "0" });
    expect(apagadoAMano[VARIABLE_TRAZA_TOOLS]).toBe("0");
  });

  it("conserva el resto del entorno intacto cuando sí rellena", () => {
    const entorno = entornoConDepuracion(true, { CAMINO: "/x" });
    expect(entorno.CAMINO).toBe("/x");
  });
});
