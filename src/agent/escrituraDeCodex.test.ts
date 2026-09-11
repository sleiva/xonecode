import { describe, it, expect } from "vitest";
import {
  lineasDeCambioDeCodex,
  veredictoDeCambiosDeCodex,
  decisionDeEscrituraDeCodex,
} from "./escrituraDeCodex.js";
import type { EscrituraExternaPedida } from "../core/ports.js";

/** El `realpath` doblado: en un test no hay disco, y la guarda se prueba sin él. */
const TAL_CUAL = (r: string) => r;
const SIN_FICHEROS = new Set<string>();
const BASE = { cwd: "/proyecto", agente: "dev", ficheros: SIN_FICHEROS, real: TAL_CUAL };

describe("el diff de un cambio de Codex", () => {
  it("en un `add` el diff es el CONTENIDO, así que todo es línea añadida", () => {
    // Medido contra el binario: `{"kind":{"type":"add"},"diff":"medido.\n"}` — sin cabeceras.
    expect(lineasDeCambioDeCodex("add", "uno\ndos\n")).toEqual([
      { tipo: "anadido", texto: "uno" },
      { tipo: "anadido", texto: "dos" },
    ]);
  });

  it("y el salto final no cuenta como una línea vacía de más", () => {
    expect(lineasDeCambioDeCodex("add", "sola\n")).toEqual([{ tipo: "anadido", texto: "sola" }]);
  });

  it("en un `update` es un hunk unificado, y el primer carácter dice el tipo", () => {
    // Medido: "@@ -1,3 +1,3 @@\n uno\n-dos\n+DOS\n tres\n".
    expect(lineasDeCambioDeCodex("update", "@@ -1,3 +1,3 @@\n uno\n-dos\n+DOS\n tres\n")).toEqual([
      { tipo: "igual", texto: "uno" },
      { tipo: "quitado", texto: "dos" },
      { tipo: "anadido", texto: "DOS" },
      { tipo: "igual", texto: "tres" },
    ]);
  });

  it("la marca de «sin salto final» no es contenido del fichero y no se pinta", () => {
    const l = lineasDeCambioDeCodex("update", "@@ -1 +1 @@\n-a\n\\ No newline at end of file\n+b\n");
    expect(l).toEqual([
      { tipo: "quitado", texto: "a" },
      { tipo: "anadido", texto: "b" },
    ]);
  });

  it("una línea de contexto VACÍA llega vacía de verdad, sin prefijo que quitar", () => {
    // Si esto se tratara como «quítale el primer carácter», una línea en blanco del fichero
    // desaparecería del diff y el humano decidiría sobre algo que no es lo que va a pasar.
    expect(lineasDeCambioDeCodex("update", "@@ -1,2 +1,2 @@\n\n+x\n")).toEqual([
      { tipo: "igual", texto: "" },
      { tipo: "anadido", texto: "x" },
    ]);
  });

  it("sin diff no hay líneas, y eso no es un fallo: se pregunta igual", () => {
    expect(lineasDeCambioDeCodex("update", undefined)).toEqual([]);
    expect(lineasDeCambioDeCodex("add", "")).toEqual([]);
  });
});

