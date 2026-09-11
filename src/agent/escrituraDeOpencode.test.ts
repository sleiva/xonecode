import { describe, it, expect } from "vitest";
import {
  propuestasDeToolCall,
  veredictoDeToolCall,
  decisionDeEscrituraDeOpencode,
} from "./escrituraDeOpencode.js";
import type { EscrituraExternaPedida } from "../core/ports.js";

const TAL_CUAL = (r: string) => r;
const BASE = { cwd: "/proyecto", agente: "dev", ficheros: new Set<string>(), real: TAL_CUAL };

/** El `toolCall` tal y como llegó en la medida real. */
const edicion = (path: string, oldText: string, newText: string) => ({
  kind: "edit",
  locations: [{ path }],
  content: [{ type: "diff", path, oldText, newText }],
});

describe("la traducción de un `toolCall` de ACP", () => {
  it("el antes y el después van DIRECTOS a `diffDeLineas`: ni hunks ni registro de items", () => {
    const r = propuestasDeToolCall(edicion("/proyecto/a.js", "uno\ndos\n", "uno\nDOS\n"));
    expect("propuestas" in r && r.propuestas[0]!.lineas).toEqual([
      { tipo: "igual", texto: "uno" },
      { tipo: "quitado", texto: "dos" },
      { tipo: "anadido", texto: "DOS" },
    ]);
  });

  it("un fichero nuevo es `oldText` vacío, y sale todo añadido", () => {
    const r = propuestasDeToolCall(edicion("/proyecto/a.js", "", "medido."));
    expect("propuestas" in r && r.propuestas[0]!.lineas).toEqual([{ tipo: "anadido", texto: "medido." }]);
  });

  it("lo que NO es una edición se rechaza: no hay diff que enseñar", () => {
    // La configuración ya le quita `bash`, `webfetch` y `websearch`; esto es la segunda llave.
    for (const kind of ["execute", "fetch", "delete", undefined]) {
      const r = propuestasDeToolCall({ kind, locations: [{ path: "/proyecto/a.js" }] });
      expect("motivo" in r, String(kind)).toBe(true);
    }
  });

  it("sin trozos `diff` se cae a `locations` y se PREGUNTA igual, con el diff vacío", () => {
    // Decidir sin diff es peor que decidir con diff, pero escribir sin decisión es lo que
    // esto existe para evitar — la misma regla que `diffDeEscrituraExterna`.
    const r = propuestasDeToolCall({ kind: "edit", locations: [{ path: "/proyecto/a.js" }] });
    expect("propuestas" in r && r.propuestas).toEqual([{ ruta: "/proyecto/a.js", lineas: [] }]);
  });

  it("y sin ninguna de las dos no hay nada que autorizar", () => {
    expect("motivo" in propuestasDeToolCall({ kind: "edit" })).toBe(true);
    expect("motivo" in propuestasDeToolCall(undefined)).toBe(true);
  });
});

describe("las guardas de ruta, que son las MISMAS de los otros motores", () => {
  it("dentro del proyecto se admite, con la ruta VIRTUAL", () => {
    const v = veredictoDeToolCall({ ...BASE, toolCall: edicion("/proyecto/app/x.js", "", "hola") });
    expect(v.admitidas && v.escrituras.map((e) => e.ruta)).toEqual(["/app/x.js"]);
  });

  it("`.env`, `.git` y fuera del proyecto se deniegan", () => {
    for (const ruta of ["/proyecto/.env", "/proyecto/.git/config", "/otro/x.js"]) {
      const v = veredictoDeToolCall({ ...BASE, toolCall: edicion(ruta, "", "x") });
      expect(v.admitidas, ruta).toBe(false);
    }
  });

  it("una vista aplanada, también: editarla sería tocar el fichero equivocado", () => {
    const v = veredictoDeToolCall({
      ...BASE,
      ficheros: new Set(["/app/Cosa.xml", "/app/Cosa.xne"]),
      toolCall: edicion("/proyecto/app/Cosa.xml", "a", "b"),
    });
    expect(v.admitidas).toBe(false);
  });
});

describe("la decisión entera", () => {
  const tc = edicion("/proyecto/a.js", "", "hola");

  it("sin política no se escribe, y se dice por qué", async () => {
    const r = await decisionDeEscrituraDeOpencode({ ...BASE, toolCall: tc });
    expect(r.concedida).toBe(false);
    expect(r.motivo).toMatch(/autorización/);
  });

  it("la política ve la ruta virtual y su diff", async () => {
    let visto: readonly EscrituraExternaPedida[] | undefined;
    const r = await decisionDeEscrituraDeOpencode({
      ...BASE,
      toolCall: tc,
      aprobar: async (e) => {
        visto = e;
        return true;
      },
    });
    expect(r.concedida).toBe(true);
    expect(visto?.[0]?.ruta).toBe("/a.js");
    expect(visto?.[0]?.lineas).toEqual([{ tipo: "anadido", texto: "hola" }]);
  });

  it("la guarda va ANTES: con una ruta mala no se le pregunta a nadie", async () => {
    let preguntado = false;
    const r = await decisionDeEscrituraDeOpencode({
      ...BASE,
      toolCall: edicion("/proyecto/.env", "", "K=1"),
      aprobar: async () => {
        preguntado = true;
        return true;
      },
    });
    expect(r.concedida).toBe(false);
    expect(preguntado).toBe(false);
  });

  it("y una política que revienta es un NO", async () => {
    const r = await decisionDeEscrituraDeOpencode({
      ...BASE,
      toolCall: tc,
      aprobar: async () => {
        throw new Error("sin humano");
      },
    });
    expect(r.concedida).toBe(false);
  });
});
