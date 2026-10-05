import { describe, expect, it } from "vitest";
import { crearValidarXml, NOMBRE_VALIDAR_XML, TOPE_DE_FICHEROS_A_VALIDAR } from "./validarXml.js";

const BIEN = '<?xml version="1.0"?>\n<coll name="Inicio">\n  <prop name="MAP_A" type="T"/>\n</coll>\n';
const MAL = '<?xml version="1.0"?>\n<coll name="Perfil">\n  <prop visible name="MAP_A"/>\n</coll>\n';

/** Un backend de mentira con lo que la tool usa: `glob` y `readRaw`. */
function backend(ficheros: Record<string, string | { error: string }>) {
  const leidos: string[] = [];
  const pedidos: { patron: string; ruta: string }[] = [];
  return {
    leidos,
    pedidos,
    glob: async (patron: string, ruta: string) => {
      pedidos.push({ patron, ruta });
      const base = ruta === "/" ? "/" : `${ruta.replace(/\/$/, "")}/`;
      return { files: Object.keys(ficheros).filter((f) => f.startsWith(base)).map((path) => ({ path, is_dir: false })) };
    },
    readRaw: async (ruta: string) => {
      leidos.push(ruta);
      const f = ficheros[ruta];
      if (f === undefined) return { error: "no existe" };
      if (typeof f !== "string") return f;
      return { data: { content: f } };
    },
  };
}

const correr = (b: ReturnType<typeof backend>, path?: string): Promise<string> =>
  crearValidarXml(b as never).invoke(path === undefined ? {} : { path }) as Promise<string>;

describe("validar_xml", () => {
  it("se llama así, y su descripción dice qué significa un «bien formado» frente a un error que alguien vio", () => {
    const t = crearValidarXml(backend({}) as never);
    expect(t.name).toBe(NOMBRE_VALIDAR_XML);
    expect(t.description).toContain("OTRA copia");
  });

  it("un fichero bien formado lo dice en una línea", async () => {
    const b = backend({ "/Inicio.xne": BIEN });
    expect(await correr(b, "/Inicio.xne")).toBe("/Inicio.xne está bien formado.");
  });

  it("uno roto da fichero, línea, columna, motivo y el texto de la línea", async () => {
    const b = backend({ "/Perfil.xne": MAL });
    const r = await correr(b, "Perfil.xne");
    expect(r).toContain("/Perfil.xne:3:17: al atributo «visible» le falta el «=» y su valor");
    expect(r).toContain('<prop visible name="MAP_A"/>');
  });

  it("sin ruta revisa el proyecto entero y cuenta lo que está bien", async () => {
    const b = backend({ "/Inicio.xne": BIEN, "/Perfil.xne": MAL, "/app.xml": "<xml><app/></xml>" });
    const r = await correr(b);
    expect(b.pedidos).toEqual([{ patron: "**/*.{xne,xml}", ruta: "/" }]);
    expect(r).toContain("Mal formados (1)");
    expect(r).toContain("Bien formados: 2.");
    const todoBien = await correr(backend({ "/Inicio.xne": BIEN, "/app.xml": "<xml/>" }));
    expect(todoBien).toBe("Los 2 ficheros están bien formados.");
  });

  it("reaplica puedeLeerRuta: lo protegido ni se lee", async () => {
    const b = backend({ "/.xonecode/x.xml": BIEN, "/.git/config.xml": BIEN, "/Inicio.xne": BIEN });
    expect(await correr(b, "/.xonecode/x.xml")).toBe("No se puede leer /.xonecode/x.xml.");
    await correr(b);
    expect(b.leidos).toEqual(["/Inicio.xne"]);
  });

  it("lo que no se deja leer (una vista aplanada) se dice aparte, sin darlo por bueno", async () => {
    const b = backend({ "/Inicio.xne": BIEN, "/Inicio.xml": { error: "es una vista aplanada: edita el .xne" } });
    const r = await correr(b);
    expect(r).toContain("Sin poder leer (1)");
    expect(r).toContain("/Inicio.xml: es una vista aplanada");
    expect(r).not.toContain("están bien formados");
  });

  it("una carpeta sin XML lo dice", async () => {
    expect(await correr(backend({ "/doc/a.md": "x" }), "/doc")).toBe("No hay ficheros .xne ni .xml en /doc.");
  });

  it("con más ficheros que el tope, revisa los primeros y lo dice", async () => {
    const muchos: Record<string, string> = {};
    for (let i = 0; i <= TOPE_DE_FICHEROS_A_VALIDAR; i++) muchos[`/c${i}.xne`] = BIEN;
    const r = await correr(backend(muchos));
    expect(r).toContain(`Se revisaron los primeros ${TOPE_DE_FICHEROS_A_VALIDAR}`);
  });
});