describe("las guardas de ruta, reaplicadas a los cambios de Codex", () => {
  it("un `add` y un `update` dentro del proyecto se admiten, con la ruta VIRTUAL", () => {
    const v = veredictoDeCambiosDeCodex({
      ...BASE,
      cambios: [
        { path: "/proyecto/app/x.js", kind: { type: "add" }, diff: "hola\n" },
        { path: "/proyecto/app/y.js", kind: { type: "update", move_path: null }, diff: "@@ -1 +1 @@\n-a\n+b\n" },
      ],
    });
    expect(v.admitidos).toBe(true);
    // La ruta que viaja es la del proyecto, nunca la de la máquina: puede ir por un túnel.
    expect(v.admitidos && v.escrituras.map((e) => e.ruta)).toEqual(["/app/x.js", "/app/y.js"]);
    expect(v.admitidos && v.escrituras[0]!.agente).toBe("dev");
  });

  it("BORRAR se deniega: en Claude Code esa escritura no existe, y no hay diff que mirar", () => {
    const v = veredictoDeCambiosDeCodex({
      ...BASE,
      cambios: [{ path: "/proyecto/app/x.js", kind: { type: "delete" } }],
    });
    expect(v.admitidos).toBe(false);
    expect(!v.admitidos && v.motivo).toMatch(/BORRE/);
  });

  it("y RENOMBRAR también: un `move_path` son dos destinos que habría que guardar", () => {
    const v = veredictoDeCambiosDeCodex({
      ...BASE,
      cambios: [{ path: "/proyecto/a.js", kind: { type: "update", move_path: "/proyecto/b.js" }, diff: "" }],
    });
    expect(v.admitidos).toBe(false);
    expect(!v.admitidos && v.motivo).toMatch(/RENOMBRE/);
  });

  it("un tipo de cambio que no se reconoce se deniega, como las tools que no están en la lista", () => {
    const v = veredictoDeCambiosDeCodex({ ...BASE, cambios: [{ path: "/proyecto/a.js", kind: { type: "wat" } }] });
    expect(v.admitidos).toBe(false);
  });

  it("`.env` se deniega, y es la MISMA función que guarda al otro motor", () => {
    const v = veredictoDeCambiosDeCodex({ ...BASE, cambios: [{ path: "/proyecto/.env", kind: { type: "add" }, diff: "K=1\n" }] });
    expect(v.admitidos).toBe(false);
  });

  it("fuera del proyecto, también", () => {
    const v = veredictoDeCambiosDeCodex({ ...BASE, cambios: [{ path: "/otro/x.js", kind: { type: "add" }, diff: "x\n" }] });
    expect(v.admitidos).toBe(false);
  });

  it("una vista aplanada se deniega: editarla sería tocar el fichero equivocado", () => {
    const v = veredictoDeCambiosDeCodex({
      ...BASE,
      // Las del proyecto van con la ruta VIRTUAL, que es como las guarda el harness.
      ficheros: new Set(["/app/Cosa.xml", "/app/Cosa.xne"]),
      cambios: [{ path: "/proyecto/app/Cosa.xml", kind: { type: "update" }, diff: "@@ -1 +1 @@\n-a\n+b\n" }],
    });
    expect(v.admitidos).toBe(false);
  });

  it("UNA ruta mala tumba el item ENTERO: Codex lo aplica todo o nada", () => {
    const v = veredictoDeCambiosDeCodex({
      ...BASE,
      cambios: [
        { path: "/proyecto/bueno.js", kind: { type: "add" }, diff: "ok\n" },
        { path: "/proyecto/.git/config", kind: { type: "add" }, diff: "malo\n" },
      ],
    });
    expect(v.admitidos).toBe(false);
  });

  it("sin cambios no hay nada que autorizar, y eso es un NO", () => {
    expect(veredictoDeCambiosDeCodex({ ...BASE, cambios: [] }).admitidos).toBe(false);
    expect(veredictoDeCambiosDeCodex({ ...BASE, cambios: undefined }).admitidos).toBe(false);
  });
});

describe("la decisión entera: guardas y DESPUÉS la política", () => {
  const cambios = [{ path: "/proyecto/app/x.js", kind: { type: "add" }, diff: "hola\n" }];

  it("sin política no se escribe, y se dice por qué", async () => {
    const r = await decisionDeEscrituraDeCodex({ ...BASE, cambios });
    expect(r.concedida).toBe(false);
    expect(r.motivo).toMatch(/autorización/);
  });

  it("la política recibe TODAS las escrituras del item, no la primera", async () => {
    let visto: readonly EscrituraExternaPedida[] | undefined;
    const r = await decisionDeEscrituraDeCodex({
      ...BASE,
      cambios: [
        { path: "/proyecto/a.js", kind: { type: "add" }, diff: "a\n" },
        { path: "/proyecto/b.js", kind: { type: "add" }, diff: "b\n" },
      ],
      aprobar: async (e) => {
        visto = e;
        return true;
      },
    });
    expect(r.concedida).toBe(true);
    expect(visto?.map((e) => e.ruta)).toEqual(["/a.js", "/b.js"]);
  });

  it("la guarda va ANTES: con una ruta mala no se le pregunta a nadie", async () => {
    let preguntado = false;
    const r = await decisionDeEscrituraDeCodex({
      ...BASE,
      cambios: [{ path: "/proyecto/.env", kind: { type: "add" }, diff: "K=1\n" }],
      aprobar: async () => {
        preguntado = true;
        return true;
      },
    });
    expect(r.concedida).toBe(false);
    // Preguntar por algo cuyo único final posible es un rechazo es sacar un modal inútil —
    // la misma regla que el `when` de `seDetieneEn` en `agent/perfiles.ts`.
    expect(preguntado).toBe(false);
  });

  it("una política que dice que no, es que no", async () => {
    const r = await decisionDeEscrituraDeCodex({ ...BASE, cambios, aprobar: async () => false });
    expect(r.concedida).toBe(false);
  });

  it("y una política que REVIENTA también: el «sin humano» de `run.ts` corta lanzando", async () => {
    const r = await decisionDeEscrituraDeCodex({
      ...BASE,
      cambios,
      aprobar: async () => {
        throw new Error("sin humano");
      },
    });
    expect(r.concedida).toBe(false);
  });
});
