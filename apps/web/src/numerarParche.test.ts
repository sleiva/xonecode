import { describe, expect, it } from "vitest";
import { numerarParche } from "./numerarParche.js";

describe("numerarParche", () => {
  it("numera un tramo: contexto avanza los dos, «-» solo el viejo, «+» solo el nuevo", () => {
    const parche = "diff --git a/a.js b/a.js\nindex 1..2 100644\n--- a/a.js\n+++ b/a.js\n@@ -3,3 +3,4 @@\n uno\n-dos\n+DOS\n+dos y medio\n tres";
    expect(numerarParche(parche)).toEqual([
      { tipo: "tramo", texto: "@@ -3,3 +3,4 @@" },
      { tipo: "contexto", viejo: 3, nuevo: 3, texto: "uno" },
      { tipo: "menos", viejo: 4, texto: "dos" },
      { tipo: "mas", nuevo: 4, texto: "DOS" },
      { tipo: "mas", nuevo: 5, texto: "dos y medio" },
      { tipo: "contexto", viejo: 5, nuevo: 6, texto: "tres" },
    ]);
  });

  it("un segundo tramo reinicia los contadores con sus cabeceras", () => {
    const parche = "@@ -1 +1 @@\n-a\n+b\n@@ -40,2 +40,2 @@\n c\n-d\n+e";
    const lineas = numerarParche(parche);
    expect(lineas[3]).toEqual({ tipo: "tramo", texto: "@@ -40,2 +40,2 @@" });
    expect(lineas[4]).toEqual({ tipo: "contexto", viejo: 40, nuevo: 40, texto: "c" });
    expect(lineas[5]).toEqual({ tipo: "menos", viejo: 41, texto: "d" });
    expect(lineas[6]).toEqual({ tipo: "mas", nuevo: 41, texto: "e" });
  });

  it("solo altas: la columna vieja va vacía", () => {
    expect(numerarParche("@@ -0,0 +1,2 @@\n+x\n+y")).toEqual([
      { tipo: "tramo", texto: "@@ -0,0 +1,2 @@" },
      { tipo: "mas", nuevo: 1, texto: "x" },
      { tipo: "mas", nuevo: 2, texto: "y" },
    ]);
  });

  it("la nota de fin de fichero no avanza ningún contador", () => {
    expect(numerarParche("@@ -1 +1 @@\n-a\n\\ No newline at end of file\n+a\n")).toEqual([
      { tipo: "tramo", texto: "@@ -1 +1 @@" },
      { tipo: "menos", viejo: 1, texto: "a" },
      { tipo: "nota", texto: "No newline at end of file" },
      { tipo: "mas", nuevo: 1, texto: "a" },
    ]);
  });

  /** Un binario o un cambio de modo: es todo lo que git tiene que decir, y no se numera. */
  it("sin ningún «@@» no se corta nada y nadie lleva número", () => {
    expect(numerarParche("diff --git a/x b/x\nBinary files differ")).toEqual([
      { tipo: "contexto", texto: "diff --git a/x b/x" },
      { tipo: "contexto", texto: "Binary files differ" },
    ]);
  });
});
