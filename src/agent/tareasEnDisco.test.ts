// src/agent/tareasEnDisco.test.ts
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crearTareasEnDisco } from "./tareasEnDisco.js";
import type { Tarea } from "../core/tareas.js";

const TAREA: Tarea = {
  id: "t1",
  proyecto: { id: "p1", raiz: "/w/AppDemo", nombre: "AppDemo" },
  titulo: "Arregla el login",
  peticion: "Arregla el login",
  encargo: "Arregla el login",
  adjuntos: [],
  estado: "nuevo",
  creada: "2026-09-08T10:00:00.000Z",
};

describe("tareasEnDisco", () => {
  let base: string;
  beforeEach(() => {
    base = mkdtempSync(join(tmpdir(), "xonecode-tareas-"));
  });
  afterEach(() => rmSync(base, { recursive: true, force: true }));

  it("escribe y lee el índice", () => {
    const disco = crearTareasEnDisco({ base });
    disco.guardar([TAREA]);
    expect(crearTareasEnDisco({ base }).listar()).toEqual([TAREA]);
  });

  it("sin índice todavía, la lista es VACÍA y no un error", () => {
    expect(crearTareasEnDisco({ base }).listar()).toEqual([]);
  });

  it("un índice corrupto no tumba la consola: se dice y se sigue con lista vacía", () => {
    // La misma postura que una línea corrupta del `.jsonl` de una sesión.
    mkdirSync(join(base, "tareas"), { recursive: true });
    writeFileSync(join(base, "tareas", "indice.json"), "{ esto no es json");
    const dichos: string[] = [];
    const disco = crearTareasEnDisco({ base, informar: (t) => dichos.push(t) });
    expect(disco.listar()).toEqual([]);
    expect(dichos.join(" ")).toMatch(/índice/i);
    // Y NO se sobrescribe solo: perder la cola de alguien por leerla mal sería peor.
    expect(readFileSync(join(base, "tareas", "indice.json"), "utf8")).toContain("esto no es json");
  });

  it("el cerrojo se concede una vez, y el segundo sabe de quién es", () => {
    const primero = crearTareasEnDisco({ base, pid: 100, vivo: () => true });
    expect(primero.tomarCerrojo()).toEqual({ tomado: true });
    const segundo = crearTareasEnDisco({ base, pid: 200, vivo: () => true });
    expect(segundo.tomarCerrojo()).toEqual({ tomado: false, dePid: 100 });
  });

  it("un cerrojo de un proceso MUERTO se recoge: si no, un cuelgue deja la cola parada para siempre", () => {
    crearTareasEnDisco({ base, pid: 100, vivo: () => true }).tomarCerrojo();
    const otro = crearTareasEnDisco({ base, pid: 200, vivo: (pid) => pid !== 100 });
    expect(otro.tomarCerrojo()).toEqual({ tomado: true });
  });

  it("un adjunto se guarda en la carpeta de SU tarea, y el nombre pasa la misma barrera que un artefacto", () => {
    const disco = crearTareasEnDisco({ base });
    expect(disco.guardarAdjunto("t1", "mockup.png", Buffer.from("x"))).toMatchObject({ ok: true });
    expect(existsSync(join(base, "tareas", "t1", "adjuntos", "mockup.png"))).toBe(true);
    for (const malo of ["../fuera.png", "sub/dentro.png", "", ".", "con espacio.png"]) {
      expect(disco.guardarAdjunto("t1", malo, Buffer.from("x")).ok, malo).toBe(false);
    }
  });

  it("los dos topes: por fichero y por tarea", () => {
    const disco = crearTareasEnDisco({ base, topeDeAdjunto: 10, topePorTarea: 15 });
    expect(disco.guardarAdjunto("t1", "a.bin", Buffer.alloc(11))).toMatchObject({ ok: false, motivo: expect.stringMatching(/grande/) });
    expect(disco.guardarAdjunto("t1", "b.bin", Buffer.alloc(8))).toMatchObject({ ok: true });
    expect(disco.guardarAdjunto("t1", "c.bin", Buffer.alloc(8))).toMatchObject({ ok: false, motivo: expect.stringMatching(/tarea/) });
  });

  it("borrar una tarea se lleva sus adjuntos: un secreto en un fichero que nadie va a ver sigue siendo un secreto", () => {
    const disco = crearTareasEnDisco({ base });
    disco.guardar([TAREA]);
    disco.guardarAdjunto("t1", "doc.pdf", Buffer.from("x"));
    disco.borrarTarea("t1");
    expect(existsSync(join(base, "tareas", "t1"))).toBe(false);
    expect(disco.listar()).toEqual([]);
  });

  it("ningún error lleva una ruta de la máquina", () => {
    const disco = crearTareasEnDisco({ base });
    const r = disco.guardarAdjunto("t1", "../fuera.png", Buffer.from("x"));
    expect(JSON.stringify(r)).not.toContain(base);
  });
});
