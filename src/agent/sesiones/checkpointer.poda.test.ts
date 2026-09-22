import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  crearCheckpointerDeProyecto,
  hayPendientesEnLaBase,
  mantenimientoDelCheckpointer,
  podarCheckpointer,
  rutaDelCheckpointer,
  tamanoDelCheckpointer,
} from "./checkpointer.js";
import type { BaseCheckpointSaver } from "@langchain/langgraph-checkpoint";

const temporales: string[] = [];
function proyecto(): string {
  const d = mkdtempSync(join(tmpdir(), "xonecode-poda-"));
  temporales.push(d);
  return d;
}
afterEach(() => {
  for (const d of temporales.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** Escribe `n` checkpoints encadenados en un hilo, con relleno para que ocupen. */
async function sembrar(cp: BaseCheckpointSaver, hilo: string, n: number, ns = "", desde = 0) {
  let padre: string | undefined;
  for (let i = desde; i < desde + n; i++) {
    const id = `1f1b0000-0000-6000-8000-${String(i).padStart(12, "0")}`;
    await cp.put(
      { configurable: { thread_id: hilo, checkpoint_ns: ns, checkpoint_id: padre } },
      {
        v: 4,
        id,
        ts: new Date(2026, 0, 1, 0, 0, i).toISOString(),
        channel_values: { messages: Array.from({ length: i + 1 }, (_, k) => `mensaje ${k} ${"x".repeat(200)}`) },
        channel_versions: {},
        versions_seen: {},
      } as never,
      { source: "loop", step: i, parents: {} } as never,
      {},
    );
    padre = id;
  }
  return padre!;
}

describe("podarCheckpointer", () => {
  it("deja el ÚLTIMO checkpoint y su padre, y el hilo reanuda igual", async () => {
    const raiz = proyecto();
    const cp = crearCheckpointerDeProyecto(raiz)!;
    const ultimo = await sembrar(cp, "s1", 40);

    const antes = await cp.getTuple({ configurable: { thread_id: "s1" } });
    const resultado = podarCheckpointer(cp, raiz)!;

    expect(resultado.checkpointsBorrados).toBe(38);

    const despues = await cp.getTuple({ configurable: { thread_id: "s1" } });
    expect(despues?.config.configurable?.["checkpoint_id"]).toBe(ultimo);
    // Lo que se reanuda es lo MISMO, no algo parecido.
    expect(despues?.checkpoint.channel_values).toEqual(antes?.checkpoint.channel_values);
  });

  /** Y el hilo sigue VIVO: tras podar se puede seguir escribiendo en él. */
  it("después de podar se puede seguir escribiendo", async () => {
    const raiz = proyecto();
    const cp = crearCheckpointerDeProyecto(raiz)!;
    await sembrar(cp, "s1", 20);
    podarCheckpointer(cp, raiz);

    // Se sigue numerando hacia delante: `getTuple` devuelve el MAYOR id.
    const nuevo = await sembrar(cp, "s1", 1, "", 100);
    const t = await cp.getTuple({ configurable: { thread_id: "s1" } });
    expect(t?.config.configurable?.["checkpoint_id"]).toBe(nuevo);
  });

  /**
   * **Los espacios de los subagentes son el 70 % del fichero** y cada uno conserva el suyo:
   * se poda POR espacio, no solo el hilo.
   */
  it("poda cada espacio por separado y ninguno se queda sin su último", async () => {
    const raiz = proyecto();
    const cp = crearCheckpointerDeProyecto(raiz)!;
    await sembrar(cp, "s1", 15, "");
    const ultimoTool = await sembrar(cp, "s1", 15, "tools:abc");

    podarCheckpointer(cp, raiz);

    const principal = await cp.getTuple({ configurable: { thread_id: "s1", checkpoint_ns: "" } });
    const tool = await cp.getTuple({ configurable: { thread_id: "s1", checkpoint_ns: "tools:abc" } });
    expect(principal).toBeDefined();
    expect(tool?.config.configurable?.["checkpoint_id"]).toBe(ultimoTool);
  });

  /** Un hilo no se lleva por delante al otro. */
  it("no toca los demás hilos", async () => {
    const raiz = proyecto();
    const cp = crearCheckpointerDeProyecto(raiz)!;
    await sembrar(cp, "s1", 10);
    const otro = await sembrar(cp, "s2", 10);

    podarCheckpointer(cp, raiz);

    const t = await cp.getTuple({ configurable: { thread_id: "s2" } });
    expect(t?.config.configurable?.["checkpoint_id"]).toBe(otro);
  });

  it("el fichero encoge de verdad", async () => {
    const raiz = proyecto();
    const cp = crearCheckpointerDeProyecto(raiz)!;
    await sembrar(cp, "s1", 120);

    const r = podarCheckpointer(cp, raiz)!;
    expect(r.despues).toBeLessThan(r.antes);
    expect(statSync(rutaDelCheckpointer(raiz)).size).toBe(r.despues);
  });

  /** Sin checkpointer no hay nada que podar, y eso no es un error. */
  it("sin base no lanza", () => {
    expect(podarCheckpointer(undefined, proyecto())).toBeUndefined();
    expect(tamanoDelCheckpointer(proyecto())).toBeUndefined();
  });
});

describe("mantenimientoDelCheckpointer", () => {
  /** Por debajo de la cota no se toca NADA: es el caso normal y no puede costar. */
  it("por debajo de la cota no borra nada", async () => {
    const raiz = proyecto();
    const cp = crearCheckpointerDeProyecto(raiz)!;
    await sembrar(cp, "s1", 30);

    expect(mantenimientoDelCheckpointer(cp, raiz)).toBeUndefined();
    const t = await cp.getTuple({ configurable: { thread_id: "s1" } });
    expect(t).toBeDefined();
    // Y siguen estando los 30.
    expect(podarCheckpointer(cp, raiz)!.checkpointsBorrados).toBe(28);
  });

  /**
   * **La guarda que hace esto seguro, contra una base de verdad.** Un `write` colgado del
   * ÚLTIMO checkpoint es el grafo parado ahí —un subagente esperando una aprobación—, y
   * podarlo se llevaría la reanudación por delante.
   */
  it("detecta el trabajo a medias por los writes del último checkpoint", async () => {
    const raiz = proyecto();
    const cp = crearCheckpointerDeProyecto(raiz)!;
    const ultimo = await sembrar(cp, "s1", 10);

    // Una sesión cerrada: sus writes cuelgan de checkpoints anteriores.
    await cp.putWrites(
      { configurable: { thread_id: "s1", checkpoint_ns: "", checkpoint_id: "1f1b0000-0000-6000-8000-000000000003" } },
      [["messages", "algo viejo"]],
      "tarea-vieja",
    );
    expect(hayPendientesEnLaBase(cp)).toBe(false);

    // Y ahora una parada de verdad, sobre el último.
    await cp.putWrites(
      { configurable: { thread_id: "s1", checkpoint_ns: "", checkpoint_id: ultimo } },
      [["messages", "a medias"]],
      "tarea-viva",
    );
    expect(hayPendientesEnLaBase(cp)).toBe(true);
  });

  /** Sin base, se contesta que SÍ hay pendientes: la dirección que no borra. */
  it("sin base contesta que hay pendientes", () => {
    expect(hayPendientesEnLaBase(undefined)).toBe(true);
  });
});
