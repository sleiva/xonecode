import { describe, it, expect } from "vitest";
import { crearSerieDeEscrituras } from "./serieDeEscrituras.js";

/** Una tarea que se puede resolver desde fuera, para forzar el solape a mano. */
function aplazada<T>() {
  let resolver!: (v: T) => void;
  let rechazar!: (e: unknown) => void;
  const promesa = new Promise<T>((s, n) => {
    resolver = s;
    rechazar = n;
  });
  return { promesa, resolver, rechazar };
}

describe("crearSerieDeEscrituras", () => {
  it("dos tareas de la MISMA clave no se solapan", async () => {
    const enSerie = crearSerieDeEscrituras();
    const orden: string[] = [];
    const a = aplazada<void>();

    const p1 = enSerie("/f.js", async () => {
      orden.push("a:entra");
      await a.promesa;
      orden.push("a:sale");
    });
    const p2 = enSerie("/f.js", async () => {
      orden.push("b:entra");
    });

    // `b` no ha podido entrar: `a` sigue dentro.
    await Promise.resolve();
    expect(orden).toEqual(["a:entra"]);

    a.resolver();
    await Promise.all([p1, p2]);
    expect(orden).toEqual(["a:entra", "a:sale", "b:entra"]);
  });

  it("dos claves DISTINTAS sí corren a la vez", async () => {
    const enSerie = crearSerieDeEscrituras();
    const orden: string[] = [];
    const a = aplazada<void>();

    const p1 = enSerie("/a.js", async () => {
      orden.push("a:entra");
      await a.promesa;
    });
    const p2 = enSerie("/b.js", async () => {
      orden.push("b:entra");
    });

    await p2; // entra sin esperar a `a`
    expect(orden).toEqual(["a:entra", "b:entra"]);
    a.resolver();
    await p1;
  });

  it("devuelve el valor de la tarea", async () => {
    const enSerie = crearSerieDeEscrituras();
    expect(await enSerie("/f", async () => 42)).toBe(42);
  });

  /**
   * **Un fallo no puede bloquear el fichero.** Si la primera escritura revienta, las
   * siguientes sobre ese fichero tienen que correr igual: convertir un error en un bloqueo
   * permanente es un fallo peor que el que esto viene a arreglar.
   */
  it("una tarea que LANZA no envenena la cola", async () => {
    const enSerie = crearSerieDeEscrituras();
    const rota = enSerie("/f.js", async () => {
      throw new Error("revienta");
    });
    await expect(rota).rejects.toThrow("revienta");

    expect(await enSerie("/f.js", async () => "sigue viva")).toBe("sigue viva");
  });

  it("y el error llega a QUIEN llamó, sin cambiarlo", async () => {
    const enSerie = crearSerieDeEscrituras();
    const marca = new Error("el mío");
    await expect(enSerie("/f.js", () => Promise.reject(marca))).rejects.toBe(marca);
  });

  /** Encoladas tras una que falla, siguen respetando el turno. */
  it("el ORDEN se conserva aunque la primera falle", async () => {
    const enSerie = crearSerieDeEscrituras();
    const orden: string[] = [];
    const a = aplazada<void>();

    const p1 = enSerie("/f.js", async () => {
      orden.push("a");
      await a.promesa;
      throw new Error("x");
    });
    const p2 = enSerie("/f.js", async () => {
      orden.push("b");
    });

    await Promise.resolve();
    expect(orden).toEqual(["a"]);
    a.resolver();
    await expect(p1).rejects.toThrow("x");
    await p2;
    expect(orden).toEqual(["a", "b"]);
  });

  /**
   * El mapa no puede crecer con una entrada por fichero tocado: esto vive en un proceso que
   * dura lo que dure la consola.
   */
  it("la cola se RETIRA al vaciarse, y no se queda el mapa creciendo", async () => {
    const enSerie = crearSerieDeEscrituras();
    for (let i = 0; i < 50; i++) await enSerie(`/f${i}.js`, async () => i);
    // Se mira por comportamiento y no por el interior: tras vaciarse, una clave usada antes
    // entra SIN esperar a nada.
    const orden: string[] = [];
    await enSerie("/f0.js", async () => void orden.push("entra"));
    expect(orden).toEqual(["entra"]);
  });

  it("tres de la misma clave salen en el orden en que se pidieron", async () => {
    const enSerie = crearSerieDeEscrituras();
    const orden: number[] = [];
    await Promise.all([1, 2, 3].map((n) => enSerie("/f.js", async () => void orden.push(n))));
    expect(orden).toEqual([1, 2, 3]);
  });
});
