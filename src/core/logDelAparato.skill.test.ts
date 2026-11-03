import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

// La skill no puede importar TypeScript: se prueba su módulo tal cual.
const lib = (await import(pathToFileURL(resolve(__dirname, "../../skills/xone-hotswap/lib/log.mjs")).href)) as {
  compactarLog: (lineas: string[], tope?: number) => string[];
  sinCabecera: (l: string) => string;
  TOPE_DE_LINEAS_DEL_LOG: number;
};

const linea = (hora: string, tid: number, resto: string) => `11-03 12:10:${hora} 30789 ${String(tid)} ${resto}`;
const aviso = (hora: string, tid: number) => linea(hora, tid, "W System.err: Caused by: android.system.ErrnoException: open failed: ENOENT (No such file or directory)");
const app = (hora: string, texto: string) => linea(hora, 31000, `V XOneJavaScript: ${texto}`);

/** Medido en las pasadas de la calculadora: `xone-log-android --app` eran 12–17 mil caracteres por llamada. */
describe("el log de la app, compacto", () => {
  it("la cabecera (hora, pid, tid) no cuenta para decidir si dos líneas son la misma", () => {
    expect(lib.sinCabecera(aviso("16.614", 31095))).toBe(lib.sinCabecera(aviso("20.060", 31199)));
    expect(lib.sinCabecera("W/System.err(123): x")).toBe("W/System.err: x");
  });

  it("un aviso del sistema repetido sale UNA vez con cuántas, aunque no vaya seguido", () => {
    const salida = lib.compactarLog([aviso("16.614", 1), app("16.700", "CALC tecla 7"), aviso("17.000", 2), aviso("18.000", 3)]);
    expect(salida).toEqual([`${aviso("16.614", 1)}  (×3)`, app("16.700", "CALC tecla 7")]);
  });

  it("lo de la app solo se agrupa si va SEGUIDO: el orden es información", () => {
    const salida = lib.compactarLog([app("01.000", "tecla 7"), app("01.100", "tecla 7"), app("01.200", "tecla 8"), app("01.300", "tecla 7")]);
    expect(salida).toEqual([`${app("01.000", "tecla 7")}  (×2)`, app("01.200", "tecla 8"), app("01.300", "tecla 7")]);
  });

  it("como mucho las últimas N, diciendo cuántas se omitieron y cómo pedir más", () => {
    const muchas = Array.from({ length: lib.TOPE_DE_LINEAS_DEL_LOG + 5 }, (_, i) => app(`${String(i)}.0`, `paso ${String(i)}`));
    const salida = lib.compactarLog(muchas);
    expect(salida).toHaveLength(lib.TOPE_DE_LINEAS_DEL_LOG + 1);
    expect(salida[0]).toContain("5 línea(s) anteriores omitidas");
    expect(salida[0]).toContain("--lineas");
    expect(salida.at(-1)).toContain(`paso ${String(lib.TOPE_DE_LINEAS_DEL_LOG + 4)}`);
  });

  it("un log sin repeticiones y corto sale tal cual", () => {
    const l = [app("1.0", "a"), linea("1.1", 9, "E XOne: fallo"), app("1.2", "b")];
    expect(lib.compactarLog(l)).toEqual(l);
  });
});
