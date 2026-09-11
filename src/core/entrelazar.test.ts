import { describe, it, expect } from "vitest";
import { ColaDeEventos, entrelazar } from "./entrelazar.js";
import type { DomainEvent } from "./events.js";

const tool = (detalle: string): DomainEvent => ({ tipo: "tool", nombre: "read_file", detalle });
const linea = (texto: string): DomainEvent => ({ tipo: "aviso", texto, severidad: "info" });

/** Un flujo que cede el turno entre elemento y elemento, como haría uno de red. */
async function* flujo(...eventos: DomainEvent[]): AsyncIterable<DomainEvent> {
  for (const ev of eventos) {
    await Promise.resolve();
    yield ev;
  }
}

const recoger = async (it: AsyncIterable<DomainEvent>): Promise<DomainEvent[]> => {
  const salida: DomainEvent[] = [];
  for await (const ev of it) salida.push(ev);
  return salida;
};

describe("entrelazar: los eventos de fuera entran por el mismo sitio", () => {
  it("sin nada encolado, el flujo pasa TAL CUAL", () => {
    // La propiedad que sostiene que esto no cambie nada para quien no tiene agentes
    // externos: sin cola, la salida es byte a byte la de siempre.
    return expect(recoger(entrelazar(flujo(tool("/a"), tool("/b")), new ColaDeEventos()))).resolves.toEqual([
      tool("/a"),
      tool("/b"),
    ]);
  });

  it("lo encolado MIENTRAS sale intercalado, no al final", async () => {
    const cola = new ColaDeEventos();
    const salida: DomainEvent[] = [];
    for await (const ev of entrelazar(flujo(tool("/a"), tool("/b")), cola)) {
      salida.push(ev);
      // Al ver el primero del grafo, el hijo externo «hace» algo.
      if (ev === salida[0]) cola.empujar(linea("el hijo lee"));
    }
    expect(salida.map((e) => ("texto" in e ? e.texto : (e as { detalle: string }).detalle))).toEqual([
      "/a",
      "el hijo lee",
      "/b",
    ]);
  });

  it("lo que llega cuando el flujo YA se agotó se dice igual", async () => {
    // Un evento que llegó tarde no es un evento que no ocurrió. Es el caso real: el hijo
    // contesta y el grafo sigue un rato más, o al revés.
    const cola = new ColaDeEventos();
    const fuente = (async function* () {
      yield tool("/a");
      cola.empujar(linea("tarde"));
    })();
    await expect(recoger(entrelazar(fuente, cola))).resolves.toEqual([tool("/a"), linea("tarde")]);
  });

  it("no se pierde ni un evento del grafo aunque la cola despierte a la vez", async () => {
    /**
     * La trampa de este patrón: pedir `it.next()` en cada vuelta de la carrera deja DOS
     * `next()` vivos y se come un valor. Aquí se empuja en cada vuelta para forzar que la
     * cola gane la carrera muchas veces, y los diez del grafo tienen que salir los diez.
     */
    const cola = new ColaDeEventos();
    const delGrafo = Array.from({ length: 10 }, (_, i) => tool(`/${i}`));
    const salida: DomainEvent[] = [];
    let empujados = 0;
    for await (const ev of entrelazar(flujo(...delGrafo), cola)) {
      salida.push(ev);
      if (empujados < 10) {
        empujados += 1;
        cola.empujar(linea(`externo ${empujados}`));
      }
    }
    const delGrafoQueSalieron = salida.filter((e) => e.tipo === "tool");
    expect(delGrafoQueSalieron).toEqual(delGrafo);
    expect(salida.filter((e) => e.tipo === "aviso")).toHaveLength(10);
  });

  it("cortar el consumo cierra el flujo de dentro", async () => {
    // Sin el `finally`, el stream de langgraph se quedaría abierto.
    let cerrado = false;
    const fuente = (async function* () {
      try {
        yield tool("/a");
        yield tool("/b");
      } finally {
        cerrado = true;
      }
    })();
    for await (const _ of entrelazar(fuente, new ColaDeEventos())) break;
    expect(cerrado).toBe(true);
  });
});
