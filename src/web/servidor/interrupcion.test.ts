import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { VENTANA_DE_SENAL_REPETIDA_MS, esperarInterrupcion } from "./interrupcion.js";

/** Un `process` de pega: emite señales, con un reloj que el test mueve a mano. */
function montar() {
  const fuente = new EventEmitter();
  let ahora = 1_000;
  const forzadas: number[] = [];
  const avisos: string[] = [];
  let resuelta = false;
  const promesa = esperarInterrupcion({
    fuente,
    ahora: () => ahora,
    forzar: (codigo) => void forzadas.push(codigo),
    avisar: (texto) => void avisos.push(texto),
  }).then(() => {
    resuelta = true;
  });
  return {
    fuente,
    forzadas,
    avisos,
    promesa,
    resuelta: () => resuelta,
    avanzar: (ms: number) => {
      ahora += ms;
    },
  };
}

describe("esperarInterrupcion", () => {
  it("la PRIMERA señal empieza el cierre ordenado y no mata a nadie", async () => {
    const p = montar();
    p.fuente.emit("SIGINT");
    await p.promesa;
    expect(p.resuelta()).toBe(true);
    expect(p.forzadas).toEqual([]);
    expect(p.avisos.join("\n")).toMatch(/otra vez para forzar/);
  });

  it("SIGTERM también cierra en orden", async () => {
    const p = montar();
    p.fuente.emit("SIGTERM");
    await p.promesa;
    expect(p.forzadas).toEqual([]);
  });

  /**
   * El caso medido: con un `npm run` cuyo comando es `tsx …` a secas, UN Ctrl-C llega a node
   * DOS veces —la del grupo del terminal y la que reenvía npm, unos 30 ms después—. Con
   * `process.once` la segunda no tenía oyente y mataba en seco a mitad del cierre (código 130).
   */
  it("el SIGINT REENVIADO por npm justo después se ignora: el cierre sigue", async () => {
    const p = montar();
    p.fuente.emit("SIGINT");
    p.avanzar(30);
    p.fuente.emit("SIGINT");
    await p.promesa;
    expect(p.forzadas).toEqual([]);
    // Sin oyente, node aplicaría la acción por omisión y mataría el proceso.
    expect(p.fuente.listenerCount("SIGINT")).toBeGreaterThan(0);
  });

  it("un Ctrl-C POSTERIOR a la ventana fuerza la salida (un cierre colgado tiene salida)", async () => {
    const p = montar();
    p.fuente.emit("SIGINT");
    p.avanzar(VENTANA_DE_SENAL_REPETIDA_MS + 1);
    p.fuente.emit("SIGINT");
    await p.promesa;
    expect(p.forzadas).toEqual([130]);
    expect(p.avisos.at(-1)).toMatch(/forzad/);
  });

  it("forzar con SIGTERM sale con 143", async () => {
    const p = montar();
    p.fuente.emit("SIGTERM");
    p.avanzar(VENTANA_DE_SENAL_REPETIDA_MS + 1);
    p.fuente.emit("SIGTERM");
    await p.promesa;
    expect(p.forzadas).toEqual([143]);
  });
});
