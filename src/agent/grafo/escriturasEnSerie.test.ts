import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { backendDeAgente } from "./proyecto.js";
import { escriturasEnSerie } from "./escriturasEnSerie.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function proyecto(): { raiz: string; backend: any } {
  const raiz = mkdtempSync(join(tmpdir(), "serie-"));
  writeFileSync(join(raiz, "f.js"), Array.from({ length: 10 }, (_, i) => `linea${i} = ${i}`).join("\n"));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const backend = backendDeAgente({ raiz, ficheros: new Set() }) as any;
  return { raiz, backend };
}

/**
 * **La prueba contra el backend de VERDAD, y por `backendDeAgente`.**
 *
 * No se monta `escriturasEnSerie` a mano a propósito: lo que hay que comprobar es que esté
 * CABLEADA, que es el patrón de fallo que este repo lleva documentado diez veces —una regla de
 * producción compuesta dentro de algo que todos los tests doblan queda escrita y no probada—.
 * Se descubrió aquí mismo: quitar `sinContenidoInvalido` del cableado dejaba los 4.641 tests
 * en verde. Con este test, desmontar la serialización da rojo.
 */
describe("las escrituras del proyecto van en serie (contra el backend real)", () => {
  it("cuatro ediciones CONCURRENTES sobre el mismo fichero se aplican las CUATRO", async () => {
    const { raiz, backend } = proyecto();
    try {
      const ediciones: Array<[string, string]> = [
        ["linea1 = 1", "linea1 = UNO"],
        ["linea3 = 3", "linea3 = TRES"],
        ["linea5 = 5", "linea5 = CINCO"],
        ["linea7 = 7", "linea7 = SIETE"],
      ];
      // Lanzadas a la vez, que es como llegan cuando el modelo las pide en un solo mensaje.
      const r = await Promise.all(ediciones.map(([v, n]) => backend.edit("/f.js", v, n) as Promise<unknown>));

      expect(r.filter((x) => (x as { error?: string })?.error)).toEqual([]);
      const final = readFileSync(join(raiz, "f.js"), "utf8");
      for (const [, nuevo] of ediciones) expect(final, nuevo).toContain(nuevo);
    } finally {
      rmSync(raiz, { recursive: true, force: true });
    }
  });

  /**
   * La objeción que había que contestar: encolar no arregla nada si la segunda edición se
   * resolvió contra un contenido que la primera ya cambió. La contesta el propio backend, que
   * vuelve a buscar el `old_string` cuando le llega su turno — así que la que ya no encaja
   * **falla en voz alta** en vez de perderse.
   */
  it("y la que ya no encaja da ERROR, en vez de perder el cambio en silencio", async () => {
    const { raiz, backend } = proyecto();
    try {
      const r = (await Promise.all([
        backend.edit("/f.js", "linea2 = 2", "linea2 = DOS"),
        backend.edit("/f.js", "linea2 = 2", "linea2 = OTRA"),
      ])) as Array<{ error?: string }>;

      const final = readFileSync(join(raiz, "f.js"), "utf8");
      // Una de las dos entró; la otra lo dice.
      expect(["linea2 = DOS", "linea2 = OTRA"].filter((x) => final.includes(x))).toHaveLength(1);
      expect(r.filter((x) => x?.error)).toHaveLength(1);
    } finally {
      rmSync(raiz, { recursive: true, force: true });
    }
  });

  it("ficheros DISTINTOS no se estorban: las dos se aplican", async () => {
    const { raiz, backend } = proyecto();
    try {
      writeFileSync(join(raiz, "g.js"), "otra = 0");
      await Promise.all([
        backend.edit("/f.js", "linea1 = 1", "linea1 = UNO"),
        backend.edit("/g.js", "otra = 0", "otra = CAMBIADA"),
      ]);
      expect(readFileSync(join(raiz, "f.js"), "utf8")).toContain("linea1 = UNO");
      expect(readFileSync(join(raiz, "g.js"), "utf8")).toContain("otra = CAMBIADA");
    } finally {
      rmSync(raiz, { recursive: true, force: true });
    }
  });
});

/** El envoltorio suelto, para poder ver el fallo que arregla sin un disco delante. */
describe("escriturasEnSerie, el envoltorio", () => {
  it("SIN él, dos lecturas-escrituras concurrentes se pisan", async () => {
    let contenido = "base";
    const backend = {
      edit: async (_r: string, viejo: string, nuevo: string) => {
        const leido = contenido;
        await new Promise((s) => setTimeout(s, 1));
        contenido = leido.replace(viejo, nuevo);
        return { ok: true };
      },
    };
    await Promise.all([backend.edit("/f", "base", "base+A"), backend.edit("/f", "base", "base+B")]);
    expect(contenido).not.toBe("base+A+B"); // una se perdió: el fallo, reproducido
  });

  it("CON él, las dos entran", async () => {
    let contenido = "base";
    const backend = escriturasEnSerie({
      edit: async (_r: string, viejo: string, nuevo: string) => {
        const leido = contenido;
        await new Promise((s) => setTimeout(s, 1));
        contenido = leido.replace(viejo, nuevo);
        return { ok: true };
      },
    });
    await Promise.all([backend.edit("/f", "base", "base+A"), backend.edit("/f", "base+A", "base+A+B")]);
    expect(contenido).toBe("base+A+B");
  });

  it("no toca lo que no escribe", async () => {
    const leidas: string[] = [];
    const b = escriturasEnSerie({ read: async (r: string) => void leidas.push(r) });
    await Promise.all([b.read("/a"), b.read("/b")]);
    expect(leidas).toEqual(["/a", "/b"]);
  });
});
