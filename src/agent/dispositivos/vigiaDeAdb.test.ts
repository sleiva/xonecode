import { describe, expect, it } from "vitest";
import { PAUSA_DEL_VIGIA_MS, partirBloques, REINTENTOS_DEL_VIGIA_MS, vigilarDispositivosAndroid, type ProcesoDelVigia } from "./vigiaDeAdb.js";

/** Un proceso de mentira: se le escribe por `stdout` y se le puede matar. */
function procesoFalso() {
  const oyentes: Record<string, (() => void)[]> = { exit: [], error: [] };
  let datos: ((t: string) => void) | undefined;
  const p: ProcesoDelVigia & { escribir: (t: string) => void; salir: () => void; matado: boolean } = {
    matado: false,
    stdout: { on: (_e, o) => void (datos = o as (t: string) => void) },
    on: (e, o) => void oyentes[e]!.push(o),
    kill: () => void (p.matado = true),
    escribir: (t) => datos?.(t),
    salir: () => oyentes.exit!.forEach((o) => o()),
  };
  return p;
}

/** Un reloj a mano: lo programado corre cuando se avanza. */
function reloj() {
  let ahora = 0;
  const cola: { en: number; fn: () => void; id: number }[] = [];
  let id = 0;
  return {
    programar: (fn: () => void, ms: number) => {
      cola.push({ en: ahora + ms, fn, id: ++id });
      return id;
    },
    cancelar: (t: unknown) => {
      const i = cola.findIndex((c) => c.id === t);
      if (i >= 0) cola.splice(i, 1);
    },
    avanzar: (ms: number) => {
      ahora += ms;
      for (;;) {
        const listos = cola.filter((c) => c.en <= ahora).sort((a, b) => a.en - b.en);
        if (listos.length === 0) return;
        const c = listos[0]!;
        cola.splice(cola.indexOf(c), 1);
        c.fn();
      }
    },
    pendientes: () => cola.length,
  };
}

const bloque = (carga: string): string => carga.length.toString(16).padStart(4, "0") + carga;

describe("partirBloques: el protocolo de track-devices", () => {
  it("parte bloques completos y guarda el que viene a medias", () => {
    const a = bloque("29f0\tdevice\n");
    const b = bloque("emulator-5554\tdevice\n");
    expect(partirBloques(a + b.slice(0, 6))).toEqual({ bloques: ["29f0\tdevice\n"], resto: b.slice(0, 6) });
  });
  it("quita los \\r de Windows: la longitud solo cuenta el \\n (medido)", () => {
    expect(partirBloques("001829f0d760640d7ece\tdevice\r\n").bloques).toEqual(["29f0d760640d7ece\tdevice\n"]);
  });
  it("la lista vacía es un bloque, y lo que no es el protocolo se toma entero", () => {
    expect(partirBloques("0000").bloques).toEqual([""]);
    expect(partirBloques("hola\n").bloques).toEqual(["hola\n"]);
  });
});

describe("vigilarDispositivosAndroid", () => {
  const montar = () => {
    const r = reloj();
    const procesos: ReturnType<typeof procesoFalso>[] = [];
    let cambios = 0;
    const vigia = vigilarDispositivosAndroid(() => void cambios++, {
      adb: () => "adb",
      lanzar: () => {
        const p = procesoFalso();
        procesos.push(p);
        return p;
      },
      programar: r.programar,
      cancelar: r.cancelar,
    });
    return { r, procesos, vigia, cambios: () => cambios };
  };

  it("la primera lista es la de ahora, no un cambio; enchufar sí lo es, agrupado", () => {
    const { r, procesos, cambios } = montar();
    procesos[0]!.escribir(bloque("A\tdevice\n"));
    r.avanzar(PAUSA_DEL_VIGIA_MS);
    expect(cambios()).toBe(0);
    // Enchufar suelta varios avisos seguidos: se mide UNA vez.
    procesos[0]!.escribir(bloque("A\tdevice\nB\toffline\n"));
    procesos[0]!.escribir(bloque("A\tdevice\nB\tdevice\n"));
    r.avanzar(PAUSA_DEL_VIGIA_MS);
    expect(cambios()).toBe(1);
  });

  it("la misma lista en otro orden no es un cambio", () => {
    const { r, procesos, cambios } = montar();
    procesos[0]!.escribir(bloque("A\tdevice\nB\tdevice\n"));
    procesos[0]!.escribir(bloque("B\tdevice\nA\tdevice\n"));
    r.avanzar(PAUSA_DEL_VIGIA_MS);
    expect(cambios()).toBe(0);
  });

  it("si adb muere se relanza con espera creciente, y una lista igual al volver no avisa", () => {
    const { r, procesos, cambios } = montar();
    procesos[0]!.escribir(bloque("A\tdevice\n"));
    procesos[0]!.salir();
    r.avanzar(REINTENTOS_DEL_VIGIA_MS[0] - 1);
    expect(procesos).toHaveLength(1);
    r.avanzar(1);
    expect(procesos).toHaveLength(2);
    procesos[1]!.escribir(bloque("A\tdevice\n"));
    r.avanzar(PAUSA_DEL_VIGIA_MS);
    expect(cambios()).toBe(0);
  });

  it("sin adb no lanza nada y lo vuelve a intentar", () => {
    const r = reloj();
    let hay = false;
    let lanzados = 0;
    vigilarDispositivosAndroid(() => {}, {
      adb: () => (hay ? "adb" : undefined),
      lanzar: () => {
        lanzados++;
        return procesoFalso();
      },
      programar: r.programar,
      cancelar: r.cancelar,
    });
    expect(lanzados).toBe(0);
    hay = true;
    r.avanzar(REINTENTOS_DEL_VIGIA_MS[0]);
    expect(lanzados).toBe(1);
  });

  it("parar mata el proceso y no deja nada programado", () => {
    const { r, procesos, vigia, cambios } = montar();
    procesos[0]!.escribir(bloque("A\tdevice\n"));
    procesos[0]!.escribir(bloque(""));
    vigia.parar();
    expect(procesos[0]!.matado).toBe(true);
    expect(r.pendientes()).toBe(0);
    procesos[0]!.salir();
    r.avanzar(60_000);
    expect(procesos).toHaveLength(1);
    expect(cambios()).toBe(0);
  });
});
