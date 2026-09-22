import { describe, expect, it } from "vitest";
import {
  COTA_DE_PODA_BYTES,
  debePodar,
  resumenDePoda,
} from "./podaDeCheckpoint.js";

const MB = 1024 * 1024;

describe("debePodar", () => {
  it("por debajo de la cota no se toca nada", () => {
    expect(debePodar({ bytes: 10 * MB, hayPendientes: false })).toBe(false);
    expect(debePodar({ bytes: COTA_DE_PODA_BYTES, hayPendientes: false })).toBe(false);
  });

  it("por encima de la cota, y con el turno cerrado, sí", () => {
    expect(debePodar({ bytes: COTA_DE_PODA_BYTES + 1, hayPendientes: false })).toBe(true);
    expect(debePodar({ bytes: 918 * MB, hayPendientes: false })).toBe(true);
  });

  /**
   * **La condición que hace esto seguro.** Un subagente parado en una aprobación vive en su
   * espacio `tools:*`; podarlo a media aprobación se lleva la reanudación por delante.
   */
  it("con algo pendiente NO se poda, por grande que sea", () => {
    expect(debePodar({ bytes: 918 * MB, hayPendientes: true })).toBe(false);
  });

  /**
   * **Fail-closed**: la dirección segura es la que no borra. Un fichero grande es un
   * incordio; una sesión que no reanuda es trabajo perdido. Misma regla que «un verificador
   * que no corrió no es verde».
   */
  it("lo que no se pudo mirar tampoco se poda", () => {
    expect(debePodar({ bytes: 918 * MB })).toBe(false);
    expect(debePodar({ bytes: 918 * MB, hayPendientes: undefined })).toBe(false);
  });

  /** La cota se dimensionó con lo medido: una sesión enorme ya podada ocupa ~21 MB. */
  it("la cota deja un orden de magnitud sobre una sesión grande ya podada", () => {
    expect(debePodar({ bytes: 21 * MB, hayPendientes: false })).toBe(false);
    expect(COTA_DE_PODA_BYTES / (21 * MB)).toBeGreaterThan(10);
  });

  /**
   * **La histéresis sale del propio tamaño**: tras podar, el fichero queda muy por debajo de
   * la cota, así que el turno siguiente no vuelve a podar. Sin esto haría falta recordar
   * cuándo se podó, que es el fichero de marca que este repo no quiere.
   */
  it("tras podar, la misma pregunta contesta que no", () => {
    expect(debePodar({ bytes: 918 * MB, hayPendientes: false })).toBe(true);
    expect(debePodar({ bytes: 21 * MB, hayPendientes: false })).toBe(false);
  });
});

describe("resumenDePoda", () => {
  it("cuenta lo que se liberó, con las dos cifras", () => {
    const texto = resumenDePoda({
      antes: 918 * MB,
      despues: 21 * MB,
      checkpointsBorrados: 2750,
      writesBorrados: 6182,
    });
    expect(texto).toContain("918 MB");
    expect(texto).toContain("21 MB");
    expect(texto).toContain("2750");
    expect(texto).toContain("6182");
  });

  /**
   * Un mantenimiento que anuncia su propia rutina enseña a ignorar los avisos, que es lo que
   * la bitácora existe para evitar.
   */
  it("si no se recuperó nada, se calla", () => {
    expect(resumenDePoda({ antes: 100, despues: 100, checkpointsBorrados: 0, writesBorrados: 0 })).toBeUndefined();
    expect(resumenDePoda({ antes: 100, despues: 120, checkpointsBorrados: 0, writesBorrados: 0 })).toBeUndefined();
  });

  /** Esta línea puede viajar por el cable, así que no lleva la ruta del fichero. */
  it("no lleva ninguna ruta", () => {
    const texto = resumenDePoda({ antes: 918 * MB, despues: 21 * MB, checkpointsBorrados: 1, writesBorrados: 1 })!;
    expect(texto).not.toMatch(/\/|\.sqlite/);
  });
});
