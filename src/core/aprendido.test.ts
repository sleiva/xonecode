import { describe, expect, it } from "vitest";
import { bloqueDeAprendido, conAprendizaje, interpretarAprendido, motivoDeAprendizajeInaceptable, TOPE_DE_APRENDIZAJES, TOPE_DE_TEXTO } from "./aprendido.js";
import { viajaEnSoporte } from "./paqueteDeSoporte.js";

const a = (tema: string, texto = "x", cuando = "2026-10-15T10:00:00.000Z") => ({ tema, texto, cuando });

describe("lo aprendido en un proyecto", () => {
  it("el mismo tema se SUSTITUYE (sin mirar mayúsculas ni espacios) y pasa al final", () => {
    const lista = conAprendizaje([a("Cómo entrar en la app", "usuario 1"), a("otra")], a("cómo  entrar en la app ", "usuario 08006, pulsar Entrar"));
    expect(lista.map((x) => x.texto)).toEqual(["x", "usuario 08006, pulsar Entrar"]);
  });

  it("pasado el tope se va el más viejo", () => {
    let lista = Array.from({ length: TOPE_DE_APRENDIZAJES }, (_, i) => a(`t${i}`));
    lista = conAprendizaje(lista, a("nuevo"));
    expect(lista).toHaveLength(TOPE_DE_APRENDIZAJES);
    expect(lista[0]!.tema).toBe("t1");
    expect(lista.at(-1)!.tema).toBe("nuevo");
  });

  it("un fichero roto es una lista vacía, y una entrada mala se deja fuera", () => {
    expect(interpretarAprendido("{roto")).toEqual([]);
    expect(interpretarAprendido(JSON.stringify([a("bien"), { tema: 3 }]))).toEqual([a("bien")]);
  });

  it("el bloque lo pone delante; sin nada, nada", () => {
    expect(bloqueDeAprendido([])).toBeUndefined();
    expect(bloqueDeAprendido([a("cómo entrar en la app", "usuario 08006\nsin clave")])).toContain("- cómo entrar en la app: usuario 08006 sin clave");
  });

  it("vacío o demasiado largo no se apunta", () => {
    expect(motivoDeAprendizajeInaceptable({ tema: " ", texto: "x" })).toBe("falta el tema");
    expect(motivoDeAprendizajeInaceptable({ tema: "t", texto: "x".repeat(TOPE_DE_TEXTO + 1) })).toContain("demasiado largo");
    expect(motivoDeAprendizajeInaceptable({ tema: "t", texto: "x" })).toBeUndefined();
  });

  it("no viaja en un paquete de soporte: puede llevar una contraseña", () => {
    expect(viajaEnSoporte(".xonecode/aprendido.json")).toBe(false);
  });
});
