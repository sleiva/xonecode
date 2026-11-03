import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

// La skill no puede importar TypeScript: se prueba su módulo tal cual.
type Paso = { etiqueta: string; script: string; args: string[]; para: boolean };
const lib = (await import(pathToFileURL(resolve(__dirname, "../../skills/xone-hotswap/lib/probar.mjs")).href)) as {
  leerOrden: (argv: string[]) => { orden: Record<string, unknown> & { casos: string[] } } | { error: string };
  planDePrueba: (orden: unknown) => Paso[];
  cierreDePrueba: (r: { etiqueta: string; codigo: number; cortado?: boolean }[]) => string;
};

const orden = (argv: string[]) => {
  const r = lib.leerOrden(argv);
  if ("error" in r) throw new Error(r.error);
  return r.orden;
};

/** Medido en la pasada 9: recargar → abrir → limpiar → un caso por orden → log → captura, cada paso una vuelta. */
describe("xone-probar: el ciclo de prueba en una orden", () => {
  it("la orden entera sale en el orden del ciclo, y los casos van a xone-hotswap tal cual", () => {
    const pasos = lib.planDePrueba(
      orden(["--recargar", "calculadora.js", "Calculadora.xne", "--abrir", "Calculadora", "--captura", "click", "name=A", "--", "click", "name=B", "---", "click", "name=C"])
    );
    expect(pasos.map((p) => [p.script, ...p.args])).toEqual([
      ["xone-recargar-android", "calculadora.js", "Calculadora.xne"],
      ["xone-log-android", "--limpiar"],
      ["xone-hotswap", "abrir", "Calculadora"],
      ["xone-hotswap", "click", "name=A", "--", "click", "name=B", "---", "click", "name=C"],
      ["xone-log-android", "--app"],
      ["xone-captura-android"],
    ]);
  });

  it("los casos se piden SIEMPRE como casos, también uno solo: la ficha lee esa forma", () => {
    const casos = lib.planDePrueba(orden(["click", "name=A"])).find((p) => p.etiqueta === "casos") as Paso & { env?: Record<string, string> };
    expect(casos.env).toEqual({ XONE_HOTSWAP_COMO_CASOS: "1" });
  });

  it("sin recargar ni captura, ni abrir, solo limpia, prueba y lee el log", () => {
    expect(lib.planDePrueba(orden(["click", "name=A"])).map((p) => p.script)).toEqual(["xone-log-android", "xone-hotswap", "xone-log-android"]);
  });

  it("sin casos enseña los textos de la pantalla", () => {
    expect(lib.planDePrueba(orden(["--abrir", "Menu"])).at(-2)?.args).toEqual(["textos"]);
  });

  it("`--recargar` sin ficheros recarga todo lo que cambió, y no se traga el primer paso de los casos", () => {
    const o = orden(["--recargar", "click", "name=A"]);
    expect(o["recargar"]).toEqual([]);
    expect(o.casos).toEqual(["click", "name=A"]);
  });

  it("la serie va a todos menos a recargar (que la tomaría por un fichero); el puerto, solo a xone-hotswap", () => {
    const pasos = lib.planDePrueba(orden(["--recargar", "--serie", "emulator-5556", "--puerto", "8444", "--captura", "click", "name=A"]));
    const de = (s: string) => pasos.filter((p) => p.script === s).map((p) => p.args);
    expect(de("xone-recargar-android")).toEqual([[]]);
    expect(de("xone-hotswap")).toEqual([["--puerto", "8444", "--serie", "emulator-5556", "click", "name=A"]]);
    expect(de("xone-log-android")).toEqual([["--limpiar", "--serie", "emulator-5556"], ["--app", "--serie", "emulator-5556"]]);
    expect(de("xone-captura-android")).toEqual([["--serie", "emulator-5556"]]);
  });

  it("una recarga que falla corta; un caso que falla no (el log y la captura explican el fallo)", () => {
    const pasos = lib.planDePrueba(orden(["--recargar", "a.js", "--abrir", "X", "click", "name=A"]));
    expect(pasos.filter((p) => p.para).map((p) => p.etiqueta)).toEqual(["recargar", "abrir X"]);
  });

  it("un `---` tras las opciones abre los casos, no es una opción desconocida (pasada 11)", () => {
    expect(orden(["--abrir", "Calculadora", "---", "screen"]).casos).toEqual(["---", "screen"]);
  });

  it("una opción desconocida o sin valor es un error que lo dice", () => {
    expect(lib.leerOrden(["--abrir"])).toEqual({ error: "--abrir necesita un valor" });
    expect("error" in lib.leerOrden(["--recarga", "a.js"])).toBe(true);
  });

  it("el cierre dice qué falló y con qué código", () => {
    expect(lib.cierreDePrueba([{ etiqueta: "casos", codigo: 0 }])).toBe("xone-probar: 1 paso(s), todos bien");
    expect(lib.cierreDePrueba([{ etiqueta: "recargar", codigo: 1, cortado: true }])).toContain("«recargar» (código 1); no se siguió");
    expect(lib.cierreDePrueba([{ etiqueta: "casos", codigo: 1 }, { etiqueta: "captura", codigo: 0 }])).toBe("xone-probar: falló «casos» (código 1)");
  });
});
