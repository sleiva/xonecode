import { mkdtempSync, writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { crearSesion, anotarActo, listarSesiones, reabrirSesion, IndiceDeSesionesRoto } from "./sesiones.js";

const proyecto = () => mkdtempSync(join(tmpdir(), "xonecode-proyecto-"));

describe("sesiones por proyecto", () => {
  it("el título sale de la primera prosa del usuario", () => {
    const raiz = proyecto();
    const id = crearSesion(raiz);
    anotarActo(raiz, id, { tipo: "usuario", texto: "añade una colección de clientes" });
    expect(listarSesiones(raiz)[0].titulo).toBe("añade una colección de clientes");
  });

  it("se guarda UN ACTO POR LÍNEA y se anexa, no se reescribe", () => {
    const raiz = proyecto();
    const id = crearSesion(raiz);
    anotarActo(raiz, id, { tipo: "usuario", texto: "hola" });
    anotarActo(raiz, id, { tipo: "asistente", texto: "qué tal" });
    const bruto = readFileSync(join(raiz, ".xonecode", "sesiones", `${id}.jsonl`), "utf8");
    expect(bruto.trimEnd().split("\n")).toHaveLength(2);
  });

  it("reabrir devuelve los actos en orden y la marca como histórica", () => {
    const raiz = proyecto();
    const id = crearSesion(raiz);
    anotarActo(raiz, id, { tipo: "usuario", texto: "uno" });
    anotarActo(raiz, id, { tipo: "asistente", texto: "dos" });
    const abierta = reabrirSesion(raiz, id);
    expect(abierta.actos.map((a) => ("texto" in a ? a.texto : ""))).toEqual(["uno", "dos"]);
    expect(abierta.historica).toBe(true);
  });

  it("una línea corrupta se SALTA y las demás siguen: no tumba la reapertura", () => {
    const raiz = proyecto();
    const id = crearSesion(raiz);
    anotarActo(raiz, id, { tipo: "usuario", texto: "uno" });
    const ruta = join(raiz, ".xonecode", "sesiones", `${id}.jsonl`);
    writeFileSync(ruta, readFileSync(ruta, "utf8") + "{esto no es json\n");
    anotarActo(raiz, id, { tipo: "asistente", texto: "tres" });
    expect(reabrirSesion(raiz, id).actos).toHaveLength(2);
  });

  it("una sesión reabierta no vuelve a nacer: el id se conserva", () => {
    const raiz = proyecto();
    const id = crearSesion(raiz);
    expect(reabrirSesion(raiz, id).id).toBe(id);
  });

  it("un indice.json roto para la escritura sin sobrescribirlo: no borra sesiones que nombraba", () => {
    const raiz = proyecto();
    const id = crearSesion(raiz);
    const rutaIndice = join(raiz, ".xonecode", "sesiones", "indice.json");
    const indiceRoto = "{esto no es json";
    writeFileSync(rutaIndice, indiceRoto);
    expect(() => anotarActo(raiz, id, { tipo: "usuario", texto: "uno" })).toThrow(IndiceDeSesionesRoto);
    // El acto se escribió en el .jsonl aunque el índice esté roto: lo prescindible (el
    // índice, reconstruible barriendo los .jsonl) no puede tumbar lo irrecuperable (el acto).
    expect(reabrirSesion(raiz, id).actos).toEqual([{ tipo: "usuario", texto: "uno" }]);
    // Y el indice.json roto se queda EXACTAMENTE como estaba: nadie lo sobrescribió con [].
    expect(readFileSync(rutaIndice, "utf8")).toBe(indiceRoto);
  });
});
