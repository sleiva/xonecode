import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { arranqueEnDispositivo, ErrorDelAparato } from "./sensorDeArranque.js";

const LOG = readFileSync(
  join(import.meta.dirname, "..", "..", "core", "__oro__", "logcat-appdemo.txt"),
  "utf8",
);

const deps = (cambios: Partial<Parameters<typeof arranqueEnDispositivo>[1]> = {}) => {
  const pasos: string[] = [];
  const base = {
    hayAparato: async () => {
      pasos.push("hayAparato");
      return true;
    },
    limpiarLog: async () => {
      pasos.push("limpiarLog");
    },
    desplegar: async () => {
      pasos.push("desplegar");
      return { ok: true, detalle: "" };
    },
    leerLog: async () => {
      pasos.push("leerLog");
      return LOG;
    },
  };
  return { deps: { ...base, ...cambios }, pasos };
};

describe("arranqueEnDispositivo", () => {
  it("del log real saca el error de la app y se declara ROJO", async () => {
    const { deps: d } = deps();

    const informe = await arranqueEnDispositivo("/proyecto", d);

    expect(informe.verde).toBe(false);
    const errores = informe.hallazgos.filter((h) => h.severidad === "error");
    expect(errores).toHaveLength(1);
    expect(errores[0]!.mensaje).toContain("no such column: SESSIONID");
  });

  /**
   * Lo de Android va como `warning` y NO pinta el turno de rojo: un `Accessing hidden method`
   * no se arregla desde un `.xne`, así que como error dejaría el bucle sin poder cerrar nunca.
   * Pero viaja: no se tira nada.
   */
  it("el ruido de la plataforma viaja, y no cuenta como error", async () => {
    const { deps: d } = deps();

    const informe = await arranqueEnDispositivo("/proyecto", d);

    const avisos = informe.hallazgos.filter((h) => h.severidad === "warning");
    expect(avisos.length).toBeGreaterThan(0);
    expect(avisos.some((h) => h.mensaje.includes("Accessing hidden method"))).toBe(true);
  });

  it("un arranque sin errores de la app es VERDE", async () => {
    const { deps: d } = deps({
      // Avisos de Android, ninguno de la app: eso no es un proyecto roto.
      leerLog: async () =>
        "09-18 15:00:00.000 1 1 W FirebaseApp: Default FirebaseApp failed to initialize\n",
    });

    expect((await arranqueEnDispositivo("/proyecto", d)).verde).toBe(true);
  });

  /**
   * EL ORDEN IMPORTA y por eso se comprueba: vaciar el buffer DESPUÉS de desplegar se llevaría
   * por delante justo las excepciones del arranque que se quieren leer.
   */
  it("vacía el log ANTES de desplegar, y lee DESPUÉS", async () => {
    const { deps: d, pasos } = deps();

    await arranqueEnDispositivo("/proyecto", d);

    expect(pasos).toEqual(["hayAparato", "limpiarLog", "desplegar", "leerLog"]);
  });

  it("sin aparato es fallo del ENTORNO, no un proyecto en rojo", async () => {
    const { deps: d, pasos } = deps({ hayAparato: async () => false });

    await expect(arranqueEnDispositivo("/proyecto", d)).rejects.toThrow(ErrorDelAparato);
    // Y no se despliega nada ni se toca el log: sin aparato no hay nada que hacer, y un
    // despliegue a ciegas sería minutos de máquina gastados para el mismo error.
    expect(pasos).not.toContain("desplegar");
    expect(pasos).not.toContain("leerLog");
  });

  it("un despliegue que falla tampoco es un proyecto en rojo", async () => {
    const { deps: d } = deps({ desplegar: async () => ({ ok: false, detalle: "el canal no contesta" }) });

    await expect(arranqueEnDispositivo("/proyecto", d)).rejects.toThrow(/el canal no contesta/);
  });
});
