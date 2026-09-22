import { afterEach, describe, expect, it, vi } from "vitest";
import { ponerSumideroDeErrores } from "../../core/trazaDeErrores.js";
import {
  contenidoTrasEditar,
  sinContenidoInvalido,
  validarConXoneLinter,
  type ValidarContenido,
} from "./validacionXone.js";

/** Un backend de mentira con el molde de deepagents. */
function backendFalso(ficheros: Record<string, string>) {
  const escrito: Record<string, string> = {};
  return {
    escrito,
    read: async (ruta: string) => (ruta in ficheros ? { content: ficheros[ruta] } : { error: "no existe" }),
    write: async (ruta: string, contenido: string) => {
      escrito[ruta] = contenido;
      return { ok: true };
    },
    edit: async (ruta: string, viejo: string, nuevo: string) => {
      escrito[ruta] = (ficheros[ruta] ?? "").replace(viejo, nuevo);
      return { ok: true };
    },
    glob: async () => [],
  };
}

const sinHallazgos: ValidarContenido = async () => [];

describe("sinContenidoInvalido", () => {
  it("deja escribir lo que no introduce nada", async () => {
    const b = backendFalso({});
    const g = sinContenidoInvalido(b, sinHallazgos);
    await g.write("/a.css", ".x { fontsize: 4; }");
    expect(b.escrito["/a.css"]).toBe(".x { fontsize: 4; }");
  });

  it("rechaza con {error} y NO escribe", async () => {
    const b = backendFalso({});
    const g = sinContenidoInvalido(b, async () => [
      { codigo: "CSS_WEB_PROPERTY", mensaje: '"font-size" es web', linea: 2 },
    ]);

    const r = (await g.write("/a.css", ".x {\n font-size: 4;\n}")) as { error?: string };

    expect(r.error).toMatch(/No he escrito/);
    expect(r.error).toContain("CSS_WEB_PROPERTY");
    expect(b.escrito["/a.css"]).toBeUndefined();
  });

  /**
   * **La prueba que decide si esto es usable.** Medido sobre siete proyectos reales: quedan
   * hallazgos en ficheros que están en producción. Sin esto, el día que la guarda entrara no
   * se podría editar ninguno de ellos para arreglar OTRA cosa.
   */
  it("un defecto PREEXISTENTE no bloquea la escritura", async () => {
    const viejo = ".x {\n font-size: 4;\n}";
    const b = backendFalso({ "/a.css": viejo });
    // El mismo hallazgo antes y después: la escritura no lo introduce.
    const g = sinContenidoInvalido(b, async () => [
      { codigo: "CSS_WEB_PROPERTY", mensaje: '"font-size" es web', linea: 2 },
    ]);

    const nuevo = ".x {\n font-size: 4;\n bgcolor: #fff;\n}";
    await g.write("/a.css", nuevo);

    expect(b.escrito["/a.css"]).toBe(nuevo);
  });

  /** Y lo que la escritura SÍ mete sobre un fichero que ya estaba sucio, se rechaza. */
  it("sobre un fichero ya sucio, solo se rechaza lo nuevo", async () => {
    const b = backendFalso({ "/a.css": "viejo" });
    const validar = vi.fn(async (_r: string, c: string) =>
      c === "viejo"
        ? [{ codigo: "A", mensaje: "ya estaba", linea: 1 }]
        : [
            { codigo: "A", mensaje: "ya estaba", linea: 1 },
            { codigo: "B", mensaje: "esto es nuevo", linea: 9 },
          ],
    );

    const r = (await sinContenidoInvalido(b, validar).write("/a.css", "nuevo")) as { error?: string };

    expect(r.error).toContain("esto es nuevo");
    expect(r.error).not.toContain("ya estaba");
  });

  /**
   * **Fail-OPEN cuando falla el VALIDADOR**, al revés que cuando falla el contenido. Un fallo
   * del entorno no puede convertirse en un veredicto sobre el trabajo del agente.
   */
  it("si no se pudo validar, se escribe igual", async () => {
    const b = backendFalso({});
    await sinContenidoInvalido(b, async () => undefined).write("/a.xne", "lo que sea");
    expect(b.escrito["/a.xne"]).toBe("lo que sea");
  });

  it("un edit que introduce un problema tampoco pasa", async () => {
    const b = backendFalso({ "/a.css": ".x { fontsize: 4; }" });
    const g = sinContenidoInvalido(b, async (_r, c) =>
      c.includes("font-size") ? [{ codigo: "CSS_WEB_PROPERTY", mensaje: "web", linea: 1 }] : [],
    );

    const r = (await g.edit("/a.css", "fontsize: 4", "font-size: 4")) as { error?: string };

    expect(r.error).toMatch(/No he escrito/);
    expect(b.escrito["/a.css"]).toBeUndefined();
  });

  /** Las demás operaciones no se tocan: leer, listar y borrar siguen igual. */
  it("no estorba a lo que no escribe", async () => {
    const b = backendFalso({ "/a.css": "hola" });
    const g = sinContenidoInvalido(b, async () => [{ codigo: "X", mensaje: "y", linea: 1 }]);
    expect(await g.read("/a.css")).toEqual({ content: "hola" });
    expect(await g.glob()).toEqual([]);
  });
});

