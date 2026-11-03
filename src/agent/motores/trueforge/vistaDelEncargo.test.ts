import { describe, expect, it } from "vitest";
import { abreVuelta, MAX_CARACTERES_DE_VUELTA_PASADA, vistaDelEncargo } from "./vistaDelEncargo.js";

const largo = (letra: string) => letra.repeat(MAX_CARACTERES_DE_VUELTA_PASADA + 200);
const llama = (id: string, name: string, args: Record<string, unknown>) => ({ role: "assistant", content: "", tool_calls: [{ id, type: "function", function: { name, arguments: JSON.stringify(args) } }] });
const responde = (id: string, content: string) => ({ role: "tool", tool_call_id: id, content });
const recarga = (id: string) => llama(id, "ejecutar_script", { command: "xone-recargar-android Calc.xne" });
const contenido = (v: unknown[], id: string) => (v.find((m) => (m as { tool_call_id?: string }).tool_call_id === id) as { content: string }).content;

/** Medido en la prueba13: al final del encargo, el 99 % de lo devuelto por las tools tenía más de 10 llamadas. */
describe("la vista del encargo de quien da vueltas", () => {
  const encargo = [
    { role: "system", content: "eres el desarrollador" },
    { role: "user", content: "haz la calculadora" },
    llama("l1", "read_file", { file_path: "/Calc.xne" }), responde("l1", largo("x")),
    llama("l2", "read_file", { file_path: "/basico.css" }), responde("l2", largo("c")),
    llama("e1", "edit_file", { file_path: "/Calc.xne", old_string: "a", new_string: "b" }), responde("e1", "ok"),
    recarga("r1"), responde("r1", largo("r")),
    llama("g1", "ejecutar_script", { command: "xone-log-android --app" }), responde("g1", largo("g")),
  ];

  it("sin ninguna vuelta todavía, la vista es el historial tal cual", () => {
    expect(vistaDelEncargo(encargo.slice(0, 8))).toEqual(encargo.slice(0, 8));
  });

  it("lo anterior a la última vuelta se recorta, salvo la lectura de un fichero que no cambió después", () => {
    const v = vistaDelEncargo(encargo);
    expect(contenido(v, "l1")).toContain("[recortado:");
    expect(contenido(v, "l1")).toContain("ya cambiaste");
    // /basico.css no se editó: sigue siendo su versión vigente y se queda entera.
    expect(contenido(v, "l2")).toBe(largo("c"));
    // Lo de la vuelta en curso (la recarga y lo posterior) no se toca.
    expect(contenido(v, "r1")).toBe(largo("r"));
    expect(contenido(v, "g1")).toBe(largo("g"));
  });

  it("es ESTABLE entre vueltas: lo que se añade sin recargar no cambia lo de antes (la caché se conserva)", () => {
    const antes = vistaDelEncargo(encargo);
    const despues = vistaDelEncargo([...encargo, llama("l3", "read_file", { file_path: "/Calc.xne" }), responde("l3", largo("y"))]);
    expect(despues.slice(0, antes.length)).toEqual(antes);
  });

  it("una vuelta nueva recorta la anterior, ni ids ni argumentos cambian", () => {
    const v = vistaDelEncargo([...encargo, recarga("r2"), responde("r2", "recargado")]);
    expect(contenido(v, "r1")).toContain("[recortado:");
    expect(contenido(v, "g1")).toContain("de una vuelta anterior");
    const ids = (x: unknown[]) => x.map((m) => JSON.stringify((m as { tool_calls?: unknown }).tool_calls ?? (m as { tool_call_id?: unknown }).tool_call_id));
    expect(ids(v)).toEqual(ids([...encargo, recarga("r2"), responde("r2", "recargado")]));
  });

  it("abre vuelta recargar, desplegar o reiniciar, por ejecutar_script o execute; leer el log no", () => {
    const l = (name: string, command: string) => ({ id: "x", function: { name, arguments: JSON.stringify({ command }) } });
    expect(abreVuelta(l("ejecutar_script", "xone-desplegar-android"))).toBe(true);
    expect(abreVuelta(l("execute", "xone-reiniciar-android 2>&1 | tail -5"))).toBe(true);
    expect(abreVuelta(l("ejecutar_script", "xone-log-android --app"))).toBe(false);
    expect(abreVuelta(l("read_file", "xone-recargar-android"))).toBe(false);
  });
});
