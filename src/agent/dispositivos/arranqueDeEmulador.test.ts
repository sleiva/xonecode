import { describe, expect, it } from "vitest";
import {
  arrancarEmulador,
  ESPERA_ENTRE_SONDEOS_MS,
  TOPE_DE_ARRANQUE_MS,
  type DependenciasDeArranque,
} from "./arranqueDeEmulador.js";
import type { ProcesoHijo } from "./procesosEnMaquina.js";

/** Un hijo de pega que no dice nada: un emulador que arranca no habla por aquí. */
const hijoMudo = (): ProcesoHijo =>
  ({
    stdout: { on: () => undefined },
    stderr: { on: () => undefined },
    stdin: { write: () => undefined, end: () => undefined },
    on: () => undefined,
    kill: () => true,
    pid: 4242,
  }) as unknown as ProcesoHijo;

const LISTA_VACIA = "List of devices attached\n";
const LISTA_CON_EMULADOR = "List of devices attached\nemulator-5554 device model:sdk_gphone64\n";

/**
 * El montaje de pega: sin disco, sin procesos y con el reloj y la espera inyectados — sin eso
 * este test tardaría los tres minutos del tope de verdad.
 */
function montar(opciones: {
  /** Qué contesta `adb devices` en cada sondeo, en orden; el último se repite. */
  listas: string[];
  /** Qué contesta la consola del emulador. */
  nombreDeAvd?: string;
  sinEmulator?: boolean;
  sinAdb?: boolean;
  alLanzar?: () => ProcesoHijo;
}): { deps: DependenciasDeArranque; lanzamientos: { binario: string; args: string[] }[]; esperas: number[] } {
  const lanzamientos: { binario: string; args: string[] }[] = [];
  const esperas: number[] = [];
  let sondeo = 0;
  let reloj = 0;
  const deps: DependenciasDeArranque = {
    plataforma: "linux",
    entorno: { PATH: "/bin" },
    home: "/home/yo",
    existe: (r) =>
      (r === "/bin/emulator" && opciones.sinEmulator !== true) || (r === "/bin/adb" && opciones.sinAdb !== true),
    ejecutar: async (binario, args) => {
      if (args[0] === "devices") {
        const i = Math.min(sondeo, opciones.listas.length - 1);
        sondeo += 1;
        return { stdout: opciones.listas[i] ?? LISTA_VACIA, stderr: "" };
      }
      // `emu avd name`
      return { stdout: `${opciones.nombreDeAvd ?? "pixel8"}\nOK\n`, stderr: "" };
    },
    lanzar: (binario, args) => {
      lanzamientos.push({ binario, args });
      return (opciones.alLanzar ?? hijoMudo)();
    },
    // El reloj AVANZA con cada espera: así el bucle llega a su tope sin que pase el tiempo.
    ahora: () => new Date(reloj),
    esperar: async (ms) => {
      esperas.push(ms);
      reloj += ms;
    },
  };
  return { deps, lanzamientos, esperas };
}

describe("arrancarEmulador", () => {
  it("lanza `emulator -avd <avd>` y da por arrancado solo cuando el aparato APARECE", async () => {
    // Dos sondeos en vacío y al tercero está: es lo que pasa de verdad —`emulator` devuelve el
    // control enseguida y el aparato tarda—, y es la diferencia entre «lanzado» y «arrancado».
    const { deps, lanzamientos, esperas } = montar({
      listas: [LISTA_VACIA, LISTA_VACIA, LISTA_CON_EMULADOR],
    });
    const r = await arrancarEmulador("pixel8", deps);
    expect(r).toEqual({ ok: true, detalle: "pixel8 arrancado" });
    expect(lanzamientos).toEqual([{ binario: "/bin/emulator", args: ["-avd", "pixel8"] }]);
    // Esperó entre sondeos y no en un bucle apretado.
    expect(esperas.every((ms) => ms === ESPERA_ENTRE_SONDEOS_MS)).toBe(true);
  });

  /**
   * **Que haya UN emulador no significa que sea el que se pidió.** Se comprueba contra el
   * nombre de AVD que contesta su consola, que es lo único que los ata; sin eso, arrancar
   * `pixel8` mientras otro emulador se levantaba habría dicho «ya está» por el equivocado.
   */
  it("un emulador de OTRO AVD no cuenta como arrancado", async () => {
    const { deps } = montar({ listas: [LISTA_CON_EMULADOR], nombreDeAvd: "tablet9" });
    const r = await arrancarEmulador("pixel8", deps);
    expect(r.ok).toBe(false);
    expect(r.detalle).toMatch(/no ha aparecido/);
  });

  it("al vencer el plazo no miente: dice que sigue arrancando", async () => {
    const { deps, esperas } = montar({ listas: [LISTA_VACIA] });
    const r = await arrancarEmulador("pixel8", deps);
    expect(r.ok).toBe(false);
    expect(r.detalle).toMatch(/sigue arrancando/);
    // Y no se pasó del tope: lo que se acota es la espera, no el proceso, que sigue vivo.
    expect(esperas.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(TOPE_DE_ARRANQUE_MS + ESPERA_ENTRE_SONDEOS_MS);
  });

  it("sin `emulator` no se lanza nada y se dice dónde se buscó", async () => {
    const { deps, lanzamientos } = montar({ listas: [LISTA_VACIA], sinEmulator: true });
    const r = await arrancarEmulador("pixel8", deps);
    expect(r.ok).toBe(false);
    expect(r.detalle).toMatch(/emulator/);
    expect(lanzamientos).toEqual([]);
  });

  /**
   * Sin `adb` se podría lanzar a ciegas, y entonces no habría forma de decir si arrancó. La
   * medida es la que manda, así que sin medida no se promete nada — y no se lanza.
   */
  it("sin `adb` no se lanza: no habría con qué comprobarlo", async () => {
    const { deps, lanzamientos } = montar({ listas: [LISTA_VACIA], sinAdb: true });
    const r = await arrancarEmulador("pixel8", deps);
    expect(r.ok).toBe(false);
    expect(r.detalle).toMatch(/adb/);
    expect(lanzamientos).toEqual([]);
  });

  /**
   * El nombre acaba siendo un ARGUMENTO de proceso, así que se cierra por forma. Es la segunda
   * llave: quien llama comprueba además que el AVD esté en la última medida.
   */
  it("un nombre que no es de AVD se rechaza sin lanzar nada", async () => {
    for (const malo of ["../fuera", "pixel8; rm -rf /", "con espacio", "", "-avd"]) {
      const { deps, lanzamientos } = montar({ listas: [LISTA_CON_EMULADOR] });
      const r = await arrancarEmulador(malo, deps);
      expect(r.ok).toBe(false);
      expect(lanzamientos).toEqual([]);
    }
  });

  it("si el `spawn` falla, se dice y no se espera al aparato", async () => {
    const conError = (): ProcesoHijo =>
      ({
        ...hijoMudo(),
        on: (evento: string, cb: (v: unknown) => void) => {
          if (evento === "error") cb(new Error("EACCES"));
        },
      }) as unknown as ProcesoHijo;
    const { deps } = montar({ listas: [LISTA_CON_EMULADOR], alLanzar: conError });
    const r = await arrancarEmulador("pixel8", deps);
    expect(r.ok).toBe(false);
    expect(r.detalle).toMatch(/EACCES/);
  });
});
