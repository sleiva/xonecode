import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crearDescribirImagen, PAPEL_DE_DESCRIBIR, rutaVirtualDe } from "./describirImagen.js";
import { crearLectorDeReferencias } from "./lectorDeReferencias.js";
import { ErrorDelJuezVisual, type InvocarVisual } from "../dispositivos/juezVisual.js";

/** Un proyecto de verdad en disco con una imagen en cada origen: la guarda es la del lector REAL. */
function montaje() {
  const raiz = mkdtempSync(join(tmpdir(), "describir-"));
  const adjuntos = join(raiz, ".xonecode", "sesiones", "s1", "adjuntos");
  mkdirSync(adjuntos, { recursive: true });
  mkdirSync(join(raiz, "icons"));
  writeFileSync(join(adjuntos, "nuevo.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  writeFileSync(join(raiz, "icons", "casa.jpg"), Buffer.from([0xff, 0xd8, 0xff]));
  writeFileSync(join(raiz, ".env"), "CLAVE=1");
  return { raiz, adjuntos };
}

function herramienta(invocar: InvocarVisual) {
  const { raiz, adjuntos } = montaje();
  const vistas: { papel: string; prompt: string; mime: string; base64: string }[] = [];
  const espia: InvocarVisual = async (papel, prompt, imagen) => {
    vistas.push({ papel, prompt, mime: imagen.mime, base64: imagen.base64 });
    return invocar(papel, prompt, imagen);
  };
  const t = crearDescribirImagen({
    invocar: espia,
    leer: crearLectorDeReferencias({ raiz, adjuntos }),
    carpetas: { raiz, adjuntos },
  });
  return { t, vistas, raiz, adjuntos };
}

describe("describe_image (IXCODE-23)", () => {
  it("manda la imagen al modelo de TRABAJO y devuelve lo que ve, diciendo que lo describe un modelo", async () => {
    const { t, vistas } = herramienta(async () => "Un círculo negro con un + blanco.");
    const salida = await t.invoke({ ruta: "/adjuntos/nuevo.png" });
    expect(salida).toContain("Un círculo negro con un + blanco.");
    expect(salida).toContain("/adjuntos/nuevo.png");
    expect(vistas).toHaveLength(1);
    expect(vistas[0]).toMatchObject({ papel: PAPEL_DE_DESCRIBIR, mime: "image/png", base64: Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString("base64") });
  });

  it("la pregunta viaja en el prompt; un JPEG del proyecto va con su mime", async () => {
    const { t, vistas } = herramienta(async () => "Una casa.");
    await t.invoke({ ruta: "/icons/casa.jpg", pregunta: "¿de qué color es?" });
    expect(vistas[0]!.prompt).toContain("¿de qué color es?");
    expect(vistas[0]!.mime).toBe("image/jpeg");
  });

  it("acepta la ruta COMPLETA si cae dentro de lo montado, y la traduce a la virtual", async () => {
    const { t, adjuntos, vistas } = herramienta(async () => "Un icono.");
    const salida = await t.invoke({ ruta: join(adjuntos, "nuevo.png") });
    expect(salida).toContain("/adjuntos/nuevo.png");
    expect(vistas).toHaveLength(1);
  });

  it("una ruta completa FUERA de lo montado se rechaza con el camino, sin llamar al modelo", async () => {
    const { t, vistas } = herramienta(async () => "no debería");
    const salida = await t.invoke({ ruta: "/Users/alguien/Descargas/foto.png" });
    expect(salida).toMatch(/traer_de_la_maquina/);
    expect(vistas).toHaveLength(0);
  });

  it("las guardas de ruta se DEVUELVEN: dotfiles, no-imágenes, ficheros que no existen", async () => {
    const { t, vistas } = herramienta(async () => "no debería");
    expect(await t.invoke({ ruta: "/.env" })).toMatch(/no es un PNG|vedados/);
    expect(await t.invoke({ ruta: "/.xonecode/x.png" })).toMatch(/vedados/);
    expect(await t.invoke({ ruta: "/adjuntos/../../x.png" })).toMatch(/no es una ruta aceptable/);
    expect(await t.invoke({ ruta: "/adjuntos/no-esta.png" })).toMatch(/No se pudo leer \/adjuntos\/no-esta\.png \(ENOENT\)/);
    expect(vistas).toHaveLength(0);
  });

  it("un fallo del modelo se DEVUELVE como texto, nunca se lanza", async () => {
    const { t } = herramienta(async () => {
      throw new ErrorDelJuezVisual("no hay clave de deepseek");
    });
    expect(await t.invoke({ ruta: "/adjuntos/nuevo.png" })).toMatch(/No se pudo describir .*no hay clave de deepseek/);
    const vacio = herramienta(async () => "  ");
    expect(await vacio.t.invoke({ ruta: "/adjuntos/nuevo.png" })).toMatch(/no devolvió ninguna descripción/);
  });
});

describe("rutaVirtualDe", () => {
  it("las carpetas de la sesión ganan a la raíz, aunque vivan dentro de ella", () => {
    const carpetas = { raiz: "/p", adjuntos: "/p/.xonecode/sesiones/s/adjuntos", artefactos: "/p/.xonecode/sesiones/s/artefactos" };
    expect(rutaVirtualDe("/p/.xonecode/sesiones/s/adjuntos/a.png", carpetas)).toBe("/adjuntos/a.png");
    expect(rutaVirtualDe("/p/.xonecode/sesiones/s/artefactos/c.png", carpetas)).toBe("/artefactos/c.png");
    expect(rutaVirtualDe("/p/icons/x.png", carpetas)).toBe("/icons/x.png");
    expect(rutaVirtualDe("/otra/x.png", carpetas)).toBeUndefined();
  });
});
