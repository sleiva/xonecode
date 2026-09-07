import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";
import {
  crearCheckpointerDeProyecto,
  hayCheckpoint,
  olvidarHilo,
  rutaDelCheckpointer,
} from "./checkpointer.js";

let temporales: string[] = [];
function raizTemporal(): string {
  const r = mkdtempSync(join(tmpdir(), "xc-cp-"));
  temporales.push(r);
  return r;
}
afterEach(() => {
  for (const r of temporales) rmSync(r, { recursive: true, force: true });
  temporales = [];
});

/** Lo mínimo que LangGraph escribe: basta para que `getTuple` devuelva algo. */
const CHECKPOINT = {
  v: 4,
  id: "1",
  ts: new Date().toISOString(),
  channel_values: { messages: ["hola"] },
  channel_versions: {},
  versions_seen: {},
} as never;
const META = { source: "input", step: 0, parents: {} } as never;

describe("el checkpointer de proyecto", () => {
  it("vive en `.xonecode/checkpoint.sqlite` y se crea con modo 0600", async () => {
    const raiz = raizTemporal();
    const saver = crearCheckpointerDeProyecto(raiz)!;
    expect(saver).toBeDefined();

    const ruta = rutaDelCheckpointer(raiz);
    expect(ruta).toBe(join(raiz, ".xonecode", "checkpoint.sqlite"));
    // Un checkpoint lleva la lista de mensajes entera —argumentos de tool, contenido de
    // ficheros—, así que es un fichero de la misma clase que `auth.json`. Y el modo se
    // comprueba ANTES de escribir nada: medido, SQLite crea el fichero ya al abrirlo y con
    // 0644, así que un `chmod` de después dejaría una ventana con el checkpoint legible.
    expect(statSync(ruta).mode & 0o777).toBe(0o600);
    await saver.put({ configurable: { thread_id: "s1" } }, CHECKPOINT, META, {});
    expect(statSync(ruta).mode & 0o777).toBe(0o600);
  });

  it("el mismo proyecto da la MISMA conexión, y otro proyecto no", () => {
    const raiz = raizTemporal();
    const otraRaiz = raizTemporal();
    expect(crearCheckpointerDeProyecto(raiz)).toBe(crearCheckpointerDeProyecto(raiz));
    expect(crearCheckpointerDeProyecto(otraRaiz)).not.toBe(crearCheckpointerDeProyecto(raiz));
  });

  it("el hilo sobrevive a otra instancia: eso es lo que hace que reabrir CONTINÚE", async () => {
    const raiz = raizTemporal();
    await crearCheckpointerDeProyecto(raiz)!.put({ configurable: { thread_id: "s1" } }, CHECKPOINT, META, {});

    // Otra conexión sobre el mismo fichero: es lo que pasa al reabrir en OTRO arranque.
    // Se construye a pelo a propósito — dentro de un mismo proceso la fábrica devuelve la
    // instancia que ya tiene, así que pedírsela no probaría nada del fichero.
    const otro = SqliteSaver.fromConnString(rutaDelCheckpointer(raiz));
    await expect(hayCheckpoint(otro, "s1")).resolves.toBe(true);
    // Y un hilo del que nadie ha escrito nada no tiene memoria: eso es una sesión
    // «histórica», y decirlo es lo que evita prometer un recuerdo que no está.
    await expect(hayCheckpoint(otro, "s2")).resolves.toBe(false);
  });

  it("olvidar un hilo se lleva SOLO el suyo", async () => {
    const raiz = raizTemporal();
    const saver = crearCheckpointerDeProyecto(raiz)!;
    await saver.put({ configurable: { thread_id: "s1" } }, CHECKPOINT, META, {});
    await saver.put({ configurable: { thread_id: "s2" } }, CHECKPOINT, META, {});

    await olvidarHilo(saver, "s1");
    await expect(hayCheckpoint(saver, "s1")).resolves.toBe(false);
    await expect(hayCheckpoint(saver, "s2")).resolves.toBe(true);
  });

  it("sin checkpointer no se afirma memoria, y olvidar no lanza", async () => {
    // Es el caso de la consola de terminal y el de un fichero que no se pudo abrir: se
    // pierde la memoria entre arranques —lo que ya pasaba—, nunca la conversación en curso.
    await expect(hayCheckpoint(undefined, "s1")).resolves.toBe(false);
    await expect(olvidarHilo(undefined, "s1")).resolves.toBeUndefined();
  });
});
