import { describe, expect, it } from "vitest";
import { mkdtempSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { guardarMemoria, hayMemoria, leerMemoria, olvidarMemoria, RESPUESTA_A_UNA_COLGADA, rutaDeMemoria, saldarColgadas } from "./memoriaTrueforge.js";

const raiz = () => mkdtempSync(join(tmpdir(), "xc-tf-memoria-"));

describe("la memoria de TrueForge en disco", () => {
  it("guarda y lee la foto, con modo 0600: lleva los mensajes enteros", () => {
    const r = raiz();
    guardarMemoria(r, "s1", { context: [{ role: "user", content: "hola" }] });
    expect(leerMemoria(r, "s1")?.context).toEqual([{ role: "user", content: "hola" }]);
    expect(statSync(rutaDeMemoria(r, "s1")!).mode & 0o777).toBe(0o600);
    expect(hayMemoria(r, "s1")).toBe(true);
  });

  it("olvidar la borra, y sin fichero no hay memoria", () => {
    const r = raiz();
    guardarMemoria(r, "s1", { context: [] });
    olvidarMemoria(r, "s1");
    expect(hayMemoria(r, "s1")).toBe(false);
  });

  it("un id que no es un segmento llano no se convierte en ruta: ni se guarda ni se lee", () => {
    expect(rutaDeMemoria("/p", "../fuera")).toBeUndefined();
    expect(rutaDeMemoria("/p", "a/b")).toBeUndefined();
    const r = raiz();
    guardarMemoria(r, "../fuera", { context: [] });
    expect(hayMemoria(r, "../fuera")).toBe(false);
  });

  it("una foto ilegible no tumba nada: no hay memoria, y la sesión empieza de cero", () => {
    const r = raiz();
    guardarMemoria(r, "s1", { context: [] });
    writeFileSync(rutaDeMemoria(r, "s1")!, "{roto");
    expect(leerMemoria(r, "s1")).toBeUndefined();
  });

  it("las tool calls del último mensaje sin respuesta se SALDAN, las respondidas no", () => {
    const contexto = [
      { role: "user", content: "hazlo" },
      { role: "assistant", content: "", tool_calls: [{ id: "a" }, { id: "b" }] },
      { role: "tool", tool_call_id: "a", content: "hecho" },
    ];
    const saldado = saldarColgadas(contexto);
    expect(saldado).toHaveLength(4);
    expect(saldado[3]).toEqual({ role: "tool", tool_call_id: "b", content: RESPUESTA_A_UNA_COLGADA });
    // Puro: no toca lo que recibe.
    expect(contexto).toHaveLength(3);
    expect(saldarColgadas(saldado)).toHaveLength(4);
  });

  it("guardar ya sanea: lo que llega a disco nunca tiene una colgada", () => {
    const r = raiz();
    guardarMemoria(r, "s1", { context: [{ role: "assistant", content: "", tool_calls: [{ id: "x" }] }] });
    expect(leerMemoria(r, "s1")?.context).toHaveLength(2);
  });
});
