import { describe, expect, it } from "vitest";
import {
  actualizacionDisponible, eleccionServida, estaEnLocal, type FrameworkLocal, motivoDeFalloDeInstalacion, motivoDePaqueteInaceptable,
  opcionesDeInstalacion, PAQUETE_DEL_FRAMEWORK, versionDeDumpsys, versionPreferida,
} from "./frameworkLocal.js";

const local = (titulo: string, sha256: string, ficheroId: number, bajado = "2026-01-01T00:00:00Z"): FrameworkLocal => ({
  titulo, sha256, ficheroId, bajado, bytes: 1000, paquete: PAQUETE_DEL_FRAMEWORK,
});

describe("la versión que se elige por omisión", () => {
  it("es la local más nueva, por versión y no por texto", () => {
    expect(versionPreferida([local("v5.0.5.8rel", "a", 1), local("v5.0.5.10rel", "b", 2)])?.sha256).toBe("b");
  });
  it("sin locales, no hay ninguna", () => {
    expect(versionPreferida([])).toBeUndefined();
  });
});

describe("lo que se ofrece al instalar", () => {
  it("primero las locales, con la preferida marcada; después las del catálogo que no se tienen", () => {
    const opciones = opcionesDeInstalacion(
      [local("v5.0.5.7rel", "a", 7)],
      [{ titulo: "v5.0.5.8rel", ficheroId: 8 }, { titulo: "v5.0.5.7rel", ficheroId: 7 }]
    );
    expect(opciones).toEqual([
      { origen: "local", titulo: "v5.0.5.7rel", sha256: "a", bytes: 1000, preferida: true },
      { origen: "catalogo", titulo: "v5.0.5.8rel", ficheroId: 8, preferida: false },
    ]);
  });

  it("lo local manda aunque el catálogo tenga una más nueva", () => {
    const opciones = opcionesDeInstalacion([local("v5.0.5.7rel", "a", 7)], [{ titulo: "v5.0.6.0rel", ficheroId: 9 }]);
    expect(opciones.find((o) => o.preferida)?.origen).toBe("local");
  });

  it("sin locales, la preferida es la más nueva del catálogo", () => {
    const opciones = opcionesDeInstalacion([], [{ titulo: "v5.0.5.8rel", ficheroId: 8 }, { titulo: "v5.0.5.10rel", ficheroId: 10 }]);
    expect(opciones[0]).toMatchObject({ ficheroId: 10, preferida: true });
  });

  it("sin catálogo, solo las locales", () => {
    expect(opcionesDeInstalacion([local("v1rel", "a", 1)])).toHaveLength(1);
  });

  it("una REVISIÓN del catálogo (mismo título, otro fichero) no cuenta como ya bajada", () => {
    expect(estaEnLocal({ titulo: "v5.0.5.8rel", ficheroId: 99 }, [local("v5.0.5.8rel", "a", 8)])).toBe(false);
    expect(estaEnLocal({ titulo: "otra", ficheroId: 1, sha256: "A" }, [local("v5.0.5.8rel", "a", 8)])).toBe(true);
  });
});

describe("la elección vuelve contra la lista servida", () => {
  const servidas = opcionesDeInstalacion([local("v1rel", "a", 1)], [{ titulo: "v2rel", ficheroId: 2 }]);
  it("lo servido vale", () => {
    expect(eleccionServida({ local: "a" }, servidas)).toBeDefined();
    expect(eleccionServida({ catalogo: 2 }, servidas)).toBeDefined();
  });
  it("lo que no se sirvió, no", () => {
    expect(eleccionServida({ local: "zzz" }, servidas)).toBeUndefined();
    expect(eleccionServida({ catalogo: 1 }, servidas)).toBeUndefined();
  });
});

describe("el paquete del APK", () => {
  it("solo vale el del framework estándar", () => {
    expect(motivoDePaqueteInaceptable(PAQUETE_DEL_FRAMEWORK)).toBeUndefined();
    expect(motivoDePaqueteInaceptable("com.xone.android.developer.framework")).toMatch(/dos frameworks/);
    expect(motivoDePaqueteInaceptable(undefined)).toBeDefined();
  });
});

describe("los fallos de adb install", () => {
  it.each([
    ["Failure [INSTALL_FAILED_UPDATE_INCOMPATIBLE: Package ... signatures do not match]", /BORRA los datos/],
    ["Failure [INSTALL_FAILED_VERSION_DOWNGRADE]", /MÁS NUEVA/],
    ["Failure [INSTALL_FAILED_INSUFFICIENT_STORAGE]", /espacio/],
    ["Failure [INSTALL_FAILED_OTRA_COSA]", /INSTALL_FAILED_OTRA_COSA/],
    ["", /sin decir/],
  ])("%s", (salida, frase) => {
    expect(motivoDeFalloDeInstalacion(salida)).toMatch(frase);
  });
});

describe("la versión instalada, de dumpsys", () => {
  it("lee el versionName del primer bloque", () => {
    const salida = [
      "Packages:",
      "  Package [com.xone.android.framework] (abc):",
      "    versionCode=5022 minSdk=24",
      "    versionName=5.0.2.2dev",
      "  Hidden system packages:",
      "    versionName=4.0",
      "",
    ].join("\n");
    expect(versionDeDumpsys(salida)).toBe("5.0.2.2dev");
  });
  it("sin versionName, no consta", () => {
    expect(versionDeDumpsys("Unable to find package")).toBeUndefined();
  });
});

describe("la actualización que se propone", () => {
  const local = (titulo: string, preferida = false) => ({ origen: "local" as const, titulo, sha256: titulo, bytes: 1, preferida });
  const remota = (titulo: string, ficheroId: number) => ({ origen: "catalogo" as const, titulo, ficheroId, preferida: false });

  it("la más nueva POR NÚMEROS de las ofrecidas, y a igual versión la local", () => {
    const opciones = [local("v5.0.4.4dev", true), remota("v5.0.6.0rel", 7), remota("v5.0.5.10rel", 8)];
    expect(actualizacionDisponible(opciones, "5.0.5.9dev")?.titulo).toBe("v5.0.6.0rel");
    expect(actualizacionDisponible([local("v5.0.6.0rel"), remota("v5.0.6.0rel", 9)], "5.0.5.9dev")?.origen).toBe("local");
  });

  it("la misma cifra en otra compilación no es actualizar, ni lo es un título que no se entiende", () => {
    expect(actualizacionDisponible([remota("v5.0.5.9rel", 1)], "5.0.5.9dev")).toBeUndefined();
    expect(actualizacionDisponible([remota("ultima", 1)], "5.0.5.9dev")).toBeUndefined();
    expect(actualizacionDisponible([remota("v5.0.6.0rel", 1)], "rara")).toBeUndefined();
  });

  it("sin versión instalada no hay nada que proponer", () => {
    expect(actualizacionDisponible([remota("v9.0.0.0rel", 1)], undefined)).toBeUndefined();
  });
});