describe("contenidoTrasEditar", () => {
  it("aplica el reemplazo único", () => {
    expect(contenidoTrasEditar("a b c", "b", "X", false)).toBe("a X c");
  });

  it("con replaceAll los cambia todos", () => {
    expect(contenidoTrasEditar("a b b", "b", "X", true)).toBe("a X X");
  });

  /**
   * Si el reemplazo no es exacto, deepagents va a rechazar el edit él mismo. Adivinar aquí
   * sería validar un contenido que nunca va a existir.
   */
  it("no adivina cuando el reemplazo no es exacto", () => {
    expect(contenidoTrasEditar("a b c", "z", "X", false)).toBeUndefined();
    expect(contenidoTrasEditar("a b b", "b", "X", false)).toBeUndefined();
    expect(contenidoTrasEditar("a b c", "z", "X", true)).toBeUndefined();
  });
});

describe("validarConXoneLinter", () => {
  /** Contra la librería REAL: sin red, sin clave, sin simulador. */
  it("caza el CSS web y respeta el bueno", async () => {
    const validar = validarConXoneLinter();
    const malo = await validar("/a.css", ".x {\n font-size: 4;\n}");
    expect(malo?.map((h) => h.codigo)).toEqual(["CSS_WEB_PROPERTY"]);
    expect(await validar("/a.css", ".x {\n fontsize: 4;\n}")).toEqual([]);
  });

  it("caza un .xne mal formado y sitúa la línea", async () => {
    const hall = await validarConXoneLinter()(
      "/a.xne",
      '<?xml version="1.0" encoding="iso-8859-15"?>\n<coll name="R">\n  <frame>\n</coll>\n',
    );
    expect(hall?.[0]?.codigo).toBe("XML_MALFORMED");
    expect(hall?.[0]?.linea).toBeGreaterThan(0);
  });

  /** Lo que no es suyo no es un error: es que no es suyo. */
  it("un fichero que no sabe mirar no da hallazgos", async () => {
    expect(await validarConXoneLinter()("/foto.png", "binario")).toEqual([]);
  });
});


/**
 * **El testigo de las escrituras solapadas.**
 *
 * Reproducido: cuatro `edit` concurrentes sobre un fichero devuelven las cuatro «bien» y solo
 * UNA llega al disco —cada una lee, sustituye sobre lo que leyó y escribe entero—. Y ocurre de
 * verdad: DeepSeek agrupa varias `edit_file` en un mismo mensaje y LangGraph las ejecuta a la
 * vez; medido en una sesión, siete de ocho ediciones de un fichero salieron en ráfaga, hasta
 * tres en el mismo milisegundo.
 */
describe("escrituras solapadas sobre el mismo fichero", () => {
  afterEach(() => ponerSumideroDeErrores(undefined));

  it("se ANOTAN, con la ruta y cuántas había en vuelo", async () => {
    const visto: Array<{ donde: string; mensaje: string }> = [];
    ponerSumideroDeErrores((a) => visto.push(a as never));

    const b = backendFalso({});
    const g = sinContenidoInvalido(b, sinHallazgos);
    await Promise.all([g.write("/a.css", "1"), g.write("/a.css", "2"), g.write("/a.css", "3")]);

    const solapes = visto.filter((v) => v.donde === "escrituraSolapada");
    expect(solapes).toHaveLength(2);
    expect(solapes[0]!.mensaje).toContain("/a.css");
  });

  /** Ficheros DISTINTOS a la vez no son un solape: eso es paralelismo legítimo. */
  it("dos ficheros distintos a la vez no avisan", async () => {
    const visto: Array<{ donde: string }> = [];
    ponerSumideroDeErrores((a) => visto.push(a as never));

    const g = sinContenidoInvalido(backendFalso({}), sinHallazgos);
    await Promise.all([g.write("/a.css", "1"), g.write("/b.css", "2")]);

    expect(visto.filter((v) => v.donde === "escrituraSolapada")).toHaveLength(0);
  });

  /** Y en serie tampoco: lo que se vigila es el SOLAPE, no el número de escrituras. */
  it("dos escrituras seguidas al mismo fichero no avisan", async () => {
    const visto: Array<{ donde: string }> = [];
    ponerSumideroDeErrores((a) => visto.push(a as never));

    const g = sinContenidoInvalido(backendFalso({}), sinHallazgos);
    await g.write("/a.css", "1");
    await g.write("/a.css", "2");

    expect(visto.filter((v) => v.donde === "escrituraSolapada")).toHaveLength(0);
  });
});
